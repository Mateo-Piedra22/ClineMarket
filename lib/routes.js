// Express API route handlers for Cline Marketplace Control Plane

import { Router } from "express";
import { join, basename } from "node:path";
import { platform, arch, uptime } from "node:os";
import { execSync } from "node:child_process";
import { readJson, safeWriteJson } from "./state.js";
import { sanitizePrimitiveId, sanitizePrimitiveType, sanitizeWorkspacePath } from "./sanitizers.js";
import { fsProbe } from "./probes.js";
import { reconcile } from "./reconciler.js";
import { runCline, verbFor, resolveCline } from "./runner.js";
import { resolveCommand } from "../scripts/lib/resolve-command.mjs";
import { logger } from "./logger.js";

export function createApiRouter({ root, dataDir, CATALOG_PATH, PREV_CATALOG_PATH, META_PATH, INSTALLED_PATH, WATCHLIST_PATH, CONTEXT_PATH, SETTINGS_PATH }) {
  const router = Router();

  function loadCatalog() {
    return readJson(CATALOG_PATH, null);
  }

  function loadInstalled() {
    return readJson(INSTALLED_PATH, { items: {} });
  }

  function saveInstalled(state) {
    return safeWriteJson(INSTALLED_PATH, state);
  }

  function loadWatchlist() {
    return readJson(WATCHLIST_PATH, { items: [] });
  }

  function saveWatchlist(w) {
    return safeWriteJson(WATCHLIST_PATH, w);
  }

  function loadSettings() {
    return readJson(SETTINGS_PATH, {
      recentWorkspaces: [],
      defaultScope: "global",
      themeContrast: "default",
      autoUpdateCheck: true,
    });
  }

  function saveSettings(s) {
    return safeWriteJson(SETTINGS_PATH, s);
  }

  // ---- Catalog Endpoint ----------------------------------------------------
  router.get("/catalog", (req, res) => {
    const wsDir = req.query.cwd ? sanitizeWorkspacePath(String(req.query.cwd)) : null;
    const probe = fsProbe(wsDir);
    const cat = loadCatalog() || { entries: [] };
    const prev = readJson(PREV_CATALOG_PATH, null);
    const meta = readJson(META_PATH, {});

    const prevMap = new Map((prev?.entries || []).map((e) => [e.key, e]));
    const marketEntries = cat.entries.map((e) => {
      const p = prevMap.get(e.key);
      const isNew = prev ? !p : false;
      const m = meta[e.key] || null;
      return {
        ...e,
        isNew,
        upstreamCommit: m,
      };
    });

    const existingKeys = new Set(marketEntries.map((e) => e.key));
    const localEntries = [];

    // Synthesize local custom plugins/skills/mcps
    for (const [id, item] of probe.found.plugins.entries()) {
      const key = `plugin:${id}`;
      if (!existingKeys.has(key)) {
        localEntries.push({
          key,
          type: "plugin",
          id,
          name: item.metadata?.name || id,
          description: item.metadata?.description || `Local custom plugin installed at ${item.path}`,
          author: { name: item.metadata?.author || "Local Machine", url: null },
          tags: item.metadata?.tags || ["local", "custom"],
          isLocal: true,
          install: { command: `cline plugin install ${id}`, args: [id] },
        });
      }
    }

    for (const [id, item] of probe.found.skills.entries()) {
      const key = `skill:${id}`;
      if (!existingKeys.has(key)) {
        localEntries.push({
          key,
          type: "skill",
          id,
          name: item.metadata?.name || id,
          description: item.metadata?.description || `Local custom skill installed at ${item.path}`,
          author: { name: item.metadata?.author || "Local Machine", url: null },
          tags: item.metadata?.tags || ["local", "custom"],
          isLocal: true,
          install: { command: `cline skill install ${id}`, args: [id] },
        });
      }
    }

    for (const [id, item] of probe.found.mcps.entries()) {
      const key = `mcp:${id}`;
      if (!existingKeys.has(key)) {
        localEntries.push({
          key,
          type: "mcp",
          id,
          name: id,
          description: `Configured MCP server from ${item.source || "local settings"}`,
          author: { name: "Local Configuration", url: null },
          tags: ["local", "mcp-server"],
          isLocal: true,
          install: { command: `cline mcp install ${id}`, args: [id] },
        });
      }
    }

    const allEntries = [...localEntries, ...marketEntries];
    const tags = new Set();
    for (const e of allEntries) {
      if (Array.isArray(e.tags)) {
        for (const t of e.tags) if (t) tags.add(t);
      }
    }

    res.json({
      generatedAt: cat.generatedAt || new Date().toISOString(),
      baseUrl: cat.baseUrl || "https://github.com/cline/marketplace",
      counts: {
        total: allEntries.length,
        marketplace: marketEntries.length,
        local: localEntries.length,
        plugins: allEntries.filter((e) => e.type === "plugin").length,
        skills: allEntries.filter((e) => e.type === "skill").length,
        mcps: allEntries.filter((e) => e.type === "mcp").length,
      },
      tags: Array.from(tags).sort(),
      entries: allEntries,
    });
  });

  // ---- Installed Registry Endpoint -----------------------------------------
  router.get("/installed", async (req, res) => {
    const wsDir = req.query.cwd ? sanitizeWorkspacePath(String(req.query.cwd)) : null;
    const probe = fsProbe(wsDir);
    const state = reconcile(loadInstalled(), probe);
    await saveInstalled(state);
    res.json(state);
  });

  // ---- Settings & Recent Workspaces ----------------------------------------
  router.get("/settings", (req, res) => {
    res.json(loadSettings());
  });

  router.post("/settings", async (req, res) => {
    const current = loadSettings();
    const updated = { ...current, ...(req.body || {}) };
    await saveSettings(updated);
    res.json({ ok: true, settings: updated });
  });

  router.post("/workspaces/recent", async (req, res) => {
    const rawPath = req.body?.path;
    if (!rawPath || typeof rawPath !== "string") {
      return res.status(400).json({ error: "Valid workspace path required" });
    }
    const safePath = sanitizeWorkspacePath(rawPath);
    const s = loadSettings();
    const existing = (s.recentWorkspaces || []).filter((w) => w.path !== safePath);
    existing.unshift({
      path: safePath,
      name: basename(safePath) || safePath,
      lastUsedAt: new Date().toISOString(),
    });
    s.recentWorkspaces = existing.slice(0, 10);
    await saveSettings(s);
    res.json({ ok: true, recentWorkspaces: s.recentWorkspaces });
  });

  // ---- System Status -------------------------------------------------------
  router.get("/status", async (req, res) => {
    const probe = fsProbe();
    const installed = reconcile(loadInstalled(), probe);
    const catalog = loadCatalog();
    const meta = readJson(META_PATH, {});
    const clinePath = await resolveCline();

    res.json({
      node: process.version,
      platform: platform(),
      arch: arch(),
      pid: process.pid,
      clinePath: clinePath || null,
      storageRoots: probe.roots,
      catalog: catalog
        ? {
            generatedAt: catalog.generatedAt,
            baseUrl: catalog.baseUrl,
            total: catalog.counts?.total ?? catalog.entries?.length ?? 0,
          }
        : null,
      installedCount: Object.values(installed.items).filter((it) => it.detected).length,
      metaCount: Object.keys(meta).length,
    });
  });

  // ---- System Diagnostics / Health -----------------------------------------
  router.get("/health", async (req, res) => {
    const checks = [];
    checks.push({
      name: "node",
      ok: true,
      detail: `${process.version} (${arch()})`,
      path: process.execPath,
    });

    const clineExe = await resolveCommand("cline");
    if (clineExe) {
      try {
        const out = execSync(`"${clineExe}" --version`, { timeout: 3000, encoding: "utf8", windowsHide: true }).trim();
        checks.push({ name: "cline", ok: true, path: clineExe, version: out, detail: `${out} at ${clineExe}`, error: null });
      } catch (err) {
        checks.push({ name: "cline", ok: false, path: clineExe, error: err.message, detail: `Found at ${clineExe} but failed running` });
      }
    } else {
      checks.push({ name: "cline", ok: false, path: null, error: "CLI binary 'cline' not found on PATH" });
    }

    const ghExe = await resolveCommand("gh");
    if (ghExe) {
      try {
        const out = execSync(`"${ghExe}" version`, { timeout: 3000, encoding: "utf8", windowsHide: true }).split("\n")[0].trim();
        const vMatch = out.match(/gh version ([0-9.]+)/i);
        const versionStr = vMatch ? vMatch[1] : out;
        checks.push({ name: "gh", ok: true, version: versionStr, path: ghExe, detail: "Authenticated to GitHub" });
      } catch (err) {
        checks.push({ name: "gh", ok: false, path: ghExe, error: err.message, detail: `Found at ${ghExe} but failed execution` });
      }
    } else {
      checks.push({ name: "gh", ok: false, detail: "GitHub CLI optional (used for metadata caching)" });
    }

    const probe = fsProbe();
    checks.push({
      name: "cline-storage",
      ok: probe.roots.length > 0,
      detail: probe.roots.join(", ") || "No storage directory detected",
      counts: {
        plugins: probe.found.plugins.size,
        skills: probe.found.skills.size,
        mcps: probe.found.mcps.size,
      },
    });

    const cat = loadCatalog();
    checks.push({
      name: "catalog",
      ok: Boolean(cat && cat.entries?.length),
      detail: cat ? `${cat.entries.length} entries, generated ${cat.generatedAt || "unknown"}` : "catalog.json missing or empty",
    });

    const meta = readJson(META_PATH, {});
    checks.push({
      name: "metadata",
      ok: Object.keys(meta).length > 0,
      detail: `${Object.keys(meta).length} upstream commit records cached`,
    });

    res.json({
      ok: checks.filter((c) => c.ok).length >= 4,
      checks,
      system: {
        platform: platform(),
        arch: arch(),
        node: process.version,
        clinePath: clineExe || null,
        uptime: Math.round(uptime()),
      },
    });
  });

  // ---- Install / Uninstall Handlers ----------------------------------------
  router.post("/install", async (req, res) => {
    const type = sanitizePrimitiveType(req.body?.type);
    const id = sanitizePrimitiveId(req.body?.id);

    if (!type || !id) {
      return res.status(400).json({ error: "Valid 'type' (plugin|skill|mcp) and 'id' are required." });
    }

    const catalog = loadCatalog();
    const entry = catalog?.entries?.find((e) => e.type === type && e.id === id);
    const verb = verbFor(type || entry?.type);
    let args = entry?.install?.args ? [verb, "install", ...entry.install.args] : [verb, "install", id];

    const scope = req.body?.scope === "workspace" ? "workspace" : "global";
    const targetCwd = req.body?.cwd ? sanitizeWorkspacePath(req.body.cwd) : root;
    const force = Boolean(req.body?.force);

    if (force && !args.includes("--force")) {
      args.push("--force");
    }

    let result;
    try {
      result = await runCline(args, { cwd: targetCwd });
      const combinedOutput = `${result.stdout} ${result.stderr}`.toLowerCase();
      if (result.code !== 0 && (combinedOutput.includes("already installed") || combinedOutput.includes("--force") || combinedOutput.includes("replace it"))) {
        const forceArgs = args.includes("--force") ? args : [...args, "--force"];
        const retryResult = await runCline(forceArgs, { cwd: targetCwd });
        result = retryResult;
        args = forceArgs;
      }
    } catch (err) {
      return res.status(500).json({ error: String(err.message || err) });
    }

    let state = loadInstalled();
    const key = `${type}:${id}`;
    const now = new Date().toISOString();
    if (!state.items[key]) {
      state.items[key] = {
        type,
        id,
        scope,
        workspace: scope === "workspace" ? targetCwd : null,
        source: entry ? "marketplace" : "manual",
        installedAt: now,
        lastSeenAt: now,
        installCommand: entry?.install?.command || `cline ${verb} install ${id}`,
        detected: result.code === 0,
      };
    } else {
      state.items[key].scope = scope;
      state.items[key].workspace = scope === "workspace" ? targetCwd : state.items[key].workspace;
      state.items[key].installCommand = entry?.install?.command || state.items[key].installCommand;
      state.items[key].lastSeenAt = now;
      if (result.code === 0) state.items[key].detected = true;
    }
    state = reconcile(state, fsProbe(targetCwd));
    await saveInstalled(state);

    res.json({
      ok: result.code === 0,
      exitCode: result.code,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      command: `cline ${args.join(" ")}`,
      installed: state.items[key],
    });
  });

  router.post("/uninstall", async (req, res) => {
    const type = sanitizePrimitiveType(req.body?.type);
    const id = sanitizePrimitiveId(req.body?.id);

    if (!type || !id) {
      return res.status(400).json({ error: "Valid 'type' (plugin|skill|mcp) and 'id' are required." });
    }

    const verb = verbFor(type);
    const args = [verb, "uninstall", id];
    const targetCwd = req.body?.cwd ? sanitizeWorkspacePath(req.body.cwd) : root;

    let result;
    try {
      result = await runCline(args, { cwd: targetCwd });
    } catch (err) {
      return res.status(500).json({ error: String(err.message || err) });
    }

    let state = loadInstalled();
    const key = `${type}:${id}`;
    if (state.items[key]) {
      state.items[key].detected = false;
      state.items[key].lastSeenAt = new Date().toISOString();
    }
    await saveInstalled(state);

    res.json({
      ok: result.code === 0,
      exitCode: result.code,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      command: `cline ${args.join(" ")}`,
    });
  });

  router.post("/mark", async (req, res) => {
    const type = sanitizePrimitiveType(req.body?.type);
    const id = sanitizePrimitiveId(req.body?.id);
    const src = typeof req.body?.source === "string" ? req.body.source.slice(0, 50) : "manual";

    if (!type || !id) {
      return res.status(400).json({ error: "Valid 'type' and 'id' are required." });
    }

    const state = loadInstalled();
    const key = `${type}:${id}`;
    const now = new Date().toISOString();
    state.items[key] = {
      type,
      id,
      source: src,
      installedAt: state.items[key]?.installedAt || now,
      lastSeenAt: now,
      installCommand: state.items[key]?.installCommand || null,
      detected: true,
    };
    await saveInstalled(state);
    res.json({ ok: true, item: state.items[key] });
  });

  router.post("/forget", async (req, res) => {
    const type = sanitizePrimitiveType(req.body?.type);
    const id = sanitizePrimitiveId(req.body?.id);
    if (!type || !id) return res.status(400).json({ error: "Valid 'type' and 'id' required." });

    const state = loadInstalled();
    const key = `${type}:${id}`;
    delete state.items[key];
    await saveInstalled(state);
    res.json({ ok: true, key });
  });

  // ---- Watchlist Endpoint --------------------------------------------------
  router.get("/watchlist", (req, res) => {
    res.json(loadWatchlist());
  });

  router.post("/watchlist/toggle", async (req, res) => {
    const type = sanitizePrimitiveType(req.body?.type);
    const id = sanitizePrimitiveId(req.body?.id);
    if (!type || !id) return res.status(400).json({ error: "Valid 'type' and 'id' required." });

    const key = `${type}:${id}`;
    const wl = loadWatchlist();
    const idx = wl.items.findIndex((x) => x.key === key);
    let starred;
    if (idx >= 0) {
      wl.items.splice(idx, 1);
      starred = false;
    } else {
      wl.items.push({ key, type, id, addedAt: new Date().toISOString() });
      starred = true;
    }
    await saveWatchlist(wl);
    res.json({ ok: true, key, starred, count: wl.items.length });
  });

  // ---- Bulk Operations -----------------------------------------------------
  router.post("/bulk", async (req, res) => {
    const action = req.body?.action;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!["install", "uninstall", "watch", "unwatch"].includes(action)) {
      return res.status(400).json({ error: "Invalid action." });
    }

    const results = [];
    const targetCwd = req.body?.cwd ? sanitizeWorkspacePath(req.body.cwd) : root;

    for (const it of items) {
      const type = sanitizePrimitiveType(it.type);
      const id = sanitizePrimitiveId(it.id);
      if (!type || !id) continue;

      if (action === "install") {
        try {
          const runRes = await runCline([verbFor(type), "install", id], { cwd: targetCwd });
          results.push({ type, id, ok: runRes.code === 0, code: runRes.code });
        } catch (err) {
          results.push({ type, id, ok: false, error: err.message });
        }
      } else if (action === "uninstall") {
        try {
          const runRes = await runCline([verbFor(type), "uninstall", id], { cwd: targetCwd });
          results.push({ type, id, ok: runRes.code === 0, code: runRes.code });
        } catch (err) {
          results.push({ type, id, ok: false, error: err.message });
        }
      }
    }

    res.json({ ok: true, action, results });
  });

  // ---- Update & Versioning Endpoints ---------------------------------------
  router.get("/update/check", async (req, res) => {
    const pkg = readJson(join(root, "package.json"), { version: "1.0.0" });
    try {
      const ghRes = await fetch("https://api.github.com/repos/Mateo-Piedra22/ClineMarket/releases/latest", {
        headers: { "User-Agent": "Cline-Marketplace-Local" },
        signal: AbortSignal.timeout(3000),
      });
      if (!ghRes.ok) {
        return res.json({ hasUpdate: false, currentVersion: pkg.version, remoteVersion: pkg.version });
      }
      const ghData = await ghRes.json();
      const remoteTag = ghData.tag_name ? ghData.tag_name.replace(/^v/, "") : pkg.version;
      const hasUpdate = remoteTag !== pkg.version;
      res.json({ hasUpdate, currentVersion: pkg.version, remoteVersion: remoteTag, releaseUrl: ghData.html_url });
    } catch {
      res.json({ hasUpdate: false, currentVersion: pkg.version, remoteVersion: pkg.version });
    }
  });

  router.post("/update/run", (req, res) => {
    try {
      const pullOut = execSync("git pull origin main", { cwd: root, encoding: "utf8", timeout: 30000 });
      const installOut = execSync("npm install --omit=dev", { cwd: root, encoding: "utf8", timeout: 60000 });
      res.json({ ok: true, output: `${pullOut}\n${installOut}` });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get("/version", (req, res) => {
    const pkg = readJson(join(root, "package.json"), { version: "1.0.0" });
    res.json({ version: pkg.version, app: "cline-marketplace" });
  });

  router.post("/shutdown", (req, res) => {
    res.json({ ok: true, message: "Shutting down local server gracefully..." });
    setTimeout(() => { process.exit(0); }, 500);
  });

  return router;
}
