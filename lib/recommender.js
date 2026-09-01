// lib/recommender.js
// Context-aware recommendation and bundle engine for the Cline Marketplace control plane.
// All scoring, deduplication, and bundle assembly run locally against the in-memory
// catalog and the workspace context emitted by `analyzeWorkspaceContext` in lib/routes.js.
//
// Signals (in score order): language aliases, framework names, package.json
// dependency names, workspace tags, workspace hints, stack-bundle fit, repo
// name, direct id match, featured/verified badges. Already-installed
// primitives can be excluded via `options.installedKeys`.

/* eslint-disable no-unused-vars */

/**
 * Normalize a free-form string for case-insensitive token comparison.
 * Lowercases and collapses non-alphanumeric runs into single spaces.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalize(value) {
  if (typeof value !== "string") return "";
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Tokenize a normalized string into a unique set of tokens.
 *
 * @param {string} normalized
 * @returns {Set<string>}
 */
function tokensFrom(normalized) {
  if (!normalized) return new Set();
  return new Set(normalized.split(" ").filter(Boolean));
}

/**
 * Build a lookup index from language identifiers to keyword aliases that may
 * appear in catalog entry names, taglines, or descriptions.
 *
 * @param {string[]} languages
 * @returns {Map<string, Set<string>>}
 */
function buildLanguageAliases(languages) {
  const aliases = new Map();
  const push = (key, value) => {
    const norm = normalize(value);
    if (!norm) return;
    if (!aliases.has(key)) aliases.set(key, new Set());
    aliases.get(key).add(norm);
  };
  for (const lang of languages || []) {
    const key = normalize(lang);
    if (!key) continue;
    push(key, lang);
    push(key, key);
    if (key === "javascript" || key === "js" || key === "node" || key === "nodejs") {
      push(key, "node");
      push(key, "javascript");
      push(key, "typescript");
      push(key, "express");
    } else if (key === "typescript" || key === "ts") {
      push(key, "typescript");
      push(key, "node");
      push(key, "react");
    } else if (key === "python") {
      push(key, "python");
      push(key, "fastapi");
      push(key, "django");
      push(key, "pydantic");
    } else if (key === "go" || key === "golang") {
      push(key, "golang");
      push(key, "go");
    }
  }
  return aliases;
}

/**
 * Deterministic lookup for a property in a free-form object (case-insensitive).
 *
 * @param {Record<string, unknown>} obj
 * @param {string} key
 * @returns {unknown}
 */
function ciGet(obj, key) {
  if (!obj || typeof obj !== "object") return undefined;
  const target = normalize(key);
  for (const k of Object.keys(obj)) {
    if (normalize(k) === target) return obj[k];
  }
  return undefined;
}

/**
 * Pull a flat keyword list from an entry by scanning the fields the catalog
 * exposes, falling back to safe defaults when fields are missing.
 *
 * @param {Record<string, unknown>} entry
 * @returns {string}
 */
function entryCorpus(entry) {
  if (!entry) return "";
  const parts = [
    entry.name,
    entry.id,
    entry.tagline,
    entry.description,
    Array.isArray(entry.tags) ? entry.tags.join(" ") : "",
    ciGet(entry, "category"),
    ciGet(entry, "stack"),
    ciGet(entry, "keywords"),
  ];
  return parts
    .map((p) => (typeof p === "string" ? p : Array.isArray(p) ? p.join(" ") : ""))
    .join(" ");
}

// Optimization: catalog entries are stable objects, so the tokenized corpus is
// memoized per entry identity. A WeakMap lets garbage collection reclaim the
// cache when catalog snapshots are rotated between refreshes.
const _entryTokensCache = new WeakMap();

/**
 * Memoized token set for a catalog entry corpus.
 *
 * @param {Record<string, unknown>} entry
 * @returns {Set<string>}
 */
function entryTokens(entry) {
  let tokens = _entryTokensCache.get(entry);
  if (!tokens) {
    tokens = tokensFrom(normalize(entryCorpus(entry)));
    _entryTokensCache.set(entry, tokens);
  }
  return tokens;
}

