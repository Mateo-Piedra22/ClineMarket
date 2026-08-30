import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("\x1b[36m==> [PRE-COMMIT HOOK] Running unit tests and capturing fresh screenshots...\x1b[0m");

try {
  // 1. Run Unit Tests
  execSync(`"${process.execPath}" "${join(root, "scripts", "unit-test.mjs")}"`, {
    cwd: root,
    stdio: "inherit",
  });

  // 2. Capture fresh screenshots
  execSync(`"${process.execPath}" "${join(root, "scripts", "capture-screenshots.mjs")}"`, {
    cwd: root,
    stdio: "inherit",
  });

  // 3. Automatically stage newly generated screenshots so they are included in this commit
  execSync("git add docs/screenshot-*.png", { cwd: root, stdio: "inherit" });

  console.log("\x1b[32m==> [PRE-COMMIT SUCCESS] Screenshots captured and staged cleanly!\x1b[0m");
} catch (err) {
  console.error("\x1b[31m[PRE-COMMIT FAILED]\x1b[0m", err.message);
  process.exit(1);
}
