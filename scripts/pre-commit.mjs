import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Fail-fast: ANSI for clear UX across Windows/POSIX shells.
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

function step(label) {
  console.log(`${CYAN}==> [PRE-COMMIT] ${label}${RESET}`);
}

function ok(label) {
  console.log(`${GREEN}==> [PRE-COMMIT OK] ${label}${RESET}`);
}

function warn(label) {
  console.log(`${YELLOW}==> [PRE-COMMIT WARN] ${label}${RESET}`);
}

function fail(label, err) {
  console.error(`${RED}[PRE-COMMIT FAILED] ${label}${RESET}`);
  if (err) console.error(err.message || err);
  process.exit(1);
}

// 1. Skills-lock integrity (cheap, blocks a corrupted skills-lock.json
//    from being pushed alongside the schema it claims to lock).
step("Verifying skills-lock.json integrity");
try {
  execSync(`"${process.execPath}" "${join(root, "scripts", "verify-skills-lock.mjs")}"`, {
    cwd: root,
    stdio: "inherit",
  });
} catch (err) {
  fail("skills-lock verification failed", err);
}

// 2. Unit tests. Same script that CI runs, isolated in os.tmpdir() by
//    the script itself, so no production data is mutated.
step("Running unit tests (scripts/unit-test.mjs)");
try {
  execSync(`"${process.execPath}" "${join(root, "scripts", "unit-test.mjs")}"`, {
    cwd: root,
    stdio: "inherit",
  });
  ok("unit tests passed");
} catch (err) {
  fail("unit tests failed", err);
}

// 3. Spanish-character guard for files outside docs/audits/, .agents/,
//    node_modules/ and data/. Prevents the documented "all UI/docs in
//    English" rule from regressing silently.
step("Checking for Spanish characters outside docs/audits/, .agents/, node_modules/, data/");
try {
  const find = spawnSync(
    "git",
    [
      "ls-files",
      "--exclude-standard",
      "--others",
      "--cached",
      "--modified",
      // Restrict to text-ish files we own.
    ],
    { cwd: root, encoding: "utf8" }
  );
  if (find.status === 0) {
    const offenders = [];
    const pattern = /[áéíóúñ¿¡]/;
    // We only check the working tree, not the full repo, to keep this fast
    // and to honor the user's last commit. Tracked modified files are
    // listed by `git diff --name-only`; the union is the set we should lint.
    const modified = spawnSync("git", ["diff", "--name-only", "--cached"], { cwd: root, encoding: "utf8" });
    const staged = (modified.stdout || "").split("\n").filter(Boolean);
    const candidates = new Set(staged);
    // Also include the files currently touched (covers the common case of
    // editing then forgetting to `git add`).
    const dirty = spawnSync("git", ["diff", "--name-only"], { cwd: root, encoding: "utf8" });
    (dirty.stdout || "").split("\n").filter(Boolean).forEach((p) => candidates.add(p));
    for (const rel of candidates) {
      if (!rel) continue;
      if (
        rel.includes("node_modules" + "/") ||
        rel.startsWith(".agents/") ||
        rel.startsWith("docs/audits/") ||
        rel.startsWith("data/")
      ) continue;
      if (!/\.(md|mjs|js|cjs|json|html|css|yml|yaml|sh)$/i.test(rel)) continue;
      try {
        const abs = join(root, rel);
        if (!existsSync(abs)) continue;
        const text = readFileSync(abs, "utf8");
        if (pattern.test(text)) offenders.push(rel);
      } catch {}
    }
    if (offenders.length > 0) {
      fail(
        "Spanish characters found in files outside the allowed prefixes:\n  " +
          offenders.map((p) => `- ${p}`).join("\n  ") +
          "\nTranslate or add the path to the allowlist in scripts/pre-commit.mjs."
      );
    } else {
      ok("no Spanish characters in working tree");
    }
  } else {
    warn("git ls-files failed; skipping Spanish-character guard");
  }
} catch (err) {
  fail("Spanish-character guard crashed", err);
}

// 4. Capture fresh documentation screenshots. The script is best-effort:
//   it needs Chrome/Chromium and a free CDP port. If Chrome is missing or
//   capture fails, warn but DO NOT block the commit (the user might be
//   on a machine without a browser, e.g. CI runners). To make the
//   capture strictly required, set CLINEMARKET_REQUIRE_SCREENSHOTS=1.
step("Capturing fresh documentation screenshots");
const requireShots = process.env.CLINEMARKET_REQUIRE_SCREENSHOTS === "1";
try {
  const result = spawnSync(
    process.execPath,
    [join(root, "scripts", "capture-screenshots.mjs")],
    { cwd: root, stdio: "inherit" }
  );
  if (result.status !== 0) {
    if (requireShots) {
      fail("screenshot capture failed (CLINEMARKET_REQUIRE_SCREENSHOTS=1)");
    } else {
      warn("screenshot capture failed; continuing (set CLINEMARKET_REQUIRE_SCREENSHOTS=1 to enforce)");
    }
  } else {
    ok("screenshots captured");
  }
} catch (err) {
  if (requireShots) fail("screenshot capture crashed", err);
  else warn(`screenshot capture crashed; continuing (${err.message || err})`);
}

// 5. Auto-stage any new screenshot files so they ride along with the
//    code change that produced them. Safe no-op when nothing changed.
try {
  execSync("git add docs/screenshot-*.png 2>/dev/null || true", { cwd: root, stdio: "pipe" });
  ok("screenshots staged (if any)");
} catch {
  // Ignore: no screenshots produced this run.
}

console.log(`${GREEN}==> [PRE-COMMIT SUCCESS] All gates passed. Commit allowed.${RESET}`);
