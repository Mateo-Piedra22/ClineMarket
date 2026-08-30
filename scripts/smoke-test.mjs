#!/usr/bin/env node
// Smoke test for Cline Marketplace backend and CLI integration.
// Automatically starts a temporary server if none is currently active.

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCommand } from "./lib/resolve-command.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const BASE = process.env.BASE || "http://127.0.0.1:5173";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function isServerRunning(url) {
  try {
    const res = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

async function main() {
  let spawnedServer = null;
  const running = await isServerRunning(BASE);

  if (!running) {
    console.log("==> Starting temporary server instance on 127.0.0.1:5173...");
    spawnedServer = spawn(process.execPath, [join(root, "server.js")], {
      cwd: root,
      stdio: "ignore",
      windowsHide: true,
    });

    let ready = false;
    for (let i = 0; i < 30; i++) {
      await sleep(250);
      if (await isServerRunning(BASE)) { ready = true; break; }
    }

    if (!ready) {
      if (spawnedServer) { try { spawnedServer.kill(); } catch {} }
      throw new Error("Could not start temporary server for smoke tests");
    }
  }

  try {
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
  } finally {
    if (spawnedServer) {
      try { spawnedServer.kill(); } catch {}
    }
  }
}

main().catch((err) => {
  console.error("\nFAIL:", err.message);
  process.exit(1);
});