// Dependency manifest extraction and pre-install dependency checking for
// catalog entries (requirement 6 of the install/gestion audit remediation).
//
// Sources of dependency information per catalog entry:
//   (a) Required env vars:
//       - `install.env: [{ name, required, description }]` (structured, primary)
//       - `${VAR}` placeholders found in `install.args`, `install.notes` and
//         `install.command` (free-form, de-duplicated against install.env).
//   (b) Required binaries on PATH:
//       - Phrases in `install.notes` like "The `php` CLI must be available on
//         PATH" or "requires X on PATH".
//       - Declared `install.dependencies.binaries: [{ name, installCommand }]`
//         when an entry ships an explicit auto-install command.
//   (c) Inter-primitive dependencies:
//       - `entry.requires` / `entry.dependencies` /
//         `install.dependencies.primitives`: array of "type:id" strings or
//         { type, id } objects.

import { resolveCommand } from "./resolver.js";

const ENV_PLACEHOLDER_PATTERN = /\$\{([A-Z][A-Z0-9_]{1,63})\}/g;
// "The `php` CLI must be available on PATH", "requires the `railway` CLI on PATH",
// "X must be installed and available on your PATH" etc.
const BINARY_NOTE_PATTERNS = [
  /`([A-Za-z0-9@/._-]+)`\s+(?:CLI|binary|command|executable)[^.]*?(?:must be|needs to be|has to be)[^.]*?PATH/i,
  /must\s+(?:be\s+)?(?:installed\s+)?(?:and\s+)?available[^.]*?\bon\s+(?:your\s+)?PATH[^.]*?`?([A-Za-z0-9@/._-]+)`?/i,
  /requires?\s+(?:the\s+)?`([A-Za-z0-9@/._-]+)`\s+(?:CLI|binary|command|executable)/i,
  /requires?\s+`([A-Za-z0-9@/._-]+)`\s+[^.]*?PATH/i,
];

/**
 * Extracts the dependency manifest of a catalog entry.
 * @param {object|null} entry Catalog entry ({ id, type, install: {...}, ... })
 * @returns {{ envVars: Array<{name: string, description: string, required: boolean}>, binaries: Array<{name: string, hint: string, installCommand: string[]|null}>, primitives: Array<{type: string, id: string}> }}
 */
export function extractDependencyManifest(entry) {
  const envVars = [];
  const binaries = [];
  const primitives = [];
  const seenEnv = new Set();
  const seenBin = new Set();

  if (!entry || typeof entry !== "object") {
    return { envVars, binaries, primitives };
  }

  const install = entry.install && typeof entry.install === "object" ? entry.install : {};

  // (a) Structured env declarations.
  if (Array.isArray(install.env)) {
    for (const ev of install.env) {
      if (ev && typeof ev.name === "string" && ev.name.trim() && !seenEnv.has(ev.name)) {
        seenEnv.add(ev.name);
        envVars.push({
          name: ev.name,
          description: typeof ev.description === "string" ? ev.description : "",
          required: ev.required !== false,
        });
      }
    }
  }

  // (a) ${VAR} placeholders in free-form fields.
  const placeholderSources = [];
  if (Array.isArray(install.args)) placeholderSources.push(...install.args.filter((a) => typeof a === "string"));
  for (const src of [install.notes, install.command, entry.description]) {
    if (typeof src === "string") placeholderSources.push(src);
  }
  for (const text of placeholderSources) {
    for (const m of text.matchAll(ENV_PLACEHOLDER_PATTERN)) {
      if (!seenEnv.has(m[1])) {
        seenEnv.add(m[1]);
        envVars.push({ name: m[1], description: "Detected as ${VAR} placeholder in the catalog install definition.", required: true });
      }
    }
  }

  // (b) Binaries declared structurally (with optional auto-install command).
  const declared = install.dependencies && typeof install.dependencies === "object" ? install.dependencies : {};
  if (Array.isArray(declared.binaries)) {
    for (const b of declared.binaries) {
      if (b && typeof b.name === "string" && b.name.trim() && !seenBin.has(b.name)) {
        seenBin.add(b.name);
        binaries.push({
          name: b.name,
          hint: typeof b.hint === "string" ? b.hint : "Declared in the catalog entry.",
          installCommand: Array.isArray(b.installCommand) ? b.installCommand.filter((x) => typeof x === "string") : null,
        });
      }
    }
  }

  // (b) Binaries detected from free-form notes.
  if (typeof install.notes === "string") {
    for (const pattern of BINARY_NOTE_PATTERNS) {
      for (const m of install.notes.matchAll(pattern)) {
        const name = m[1];
        if (name && !seenBin.has(name)) {
          seenBin.add(name);
          binaries.push({ name, hint: install.notes.trim().slice(0, 300), installCommand: null });
        }
      }
    }
  }

  // (c) Inter-primitive dependencies.
  const rawPrims = [];
  for (const src of [entry.requires, entry.dependencies, declared.primitives]) {
    if (Array.isArray(src)) rawPrims.push(...src);
  }
  for (const raw of rawPrims) {
    let dep = null;
    if (typeof raw === "string" && /^[a-z]+:[A-Za-z0-9._@/-]+$/.test(raw)) {
      const [type, ...rest] = raw.split(":");
      dep = { type, id: rest.join(":") };
    } else if (raw && typeof raw === "object" && typeof raw.type === "string" && typeof raw.id === "string") {
      dep = { type: raw.type, id: raw.id };
    }
    if (dep && ["plugin", "skill", "mcp"].includes(dep.type) && !primitives.some((p) => p.type === dep.type && p.id === dep.id)) {
      primitives.push(dep);
    }
  }

  return { envVars, binaries, primitives };
}

