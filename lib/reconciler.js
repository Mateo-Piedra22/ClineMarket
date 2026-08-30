// State reconciler and drift detection engine

/**
 * Reconciles tracked state against live filesystem probe.
 * @param {{ items: Object }} state
 * @param {{ found: { plugins: Map, skills: Map, mcps: Map } }} probe
 * @returns {{ items: Object }}
 */
export function reconcile(state, probe) {
  const now = new Date().toISOString();

  // Merge discovered items
  for (const [type, map] of Object.entries(probe.found)) {
    const singleType = type === "plugins" ? "plugin" : type === "skills" ? "skill" : "mcp";
    for (const [id, info] of map.entries()) {
      const key = `${singleType}:${id}`;
      if (!state.items[key]) {
        state.items[key] = {
          type: singleType,
          id,
          source: "filesystem",
          installedAt: now,
          lastSeenAt: now,
          installCommand: null,
          detected: true,
        };
      }
      state.items[key].detected = true;
      state.items[key].lastSeenAt = now;
      if (info.config) state.items[key].config = info.config;
    }
  }

  // Detect drift for previously tracked items
  for (const key of Object.keys(state.items)) {
    const [type, id] = key.split(":");
    let stillThere = false;
    if (type === "plugin") stillThere = probe.found.plugins.has(id);
    else if (type === "skill") stillThere = probe.found.skills.has(id);
    else if (type === "mcp") stillThere = probe.found.mcps.has(id);
    state.items[key].detected = stillThere;
  }

  return state;
}
