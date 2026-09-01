#!/usr/bin/env node
// Unit test suite (wave B) for state/integrity fixes from
// docs/audits/2026-08-30-audit-install-gestion/: YAML block scalars (#5, #6,
// #18, #19), MCP config redaction (#2, #20), reconciler key handling (#17),
// upstream-meta defensive merge (#1), catalog schema validation (C4-03),
// skills-lock integrity (#3), and safeWriteJson concurrency (#4, #21).

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseYamlFrontmatter } from "../lib/probes.js";
import { sanitizeMcpConfig } from "../lib/sanitizers.js";
import { reconcile } from "../lib/reconciler.js";
import { safeWriteJson } from "../lib/state.js";
import { verifySkillsLock, sha256Hex, resolveLocalSkillPath } from "../lib/integrity.js";
import { validateCatalogSchema, mergeUpstreamMeta } from "./refresh-catalog.mjs";

// Isolated temporary directory (no production data/ pollution)
const testTmpDir = mkdtempSync(join(tmpdir(), "clinemarket-unit-state-"));
process.on("exit", () => {
  try {
    rmSync(testTmpDir, { recursive: true, force: true });
  } catch {}
});

// -----------------------------------------------------------------------------
// 1. YAML parser: block scalars, case, quotes
// -----------------------------------------------------------------------------
test("yaml: literal block scalar '|' preserves relative indentation and blank lines (#6)", () => {
  const fm = parseYamlFrontmatter(
    ["---", "description: |", "  First line", "    Indented second line", "", "  After blank line", "---", ""].join("\n")
  );
  assert.equal(fm.description, "First line\n  Indented second line\n\nAfter blank line");
});

test("yaml: key-shaped lines inside block scalars are content, not keys (#5)", () => {
  const fm = parseYamlFrontmatter(
    ["---", "description: |", "  Usage:", "    command: value here", "  done: true", "version: 2.0.0", "---", ""].join("\n")
  );
  assert.equal(fm.description, "Usage:\n  command: value here\ndone: true");
  assert.equal(fm.version, "2.0.0");
  assert.equal(fm.command, undefined);
  assert.equal(fm.done, undefined);
});

test("yaml: folded block scalar '>' collapses lines (#5 regression guard)", () => {
  const fm = parseYamlFrontmatter(["---", "description: >", "  line one: with colon", "  line two", "---", ""].join("\n"));
  assert.equal(fm.description, "line one: with colon line two");
});

test("yaml: key case is preserved (#18)", () => {
  const fm = parseYamlFrontmatter(["---", "Name: My Skill", "name: other", "---", ""].join("\n"));
  assert.equal(fm.Name, "My Skill");
  assert.equal(fm.name, "other");
});

test("yaml: cleanQuotes handles '' -> ' and \\\" escapes (#19)", () => {
  const fmSingle = parseYamlFrontmatter(["---", "title: 'It''s here'", "---", ""].join("\n"));
  assert.equal(fmSingle.title, "It's here");
  const fmDouble = parseYamlFrontmatter(['---', 'title: "Say \\"hi\\" now"', '---', ""].join("\n"));
  assert.equal(fmDouble.title, 'Say "hi" now');
});

test("yaml: nested metadata with Uppercase keys still resolves via case-insensitive lookup (#18)", () => {
  const fm = parseYamlFrontmatter(["---", "Metadata:", "  Version: 3.1.4", "---", ""].join("\n"));
  assert.equal(fm.Metadata.Version, "3.1.4");
});

// -----------------------------------------------------------------------------
// 2. MCP config redaction (audit #2, #20)
// -----------------------------------------------------------------------------
test("sanitizeMcpConfig: keeps only {command, args, url, transport}, drops env/headers (#2)", () => {
  const clean = sanitizeMcpConfig({
    command: "npx",
    args: ["-y", "@some/server"],
    url: "https://example.com/mcp",
    transport: "http",
    env: { GITHUB_TOKEN: "supersecret" },
    headers: { Authorization: "Bearer tok" },
    autoApprove: ["all"],
  });
  assert.deepEqual(clean, { command: "npx", args: ["-y", "@some/server"], url: "https://example.com/mcp", transport: "http" });
  assert.equal(JSON.stringify(clean).includes("supersecret"), false);
  assert.equal(JSON.stringify(clean).includes("Bearer tok"), false);
});