// Bundle catalog expressed as lightweight, deterministic rules. Each rule
// declares a stable id, a human-readable name, a rationale template, and a
// predicate evaluated against the workspace context; the bundle is assembled
// at scoring time based on per-entry stack/category signals.
const BUNDLE_RULES = [
  {
    id: "node-ts-fullstack",
    name: "Node & TypeScript Fullstack",
    rationale: "Type-safe end-to-end stack for Node.js services and APIs.",
    detect: (ctx) => ctx.languages.includes("javascript") || ctx.languages.includes("typescript") || ctx.languages.includes("node") || ctx.languages.includes("nodejs"),
    stackSignals: ["node", "javascript", "typescript", "express", "fastify", "nest", "server", "backend", "api", "lambda", "worker"],
  },
  {
    id: "modern-frontend",
    name: "Modern Frontend & UI",
    rationale: "Component-driven UI, styling, and frontend tooling.",
    detect: (ctx) => ctx.frameworks.some((f) => /(react|vue|svelte|next|nuxt|remix|astro|angular|qwik|solid)/.test(f)) || ctx.tags.includes("frontend") || ctx.tags.includes("ui"),
    stackSignals: ["react", "vue", "svelte", "next", "tailwind", "css", "frontend", "ui", "design", "storybook", "vite", "browser"],
  },
  {
    id: "python-ai-data",
    name: "Python AI, ML & Data",
    rationale: "Data, ML, and AI-oriented Python tooling.",
    detect: (ctx) => ctx.languages.includes("python") || ctx.tags.some((t) => /(ai|ml|data|llm|rag|agent)/.test(t)) || ctx.frameworks.some((f) => /(fastapi|django|pydantic|langchain|llamaindex)/.test(f)),
    stackSignals: ["python", "pydantic", "fastapi", "django", "data", "ml", "ai", "llm", "rag", "agent", "vector", "embedding"],
  },
  {
    id: "devops-edge",
    name: "Cloud, DevOps & Edge",
    rationale: "Cloud, containers, and edge runtimes for production workloads.",
    detect: (ctx) => ctx.frameworks.some((f) => /(cloudflare|vercel|fly|docker|kubernetes|terraform|ansible)/.test(f)) || ctx.tags.some((t) => /(devops|cloud|edge|infra|deployment)/.test(t)),
    stackSignals: ["cloudflare", "vercel", "fly", "docker", "kubernetes", "terraform", "edge", "worker", "devops", "deploy", "infra"],
  },
  {
    id: "databases",
    name: "Databases & Storage",
    rationale: "Managed databases, ORMs, and storage integrations.",
    detect: (ctx) => ctx.frameworks.some((f) => /(postgres|postgresql|neon|supabase|prisma|drizzle|mongoose|redis|convex|sql)/.test(f)) || ctx.tags.includes("database") || Array.from(ctx.dependencies || []).some((d) => /(prisma|drizzle|mongoose|redis|mysql|sqlite|^pg$)/.test(normalize(d))),
    stackSignals: ["postgres", "neon", "supabase", "prisma", "drizzle", "redis", "convex", "mongo", "sql", "database", "storage"],
  },
  {
    id: "github-workflow",
    name: "GitHub & CI/CD",
    rationale: "Source control, code review, and CI/CD automations.",
    detect: (ctx) => Boolean(ctx.repo) || ctx.tags.includes("github") || ctx.tags.includes("git") || ctx.frameworks.includes("github-actions"),
    stackSignals: ["github", "git", "actions", "ci", "review", "pr", "commit", "workflow", "release"],
  },
  {
    id: "testing-qa",
    name: "Testing & QA",
    rationale: "Unit, integration, and end-to-end testing.",
    detect: (ctx) => ctx.frameworks.some((f) => /(jest|vitest|playwright|cypress|mocha|puppeteer)/.test(f)) || ctx.tags.includes("test") || ctx.tags.includes("testing") || ctx.tags.includes("qa"),
    stackSignals: ["test", "qa", "jest", "vitest", "playwright", "cypress", "e2e", "coverage", "mock"],
  },
  {
    id: "api-development",
    name: "API Development",
    rationale: "HTTP, gRPC, and integration testing for APIs.",
    detect: (ctx) => ctx.tags.includes("api") || ctx.frameworks.some((f) => /(graphql|grpc|rest|openapi|swagger|postman)/.test(f)),
    stackSignals: ["api", "graphql", "grpc", "rest", "openapi", "swagger", "postman", "insomnia", "webhook"],
  },
  {
    id: "productivity",
    name: "Developer Productivity",
    rationale: "Planning, search, and developer-experience helpers.",
    detect: () => true,
    stackSignals: ["productivity", "planning", "search", "docs", "knowledge", "memory", "notes", "markdown", "writing"],
  },
  {
    id: "agentic-ai",
    name: "Agentic AI Tooling",
    rationale: "Agent frameworks, MCP servers, and tool integrations.",
    detect: (ctx) => ctx.tags.includes("agent") || ctx.tags.includes("mcp") || ctx.frameworks.some((f) => /(mcp|agent|claude|cline|llm)/.test(f)),
    stackSignals: ["agent", "mcp", "claude", "cline", "llm", "tool", "skill", "plugin", "registry"],
  },
  {
    id: "golang-services",
    name: "Go Services & CLIs",
    rationale: "Go microservices, CLIs, and infrastructure tooling.",
    detect: (ctx) => ctx.languages.includes("go") || ctx.languages.includes("golang") || ctx.frameworks.includes("gin"),
    stackSignals: ["go", "golang", "gin", "microservice", "grpc", "cli", "kubernetes", "cobra"],
  },
  {
    id: "rust-systems",
    name: "Rust Systems Programming",
    rationale: "Rust runtimes, systems tooling, and performance-critical CLIs.",
    detect: (ctx) => ctx.languages.includes("rust") || ctx.frameworks.some((f) => /(tokio|actix|axum)/.test(f)),
    stackSignals: ["rust", "tokio", "actix", "axum", "cargo", "systems", "cli", "performance", "wasm"],
  },
];

