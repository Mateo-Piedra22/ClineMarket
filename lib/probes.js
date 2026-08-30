// Filesystem probing and local storage inspection engine

import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { homedir, platform } from "node:os";
import { readJson } from "./state.js";

// Mtime cache for local skill/plugin package.json files (LRU capped at 500 entries)
const _metaCache = new Map(); // path -> { mtimeMs, meta }
const MAX_META_CACHE_SIZE = 500;

function setMetaCache(key, value) {
  if (_metaCache.size >= MAX_META_CACHE_SIZE) {
    const oldestKey = _metaCache.keys().next().value;
    if (oldestKey !== undefined) _metaCache.delete(oldestKey);
  }
  _metaCache.set(key, value);
}

export function listDirSafe(dir) {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * Returns list of potential root directories where Cline/Claude plugins/skills live.
 * @returns {string[]}
 */
export function clineRootCandidates() {
  const home = homedir();
  const candidates = [
    join(home, ".cline"),
    join(home, ".claude"),
    join(home, ".cursor"),
    join(home, ".commandcode"),
    join(home, ".agents"),
  ];

  if (platform() === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    candidates.push(
      join(appData, "Code", "User", "globalStorage", "saoudrizwan.claude-dev"),
      join(appData, "Code", "User", "globalStorage", "cline.cline"),
      join(appData, "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline"),
      join(appData, "Cursor", "User", "globalStorage", "saoudrizwan.claude-dev"),
      join(appData, "Cursor", "User", "globalStorage", "cline.cline"),
      join(appData, "VSCodium", "User", "globalStorage", "saoudrizwan.claude-dev"),
      join(appData, "VSCodium", "User", "globalStorage", "cline.cline"),
      join(appData, "Claude")
    );
  } else if (platform() === "darwin") {
    candidates.push(
      join(home, "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev"),
      join(home, "Library", "Application Support", "Code", "User", "globalStorage", "cline.cline"),
      join(home, "Library", "Application Support", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline"),
      join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "saoudrizwan.claude-dev"),
      join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "cline.cline"),
      join(home, "Library", "Application Support", "VSCodium", "User", "globalStorage", "saoudrizwan.claude-dev"),
      join(home, "Library", "Application Support", "VSCodium", "User", "globalStorage", "cline.cline"),
      join(home, "Library", "Application Support", "Claude")
    );
  } else {
    candidates.push(
      join(home, ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev"),
      join(home, ".config", "Code", "User", "globalStorage", "cline.cline"),
      join(home, ".config", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline"),
      join(home, ".config", "Cursor", "User", "globalStorage", "saoudrizwan.claude-dev"),
      join(home, ".config", "Cursor", "User", "globalStorage", "cline.cline"),
      join(home, ".config", "VSCodium", "User", "globalStorage", "saoudrizwan.claude-dev"),
      join(home, ".config", "VSCodium", "User", "globalStorage", "cline.cline"),
      join(home, ".config", "Claude")
    );
  }

  return candidates.filter((p) => existsSync(p));
}

/**
 * Zero-dependency robust YAML frontmatter parser for SKILL.md / README.md.
 * Handles single/double quoted strings, folded block scalars (>), literal block scalars (|),
 * flow arrays, block lists, nested metadata mappings, and plain multiline continuations.
 * @param {string} content
 * @returns {Record<string, any>}
 */
export function parseYamlFrontmatter(content) {
  if (!content || typeof content !== "string") return {};
  const lines = content.split(/\r?\n/);
  let startIdx = 0;
  while (startIdx < lines.length && lines[startIdx].trim() === "") startIdx++;
  if (startIdx >= lines.length || lines[startIdx].trim() !== "---") return {};

  const fmLines = [];
  let endIdx = -1;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === "---" || lines[i].trim() === "...") {
      endIdx = i;
      break;
    }
    fmLines.push(lines[i]);
  }
  if (endIdx === -1) return {};

  function cleanQuotes(str) {
    if (!str || typeof str !== "string") return "";
    let s = str.trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1);
    }
    return s;
  }

  const result = {};
  let currentKey = null;
  let currentParentKey = null;
  let blockType = null; // '>', '|', 'plain', 'list'
  let blockLines = [];

  function flush() {
    if (!currentKey) return;
    if (blockType === ">" || blockType === "plain") {
      const text = blockLines
        .map((l) => l.trim())
        .filter(Boolean)
        .join(" ")
        .trim();
      if (text) {
        if (currentParentKey) {
          result[currentParentKey] = result[currentParentKey] || {};
          result[currentParentKey][currentKey] = text;
        } else {
          result[currentKey] = text;
        }
      }
    } else if (blockType === "|") {
      const text = blockLines
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n")
        .trim();
      if (text) {
        if (currentParentKey) {
          result[currentParentKey] = result[currentParentKey] || {};
          result[currentParentKey][currentKey] = text;
        } else {
          result[currentKey] = text;
        }
      }
    } else if (blockType === "list") {
      const list = blockLines
        .map((l) => l.trim().replace(/^-\s*/, ""))
        .map(cleanQuotes)
        .filter(Boolean);
      if (list.length > 0) {
        if (currentParentKey) {
          result[currentParentKey] = result[currentParentKey] || {};
          result[currentParentKey][currentKey] = list;
        } else {
          result[currentKey] = list;
        }
      }
    }
    currentKey = null;
    blockType = null;
    blockLines = [];
  }

  for (let i = 0; i < fmLines.length; i++) {
    const rawLine = fmLines[i];
    const trimmedLine = rawLine.trim();

    // Skip comments outside block scalars
    if (!blockType && trimmedLine.startsWith("#")) continue;

    // Check list item under currentKey
    if (currentKey && (trimmedLine.startsWith("- ") || (blockType === "list" && trimmedLine.startsWith("-")))) {
      blockType = "list";
      blockLines.push(trimmedLine);
      continue;
    }

    // Check key: value
    const match = rawLine.match(/^([ \t]*)([A-Za-z0-9_#-]+)\s*:\s*(.*)$/);
    if (match) {
      const indent = match[1].length;
      const keyName = match[2].trim().toLowerCase();
      const rawVal = match[3].trim();

      // If indent >= 2 and parent key exists, treat as nested key
      if (indent >= 2 && currentParentKey) {
        flush();
        currentKey = keyName;
      } else {
        flush();
        currentParentKey = null;
        currentKey = keyName;
      }

      if (/^>[+-]?\d*$/.test(rawVal)) {
        blockType = ">";
        blockLines = [];
      } else if (/^\|[+-]?\d*$/.test(rawVal)) {
        blockType = "|";
        blockLines = [];
      } else if (rawVal === "") {
        if (keyName === "metadata") {
          currentParentKey = "metadata";
          result.metadata = result.metadata || {};
          currentKey = null;
        } else {
          blockType = "plain";
          blockLines = [];
        }
      } else if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
        const items = rawVal
          .slice(1, -1)
          .split(",")
          .map((s) => cleanQuotes(s.trim()))
          .filter(Boolean);
        if (currentParentKey) {
          result[currentParentKey] = result[currentParentKey] || {};
          result[currentParentKey][keyName] = items;
        } else {
          result[keyName] = items;
        }
        currentKey = null;
        blockType = null;
      } else {
        const val = cleanQuotes(rawVal);
        if (currentParentKey) {
          result[currentParentKey] = result[currentParentKey] || {};
          result[currentParentKey][keyName] = val;
        } else {
          result[keyName] = val;
        }
        // Also allow plain continuation lines if any
        blockType = "plain";
        blockLines = [val];
      }
    } else if (currentKey) {
      if (trimmedLine) {
        blockLines.push(trimmedLine);
      }
    }
  }
  flush();

  return result;
}

/**
 * Reads metadata from local skill or plugin directory with mtime caching.
 * @param {string} dir
 * @param {string} fallbackId
 * @returns {{ name: string, description: string, version: string, author: string, tags: string[] }}
 */
export function extractLocalSkillMeta(dir, fallbackId) {
  const meta = {
    name: fallbackId,
    description: "",
    version: "1.0.0",
    author: "Local System",
    tags: ["local", "custom"],
  };

  const cachedDir = _metaCache.get(dir);
  try {
    const dirStat = statSync(dir);
    if (cachedDir && cachedDir.mtimeMs === dirStat.mtimeMs) {
      return { ...cachedDir.meta };
    }
  } catch {}

  const manifestFiles = [
    join(dir, "package.json"),
    join(dir, "plugin.json"),
    join(dir, "skill.json"),
    join(dir, "manifest.json"),
  ];

  for (const m of manifestFiles) {
    if (existsSync(m)) {
      try {
        const st = statSync(m);
        const cached = _metaCache.get(m);
        if (cached && cached.mtimeMs === st.mtimeMs) {
          return { ...cached.meta };
        }

        const j = readJson(m);
        if (!j) continue;
        if (j.name) meta.name = j.name;
        if (j.description) meta.description = j.description;
        if (j.version) meta.version = j.version;
        if (j.author) {
          meta.author = typeof j.author === "string" ? j.author : j.author.name || meta.author;
        }
        if (Array.isArray(j.keywords)) meta.tags = [...new Set([...meta.tags, ...j.keywords])];

        setMetaCache(m, { mtimeMs: st.mtimeMs, meta: { ...meta } });
        break;
      } catch {}
    }
  }

  // Parse YAML Frontmatter & Markdown description from SKILL.md / README.md
  if (!meta.description || meta.name === fallbackId) {
    const docFiles = [join(dir, "SKILL.md"), join(dir, "README.md")];
    for (const d of docFiles) {
      if (existsSync(d)) {
        try {
          const content = readFileSync(d, "utf8");
          const fm = parseYamlFrontmatter(content);

          if (fm.name && meta.name === fallbackId) meta.name = fm.name;
          if (fm.description && !meta.description) meta.description = fm.description;
          if (fm.version && meta.version === "1.0.0") meta.version = fm.version;
          if (fm.author && meta.author === "Local System") meta.author = fm.author;

          if (fm.metadata && typeof fm.metadata === "object") {
            if (fm.metadata.version && meta.version === "1.0.0") meta.version = fm.metadata.version;
            if (fm.metadata.author && meta.author === "Local System") meta.author = fm.metadata.author;
            if (fm.metadata.triggers || fm.metadata.domain) {
              const extraTriggers = String(fm.metadata.triggers || fm.metadata.domain).split(/[,; ]+/).filter(Boolean);
              meta.tags = [...new Set([...meta.tags, ...extraTriggers])];
            }
          }

          if (fm.tags || fm.keywords || fm.references) {
            const rawTags = Array.isArray(fm.tags)
              ? fm.tags
              : Array.isArray(fm.keywords)
              ? fm.keywords
              : Array.isArray(fm.references)
              ? fm.references
              : String(fm.tags || fm.keywords || fm.references).split(/[,; ]+/).filter(Boolean);
            meta.tags = [...new Set([...meta.tags, ...rawTags])];
          }

          // Fallback to first markdown paragraph if description still empty
          if (!meta.description) {
            const bodyContent = content.replace(/^---[\s\S]*?---\r?\n?/, "");
            const firstPara = bodyContent
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter((l) => l && !l.startsWith("#") && !l.startsWith("---") && !l.startsWith("```") && !l.startsWith("<!--"))[0];
            if (firstPara) {
              meta.description = firstPara.slice(0, 300);
            }
          }

          if (meta.description) break;
        } catch {}
      }
    }
  }

  try {
    const dirStat = statSync(dir);
    setMetaCache(dir, { mtimeMs: dirStat.mtimeMs, meta: { ...meta } });
  } catch {}

  return meta;
}

/**
 * Probes all storage locations for installed plugins, skills, and MCP servers.
 * @param {string|null} workspaceDir
 * @returns {{ found: { plugins: Map, skills: Map, mcps: Map }, roots: string[] }}
 */
export function fsProbe(workspaceDir = null) {
  const home = homedir();
  const roots = clineRootCandidates();

  if (workspaceDir && existsSync(workspaceDir)) {
    const wsCline = join(workspaceDir, ".cline");
    if (existsSync(wsCline) && !roots.includes(wsCline)) roots.unshift(wsCline);
    const wsSkills = join(workspaceDir, "skills");
    if (existsSync(wsSkills) && !roots.includes(workspaceDir)) roots.unshift(workspaceDir);
  }

  const found = {
    plugins: new Map(),
    skills: new Map(),
    mcps: new Map(),
  };

  // 1. Probing roots for plugins and skills
  for (const rootPath of roots) {
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

  // 2. MCP Server configuration files
  const isWin = platform() === "win32";
  const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
  const mcpConfigFiles = [];

  if (workspaceDir && existsSync(workspaceDir)) {
    mcpConfigFiles.push(
      join(workspaceDir, ".vscode", "cline_mcp_settings.json"),
      join(workspaceDir, ".vscode", "mcp.json"),
      join(workspaceDir, ".cline", "mcp_settings.json"),
      join(workspaceDir, "cline_mcp_settings.json"),
      join(workspaceDir, "mcp.json")
    );
  }

  if (isWin) {
    mcpConfigFiles.push(
      join(appData, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      join(appData, "Code", "User", "globalStorage", "cline.cline", "settings", "cline_mcp_settings.json"),
      join(appData, "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings", "mcp_settings.json"),
      join(appData, "Cursor", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      join(appData, "Cursor", "User", "globalStorage", "cline.cline", "settings", "cline_mcp_settings.json"),
      join(appData, "VSCodium", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      join(appData, "VSCodium", "User", "globalStorage", "cline.cline", "settings", "cline_mcp_settings.json"),
      join(appData, "Claude", "claude_desktop_config.json")
    );
  } else if (platform() === "darwin") {
    mcpConfigFiles.push(
      join(home, "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      join(home, "Library", "Application Support", "Code", "User", "globalStorage", "cline.cline", "settings", "cline_mcp_settings.json"),
      join(home, "Library", "Application Support", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings", "mcp_settings.json"),
      join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "cline.cline", "settings", "cline_mcp_settings.json"),
      join(home, "Library", "Application Support", "VSCodium", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      join(home, "Library", "Application Support", "VSCodium", "User", "globalStorage", "cline.cline", "settings", "cline_mcp_settings.json"),
      join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
    );
  } else {
    mcpConfigFiles.push(
      join(home, ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      join(home, ".config", "Code", "User", "globalStorage", "cline.cline", "settings", "cline_mcp_settings.json"),
      join(home, ".config", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings", "mcp_settings.json"),
      join(home, ".config", "Cursor", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      join(home, ".config", "Cursor", "User", "globalStorage", "cline.cline", "settings", "cline_mcp_settings.json"),
      join(home, ".config", "VSCodium", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      join(home, ".config", "VSCodium", "User", "globalStorage", "cline.cline", "settings", "cline_mcp_settings.json"),
      join(home, ".config", "Claude", "claude_desktop_config.json")
    );
  }

  for (const rootPath of roots) {
    mcpConfigFiles.push(
      join(rootPath, "cline_mcp_settings.json"),
      join(rootPath, "mcp_servers.json"),
      join(rootPath, "mcp_settings.json"),
      join(rootPath, "data", "settings", "cline_mcp_settings.json"),
      join(rootPath, "data", "settings", "mcp_settings.json"),
      join(rootPath, "mcp", "servers.json"),
      join(rootPath, "mcp.json"),
      join(rootPath, "settings", "cline_mcp_settings.json"),
      join(rootPath, "settings", "mcp_settings.json")
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

