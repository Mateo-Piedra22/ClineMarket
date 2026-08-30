#!/usr/bin/env node
// Pure unit test suite for Cline Marketplace sanitizers, state engine, and command resolvers.

import test from "node:test";
import assert from "node:assert/strict";
import { unlinkSync } from "node:fs";
import { resolveCommand } from "./lib/resolve-command.mjs";
import {
  sanitizePrimitiveId,
  sanitizePrimitiveType,
  sanitizeWorkspacePath,
  isWindowsBatchShim,
} from "../lib/sanitizers.js";
import { readJson, safeWriteJson } from "../lib/state.js";

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
  assert.equal(isWindowsBatchShim("C:\\bin\\cline.cmd"), true);
  assert.equal(isWindowsBatchShim("C:\\bin\\cline.bat"), true);
  assert.equal(isWindowsBatchShim("C:\\bin\\cline.exe"), false);
  assert.equal(isWindowsBatchShim("/usr/local/bin/cline"), false);
  assert.equal(isWindowsBatchShim(null), false);
});

test("state: safeWriteJson and readJson serialization", async () => {
  const tmpFile = `data/test-queue-${Date.now()}.json`;

  // Concurrent write stress test
  const writes = Array.from({ length: 5 }, (_, i) =>
    safeWriteJson(tmpFile, { iteration: i, timestamp: Date.now() })
  );

  await Promise.all(writes);

  const finalData = readJson(tmpFile);
  assert.ok(finalData);
  assert.ok(typeof finalData.iteration === "number");

  // Cleanup
  try { unlinkSync(tmpFile); } catch {}
});

test("command resolver: resolves installed system binaries", async () => {
  const nodeExe = await resolveCommand("node");
  assert.ok(nodeExe);
  assert.ok(nodeExe.length > 0);
});
