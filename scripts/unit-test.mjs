#!/usr/bin/env node
// Pure unit test suite for Cline Marketplace sanitizers, state engine, reconciler, and resolvers.

import test from "node:test";
import assert from "node:assert/strict";
import { unlinkSync } from "node:fs";
import { resolveCommand, isWindowsBatchShim } from "../lib/resolver.js";
import {
  sanitizePrimitiveId,
  sanitizePrimitiveType,
  sanitizeWorkspacePath,
} from "../lib/sanitizers.js";
import { readJson, safeWriteJson } from "../lib/state.js";
import { reconcile } from "../lib/reconciler.js";
import { verbFor } from "../lib/runner.js";

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
