import { spawn, exec } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { platform, homedir } from "node:os";
import { dirname, join, delimiter, resolve } from "node:path";
import { resolveCommand } from "./resolver.js";
import { isWindowsBatchShim, sanitizeWorkspacePath } from "./sanitizers.js";
import { logger } from "./logger.js";

const isWin = platform() === "win32";
const MAX_BUFFER = 5 * 1024 * 1024; // 5MB buffer limit

let _cachedClinePath = null;
let _commandLock = Promise.resolve();
const _shimScriptCache = new Map();

/**
 * Extrae la ruta al JS real apuntado por un shim .cmd/.bat de npm (C4-02).
 * Permite hacer spawn(process.execPath, [shimJs, ...args]) con shell: false
 * instead of running the wrapper via cmd.exe.
 * @param {string} shimPath Absolute path to the .cmd/.bat shim
 * @returns {string|null} Ruta absoluta al entry JS, o null si no se puede resolver
 */
export function resolveShimScript(shimPath) {
  if (!isWindowsBatchShim(shimPath) || !existsSync(shimPath)) return null;
  if (_shimScriptCache.has(shimPath)) return _shimScriptCache.get(shimPath);

  let resolved = null;
  try {
    const content = readFileSync(shimPath, "utf8");
    const shimDir = dirname(shimPath);
    const candidates = [];
    const pushCandidate = (raw) => {
      if (!raw) return;
      const expanded = raw.replace(/%~dp0|%dp0%/gi, shimDir).replace(/"/g, "").trim();
      if (expanded && /\.([cm]?js)$/i.test(expanded)) candidates.push(expanded);
    };
    // 1. Tokens entre comillas (formato shim npm: "%dp0%\node_modules\pkg\bin.js")
    for (const m of content.matchAll(/"([^"\r\n]+)"/g)) pushCandidate(m[1]);
    // 2. Bare tokens (non-standard wrappers)
    for (const m of content.matchAll(/[^\s"&|<>(),;]+/g)) pushCandidate(m[0]);

    for (const candidate of candidates) {
      try {
        if (existsSync(candidate)) {
          resolved = resolve(candidate);
          break;
        }
        const joined = resolve(shimDir, candidate);
        if (existsSync(joined)) {
          resolved = joined;
          break;
        }
      } catch {}
    }
  } catch {}

  _shimScriptCache.set(shimPath, resolved);
  return resolved;
}

/**
 * Escapes an argument for safe passing via cmd.exe (fallback when the shim
 * is not resolvable to JS). Shell metachars (& | < > ; etc.) are literals
 * inside double quotes; the internal `"` is doubled per cmd.exe convention.
 * @param {string} arg
 * @returns {string}
 */
export function escapeWindowsShellArg(arg) {
  return `"${String(arg).replace(/"/g, '""')}"`;
}

/**
 * C4-04..C4-08: allowlist de variables de entorno seguras para propagar al
 * subprocess. There is NO spread of the full process.env: any key
 * outside this list (including GITHUB_TOKEN, GH_TOKEN, AWS_*, *_PASSWORD,
 * NODE_OPTIONS, etc.) is discarded. NODE_OPTIONS is explicitly excluded:
 * it can execute arbitrary code in any child process.
 */
const ENV_ALLOWLIST_EXACT = [
  "PATH", "Path", "PATHEXT",
  "ComSpec", "SystemRoot", "windir", "SystemDrive",
  "HOMEDRIVE", "HOMEPATH", "USERPROFILE", "USERDOMAIN", "USERNAME",
  "APPDATA", "LOCALAPPDATA", "PROGRAMFILES", "PROGRAMDATA",
  "TEMP", "TMP", "TMPDIR", "HOME",
  "LANG", "LC_ALL", "TERM", "COLORTERM", "NO_COLOR", "FORCE_COLOR",
  "CI", "SHELL",
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy",
];

// C4-04..C4-08: prefijos permitidos (config npm no secreta y config propia del servidor).
const ENV_ALLOWLIST_PREFIXES = ["npm_config_", "CLINEMARKET_"];

/**
 * Filters an environment object against the allowlist (pure, testable function).
 * Any key outside the allowlist (exact or by prefix) is discarded.
 * C4-04..C4-08.
 * @param {NodeJS.ProcessEnv} envObj
 * @param {string[]} [inheritSecrets=[]] extra keys to copy literally (explicit caller opt-in)
 * @returns {NodeJS.ProcessEnv}
 */
export function filterSecretEnvKeys(envObj, inheritSecrets = []) {
  const upperMap = new Map();
  for (const [k, v] of Object.entries(envObj || {})) {
    if (v === undefined) continue;
    if (!upperMap.has(k.toUpperCase())) upperMap.set(k.toUpperCase(), v);
  }

  const out = {};
  for (const key of ENV_ALLOWLIST_EXACT) {
    const value = _lookupEnvValueFrom(key, envObj, upperMap);
    if (value !== undefined) out[key] = value;
  }
  for (const [k, v] of Object.entries(envObj || {})) {
    if (v === undefined) continue;
    if (ENV_ALLOWLIST_PREFIXES.some((p) => k.toLowerCase().startsWith(p.toLowerCase()))) {
      out[k] = v;
    }
  }

  // F9 / C4-04 opt-in: the caller may request extra keys (legitimate secrets)
  // and they are copied literally, without content validation. It is an
  // explicit and auditable caller decision, never implicit.
  for (const key of Array.isArray(inheritSecrets) ? inheritSecrets : []) {
    const value = _lookupEnvValueFrom(String(key), envObj, upperMap);
    if (value !== undefined) out[String(key)] = value;
  }
  return out;
}

function _lookupEnvValueFrom(key, envObj, upperMap) {
  if (envObj && Object.prototype.hasOwnProperty.call(envObj, key)) return envObj[key];
  return upperMap.get(key.toUpperCase());
}

/**
 * Builds a robust execution environment with guaranteed Node & npm PATH.
 * C4-04..C4-08: the child env is built from an ALLOWLIST (see
 * filterSecretEnvKeys) instead of inheriting the whole process.env, so that
 * server credentials (GITHUB_TOKEN, GH_TOKEN, etc.) are not leaked to
 * subprocesses. Calling with no arguments = 100% compatible with existing
 * consumers; `{ inheritSecrets: ["NAME"] }` copies explicit extra keys.
 * @param {{ inheritSecrets?: string[] }} [options]
 * @returns {NodeJS.ProcessEnv}
 */
export function getExecutionEnv(options = {}) {
  const nodeDir = dirname(process.execPath);
  const npmGlobalDir = isWin
    ? join(homedir(), "AppData", "Roaming", "npm")
    : "/usr/local/bin";

  const rawPath = process.env.PATH || process.env.Path || process.env.path || "";
  const parts = rawPath.split(delimiter).filter(Boolean);

  if (!parts.includes(nodeDir)) parts.unshift(nodeDir);
  if (isWin && !parts.includes(npmGlobalDir)) parts.unshift(npmGlobalDir);

  const fullPath = parts.join(delimiter);

  // C4-04..C4-08: env segmentado por allowlist + PATH garantizado.
  const env = filterSecretEnvKeys(process.env, options.inheritSecrets);
  env.PATH = fullPath;
  env.Path = fullPath;
  env.PATHEXT = env.PATHEXT || process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC";

  if (isWin && !env.ComSpec) {
    env.ComSpec = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
  }
  return env;
}

/**
 * Resolves the absolute path to the cline executable.
 * @returns {Promise<string|null>}
 */
export async function resolveCline() {
  if (_cachedClinePath && existsSync(_cachedClinePath)) return _cachedClinePath;
  const p = await resolveCommand("cline");
  if (p) _cachedClinePath = p;
  return p;
}

/**
 * Maps primitive type to CLI verb.
 * @param {string} type
 * @returns {string}
 */
export function verbFor(type) {
  if (type === "skill") return "skill";
  if (type === "mcp") return "mcp";
  return "plugin";
}

/**
 * Force kills a process and all its children.
 * F9: on POSIX, `proc.kill()` only kills the parent and can leave orphans.
 * Since runCline spawns with `detached: true` on POSIX (group leader),
 * we kill the whole group with `process.kill(-pid, ...)`; the fallback
 * `proc.kill()` covers non-leader processes (e.g. if the spawn flags are
 * changed). On Windows, taskkill /T /F already kills the tree (correct).
 * @param {import("node:child_process").ChildProcess} proc
 */
function killProcessTree(proc) {
  if (!proc || !proc.pid) return;
  if (isWin) {
    exec(`taskkill /pid ${proc.pid} /T /F`, { windowsHide: true }, () => {});
  } else {
    // F9: SIGTERM al grupo de procesos completo (pid negativo = grupo).
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {
      try { proc.kill("SIGTERM"); } catch {}
    }
    setTimeout(() => {
      // F9: escalate to SIGKILL of the group after 2s if anything survived.
      try {
        process.kill(-proc.pid, "SIGKILL");
      } catch {
        try { proc.kill("SIGKILL"); } catch {}
      }
    }, 2000);
  }
}

/**
 * Splits an arbitrary chunk stream into complete lines and forwards each one
 * to the given callback (streaming SSE support). Trailing partial lines are
 * flushed when `flush()` is called.
 * @param {(line: string, stream: "stdout"|"stderr") => void} onLine
 * @returns {{ push(chunk: string, stream: "stdout"|"stderr"): void, flush(): void }}
 */
function createLineSplitter(onLine) {
  let pending = "";
  return {
    push(chunk, stream) {
      pending += chunk;
      let idx;
      while ((idx = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, idx).replace(/\r$/, "");
        pending = pending.slice(idx + 1);
        if (line.length > 0) onLine(line, stream);
      }
    },
    flush() {
      if (pending.length > 0) {
        onLine(pending.replace(/\r$/, ""), "stdout");
        pending = "";
      }
    },
  };
}

/**
 * Runs a cline CLI command in a serialized queue with defensive timeout.
 * When `onLine` is provided, every complete stdout/stderr line is forwarded to
 * it in real time (live terminal streaming) while still being accumulated for
 * the final buffered result.
 * @param {string[]} args
 * @param {{ timeoutMs?: number, cwd?: string, onLine?: (line: string, stream: "stdout"|"stderr") => void }} options
 * @returns {Promise<{ code: number, stdout: string, stderr: string, durationMs: number }>}
 */
export async function runCline(args, { timeoutMs = 180_000, cwd = process.cwd(), onLine = null } = {}) {
  const exe = await resolveCline();
  if (!exe) {
    throw new Error("The 'cline' CLI was not found on PATH. Install it from https://docs.cline.bot");
  }

  const isBatch = isWindowsBatchShim(exe);
  const targetCwd = sanitizeWorkspacePath(cwd);
  const cmdStr = `cline ${args.join(" ")}`;
  const spawnEnv = getExecutionEnv();

  // C4-02: nunca ejecutar shims .cmd/.bat con shell:true y args crudos.
  // Resolver el entry JS real y delegar a node; si no es posible, escapar args.
  let spawnFile = exe;
  let spawnArgs = args;
  let useShell = false;
  if (isBatch) {
    const shimJs = resolveShimScript(exe);
    if (shimJs) {
      spawnFile = process.execPath;
      spawnArgs = [shimJs, ...args];
    } else {
      logger.warn(`Could not resolve JS entry from batch shim '${exe}'. Falling back to shell with escaped args.`);
      spawnArgs = args.map(escapeWindowsShellArg);
      useShell = true;
    }
  }

  const runOperation = async () => {
    const startTime = Date.now();

    return new Promise((resolveRun, rejectRun) => {
      let proc;
      try {
        proc = spawn(spawnFile, spawnArgs, {
          cwd: targetCwd,
          env: spawnEnv,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          shell: useShell,
          // F9: on POSIX, detached:true makes the child a group leader so that
          // killProcessTree can kill the whole tree via process.kill(-pid).
          // Not used on Windows: it changes the console behavior.
          // Con stdio pipe, proc.on('close') sigue funcionando; no se llama unref().
          detached: !isWin,
        });
      } catch (err) {
        rejectRun(new Error(`Failed to spawn 'cline': ${err.message}`));
        return;
      }

      let stdout = "";
      let stderr = "";
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let killed = false;
      let settled = false;
      const splitter = onLine ? createLineSplitter((line, stream) => {
        try { onLine(line, stream); } catch {}
      }) : null;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        killed = true;
        killProcessTree(proc);
        const duration = Date.now() - startTime;
        logger.error(`Command timed out after ${timeoutMs / 1000}s: ${cmdStr} (${duration}ms)`);
        rejectRun(new Error(`Command timed out after ${timeoutMs / 1000}s: ${cmdStr}`));
      }, timeoutMs);

      proc.stdout.on("data", (d) => {
        const chunk = d.toString();
        if (splitter) splitter.push(chunk, "stdout");
        if (stdout.length + chunk.length > MAX_BUFFER) {
          if (!stdoutTruncated) {
            stdoutTruncated = true;
            logger.warn(`stdout truncated at ${Math.round(MAX_BUFFER / (1024 * 1024))}MB limit for: ${cmdStr}`);
          }
          stdout += chunk.slice(0, Math.max(0, MAX_BUFFER - stdout.length));
        } else {
          stdout += chunk;
        }
      });
      proc.stderr.on("data", (d) => {
        const chunk = d.toString();
        if (splitter) splitter.push(chunk, "stderr");
        if (stderr.length + chunk.length > MAX_BUFFER) {
          if (!stderrTruncated) {
            stderrTruncated = true;
            logger.warn(`stderr truncated at ${Math.round(MAX_BUFFER / (1024 * 1024))}MB limit for: ${cmdStr}`);
          }
          stderr += chunk.slice(0, Math.max(0, MAX_BUFFER - stderr.length));
        } else {
          stderr += chunk;
        }
      });

      proc.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        rejectRun(new Error(`Spawn error: ${err.message}`));
      });

      proc.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const duration = Date.now() - startTime;
        logger.exec(`${cmdStr} (cwd: ${targetCwd})`, duration, code ?? 0);
        if (splitter) splitter.flush();
        if (!killed) {
          resolveRun({ code: code ?? 0, stdout, stderr, durationMs: duration });
        }
      });
    });
  };

  const queued = _commandLock.then(runOperation, runOperation);
  _commandLock = queued.catch(() => {});
  return queued;
}

/**
 * Streaming variant of runCline. Kept as a named export so route code and
 * tests can express intent explicitly; the buffering semantics of runCline
 * are preserved (the promise resolves only when the process exits).
 * @param {string[]} args
 * @param {{ timeoutMs?: number, cwd?: string, onLine?: (line: string, stream: "stdout"|"stderr") => void }} options
 * @returns {Promise<{ code: number, stdout: string, stderr: string, durationMs: number }>}
 */
export function runClineStreaming(args, options = {}) {
  if (typeof options.onLine !== "function") {
    return Promise.reject(new Error("runClineStreaming requires an onLine callback"));
  }
  return runCline(args, options);
}
