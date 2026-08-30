// Input validation and sanitization guards

import { existsSync, statSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Validates and normalizes primitive identifiers against path traversal and malicious characters.
 * @param {any} id
 * @returns {string|null} Sanitized ID or null if invalid
 */
export function sanitizePrimitiveId(id) {
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 128) return null;
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) return null;
  if (!/^[a-zA-Z0-9@_.-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validates and normalizes primitive types.
 * @param {any} type
 * @returns {"plugin"|"skill"|"mcp"|null}
 */
export function sanitizePrimitiveType(type) {
  if (typeof type !== "string") return null;
  const t = type.toLowerCase().trim();
  if (["plugin", "skill", "mcp"].includes(t)) return t;
  return null;
}

/**
 * Validates that a workspace path exists and is a valid directory.
 * @param {any} rawPath
 * @param {string} fallback
 * @returns {string} Absolute resolved directory path
 */
export function sanitizeWorkspacePath(rawPath, fallback = process.cwd()) {
  if (typeof rawPath !== "string" || !rawPath.trim()) return fallback;
  try {
    const resolved = resolve(rawPath.trim());
    if (existsSync(resolved)) {
      const real = realpathSync(resolved);
      const st = statSync(real);
      if (st.isDirectory()) return real;
    }
  } catch {}
  return fallback;
}

/**
 * Determines if an executable is a Windows CMD/BAT shim.
 * @param {string} p
 * @returns {boolean}
 */
export function isWindowsBatchShim(p) {
  if (!p || typeof p !== "string") return false;
  const lower = p.toLowerCase();
  return lower.endsWith(".cmd") || lower.endsWith(".bat");
}
