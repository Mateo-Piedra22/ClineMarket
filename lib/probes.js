// Filesystem probing and local storage inspection engine

import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { homedir, platform } from "node:os";
import { readJson } from "./state.js";
import { logger } from "./logger.js";

// Audit #22 (Low): 8+ silent `catch {}` sites hid detection failures.
// Centralized debug reporter (logger has no debug level; info with prefix).
function debugProbe(context, err) {
  logger.info(`[probes:debug] ${context}: ${err?.message || err}`);
}

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
  } catch (err) {
    debugProbe(`listDirSafe(${dir})`, err);
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
    join(home, ".opencode"),
    join(home, ".config", "opencode"),
    join(home, ".config", "cline"),
    join(home, ".config", "claude"),
    join(home, ".config", "agents"),
    join(home, ".config", "commandcode"),
    join(home, ".config", "cursor"),
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
      join(home, "Library", "Application Support", "rooveterinaryinc.roo-cline"),
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
    // Audit #19 (Low): handle escapes — '' -> ' inside single-quoted values,
    // \" (and other backslash escapes) -> literal char inside double-quoted.
    if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
      s = s.slice(1, -1).replace(/''/g, "'");
    } else if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
      s = s.slice(1, -1).replace(/\\(.)/g, "$1");
    }
    return s;
  }

  const result = {};
  let currentKey = null;
  let currentParentKey = null;
  let blockType = null; // '>', '|', 'plain', 'list'
  let blockIndent = -1; // indentation of the line that opened the current block
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
      // Audit #6 (Medium): preserve relative indentation and blank lines in
      // literal block scalars. Strip only the block's base indentation (the
      // minimum indentation across non-empty lines), keeping inner indent.
      const lines = blockLines.slice();
      while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
      let base = Infinity;
      for (const l of lines) {
        if (l.trim() === "") continue;
        const ind = l.match(/^[ \t]*/)[0].length;
        if (ind < base) base = ind;
      }
      if (!Number.isFinite(base)) base = 0;
      const text = lines
        .map((l) => (l.trim() === "" ? "" : l.slice(base)))
        .join("\n");
      if (text.trim()) {
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
    // Audit #18 (Low): `#` removed from the key charset (comments are handled
    // above); key case is preserved instead of forced to lowercase.
    // Audit #5 (Medium): a line with `word: text` shape that is MORE indented
    // than the key that opened the current block scalar is block content,
    // not a new key.
    const match = rawLine.match(/^([ \t]*)([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (match) {
      const indent = match[1].length;
      // Only real block scalars ('>' folded, '|' literal) swallow key-shaped
      // continuation lines; the synthetic 'plain' pseudo-block keeps its
      // original nested-key behavior for backwards compatibility.
      if (currentKey && (blockType === ">" || blockType === "|") && indent > blockIndent) {
        // Block scalar continuation that merely looks like a key.
        blockLines.push(blockType === "|" ? rawLine : trimmedLine);
        continue;
      }
      const keyName = match[2];
      const rawVal = match[3].trim();
      blockIndent = indent;

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
        // Case-insensitive on purpose: with audit #18 the parser preserves
        // key case, so `Metadata:` must still nest like `metadata:`.
        if (keyName.toLowerCase() === "metadata") {
          currentParentKey = keyName;
          result[keyName] = result[keyName] || {};
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
        // Audit #6: literal blocks keep raw lines (indentation matters).
        blockLines.push(blockType === "|" ? rawLine : trimmedLine);
      } else if (blockType === "|") {
        // Preserve blank lines inside literal block scalars.
        blockLines.push(rawLine);
      }
    }
  }
  flush();

  return result;
}

/**
 * Case-insensitive frontmatter lookup. Audit #18: keys keep their original
 * case in the parsed result; consumers normalize at lookup time.
 * @param {Record<string, any>} fm
 * @param {string} key
 * @returns {any}
 */
function fmValue(fm, key) {
  if (!fm || typeof fm !== "object") return undefined;
  if (fm[key] !== undefined) return fm[key];
  const target = key.toLowerCase();
  for (const [k, v] of Object.entries(fm)) {
    if (k.toLowerCase() === target) return v;
  }
  return undefined;
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
  } catch (err) {
    debugProbe(`extractLocalSkillMeta(${dir}) stat`, err);
  }

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
      } catch (err) {
        debugProbe(`extractLocalSkillMeta(${m}) manifest`, err);
      }
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

          // Audit #18: lookups are case-insensitive now that the parser
          // preserves the original key case.
          const fmName = fmValue(fm, "name");
          const fmDescription = fmValue(fm, "description");
          const fmVersion = fmValue(fm, "version");
          const fmAuthor = fmValue(fm, "author");
          const fmTags = fmValue(fm, "tags");
          const fmKeywords = fmValue(fm, "keywords");
          const fmReferences = fmValue(fm, "references");
          const fmMetadata = fmValue(fm, "metadata");

          if (fmName && meta.name === fallbackId) meta.name = fmName;
          if (fmDescription && !meta.description) meta.description = fmDescription;
          if (fmVersion && meta.version === "1.0.0") meta.version = fmVersion;
          if (fmAuthor && meta.author === "Local System") meta.author = fmAuthor;

          if (fmMetadata && typeof fmMetadata === "object") {
            const metaVersion = fmValue(fmMetadata, "version");
            const metaAuthor = fmValue(fmMetadata, "author");
            const metaTriggers = fmValue(fmMetadata, "triggers") || fmValue(fmMetadata, "domain");
            if (metaVersion && meta.version === "1.0.0") meta.version = metaVersion;
            if (metaAuthor && meta.author === "Local System") meta.author = metaAuthor;
            if (metaTriggers) {
              const extraTriggers = String(metaTriggers).split(/[,; ]+/).filter(Boolean);
              meta.tags = [...new Set([...meta.tags, ...extraTriggers])];
            }
          }

          if (fmTags || fmKeywords || fmReferences) {
            const rawTags = Array.isArray(fmTags)
              ? fmTags
              : Array.isArray(fmKeywords)
              ? fmKeywords
              : Array.isArray(fmReferences)
              ? fmReferences
              : String(fmTags || fmKeywords || fmReferences).split(/[,; ]+/).filter(Boolean);
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
        } catch (err) {
          debugProbe(`extractLocalSkillMeta(${d}) doc`, err);
        }
      }
    }
  }

  try {
    const dirStat = statSync(dir);
    setMetaCache(dir, { mtimeMs: dirStat.mtimeMs, meta: { ...meta } });
  } catch (err) {
    debugProbe(`extractLocalSkillMeta(${dir}) cache write`, err);
  }

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
    const wsCandidates = [
      join(workspaceDir, ".cline"),
      join(workspaceDir, ".agents"),
      join(workspaceDir, ".claude"),
      join(workspaceDir, ".cursor"),
      join(workspaceDir, ".commandcode"),
      join(workspaceDir, ".opencode"),
      join(workspaceDir, ".config", "opencode"),
      join(workspaceDir, ".config", "cline"),
      join(workspaceDir, ".config", "agents"),
      join(workspaceDir, ".config", "claude"),
      workspaceDir,
    ];
    for (const wsCandidate of wsCandidates) {
      if (existsSync(wsCandidate) && !roots.includes(wsCandidate)) {
        roots.unshift(wsCandidate);
      }
    }
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
      } catch (err) {
        debugProbe(`fsProbe pluginDir(${pluginDir})`, err);
      }
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
                // Audit #16 (Low): key the Map by the raw directory id so
                // distinct hash-suffixed variants (`foo-deadbeef00` vs
                // `foo-cafebabe11`) no longer overwrite each other; the
                // cleaned id is kept only for display.
                found.plugins.set(entryName, {
                  id: cleanId,
                  rawId: entryName,
                  scope,
                  path: entryPath,
                  metadata: extractLocalSkillMeta(pkgDir, cleanId),
                });
              }
            }
          }
        } catch (err) {
          debugProbe(`fsProbe installedScope(${scopePath})`, err);
        }
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
      } catch (err) {
        debugProbe(`fsProbe skillDir(${skillDir})`, err);
      }
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
            // Audit #20 (Low): only persist MCP configs that are plain objects
            // (string/number/array values from malformed files are skipped).
            if (id && srvConfig && typeof srvConfig === "object" && !Array.isArray(srvConfig) && !found.mcps.has(id)) {
              found.mcps.set(id, { id, config: srvConfig, source: cfgFile });
            }
          }
        }
      } catch (err) {
        debugProbe(`fsProbe mcpConfig(${cfgFile})`, err);
      }
    }
  }

  return { found, roots };
}