test("sanitizeMcpConfig: rejects non-object configs (#20)", () => {
  assert.equal(sanitizeMcpConfig(null), null);
  assert.equal(sanitizeMcpConfig("npx -y server"), null);
  assert.equal(sanitizeMcpConfig(42), null);
  assert.equal(sanitizeMcpConfig(["a", "b"]), null);
  assert.equal(sanitizeMcpConfig({}), null); // nothing persistable
});

test("sanitizeMcpConfig: drops non-array args and filters non-primitive items", () => {
  assert.equal(sanitizeMcpConfig({ command: "x", args: "not-an-array" }).args, undefined);
  assert.deepEqual(sanitizeMcpConfig({ command: "x", args: ["a", 2, true, { bad: 1 }] }).args, ["a", 2, true]);
});

test("reconcile: persists only the redacted config subset for mcps (#2)", () => {
  const state = { items: {} };
  const probe = {
    found: {
      plugins: new Map(),
      skills: new Map(),
      mcps: new Map([
        [
          "github",
          {
            id: "github",
            source: "/tmp/fake.json",
            config: { type: "http", url: "https://api.github.com/mcp", headers: { Authorization: "Bearer x" }, env: { GH_TOKEN: "y" } },
          },
        ],
      ]),
    },
  };
  const next = reconcile(state, probe);
  const item = next.items["mcp:github"];
  assert.ok(item);
  // `type` is not in the safe allowlist {command, args, url, transport}
  assert.deepEqual(item.config, { url: "https://api.github.com/mcp" });
  assert.equal(JSON.stringify(item).includes("Bearer x"), false);
  assert.equal(JSON.stringify(item).includes("GH_TOKEN"), false);
});

test("reconcile: drift key split keeps ids containing ':' (#17)", () => {
  const items = {
    "plugin:foo:deadbeef01": { type: "plugin", id: "foo:deadbeef01", detected: false },
  };
  const probe = {
    found: {
      plugins: new Map([["foo:deadbeef01", { id: "foo:deadbeef01" }]]),
      skills: new Map(),
      mcps: new Map(),
    },
  };
  const next = reconcile({ items }, probe);
  assert.equal(next.items["plugin:foo:deadbeef01"].detected, true);
});

// -----------------------------------------------------------------------------
// 3. upstream-meta defensive merge (#1)
// -----------------------------------------------------------------------------
test("mergeUpstreamMeta: empty fetch returns null so caller skips the write (#1)", () => {
  assert.equal(mergeUpstreamMeta({}, { "plugin:goal": { sha: "abc" } }), null);
  assert.equal(mergeUpstreamMeta(null, { a: 1 }), null);
  assert.equal(mergeUpstreamMeta([], { a: 1 }), null);
});

test("mergeUpstreamMeta: partial fetch merges over existing without losing keys (#1)", () => {
  const existing = { "plugin:goal": { sha: "old" }, "skill:docs": { sha: "keep" } };
  const merged = mergeUpstreamMeta({ "plugin:goal": { sha: "new" } }, existing);
  assert.equal(merged["plugin:goal"].sha, "new");
  assert.equal(merged["skill:docs"].sha, "keep");
});

test("mergeUpstreamMeta: fresh write when nothing exists", () => {
  assert.deepEqual(mergeUpstreamMeta({ "mcp:x": { sha: "s" } }, null), { "mcp:x": { sha: "s" } });
});

// -----------------------------------------------------------------------------
// 4. Catalog schema validation (C4-03)
// -----------------------------------------------------------------------------
test("validateCatalogSchema: filters invalid entries and recomputes counts (C4-03)", () => {
  const catalog = {
    counts: { total: 5, plugins: 3, skills: 1, mcps: 1 },
    entries: [
      { id: "good-plugin", type: "plugin" },
      { id: "bad-type", type: "malware" },
      { id: "", type: "skill" },
      { id: 42, type: "skill" },
      { id: "evil", type: "mcp", install: { args: ["x", { cmd: "& calc" }] } },
      { id: "good-mcp", type: "mcp", install: { args: ["mcp", "add"] } },
    ],
  };
  const clean = validateCatalogSchema(catalog);
  assert.equal(clean.entries.length, 2);
  assert.deepEqual(clean.entries.map((e) => e.id), ["good-plugin", "good-mcp"]);
  assert.equal(clean.counts.total, 2);
  assert.equal(clean.counts.plugins, 1);
  assert.equal(clean.counts.mcps, 1);
});

