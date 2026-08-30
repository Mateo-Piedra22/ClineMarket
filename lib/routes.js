// Express API route handlers for Cline Marketplace Control Plane

import { Router } from "express";
import { join, basename, resolve } from "node:path";
import { platform, arch } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { readJson, safeWriteJson } from "./state.js";
import { sanitizePrimitiveId, sanitizePrimitiveType, sanitizeWorkspacePath } from "./sanitizers.js";
import { fsProbe } from "./probes.js";
import { reconcile } from "./reconciler.js";
import { runCline, verbFor, resolveCline } from "./runner.js";
import { resolveCommand, isWindowsBatchShim } from "./resolver.js";
import { logger } from "./logger.js";

const execFileP = promisify(execFile);

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

  // ---- Context Analysis Engine ---------------------------------------------
  function parseGitRepo(targetCwd) {
    try {
      let gitPath = join(targetCwd, ".git");
      if (existsSync(gitPath)) {
        try {
          const stat = statSync(gitPath);
          if (stat.isFile()) {
            const content = readFileSync(gitPath, "utf8");
            const match = content.match(/gitdir:\s*(.+)/i);
            if (match) {
              gitPath = resolve(targetCwd, match[1].trim());
            }
          }
        } catch {}

        const configPath = join(gitPath, "config");
        if (existsSync(configPath)) {
          const configText = readFileSync(configPath, "utf8");
          const originSection = configText.match(/\[remote\s+["']origin["']\][^\[]*?url\s*=\s*([^\r\n]+)/is) ||
                                configText.match(/\[remote\s+[^\]]+\][^\[]*?url\s*=\s*([^\r\n]+)/is);
          if (originSection) {
            const rawUrl = originSection[1].trim();
            const match = rawUrl.match(/(?:[:/])([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/);
            if (match) {
              return {
                owner: match[1],
                name: match[2],
              };
            }
          }
        }
      }
    } catch {}

    try {
      const pkgPath = join(targetCwd, "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        let repoStr = null;
        if (typeof pkg.repository === "string") repoStr = pkg.repository;
        else if (pkg.repository && typeof pkg.repository.url === "string") repoStr = pkg.repository.url;

        if (repoStr) {
          const m = repoStr.match(/(?:[:/])([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/);
          if (m) {
            return {
              owner: m[1],
              name: m[2],
            };
          }
        }
      }
    } catch {}

    return null;
  }

  function analyzeWorkspaceContext(targetCwd) {
    const cwd = resolve(targetCwd || process.cwd());
    const repo = parseGitRepo(cwd);
    const languages = new Set();
    const frameworks = new Set();
    const tags = new Set();
    const hints = new Set();

    if (!existsSync(cwd)) {
      return {
        ok: true,
        cwd,
        repo: null,
        languages: [],
        frameworks: [],
        tags: [],
        hints: [],
        recommendations: [],
        bundles: [],
        recommended: [],
      };
    }

    let shallowFiles = [];
    try {
      shallowFiles = readdirSync(cwd);
    } catch {}

    const pkgPath = join(cwd, "package.json");
    if (existsSync(pkgPath)) {
      languages.add("javascript");
      try {
        const j = JSON.parse(readFileSync(pkgPath, "utf8"));
        const allDeps = { ...(j.dependencies || {}), ...(j.devDependencies || {}) };

        if (allDeps.typescript || existsSync(join(cwd, "tsconfig.json"))) {
          languages.add("typescript");
          hints.add("TypeScript configured");
        }
        if (allDeps.react) {
          frameworks.add("react");
          tags.add("frontend");
          tags.add("react");
        }
        if (allDeps.vue) {
          frameworks.add("vue");
          tags.add("frontend");
          tags.add("vue");
        }
        if (allDeps.next || allDeps.nextjs) {
          frameworks.add("nextjs");
          tags.add("fullstack");
          tags.add("react");
          hints.add("Next.js framework detected");
        }
        if (allDeps.express) {
          frameworks.add("express");
          tags.add("backend");
          tags.add("api");
        }
        if (allDeps.fastify) {
          frameworks.add("fastify");
          tags.add("backend");
          tags.add("api");
        }
        if (allDeps["@nestjs/core"] || allDeps.nestjs) {
          frameworks.add("nestjs");
          tags.add("backend");
        }
        if (allDeps.tailwindcss) {
          frameworks.add("tailwind");
          tags.add("css");
        }
        if (allDeps.svelte) {
          frameworks.add("svelte");
          tags.add("frontend");
        }
        if (allDeps.electron) {
          frameworks.add("electron");
          tags.add("desktop");
          hints.add("Electron framework detected");
        }
        if (allDeps.vite) {
          frameworks.add("vite");
          tags.add("frontend");
        }
        if (allDeps.jest || allDeps.vitest || allDeps.mocha) {
          tags.add("testing");
          hints.add("Test suite configured");
        }
      } catch {}
    }

    const pyProject = join(cwd, "pyproject.toml");
    const reqTxt = join(cwd, "requirements.txt");
    const pipfile = join(cwd, "Pipfile");
    const setupPy = join(cwd, "setup.py");
    if (existsSync(pyProject) || existsSync(reqTxt) || existsSync(pipfile) || existsSync(setupPy) || shallowFiles.some((f) => f.endsWith(".py"))) {
      languages.add("python");
      let pyContent = "";
      try {
        if (existsSync(reqTxt)) pyContent += readFileSync(reqTxt, "utf8");
        if (existsSync(pyProject)) pyContent += readFileSync(pyProject, "utf8");
      } catch {}
      const pyLower = pyContent.toLowerCase();
      if (pyLower.includes("django")) { frameworks.add("django"); tags.add("backend"); }
      if (pyLower.includes("flask")) { frameworks.add("flask"); tags.add("backend"); }
      if (pyLower.includes("fastapi")) { frameworks.add("fastapi"); tags.add("backend"); tags.add("api"); }
      if (pyLower.includes("torch") || pyLower.includes("tensorflow") || pyLower.includes("transformers") || pyLower.includes("langchain") || pyLower.includes("pydantic-ai") || pyLower.includes("openai")) {
        frameworks.add("ai-ml");
        tags.add("ai");
        tags.add("data");
        hints.add("AI/ML dependencies detected");
      }
      if (pyLower.includes("pytest")) {
        tags.add("testing");
        hints.add("pytest suite configured");
      }
    }

    if (existsSync(join(cwd, "go.mod")) || shallowFiles.some((f) => f.endsWith(".go"))) {
      languages.add("go");
      try {
        const goMod = readFileSync(join(cwd, "go.mod"), "utf8");
        if (goMod.includes("gin-gonic")) frameworks.add("gin");
      } catch {}
    }

    if (existsSync(join(cwd, "Cargo.toml")) || shallowFiles.some((f) => f.endsWith(".rs"))) {
      languages.add("rust");
      try {
        const cargoToml = readFileSync(join(cwd, "Cargo.toml"), "utf8");
        if (cargoToml.includes("tokio")) { frameworks.add("tokio"); hints.add("Tokio async runtime configured"); }
        if (cargoToml.includes("actix")) frameworks.add("actix");
        if (cargoToml.includes("axum")) frameworks.add("axum");
      } catch {}
    }

    if (existsSync(join(cwd, "Dockerfile")) || existsSync(join(cwd, "docker-compose.yml")) || existsSync(join(cwd, "compose.yaml"))) {
      frameworks.add("docker");
      tags.add("devops");
      hints.add("Docker container workflow detected");
    }

    if (existsSync(join(cwd, ".git")) || repo) {
      frameworks.add("git");
      tags.add("git");
      hints.add("Git version control active");
    }

    const cat = loadCatalog();
    const recommendations = [];
    const langList = Array.from(languages);
    const fwList = Array.from(frameworks);
    const tagList = Array.from(tags);

    if (cat?.entries) {
      for (const entry of cat.entries) {
        const entryText = `${entry.id} ${entry.name} ${entry.tagline || ""} ${entry.description || ""} ${(entry.tags || []).join(" ")}`.toLowerCase();
        const reasons = [];
        let score = 0;

        for (const l of langList) {
          const lLower = l.toLowerCase();
          if (entryText.includes(lLower) || (entry.tags || []).some((t) => t.toLowerCase() === lLower)) {
            reasons.push(`Matches ${l} language`);
            score += 30;
          }
        }

        for (const f of fwList) {
          const fLower = f.toLowerCase();
          if (entryText.includes(fLower) || (entry.tags || []).some((t) => t.toLowerCase() === fLower)) {
            reasons.push(`Matches ${f} framework`);
            score += 25;
          }
        }

        for (const t of tagList) {
          const tLower = t.toLowerCase();
          if ((entry.tags || []).some((x) => x.toLowerCase() === tLower)) {
            reasons.push(`Matches ${t} tag`);
            score += 15;
          }
        }

        if (entry.featured) score += 5;
        if (entry.verified) score += 5;

        if (score > 0) {
          const uniqueReasons = Array.from(new Set(reasons)).slice(0, 3);
          const matchPercent = Math.min(99, Math.max(50, Math.round(50 + Math.min(45, score * 0.75))));
          recommendations.push({
            entry,
            reasons: uniqueReasons,
            score,
            matchPercent,
          });
        }
      }

      recommendations.sort((a, b) => b.score - a.score || b.matchPercent - a.matchPercent);
    }

    const topRecs = recommendations.slice(0, 20);

    function getBundleItem(type, id, defaultName) {
      const e = cat?.entries?.find((x) => x.type === type && x.id === id);
      return { type, id, name: e?.name || defaultName || id };
    }

    const bundles = [];
    if (languages.has("typescript") || languages.has("javascript")) {
      bundles.push({
        id: "node-typescript-fullstack",
        title: "Node & TypeScript Fullstack Suite",
        description: "Essential plugins, skills, and MCP servers for Node.js, Express, and TypeScript development.",
        items: [
          getBundleItem("plugin", "agent-browser", "Agent Browser"),
          getBundleItem("plugin", "branch-protector", "Branch Protector"),
          getBundleItem("plugin", "background-terminal", "Background Terminal"),
          getBundleItem("plugin", "agents-squad", "Agents Squad"),
        ],
      });
    }

    if (frameworks.has("react") || frameworks.has("nextjs") || frameworks.has("vue") || frameworks.has("tailwind") || frameworks.has("svelte")) {
      bundles.push({
        id: "frontend-modern-web",
        title: "Modern Frontend & UI Engineering Suite",
        description: "Browser automation, responsive QA, and full-stack cloud workflows for modern web apps.",
        items: [
          getBundleItem("plugin", "agent-browser", "Agent Browser"),
          getBundleItem("skill", "amplify-workflow", "AWS Amplify Gen2 Workflow"),
          getBundleItem("plugin", "branch-protector", "Branch Protector"),
        ],
      });
    }

    if (languages.has("python") || frameworks.has("ai-ml") || tags.has("ai")) {
      bundles.push({
        id: "python-ai-data",
        title: "Python AI, ML & Data Engineering Suite",
        description: "Orchestration, database analytics, and Pydantic AI agent development patterns.",
        items: [
          getBundleItem("skill", "building-pydantic-ai-agents", "Building Pydantic AI Agents"),
          getBundleItem("plugin", "clickhouse-data-analyst", "ClickHouse Data Analyst"),
          getBundleItem("plugin", "background-terminal", "Background Terminal"),
        ],
      });
    }

    if (frameworks.has("git") || frameworks.has("docker") || languages.has("rust") || languages.has("go")) {
      bundles.push({
        id: "system-devops-git",
        title: "System, DevOps & Git Control Suite",
        description: "Protected branch guardrails, terminal job supervisors, and cloud services.",
        items: [
          getBundleItem("plugin", "branch-protector", "Branch Protector"),
          getBundleItem("plugin", "background-terminal", "Background Terminal"),
          getBundleItem("skill", "amazon-location-service", "Amazon Location Service"),
        ],
      });
    }

    if (bundles.length === 0) {
      bundles.push({
        id: "developer-productivity-core",
        title: "Developer Productivity & Automation Suite",
        description: "Foundational subagents, browser testing, and safety guardrails for every workspace.",
        items: [
          getBundleItem("plugin", "agents-squad", "Agents Squad"),
          getBundleItem("plugin", "agent-browser", "Agent Browser"),
          getBundleItem("plugin", "branch-protector", "Branch Protector"),
        ],
      });
    }

    const recommended = topRecs.map((r) => r.entry.key || `${r.entry.type}:${r.entry.id}`);

    return {
      ok: true,
      cwd,
      repo,
      languages: Array.from(languages),
      frameworks: Array.from(frameworks),
      tags: Array.from(tags),
      hints: Array.from(hints),
      recommendations: topRecs,
      bundles,
      recommended,
    };
  }

  // ---- Catalog Endpoint ----------------------------------------------------
  router.get("/catalog", (req, res) => {
    const wsDir = req.query.cwd ? sanitizeWorkspacePath(String(req.query.cwd)) : null;
    const probe = fsProbe(wsDir);
    const cat = loadCatalog() || { entries: [] };
    const prev = readJson(PREV_CATALOG_PATH, null);
    const meta = readJson(META_PATH, {});

    const prevMap = new Map((prev?.entries || []).map((e) => [e.key, e]));
    const marketEntries = (cat.entries || []).map((e) => {
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
          description: `Configured MCP Server from ${item.source}`,
          author: { name: "Local Configuration", url: null },
          tags: ["mcp", "configured"],
          isLocal: true,
          install: { command: `cline mcp add ${id}`, args: [id] },
        });
      }
    }

    const allEntries = [...localEntries, ...marketEntries];
    const tagCounts = new Map();
    for (const e of allEntries) {
      if (Array.isArray(e.tags)) {
        for (const t of e.tags) {
          if (t && typeof t === "string") {
            const clean = t.trim();
            if (clean) tagCounts.set(clean, (tagCounts.get(clean) || 0) + 1);
          }
        }
      }
    }

    const tagList = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id, count]) => ({ id, label: id, count }));

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
      tags: tagList,
      entries: allEntries,
    });
  });

  // ---- Workspace Context & Recommendations ---------------------------------
  router.get("/context", (req, res) => {
    const wsDir = req.query.cwd ? sanitizeWorkspacePath(String(req.query.cwd)) : root;
    const contextInfo = analyzeWorkspaceContext(wsDir);
    safeWriteJson(CONTEXT_PATH, contextInfo).catch(() => {});
    res.json(contextInfo);
  });

  // ---- Installed Registry Endpoint -----------------------------------------
  router.get("/installed", async (req, res) => {
    const wsDir = req.query.cwd ? sanitizeWorkspacePath(String(req.query.cwd)) : null;
    const probe = fsProbe(wsDir);
    const prevInstalled = loadInstalled();
    const state = reconcile(prevInstalled, probe);

    // Dirty-checking before saving to prevent disk thrashing on pure reads
    const prevKeys = Object.keys(prevInstalled.items || {}).sort().join(",");
    const nextKeys = Object.keys(state.items || {}).sort().join(",");
    const prevActive = Object.values(prevInstalled.items || {}).filter((i) => i.detected).length;
    const nextActive = Object.values(state.items || {}).filter((i) => i.detected).length;

    if (prevKeys !== nextKeys || prevActive !== nextActive) {
      await saveInstalled(state);
    }

    res.json(state);
  });

  // ---- Settings & Recent Workspaces ----------------------------------------
  router.get("/settings", (req, res) => {
    res.json(loadSettings());
  });

  router.post("/settings", async (req, res) => {
    const current = loadSettings();
    const b = req.body || {};
    const updated = {
      ...current,
      ...(b.defaultScope ? { defaultScope: b.defaultScope === "workspace" ? "workspace" : "global" } : {}),
      ...(b.themeContrast ? { themeContrast: String(b.themeContrast).slice(0, 30) } : {}),
      ...(typeof b.autoUpdateCheck === "boolean" ? { autoUpdateCheck: b.autoUpdateCheck } : {}),
      ...(Array.isArray(b.recentWorkspaces)
        ? {
            recentWorkspaces: b.recentWorkspaces
              .filter((w) => w && typeof w === "object" && typeof w.path === "string")
              .map((w) => ({
                path: sanitizeWorkspacePath(w.path),
                name: typeof w.name === "string" ? w.name.slice(0, 50) : basename(sanitizeWorkspacePath(w.path)),
                lastUsedAt: typeof w.lastUsedAt === "string" ? w.lastUsedAt : new Date().toISOString(),
              }))
              .slice(0, 20),
          }
        : {}),
    };
    await saveSettings(updated);
    res.json({ ok: true, settings: updated });
  });

  router.post("/workspaces/recent", async (req, res) => {
    const rawPath = req.body?.path;
    if (!rawPath || typeof rawPath !== "string") {
      return res.status(400).json({ ok: false, error: "Valid workspace path required", code: "INVALID_PATH" });
    }
    const safePath = sanitizeWorkspacePath(rawPath);
    const s = loadSettings();
    const existing = (s.recentWorkspaces || []).filter((w) => w && typeof w === "object" && w.path !== safePath);
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
      uptime: Math.round(process.uptime()),
      memory: process.memoryUsage(),
      clinePath: clinePath || null,
      storageRoots: probe.roots,
      clineRoots: probe.roots,
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
        const isBatch = isWindowsBatchShim(clineExe);
        const { stdout } = await execFileP(clineExe, ["--version"], { timeout: 3000, windowsHide: true, shell: isBatch });
        const out = stdout.trim();
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
        const isBatch = isWindowsBatchShim(ghExe);
        const { stdout } = await execFileP(ghExe, ["version"], { timeout: 3000, windowsHide: true, shell: isBatch });
        const out = stdout.split("\n")[0].trim();
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
        uptime: Math.round(process.uptime()),
        memory: process.memoryUsage(),
      },
    });
  });

  // ---- Install / Uninstall Handlers ----------------------------------------
  router.post("/install", async (req, res) => {
    const type = sanitizePrimitiveType(req.body?.type);
    const id = sanitizePrimitiveId(req.body?.id);

    if (!type || !id) {
      return res.status(400).json({ ok: false, error: "Valid 'type' (plugin|skill|mcp) and 'id' are required.", code: "INVALID_PRIMITIVE" });
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
      logger.error(`Install failed for ${type}:${id}: ${err.message}`);
      return res.status(500).json({ ok: false, error: String(err.message || err), code: "INSTALL_FAILED" });
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

    const isOk = result.code === 0;
    const errMsg = isOk ? null : (result.stderr.trim() || result.stdout.trim() || `Command failed with exit code ${result.code}`);

    res.status(isOk ? 200 : 400).json({
      ok: isOk,
      ...(errMsg ? { error: errMsg, code: "CLI_ERROR" } : {}),
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
      return res.status(400).json({ ok: false, error: "Valid 'type' (plugin|skill|mcp) and 'id' are required.", code: "INVALID_PRIMITIVE" });
    }

    const verb = verbFor(type);
    const args = [verb, "uninstall", id];
    const targetCwd = req.body?.cwd ? sanitizeWorkspacePath(req.body.cwd) : root;

    let result;
    try {
      result = await runCline(args, { cwd: targetCwd });
    } catch (err) {
      logger.error(`Uninstall failed for ${type}:${id}: ${err.message}`);
      return res.status(500).json({ ok: false, error: String(err.message || err), code: "UNINSTALL_FAILED" });
    }

    let state = loadInstalled();
    const key = `${type}:${id}`;
    if (state.items[key]) {
      state.items[key].detected = false;
      state.items[key].lastSeenAt = new Date().toISOString();
    }
    await saveInstalled(state);

    const isOk = result.code === 0;
    const errMsg = isOk ? null : (result.stderr.trim() || result.stdout.trim() || `Command failed with exit code ${result.code}`);

    res.status(isOk ? 200 : 400).json({
      ok: isOk,
      ...(errMsg ? { error: errMsg, code: "CLI_ERROR" } : {}),
      exitCode: result.code,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      command: `cline ${args.join(" ")}`,
    });
  });

  // ---- Mark / Forget Endpoints ---------------------------------------------
  router.post("/mark", async (req, res) => {
    const type = sanitizePrimitiveType(req.body?.type);
    const id = sanitizePrimitiveId(req.body?.id);
    const src = typeof req.body?.source === "string" ? req.body.source.slice(0, 50) : "manual";

    if (!type || !id) {
      return res.status(400).json({ ok: false, error: "Valid 'type' and 'id' are required.", code: "INVALID_PARAMS" });
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

  const forgetHandler = async (req, res) => {
    const type = sanitizePrimitiveType(req.params?.type || req.body?.type);
    const id = sanitizePrimitiveId(req.params?.id || req.body?.id);
    if (!type || !id) return res.status(400).json({ ok: false, error: "Valid 'type' and 'id' required.", code: "INVALID_PARAMS" });

    const state = loadInstalled();
    const key = `${type}:${id}`;
    delete state.items[key];
    await saveInstalled(state);
    res.json({ ok: true, key });
  };

  router.post("/forget", forgetHandler);
  router.delete("/forget/:type/:id", forgetHandler);
  router.delete("/mark/:type/:id", forgetHandler);

  // ---- Watchlist Endpoints -------------------------------------------------
  router.get("/watchlist", (req, res) => {
    res.json(loadWatchlist());
  });

  router.post("/watchlist", async (req, res) => {
    const type = sanitizePrimitiveType(req.body?.type);
    const id = sanitizePrimitiveId(req.body?.id);
    if (!type || !id) return res.status(400).json({ ok: false, error: "Valid 'type' and 'id' required.", code: "INVALID_PARAMS" });

    const key = `${type}:${id}`;
    const wl = loadWatchlist();
    if (!wl.items.some((x) => x.key === key)) {
      wl.items.push({ key, type, id, addedAt: new Date().toISOString() });
      await saveWatchlist(wl);
    }
    res.json({ ok: true, key, starred: true, count: wl.items.length });
  });

  router.delete("/watchlist/:type/:id", async (req, res) => {
    const type = sanitizePrimitiveType(req.params.type);
    const id = sanitizePrimitiveId(req.params.id);
    if (!type || !id) return res.status(400).json({ ok: false, error: "Valid 'type' and 'id' required.", code: "INVALID_PARAMS" });

    const key = `${type}:${id}`;
    const wl = loadWatchlist();
    const idx = wl.items.findIndex((x) => x.key === key);
    if (idx >= 0) {
      wl.items.splice(idx, 1);
      await saveWatchlist(wl);
    }
    res.json({ ok: true, key, starred: false, count: wl.items.length });
  });

  router.post("/watchlist/toggle", async (req, res) => {
    const type = sanitizePrimitiveType(req.body?.type);
    const id = sanitizePrimitiveId(req.body?.id);
    if (!type || !id) return res.status(400).json({ ok: false, error: "Valid 'type' and 'id' required.", code: "INVALID_PARAMS" });

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
      return res.status(400).json({ ok: false, error: "Invalid action. Supported: install, uninstall, watch, unwatch.", code: "INVALID_ACTION" });
    }

    const results = [];
    const targetCwd = req.body?.cwd ? sanitizeWorkspacePath(req.body.cwd) : root;
    const wl = (action === "watch" || action === "unwatch") ? loadWatchlist() : null;
    let wlModified = false;

    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      const type = sanitizePrimitiveType(it.type);
      const id = sanitizePrimitiveId(it.id);
      if (!type || !id) continue;

      const key = `${type}:${id}`;
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
      } else if (action === "watch") {
        if (!wl.items.some((x) => x.key === key)) {
          wl.items.push({ key, type, id, addedAt: new Date().toISOString() });
          wlModified = true;
        }
        results.push({ type, id, ok: true });
      } else if (action === "unwatch") {
        const idx = wl.items.findIndex((x) => x.key === key);
        if (idx >= 0) {
          wl.items.splice(idx, 1);
          wlModified = true;
        }
        results.push({ type, id, ok: true });
      }
    }

    if (wlModified && wl) {
      await saveWatchlist(wl);
    }

    if (action === "install" || action === "uninstall") {
      const current = reconcile(loadInstalled(), fsProbe(targetCwd));
      await saveInstalled(current);
    }

    res.json({ ok: true, action, results });
  });

  // ---- Refresh Catalog Endpoint --------------------------------------------
  let _refreshJob = null;
  router.post("/refresh", async (req, res) => {
    try {
      if (!_refreshJob) {
        const refreshScript = join(root, "scripts", "refresh-catalog.mjs");
        _refreshJob = execFileP(process.execPath, [refreshScript], {
          cwd: root,
          timeout: 60000,
          windowsHide: true,
        }).finally(() => {
          _refreshJob = null;
        });
      }
      const { stdout } = await _refreshJob;

      const cat = loadCatalog();
      const meta = readJson(META_PATH, {});

      res.json({
        ok: true,
        output: stdout.trim(),
        total: cat?.counts?.total ?? cat?.entries?.length ?? 0,
        metaCount: Object.keys(meta).length,
      });
    } catch (err) {
      logger.error(`Refresh catalog failed: ${err.message}`);
      res.status(500).json({ ok: false, error: err.message, code: "REFRESH_FAILED" });
    }
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

  router.post("/update/run", async (req, res) => {
    try {
      const gitExe = (await resolveCommand("git")) || "git";
      const npmExe = (await resolveCommand("npm")) || "npm";
      const isNpmBatch = isWindowsBatchShim(npmExe);

      const { stdout: pullOut } = await execFileP(gitExe, ["pull", "origin", "main"], { cwd: root, timeout: 30000 });
      const { stdout: installOut } = await execFileP(npmExe, ["install", "--omit=dev"], {
        cwd: root,
        timeout: 60000,
        windowsHide: true,
        shell: isNpmBatch,
      });
      res.json({ ok: true, output: `${pullOut}\n${installOut}` });
    } catch (err) {
      logger.error(`Update run failed: ${err.message}`);
      res.status(500).json({ ok: false, error: err.message, code: "UPDATE_FAILED" });
    }
  });

  // ---- Stats & Analytics --------------------------------------------------
  router.get("/stats", (req, res) => {
    const cat = loadCatalog() || { entries: [] };
    const meta = readJson(META_PATH, {});
    const installed = loadInstalled();

    const byAuthor = new Map();
    for (const e of cat.entries || []) {
      const a = e.author?.name || "Unknown";
      byAuthor.set(a, (byAuthor.get(a) || 0) + 1);
    }
    const topAuthors = [...byAuthor.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    const tagCounts = new Map();
    for (const e of cat.entries || []) {
      if (Array.isArray(e.tags)) {
        for (const t of e.tags) {
          if (t && typeof t === "string") {
            tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
          }
        }
      }
    }
    const byTag = Array.from(tagCounts.entries())
      .map(([id, count]) => ({ id, label: id, count }))
      .sort((a, b) => b.count - a.count);

    const now = Date.now();
    const freshness = { "<7d": 0, "7-30d": 0, "30-90d": 0, "90-365d": 0, ">1y": 0, unknown: 0 };
    for (const e of cat.entries || []) {
      const m = meta[`${e.type}:${e.id}`];
      if (!m || !m.committedAt) freshness.unknown++;
      else {
        const age = (now - new Date(m.committedAt).getTime()) / 86400000;
        if (age < 7) freshness["<7d"]++;
        else if (age < 30) freshness["7-30d"]++;
        else if (age < 90) freshness["30-90d"]++;
        else if (age < 365) freshness["90-365d"]++;
        else freshness[">1y"]++;
      }
    }

    const detected = Object.values(installed.items || {}).filter((it) => it.detected);
    const installedByType = { plugin: 0, skill: 0, mcp: 0 };
    for (const it of detected) {
      if (installedByType[it.type] !== undefined) installedByType[it.type]++;
    }

    res.json({
      total: cat.counts?.total ?? cat.entries?.length ?? 0,
      byType: cat.counts || { plugins: 0, skills: 0, mcps: 0 },
      byTag,
      topAuthors,
      freshness,
      installed: { total: detected.length, byType: installedByType },
    });
  });

  // ---- Changelog & Diffing -------------------------------------------------
  router.get("/changelog", (req, res) => {
    const cur = loadCatalog();
    const prev = readJson(PREV_CATALOG_PATH, null);
    if (!cur || !prev) return res.json({ added: [], removed: [], updated: [] });
    const prevMap = new Map((prev.entries || []).map((e) => [`${e.type}:${e.id}`, e]));
    const curMap = new Map((cur.entries || []).map((e) => [`${e.type}:${e.id}`, e]));
    const added = (cur.entries || []).filter((e) => !prevMap.has(`${e.type}:${e.id}`));
    const removed = (prev.entries || []).filter((e) => !curMap.has(`${e.type}:${e.id}`));
    const updated = [];
    for (const e of cur.entries || []) {
      const p = prevMap.get(`${e.type}:${e.id}`);
      if (!p) continue;
      const a = JSON.stringify({ n: p.name, t: p.tagline, d: p.description, c: p.install?.command });
      const b = JSON.stringify({ n: e.name, t: e.tagline, d: e.description, c: e.install?.command });
      if (a !== b) updated.push({ key: `${e.type}:${e.id}`, before: p, after: e });
    }
    res.json({ added, removed, updated });
  });

  // ---- Export / Import Handlers --------------------------------------------
  router.get("/export", (req, res) => {
    const state = loadInstalled();
    const payload = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      installed: Object.values(state.items || {}),
    };
    res.setHeader("Content-Disposition", `attachment; filename="cline-market-export-${Date.now()}.json"`);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(payload, null, 2));
  });

  router.post("/import", async (req, res) => {
    const items = req.body?.installed;
    if (!Array.isArray(items)) {
      return res.status(400).json({ ok: false, error: "Invalid import format. 'installed' array required.", code: "INVALID_PAYLOAD" });
    }
    const state = loadInstalled();
    let added = 0;
    const now = new Date().toISOString();
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      const type = sanitizePrimitiveType(it.type);
      const id = sanitizePrimitiveId(it.id);
      if (!type || !id) continue;

      const key = `${type}:${id}`;
      if (!state.items[key]) {
        state.items[key] = {
          type,
          id,
          scope: it.scope || "global",
          workspace: it.workspace || null,
          source: "import",
          installedAt: it.installedAt || now,
          lastSeenAt: now,
          installCommand: it.installCommand || null,
          detected: false,
        };
        added++;
      }
    }
    const reconciled = reconcile(state, fsProbe());
    await saveInstalled(reconciled);
    res.json({ ok: true, added, total: Object.keys(reconciled.items).length });
  });

  router.get("/version", (req, res) => {
    const pkg = readJson(join(root, "package.json"), { version: "1.0.0" });
    res.json({ version: pkg.version, app: "cline-marketplace" });
  });

  router.post("/shutdown", (req, res) => {
    res.json({ ok: true, message: "Shutting down local server gracefully..." });
    setTimeout(() => { process.exit(0); }, 500);
  });

  // 404 Handler for undefined /api routes
  router.use((req, res) => {
    res.status(404).json({
      ok: false,
      error: `Endpoint not found: ${req.method} ${req.originalUrl || req.url}`,
      code: "NOT_FOUND",
    });
  });

  return router;
}
