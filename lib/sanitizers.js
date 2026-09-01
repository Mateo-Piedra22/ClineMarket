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
 * Redacts an MCP server config down to a safe, persistable subset.
 * Audit #2 (High): `env` and credential-bearing `headers` must never reach
 * disk or the API; only the connection shape {command, args, url, transport}
 * is kept. Returns null when the input is not a plain config object.
 * @param {any} config
 * @returns {Record<string, any>|null}
 */
const MCP_CONFIG_ALLOWED_KEYS = ["command", "args", "url", "transport"];

export function sanitizeMcpConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const out = {};
  for (const key of MCP_CONFIG_ALLOWED_KEYS) {
    const value = config[key];
    if (value === undefined || value === null) continue;
    if (key === "args") {
      if (!Array.isArray(value)) continue;
      const cleanArgs = value.filter((a) => typeof a === "string" || typeof a === "number" || typeof a === "boolean");
      if (cleanArgs.length > 0) out.args = cleanArgs;
      continue;
    }
    if (typeof value === "string" && value.trim() !== "") out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
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
