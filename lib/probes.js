// Filesystem probing and local storage inspection engine

import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { homedir, platform } from "node:os";
import { readJson } from "./state.js";

// Mtime cache for local skill/plugin package.json files
const _metaCache = new Map(); // path -> { mtimeMs, meta }

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
  ];

  if (platform() === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    candidates.push(
      join(appData, "Code", "User", "globalStorage", "saoudrizwan.claude-dev"),
      join(appData, "Code", "User", "globalStorage", "cline.cline"),
      join(appData, "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline"),
      join(appData, "Cursor", "User", "globalStorage", "saoudrizwan.claude-dev"),
      join(appData, "Cursor", "User", "globalStorage", "cline.cline"),
      join(appData, "Claude")
    );
  } else if (platform() === "darwin") {
    candidates.push(
      join(home, "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev"),
      join(home, "Library", "Application Support", "Code", "User", "globalStorage", "cline.cline"),
      join(home, "Library", "Application Support", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline"),
      join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "saoudrizwan.claude-dev"),
      join(home, "Library", "Application Support", "Claude")
    );
  } else {
    candidates.push(
      join(home, ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev"),
      join(home, ".config", "Code", "User", "globalStorage", "cline.cline"),
      join(home, ".config", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline"),
      join(home, ".config", "Cursor", "User", "globalStorage", "saoudrizwan.claude-dev"),
      join(home, ".config", "Claude")
    );
  }

  return candidates.filter((p) => existsSync(p));
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

        _metaCache.set(m, { mtimeMs: st.mtimeMs, meta: { ...meta } });
        break;
      } catch {}
    }
  }

  // Parse Markdown description from SKILL.md / README.md if description is still empty
  if (!meta.description) {
    const docFiles = [join(dir, "SKILL.md"), join(dir, "README.md")];
    for (const d of docFiles) {
      if (existsSync(d)) {
        try {
          const content = readFileSync(d, "utf8");
          const firstPara = content
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith("#") && !l.startsWith("---") && !l.startsWith("```"))[0];
          if (firstPara) {
            meta.description = firstPara.slice(0, 200);
            break;
          }
        } catch {}
      }
    }
  }

  try {
    const dirStat = statSync(dir);
    _metaCache.set(dir, { mtimeMs: dirStat.mtimeMs, meta: { ...meta } });
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
