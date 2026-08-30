#!/usr/bin/env node
// Smoke test for Cline Marketplace backend and CLI integration.
// Automatically connects to any active local server or starts a temporary instance.

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCommand } from "./lib/resolve-command.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function findActiveServerUrl() {
  for (let port = 5173; port <= 5185; port++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) return `http://127.0.0.1:${port}`;
    } catch {}
  }
  return null;
}

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

async function main() {
  let spawnedServer = null;
  let activeUrl = await findActiveServerUrl();

  if (!activeUrl) {
    console.log("==> Starting temporary server instance on 127.0.0.1:5173...");
    spawnedServer = spawn(process.execPath, [join(root, "server.js")], {
      cwd: root,
      stdio: "ignore",
      windowsHide: true,
    });

    for (let i = 0; i < 30; i++) {
      await sleep(250);
      activeUrl = await findActiveServerUrl();
      if (activeUrl) break;
    }

    if (!activeUrl) {
      if (spawnedServer) { try { spawnedServer.kill(); } catch {} }
      throw new Error("Could not start temporary server for smoke tests");
    }
  }

  const BASE = activeUrl;

  try {
    console.log("==> Testing Command Resolver");
    const cline = await resolveCommand("cline");
    const gh = await resolveCommand("gh");
    console.log("  cline resolved to:", cline || "NOT FOUND");
    console.log("  gh resolved to:", gh || "NOT FOUND");

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
      console.log(`  [${c.ok ? "✓" : "✗"}] ${c.name}: ${c.detail || c.error}`);
    }

    console.log("\n==> Testing /api/installed");
    const installed = await getJson(`${BASE}/api/installed`);
    const installedCount = Object.keys(installed.items || {}).length;
    const detectedCount = Object.values(installed.items || {}).filter((i) => i.detected).length;
    console.log(`  installed items: ${installedCount} total (${detectedCount} active on disk)`);

    const sampleItems = Object.entries(installed.items || {}).slice(0, 8);
    for (const [key, it] of sampleItems) {
      console.log(`    - ${key} (source: ${it.source || "unknown"})`);
    }

    console.log("\n==> Testing /api/catalog");
    const catalog = await getJson(`${BASE}/api/catalog`);
    console.log(`  catalog total: ${catalog.counts.total} (marketplace: ${catalog.counts.marketplace}, local: ${catalog.counts.local})`);
    console.log(`  breakdown: ${catalog.counts.plugins} plugins, ${catalog.counts.skills} skills, ${catalog.counts.mcps} mcps`);

    // Spot-check plugin:goal or local custom entries
    const localGoal = catalog.entries.find((e) => e.id === "goal");
    if (localGoal) {
      console.log(`  spot check goal entry: OK (install command: ${localGoal.install?.command})`);
    }
    console.log(`  local custom entries synthesized: ${catalog.counts.local}`);

    if (catalog.counts.local > 0) {
      const sampleLocal = catalog.entries.find((e) => e.isLocal);
      console.log(`  sample local entry: ${sampleLocal.key} -> ${sampleLocal.name}`);
    }

    console.log("\n==> ALL SMOKE TESTS PASSED!\n");
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