test("validateCatalogSchema: throws on structurally unusable payloads (C4-03)", () => {
  assert.throws(() => validateCatalogSchema(null), /not an object/);
  assert.throws(() => validateCatalogSchema({}), /non-empty array/);
  assert.throws(() => validateCatalogSchema({ entries: [] }), /non-empty array/);
  assert.throws(
    () => validateCatalogSchema({ entries: [{ id: "", type: "skill" }] }),
    /all entries failed/
  );
});

// -----------------------------------------------------------------------------
// 5. skills-lock integrity (audit #3)
// -----------------------------------------------------------------------------
test("integrity: sha256Hex matches known vectors", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("integrity: verifySkillsLock detects ok/mismatch/missing/invalid (#3)", () => {
  const content = "skill body for hashing";
  const hash = sha256Hex(content);
  const lock = {
    version: 1,
    skills: {
      "good-skill": { source: "a/b", skillPath: "skill/good/SKILL.md", computedHash: hash },
      "drifted-skill": { source: "a/b", skillPath: "skill/drift/SKILL.md", computedHash: "0".repeat(64) },
      "missing-skill": { source: "a/b", skillPath: "skill/missing/SKILL.md", computedHash: "1".repeat(64) },
      "broken-entry": { source: "a/b", skillPath: "skill/broken/SKILL.md", computedHash: "not-a-hash" },
    },
  };
  const readSkill = (entry) => (entry.id === "missing-skill" ? null : content);
  const { ok, results, error } = verifySkillsLock(lock, { readSkill });
  assert.equal(error, null);
  assert.equal(ok, false);
  const byId = Object.fromEntries(results.map((r) => [r.id, r.status]));
  assert.equal(byId["good-skill"], "ok");
  assert.equal(byId["drifted-skill"], "mismatch");
  assert.equal(byId["missing-skill"], "missing");
  assert.equal(byId["broken-entry"], "invalid");
});

test("integrity: verifySkillsLock all-ok lock passes (#3)", () => {
  const content = "intact";
  const lock = { version: 1, skills: { s: { skillPath: "p", computedHash: sha256Hex(content) } } };
  const { ok, results } = verifySkillsLock(lock, { readSkill: () => content });
  assert.equal(ok, true);
  assert.equal(results[0].status, "ok");
});

test("integrity: verifySkillsLock rejects malformed lock payloads", () => {
  assert.equal(verifySkillsLock(null).ok, false);
  assert.equal(verifySkillsLock({}).ok, false);
  assert.equal(verifySkillsLock({ skills: [] }).ok, false);
});

test("integrity: resolveLocalSkillPath finds conventional install locations (#3)", () => {
  const skillDir = join(testTmpDir, ".agents", "skills", "demo");
  mkdirSync(skillDir, { recursive: true });
  const skillFile = join(skillDir, "SKILL.md");
  writeFileSync(skillFile, "demo");
  const found = resolveLocalSkillPath({ id: "demo", skillPath: "skill/demo/SKILL.md" }, testTmpDir);
  assert.equal(found, skillFile);
  assert.equal(resolveLocalSkillPath({ id: "nope", skillPath: "skill/nope/SKILL.md" }, testTmpDir), null);
});

// -----------------------------------------------------------------------------
// 6. safeWriteJson: concurrency + no tmp leftovers (#4, #21)
// -----------------------------------------------------------------------------
test("state: safeWriteJson serializes concurrent writers and lands the last payload (#4)", async () => {
  const file = join(testTmpDir, "state-queue.json");
  const writes = [];
  for (let i = 0; i < 10; i++) {
    writes.push(safeWriteJson(file, { n: i }));
  }
  await Promise.all(writes);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).n, 9);
});

