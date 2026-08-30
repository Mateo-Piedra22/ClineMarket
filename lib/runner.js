// CLI command executor with concurrency serialization and defensive timeouts

import { spawn } from "node:child_process";
import { resolveCommand } from "../scripts/lib/resolve-command.mjs";
import { isWindowsBatchShim, sanitizeWorkspacePath } from "./sanitizers.js";
import { logger } from "./logger.js";

let _cachedClinePath = null;
let _commandLock = Promise.resolve();

/**
 * Resolves the absolute path to the cline executable.
 * @returns {Promise<string|null>}
 */
export async function resolveCline() {
  if (_cachedClinePath) return _cachedClinePath;
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

      const timer = setTimeout(() => {
        killed = true;
        try { proc.kill("SIGTERM"); } catch {}
        rejectRun(new Error(`Command timed out after ${timeoutMs / 1000}s: ${cmdStr}`));
      }, timeoutMs);

      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.stderr.on("data", (d) => { stderr += d.toString(); });

      proc.on("error", (err) => {
        clearTimeout(timer);
        rejectRun(new Error(`Spawn error: ${err.message}`));
      });

      proc.on("close", (code) => {
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
