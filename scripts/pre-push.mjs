import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("\x1b[36m==> [PRE-PUSH HOOK] Running Automated Verification Pipeline...\x1b[0m");

try {
  // Run full test suite (unit tests + integration smoke tests)
  execSync(`"${process.execPath}" "${join(root, "scripts", "unit-test.mjs")}"`, {
    cwd: root,
    stdio: "inherit",
  });
  execSync(`"${process.execPath}" "${join(root, "scripts", "smoke-test.mjs")}"`, {
    cwd: root,
    stdio: "inherit",
  });

  console.log("\x1b[32m==> [PRE-PUSH SUCCESS] All verification tests passed!\x1b[0m");
} catch (err) {
  console.error("\x1b[31m[PRE-PUSH FAILED]\x1b[0m", err.message);
  process.exit(1);
}
