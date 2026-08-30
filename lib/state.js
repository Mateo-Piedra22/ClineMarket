// State persistence and atomic storage engine with concurrent write serialization

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { logger } from "./logger.js";

// In-memory queue to serialize writes to the same file path
const _writeQueues = new Map();

/**
 * Reads a JSON file safely with fallback on missing or corrupted files.
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
    return fallback;
  }
}

/**
 * Atomically writes data to a JSON file using temporary file and rename.
 * Serializes writes using an in-memory Promise chain per file to prevent race conditions.
 * @param {string} p
 * @param {any} data
 */
export async function safeWriteJson(p, data) {
  const dir = dirname(p);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const previousOp = _writeQueues.get(p) || Promise.resolve();

  const currentOp = previousOp.then(async () => {
    const tmp = `${p}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
      renameSync(tmp, p);
    } catch (err) {
      logger.error(`Atomic write failed for ${p}: ${err.message}`);
      try { if (existsSync(tmp)) unlinkSync(tmp); } catch {}
      throw err;
    }
  });

  _writeQueues.set(p, currentOp.catch(() => {}));
  return currentOp;
}
