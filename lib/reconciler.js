// State reconciler and drift detection engine

/**
 * Reconciles tracked state against live filesystem probe.
 * Returns a clean, immutable state object.
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
      if (info?.config) {
        nextItems[key].config = info.config;
      }
    }
  }

  // Detect drift for previously tracked items
  for (const [key, item] of Object.entries(nextItems)) {
    const [type, id] = key.split(":");
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
