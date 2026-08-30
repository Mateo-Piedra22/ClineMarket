#!/usr/bin/env node
// Global CLI & NPX Runner for the Cline Marketplace local browser.
// One-shot: auto-install deps if needed → verify catalog → start server → open browser.

import { spawn } from "node:child_process";
import { existsSync, statSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile as _execFile } from "node:child_process";
import { platform } from "node:os";
import net from "node:net";

const execFileP = promisify(_execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const serverEntry = join(pkgRoot, "server.js");
const refreshScript = join(pkgRoot, "scripts/refresh-catalog.mjs");
const catalogFile = join(pkgRoot, "catalog.json");
const pkgJsonFile = join(pkgRoot, "package.json");

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${colors.gray}[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]${colors.reset}`;
}

function log(msg, ...meta) {
  console.log(`${timestamp()} ${colors.cyan}[CLI]${colors.reset} ${msg}`, ...meta);
}
function warn(msg, ...meta) {
  console.warn(`${timestamp()} ${colors.yellow}[WARN]${colors.reset} ${msg}`, ...meta);
}
function error(msg, ...meta) {
  console.error(`${timestamp()} ${colors.red}[ERROR]${colors.reset} ${msg}`, ...meta);
}

const HELP = `
${colors.bold}cline-marketplace${colors.reset} — Local browser and control plane for Cline Marketplace primitives.

${colors.bold}Usage:${colors.reset}
  npx cline-marketplace               One-shot launch: prepare → start server → open browser
  cline-marketplace                   Standard CLI launch
  cline-marketplace --no-open         Start server without opening browser window
  cline-marketplace --port <n>        Specify server port (default: 5173 or next available)
  cline-marketplace update            Check for updates and pull latest version
  cline-marketplace refresh           Re-download catalog and refresh upstream metadata
  cline-marketplace refresh --catalog Fast catalog refresh (skip commit metadata)
  cline-marketplace help              Display this help message
`;

if (process.argv.includes("--help") || process.argv.includes("-h") || process.argv[2] === "help") {
  console.log(HELP);
  process.exit(0);
}

const args = process.argv.slice(2);
const sub = args[0];
const NO_OPEN = args.includes("--no-open");
const portIdx = args.indexOf("--port");
const cliPort = portIdx >= 0 ? Number(args[portIdx + 1]) : null;

// Self-bootstrap: ensure dependencies are installed (crucial for npx execution)
async function ensureDependencies() {
  const expressModule = join(pkgRoot, "node_modules", "express");
  if (!existsSync(expressModule)) {
    log("Initializing local runtime dependencies (first-time setup)...");
    try {
      await execFileP(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--omit=dev"], {
        cwd: pkgRoot,
        timeout: 90_000,
      });
      log("Runtime dependencies ready.");
    } catch (err) {
      warn(`Could not run npm install automatically: ${err.message}`);
    }
  }
}

function ensureServerEntry() {
  if (!existsSync(serverEntry)) {
    error(`server.js not found at ${serverEntry}`);
    process.exit(1);
  }
}

function hasFreshCatalog() {
  if (!existsSync(catalogFile)) return false;
  try { return Date.now() - statSync(catalogFile).mtimeMs < 24 * 60 * 60 * 1000; }
  catch { return false; }
}

async function fetchCatalog() {
  log("Downloading catalog from upstream registry...");
  try {
    await execFileP(process.execPath, [refreshScript, "--catalog"], { cwd: pkgRoot, timeout: 60_000 });
    log("Catalog downloaded successfully.");
    return true;
  } catch (err) {
    warn(`Catalog download failed: ${err.message}`);
    return false;
  }
}

async function checkForRemoteUpdates() {
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonFile, "utf8"));
    const currentVersion = pkg.version || "1.0.0";
    const res = await fetch("https://raw.githubusercontent.com/Mateo-Piedra22/ClineMarket/main/package.json", {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const remotePkg = await res.json();
      if (remotePkg.version && remotePkg.version !== currentVersion) {
        console.log("");
        console.log(`${colors.yellow}┌────────────────────────────────────────────────────────┐${colors.reset}`);
        console.log(`${colors.yellow}│${colors.reset}  ${colors.bold}Update Available:${colors.reset} v${currentVersion} -> ${colors.green}v${remotePkg.version}${colors.reset}${" ".repeat(25)}${colors.yellow}│${colors.reset}`);
        console.log(`${colors.yellow}│${colors.reset}  Run ${colors.cyan}git pull${colors.reset} or ${colors.cyan}npm install -g cline-marketplace${colors.reset}${" ".repeat(8)}${colors.yellow}│${colors.reset}`);
        console.log(`${colors.yellow}└────────────────────────────────────────────────────────┘${colors.reset}`);
        console.log("");
      }
    }
  } catch {}
}

async function isPortOpen(port, host) {
  return new Promise((resolveOpen) => {
    const sock = net.connect({ port, host });
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolveOpen(v); sock.destroy(); } };
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
    setTimeout(() => done(false), 800);
  });
}

async function waitForServer(port, host, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port, host)) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function probeStatus(port, host, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://${host}:${port}/api/status`, { signal: AbortSignal.timeout(800) });
      if (r.ok) return await r.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

