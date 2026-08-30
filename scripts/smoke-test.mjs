#!/usr/bin/env node
// Smoke test for Cline Marketplace backend and CLI integration.
// Runs against an isolated temporary persistence environment.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCommand } from "../lib/resolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Ephemeral persistence directory for smoke tests
const smokeTmpDir = mkdtempSync(join(tmpdir(), "clinemarket-smoke-"));

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function findActiveServerUrl() {
  for (let port = 5173; port <= 5195; port++) {
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

async function postJson(url, body = {}, headers = {}) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "http://127.0.0.1:5173",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, ok: r.ok, json: await r.json() };
}

async function deleteJson(url, headers = {}) {
  const r = await fetch(url, {
    method: "DELETE",
    headers: {
      "Origin": "http://127.0.0.1:5173",
      ...headers,
    },
  });
  return { status: r.status, ok: r.ok, json: await r.json() };
}

async function main() {
  let spawnedServer = null;

  console.log(`==> Initializing isolated test persistence: ${smokeTmpDir}`);
  console.log("==> Starting temporary server instance on 127.0.0.1:5173...");

  spawnedServer = spawn(process.execPath, [join(root, "server.js")], {
    cwd: root,
    env: {
      ...process.env,
      CLINEMARKET_DATA_DIR: smokeTmpDir,
      PORT: process.env.PORT || "5173",
    },
    stdio: "ignore",
    windowsHide: true,
  });

  let activeUrl = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    activeUrl = await findActiveServerUrl();
    if (activeUrl) break;
  }

  if (!activeUrl) {
    if (spawnedServer) {
      try { spawnedServer.kill(); } catch {}
    }
    throw new Error("Could not start temporary server for smoke tests");
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
    assert.strictEqual(health.ok, true, "health.ok must be true");
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
    assert.strictEqual(context.ok, true, "context.ok must be true");
    assert.ok(context.cwd, "context.cwd must exist");
    assert.ok(Array.isArray(context.languages), "context.languages must be an array");
    assert.ok(Array.isArray(context.recommendations), "context.recommendations must be an array");
    assert.ok(Array.isArray(context.bundles), "context.bundles must be an array");
    assert.ok(Array.isArray(context.recommended), "context.recommended must be an array");

    if (context.recommendations.length > 0) {
      for (const rec of context.recommendations) {
        assert.ok(rec.entry, "recommendation must contain entry");
        assert.ok(Array.isArray(rec.reasons), "recommendation reasons must be an array");
        assert.strictEqual(typeof rec.score, "number", "recommendation score must be a number");
        assert.strictEqual(typeof rec.matchPercent, "number", "recommendation matchPercent must be a number");
      }
    }

    if (context.bundles.length > 0) {
      for (const b of context.bundles) {
        assert.ok(b.id, "bundle id must exist");
        assert.ok(b.title, "bundle title must exist");
        assert.ok(b.description, "bundle description must exist");
        assert.ok(Array.isArray(b.items), "bundle items must be an array");
      }
    }
    console.log(`  context languages: ${context.languages.join(", ") || "none"}, recommendations: ${context.recommendations.length}, bundles: ${context.bundles.length}`);

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

    console.log("\n==> Testing /api/settings & /api/workspaces/recent");
    const setRes = await postJson(`${BASE}/api/settings`, { defaultScope: "workspace", themeContrast: "high" });
    assert.strictEqual(setRes.ok, true, "settings update must return ok: true");
    assert.strictEqual(setRes.json.settings.defaultScope, "workspace");

    const wsBad = await postJson(`${BASE}/api/workspaces/recent`, {});
    assert.strictEqual(wsBad.status, 400, "empty workspace path must return 400");
    assert.strictEqual(wsBad.json.code, "INVALID_PATH");

    const wsGood = await postJson(`${BASE}/api/workspaces/recent`, { path: root });
    assert.strictEqual(wsGood.ok, true);
    assert.ok(Array.isArray(wsGood.json.recentWorkspaces));
    console.log("  [✓] settings and recent workspaces endpoints operational");

    console.log("\n==> Testing /api/watchlist (POST, GET, TOGGLE, DELETE)");
    const wlAdd = await postJson(`${BASE}/api/watchlist`, { type: "plugin", id: "goal" });
    assert.strictEqual(wlAdd.ok, true);
    assert.strictEqual(wlAdd.json.starred, true);

    const wlList = await getJson(`${BASE}/api/watchlist`);
    assert.ok(wlList.items.some((x) => x.key === "plugin:goal"));

    const wlToggle = await postJson(`${BASE}/api/watchlist/toggle`, { type: "plugin", id: "goal" });
    assert.strictEqual(wlToggle.ok, true);
    assert.strictEqual(wlToggle.json.starred, false);

    await postJson(`${BASE}/api/watchlist`, { type: "skill", id: "code-review" });
    const wlDel = await deleteJson(`${BASE}/api/watchlist/skill/code-review`);
    assert.strictEqual(wlDel.ok, true);
    console.log("  [✓] watchlist CRUD and toggle flow verified");

    console.log("\n==> Testing /api/mark and /api/forget");
    const markRes = await postJson(`${BASE}/api/mark`, { type: "plugin", id: "custom-smoke-p" });
    assert.strictEqual(markRes.ok, true);
    assert.strictEqual(markRes.json.item.id, "custom-smoke-p");

    const forgetRes = await deleteJson(`${BASE}/api/forget/plugin/custom-smoke-p`);
    assert.strictEqual(forgetRes.ok, true);
    console.log("  [✓] mark and forget lifecycle verified");

    console.log("\n==> Testing /api/bulk and /api/import validation");
    const bulkWatch = await postJson(`${BASE}/api/bulk`, {
      action: "watch",
      items: [{ type: "plugin", id: "bulk-p1" }, null, { type: "skill", id: "bulk-s1" }],
    });
    assert.strictEqual(bulkWatch.ok, true);
    assert.strictEqual(bulkWatch.json.results.length, 2);

    const badImport = await postJson(`${BASE}/api/import`, { installed: "not-an-array" });
    assert.strictEqual(badImport.status, 400);

    const goodImport = await postJson(`${BASE}/api/import`, {
      installed: [{ type: "plugin", id: "imported-smoke-p", scope: "global" }, null],
    });
    assert.strictEqual(goodImport.ok, true);
    assert.strictEqual(goodImport.json.added, 1);
    console.log("  [✓] bulk watch and import validation passed");

    console.log("\n==> Testing Security & CSRF Middleware");
    const csrfBadOrigin = await fetch(`${BASE}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": "https://malicious-site.com" },
      body: JSON.stringify({ defaultScope: "workspace" }),
    });
    assert.strictEqual(csrfBadOrigin.status, 403);
    const csrfBadJson = await csrfBadOrigin.json();
    assert.strictEqual(csrfBadJson.code, "UNTRUSTED_ORIGIN");

    const csrfCrossSite = await fetch(`${BASE}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" },
      body: JSON.stringify({ defaultScope: "workspace" }),
    });
    assert.strictEqual(csrfCrossSite.status, 403);
    const csrfCrossJson = await csrfCrossSite.json();
    assert.strictEqual(csrfCrossJson.code, "CSRF_BLOCKED");

    const versionRes = await fetch(`${BASE}/api/version`);
    assert.strictEqual(versionRes.headers.get("x-content-type-options"), "nosniff");
    assert.strictEqual(versionRes.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.ok(versionRes.headers.get("content-security-policy").includes("default-src 'self'"));
    console.log("  [✓] CSRF blocking and security headers strictly enforced");

    console.log("\n==> Testing 404 JSON Middleware (/api/nonexistent-route-xyz-404)");
    const notFoundRes = await fetch(`${BASE}/api/nonexistent-route-xyz-404`);
    assert.strictEqual(notFoundRes.status, 404, "404 route must return HTTP 404 status");
    const contentType = notFoundRes.headers.get("content-type") || "";
    assert.ok(contentType.includes("application/json"), `404 response must be application/json (got ${contentType})`);
    const notFoundJson = await notFoundRes.json();
    assert.strictEqual(notFoundJson.ok, false, "404 payload must have ok: false");
    assert.strictEqual(notFoundJson.code, "NOT_FOUND", "404 payload must have code: 'NOT_FOUND'");
    assert.strictEqual(typeof notFoundJson.error, "string", "404 payload must have error string");
    assert.ok(notFoundJson.error.length > 0, "404 error string must not be empty");
    console.log(`  [✓] status: ${notFoundRes.status}, code: ${notFoundJson.code}, error: "${notFoundJson.error}"`);

    console.log("\n==> ALL SMOKE & SECURITY TESTS PASSED WITH STRICT ASSERTIONS!\n");
  } finally {
    if (spawnedServer) {
      try {
        spawnedServer.kill();
      } catch {}
    }
    try {
      rmSync(smokeTmpDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error("\nFAIL:", err.message);
  process.exit(1);
});