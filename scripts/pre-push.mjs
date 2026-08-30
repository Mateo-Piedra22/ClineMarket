import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const PORT = 5173;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function isServerRunning() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/status`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log("\x1b[36m==> [PRE-PUSH HOOK] Running Automated Screenshot & Verification Pipeline...\x1b[0m");

  let spawnedServer = null;
  const running = await isServerRunning();

  if (!running) {
    console.log("\x1b[33m==> [PRE-PUSH] Starting temporary local server for automated captures...\x1b[0m");
    spawnedServer = spawn(process.execPath, [join(root, "server.js")], {
      cwd: root,
      stdio: "ignore",
      windowsHide: true,
    });

    let ready = false;
    for (let i = 0; i < 25; i++) {
      await sleep(300);
      if (await isServerRunning()) { ready = true; break; }
    }

    if (!ready) {
      if (spawnedServer) { try { spawnedServer.kill(); } catch {} }
      console.error("\x1b[31m[PRE-PUSH ERROR] Failed to start local server for captures.\x1b[0m");
      process.exit(1);
    }
  }

  try {
    // 1. Run Smoke Tests
    console.log("\x1b[34m==> [PRE-PUSH] Running smoke tests...\x1b[0m");
    execSync(`"${process.execPath}" "${join(root, "scripts", "smoke-test.mjs")}"`, {
      cwd: root,
      stdio: "inherit",
    });

    // 2. Capture fresh screenshots
    console.log("\x1b[34m==> [PRE-PUSH] Capturing fresh 2x resolution screenshots via CDP...\x1b[0m");
    execSync(`"${process.execPath}" "${join(root, "scripts", "capture-screenshots.mjs")}"`, {
      cwd: root,
      stdio: "inherit",
    });

    console.log("\x1b[32m==> [PRE-PUSH SUCCESS] All screenshots and verification tests passed!\x1b[0m");
  } catch (err) {
    console.error("\x1b[31m[PRE-PUSH FAILED]\x1b[0m", err.message);
    process.exit(1);
  } finally {
    if (spawnedServer) {
      try { spawnedServer.kill(); } catch {}
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