test("state: repeated writes leave no .tmp leftovers from completed writes (#21)", async () => {
  const dir = join(testTmpDir, "state-tmpcheck");
  const file = join(dir, "state-tmpcheck.json");
  await safeWriteJson(file, { a: 1 });
  await safeWriteJson(file, { a: 2 });
  const leftovers = readdirSync(dir).filter((f) => f.endsWith(".tmp"));
  assert.deepEqual(leftovers, []);
  assert.equal(existsSync(file), true);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).a, 2);
});

// -----------------------------------------------------------------------------
// 7. recommender module: workspace-aware scoring, recommendations, bundles
// -----------------------------------------------------------------------------
const recommender = await import("../lib/recommender.js");

const SYNTHETIC_ENTRIES = [
  { type: "skill", id: "pyDataTool", name: "PyData Tool", tagline: "Python data helpers", tags: ["python"] },
  { type: "skill", id: "reactUiKit", name: "React UI Kit", tagline: "React components", tags: ["react"] },
];

test("recommender: module exposes the public API with the extended rule catalog", () => {
  assert.equal(typeof recommender.scoreEntry, "function");
  assert.equal(typeof recommender.buildRecommendations, "function");
  assert.equal(typeof recommender.buildBundles, "function");
  assert.equal(typeof recommender.__testing, "object");
  assert.ok(Array.isArray(recommender.__testing.BUNDLE_RULES));
  assert.ok(recommender.__testing.BUNDLE_RULES.length >= 12, "bundle rule catalog was extended");
  assert.equal(typeof recommender.__testing.scoreEntry, "function");
  assert.equal(typeof recommender.__testing.normalizeContext, "function");
});

test("recommender: buildRecommendations surfaces only python-matching entries with calibrated matchPercent", () => {
  const ctx = { cwd: "/tmp", repo: "", languages: ["python"], frameworks: ["fastapi"], tags: [], hints: [], dependencies: [] };
  const recs = recommender.buildRecommendations(SYNTHETIC_ENTRIES, ctx, { limit: 5 });
  assert.equal(recs.length, 1);
  assert.equal(recs[0].entry.id, "pyDataTool");
  assert.ok(recs[0].reasons.length > 0 && recs[0].reasons.length <= 4, "reasons are deduped and capped");
  assert.ok(recs[0].matchPercent >= 50 && recs[0].matchPercent <= 99, "positive scores land in the 50-99 band");
  assert.ok(recs[0].score > 0);
});

test("recommender: dependency-name signal boosts entries sharing a package name", () => {
  const ctx = { languages: [], frameworks: [], tags: [], hints: [], dependencies: ["pydata"] };
  const recs = recommender.buildRecommendations(SYNTHETIC_ENTRIES, ctx, { limit: 5 });
  assert.equal(recs.length, 1);
  assert.ok(recs[0].reasons.some((r) => r.includes("Uses dependency: pydata")));
});

test("recommender: installedKeys use raw `type:id` keys (hyphens and case preserved)", () => {
  const ctx = { languages: ["python"], frameworks: [], tags: [], hints: [], dependencies: [] };
  const recs = recommender.buildRecommendations(SYNTHETIC_ENTRIES, ctx, { installedKeys: ["skill:pyDataTool"] });
  assert.equal(recs.length, 0);
});

test("recommender: buildBundles emits signal-matched bundles with entries and completionPercent 0-100", () => {
  const ctx = { cwd: "/tmp", repo: "", languages: [], frameworks: [], tags: ["agent"], hints: [], dependencies: [] };
  const entries = [
    { type: "skill", id: "agentTool", name: "Agent Tool", tagline: "Agent tooling", tags: ["agent"] },
    { type: "skill", id: "mcpServer", name: "MCP Server", tagline: "MCP server bridge", tags: ["mcp"] },
  ];
  const bundles = recommender.buildBundles(entries, ctx, { maxEntriesPerBundle: 2 });
  assert.ok(bundles.length >= 1);
  const agentic = bundles.find((b) => b.id === "agentic-ai");
  assert.ok(agentic, "expected agentic-ai bundle");
  assert.ok(Array.isArray(agentic.entries) && agentic.entries.length > 0);
  assert.ok(agentic.completionPercent >= 0 && agentic.completionPercent <= 100);
});



