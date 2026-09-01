// State reconciler and drift detection engine

import { sanitizeMcpConfig } from "./sanitizers.js";

/**
 * Reconciles tracked state against live filesystem probe.
 * Returns a new top-level state object (shallow-copied items; audit #24
 * documents that nested objects may be shared with the previous state).
 * MCP configs are redacted to a safe subset before persistence (audit #2).
 * @param {{ items?: Record<string, any> }} state
 * @param {{ found: { plugins: Map<string, any>, skills: Map<string, any>, mcps: Map<string, any> } }} probe
 * @returns {{ items: Record<string, any> }}
 */
export function reconcile(state, probe) {
  const nextItems = { ...(state?.items || {}) };
  const now = new Date().toISOString();

  if (!probe || !probe.found) {
    return { items: nextItems };
  }

  // Merge discovered items
  for (const [type, map] of Object.entries(probe.found)) {
    const singleType = type === "plugins" ? "plugin" : type === "skills" ? "skill" : "mcp";
    for (const [id, info] of map.entries()) {
      const key = `${singleType}:${id}`;
      if (!nextItems[key]) {
        nextItems[key] = {
          type: singleType,
          id,
          source: "filesystem",
          installedAt: now,
          lastSeenAt: now,
          installCommand: null,
          detected: true,
        };
      } else {
        nextItems[key] = {
          ...nextItems[key],
          detected: true,
          lastSeenAt: now,
        };
      }
      // Audit #2 (High): never persist raw MCP configs. `env` and
      // credential-bearing `headers` are dropped; only the safe connection
      // shape {command, args, url, transport} survives. Invalid configs are
      // omitted entirely instead of persisted unchecked.
      if (info?.config && singleType === "mcp") {
        const safeConfig = sanitizeMcpConfig(info.config);
        if (safeConfig) {
          nextItems[key].config = safeConfig;
        } else {
          delete nextItems[key].config;
        }
      } else if (info?.config) {
        nextItems[key].config = info.config;
      }
    }
  }

  // Detect drift for previously tracked items.
  // Audit #17 (Low): ids may legitimately contain ":" (valid in POSIX/macOS
  // directory names); destructuring `key.split(":")` silently dropped the
  // tail. Split on the FIRST separator only via indexOf/slice.
  for (const [key, item] of Object.entries(nextItems)) {
    const sepIdx = key.indexOf(":");
    const type = sepIdx === -1 ? key : key.slice(0, sepIdx);
    const id = sepIdx === -1 ? "" : key.slice(sepIdx + 1);
    let stillThere = false;
    if (type === "plugin") stillThere = probe.found.plugins?.has(id) ?? false;
    else if (type === "skill") stillThere = probe.found.skills?.has(id) ?? false;
    else if (type === "mcp") stillThere = probe.found.mcps?.has(id) ?? false;

    nextItems[key] = {
      ...item,
      detected: Boolean(stillThere),
    };
  }

  return { items: nextItems };
}