// Signal weights — tuned so a single strong signal lands ~55-70% affinity and
// multiple overlapping signals reach the 90%+ band without saturating.
const SIGNAL_WEIGHTS = {
  language: 28,
  framework: 36,
  dependency: 20,
  dependencyCap: 60,
  tag: 6,
  tagCap: 18,
  hint: 5,
  hintCap: 10,
  bundleFit: 10,
  repoMatch: 12,
  idExact: 15,
  featured: 4,
  verified: 4,
};

/**
 * Deterministic, calibrated mapping from a raw score to the 0-100 affinity
 * percentage shown in the UI. Positive scores land in the 50-99 band; zero
 * scores map to 0.
 *
 * @param {number} score
 * @returns {number}
 */
function scoreToPercent(score) {
  if (score <= 0) return 0;
  return Math.min(99, Math.max(50, Math.round(50 + Math.min(49, score * 0.7))));
}

/**
 * Score a single entry against the workspace context. Deterministic and
 * free of side effects so it is safe to call from tests.
 *
 * @param {Record<string, unknown>} entry
 * @param {object} ctx Normalized workspace context (see normalizeContext)
 * @param {Map<string, Set<string>>} langAliases
 * @param {Set<string>|null} [installedKeys] Keys shaped `type:id` (raw ids)
 * @returns {{ score: number, matchPercent: number, reasons: string[], installed?: boolean }}
 */
