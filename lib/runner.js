// CLI command executor with concurrency serialization and defensive timeouts

import { spawn, exec } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { resolveCommand } from "./resolver.js";
import { isWindowsBatchShim, sanitizeWorkspacePath } from "./sanitizers.js";
import { logger } from "./logger.js";

const isWin = platform() === "win32";
const MAX_BUFFER = 5 * 1024 * 1024; // 5MB buffer limit

let _cachedClinePath = null;
let _commandLock = Promise.resolve();

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
 * @param {import("node:child_process").ChildProcess} proc
 */
function killProcessTree(proc) {
  if (!proc || !proc.pid) return;
  if (isWin) {
    exec(`taskkill /pid ${proc.pid} /T /F`, { windowsHide: true }, () => {});
  } else {
    try {
      proc.kill("SIGTERM");
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
      }, 2000);
    } catch {}
  }
}

/**
 * Runs a cline CLI command in a serialized queue with defensive timeout.
 * @param {string[]} args
 * @param {{ timeoutMs?: number, cwd?: string }} options
 * @returns {Promise<{ code: number, stdout: string, stderr: string, durationMs: number }>}
 */
export async function runCline(args, { timeoutMs = 180_000, cwd = process.cwd() } = {}) {
  const exe = await resolveCline();
  if (!exe) {
    throw new Error("The 'cline' CLI was not found on PATH. Install it from https://docs.cline.bot");
  }

  const isBatch = isWindowsBatchShim(exe);
  const targetCwd = sanitizeWorkspacePath(cwd);
  const cmdStr = `cline ${args.join(" ")}`;

  const runOperation = async () => {
    const startTime = Date.now();

    return new Promise((resolveRun, rejectRun) => {
      let proc;
      try {
        if (isBatch) {
          proc = spawn(exe, args, {
            cwd: targetCwd,
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
            shell: true,
          });
        } else {
          proc = spawn(exe, args, {
            cwd: targetCwd,
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
          });
        }
      } catch (err) {
        rejectRun(new Error(`Failed to spawn 'cline': ${err.message}`));
        return;
      }

      let stdout = "";
      let stderr = "";
      let killed = false;
      let settled = false;

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
        if (stdout.length < MAX_BUFFER) stdout += d.toString();
      });
      proc.stderr.on("data", (d) => {
        if (stderr.length < MAX_BUFFER) stderr += d.toString();
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
