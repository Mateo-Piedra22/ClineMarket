#!/usr/bin/env node
// Fetches the upstream Cline Marketplace catalog and per-entry metadata from
// the GitHub repo so the local app can show "last updated" dates per item and
// highlight what is new since the last refresh.
//
//   node scripts/refresh-catalog.mjs            full refresh
//   node scripts/refresh-catalog.mjs --catalog  only catalog.json (no per-entry metadata)
//
// Writes:
//   catalog.json            latest catalog (the one the server serves)
//   data/catalog-prev.json  previous catalog, used for the "new" badge
//   data/upstream-meta.json { id, type, updatedAt, committedAt, sha } per entry

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir =
  process.env.CLINEMARKET_DATA_DIR ||
  process.env.DATA_DIR ||
  join(root, "data");
mkdirSync(dataDir, { recursive: true });

const CATALOG_URL =
  process.env.MARKETPLACE_CATALOG_URL ||
  "https://cline.github.io/marketplace/catalog.json";
const REPO = process.env.MARKETPLACE_REPO || "cline/marketplace";

// Resolve a GitHub token automatically: env, then `gh auth token` (the
// official GitHub CLI). Falls back to anonymous requests if neither works.
async function resolveGithubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const { stdout } = await run("gh", ["auth", "token"], { timeout: 5000 });
    const tok = String(stdout || "").trim();
    if (tok) return tok;
  } catch {}
  return null;
}

const argv = process.argv.slice(2);
const catalogOnly = argv.includes("--catalog");

// Populated in main(); consumed by fetchJsonWithHeaders and friends.
let githubToken = null;

function log(...a) {
  console.log("[refresh]", ...a);
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "user-agent": "cline-marketplace-local" } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function listEntriesByType(type) {
  // GitHub contents API: list directories under registry/<type>s/
  const url = `https://api.github.com/repos/${REPO}/contents/registry/${type}s`;
  const items = await fetchJson(url);
  return items.filter((it) => it.type === "dir").map((it) => it.name);
}

// Resolve "last touched entry.json per slug" by walking the recent commits
// of each registry/<type>s/ directory. We only need the LATEST commit per
// slug, so the cheap algorithm is:
//   1. pull the directory tree once
//   2. pull N most-recent commits to that directory with `path` filter
//   3. for each entry.json blob SHA, walk back until we find a commit that
//      touched it (cap at `maxCommits`)
//
// That's O(types * N + entries * walk) which for the marketplace fits in
// a handful of requests instead of N*M (one per entry).