export function scoreEntry(entry, ctx, langAliases, installedKeys = null) {
  if (!entry || typeof entry !== "object" || !entry.type || !entry.id) {
    return { score: 0, matchPercent: 0, reasons: [] };
  }
  const reasons = [];
  let score = 0;
  const corpusTokens = entryTokens(entry);
  const tags = Array.isArray(entry.tags) ? entry.tags.map(normalize) : [];
  const key = `${entry.type}:${entry.id}`;

  if (installedKeys && installedKeys.has(key)) {
    return { score: 0, matchPercent: 0, reasons: [], installed: true };
  }

  // 1. Language matches (each detected language scores once).
  for (const [langKey, aliases] of langAliases) {
    let hit = false;
    for (const alias of aliases) {
      if (corpusTokens.has(alias)) { hit = true; break; }
    }
    if (hit) {
      score += SIGNAL_WEIGHTS.language;
      const display = ctx.languages.find((l) => normalize(l) === langKey) || langKey;
      reasons.push(`Detected language match: ${display}`);
    }
  }

  // 2. Framework matches.
  for (const fw of ctx.frameworks) {
    const fwNorm = normalize(fw);
    if (!fwNorm) continue;
    if (corpusTokens.has(fwNorm) || tags.includes(fwNorm)) {
      score += SIGNAL_WEIGHTS.framework;
      reasons.push(`Matches framework: ${fw}`);
    }
  }

  // 3. Dependency-name matches (package.json/pyproject dependency names).
  let depScore = 0;
  for (const dep of ctx.dependencies || []) {
    const depNorm = normalize(dep);
    if (depNorm && corpusTokens.has(depNorm)) {
      if (depScore < SIGNAL_WEIGHTS.dependencyCap) {
        depScore += SIGNAL_WEIGHTS.dependency;
        reasons.push(`Uses dependency: ${dep}`);
      }
    }
  }
  score += depScore;

  // 4. Tag overlap.
  const ctxTagSet = new Set(ctx.tags.map(normalize));
  let tagHits = 0;
  for (const tag of tags) {
    if (ctxTagSet.has(tag)) tagHits++;
  }
  if (tagHits > 0) {
    score += Math.min(SIGNAL_WEIGHTS.tagCap, tagHits * SIGNAL_WEIGHTS.tag);
    reasons.push(`Tag overlap (${tagHits})`);
  }

  // 5. Workspace hint matches (e.g. "Test suite configured").
  let hintScore = 0;
  for (const hint of ctx.hints || []) {
    let hit = false;
    for (const token of tokensFrom(normalize(hint))) {
      if (corpusTokens.has(token)) { hit = true; break; }
    }
    if (hit) {
      hintScore += SIGNAL_WEIGHTS.hint;
      reasons.push(`Workspace hint: ${hint}`);
    }
  }
  score += Math.min(SIGNAL_WEIGHTS.hintCap, hintScore);

  // 6. Stack-bundle fit (first matching rule wins).
  for (const rule of BUNDLE_RULES) {
    if (!safeDetect(rule, ctx)) continue;
    const hit = rule.stackSignals.some((s) => corpusTokens.has(normalize(s)) || tags.includes(normalize(s)));
    if (hit) {
      score += SIGNAL_WEIGHTS.bundleFit;
      reasons.push(`Fits bundle: ${rule.name}`);
      break;
    }
  }

  // 7. Repository name match.
  if (ctx.repo) {
    const repoBase = String(ctx.repo).split("/").pop() || ctx.repo;
    const repoBaseNorm = normalize(repoBase);
    if (repoBaseNorm && (corpusTokens.has(repoBaseNorm) || normalize(entry.id || "").includes(repoBaseNorm))) {
      score += SIGNAL_WEIGHTS.repoMatch;
      reasons.push(`Matches repo: ${repoBase}`);
    }
  }

  // 8. Direct id match against a declared dependency.
  const idNorm = normalize(entry.id);
  if (idNorm && (ctx.dependencies || []).some((d) => normalize(d) === idNorm)) {
    score += SIGNAL_WEIGHTS.idExact;
    reasons.push(`Direct id match: ${entry.id}`);
  }

  if (entry.featured) score += SIGNAL_WEIGHTS.featured;
  if (entry.verified) score += SIGNAL_WEIGHTS.verified;

  return { score, matchPercent: scoreToPercent(score), reasons };
}

/**
 * Build the workspace-aware recommendation list. Excludes installed primitives
 * and zero-signal entries. Deterministic ordering: score desc, then id asc.
 *
 * @param {Array<object>} entries
 * @param {object} context
 * @param {{ limit?: number, installedKeys?: Set<string>|string[], maxReasons?: number }} [options]
 * @returns {Array<{ entry: object, reasons: string[], score: number, matchPercent: number }>}
 */
export function buildRecommendations(entries, context, options = {}) {
  const ctx = normalizeContext(context);
  const installedKeys = asSet(options.installedKeys);
  const limit = Number.isFinite(options.limit) ? Math.max(0, options.limit) : 12;
  const maxReasons = Number.isFinite(options.maxReasons) ? Math.max(1, options.maxReasons) : 4;
  const langAliases = buildLanguageAliases(ctx.languages);

  const scored = [];
  for (const entry of entries || []) {
    if (!entry || !entry.type || !entry.id) continue;
    const result = scoreEntry(entry, ctx, langAliases, installedKeys);
    if (result.installed) continue;
    if (result.score <= 0 || result.reasons.length === 0) continue;
    scored.push({
      entry,
      score: result.score,
      matchPercent: result.matchPercent,
      reasons: Array.from(new Set(result.reasons)).slice(0, maxReasons),
    });
  }
  scored.sort((a, b) => (b.score - a.score) || String(a.entry.id).localeCompare(String(b.entry.id)));
  return scored.slice(0, limit);
}

