// Local browser for the Cline Marketplace.
// Serves the catalog, detects installed primitives on disk, runs
// `cline <type> install|uninstall` and tracks installation history.
//
// Hardened with Security Headers, Input Validation Guards,
// Atomic JSON Persistence, and Structured ANSI Terminal Logging.

import express from "express";
import { spawn, execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve, basename, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";
import net from "node:net";
import { resolveCommand, isWindowsBatchShim } from "./scripts/lib/resolve-command.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const dataDir = join(root, "data");
mkdirSync(dataDir, { recursive: true });

const CATALOG_PATH = join(root, "catalog.json");
const PREV_CATALOG_PATH = join(dataDir, "catalog-prev.json");
const META_PATH = join(dataDir, "upstream-meta.json");
const INSTALLED_PATH = join(dataDir, "installed.json");
const WATCHLIST_PATH = join(dataDir, "watchlist.json");
const CONTEXT_PATH = join(dataDir, "context-cache.json");

const DEFAULT_PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "127.0.0.1";

// ---- ANSI Structured Logger ------------------------------------------------

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${colors.gray}[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]${colors.reset}`;
}

const logger = {
  info: (msg, ...meta) => console.log(`${timestamp()} ${colors.cyan}[INFO]${colors.reset} ${msg}`, ...meta),
  success: (msg, ...meta) => console.log(`${timestamp()} ${colors.green}[SUCCESS]${colors.reset} ${msg}`, ...meta),
  warn: (msg, ...meta) => console.warn(`${timestamp()} ${colors.yellow}[WARN]${colors.reset} ${msg}`, ...meta),
  error: (msg, ...meta) => console.error(`${timestamp()} ${colors.red}[ERROR]${colors.reset} ${msg}`, ...meta),
  scan: (msg, ...meta) => console.log(`${timestamp()} ${colors.magenta}[SCAN]${colors.reset} ${msg}`, ...meta),
  exec: (cmd, durationMs, code = 0) => {
    const codeColor = code === 0 ? colors.green : colors.red;
    const dur = durationMs !== undefined ? `${colors.dim}(${durationMs}ms)${colors.reset}` : "";
    console.log(`${timestamp()} ${colors.blue}[EXEC]${colors.reset} ${cmd} -> ${codeColor}exit ${code}${colors.reset} ${dur}`);
  },
  http: (method, path, status, durationMs) => {
    const statusColor = status < 300 ? colors.green : status < 400 ? colors.cyan : status < 500 ? colors.yellow : colors.red;
    console.log(`${timestamp()} ${colors.cyan}[HTTP]${colors.reset} ${colors.bold}${method.padEnd(6)}${colors.reset} ${path} -> ${statusColor}${status}${colors.reset} ${colors.dim}(${durationMs}ms)${colors.reset}`);
  },
};

// ---- Security & Validation Guards ------------------------------------------

const VALID_TYPES = new Set(["plugin", "skill", "mcp"]);
const SAFE_ID_REGEX = /^[a-zA-Z0-9@_.-]+$/;

function sanitizePrimitiveType(type) {
  if (typeof type !== "string") return null;
  const clean = type.toLowerCase().trim();
  return VALID_TYPES.has(clean) ? clean : null;
}

function sanitizePrimitiveId(id) {
  if (typeof id !== "string") return null;
  const clean = id.trim();
  if (!clean || clean.length > 120) return null;
  if (!SAFE_ID_REGEX.test(clean)) return null;
  if (clean.includes("..") || clean.startsWith("/") || clean.startsWith("\\")) return null;
  return clean;
}

function sanitizeWorkspacePath(p) {
  if (!p || typeof p !== "string") return root;
  try {
    const resolved = resolve(normalize(p.trim()));
    if (existsSync(resolved) && statSync(resolved).isDirectory()) return resolved;
    return root;
  } catch {
    return root;
  }
}

// ---- Atomic File Helpers (Overwrite Protection) ----------------------------

function readJson(p, fallback = null) {
  try {
    if (!existsSync(p)) return fallback;
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (err) {
    logger.warn(`Failed reading JSON at ${p}: ${err.message}`);
    return fallback;
  }
}

function safeWriteJson(filePath, data) {
  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
    renameSync(tmpPath, filePath);
    return true;
  } catch (err) {
    logger.error(`Atomic write failed for ${filePath}: ${err.message}`);
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
    // Fallback direct write
    try {
      writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
      return true;
    } catch (fallbackErr) {
      logger.error(`Direct write fallback also failed for ${filePath}: ${fallbackErr.message}`);
      return false;
    }
  }
}

function loadCatalog() { return readJson(CATALOG_PATH); }
function loadPrevCatalog() { return readJson(PREV_CATALOG_PATH); }
function loadMeta() { return readJson(META_PATH, {}); }

function diffNewIds(current, prev) {
  if (!prev || !Array.isArray(prev.entries)) return new Set();
  const prevIds = new Set(prev.entries.map((e) => `${e.type}:${e.id}`));
  return new Set(
    (current.entries || [])
      .filter((e) => !prevIds.has(`${e.type}:${e.id}`))
      .map((e) => `${e.type}:${e.id}`),
  );
}

// ---- Installed registry ----------------------------------------------------

function emptyInstalled() {
  return { version: 1, lastScanAt: null, items: {} };
}

function loadInstalled() {
  const cur = readJson(INSTALLED_PATH, null);
  if (!cur || typeof cur !== "object") return emptyInstalled();
  if (!cur.items || typeof cur.items !== "object") cur.items = {};
  return cur;
}

function saveInstalled(state) {
  safeWriteJson(INSTALLED_PATH, state);
}

// ---- Filesystem probes ----------------------------------------------------

function clineRootCandidates() {
  const home = homedir();
  const candidates = [
    join(home, ".cline"),
    join(home, ".claude"),
  ];
  if (process.env.CLINE_HOME) candidates.unshift(process.env.CLINE_HOME);
  return candidates.filter((p) => existsSync(p));
}

function listDirSafe(p) {
  try {
    return existsSync(p) ? readdirSync(p) : [];
  } catch {
    return [];
  }
}

/**
 * Extract metadata from a local skill directory (README.md, SKILL.md, skill.json, package.json).
 */
function extractLocalSkillMeta(dirPath, id) {
  const meta = {
    name: id,
    tagline: `Local skill located in ${dirPath}`,
    description: `Custom local primitive discovered on your filesystem at ${dirPath}.`,
    tags: ["local", "custom", "skill"],
    author: "Local User",
  };

  const mdCandidates = ["SKILL.md", "skill.md", "README.md", "readme.md"];
  for (const mdName of mdCandidates) {
    const mdPath = join(dirPath, mdName);
    if (existsSync(mdPath)) {
      try {
        const content = readFileSync(mdPath, "utf8");
        const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (frontmatterMatch) {
          const fm = frontmatterMatch[1];
          const nameMatch = fm.match(/^name:\s*(.+)$/m);
          const descMatch = fm.match(/^description:\s*(.+)$/m);
          if (nameMatch) meta.name = nameMatch[1].trim();
          if (descMatch) {
            meta.tagline = descMatch[1].trim();
            meta.description = descMatch[1].trim();
          }
        } else {
          const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
          if (lines.length > 0) {
            const heading = lines[0].replace(/^#+\s*/, "").trim();
            if (heading) meta.name = heading;
            const desc = lines.find((l, idx) => idx > 0 && !l.startsWith("#") && !l.startsWith("---"));
            if (desc) {
              meta.tagline = desc.trim();
              meta.description = desc.trim();
            }
          }
        }
        break;
      } catch {}
    }
  }

  const jsonCandidates = ["skill.json", "package.json"];
  for (const jName of jsonCandidates) {
    const jPath = join(dirPath, jName);
    if (existsSync(jPath)) {
      try {
        const j = JSON.parse(readFileSync(jPath, "utf8"));
        if (j.name) meta.name = j.name;
        if (j.description) {
          meta.tagline = j.description;
          meta.description = j.description;
        }
        if (j.author) meta.author = typeof j.author === "string" ? j.author : j.author.name || meta.author;
        if (Array.isArray(j.keywords)) meta.tags = [...new Set([...meta.tags, ...j.keywords])];
        break;
      } catch {}
    }
  }

  return meta;
}

/**
 * Probes all locations for installed plugins, skills, and MCP servers.
 */
function fsProbe() {
  const home = homedir();
  const roots = clineRootCandidates();
  const found = {
    plugins: new Map(), // id -> { id, path, metadata }
    skills: new Map(),  // id -> { id, path, metadata }
    mcps: new Map(),    // id -> { id, config, source }
  };

  // 1. Probing roots for plugins and skills
  for (const rootPath of roots) {
    // Plugins (direct folders + _installed/<scope>/<id-hash>)
    const pluginsDir = join(rootPath, "plugins");
    for (const id of listDirSafe(pluginsDir)) {
      if (id === "_installed" || id === ".tmp") continue;
      const pluginDir = join(pluginsDir, id);
      try {
        if (statSync(pluginDir).isDirectory()) {
          found.plugins.set(id, {
            id,
            path: pluginDir,
            metadata: extractLocalSkillMeta(pluginDir, id),
          });
        }
      } catch {}
    }

    const instPluginsDir = join(pluginsDir, "_installed");
    if (existsSync(instPluginsDir)) {
      for (const scope of listDirSafe(instPluginsDir)) {
        const scopePath = join(instPluginsDir, scope);
        try {
          if (statSync(scopePath).isDirectory() && !scope.startsWith(".")) {
            for (const entryName of listDirSafe(scopePath)) {
              const entryPath = join(scopePath, entryName);
              if (statSync(entryPath).isDirectory()) {
                const cleanId = entryName.replace(/-[a-f0-9]{8,}$/, "");
                const pkgDir = existsSync(join(entryPath, "package")) ? join(entryPath, "package") : entryPath;
                found.plugins.set(cleanId, {
                  id: cleanId,
                  rawId: entryName,
                  scope,
                  path: entryPath,
                  metadata: extractLocalSkillMeta(pkgDir, cleanId),
                });
              }
            }
          }
        } catch {}
      }
    }

    // Skills
    for (const id of listDirSafe(join(rootPath, "skills"))) {
      const skillDir = join(rootPath, "skills", id);
      try {
        if (statSync(skillDir).isDirectory()) {
          found.skills.set(id, {
            id,
            path: skillDir,
            metadata: extractLocalSkillMeta(skillDir, id),
          });
        }
      } catch {}
    }
  }

  // 2. MCP Server configuration file candidates across VS Code, Cline CLI, and Claude
  const isWin = platform() === "win32";
  const appData = process.env.APPDATA || join(home, "AppData", "Roaming");

  const mcpConfigFiles = [];

  if (isWin) {
    mcpConfigFiles.push(
      join(appData, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      join(appData, "Code", "User", "globalStorage", "cline.cline", "settings", "cline_mcp_settings.json"),
      join(appData, "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings", "mcp_settings.json"),
      join(appData, "Claude", "claude_desktop_config.json")
    );
  } else if (platform() === "darwin") {
    mcpConfigFiles.push(
      join(home, "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      join(home, "Library", "Application Support", "Code", "User", "globalStorage", "cline.cline", "settings", "cline_mcp_settings.json"),
      join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
    );
  } else {
    mcpConfigFiles.push(
      join(home, ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      join(home, ".config", "Code", "User", "globalStorage", "cline.cline", "settings", "cline_mcp_settings.json"),
      join(home, ".config", "Claude", "claude_desktop_config.json")
    );
  }

  // Cline roots standard config files
  for (const rootPath of roots) {
    mcpConfigFiles.push(
      join(rootPath, "cline_mcp_settings.json"),
      join(rootPath, "mcp_servers.json"),
      join(rootPath, "mcp_settings.json"),
      join(rootPath, "data", "settings", "cline_mcp_settings.json"),
      join(rootPath, "data", "settings", "mcp_settings.json"),
      join(rootPath, "mcp", "servers.json"),
      join(rootPath, "mcp.json")
    );
  }

  for (const cfgFile of mcpConfigFiles) {
    if (existsSync(cfgFile)) {
      try {
        const raw = readJson(cfgFile);
        if (!raw) continue;
        const servers = raw.mcpServers || raw.mcp_servers || (raw.servers && typeof raw.servers === "object" ? raw.servers : null);
        if (servers && typeof servers === "object") {
          for (const [id, srvConfig] of Object.entries(servers)) {
            if (id && !found.mcps.has(id)) {
              found.mcps.set(id, { id, config: srvConfig, source: cfgFile });
            }
          }
        }
      } catch {}
    }
  }

  return { found, roots };
}

/**
 * Reconciles disk state with data/installed.json.
 */
function reconcile(state, probe) {
  const now = new Date().toISOString();
  state.lastScanAt = now;

  for (const [id, info] of probe.found.plugins) {
    const key = `plugin:${id}`;
    if (!state.items[key]) {
      state.items[key] = {
        type: "plugin",
        id,
        source: "filesystem",
        installedAt: now,
        lastSeenAt: now,
        installCommand: null,
        detected: true,
        metadata: info.metadata,
      };
    } else {
      state.items[key].detected = true;
      state.items[key].lastSeenAt = now;
      if (info.metadata) state.items[key].metadata = info.metadata;
    }
  }

  for (const [id, info] of probe.found.skills) {
    const key = `skill:${id}`;
    if (!state.items[key]) {
      state.items[key] = {
        type: "skill",
        id,
        source: "filesystem",
        installedAt: now,
        lastSeenAt: now,
        installCommand: null,
        detected: true,
        metadata: info.metadata,
      };
    } else {
      state.items[key].detected = true;
      state.items[key].lastSeenAt = now;
      if (info.metadata) state.items[key].metadata = info.metadata;
    }
  }

  for (const [id, info] of probe.found.mcps) {
    const key = `mcp:${id}`;
    if (!state.items[key]) {
      state.items[key] = {
        type: "mcp",
        id,
        source: "filesystem",
        installedAt: now,
        lastSeenAt: now,
        installCommand: null,
        detected: true,
        config: info.config,
      };
    } else {
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

// ---- Command Execution ----------------------------------------------------

let _cachedClinePath = null;

async function resolveCline() {
  if (_cachedClinePath) return _cachedClinePath;
  const p = await resolveCommand("cline");
  if (p) _cachedClinePath = p;
  return p;
}

function verbFor(type) {
  if (type === "skill") return "skill";
  if (type === "mcp") return "mcp";
  return "plugin";
}

async function runCline(args, { timeoutMs = 180_000 } = {}) {
  const exe = await resolveCline();
  if (!exe) {
    throw new Error(
      "The 'cline' CLI was not found on PATH. Install it from https://docs.cline.bot",
    );
  }

  const isBatch = isWindowsBatchShim(exe);
  const startTime = Date.now();
  const cmdStr = `cline ${args.join(" ")}`;

  return new Promise((resolveRun, rejectRun) => {
    let proc;
    try {
      if (isBatch) {
        proc = spawn(exe, args, {
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          shell: true,
        });
      } else {
        proc = spawn(exe, args, {
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
      }
    } catch (err) {
      rejectRun(new Error(`Failed to spawn 'cline': ${err.message}`));
      return;
    }

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      try { proc.kill("SIGTERM"); } catch {}
      rejectRun(new Error(`Command timed out after ${timeoutMs / 1000}s: ${cmdStr}`));
    }, timeoutMs);

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("error", (err) => {
      clearTimeout(timer);
      rejectRun(new Error(`Spawn error: ${err.message}`));
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;
      logger.exec(cmdStr, duration, code ?? 0);
      if (!killed) {
        resolveRun({ code: code ?? 0, stdout, stderr, durationMs: duration });
      }
    });
  });
}

async function probeBin(binName, args = ["--version"]) {
  const exe = await resolveCommand(binName);
  if (!exe) return { ok: false, error: `${binName} not found on PATH or standard directories` };

  const isBatch = isWindowsBatchShim(exe);
  return new Promise((resolveProbe) => {
    let proc;
    try {
      proc = isBatch
        ? spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, shell: true })
        : spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (err) {
      resolveProbe({ ok: false, error: err.message, path: exe });
      return;
    }

    let out = "", err = "";
    const timer = setTimeout(() => {
      try { proc.kill(); } catch {}
      resolveProbe({ ok: false, error: "timeout", path: exe });
    }, 5000);

    proc.stdout?.on("data", (d) => { out += d.toString(); });
    proc.stderr?.on("data", (d) => { err += d.toString(); });

    proc.on("error", (e) => {
      clearTimeout(timer);
      resolveProbe({ ok: false, error: e.message, path: exe });
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      const ok = code === 0;
      const firstLine = (out || err || "").trim().split(/\r?\n/)[0] || "";
      const versionMatch = firstLine.match(/(\d+\.\d+[\.\w-]*)/);
      resolveProbe({
        ok,
        path: exe,
        version: versionMatch ? versionMatch[1] : firstLine || null,
        detail: firstLine,
        error: ok ? null : (err.trim() || `exit code ${code}`),
      });
    });
  });
}

// ---- Express Application Setup ---------------------------------------------

const app = express();

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// JSON Body Parser with Payload Limit Guard
app.use(express.json({ limit: "500kb" }));

// HTTP Request Logger Middleware
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    const start = Date.now();
    res.on("finish", () => {
      logger.http(req.method, req.path, res.statusCode, Date.now() - start);
    });
  }
  next();
});

// ---- Catalog API -----------------------------------------------------------

app.get("/api/catalog", (req, res) => {
  const cat = loadCatalog();
  if (!cat) {
    return res.status(503).json({
      error: "Catalog not ready. Run `cline-marketplace refresh` or use the Refresh button.",
    });
  }
  const prev = loadPrevCatalog();
  const meta = loadMeta();
  const newIds = diffNewIds(cat, prev);
  const installed = reconcile(loadInstalled(), fsProbe());

  const enriched = cat.entries.map((e) => {
    const key = `${e.type}:${e.id}`;
    const m = meta[key];
    const isNew = newIds.has(key);
    return {
      ...e,
      key,
      isNew,
      updatedAt: m?.committedAt || null,
      lastCommit: m
        ? { sha: m.sha, committedAt: m.committedAt, message: m.message }
        : null,
    };
  });

  const enrichedKeys = new Set(enriched.map((e) => e.key));
  const localEntries = [];

  for (const [key, item] of Object.entries(installed.items)) {
    if (!enrichedKeys.has(key) && item.detected) {
      localEntries.push({
        id: item.id,
        type: item.type,
        name: item.metadata?.name || item.id,
        tagline: item.metadata?.tagline || `Local ${item.type} installed on disk`,
        description: item.metadata?.description || `Custom primitive discovered in local environment.`,
        author: { name: item.metadata?.author || "Local Machine", url: null },
        tags: item.metadata?.tags || ["local", "custom", item.type],
        verified: false,
        featured: false,
        isLocal: true,
        key,
        isNew: false,
        updatedAt: item.lastSeenAt || item.installedAt,
        install: {
          args: [item.id],
          command: item.installCommand || `cline ${verbFor(item.type)} install ${item.id}`,
        },
      });
    }
  }

  const allEntries = [...enriched, ...localEntries];

  const counts = {
    total: allEntries.length,
    marketplace: enriched.length,
    local: localEntries.length,
    plugins: allEntries.filter((e) => e.type === "plugin").length,
    skills: allEntries.filter((e) => e.type === "skill").length,
    mcps: allEntries.filter((e) => e.type === "mcp").length,
  };

  res.json({
    ...cat,
    entries: allEntries,
    counts,
    tags: cat.tags || [],
    metaCount: Object.keys(meta).length,
  });
});

// ---- Installed registry API ------------------------------------------------

app.get("/api/installed", (req, res) => {
  const probe = fsProbe();
  const state = reconcile(loadInstalled(), probe);
  saveInstalled(state);
  res.json(state);
});

app.get("/api/status", (req, res) => {
  const probe = fsProbe();
  const installed = reconcile(loadInstalled(), probe);
  const catalog = loadCatalog();
  const meta = loadMeta();
  const pkg = readJson(join(root, "package.json"), { version: "1.0.0" });

  res.json({
    ok: true,
    version: pkg.version,
    node: process.version,
    platform: platform(),
    clinePath: _cachedClinePath || null,
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

app.get("/api/version", (req, res) => {
  const pkg = readJson(join(root, "package.json"), { version: "1.0.0" });
  res.json({ version: pkg.version, app: "cline-marketplace" });
});

// ---- Install / Uninstall / Mark Handlers (with Guard Protection) ----------

app.post("/api/install", async (req, res) => {
  const type = sanitizePrimitiveType(req.body?.type);
  const id = sanitizePrimitiveId(req.body?.id);

  if (!type || !id) {
    return res.status(400).json({ error: "Valid 'type' (plugin|skill|mcp) and 'id' are required." });
  }

  const catalog = loadCatalog();
  const entry = catalog?.entries?.find((e) => e.type === type && e.id === id);

  const verb = verbFor(type || entry?.type);
  let args = entry?.install?.args
    ? [verb, "install", ...entry.install.args]
    : [verb, "install", id];

  let result;
  try {
    result = await runCline(args);
    // Automatic retry with --force if already installed
    if (result.code !== 0 && (result.stderr.includes("already installed") || result.stderr.includes("--force"))) {
      const forceArgs = [...args, "--force"];
      const retryResult = await runCline(forceArgs);
      if (retryResult.code === 0) {
        result = retryResult;
        args = forceArgs;
      }
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
      source: entry ? "marketplace" : "manual",
      installedAt: now,
      lastSeenAt: now,
      installCommand: entry?.install?.command || `cline ${verb} install ${id}`,
      detected: result.code === 0,
    };
  } else {
    state.items[key].installCommand = entry?.install?.command || state.items[key].installCommand;
    state.items[key].lastSeenAt = now;
    if (result.code === 0) state.items[key].detected = true;
  }
  state = reconcile(state, fsProbe());
  saveInstalled(state);

  res.json({
    ok: result.code === 0,
    exitCode: result.code,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    command: `cline ${args.join(" ")}`,
    installed: state.items[key],
  });
});

app.post("/api/uninstall", async (req, res) => {
  const type = sanitizePrimitiveType(req.body?.type);
  const id = sanitizePrimitiveId(req.body?.id);

  if (!type || !id) {
    return res.status(400).json({ error: "Valid 'type' (plugin|skill|mcp) and 'id' are required." });
  }

  const verb = verbFor(type);
  const args = [verb, "uninstall", id];

  let result;
  try {
    result = await runCline(args);
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }

  let state = loadInstalled();
  const key = `${type}:${id}`;
  if (state.items[key]) {
    state.items[key].detected = false;
    state.items[key].lastSeenAt = new Date().toISOString();
  }
  saveInstalled(state);

  res.json({
    ok: result.code === 0,
    exitCode: result.code,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    command: `cline ${args.join(" ")}`,
  });
});

app.post("/api/mark", (req, res) => {
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
  saveInstalled(state);
  res.json({ ok: true, item: state.items[key] });
});

app.delete("/api/mark/:type/:id", (req, res) => {
  const type = sanitizePrimitiveType(req.params.type);
  const id = sanitizePrimitiveId(req.params.id);

  if (!type || !id) return res.status(400).json({ error: "Invalid type or id" });

  const state = loadInstalled();
  const key = `${type}:${id}`;
  if (state.items[key]) {
    delete state.items[key];
    saveInstalled(state);
  }
  res.json({ ok: true });
});

// Trigger refresh script in-process
app.post("/api/refresh", (req, res) => {
  const args = [join(root, "scripts", "refresh-catalog.mjs")];
  if (req.body?.entriesOnly) args.push("--catalog");

  const child = execFile(process.execPath, args, { cwd: root }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({
        error: "Refresh failed",
        stdout: String(stdout || ""),
        stderr: String(stderr || err.message),
      });
    }
    const cat = loadCatalog();
    const meta = loadMeta();
    res.json({
      ok: true,
      entries: cat?.counts?.total ?? cat?.entries?.length ?? 0,
      metaCount: Object.keys(meta).length,
      stdout: String(stdout || ""),
      stderr: String(stderr || ""),
    });
  });
  child.stdout?.on("data", (d) => process.stdout.write(`[refresh] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[refresh] ${d}`));
});

// ---- Project context (CWD detection + recommendations) -------------------

const { execFile: execFileCtx } = await import("node:child_process");
const { promisify: pCtx } = await import("node:util");
const execFilePctx = pCtx(execFileCtx);

async function detectContext(cwd) {
  const cache = readJson(CONTEXT_PATH, {});
  const safeCwd = sanitizeWorkspacePath(cwd);
  let pkgMtime = 0;
  try { pkgMtime = statSync(join(safeCwd, "package.json")).mtimeMs; } catch {}
  const cached = cache[safeCwd];
  if (cached && cached.pkgMtime === pkgMtime) return cached.result;
  try {
    const { stdout } = await execFilePctx(
      process.execPath,
      [join(root, "scripts/detect-context.mjs"), safeCwd],
      { cwd: root, timeout: 10_000 },
    );
    const result = JSON.parse(stdout);
    cache[safeCwd] = { pkgMtime, result };
    safeWriteJson(CONTEXT_PATH, cache);
    return result;
  } catch (err) {
    return {
      cwd: safeCwd, repo: null, languages: [], frameworks: [], tags: [], hints: [],
      error: String(err.message || err),
    };
  }
}

function scoreEntryForContext(entry, ctx) {
  let score = 0;
  const reasons = [];
  const text = `${entry.name} ${entry.tagline || ""} ${entry.description || ""} ${entry.id}`.toLowerCase();

  for (const t of ctx.tags || []) {
    if ((entry.tags || []).includes(t)) {
      score += 6;
      reasons.push(`tag:${t}`);
    }
  }

  for (const fw of ctx.frameworks || []) {
    if (text.includes(fw.toLowerCase())) {
      score += 8;
      reasons.push(`framework:${fw}`);
    }
  }

  for (const lang of ctx.languages || []) {
    if (text.includes(lang.toLowerCase())) {
      score += 4;
      reasons.push(`language:${lang}`);
    }
  }

  if (ctx.repo && (entry.id.includes("github") || text.includes("git") || text.includes("pull request"))) {
    score += 7;
    reasons.push("git workflow");
  }

  if (entry.id === "goal" || entry.id === "context7") {
    score += 5;
    reasons.push("essential workflow");
  }

  if (entry.verified) { score += 3; reasons.push("verified"); }
  if (entry.featured) { score += 2; reasons.push("featured"); }

  const matchPercent = Math.min(99, Math.max(68, Math.round(55 + score * 2.5)));
  return { score, reasons: [...new Set(reasons)], matchPercent };
}

function generateCuratedBundles(catalogEntries, ctx) {
  const bundles = [];
  const entriesMap = new Map((catalogEntries || []).map((e) => [e.id, e]));

  const webIds = ["goal", "context7", "github", "postman", "fetch"].filter((id) => entriesMap.has(id));
  if (webIds.length >= 2) {
    bundles.push({
      id: "web-essentials",
      title: "Fullstack & API Toolchain",
      description: "Documentation, goal tracking, and GitHub workflow tools tailored for web applications.",
      items: webIds.map((id) => entriesMap.get(id)),
    });
  }

  const cfIds = ["cloudflare-docs", "cloudflare-bindings", "cloudflare-builds", "cloudflare-observability"].filter((id) => entriesMap.has(id));
  if (cfIds.length >= 2) {
    bundles.push({
      id: "cloudflare-suite",
      title: "Cloudflare Serverless Suite",
      description: "Bindings, observability, builds, and live API documentation for Cloudflare Workers.",
      items: cfIds.map((id) => entriesMap.get(id)),
    });
  }

  const dbIds = ["neon", "supabase", "postgres", "redis", "mongodb"].filter((id) => entriesMap.has(id));
  if (dbIds.length >= 2) {
    bundles.push({
      id: "database-pack",
      title: "Database & Storage Toolchain",
      description: "Direct SQL execution, schema inspection, and database connector primitives.",
      items: dbIds.map((id) => entriesMap.get(id)),
    });
  }

  return bundles;
}

app.get("/api/context", async (req, res) => {
  const rawCwd = (req.query.cwd || process.cwd()).toString();
  const safeCwd = sanitizeWorkspacePath(rawCwd);
  const ctx = await detectContext(safeCwd);
  const catalog = loadCatalog();
  if (!catalog) return res.json({ ...ctx, recommendations: [], bundles: [] });

  const scored = catalog.entries
    .map((e) => ({ entry: e, ...scoreEntryForContext(e, ctx) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map((s) => ({
      key: `${s.entry.type}:${s.entry.id}`,
      score: s.score,
      matchPercent: s.matchPercent,
      reasons: s.reasons,
      entry: s.entry,
    }));

  const bundles = generateCuratedBundles(catalog.entries, ctx);
  res.json({ ...ctx, recommendations: scored, bundles });
});

// ---- Watchlist API --------------------------------------------------------

function loadWatchlist() { return readJson(WATCHLIST_PATH, { items: [] }); }
function saveWatchlist(state) { safeWriteJson(WATCHLIST_PATH, state); }

app.get("/api/watchlist", (req, res) => res.json(loadWatchlist()));

app.post("/api/watchlist", (req, res) => {
  const type = sanitizePrimitiveType(req.body?.type);
  const id = sanitizePrimitiveId(req.body?.id);

  if (!type || !id) {
    return res.status(400).json({ error: "Valid 'type' and 'id' required" });
  }

  const w = loadWatchlist();
  const key = `${type}:${id}`;
  if (!w.items.find((x) => x.key === key)) {
    w.items.push({ key, type, id, addedAt: new Date().toISOString() });
    saveWatchlist(w);
  }
  res.json({ ok: true, items: w.items });
});

app.delete("/api/watchlist/:type/:id", (req, res) => {
  const type = sanitizePrimitiveType(req.params.type);
  const id = sanitizePrimitiveId(req.params.id);

  if (!type || !id) return res.status(400).json({ error: "Invalid type or id" });

  const w = loadWatchlist();
  w.items = w.items.filter((x) => !(x.type === type && x.id === id));
  saveWatchlist(w);
  res.json({ ok: true, items: w.items });
});

// ---- Bulk operations API ---------------------------------------------------

app.post("/api/bulk", async (req, res) => {
  const { action, items } = req.body || {};
  if (!["install", "uninstall", "watch", "unwatch"].includes(action)) {
    return res.status(400).json({ error: "Action must be install|uninstall|watch|unwatch" });
  }
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "Items array required" });
  }

  // Sanitized items
  const cleanItems = [];
  for (const it of items.slice(0, 30)) {
    const type = sanitizePrimitiveType(it.type);
    const id = sanitizePrimitiveId(it.id);
    if (type && id) cleanItems.push({ type, id });
  }

  if (action === "watch" || action === "unwatch") {
    const w = loadWatchlist();
    for (const it of cleanItems) {
      const key = `${it.type}:${it.id}`;
      if (action === "watch" && !w.items.find((x) => x.key === key)) {
        w.items.push({ key, type: it.type, id: it.id, addedAt: new Date().toISOString() });
      } else if (action === "unwatch") {
        w.items = w.items.filter((x) => x.key !== key);
      }
    }
    saveWatchlist(w);
    return res.json({ ok: true, action, items: w.items });
  }

  const catalog = loadCatalog();
  const results = [];

  for (const it of cleanItems) {
    const entry = catalog?.entries?.find((e) => e.type === it.type && e.id === it.id);
    const verb = verbFor(it.type || entry?.type);
    let runArgs = action === "install"
      ? (entry?.install?.args ? [verb, "install", ...entry.install.args] : [verb, "install", it.id])
      : [verb, "uninstall", it.id];

    try {
      let r = await runCline(runArgs, { timeoutMs: 180_000 });
      if (action === "install" && r.code !== 0 && (r.stderr.includes("already installed") || r.stderr.includes("--force"))) {
        const forceArgs = [...runArgs, "--force"];
        const retryR = await runCline(forceArgs, { timeoutMs: 180_000 });
        if (retryR.code === 0) {
          r = retryR;
          runArgs = forceArgs;
        }
      }
      results.push({
        ...it,
        ok: r.code === 0,
        exitCode: r.code,
        stdout: r.stdout.trim(),
        stderr: r.stderr.trim(),
        command: `cline ${runArgs.join(" ")}`,
      });
    } catch (err) {
      results.push({ ...it, ok: false, error: String(err.message || err) });
    }
  }

  saveInstalled(reconcile(loadInstalled(), fsProbe()));
  res.json({ ok: true, action, results });
});

// ---- Export / Import API (with Overwrite Guard) ----------------------------

app.get("/api/export", (req, res) => {
  const state = loadInstalled();
  const out = {
    exportedAt: new Date().toISOString(),
    source: "cline-marketplace-local",
    installed: Object.values(state.items).map((it) => ({
      type: it.type,
      id: it.id,
      source: it.source,
      installedAt: it.installedAt,
      installCommand: it.installCommand,
    })),
  };
  res.setHeader("content-disposition", `attachment; filename="cline-marketplace-installed-${Date.now()}.json"`);
  res.json(out);
});

app.post("/api/import", (req, res) => {
  const { installed, overwrite } = req.body || {};
  if (!Array.isArray(installed)) return res.status(400).json({ error: "Installed array required" });

  let state = overwrite === true ? emptyInstalled() : loadInstalled();
  let added = 0;

  for (const it of installed.slice(0, 100)) {
    const type = sanitizePrimitiveType(it.type);
    const id = sanitizePrimitiveId(it.id);
    if (!type || !id) continue;

    const key = `${type}:${id}`;
    if (!state.items[key] || overwrite === true) {
      state.items[key] = {
        type,
        id,
        source: it.source || "import",
        installedAt: it.installedAt || new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        installCommand: it.installCommand || null,
        detected: false,
      };
      added++;
    }
  }

  saveInstalled(reconcile(state, fsProbe()));
  res.json({ ok: true, added, total: Object.keys(state.items).length });
});

// ---- Stats API -------------------------------------------------------------

app.get("/api/stats", (req, res) => {
  const catalog = loadCatalog();
  if (!catalog) return res.json({});
  const installed = loadInstalled();
  const meta = loadMeta();

  const byAuthor = new Map();
  for (const e of catalog.entries) {
    const a = e.author?.name || "Unknown";
    byAuthor.set(a, (byAuthor.get(a) || 0) + 1);
  }
  const topAuthors = [...byAuthor.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const byTag = (catalog.tags || [])
    .map((t) => ({ id: t.id, label: t.label, count: t.count }))
    .sort((a, b) => b.count - a.count);

  const now = Date.now();
  const freshness = { "<7d": 0, "7-30d": 0, "30-90d": 0, "90-365d": 0, ">1y": 0, unknown: 0 };
  for (const e of catalog.entries) {
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

  const detected = Object.values(installed.items).filter((it) => it.detected);
  const installedByType = { plugin: 0, skill: 0, mcp: 0 };
  for (const it of detected) {
    if (installedByType[it.type] !== undefined) installedByType[it.type]++;
  }

  res.json({
    total: catalog.counts?.total ?? catalog.entries.length,
    byType: catalog.counts,
    byTag, topAuthors, freshness,
    installed: { total: detected.length, byType: installedByType },
  });
});

// ---- Health check API -----------------------------------------------------

app.get("/api/health", async (req, res) => {
  const checks = [];

  // 1. Node Runtime Check
  checks.push({
    name: "node",
    ok: true,
    detail: `${process.version} (${process.arch})`,
    path: process.execPath,
  });

  // 2. Cline CLI Check
  const clineCheck = await probeBin("cline", ["--version"]);
  checks.push({
    name: "cline",
    ...clineCheck,
    detail: clineCheck.version ? `v${clineCheck.version} at ${clineCheck.path}` : (clineCheck.error || "not found"),
  });

  // 3. GitHub CLI Check
  const ghCheck = await probeBin("gh", ["auth", "status"]);
  checks.push({
    name: "gh",
    ...ghCheck,
    detail: ghCheck.ok ? (ghCheck.detail || "authenticated") : (ghCheck.error || "not logged in"),
  });

  // 4. Local Cline Environments
  const probe = fsProbe();
  const totalDetected = probe.found.plugins.size + probe.found.skills.size + probe.found.mcps.size;
  checks.push({
    name: "cline-storage",
    ok: probe.roots.length > 0 || totalDetected > 0,
    detail: probe.roots.join(", ") || "no ~/.cline found",
    counts: {
      plugins: probe.found.plugins.size,
      skills: probe.found.skills.size,
      mcps: probe.found.mcps.size,
    },
  });

  // 5. Catalog Check
  const cat = loadCatalog();
  checks.push({
    name: "catalog",
    ok: Boolean(cat && cat.entries && cat.entries.length > 0),
    detail: cat
      ? `${cat.counts?.total ?? cat.entries.length} entries, generated ${cat.generatedAt}`
      : "missing — run cline-marketplace refresh",
  });

  // 6. Metadata Check
  const meta = loadMeta();
  const metaSize = Object.keys(meta).length;
  checks.push({
    name: "metadata",
    ok: metaSize > 0,
    detail: metaSize > 0 ? `${metaSize} upstream commit records cached` : "empty — run refresh to fetch commit timestamps",
  });

  res.json({
    ok: checks.filter((c) => c.name !== "metadata" && c.name !== "gh").every((c) => c.ok),
    checks,
    system: {
      platform: platform(),
      arch: process.arch,
      node: process.version,
      clinePath: clineCheck.path || null,
      uptime: Math.round(process.uptime()),
    },
  });
});

// ---- Changelog API --------------------------------------------------------

app.get("/api/changelog", (req, res) => {
  const cur = loadCatalog();
  const prev = loadPrevCatalog();
  if (!cur || !prev) return res.json({ added: [], removed: [], updated: [] });
  const prevMap = new Map(prev.entries.map((e) => [`${e.type}:${e.id}`, e]));
  const curMap = new Map(cur.entries.map((e) => [`${e.type}:${e.id}`, e]));
  const added = cur.entries.filter((e) => !prevMap.has(`${e.type}:${e.id}`));
  const removed = prev.entries.filter((e) => !curMap.has(`${e.type}:${e.id}`));
  const updated = [];
  for (const e of cur.entries) {
    const p = prevMap.get(`${e.type}:${e.id}`);
    if (!p) continue;
    const a = JSON.stringify({ n: p.name, t: p.tagline, d: p.description, c: p.install?.command });
    const b = JSON.stringify({ n: e.name, t: e.tagline, d: e.description, c: e.install?.command });
    if (a !== b) updated.push({ key: `${e.type}:${e.id}`, before: p, after: e });
  }
  res.json({ added, removed, updated });
});

// ---- Shutdown endpoint ----------------------------------------------------

app.post("/api/shutdown", (req, res) => {
  logger.warn("Shutdown requested from web interface. Terminating process cleanly...");
  res.json({ ok: true, message: "Server shutting down" });
  setTimeout(() => {
    process.exit(0);
  }, 350);
});

// Static frontend
app.use(express.static(join(root, "public")));

app.get("/", (req, res) => {
  res.sendFile(join(root, "public", "index.html"));
});

// Eagerly resolve the `cline` CLI on startup
resolveCline().then((p) => {
  if (!p) {
    logger.warn("the 'cline' CLI was not found on PATH. Install it from https://docs.cline.bot");
  } else {
    logger.success(`cline CLI binary resolved at: ${colors.cyan}${p}${colors.reset}`);
  }
}).catch((e) => logger.warn(`cline resolve error: ${e?.message}`));

// ---- Dynamic Port Binding & Server Startup --------------------------------

function checkPortAvailable(port, host) {
  return new Promise((resolveAvailable) => {
    const tester = net.createServer()
      .once("error", (err) => {
        if (err.code === "EADDRINUSE") resolveAvailable(false);
        else resolveAvailable(false);
      })
      .once("listening", () => {
        tester.once("close", () => resolveAvailable(true)).close();
      })
      .listen(port, host);
  });
}

async function findAvailablePort(startPort, host, maxAttempts = 20) {
  for (let p = startPort; p < startPort + maxAttempts; p++) {
    if (await checkPortAvailable(p, host)) return p;
  }
  return startPort;
}

async function startServerWithDynamicPort() {
  let targetPort = DEFAULT_PORT;
  const isAvailable = await checkPortAvailable(targetPort, HOST);

  if (!isAvailable) {
    logger.warn(`Port ${targetPort} is currently in use. Searching for next available port...`);
    targetPort = await findAvailablePort(DEFAULT_PORT + 1, HOST, 25);
    logger.info(`Dynamic port switch selected port: ${colors.bold}${targetPort}${colors.reset}`);
  }

  const server = app.listen(targetPort, HOST, () => {
    const url = `http://${HOST}:${targetPort}`;
    console.log("");
    console.log(`${colors.cyan}┌────────────────────────────────────────────────────────┐${colors.reset}`);
    console.log(`${colors.cyan}│${colors.reset}  ${colors.bold}Cline Marketplace Local Server — Ready${colors.reset}${" ".repeat(18)}${colors.cyan}│${colors.reset}`);
    console.log(`${colors.cyan}│${colors.reset}  ${colors.gray}URL:${colors.reset}   ${colors.green}${url.padEnd(46)}${colors.reset}${colors.cyan}│${colors.reset}`);
    console.log(`${colors.cyan}│${colors.reset}  ${colors.gray}Data:${colors.reset}  ${dataDir.padEnd(46).slice(0, 46)}${colors.cyan}│${colors.reset}`);
    console.log(`${colors.cyan}│${colors.reset}  ${colors.gray}Stop:${colors.reset}  ${colors.yellow}Ctrl+C or Click 'Stop Server' in Web UI${colors.reset}${" ".repeat(7)}${colors.cyan}│${colors.reset}`);
    console.log(`${colors.cyan}└────────────────────────────────────────────────────────┘${colors.reset}`);
    console.log("");

    const probe = fsProbe();
    if (probe.roots.length === 0) {
      logger.info("Note: no ~/.cline directory found yet. Install primitives with the cline CLI.");
    } else {
      logger.scan(`Discovered local storage roots: ${colors.dim}${probe.roots.join(", ")}${colors.reset}`);
    }
  });

  server.on("error", (err) => {
    logger.error(`Fatal server error: ${err.message}`);
    process.exit(1);
  });
}

startServerWithDynamicPort().catch((err) => {
  logger.error(`Startup failed: ${err.message}`);
  process.exit(1);
});