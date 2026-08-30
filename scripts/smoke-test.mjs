#!/usr/bin/env node
// Smoke test for Cline Marketplace backend and CLI integration.

import { resolveCommand } from "./lib/resolve-command.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:5173";

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

async function main() {
  console.log("==> Testing Command Resolver");
  const cline = await resolveCommand("cline");
  const gh = await resolveCommand("gh");
  console.log("  cline resolved to:", cline || "null");
  console.log("  gh resolved to:", gh || "null");

  console.log("\n==> Testing /api/status");
  const status = await getJson(`${BASE}/api/status`);
  console.log("  node:", status.node);
  console.log("  platform:", status.platform);
  console.log("  clinePath:", status.clinePath);
  console.log("  installedCount:", status.installedCount);

  console.log("\n==> Testing /api/health");
  const health = await getJson(`${BASE}/api/health`);
  console.log("  health ok:", health.ok);
  for (const c of health.checks) {
    console.log(`  [${c.ok ? "✓" : "✗"}] ${c.name}: ${c.detail || c.error || "ok"}`);
  }

  console.log("\n==> Testing /api/installed");
  const installed = await getJson(`${BASE}/api/installed`);
  const itemKeys = Object.keys(installed.items);
  const detectedKeys = itemKeys.filter((k) => installed.items[k].detected);
  console.log(`  installed items: ${itemKeys.length} total (${detectedKeys.length} active on disk)`);
  for (const k of detectedKeys.slice(0, 8)) {
    console.log("    -", k, `(source: ${installed.items[k].source})`);
  }

  console.log("\n==> Testing /api/catalog");
  const catalog = await getJson(`${BASE}/api/catalog`);
  console.log(`  catalog total: ${catalog.counts.total} (marketplace: ${catalog.counts.marketplace}, local: ${catalog.counts.local})`);
  console.log(`  breakdown: ${catalog.counts.plugins} plugins, ${catalog.counts.skills} skills, ${catalog.counts.mcps} mcps`);

  // Spot check: a known catalog entry
  const goal = catalog.entries.find((e) => e.id === "goal");
  if (!goal) throw new Error("goal entry missing from catalog");
  console.log("  spot check goal entry: OK (install command:", goal.install?.command, ")");

  // Spot check: local custom entries present
  const localItems = catalog.entries.filter((e) => e.isLocal);
  console.log(`  local custom entries synthesized: ${localItems.length}`);
  if (localItems.length > 0) {
    console.log("  sample local entry:", localItems[0].key, "->", localItems[0].name);
  }

  console.log("\n==> ALL SMOKE TESTS PASSED!");
}

main().catch((err) => {
  console.error("\nFAIL:", err.message);
  process.exit(1);
});