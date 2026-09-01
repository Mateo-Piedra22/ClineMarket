#!/usr/bin/env node
// CLI integrity verifier for skills-lock.json (audit 02-deteccion-estado #3).
// Recomputes SHA-256 of each locked skill and compares against computedHash.
// Exit 0: all entries verified. Exit 1: any drift, missing file, or invalid lock.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifySkillsLock } from "../lib/integrity.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const lockPath = join(root, "skills-lock.json");

let lock;
try {
  lock = JSON.parse(readFileSync(lockPath, "utf8"));
} catch (err) {
  console.error(`[verify-lock] FAILED: cannot read ${lockPath}: ${err.message}`);
  process.exit(1);
}

const { ok, results, error } = verifySkillsLock(lock, { rootDir: root });
if (error) {
  console.error(`[verify-lock] FAILED: ${error}`);
  process.exit(1);
}

for (const r of results) {
  const mark = r.status === "ok" ? "OK   " : "DRIFT";
  console.log(`[verify-lock] ${mark} ${r.id} (${r.skillPath ?? "n/a"}) expected=${r.expected ?? "n/a"} actual=${r.actual ?? "missing"}`);
}

if (!ok) {
  console.error("[verify-lock] FAILED: integrity drift detected");
  process.exit(1);
}
console.log(`[verify-lock] all ${results.length} entries verified`);
