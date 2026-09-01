// Integrity verification for skills-lock.json (audit 02-deteccion-estado #3).
// The lock file declares a SHA-256 `computedHash` per skill but nothing ever
// recomputed or compared it. This module recomputes the hash of each locked
// skill's content and reports drift.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * @param {string} content
 * @returns {string} lowercase hex SHA-256
 */
export function sha256Hex(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Resolves the first existing local candidate path for a locked skill.
 * Candidates, in order: `entry.localPath` (explicit), the raw `skillPath`
 * relative to rootDir, and the conventional install locations
 * `.agents/skills/<id>/<basename>` and `skills/<id>/<basename>`.
 * @param {{ id?: string, localPath?: string, skillPath?: string, source?: string }} entry
 * @param {string} rootDir
 * @returns {string|null}
 */
export function resolveLocalSkillPath(entry, rootDir) {
  if (!entry || typeof entry !== "object") return null;
  const candidates = [];
  if (typeof entry.localPath === "string" && entry.localPath) {
    candidates.push(join(rootDir, entry.localPath));
  }
  if (typeof entry.skillPath === "string" && entry.skillPath) {
    candidates.push(join(rootDir, entry.skillPath));
    const base = entry.skillPath.split(/[\\/]/).pop();
    const name = entry.id || (typeof entry.source === "string" ? entry.source.split("/").pop() : null);
    if (base && name) {
      candidates.push(join(rootDir, ".agents", "skills", name, base));
      candidates.push(join(rootDir, "skills", name, base));
    }
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Verifies every entry of a parsed skills-lock.json.
 * @param {any} lock Parsed lock file content.
 * @param {{ rootDir?: string, readSkill?: (entry: object) => string|null }} [opts]
 *   `readSkill` injects the skill content for testing; defaults to reading the
 *   locally resolved file.
 * @returns {{ ok: boolean, results: Array<{ id: string, skillPath: string|null, status: "ok"|"mismatch"|"missing"|"invalid", expected: string|null, actual: string|null }>, error: string|null }}
 */
export function verifySkillsLock(lock, opts = {}) {
  const rootDir = opts.rootDir || process.cwd();
  const readSkill =
    opts.readSkill ||
    ((entry) => {
      const path = resolveLocalSkillPath(entry, rootDir);
      return path ? readFileSync(path, "utf8") : null;
    });

  const skills = lock && typeof lock === "object" ? lock.skills : null;
  if (!skills || typeof skills !== "object" || Array.isArray(skills)) {
    return { ok: false, results: [], error: "skills-lock invalido: falta el mapa 'skills'" };
  }

  const results = [];
  for (const [id, entry] of Object.entries(skills)) {
    const skillEntry = { id, ...(entry && typeof entry === "object" ? entry : {}) };
    const expected = typeof entry?.computedHash === "string" && entry.computedHash ? entry.computedHash.toLowerCase() : null;
    if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
      results.push({ id, skillPath: entry?.skillPath ?? null, status: "invalid", expected, actual: null });
      continue;
    }
    let content = null;
    try {
      content = readSkill(skillEntry);
    } catch (err) {
      results.push({ id, skillPath: entry?.skillPath ?? null, status: "missing", expected, actual: `read error: ${err?.message || err}` });
      continue;
    }
    const actual = typeof content === "string" ? sha256Hex(content) : null;
    const status = actual === null ? "missing" : actual === expected ? "ok" : "mismatch";
    results.push({ id, skillPath: entry?.skillPath ?? null, status, expected, actual });
  }

  return { ok: results.length > 0 && results.every((r) => r.status === "ok"), results, error: null };
}
