// State persistence and atomic storage engine with concurrent write serialization

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync, copyFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { logger } from "./logger.js";

// In-memory queue to serialize writes to the same file path
const _writeQueues = new Map();

/**
 * Resolves the active persistence directory, respecting environment overrides.
 * Precedence: CLINEMARKET_DATA_DIR -> DATA_DIR -> join(defaultRoot, "data")
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
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          renameSync(tmp, canonicalPath);
          renamed = true;
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 15 * (attempt + 1)));
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

  _writeQueues.set(canonicalPath, currentOp.catch(() => {}));
  return currentOp;
}
