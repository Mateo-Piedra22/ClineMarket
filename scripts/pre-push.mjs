import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("\x1b[36m==> [PRE-PUSH HOOK] Running Automated Verification Pipeline...\x1b[0m");

try {
  // Centralized green bar: unit + smoke + audit + skills-lock integrity
  // (package.json `verify` script — single source, same as CI).
  execSync(`"${process.execPath}" "${join(root, "scripts", "unit-test.mjs")}"`, {
    cwd: root,
    stdio: "inherit",
  });
  execSync(`"${process.execPath}" "${join(root, "scripts", "smoke-test.mjs")}"`, {
    cwd: root,
    stdio: "inherit",
  });
  execSync("npm audit --omit=dev --audit-level=moderate", { cwd: root, stdio: "inherit" });
  execSync(`"${process.execPath}" "${join(root, "scripts", "verify-skills-lock.mjs")}"`, {
    cwd: root,
    stdio: "inherit",
  });

  console.log("\x1b[32m==> [PRE-PUSH SUCCESS] All verification checks passed!\x1b[0m");
} catch (err) {
  console.error("\x1b[31m[PRE-PUSH FAILED]\x1b[0m", err.message);
  process.exit(1);
}
