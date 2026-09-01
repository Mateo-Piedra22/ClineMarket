// State persistence and atomic storage engine with concurrent write serialization

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync, copyFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { logger } from "./logger.js";

// In-memory queue to serialize writes to the same file path
const _writeQueues = new Map();

/**
 * Resolves the active persistence directory, respecting environment overrides.
 * Precedence: CLINEMARKET_DATA_DIR -> DATA_DIR -> join(defaultRoot, "data")
 * Audit #22 (Low): `DATA_DIR` is a generic, collision-prone name and is
 * DEPRECATED. `CLINEMARKET_DATA_DIR` is the supported override; the bare
 * `DATA_DIR` fallback is kept only for backwards compatibility (it is still
 * asserted by scripts/unit-test.mjs and read by server.js).
 * @param {string} [defaultRoot=process.cwd()]
 * @returns {string}
 */
export function getDataDir(defaultRoot = process.cwd()) {
  const custom = process.env.CLINEMARKET_DATA_DIR || process.env.DATA_DIR;
  if (custom) return resolve(custom);
  return join(defaultRoot || process.cwd(), "data");
}

/**
 * Reads a JSON file safely with fallback on missing or corrupted files.
 * If file exists but is corrupted, creates a backup quarantine file.
 * @param {string} p
 * @param {any} fallback
 * @returns {any}
 */
export function readJson(p, fallback = null) {
  try {
    if (!existsSync(p)) return fallback;
    const content = readFileSync(p, "utf8");
    return JSON.parse(content);
  } catch (err) {
    logger.warn(`Failed reading JSON from ${p}: ${err.message}`);
    if (existsSync(p)) {
      try {
        const corruptBackup = `${p}.corrupt.${Date.now()}`;
        copyFileSync(p, corruptBackup);
        logger.error(`Quarantine backup created for corrupt JSON file: ${corruptBackup}`);
      } catch (backupErr) {
        logger.error(`Failed to create quarantine backup: ${backupErr.message}`);
      }
    }
    return fallback;
  }
}

/**
 * Atomically writes data to a JSON file using temporary file and rename.
 * Serializes writes using an in-memory Promise chain per canonical file path to prevent race conditions.
 * @param {string} p
 * @param {any} data
 */
export async function safeWriteJson(p, data) {
  const canonicalPath = resolve(p);
  const dir = dirname(canonicalPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const previousOp = _writeQueues.get(canonicalPath) || Promise.resolve();

  const currentOp = previousOp.then(async () => {
    const tmp = `${canonicalPath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
      let renamed = false;
      let lastErr = null;
      // Audit #4 (High): the data dir may live inside OneDrive; external sync
      // handles keep files open for seconds. Exponential backoff 50ms * 2^n,
      // 6 attempts (worst case ~3.1s of waiting) instead of 3 fixed 15/30ms.
      // NOTE (audit #4): a cross-process lockfile (O_EXCL) was evaluated but
      // deliberately NOT added: it adds a stale-lock recovery problem without
      // a dependency-free clean solution for OneDrive-synced dirs; the queue
      // below already serializes intra-process writers and the backoff covers
      // the observed transient EPERM window.
      const MAX_ATTEMPTS = 6;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          renameSync(tmp, canonicalPath);
          renamed = true;
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < MAX_ATTEMPTS - 1) {
            await new Promise((r) => setTimeout(r, 50 * Math.pow(2, attempt)));
          }
        }
      }
      if (!renamed && lastErr) throw lastErr;
    } catch (err) {
      logger.error(`Atomic write failed for ${canonicalPath}: ${err.message}`);
      try { if (existsSync(tmp)) unlinkSync(tmp); } catch {}
      throw err;
    }
  });

  // Audit #21 (Low): completed entries were retained in the map forever,
  // leaking one settled promise per written path. Drop the entry once it is
  // the tail of the queue and has settled.
  const queued = currentOp.catch(() => {});
  queued.then(() => {
    if (_writeQueues.get(canonicalPath) === queued) _writeQueues.delete(canonicalPath);
  });
  _writeQueues.set(canonicalPath, queued);
  return currentOp;
}