async function fetchJsonWithHeaders(url) {
  const headers = {
    "user-agent": "cline-marketplace-local",
    // vnd.github.v3+json does NOT populate the `files` array on list
    // commits. We need this media type to do the bulk pass efficiently.
    "accept": "application/vnd.github.cloak-preview+json",
  };
  if (githubToken) {
    headers["authorization"] = `Bearer ${githubToken}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function lastCommitForFile(type, slug) {
  // Returns the most recent commit touching registry/<type>s/<slug>/entry.json
  const path = `registry/${type}s/${slug}/entry.json`;
  const url =
    `https://api.github.com/repos/${REPO}/commits` +
    `?path=${encodeURIComponent(path)}&per_page=1`;

  const delays = [0, 1000, 3000, 8000];
  let lastErr;
  for (const d of delays) {
    if (d) await new Promise((r) => setTimeout(r, d));
    try {
      const commits = await fetchJsonWithHeaders(url);
      if (!Array.isArray(commits) || commits.length === 0) return null;
      const c = commits[0];
      return {
        sha: c.sha,
        committedAt: c.commit?.author?.date || c.commit?.committer?.date || null,
        message: c.commit?.message?.split("\n")[0] || null,
      };
    } catch (err) {
      lastErr = err;
      if (String(err).match(/-> 429|-> 403/)) continue;
    }
  }
  throw lastErr;
}

// Bulk: fetch recent commits for a registry subdir and map each slug →
// its most recent commit that touched entry.json. Walks paginated commits
// (maxCommits) and tracks the LATEST entry.json blob SHA seen per slug.
async function lastCommitsForType(type, slugs, { maxCommits = 300 } = {}) {
  const result = {}; // slug → { sha, committedAt, message }
  const remaining = new Set(slugs);
  let page = 1;
  const perPage = 100;

  while (remaining.size > 0 && page * perPage <= maxCommits) {
    const url =
      `https://api.github.com/repos/${REPO}/commits` +
      `?path=registry/${type}s&per_page=${perPage}&page=${page}`;
    let commits;
    try {
      commits = await fetchJsonWithHeaders(url);
    } catch (err) {
      if (String(err).match(/-> 403|-> 429/)) break; // rate limit; give up
      throw err;
    }
    if (!Array.isArray(commits) || commits.length === 0) break;

    for (const c of commits) {
      // The cloak-preview media type returns `files` already; the regular
      // v3+json one doesn't. Guard for both shapes.
      const files = c.files || [];
      for (const f of files) {
        const m = (f.filename || "").match(
          new RegExp(`^registry/${type}s/([a-z0-9-]+)/entry\\.json$`),
        );
        if (!m) continue;
        const slug = m[1];
        if (!remaining.has(slug)) continue;
        result[slug] = {
          sha: c.sha,
          committedAt: c.commit?.author?.date || c.commit?.committer?.date || null,
          message: c.commit?.message?.split("\n")[0] || null,
        };
        remaining.delete(slug);
      }
    }
    page++;
  }
  return { result, remaining: [...remaining] };
}

// Also try the per-entry endpoint WITHOUT `files` (v3+json). It's a
// fallback in case the bulk pass missed something because `files` was
// truncated or the commit hit the file path with a rename. We compare
// against the existing result so we don't overwrite a fresher answer.
async function fillMissingPerEntry(type, slugs, current) {
  const out = { ...current };
  const delay = githubToken ? 30 : 3100;
  let touched = 0;
  for (const slug of slugs) {
    if (out[slug] && !out[slug].error) continue;
    try {
      const path = `registry/${type}s/${slug}/entry.json`;
      const url =
        `https://api.github.com/repos/${REPO}/commits` +
        `?path=${encodeURIComponent(path)}&per_page=1`;
      const commits = await fetchJsonWithHeaders(url);
      if (Array.isArray(commits) && commits[0]) {
        const c = commits[0];
        const newer = new Date(c.commit?.author?.date || 0).getTime();
        const existing = out[slug]?.committedAt
          ? new Date(out[slug].committedAt).getTime() : 0;
        if (newer > existing) {
          out[slug] = {
            sha: c.sha,
            committedAt: c.commit?.author?.date || c.commit?.committer?.date || null,
            message: c.commit?.message?.split("\n")[0] || null,
          };
        }
      }
    } catch (err) {
      out[slug] = { error: String(err.message || err) };
    }
    touched++;
    if (githubToken && touched % 25 === 0) await new Promise((r) => setTimeout(r, 50));
    else if (touched % 5 === 0) await new Promise((r) => setTimeout(r, delay));
  }
  return out;
}

async function fetchMeta(catalog) {
  // Without a token, GitHub limits unauthenticated callers to 60 req/h.
  // We try the bulk pass anyway (it costs ~3 requests per type) but bail
  // out gracefully on rate-limit. With a token (env, `gh auth token`,
  // or GH_TOKEN), the full pass runs in seconds.
  if (!githubToken && !process.env.MARKETPLACE_FETCH_META) {
    log("skipping per-entry metadata: no GitHub token (env, gh auth, " +
        "or MARKETPLACE_FETCH_META=1).");
    return {};
  }
  log(`github token: ${githubToken ? "yes" : "no"}`);
  const out = {};
  const types = ["plugin", "skill", "mcp"];
  let bulkWorked = true;
  for (const t of types) {
    const slugs = catalog.entries.filter((e) => e.type === t).map((e) => e.id);
    let bulk = { result: {}, remaining: slugs };
    if (bulkWorked) {
      log(`meta ${t}: ${slugs.length} entries (bulk pass)`);
      try {
        bulk = await lastCommitsForType(t, slugs, { maxCommits: 300 });
      } catch (err) {
        if (String(err.message).match(/-> 403|-> 429/)) {
          log(`  bulk pass rate-limited; bailing out. ${err.message}`);
          return out;
        }
        throw err;
      }
      for (const [slug, meta] of Object.entries(bulk.result)) {
        out[`${t}:${slug}`] = meta;
      }
      log(`  bulk resolved ${Object.keys(bulk.result).length}, remaining ${bulk.remaining.length}`);
      // If the bulk pass returned nothing for the first type, the endpoint
      // is probably not serving `files`. Skip it for the remaining types.
      if (Object.keys(bulk.result).length === 0 && types.indexOf(t) === 0) {
        bulkWorked = false;
        log("  bulk endpoint not returning file lists; switching to per-entry");
      }
    }

    // Fallback for whatever the bulk pass couldn't reach (entries with no
    // recent commits in the inspected window, or commits missing the
    // `files` payload because the path was renamed).
    if (bulk.remaining.length > 0) {
      const filled = await fillMissingPerEntry(t, bulk.remaining, bulk.result);
      for (const [slug, meta] of Object.entries(filled)) {
        if (!out[`${t}:${slug}`]) out[`${t}:${slug}`] = meta;
      }
      const finalMissing = bulk.remaining.filter((s) => !filled[s] || filled[s].error);
      log(`  after fallback: ${bulk.remaining.length - finalMissing.length} resolved, ` +
          `${finalMissing.length} still missing`);
    }
  }
  return out;
}

async function main() {
  githubToken = await resolveGithubToken();
  if (githubToken) {
    log(`github token: detected (${githubToken.slice(0, 7)}…)`);
  } else {
    log("github token: none — per-entry metadata will be skipped " +
        "unless MARKETPLACE_FETCH_META=1");
  }

  log("downloading catalog:", CATALOG_URL);
  const catalog = await fetchJson(CATALOG_URL);
  log(
    `catalog: ${catalog.counts?.total ?? catalog.entries.length} entries ` +
      `(plugins ${catalog.counts?.plugins ?? 0}, skills ${catalog.counts?.skills ?? 0}, ` +
      `mcps ${catalog.counts?.mcps ?? 0})`
  );

  // Rotate previous catalog so the app can diff "new" entries.
  const cur = join(root, "catalog.json");
  const prev = join(dataDir, "catalog-prev.json");
  if (existsSync(cur)) {
    const prevCatalog = JSON.parse(readFileSync(cur, "utf8"));
    writeFileSync(prev, JSON.stringify(prevCatalog, null, 2));
    log("rotated previous catalog -> catalog-prev.json");
  }

  writeFileSync(cur, JSON.stringify(catalog, null, 2));
  log("wrote catalog.json");

  if (catalogOnly) {
    log("--catalog flag set, skipping per-entry metadata");
    return;
  }

  log("fetching per-entry last-commit metadata from GitHub...");
  const meta = await fetchMeta(catalog);
  writeFileSync(join(dataDir, "upstream-meta.json"), JSON.stringify(meta, null, 2));
  log(`wrote upstream-meta.json (${Object.keys(meta).length} entries)`);
}

main().catch((err) => {
  console.error("[refresh] FAILED:", err);
  process.exit(1);
});