function startServer(port, host) {
  const env = { ...process.env, PORT: String(port), HOST: host };
  log(`Spawning server process on http://${host}:${port}`);
  const child = spawn(process.execPath, [serverEntry], {
    cwd: pkgRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (d) => process.stdout.write(d));
  child.stderr.on("data", (d) => process.stderr.write(d));
  child.on("exit", (code, signal) => {
    if (signal === "SIGINT" || signal === "SIGTERM") {
      console.log(`\n${timestamp()} ${colors.yellow}[CLI]${colors.reset} Server process stopped.`);
    } else if (code !== 0 && code !== null) {
      error(`Server exited with code ${code}`);
    }
    process.exit(code ?? 0);
  });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  return child;
}

function openBrowser(url) {
  const os = platform();
  let cmd, cmdArgs;
  if (os === "win32") { cmd = "cmd"; cmdArgs = ["/c", "start", "", url]; }
  else if (os === "darwin") { cmd = "open"; cmdArgs = [url]; }
  else { cmd = "xdg-open"; cmdArgs = [url]; }
  log(`Opening browser at ${colors.cyan}${url}${colors.reset}`);
  try {
    const child = spawn(cmd, cmdArgs, { stdio: "ignore", windowsHide: true, detached: true });
    child.unref();
  } catch (err) {
    warn(`Could not launch browser: ${err.message}`);
    log(`Open URL manually: ${url}`);
  }
}

if (sub === "update") {
  log("Checking for updates and pulling latest changes...");
  try {
    const gitDir = join(pkgRoot, ".git");
    if (existsSync(gitDir)) {
      await execFileP("git", ["pull", "origin", "main"], { cwd: pkgRoot });
      log("Updated from git successfully.");
    } else {
      await execFileP(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "-g", "cline-marketplace@latest"]);
      log("Updated global package via npm.");
    }
  } catch (err) {
    error(`Update failed: ${err.message}`);
  }
  process.exit(0);
} else if (sub === "refresh") {
  await ensureDependencies();
  ensureServerEntry();
  log("Running catalog refresh...");
  const child = spawn(process.execPath, [refreshScript, ...args.slice(1)], { stdio: "inherit", cwd: pkgRoot });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  // Default: full flow
  await ensureDependencies();
  ensureServerEntry();
  const port = Number(cliPort || process.env.PORT || 5173);
  const host = process.env.HOST || "127.0.0.1";
  const url = `http://${host}:${port}`;

  if (!hasFreshCatalog()) {
    log("Catalog cache missing or older than 24h.");
    await fetchCatalog();
  }

  // Non-blocking update check
  checkForRemoteUpdates().catch(() => {});

  let ownedChild = null;
  if (await isPortOpen(port, host)) {
    log(`Port ${port} is active; probing existing instance...`);
    const status = await probeStatus(port, host, 4000);
    if (status) {
      log(`Connected to active instance (${status.catalog?.total ?? 0} entries loaded).`);
    } else {
      warn(`Port ${port} is occupied by another process. Starting on next available port...`);
      ownedChild = startServer(port, host);
    }
  } else {
    ownedChild = startServer(port, host);
  }

  const ready = await waitForServer(port, host);
  if (!ready && !ownedChild) {
    error(`Server failed to respond on ${url} within timeout.`);
    process.exit(1);
  }

  if (!NO_OPEN) {
    setTimeout(() => openBrowser(url), 250);
  } else {
    log(`Browser launch skipped (--no-open). URL: ${url}`);
  }

  if (!ownedChild) {
    log("Existing instance active. CLI finished.");
    setTimeout(() => process.exit(0), 400);
  }
}