/**
 * Evaluates the dependency manifest against the current machine.
 * Env vars are read from process.env; binaries are resolved on PATH via
 * resolveCommand (same resolution used for the cline CLI itself).
 * @param {object|null} entry Catalog entry
 * @param {{ resolveBin?: (name: string) => Promise<string|null>, installedSet?: Set<string> }} opts
 *   Injectable binary resolver / installed keys for tests.
 * @returns {Promise<{ missing: Array<object>, available: Array<object>, autoInstallable: Array<object>, envVarsRequired: Array<{name: string, description: string}> }>}
 *   - missing: env vars not set + binaries not found + primitives not installed
 *   - available: satisfied dependencies
 *   - autoInstallable: subset of missing the runner can auto-install
 *     (primitive deps, or binaries with a declared installCommand).
 *     Missing env vars are NEVER auto-installable (non-fatal: reported).
 *   - envVarsRequired: env vars that remain unset (reported, not fatal).
 */
export async function checkDependencies(entry, opts = {}) {
  const resolveBin = opts.resolveBin || ((name) => resolveCommand(name));
  const installedSet = opts.installedSet instanceof Set ? opts.installedSet : new Set();
  const { envVars, binaries, primitives } = extractDependencyManifest(entry);

  const missing = [];
  const available = [];
  const autoInstallable = [];
  const envVarsRequired = [];

  for (const ev of envVars) {
    const present = typeof process.env[ev.name] === "string" && process.env[ev.name].length > 0;
    const record = { kind: "env", name: ev.name, description: ev.description, required: ev.required };
    if (present) {
      available.push(record);
    } else {
      missing.push(record);
      envVarsRequired.push({ name: ev.name, description: ev.description });
    }
  }

  for (const bin of binaries) {
    let found = null;
    try {
      found = await resolveBin(bin.name);
    } catch {}
    const record = { kind: "binary", name: bin.name, hint: bin.hint, path: found || null };
    if (found) {
      available.push(record);
    } else {
      missing.push(record);
      if (Array.isArray(bin.installCommand) && bin.installCommand.length > 0) {
        autoInstallable.push({ ...record, installCommand: bin.installCommand });
      }
    }
  }

  for (const prim of primitives) {
    const key = `${prim.type}:${prim.id}`;
    const record = { kind: "primitive", type: prim.type, id: prim.id };
    if (installedSet.has(key)) {
      available.push(record);
    } else {
      missing.push(record);
      autoInstallable.push(record);
    }
  }

  return { missing, available, autoInstallable, envVarsRequired };
}

/**
 * Best-effort extraction of a JSON payload from CLI output requested with
 * --json (the CLI may prepend/append human-readable lines).
 * @param {string} output Raw stdout (or combined output) of a --json command
 * @returns {object|null}
 */
export function parseJsonOutput(output) {
  if (typeof output !== "string" || !output.trim()) return null;
  const trimmed = output.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {}
  }
  return null;
}

