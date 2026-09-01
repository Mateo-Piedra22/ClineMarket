// Express API route handlers for Cline Marketplace Control Plane

import { Router } from "express";
import { join, basename, resolve } from "node:path";
import { platform, arch, type, release, cpus, homedir } from "node:os";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { readJson, safeWriteJson } from "./state.js";
import { sanitizePrimitiveId, sanitizePrimitiveType, sanitizeWorkspacePath } from "./sanitizers.js";
import { fsProbe } from "./probes.js";
import { reconcile } from "./reconciler.js";
import { buildRecommendations, buildBundles } from "./recommender.js";
import { runCline, verbFor, resolveCline, getExecutionEnv, escapeWindowsShellArg } from "./runner.js";
import { resolveCommand, isWindowsBatchShim } from "./resolver.js";
import { checkDependencies, extractDependencyManifest, parseJsonOutput } from "./deps.js";
import { logger } from "./logger.js";

const execFileP = promisify(execFile);

// ---- Sanitization of upstream catalog install.args (C4-01, redesigned) ----
// Catalog args are structurally trusted (validated by validateCatalogSchema at
// refresh time), so the sanitizer accepts legitimate CLI values — flags, http(s)
// URLs, quoted values containing ${VAR} placeholders and spaces, and plain
// paths — while rejecting shell execution metachars OUTSIDE of quoted segments.
// The spawn is shell-less (array args), so the real threat is argument
// injection into the cline CLI, not shell interpretation.
const CLI_ARG_MAX_LENGTH = 128;
// ${VAR} with an uppercase env-style name (3+ chars total inside braces).
const ENV_PLACEHOLDER_PATTERN = /\$\{[A-Z][A-Z0-9_]{1,63}\}/g;
// Chars that enable shell execution/expansion when found OUTSIDE of quotes.
const SHELL_METACHARS_OUTSIDE_QUOTES = /[&|;<>()`$^%"'\s]/;
// ${NAME} placeholders are tolerated so catalog entries can defer secrets to
// the runtime (`${GITHUB_TOKEN}`), but shell-SPECIAL variables are classic
// injection payloads (C4-01) and are always rejected.
const SHELL_SPECIAL_VARIABLES = new Set([
  "IFS",
  "BASH_ENV",
  "BASHOPTS",
  "BASH_XTRACEFD",
  "CDPATH",
  "COMP_WORDBREAKS",
  "ENV",
  "GLOBIGNORE",
  "HOME",
  "LD_LIBRARY_PATH",
  "LD_PRELOAD",
  "PATH",
  "PS1",
  "PS2",
  "PS3",
  "PS4",
  "SHELL",
  "SHELLOPTS",
]);

export const MAX_BULK_ITEMS = 30;

/**
 * Validates one catalog install.arg token.
 * - Quote characters anywhere reject the token (argv-array semantics never
 *   need quotes; tolerating them widens the injection surface).
 * - Legit ${VAR} placeholders are tolerated (they reach the CLI literally and
 *   are resolved by Cline, never by a shell here).
 * - Any remaining shell metachar rejects the token.
 * @param {string} raw
 * @returns {string|null} Cleaned token or null when rejected
 */
function validateInstallArgToken(raw) {
  let s = raw.trim();
  if (!s || s.length > CLI_ARG_MAX_LENGTH) return null;
  // Quotes anywhere are rejected outright (C4-01). With argv-array semantics no
  // shell is involved, so a catalog token never needs quote characters;
  // tolerating them only widens the injection/obfuscation surface.
  if (s.includes('"') || s.includes("'")) return null;
  // Path traversal segments are never needed by a catalog install.
  if (s.includes("..")) return null;
  // ${NAME} tolerance must NOT apply to shell-special variables (`${IFS}` is a
  // classic C4-01 injection payload delivered through a legit-looking token).
  for (const m of s.matchAll(ENV_PLACEHOLDER_PATTERN)) {
    const name = m[0].slice(2, -1);
    if (SHELL_SPECIAL_VARIABLES.has(name)) return null;
  }
  // Remove legit ${VAR} placeholders, then scan for shell metachars.
  const withoutPlaceholders = s.replace(ENV_PLACEHOLDER_PATTERN, "");
  if (SHELL_METACHARS_OUTSIDE_QUOTES.test(withoutPlaceholders)) return null;
  // Tokens must not contain whitespace (word splitting ambiguity / argv-array
  // tokens are single argv entries).
  if (/\s/.test(s)) return null;
  return s;
}

/**
 * Validates each element of `entry.install.args` coming from the catalog.
 * If any element fails it returns null and the caller must fall back to
 * [verb, "install", id] (the request id did pass through sanitizePrimitiveId).
 * @param {unknown} rawArgs
 * @returns {string[]|null}
 */
export function sanitizeInstallArgs(rawArgs) {
  if (!Array.isArray(rawArgs) || rawArgs.length === 0) return null;
  const clean = [];
  for (const raw of rawArgs) {
    if (typeof raw !== "string") return null;
    const token = validateInstallArgToken(raw);
    if (token === null) return null;
    clean.push(token);
  }
  return clean;
}

/**
 * Builds the exact CLI argv for installing a primitive, per type and scope
 * (requirement 1 + 2 of the install/gestion audit):
 *   - skill  → `cline skill install <repo> --skill <name> -y` (+ `-g` when
 *     global; without `-g` the skills CLI installs project-scoped using the
 *     spawn cwd).
 *   - mcp    → `cline [--config <cwd>/.cline] mcp install <args> --yes --json`
 *     (--yes avoids the interactive wizard hang; --config is a program-level
 *     option and must precede the subcommand).
 *   - plugin → `cline plugin install <source> --json` (+ `--cwd <cwd>` when
 *     workspace scope, + `--force` on reinstall).
 * @param {string} type plugin|skill|mcp
 * @param {string} id Sanitized primitive id (fallback when catalog args are unsafe)
 * @param {object|null} entry Catalog entry
 * @param {{ scope?: string, cwd?: string|null, force?: boolean }} options
 * @returns {{ args: string[], source: "catalog"|"fallback" }}
 */
export function buildInstallArgs(type, id, entry, { scope = "global", cwd = null, force = false } = {}) {
  const verb = verbFor(type);
  const workspace = scope === "workspace" && typeof cwd === "string" && cwd.length > 0;
  const catalogArgs = sanitizeInstallArgs(entry?.install?.args);
  const source = catalogArgs ? "catalog" : "fallback";
  const args = [];

  if (type === "mcp" && workspace) {
    args.push("--config", join(cwd, ".cline"));
  }
  args.push(verb, "install");

  if (type === "skill") {
    args.push(...(catalogArgs || [id]));
    args.push("-y"); // never interactive (skills CLI confirmation skip)
    if (scope !== "workspace") args.push("-g");
  } else if (type === "mcp") {
    const rawTokens = catalogArgs || [id];
    const dashDashIdx = rawTokens.indexOf("--");
    const flags = ["--yes", "--json"];
    if (dashDashIdx !== -1) {
      const before = rawTokens.slice(0, dashDashIdx);
      const after = rawTokens.slice(dashDashIdx);
      args.push(...before, ...flags, ...after);
    } else {
      args.push(...rawTokens, ...flags);
    }
  } else if (type === "plugin") {
    args.push(...(catalogArgs || [id]));
    args.push("--json");
    if (workspace) args.push("--cwd", cwd);
    if (force && !args.includes("--force")) args.push("--force");
  }
  return { args, source };
}

/**
 * Builds the exact CLI argv for uninstalling a primitive, per type and scope.
 *   - skill  → `cline skill remove <name> -y` (+ `-g` when global)
 *   - mcp    → `cline [--config <cwd>/.cline] mcp uninstall <name> --json`
 *   - plugin → `cline plugin uninstall <name> --json` (+ `--cwd <cwd>`)
 * @param {string} type
 * @param {string} id
 * @param {{ scope?: string, cwd?: string|null }} options
 * @returns {string[]}
 */
export function buildUninstallArgs(type, id, { scope = "global", cwd = null } = {}) {
  const verb = verbFor(type);
  const workspace = scope === "workspace" && typeof cwd === "string" && cwd.length > 0;
  if (type === "skill") {
    const args = [verb, "remove", id, "-y"];
    if (scope !== "workspace") args.push("-g");
    return args;
  }
  if (type === "mcp") {
    const args = [];
    if (workspace) args.push("--config", join(cwd, ".cline"));
    args.push(verb, "uninstall", id, "--json");
    return args;
  }
  const args = [verb, "uninstall", id, "--json"];
  if (workspace) args.push("--cwd", cwd);
  return args;
}


export function createApiRouter({ root, dataDir, CATALOG_PATH, PREV_CATALOG_PATH, META_PATH, INSTALLED_PATH, WATCHLIST_PATH, CONTEXT_PATH, SETTINGS_PATH }) {
  const router = Router();

  function loadCatalog() {
    return readJson(CATALOG_PATH, null);
  }

  function loadInstalled() {
    return readJson(INSTALLED_PATH, { items: {} });
  }

  function saveInstalled(state) {
    return safeWriteJson(INSTALLED_PATH, state);
  }

  function loadWatchlist() {
    return readJson(WATCHLIST_PATH, { items: [] });
  }

  function saveWatchlist(w) {
    return safeWriteJson(WATCHLIST_PATH, w);
  }

  function loadSettings() {
    return readJson(SETTINGS_PATH, {
      recentWorkspaces: [],
      defaultScope: "global",
      themeContrast: "default",
      autoUpdateCheck: true,
    });
  }

  function saveSettings(s) {
    return safeWriteJson(SETTINGS_PATH, s);
  }

  // ---- Context Analysis Engine ---------------------------------------------
  function parseGitRepo(targetCwd) {
    try {
      let gitPath = join(targetCwd, ".git");
      if (existsSync(gitPath)) {
        try {
          const stat = statSync(gitPath);
          if (stat.isFile()) {
            const content = readFileSync(gitPath, "utf8");
            const match = content.match(/gitdir:\s*(.+)/i);
            if (match) {
              gitPath = resolve(targetCwd, match[1].trim());
            }
          }
        } catch {}

        const configPath = join(gitPath, "config");
        if (existsSync(configPath)) {
          const configText = readFileSync(configPath, "utf8");
          const originSection = configText.match(/\[remote\s+["']origin["']\][^\[]*?url\s*=\s*([^\r\n]+)/is) ||
                                configText.match(/\[remote\s+[^\]]+\][^\[]*?url\s*=\s*([^\r\n]+)/is);
          if (originSection) {
            const rawUrl = originSection[1].trim();
            const match = rawUrl.match(/(?:[:/])([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/);
            if (match) {
              return {
                owner: match[1],
                name: match[2],
              };
            }
          }
        }
      }
    } catch {}

    try {
      const pkgPath = join(targetCwd, "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        let repoStr = null;
        if (typeof pkg.repository === "string") repoStr = pkg.repository;
        else if (pkg.repository && typeof pkg.repository.url === "string") repoStr = pkg.repository.url;

        if (repoStr) {
          const m = repoStr.match(/(?:[:/])([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/);
          if (m) {
            return {
              owner: m[1],
              name: m[2],
            };
          }
        }
      }
    } catch {}

    return null;
  }

  function analyzeWorkspaceContext(targetCwd) {
    const cwd = resolve(targetCwd || process.cwd());
    const repo = parseGitRepo(cwd);
    const languages = new Set();
    const frameworks = new Set();
    const tags = new Set();
    const hints = new Set();
    const dependencies = new Set();

    if (!existsSync(cwd)) {
      return {
        ok: true,
        cwd,
        repo: null,
        languages: [],
        frameworks: [],
        tags: [],
        hints: [],
        recommendations: [],
        bundles: [],
        recommended: [],
      };
    }

    let shallowFiles = [];
    try {
      shallowFiles = readdirSync(cwd);
    } catch {}

    const pkgPath = join(cwd, "package.json");
    if (existsSync(pkgPath)) {
      languages.add("javascript");
      try {
        const j = JSON.parse(readFileSync(pkgPath, "utf8"));
        const allDeps = { ...(j.dependencies || {}), ...(j.devDependencies || {}) };
        for (const depName of Object.keys(allDeps)) dependencies.add(depName);

        if (allDeps.typescript || existsSync(join(cwd, "tsconfig.json"))) {
          languages.add("typescript");
          hints.add("TypeScript configured");
        }
        if (allDeps.react) {
          frameworks.add("react");
          tags.add("frontend");
          tags.add("react");
        }
        if (allDeps.vue) {
          frameworks.add("vue");
          tags.add("frontend");
          tags.add("vue");
        }
        if (allDeps.next || allDeps.nextjs) {
          frameworks.add("nextjs");
          tags.add("fullstack");
          tags.add("react");
          hints.add("Next.js framework detected");
        }
        if (allDeps.express) {
          frameworks.add("express");
          tags.add("backend");
          tags.add("api");
        }
        if (allDeps.fastify) {
          frameworks.add("fastify");
          tags.add("backend");
          tags.add("api");
        }
        if (allDeps["@nestjs/core"] || allDeps.nestjs) {
          frameworks.add("nestjs");
          tags.add("backend");
        }
        if (allDeps.tailwindcss) {
          frameworks.add("tailwind");
          tags.add("css");
        }
        if (allDeps.svelte) {
          frameworks.add("svelte");
          tags.add("frontend");
        }
        if (allDeps.electron) {
          frameworks.add("electron");
          tags.add("desktop");
          hints.add("Electron framework detected");
        }
        if (allDeps.vite) {
          frameworks.add("vite");
          tags.add("frontend");
        }
        if (allDeps.jest || allDeps.vitest || allDeps.mocha) {
          tags.add("testing");
          hints.add("Test suite configured");
        }
      } catch {}
    }

    const pyProject = join(cwd, "pyproject.toml");
    const reqTxt = join(cwd, "requirements.txt");
    const pipfile = join(cwd, "Pipfile");
    const setupPy = join(cwd, "setup.py");
    if (existsSync(pyProject) || existsSync(reqTxt) || existsSync(pipfile) || existsSync(setupPy) || shallowFiles.some((f) => f.endsWith(".py"))) {
      languages.add("python");
      let pyContent = "";
      try {
        if (existsSync(reqTxt)) pyContent += readFileSync(reqTxt, "utf8");
        if (existsSync(pyProject)) pyContent += readFileSync(pyProject, "utf8");
      } catch {}
      const pyLower = pyContent.toLowerCase();
      if (pyLower.includes("django")) { frameworks.add("django"); tags.add("backend"); }
      if (pyLower.includes("flask")) { frameworks.add("flask"); tags.add("backend"); }
      if (pyLower.includes("fastapi")) { frameworks.add("fastapi"); tags.add("backend"); tags.add("api"); }
      if (pyLower.includes("torch") || pyLower.includes("tensorflow") || pyLower.includes("transformers") || pyLower.includes("langchain") || pyLower.includes("pydantic-ai") || pyLower.includes("openai")) {
        frameworks.add("ai-ml");
        tags.add("ai");
        tags.add("data");
        hints.add("AI/ML dependencies detected");
      }
      if (pyLower.includes("pytest")) {
        tags.add("testing");
        hints.add("pytest suite configured");
      }
    }

    if (existsSync(join(cwd, "go.mod")) || shallowFiles.some((f) => f.endsWith(".go"))) {
      languages.add("go");
      try {
        const goMod = readFileSync(join(cwd, "go.mod"), "utf8");
        if (goMod.includes("gin-gonic")) frameworks.add("gin");
      } catch {}
    }

    if (existsSync(join(cwd, "Cargo.toml")) || shallowFiles.some((f) => f.endsWith(".rs"))) {
      languages.add("rust");
      try {
        const cargoToml = readFileSync(join(cwd, "Cargo.toml"), "utf8");
        if (cargoToml.includes("tokio")) { frameworks.add("tokio"); hints.add("Tokio async runtime configured"); }
        if (cargoToml.includes("actix")) frameworks.add("actix");
        if (cargoToml.includes("axum")) frameworks.add("axum");
      } catch {}
    }

    if (existsSync(join(cwd, "Dockerfile")) || existsSync(join(cwd, "docker-compose.yml")) || existsSync(join(cwd, "compose.yaml"))) {
      frameworks.add("docker");
      tags.add("devops");
      hints.add("Docker container workflow detected");
    }

    let branch = null;
    let commit = null;
    const gitHeadPath = join(cwd, ".git", "HEAD");
    if (existsSync(gitHeadPath)) {
      try {
        const headContent = readFileSync(gitHeadPath, "utf8").trim();
        if (headContent.startsWith("ref: refs/heads/")) {
          branch = headContent.replace("ref: refs/heads/", "");
          const refPath = join(cwd, ".git", "refs", "heads", branch);
          if (existsSync(refPath)) {
            commit = readFileSync(refPath, "utf8").trim().slice(0, 7);
          }
        } else {
          commit = headContent.slice(0, 7);
        }
      } catch {}
    }

    let packageManager = null;
    if (existsSync(join(cwd, "pnpm-lock.yaml"))) packageManager = "pnpm";
    else if (existsSync(join(cwd, "yarn.lock"))) packageManager = "yarn";
    else if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) packageManager = "bun";
    else if (existsSync(join(cwd, "package-lock.json"))) packageManager = "npm";

    const wsProbe = fsProbe(cwd);
    const localPrimitives = {
      skills: wsProbe.found.skills.size,
      plugins: wsProbe.found.plugins.size,
      mcps: wsProbe.found.mcps.size,
      total: wsProbe.found.skills.size + wsProbe.found.plugins.size + wsProbe.found.mcps.size,
    };

    if (existsSync(join(cwd, ".git")) || repo) {
      frameworks.add("git");
      tags.add("git");
      hints.add("Git version control active");
    }

    const cat = loadCatalog();
    const langList = Array.from(languages);
    const fwList = Array.from(frameworks);
    const tagList = Array.from(tags);
    const hintList = Array.from(hints);
    const depList = Array.from(dependencies);

    // Workspace context consumed by the recommender engine (lib/recommender.js).
    const recContext = {
      cwd,
      repo,
      languages: langList,
      frameworks: fwList,
      tags: tagList,
      hints: hintList,
      dependencies: depList,
    };

    // Already-installed (detected) primitives are excluded from recommendations.
    const installedKeys = new Set(
      Object.values(loadInstalled().items || {})
        .filter((item) => item?.detected !== false && item?.type && item?.id)
        .map((item) => `${item.type}:${item.id}`)
    );

    const catalogEntries = Array.isArray(cat?.entries) ? cat.entries : [];
    const topRecs = buildRecommendations(catalogEntries, recContext, {
      limit: 20,
      installedKeys,
      maxReasons: 4,
    });

    // Data-driven bundles from the recommender engine, mapped to the UI
    // contract ({ id, title, description, items: [{type, id, name}] }).
    const bundles = buildBundles(catalogEntries, recContext, {
      maxBundles: 6,
      installedKeys,
      maxEntriesPerBundle: 6,
    }).map((b) => ({
      id: b.id,
      title: b.name,
      description: b.rationale,
      completionPercent: b.completionPercent,
      items: b.entries.map((e) => ({ type: e.type, id: e.id, name: e.name || e.id })),
    }));

    // Fallback: keep the recommendations tab non-empty for workspaces whose
    // signals did not produce a bundle (data-driven, no hardcoded ids).
    if (bundles.length === 0 && topRecs.length > 0) {
      bundles.push({
        id: "workspace-top-matches",
        title: "Top Matches for This Workspace",
        description: "Highest-affinity catalog entries for the detected stack.",
        items: topRecs.slice(0, 3).map((r) => ({ type: r.entry.type, id: r.entry.id, name: r.entry.name || r.entry.id })),
      });
    }

    const recommended = topRecs.map((r) => r.entry.key || `${r.entry.type}:${r.entry.id}`);

    return {
      ok: true,
      cwd,
      repo,
      branch,
      commit,
      packageManager,
      localPrimitives,
      languages: Array.from(languages),
      frameworks: Array.from(frameworks),
      tags: Array.from(tags),
      hints: Array.from(hints),
      recommendations: topRecs,
      bundles,
      recommended,
    };
  }

  // ---- Catalog Endpoint ----------------------------------------------------
  router.get("/catalog", (req, res) => {
    const wsDir = req.query.cwd ? sanitizeWorkspacePath(String(req.query.cwd)) : root;
    const probe = fsProbe(wsDir);
    const cat = loadCatalog() || { entries: [] };
    const prev = readJson(PREV_CATALOG_PATH, null);
    const meta = readJson(META_PATH, {});

    const prevMap = new Map((prev?.entries || []).map((e) => [e.key || `${e.type}:${e.id}`, e]));
    const marketEntries = (cat.entries || []).map((e) => {
      const key = e.key || `${e.type}:${e.id}`;
      const p = prevMap.get(key);
      const isNew = prev ? !p : false;
      const m = meta[key] || null;
      return {
        ...e,
        key,
        isNew,
        upstreamCommit: m,
      };
    });

    const existingKeys = new Set(marketEntries.map((e) => e.key));
    const localEntries = [];

    // Synthesize local custom plugins/skills/mcps
    for (const [id, item] of probe.found.plugins.entries()) {
      const cleanPluginId = id.replace(/-[a-f0-9]{8,}$/, "");
      const key = `plugin:${id}`;
      const cleanKey = `plugin:${cleanPluginId}`;
      const itemKey = `plugin:${item.id}`;
      if (!existingKeys.has(key) && !existingKeys.has(cleanKey) && !existingKeys.has(itemKey)) {
        existingKeys.add(key);
        localEntries.push({
          key,
          type: "plugin",
          id,
          name: item.metadata?.name || id,
          description: item.metadata?.description || `Local custom plugin installed at ${item.path}`,
          author: { name: item.metadata?.author || "Local Machine", url: null },
          tags: item.metadata?.tags || ["local", "custom"],
          isLocal: true,
          install: { command: `cline plugin install ${id}`, args: [id] },
        });
      }
    }

    for (const [id, item] of probe.found.skills.entries()) {
      const slug = id.split("/").pop();
      const key = `skill:${id}`;
      const slugKey = `skill:${slug}`;
      const itemKey = `skill:${item.id}`;
      if (!existingKeys.has(key) && !existingKeys.has(slugKey) && !existingKeys.has(itemKey)) {
        existingKeys.add(key);
        localEntries.push({
          key,
          type: "skill",
          id,
          name: item.metadata?.name || id,
          description: item.metadata?.description || `Local custom skill installed at ${item.path}`,
          author: { name: item.metadata?.author || "Local Machine", url: null },
          tags: item.metadata?.tags || ["local", "custom"],
          isLocal: true,
          install: { command: `cline skill install ${id}`, args: [id] },
        });
      }
    }

    for (const [id, item] of probe.found.mcps.entries()) {
      const key = `mcp:${id}`;
      if (!existingKeys.has(key)) {
        localEntries.push({
          key,
          type: "mcp",
          id,
          name: id,
          description: `Configured MCP Server from ${item.source}`,
          author: { name: "Local Configuration", url: null },
          tags: ["mcp", "configured"],
          isLocal: true,
          install: { command: `cline mcp add ${id}`, args: [id] },
        });
      }
    }

    const allEntries = [...localEntries, ...marketEntries];
    const tagCounts = new Map();
    for (const e of allEntries) {
      if (Array.isArray(e.tags)) {
        for (const t of e.tags) {
          if (t && typeof t === "string") {
            const clean = t.trim();
            if (clean) tagCounts.set(clean, (tagCounts.get(clean) || 0) + 1);
          }
        }
      }
    }

    const tagList = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id, count]) => ({ id, label: id, count }));

    res.json({
      generatedAt: cat.generatedAt || new Date().toISOString(),
      baseUrl: cat.baseUrl || "https://github.com/cline/marketplace",
      counts: {
        total: allEntries.length,
        marketplace: marketEntries.length,
        local: localEntries.length,
        plugins: allEntries.filter((e) => e.type === "plugin").length,
        skills: allEntries.filter((e) => e.type === "skill").length,
        mcps: allEntries.filter((e) => e.type === "mcp").length,
      },
      tags: tagList,
      entries: allEntries,
    });
  });

  // ---- Workspace Context & Recommendations ---------------------------------
  router.get("/context", (req, res) => {
    const wsDir = req.query.cwd ? sanitizeWorkspacePath(String(req.query.cwd)) : root;
    const contextInfo = analyzeWorkspaceContext(wsDir);
    // Dirty-check: only persist when the content changed (avoids write I/O on every GET)
    const prevContext = readJson(CONTEXT_PATH, null);
    if (!prevContext || JSON.stringify(prevContext) !== JSON.stringify(contextInfo)) {
      safeWriteJson(CONTEXT_PATH, contextInfo).catch(() => {});
    }
    res.json(contextInfo);
  });

  // ---- Installed Registry Endpoint -----------------------------------------
  router.get("/installed", async (req, res) => {
    const wsDir = req.query.cwd ? sanitizeWorkspacePath(String(req.query.cwd)) : root;
    const probe = fsProbe(wsDir);
    const prevInstalled = loadInstalled();
    const state = reconcile(prevInstalled, probe);

    // Dirty-checking before saving to prevent disk thrashing on pure reads
    const prevKeys = Object.keys(prevInstalled.items || {}).sort().join(",");
    const nextKeys = Object.keys(state.items || {}).sort().join(",");
    const prevActive = Object.values(prevInstalled.items || {}).filter((i) => i.detected).length;
    const nextActive = Object.values(state.items || {}).filter((i) => i.detected).length;

    if (prevKeys !== nextKeys || prevActive !== nextActive) {
      await saveInstalled(state);
    }

    res.json(state);
  });

  // ---- Settings & Recent Workspaces ----------------------------------------
  router.get("/settings", (req, res) => {
    res.json(loadSettings());
  });

  router.post("/settings", async (req, res) => {
    const current = loadSettings();
    const b = req.body || {};
    const updated = {
      ...current,
      ...(b.defaultScope ? { defaultScope: b.defaultScope === "workspace" ? "workspace" : "global" } : {}),
      ...(b.themeContrast ? { themeContrast: String(b.themeContrast).slice(0, 30) } : {}),
      ...(typeof b.autoUpdateCheck === "boolean" ? { autoUpdateCheck: b.autoUpdateCheck } : {}),
      ...(Array.isArray(b.recentWorkspaces)
        ? {
            recentWorkspaces: b.recentWorkspaces
              .filter((w) => w && typeof w === "object" && typeof w.path === "string")
              .map((w) => ({
                path: sanitizeWorkspacePath(w.path),
                name: typeof w.name === "string" ? w.name.slice(0, 50) : basename(sanitizeWorkspacePath(w.path)),
                lastUsedAt: typeof w.lastUsedAt === "string" ? w.lastUsedAt : new Date().toISOString(),
              }))
              .slice(0, 20),
          }
        : {}),
    };
    await saveSettings(updated);
    res.json({ ok: true, settings: updated });
  });

  router.post("/workspaces/recent", async (req, res) => {
    const rawPath = req.body?.path;
    if (!rawPath || typeof rawPath !== "string") {
      return res.status(400).json({ ok: false, error: "Valid workspace path required", code: "INVALID_PATH" });
    }
    const safePath = sanitizeWorkspacePath(rawPath);
    const s = loadSettings();
    const existing = (s.recentWorkspaces || []).filter((w) => w && typeof w === "object" && w.path !== safePath);
    existing.unshift({
      path: safePath,
      name: basename(safePath) || safePath,
      lastUsedAt: new Date().toISOString(),
    });
    s.recentWorkspaces = existing.slice(0, 10);
    await saveSettings(s);
    res.json({ ok: true, recentWorkspaces: s.recentWorkspaces });
  });

  router.post("/workspaces/validate", (req, res) => {
    const rawPath = req.body?.path;
    if (!rawPath || typeof rawPath !== "string") {
      return res.status(400).json({ ok: false, exists: false, error: "Path parameter is required", code: "INVALID_PATH" });
    }
    try {
      const resolved = resolve(rawPath);
      if (existsSync(resolved) && statSync(resolved).isDirectory()) {
        const name = basename(resolved);
        const isGit = existsSync(join(resolved, ".git"));
        const hasPackageJson = existsSync(join(resolved, "package.json"));
        const hasCline = existsSync(join(resolved, ".cline"));
        return res.json({
          ok: true,
          exists: true,
          path: resolved,
          name,
          isGit,
          hasPackageJson,
          hasCline,
        });
      }
      return res.status(404).json({ ok: false, exists: false, error: "Directory does not exist on disk", code: "NOT_FOUND" });
    } catch (err) {
      return res.status(400).json({ ok: false, exists: false, error: err.message, code: "INVALID_PATH" });
    }
  });

  // ---- System Status -------------------------------------------------------
  router.get("/status", async (req, res) => {
    const probe = fsProbe();
    const installed = reconcile(loadInstalled(), probe);
    const catalog = loadCatalog();
    const meta = readJson(META_PATH, {});
    const clinePath = await resolveCline();

    res.json({
      node: process.version,
      platform: platform(),
      arch: arch(),
      pid: process.pid,
      uptime: Math.round(process.uptime()),
      memory: process.memoryUsage(),
      clinePath: clinePath || null,
      storageRoots: probe.roots,
      clineRoots: probe.roots,
      catalog: catalog
        ? {
            generatedAt: catalog.generatedAt,
            baseUrl: catalog.baseUrl,
            total: catalog.counts?.total ?? catalog.entries?.length ?? 0,
          }
        : null,
      installedCount: Object.values(installed.items).filter((it) => it.detected).length,
      metaCount: Object.keys(meta).length,
    });
  });

  // ---- System Diagnostics / Health -----------------------------------------
  router.get("/health", async (req, res) => {
    const checks = [];
    checks.push({
      name: "node",
      ok: true,
      detail: `${process.version} (${arch()}) · V8 ${process.versions.v8 || "active"}`,
      path: process.execPath,
      version: process.version,
    });

    const clineExe = await resolveCommand("cline");
    if (clineExe) {
      try {
        const isBatch = isWindowsBatchShim(clineExe);
        const { stdout } = await execFileP(clineExe, ["--version"], { timeout: 3000, windowsHide: true, shell: isBatch });
        const out = stdout.trim();
        checks.push({ name: "cline", ok: true, path: clineExe, version: out, detail: `${out} at ${clineExe}`, error: null });
      } catch (err) {
        checks.push({ name: "cline", ok: false, path: clineExe, error: err.message, detail: `Found at ${clineExe} but failed running` });
      }
    } else {
      checks.push({ name: "cline", ok: false, path: null, error: "CLI binary 'cline' not found on PATH" });
    }

    const ghExe = await resolveCommand("gh");
    if (ghExe) {
      try {
        const isBatch = isWindowsBatchShim(ghExe);
        const { stdout } = await execFileP(ghExe, ["version"], { timeout: 3000, windowsHide: true, shell: isBatch });
        const out = stdout.split("\n")[0].trim();
        const vMatch = out.match(/gh version ([0-9.]+)/i);
        const versionStr = vMatch ? vMatch[1] : out;
        checks.push({ name: "gh", ok: true, version: versionStr, path: ghExe, detail: "Authenticated to GitHub" });
      } catch (err) {
        checks.push({ name: "gh", ok: false, path: ghExe, error: err.message, detail: `Found at ${ghExe} but failed execution` });
      }
    } else {
      checks.push({ name: "gh", ok: false, detail: "GitHub CLI optional (used for metadata caching)" });
    }

    const gitExe = await resolveCommand("git");
    if (gitExe) {
      try {
        const { stdout } = await execFileP(gitExe, ["--version"], { timeout: 3000, windowsHide: true });
        checks.push({ name: "git", ok: true, version: stdout.trim(), path: gitExe, detail: stdout.trim() });
      } catch (err) {
        checks.push({ name: "git", ok: false, path: gitExe, error: err.message, detail: "git execution error" });
      }
    } else {
      checks.push({ name: "git", ok: false, detail: "git CLI not found" });
    }

    const wsDir = req.query.cwd ? sanitizeWorkspacePath(String(req.query.cwd)) : root;
    const probe = fsProbe(wsDir);
    const rootsDetail = probe.roots.map((r) => {
      const exists = existsSync(r);
      const subprobe = exists ? fsProbe(r) : null;
      return {
        path: r,
        exists,
        plugins: subprobe ? subprobe.found.plugins.size : 0,
        skills: subprobe ? subprobe.found.skills.size : 0,
        mcps: subprobe ? subprobe.found.mcps.size : 0,
      };
    });

    checks.push({
      name: "cline-storage",
      ok: probe.roots.length > 0,
      detail: probe.roots.join(", ") || "No storage directory detected",
      roots: probe.roots,
      rootsDetail,
      counts: {
        plugins: probe.found.plugins.size,
        skills: probe.found.skills.size,
        mcps: probe.found.mcps.size,
        total: probe.found.plugins.size + probe.found.skills.size + probe.found.mcps.size,
      },
    });

    const cat = loadCatalog();
    checks.push({
      name: "catalog",
      ok: Boolean(cat && cat.entries?.length),
      detail: cat ? `${cat.entries.length} entries, generated ${cat.generatedAt || "unknown"}` : "catalog.json missing or empty",
      counts: cat?.counts || { total: cat?.entries?.length || 0 },
    });

    const meta = readJson(META_PATH, {});
    checks.push({
      name: "metadata",
      ok: Object.keys(meta).length > 0,
      detail: `${Object.keys(meta).length} upstream commit records cached`,
      count: Object.keys(meta).length,
    });

    const mem = process.memoryUsage();
    const uptimeSec = Math.round(process.uptime());
    const uptimeFormatted = `${Math.floor(uptimeSec / 60)}m ${uptimeSec % 60}s`;

    res.json({
      ok: true,
      healthy: checks.filter((c) => c.ok).length === checks.length,
      passedChecks: checks.filter((c) => c.ok).length,
      totalChecks: checks.length,
      checks,
      system: {
        platform: platform(),
        arch: arch(),
        osType: type(),
        osRelease: release(),
        node: process.version,
        clinePath: clineExe || null,
        uptime: uptimeSec,
        uptimeFormatted,
        memory: {
          rssMb: (mem.rss / (1024 * 1024)).toFixed(1),
          heapUsedMb: (mem.heapUsed / (1024 * 1024)).toFixed(1),
          heapTotalMb: (mem.heapTotal / (1024 * 1024)).toFixed(1),
          externalMb: (mem.external / (1024 * 1024)).toFixed(1),
        },
        cpus: cpus().length,
      },
    });
  });

  // ---- Install / Uninstall Handlers (job engine + live SSE streaming) -------

  // In-memory job registry powering GET /api/events/install/:jobId (SSE).
  // Jobs are buffered for replay so subscribers can attach after the POST
  // started the work and still receive the full line history.
  const installJobs = new Map();
  const MAX_JOBS = 50;
  const MAX_JOB_EVENTS = 4000;
  // Requirement 7: generous timeouts — skill installs clone GitHub repos.
  const INSTALL_TIMEOUT_MS = { skill: 300_000, mcp: 300_000, plugin: 300_000 };

  function emitJobEvent(job, event) {
    const enriched = { ts: Date.now(), ...event };
    job.events.push(enriched);
    if (job.events.length > MAX_JOB_EVENTS) job.events.shift();
    for (const fn of job.listeners) {
      try { fn(enriched); } catch { /* listener errors must not break the job */ }
    }
  }

  function createInstallJob(jobId, meta) {
    if (installJobs.size >= MAX_JOBS) {
      // Evict the oldest tracked job to cap memory.
      installJobs.delete(installJobs.keys().next().value);
    }
    const job = {
      id: jobId,
      ...meta,
      status: "running",
      events: [],
      listeners: new Set(),
      startedAt: Date.now(),
      finishedAt: null,
      code: null,
      durationMs: null,
      ok: null,
      result: null,
    };
    installJobs.set(jobId, job);
    return job;
  }

  /**
   * Runs a primitive install sharing the same semantics between
   * /api/install and /api/bulk (F5): catalog args sanitized (C4-01) via
   * buildInstallArgs (non-interactive flags + scope) with a safe fallback to
   * [verb, "install", id] + a --force retry for plugins only.
   * @param {string} type
   * @param {string} id
   * @param {{ cwd?: string, scope?: string, force?: boolean, job?: object|null, seen?: Set<string> }} options
   * @returns {Promise<{ result: { code: number, stdout: string, stderr: string, durationMs: number }, args: string[], entry: object|null, verb: string, toleratedAlreadyInstalled: boolean }>}
   */
  async function installOne(type, id, { cwd, scope = "global", force = false, job = null, seen = new Set() } = {}) {
    const catalog = loadCatalog();
    const entry = catalog?.entries?.find((e) => e.type === type && e.id === id) || null;
    const emit = job ? (e) => emitJobEvent(job, e) : () => {};
    const { args: builtArgs, source } = buildInstallArgs(type, id, entry, { scope, cwd, force });
    let args = builtArgs;
    if (Array.isArray(entry?.install?.args) && source === "fallback") {
      logger.warn(`Rejected unsafe install.args from catalog for ${type}:${id}. Falling back to default install command.`);
      emit({ type: "warn", text: "Unsafe catalog install.args rejected; using default install command." });
    }
    emit({ type: "exec", command: `cline ${args.join(" ")}`, cwd: cwd || null });

    let result = await runCline(args, {
      cwd,
      timeoutMs: INSTALL_TIMEOUT_MS[type] || 180_000,
      onLine: job ? (line, stream) => emit({ type: "line", stream, text: line }) : null,
    });

    // Idempotency (requirement 7): tolerate "already installed" outcomes.
    // Plugins support an explicit --force retry; skills/MCPs are tolerated.
    const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
    let toleratedAlreadyInstalled = result.code !== 0 && combined.includes("already installed");
    if (result.code !== 0 && type === "plugin" && !args.includes("--force") && (combined.includes("already installed") || combined.includes("--force") || combined.includes("replace it"))) {
      emit({ type: "warn", text: "Plugin already installed; retrying with --force." });
      args = [...args, "--force"];
      emit({ type: "exec", command: `cline ${args.join(" ")}`, cwd: cwd || null });
      result = await runCline(args, {
        cwd,
        timeoutMs: INSTALL_TIMEOUT_MS.plugin,
        onLine: job ? (line, stream) => emit({ type: "line", stream, text: line }) : null,
      });
      toleratedAlreadyInstalled = false;
    }
    return { result, args, entry, verb: verbFor(type), toleratedAlreadyInstalled };
  }

  /**
   * Runs a declared binary auto-install command (e.g. ["npm", "install", "-g",
   * "pkg"]) captured from `install.dependencies.binaries[].installCommand`.
   * Tokens are sanitized with the same rules as catalog install.args and then
   * executed with per-argument escaping on Windows (C4-02 defensive pattern);
   * on POSIX the resolved binary is spawned directly without a shell.
   * Dormant today (no catalog entry declares installCommand) but wired for the
   * dependency auto-install contract.
   * @param {string[]} commandTokens
   * @param {object|null} job
   * @returns {Promise<{ ok: boolean, code: number|null, output: string, error: string|null }>}
   */
  async function runDeclaredBinaryInstall(commandTokens, job = null) {
    const emit = job ? (e) => emitJobEvent(job, e) : () => {};
    const tokens = sanitizeInstallArgs(commandTokens);
    if (!tokens || tokens.length === 0) {
      return { ok: false, code: null, output: "", error: "Declared installCommand failed sanitization; skipped." };
    }
    const exeResolved = await resolveCommand(tokens[0]);
    const isWin = platform() === "win32";
    emit({ type: "exec", command: tokens.join(" "), cwd: null });
    const start = Date.now();
    return await new Promise((resolveP) => {
      let proc;
      let output = "";
      let settled = false;
      const onLine = job ? (line) => emit({ type: "line", stream: "stdout", text: line }) : null;
      const pushLines = (chunk) => {
        output += chunk;
        if (onLine) for (const line of chunk.split(/\r?\n/)) if (line) onLine(line);
      };
      try {
        if (isWin) {
          const cmdLine = [exeResolved || tokens[0], ...tokens.slice(1)].map(escapeWindowsShellArg).join(" ");
          proc = spawn("cmd.exe", ["/d", "/s", "/c", cmdLine], { env: getExecutionEnv(), windowsHide: true, shell: false });
        } else {
          proc = spawn(exeResolved || tokens[0], tokens.slice(1), { env: getExecutionEnv(), windowsHide: true, shell: false });
        }
      } catch (err) {
        resolveP({ ok: false, code: null, output: "", error: err.message });
        return;
      }
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { proc.kill(); } catch {}
        resolveP({ ok: false, code: null, output, error: "Binary auto-install timed out after 300s." });
      }, 300_000);
      proc.stdout?.on("data", (d) => pushLines(d.toString()));
      proc.stderr?.on("data", (d) => pushLines(d.toString()));
      proc.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolveP({ ok: false, code: null, output, error: err.message });
      });
      proc.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        logger.exec(`dep-install ${tokens.join(" ")}`, Date.now() - start, code ?? 0);
        resolveP({ ok: code === 0, code: code ?? 0, output, error: code === 0 ? null : `exit code ${code}` });
      });
    });
  }


  /**
   * Dependency pre-flight + auto-install phase (requirement 6). Emits `dep`
   * events on the job stream for every checked/installed dependency and never
   * fails the main install: missing env vars are reported, not fatal.
   * @param {object|null} entry
   * @param {{ scope: string, cwd: string, job: object, seen: Set<string>, enabled: boolean }} opts
   * @returns {Promise<{ envVarsRequired: Array<{name: string, description: string}>, available: object[], missing: object[], steps: object[] }>}
   */
  async function autoInstallDependencies(entry, { scope, cwd, job, seen, enabled }) {
    const manifest = extractDependencyManifest(entry);
    const nothingDeclared = manifest.envVars.length === 0 && manifest.binaries.length === 0 && manifest.primitives.length === 0;
    if (nothingDeclared) {
      return { envVarsRequired: [], available: [], missing: [], steps: [] };
    }
    const emit = (e) => emitJobEvent(job, e);
    emit({
      type: "dep",
      phase: "check",
      detail: `Dependency manifest: ${manifest.envVars.length} env var(s), ${manifest.binaries.length} binar(y/ies), ${manifest.primitives.length} primitive dep(s).`,
    });

    const installedKeys = new Set(
      Object.entries(loadInstalled().items)
        .filter(([, item]) => item?.detected !== false)
        .map(([key]) => key)
    );
    const check = await checkDependencies(entry, { installedSet: installedKeys });
    for (const dep of check.available) {
      emit({ type: "dep", phase: "available", detail: describeDependency(dep) });
    }
    for (const dep of check.missing) {
      emit({ type: "dep", phase: "missing", detail: describeDependency(dep) });
    }

    const steps = [];
    if (enabled) {
      for (const dep of check.autoInstallable) {
        if (dep.kind === "primitive") {
          const depKey = `${dep.type}:${dep.id}`;
          if (seen.has(depKey)) continue;
          seen.add(depKey);
          emit({ type: "dep", phase: "install-start", detail: `Auto-installing required primitive ${depKey}.` });
          try {
            const depRes = await installOne(dep.type, dep.id, { cwd, scope, job, seen });
            const ok = depRes.result.code === 0 || depRes.toleratedAlreadyInstalled;
            steps.push({ kind: "primitive", type: dep.type, id: dep.id, ok });
            emit({ type: "dep", phase: ok ? "install-ok" : "install-failed", detail: `${depKey} auto-install exit ${depRes.result.code}.` });
          } catch (err) {
            steps.push({ kind: "primitive", type: dep.type, id: dep.id, ok: false, error: String(err.message || err) });
            emit({ type: "dep", phase: "install-failed", detail: `${depKey} auto-install error: ${String(err.message || err)}` });
          }
        } else if (dep.kind === "binary" && dep.installCommand) {
          emit({ type: "dep", phase: "install-start", detail: `Auto-installing binary '${dep.name}' via declared command.` });
          const res = await runDeclaredBinaryInstall(dep.installCommand, job);
          steps.push({ kind: "binary", name: dep.name, ok: res.ok, error: res.error });
          emit({ type: "dep", phase: res.ok ? "install-ok" : "install-failed", detail: `Binary '${dep.name}' auto-install: ${res.ok ? "ok" : res.error}.` });
        }
      }
    } else if (check.autoInstallable.length > 0) {
      emit({ type: "dep", phase: "skipped", detail: `${check.autoInstallable.length} auto-installable dependency(ies) skipped (autoInstall=false).` });
    }
    return { envVarsRequired: check.envVarsRequired, available: check.available, missing: check.missing, steps };
  }

  function describeDependency(dep) {
    if (dep.kind === "env") return `env var ${dep.name}: ${dep.description || "required value"}`;
    if (dep.kind === "binary") return `binary '${dep.name}' ${dep.path ? `found at ${dep.path}` : "NOT found on PATH"}`;
    return `primitive ${dep.type}:${dep.id}`;
  }

  /**
   * Validates and normalizes an install/uninstall request body: primitive
   * type/id plus scope resolution (requirement 1). Workspace scope requires an
   * existing `cwd` (checked BEFORE sanitizeWorkspacePath, which otherwise falls
   * back silently to the server root).
   * @param {object} body
   * @returns {{ type: string, id: string, scope: "global"|"workspace", targetCwd: string } | { error: string, code: string }}
   */
  function resolveLifecycleRequest(body) {
    const type = sanitizePrimitiveType(body?.type);
    const id = sanitizePrimitiveId(body?.id);
    if (!type || !id) {
      return { error: "Valid 'type' (plugin|skill|mcp) and 'id' are required.", code: "INVALID_PRIMITIVE" };
    }
    const scope = body?.scope === "workspace" ? "workspace" : "global";
    if (scope === "workspace") {
      const rawCwd = typeof body?.cwd === "string" ? body.cwd.trim() : "";
      if (!rawCwd) {
        return { error: "scope 'workspace' requires a 'cwd' path.", code: "CWD_REQUIRED" };
      }
      if (!existsSync(rawCwd)) {
        return { error: `Workspace path does not exist: ${rawCwd}`, code: "CWD_NOT_FOUND" };
      }
      return { type, id, scope, targetCwd: sanitizeWorkspacePath(rawCwd) };
    }
    return { type, id, scope, targetCwd: body?.cwd ? sanitizeWorkspacePath(body.cwd) : root };
  }

  function jobIdFromRequest(body) {
    return typeof body?.jobId === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(body.jobId) ? body.jobId : randomUUID();
  }

  router.post("/install", async (req, res) => {
    // resolveLifecycleRequest valida type/id, resuelve scope y targetCwd
    // (requirement 1). Devuelve { error, code } o { type, id, scope, targetCwd }.
    const parsed = resolveLifecycleRequest(req.body);
    if (parsed.error) {
      return res.status(400).json({ ok: false, error: parsed.error, code: parsed.code });
    }
    const { type, id, scope, targetCwd } = parsed;
    const force = Boolean(req.body?.force);

    let result, args, entry;
    try {
      ({ result, args, entry } = await installOne(type, id, { cwd: targetCwd, force }));
    } catch (err) {
      logger.error(`Install failed for ${type}:${id}: ${err.message}`);
      return res.status(500).json({ ok: false, error: String(err.message || err), code: "INSTALL_FAILED" });
    }

    let state = loadInstalled();
    const key = `${type}:${id}`;
    const existed = Boolean(state.items[key]);
    const isOk = result.code === 0;
    const errMsg = isOk ? null : (result.stderr.trim() || result.stdout.trim() || `Command failed with exit code ${result.code}`);

    // F6: don't persist "ghost installs" when the CLI fails and the item
    // didn't previously exist in installed.json.
    if (!isOk && !existed) {
      logger.warn(`Install failed for ${type}:${id} (exit code ${result.code}). State not persisted.`);
      return res.status(400).json({
        ok: false,
        error: errMsg,
        code: "CLI_ERROR",
        exitCode: result.code,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
        command: `cline ${args.join(" ")}`,
      });
    }

    const now = new Date().toISOString();
    if (!state.items[key]) {
      state.items[key] = {
        type,
        id,
        scope,
        workspace: scope === "workspace" ? targetCwd : null,
        source: entry ? "marketplace" : "manual",
        installedAt: now,
        lastSeenAt: now,
        installCommand: entry?.install?.command || `cline ${verbFor(type)} install ${id}`,
        detected: isOk,
      };
    } else {
      state.items[key].scope = scope;
      state.items[key].workspace = scope === "workspace" ? targetCwd : state.items[key].workspace;
      state.items[key].installCommand = entry?.install?.command || state.items[key].installCommand;
      state.items[key].lastSeenAt = now;
      if (isOk) state.items[key].detected = true;
    }
    state = reconcile(state, fsProbe(targetCwd));
    await saveInstalled(state);

    res.status(isOk ? 200 : 400).json({
      ok: isOk,
      ...(errMsg ? { error: errMsg, code: "CLI_ERROR" } : {}),
      exitCode: result.code,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      command: `cline ${args.join(" ")}`,
      installed: state.items[key],
    });
  });

  router.post("/uninstall", async (req, res) => {
    const type = sanitizePrimitiveType(req.body?.type);
    const id = sanitizePrimitiveId(req.body?.id);

    if (!type || !id) {
      return res.status(400).json({ ok: false, error: "Valid 'type' (plugin|skill|mcp) and 'id' are required.", code: "INVALID_PRIMITIVE" });
    }

    const verb = verbFor(type);
    const args = [verb, "uninstall", id];
    const targetCwd = req.body?.cwd ? sanitizeWorkspacePath(req.body.cwd) : root;

    let result;
    try {
      result = await runCline(args, { cwd: targetCwd });
    } catch (err) {
      logger.error(`Uninstall failed for ${type}:${id}: ${err.message}`);
      return res.status(500).json({ ok: false, error: String(err.message || err), code: "UNINSTALL_FAILED" });
    }

    const isOk = result.code === 0;
    const errMsg = isOk ? null : (result.stderr.trim() || result.stdout.trim() || `Command failed with exit code ${result.code}`);

    // F7: don't mutate installed.json if the uninstall command failed.
    if (isOk) {
      const state = loadInstalled();
      const key = `${type}:${id}`;
      if (state.items[key]) {
        state.items[key].detected = false;
        state.items[key].lastSeenAt = new Date().toISOString();
      }
      await saveInstalled(state);
    } else {
      logger.warn(`Uninstall failed for ${type}:${id} (exit code ${result.code}). State not mutated.`);
    }

    res.status(isOk ? 200 : 400).json({
      ok: isOk,
      ...(errMsg ? { error: errMsg, code: "CLI_ERROR" } : {}),
      exitCode: result.code,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      command: `cline ${args.join(" ")}`,
    });
  });

  // ---- Mark / Forget Endpoints ---------------------------------------------
  router.post("/mark", async (req, res) => {
    const type = sanitizePrimitiveType(req.body?.type);
    const id = sanitizePrimitiveId(req.body?.id);
    const src = typeof req.body?.source === "string" ? req.body.source.slice(0, 50) : "manual";

    if (!type || !id) {
      return res.status(400).json({ ok: false, error: "Valid 'type' and 'id' are required.", code: "INVALID_PARAMS" });
    }

    const state = loadInstalled();
    const key = `${type}:${id}`;
    const now = new Date().toISOString();
    state.items[key] = {
      type,
      id,
      source: src,
      installedAt: state.items[key]?.installedAt || now,
      lastSeenAt: now,
      installCommand: state.items[key]?.installCommand || null,
      detected: true,
    };
    await saveInstalled(state);
    res.json({ ok: true, item: state.items[key] });
  });

  const forgetHandler = async (req, res) => {
    const type = sanitizePrimitiveType(req.params?.type || req.body?.type);
    const id = sanitizePrimitiveId(req.params?.id || req.body?.id);
    if (!type || !id) return res.status(400).json({ ok: false, error: "Valid 'type' and 'id' required.", code: "INVALID_PARAMS" });

    const state = loadInstalled();
    const key = `${type}:${id}`;
    delete state.items[key];
    await saveInstalled(state);
    res.json({ ok: true, key });
  };

  router.post("/forget", forgetHandler);
  router.delete("/forget/:type/:id", forgetHandler);
  router.delete("/mark/:type/:id", forgetHandler);

  // ---- Watchlist Endpoints -------------------------------------------------
  router.get("/watchlist", (req, res) => {
    res.json(loadWatchlist());
  });

  router.post("/watchlist", async (req, res) => {
    const type = sanitizePrimitiveType(req.body?.type);
    const id = sanitizePrimitiveId(req.body?.id);
    if (!type || !id) return res.status(400).json({ ok: false, error: "Valid 'type' and 'id' required.", code: "INVALID_PARAMS" });

    const key = `${type}:${id}`;
    const wl = loadWatchlist();
    if (!wl.items.some((x) => x.key === key)) {
      wl.items.push({ key, type, id, addedAt: new Date().toISOString() });
      await saveWatchlist(wl);
    }
    res.json({ ok: true, key, starred: true, count: wl.items.length });
  });

  router.delete("/watchlist/:type/:id", async (req, res) => {
    const type = sanitizePrimitiveType(req.params.type);
    const id = sanitizePrimitiveId(req.params.id);
    if (!type || !id) return res.status(400).json({ ok: false, error: "Valid 'type' and 'id' required.", code: "INVALID_PARAMS" });

    const key = `${type}:${id}`;
    const wl = loadWatchlist();
    const idx = wl.items.findIndex((x) => x.key === key);
    if (idx >= 0) {
      wl.items.splice(idx, 1);
      await saveWatchlist(wl);
    }
    res.json({ ok: true, key, starred: false, count: wl.items.length });
  });

  router.post("/watchlist/toggle", async (req, res) => {
    const type = sanitizePrimitiveType(req.body?.type);
    const id = sanitizePrimitiveId(req.body?.id);
    if (!type || !id) return res.status(400).json({ ok: false, error: "Valid 'type' and 'id' required.", code: "INVALID_PARAMS" });

    const key = `${type}:${id}`;
    const wl = loadWatchlist();
    const idx = wl.items.findIndex((x) => x.key === key);
    let starred;
    if (idx >= 0) {
      wl.items.splice(idx, 1);
      starred = false;
    } else {
      wl.items.push({ key, type, id, addedAt: new Date().toISOString() });
      starred = true;
    }
    await saveWatchlist(wl);
    res.json({ ok: true, key, starred, count: wl.items.length });
  });

  // ---- Bulk Operations -----------------------------------------------------
  router.post("/bulk", async (req, res) => {
    const action = req.body?.action;
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!["install", "uninstall", "watch", "unwatch"].includes(action)) {
      return res.status(400).json({ ok: false, error: "Invalid action. Supported: install, uninstall, watch, unwatch.", code: "INVALID_ACTION" });
    }

    // F3: hard item cap (README documents up to 30); exceeding it would block
    // the runner's serialized queue for hours.
    if (rawItems.length > MAX_BULK_ITEMS) {
      return res.status(413).json({
        ok: false,
        error: `Bulk operation is limited to ${MAX_BULK_ITEMS} items per request (received ${rawItems.length}). Split the batch into smaller requests.`,
        code: "BULK_LIMIT_EXCEEDED",
      });
    }

    const results = [];
    const targetCwd = req.body?.cwd ? sanitizeWorkspacePath(req.body.cwd) : root;
    const wl = (action === "watch" || action === "unwatch") ? loadWatchlist() : null;
    let wlModified = false;

    for (const it of rawItems) {
      if (!it || typeof it !== "object") continue;
      const type = sanitizePrimitiveType(it.type);
      const id = sanitizePrimitiveId(it.id);
      if (!type || !id) continue;

      const key = `${type}:${id}`;
      if (action === "install") {
        try {
          // F5: same semantics as /api/install (sanitized catalog args + --force retry)
          const { result } = await installOne(type, id, { cwd: targetCwd });
          results.push({ type, id, ok: result.code === 0, code: result.code });
        } catch (err) {
          results.push({ type, id, ok: false, error: err.message });
        }
      } else if (action === "uninstall") {
        try {
          const runRes = await runCline([verbFor(type), "uninstall", id], { cwd: targetCwd });
          results.push({ type, id, ok: runRes.code === 0, code: runRes.code });
        } catch (err) {
          results.push({ type, id, ok: false, error: err.message });
        }
      } else if (action === "watch") {
        if (!wl.items.some((x) => x.key === key)) {
          wl.items.push({ key, type, id, addedAt: new Date().toISOString() });
          wlModified = true;
        }
        results.push({ type, id, ok: true });
      } else if (action === "unwatch") {
        const idx = wl.items.findIndex((x) => x.key === key);
        if (idx >= 0) {
          wl.items.splice(idx, 1);
          wlModified = true;
        }
        results.push({ type, id, ok: true });
      }
    }

    if (wlModified && wl) {
      await saveWatchlist(wl);
    }

    if (action === "install" || action === "uninstall") {
      const current = reconcile(loadInstalled(), fsProbe(targetCwd));
      await saveInstalled(current);
    }

    // F4: reflejar fallos parciales en el contrato de respuesta.
    const failedCount = results.filter((r) => !r.ok).length;
    res.json({ ok: failedCount === 0, failedCount, action, results });
  });

  // ---- Refresh Catalog Endpoint --------------------------------------------
  let _refreshJob = null;
  router.post("/refresh", async (req, res) => {
    try {
      if (!_refreshJob) {
        const refreshScript = join(root, "scripts", "refresh-catalog.mjs");
        const args = [refreshScript];
        if (req.query?.catalog === "true" || req.body?.catalog === true) {
          args.push("--catalog");
        }
        _refreshJob = execFileP(process.execPath, args, {
          cwd: root,
          env: getExecutionEnv(),
          timeout: 120000,
          windowsHide: true,
        }).finally(() => {
          _refreshJob = null;
        });
      }
      const { stdout } = await _refreshJob;

      const cat = loadCatalog();
      const meta = readJson(META_PATH, {});

      res.json({
        ok: true,
        output: stdout.trim(),
        // C2: alias para el frontend (app.js muestra `${res.entries} entries`).
        entries: cat?.counts?.total ?? cat?.entries?.length ?? 0,
        total: cat?.counts?.total ?? cat?.entries?.length ?? 0,
        metaCount: Object.keys(meta).length,
      });
    } catch (err) {
      logger.error(`Refresh catalog failed: ${err.message}`);
      res.status(500).json({ ok: false, error: err.message, code: "REFRESH_FAILED" });
    }
  });

  // ---- Update & Versioning Endpoints ---------------------------------------
  router.get("/update/check", async (req, res) => {
    const pkg = readJson(join(root, "package.json"), { version: "1.0.0" });
    try {
      const ghRes = await fetch("https://api.github.com/repos/Mateo-Piedra22/ClineMarket/releases/latest", {
        headers: { "User-Agent": "Cline-Marketplace-Local" },
        signal: AbortSignal.timeout(3000),
      });
      if (!ghRes.ok) {
        return res.json({ hasUpdate: false, currentVersion: pkg.version, remoteVersion: pkg.version });
      }
      const ghData = await ghRes.json();
      const remoteTag = ghData.tag_name ? ghData.tag_name.replace(/^v/, "") : pkg.version;
      const hasUpdate = remoteTag !== pkg.version;
      res.json({ hasUpdate, currentVersion: pkg.version, remoteVersion: remoteTag, releaseUrl: ghData.html_url });
    } catch {
      res.json({ hasUpdate: false, currentVersion: pkg.version, remoteVersion: pkg.version });
    }
  });

  router.post("/update/run", async (req, res) => {
    try {
      const npmExe = (await resolveCommand("npm")) || "npm";
      const isNpmBatch = isWindowsBatchShim(npmExe);
      const npmOpts = { timeout: 120000, windowsHide: true, shell: isNpmBatch };

      let output;
      // F2: replicate the CLI guard (`cline-marketplace update`, bin:377-384).
      // On global-npm installs there is no .git and `git pull` fails with a 500.
      if (existsSync(join(root, ".git"))) {
        const gitExe = (await resolveCommand("git")) || "git";
        const { stdout: pullOut } = await execFileP(gitExe, ["pull", "origin", "main"], { cwd: root, timeout: 30000, windowsHide: true });
        const { stdout: installOut } = await execFileP(npmExe, ["install", "--omit=dev"], { cwd: root, ...npmOpts });
        output = `${pullOut}\n${installOut}`;
      } else {
        const { stdout: npmOut } = await execFileP(npmExe, ["install", "-g", "cline-marketplace@latest"], npmOpts);
        output = npmOut;
      }
      res.json({ ok: true, output: output.trim() });
    } catch (err) {
      logger.error(`Update run failed: ${err.message}`);
      res.status(500).json({ ok: false, error: err.message, code: "UPDATE_FAILED" });
    }
  });

  // ---- Stats & Analytics --------------------------------------------------
  router.get("/stats", (req, res) => {
    const cat = loadCatalog() || { entries: [] };
    const meta = readJson(META_PATH, {});
    const installed = loadInstalled();

    const byAuthor = new Map();
    for (const e of cat.entries || []) {
      const a = e.author?.name || "Unknown";
      byAuthor.set(a, (byAuthor.get(a) || 0) + 1);
    }
    const topAuthors = [...byAuthor.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    const tagCounts = new Map();
    for (const e of cat.entries || []) {
      if (Array.isArray(e.tags)) {
        for (const t of e.tags) {
          if (t && typeof t === "string") {
            tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
          }
        }
      }
    }
    const byTag = Array.from(tagCounts.entries())
      .map(([id, count]) => ({ id, label: id, count }))
      .sort((a, b) => b.count - a.count);

    const now = Date.now();
    const freshness = { "<7d": 0, "7-30d": 0, "30-90d": 0, "90-365d": 0, ">1y": 0, unknown: 0 };
    for (const e of cat.entries || []) {
      const m = meta[`${e.type}:${e.id}`];
      if (!m || !m.committedAt) freshness.unknown++;
      else {
        const age = (now - new Date(m.committedAt).getTime()) / 86400000;
        if (age < 7) freshness["<7d"]++;
        else if (age < 30) freshness["7-30d"]++;
        else if (age < 90) freshness["30-90d"]++;
        else if (age < 365) freshness["90-365d"]++;
        else freshness[">1y"]++;
      }
    }

    const detected = Object.values(installed.items || {}).filter((it) => it.detected);
    const installedByType = { plugin: 0, skill: 0, mcp: 0 };
    for (const it of detected) {
      if (installedByType[it.type] !== undefined) installedByType[it.type]++;
    }

    res.json({
      total: cat.counts?.total ?? cat.entries?.length ?? 0,
      byType: cat.counts || { plugins: 0, skills: 0, mcps: 0 },
      byTag,
      topAuthors,
      freshness,
      installed: { total: detected.length, byType: installedByType },
    });
  });

  // ---- Changelog & Diffing -------------------------------------------------
  router.get("/changelog", (req, res) => {
    const cur = loadCatalog();
    const prev = readJson(PREV_CATALOG_PATH, null);
    const meta = readJson(META_PATH, {});

    // Recent releases / additions feed synthesized with commit metadata
    const allEntries = (cur?.entries || []).map((e) => {
      const key = e.key || `${e.type}:${e.id}`;
      const entryMeta = meta[key];
      return {
        ...e,
        updatedAt: e.updatedAt || entryMeta?.committedAt || null,
        lastCommit: e.lastCommit || (entryMeta ? { sha: entryMeta.sha, committedAt: entryMeta.committedAt, message: entryMeta.message } : null),
      };
    });

    allEntries.sort((a, b) => {
      const timeA = a.updatedAt || a.lastCommit?.committedAt || "1970-01-01";
      const timeB = b.updatedAt || b.lastCommit?.committedAt || "1970-01-01";
      return new Date(timeB) - new Date(timeA);
    });
    const recentReleases = allEntries.slice(0, 25);

    let lastSync = cur?.generatedAt || null;
    if (!lastSync && existsSync(CATALOG_PATH)) {
      try { lastSync = statSync(CATALOG_PATH).mtime.toISOString(); } catch {}
    }

    if (!cur || !prev) {
      return res.json({
        added: [],
        removed: [],
        updated: [],
        recentReleases,
        lastSync,
        catalogTotal: cur?.entries?.length || 0,
      });
    }

    const prevMap = new Map((prev.entries || []).map((e) => [`${e.type}:${e.id}`, e]));
    const curMap = new Map((cur.entries || []).map((e) => [`${e.type}:${e.id}`, e]));
    const added = (cur.entries || []).filter((e) => !prevMap.has(`${e.type}:${e.id}`));
    const removed = (prev.entries || []).filter((e) => !curMap.has(`${e.type}:${e.id}`));
    const updated = [];
    for (const e of cur.entries || []) {
      const p = prevMap.get(`${e.type}:${e.id}`);
      if (!p) continue;
      const a = JSON.stringify({ n: p.name, t: p.tagline, d: p.description, c: p.install?.command });
      const b = JSON.stringify({ n: e.name, t: e.tagline, d: e.description, c: e.install?.command });
      if (a !== b) updated.push({ key: `${e.type}:${e.id}`, before: p, after: e });
    }
    res.json({
      added,
      removed,
      updated,
      recentReleases,
      lastSync,
      catalogTotal: cur.entries?.length || 0,
    });
  });

  // ---- Server Logs Endpoint ------------------------------------------------
  router.get("/logs", (req, res) => {
    const limit = Math.min(200, Math.max(10, Number(req.query.limit || 100)));
    const logs = logger.getRecentLogs(limit);
    res.json({ ok: true, logs });
  });

  // ---- Export / Import Handlers --------------------------------------------
  router.get("/export", (req, res) => {
    const state = loadInstalled();
    const payload = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      installed: Object.values(state.items || {}),
    };
    res.setHeader("Content-Disposition", `attachment; filename="cline-market-export-${Date.now()}.json"`);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(payload, null, 2));
  });

  router.post("/import", async (req, res) => {
    const items = req.body?.installed;
    if (!Array.isArray(items)) {
      return res.status(400).json({ ok: false, error: "Invalid import format. 'installed' array required.", code: "INVALID_PAYLOAD" });
    }
    const state = loadInstalled();
    let added = 0;
    const now = new Date().toISOString();
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      const type = sanitizePrimitiveType(it.type);
      const id = sanitizePrimitiveId(it.id);
      if (!type || !id) continue;

      const key = `${type}:${id}`;
      if (!state.items[key]) {
        state.items[key] = {
          type,
          id,
          scope: it.scope || "global",
          workspace: it.workspace || null,
          source: "import",
          installedAt: it.installedAt || now,
          lastSeenAt: now,
          installCommand: it.installCommand || null,
          detected: false,
        };
        added++;
      }
    }
    const reconciled = reconcile(state, fsProbe());
    await saveInstalled(reconciled);
    res.json({ ok: true, added, total: Object.keys(reconciled.items).length });
  });

  router.get("/version", (req, res) => {
    const pkg = readJson(join(root, "package.json"), { version: "1.0.0" });
    res.json({ version: pkg.version, app: "cline-marketplace" });
  });

  router.post("/shutdown", (req, res) => {
    res.json({ ok: true, message: "Shutting down local server gracefully..." });
    setTimeout(() => { process.exit(0); }, 500);
  });

  // 404 Handler for undefined /api routes
  router.use((req, res) => {
    res.status(404).json({
      ok: false,
      error: `Endpoint not found: ${req.method} ${req.originalUrl || req.url}`,
      code: "NOT_FOUND",
    });
  });

  return router;
}
