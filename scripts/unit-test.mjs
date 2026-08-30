#!/usr/bin/env node
// Pure unit test suite for Cline Marketplace sanitizers, state engine, reconciler, resolvers, CLI, and probes.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { resolveCommand, isWindowsBatchShim } from "../lib/resolver.js";
import {
  sanitizePrimitiveId,
  sanitizePrimitiveType,
  sanitizeWorkspacePath,
} from "../lib/sanitizers.js";
import { readJson, safeWriteJson, getDataDir } from "../lib/state.js";
import { reconcile } from "../lib/reconciler.js";
import { verbFor } from "../lib/runner.js";
import { isPortOpen } from "../bin/cline-marketplace.js";
import { parseYamlFrontmatter, extractLocalSkillMeta, clineRootCandidates } from "../lib/probes.js";

// Isolated temporary directory for persistence during unit tests
const testTmpDir = mkdtempSync(join(tmpdir(), "clinemarket-unit-"));
process.env.CLINEMARKET_DATA_DIR = testTmpDir;

process.on("exit", () => {
  try {
    rmSync(testTmpDir, { recursive: true, force: true });
  } catch {}
});

test("sanitizers: sanitizePrimitiveId", () => {
  // Valid IDs
  assert.equal(sanitizePrimitiveId("goal"), "goal");
  assert.equal(sanitizePrimitiveId("my-skill-123"), "my-skill-123");
  assert.equal(sanitizePrimitiveId("@scope/plugin"), null); // slashes blocked
  assert.equal(sanitizePrimitiveId("scope_name.v1"), "scope_name.v1");

  // Malicious / Path Traversal IDs
  assert.equal(sanitizePrimitiveId("../../../etc/passwd"), null);
  assert.equal(sanitizePrimitiveId("..\\..\\windows\\system32"), null);
  assert.equal(sanitizePrimitiveId("plugin/evil"), null);
  assert.equal(sanitizePrimitiveId("plugin; rm -rf /"), null);
  assert.equal(sanitizePrimitiveId("plugin && calc.exe"), null);
  assert.equal(sanitizePrimitiveId(""), null);
  assert.equal(sanitizePrimitiveId(null), null);
  assert.equal(sanitizePrimitiveId(undefined), null);
  assert.equal(sanitizePrimitiveId({}), null);
});

test("sanitizers: sanitizePrimitiveType", () => {
  assert.equal(sanitizePrimitiveType("plugin"), "plugin");
  assert.equal(sanitizePrimitiveType("skill"), "skill");
  assert.equal(sanitizePrimitiveType("mcp"), "mcp");
  assert.equal(sanitizePrimitiveType("PLUGIN"), "plugin");
  assert.equal(sanitizePrimitiveType("Skill"), "skill");

  // Invalid types
  assert.equal(sanitizePrimitiveType("malware"), null);
  assert.equal(sanitizePrimitiveType("exe"), null);
  assert.equal(sanitizePrimitiveType(""), null);
  assert.equal(sanitizePrimitiveType(null), null);
});

test("sanitizers: sanitizeWorkspacePath", () => {
  const cwd = process.cwd();
  assert.equal(sanitizeWorkspacePath(cwd), cwd);
  assert.equal(sanitizeWorkspacePath("non_existent_folder_xyz_123", cwd), cwd);
  assert.equal(sanitizeWorkspacePath("", cwd), cwd);
  assert.equal(sanitizeWorkspacePath(null, cwd), cwd);
});

test("resolver: isWindowsBatchShim", () => {
  assert.equal(isWindowsBatchShim("C:\\bin\\cline.cmd"), process.platform === "win32");
  assert.equal(isWindowsBatchShim("C:\\bin\\cline.bat"), process.platform === "win32");
  assert.equal(isWindowsBatchShim("C:\\bin\\cline.exe"), false);
  assert.equal(isWindowsBatchShim("/usr/local/bin/cline"), false);
  assert.equal(isWindowsBatchShim(null), false);
});

test("state: safeWriteJson and readJson serialization", async () => {
  const tmpFile = join(testTmpDir, `test-queue-${Date.now()}.json`);

  // Concurrent write stress test
  const writes = Array.from({ length: 5 }, (_, i) =>
    safeWriteJson(tmpFile, { iteration: i, timestamp: Date.now() })
  );

  await Promise.all(writes);

  const finalData = readJson(tmpFile);
  assert.ok(finalData, "File must exist and be valid JSON");
  assert.strictEqual(typeof finalData.iteration, "number", "iteration must be a number");
  assert.strictEqual(finalData.iteration, 4, "Final serialized iteration must be exactly 4");
});

test("runner: verbFor maps primitive types correctly", () => {
  assert.equal(verbFor("plugin"), "plugin");
  assert.equal(verbFor("skill"), "skill");
  assert.equal(verbFor("mcp"), "mcp");
  assert.equal(verbFor("unknown"), "plugin");
});