/**
 * Build the workspace-aware bundle list. Each bundle includes the entries
 * that fit, with completion stats relative to installed primitives.
 *
 * @param {Array<object>} entries
 * @param {object} context
 * @param {{ maxBundles?: number, installedKeys?: Set<string>|string[], maxEntriesPerBundle?: number }} [options]
 * @returns {Array<{ id: string, name: string, rationale: string, entries: object[], installedCount: number, totalCount: number, completionPercent: number, relevant: boolean }>}
 */
export function buildBundles(entries, context, options = {}) {
  const ctx = normalizeContext(context);
  const installedKeys = asSet(options.installedKeys);
  const maxBundles = Number.isFinite(options.maxBundles) ? Math.max(0, options.maxBundles) : 6;
  const maxEntriesPerBundle = Number.isFinite(options.maxEntriesPerBundle) ? Math.max(1, options.maxEntriesPerBundle) : 8;

  const ordered = BUNDLE_RULES
    .map((rule) => ({ rule, relevant: safeDetect(rule, ctx) }))
    .sort((a, b) => Number(b.relevant) - Number(a.relevant));

  const seen = new Set();
  const bundles = [];
  for (const { rule, relevant } of ordered) {
    if (bundles.length >= maxBundles) break;
    const bundleEntries = [];
    for (const entry of entries || []) {
      if (!entry || !entry.type || !entry.id) continue;
      const key = `${entry.type}:${entry.id}`;
      if (seen.has(key)) continue;
      const tokens = entryTokens(entry);
      const tags = Array.isArray(entry.tags) ? entry.tags.map(normalize) : [];
      const matchesSignal = rule.stackSignals.some((s) => tokens.has(normalize(s)) || tags.includes(normalize(s)));
      if (!matchesSignal) continue;
      bundleEntries.push(entry);
      seen.add(key);
    }
    bundleEntries.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (bundleEntries.length === 0) continue;
    const capped = bundleEntries.slice(0, maxEntriesPerBundle);
    const installedCount = capped.filter((e) => installedKeys.has(`${e.type}:${e.id}`)).length;
    const totalCount = capped.length;
    const completionPercent = totalCount === 0 ? 0 : Math.round((installedCount / totalCount) * 100);
    bundles.push({
      id: rule.id,
      name: rule.name,
      rationale: rule.rationale,
      entries: capped,
      installedCount,
      totalCount,
      completionPercent,
      relevant,
    });
  }
  return bundles;
}

function asSet(value) {
  if (value instanceof Set) return value;
  if (Array.isArray(value)) return new Set(value);
  return new Set();
}

function safeDetect(rule, ctx) {
  try { return Boolean(rule.detect(ctx)); } catch { return false; }
}

/**
 * Normalize a free-form workspace context into the strict shape the engine
 * consumes. Unknown fields are dropped; arrays are filtered to strings.
 *
 * @param {object} ctx
 * @returns {{ cwd: string, repo: string, languages: string[], frameworks: string[], tags: string[], hints: string[], dependencies: string[] }}
 */
function normalizeContext(ctx) {
  const c = ctx || {};
  return {
    cwd: typeof c.cwd === "string" ? c.cwd : "",
    repo: typeof c.repo === "string" ? c.repo : "",
    languages: Array.isArray(c.languages) ? c.languages.filter((x) => typeof x === "string") : [],
    frameworks: Array.isArray(c.frameworks) ? c.frameworks.filter((x) => typeof x === "string") : [],
    tags: Array.isArray(c.tags) ? c.tags.filter((x) => typeof x === "string") : [],
    hints: Array.isArray(c.hints) ? c.hints.filter((x) => typeof x === "string") : [],
    dependencies: Array.isArray(c.dependencies) ? c.dependencies.filter((x) => typeof x === "string") : [],
  };
}

export const __testing = { BUNDLE_RULES, scoreEntry, buildLanguageAliases, normalizeContext, entryTokens, SIGNAL_WEIGHTS };