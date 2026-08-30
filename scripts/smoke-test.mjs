#!/usr/bin/env node
// Smoke test for Cline Marketplace backend and CLI integration.
// Automatically connects to any active local server or starts a temporary instance.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCommand } from "../lib/resolver.js";

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
  assert.strictEqual(r.ok, true, `GET ${url} should return 200 OK (received ${r.status})`);
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
    assert.ok(status.node, "status.node must exist");
    assert.ok(status.platform, "status.platform must exist");
    assert.strictEqual(typeof status.installedCount, "number", "status.installedCount must be a number");
    assert.ok(Array.isArray(status.storageRoots), "status.storageRoots must be an array");
    console.log("  node:", status.node, "platform:", status.platform, "uptime:", status.uptime, "s");

    console.log("\n==> Testing /api/health");
    const health = await getJson(`${BASE}/api/health`);
    assert.ok(Array.isArray(health.checks), "health.checks must be an array");
    assert.ok(health.checks.length >= 4, "health.checks must have at least 4 items");
    for (const c of health.checks) {
      assert.ok(c.name, "check must have a name");
      console.log(`  [${c.ok ? "✓" : "✗"}] ${c.name}: ${c.detail || c.error}`);
    }

    console.log("\n==> Testing /api/installed");
    const installed = await getJson(`${BASE}/api/installed`);
    assert.ok(installed && typeof installed.items === "object", "installed.items must be an object");
    const installedCount = Object.keys(installed.items).length;
    const detectedCount = Object.values(installed.items).filter((i) => i.detected).length;
    console.log(`  installed items: ${installedCount} total (${detectedCount} active on disk)`);

    console.log("\n==> Testing /api/catalog");
    const catalog = await getJson(`${BASE}/api/catalog`);
    assert.ok(catalog.counts, "catalog.counts must exist");
    assert.ok(catalog.counts.total > 0, "catalog total count must be greater than 0");
    assert.ok(Array.isArray(catalog.tags), "catalog.tags must be an array");
    assert.ok(Array.isArray(catalog.entries), "catalog.entries must be an array");
    console.log(`  catalog total: ${catalog.counts.total} (marketplace: ${catalog.counts.marketplace}, local: ${catalog.counts.local})`);

    console.log("\n==> Testing /api/context");
    const context = await getJson(`${BASE}/api/context`);
    assert.ok(context.cwd, "context.cwd must exist");
    assert.ok(Array.isArray(context.languages), "context.languages must be an array");
    assert.ok(Array.isArray(context.recommended), "context.recommended must be an array");
    console.log(`  context languages: ${context.languages.join(", ") || "none"}, recommended count: ${context.recommended.length}`);

    console.log("\n==> Testing /api/stats");
    const stats = await getJson(`${BASE}/api/stats`);
    assert.strictEqual(typeof stats.total, "number", "stats.total must be a number");
    assert.ok(Array.isArray(stats.topAuthors), "stats.topAuthors must be an array");
    assert.ok(Array.isArray(stats.byTag), "stats.byTag must be an array");
    assert.ok(stats.freshness, "stats.freshness must exist");
    console.log(`  stats total: ${stats.total}, top authors: ${stats.topAuthors.length}, tags: ${stats.byTag.length}`);

    console.log("\n==> Testing /api/changelog");
    const changelog = await getJson(`${BASE}/api/changelog`);
    assert.ok(Array.isArray(changelog.added), "changelog.added must be an array");
    assert.ok(Array.isArray(changelog.removed), "changelog.removed must be an array");
    assert.ok(Array.isArray(changelog.updated), "changelog.updated must be an array");
    console.log(`  changelog added: ${changelog.added.length}, removed: ${changelog.removed.length}, updated: ${changelog.updated.length}`);

    console.log("\n==> Testing /api/export");
    const exportData = await getJson(`${BASE}/api/export`);
    assert.strictEqual(exportData.version, "1.0.0", "export version must be 1.0.0");
    assert.ok(Array.isArray(exportData.installed), "exportData.installed must be an array");
    console.log(`  export records: ${exportData.installed.length}`);

    console.log("\n==> ALL SMOKE TESTS PASSED WITH STRICT ASSERTIONS!\n");
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