test("reconciler: correctly merges discovered primitives and detects drift", () => {
  const initialState = {
    items: {
      "plugin:old-plugin": {
        type: "plugin",
        id: "old-plugin",
        detected: true,
      },
      "skill:removed-skill": {
        type: "skill",
        id: "removed-skill",
        detected: true,
      },
    },
  };

  const probe = {
    found: {
      plugins: new Map([["old-plugin", { path: "/plugins/old-plugin" }], ["new-plugin", { path: "/plugins/new-plugin" }]]),
      skills: new Map(),
      mcps: new Map([["test-mcp", { config: { command: "node" } }]]),
    },
  };

  const reconciled = reconcile(initialState, probe);

  // Assertions
  assert.equal(reconciled.items["plugin:old-plugin"].detected, true);
  assert.equal(reconciled.items["skill:removed-skill"].detected, false); // drift detected
  assert.ok(reconciled.items["plugin:new-plugin"]);
  assert.equal(reconciled.items["plugin:new-plugin"].detected, true);
  assert.ok(reconciled.items["mcp:test-mcp"]);
  assert.equal(reconciled.items["mcp:test-mcp"].detected, true);
  assert.deepEqual(reconciled.items["mcp:test-mcp"].config, { command: "node" });
});

test("command resolver: resolves installed system binaries", async () => {
  const nodeExe = await resolveCommand("node");
  assert.ok(nodeExe);
  assert.ok(nodeExe.length > 0);
});

test("cli: isPortOpen defensive handling on invalid ports", async () => {
  const invalidPorts = [0, -1, -5000, 65536, 999999, 3000.5, "5173", null, undefined, {}, NaN, Infinity];
  for (const p of invalidPorts) {
    const result = await isPortOpen(p, "127.0.0.1");
    assert.strictEqual(result, false, `isPortOpen should return false for invalid port ${JSON.stringify(p)} without throwing`);
  }
});

test("probes: parseYamlFrontmatter handles block scalars (> and |), multiline, quotes, and metadata", () => {
  // 1. Folded block scalar (>)
  const foldedYaml = `---
name: "folded-skill"
description: >
  This is a folded block scalar
  spanning multiple continuous lines
  in markdown frontmatter.
version: '1.2.3'
---
# Skill Content`;
  const fmFolded = parseYamlFrontmatter(foldedYaml);
  assert.strictEqual(fmFolded.name, "folded-skill");
  assert.strictEqual(fmFolded.description, "This is a folded block scalar spanning multiple continuous lines in markdown frontmatter.");
  assert.strictEqual(fmFolded.version, "1.2.3");

  // 2. Literal block scalar (|)
  const literalYaml = `---
name: literal-skill
description: |
  Line 1 of description
  Line 2 of description
---`;
  const fmLiteral = parseYamlFrontmatter(literalYaml);
  assert.strictEqual(fmLiteral.name, "literal-skill");
  assert.strictEqual(fmLiteral.description, "Line 1 of description\nLine 2 of description");

  // 3. Metadata nested mapping & lists
  const metaYaml = `---
name: advanced-skill
metadata:
  author: AI Team
  version: 3.0.0
  triggers: automated, devops
tags:
  - web
  - testing
keywords: [automation, quality]
---`;
  const fmMeta = parseYamlFrontmatter(metaYaml);
  assert.strictEqual(fmMeta.name, "advanced-skill");
  assert.ok(fmMeta.metadata && typeof fmMeta.metadata === "object");
  assert.strictEqual(fmMeta.metadata.author, "AI Team");
  assert.strictEqual(fmMeta.metadata.version, "3.0.0");
  assert.strictEqual(fmMeta.metadata.triggers, "automated, devops");
  assert.deepEqual(fmMeta.tags, ["web", "testing"]);
  assert.deepEqual(fmMeta.keywords, ["automation", "quality"]);

  // 4. Empty or invalid content returns empty object
  assert.deepEqual(parseYamlFrontmatter(""), {});
  assert.deepEqual(parseYamlFrontmatter(null), {});
  assert.deepEqual(parseYamlFrontmatter("No frontmatter content here"), {});
});

test("probes: extractLocalSkillMeta handles markdown body and frontmatter without > or | corruption", () => {
  // Test case A: Skill with folded block scalar (>) in SKILL.md
  const foldedSkillDir = join(testTmpDir, "skill-folded-test");
  mkdirSync(foldedSkillDir, { recursive: true });
  writeFileSync(
    join(foldedSkillDir, "SKILL.md"),
    `---
name: Clean Folded Skill
description: >
  High quality description line 1
  and continuation line 2.
metadata:
  author: Custom Author
  version: 2.1.0
  triggers: unit-test, regression
---
# Main Content
Some markdown body.`
  );

  const metaFolded = extractLocalSkillMeta(foldedSkillDir, "fallback-id");
  assert.strictEqual(metaFolded.name, "Clean Folded Skill");
  assert.strictEqual(metaFolded.description, "High quality description line 1 and continuation line 2.");
  assert.notStrictEqual(metaFolded.description, ">", "Description must not be corrupted to single '>' scalar");
  assert.notStrictEqual(metaFolded.description, "|", "Description must not be corrupted to single '|' scalar");
  assert.strictEqual(metaFolded.author, "Custom Author");
  assert.strictEqual(metaFolded.version, "2.1.0");
  assert.ok(metaFolded.tags.includes("unit-test"));
  assert.ok(metaFolded.tags.includes("regression"));

  // Test case B: Skill with only Markdown body and no frontmatter
  const bodySkillDir = join(testTmpDir, "skill-body-test");
  mkdirSync(bodySkillDir, { recursive: true });
  writeFileSync(
    join(bodySkillDir, "SKILL.md"),
    `# Skill Heading

This is the first standalone markdown paragraph describing the skill capabilities.

## Details
Additional info.`
  );

  const metaBody = extractLocalSkillMeta(bodySkillDir, "body-skill");
  assert.strictEqual(metaBody.name, "body-skill");
  assert.strictEqual(
    metaBody.description,
    "This is the first standalone markdown paragraph describing the skill capabilities."
  );
});

test("state: getDataDir environment precedence (CLINEMARKET_DATA_DIR > DATA_DIR > default)", () => {
  const origCM = process.env.CLINEMARKET_DATA_DIR;
  const origDD = process.env.DATA_DIR;

  try {
    // 1. CLINEMARKET_DATA_DIR takes highest precedence
    process.env.CLINEMARKET_DATA_DIR = join(testTmpDir, "cm_override");
    process.env.DATA_DIR = join(testTmpDir, "dd_override");
    assert.strictEqual(getDataDir(), resolve(join(testTmpDir, "cm_override")));

    // 2. DATA_DIR used when CLINEMARKET_DATA_DIR is unset
    delete process.env.CLINEMARKET_DATA_DIR;
    process.env.DATA_DIR = join(testTmpDir, "dd_override");
    assert.strictEqual(getDataDir(), resolve(join(testTmpDir, "dd_override")));

    // 3. Fallback to defaultRoot/data when neither is set
    delete process.env.CLINEMARKET_DATA_DIR;
    delete process.env.DATA_DIR;
    const baseDir = join(testTmpDir, "custom_base");
    assert.strictEqual(getDataDir(baseDir), join(baseDir, "data"));
    assert.strictEqual(getDataDir(), join(process.cwd(), "data"));
  } finally {
    if (origCM !== undefined) process.env.CLINEMARKET_DATA_DIR = origCM;
    else delete process.env.CLINEMARKET_DATA_DIR;
    if (origDD !== undefined) process.env.DATA_DIR = origDD;
    else delete process.env.DATA_DIR;
  }
});

test("state: readJson quarantines corrupt JSON with .corrupt timestamp and returns fallback", () => {
  const corruptFile = join(testTmpDir, `corrupt-test-${Date.now()}.json`);
  writeFileSync(corruptFile, "{ invalid: json, not well formed syntax");

  const fallback = { safe: true, recovered: true };
  const readResult = readJson(corruptFile, fallback);

  assert.deepEqual(readResult, fallback, "readJson must return fallback on corrupted JSON");

  // Verify quarantine backup file was created
  const filesInDir = readdirSync(testTmpDir);
  const corruptBackups = filesInDir.filter((f) => f.startsWith(corruptFile.slice(testTmpDir.length + 1)) && f.includes(".corrupt."));
  assert.ok(corruptBackups.length >= 1, "A .corrupt.<timestamp> quarantine backup file must be created on disk");

  const backupContent = readFileSync(join(testTmpDir, corruptBackups[0]), "utf8");
  assert.strictEqual(backupContent, "{ invalid: json, not well formed syntax");
});

test("probes: clineRootCandidates includes ~/.commandcode and ~/.agents", () => {
  const candidates = clineRootCandidates();
  assert.ok(Array.isArray(candidates), "clineRootCandidates must return an array");

  // Every path in candidates must exist on filesystem
  for (const c of candidates) {
    assert.ok(existsSync(c), `Candidate root ${c} must exist on disk`);
  }

  const home = homedir();
  const commandcodePath = join(home, ".commandcode");
  const agentsPath = join(home, ".agents");

  if (existsSync(commandcodePath)) {
    assert.ok(
      candidates.includes(commandcodePath),
      `candidates must include ~/.commandcode when it exists on disk (${commandcodePath})`
    );
  }

  if (existsSync(agentsPath)) {
    assert.ok(
      candidates.includes(agentsPath),
      `candidates must include ~/.agents when it exists on disk (${agentsPath})`
    );
  }
});
