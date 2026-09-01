#!/usr/bin/env node
// Global CLI & NPX Runner for the Cline Marketplace local browser.
// One-shot: auto-install deps if needed → verify catalog → start server → open browser.

import { spawn, execFile as _execFile } from "node:child_process";
import { existsSync, statSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { platform, cpus, totalmem, freemem } from "node:os";
import net from "node:net";
import { logger, colors, stripAnsi } from "../lib/logger.js";

const execFileP = promisify(_execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const serverEntry = join(pkgRoot, "server.js");
const refreshScript = join(pkgRoot, "scripts/refresh-catalog.mjs");
const catalogFile = join(pkgRoot, "catalog.json");
const pkgJsonFile = join(pkgRoot, "package.json");

export function log(msg, ...meta) {
  logger.cli(msg, ...meta);
}
export function warn(msg, ...meta) {
  logger.warn(msg, ...meta);
}
export function error(msg, ...meta) {
  logger.error(msg, ...meta);
}

const HELP = `
${colors.bold}${colors.acidLime}CLINE MARKETPLACE${colors.reset} — Local Browser, Primitive Registry & Control Plane
${colors.dim}Official control plane for Cline plugins, skills, and MCP servers.${colors.reset}

${colors.bold}${colors.cyan}USAGE:${colors.reset}
  ${colors.acidLime}npx cline-marketplace${colors.reset}               One-shot launch (bootstrap → start → open UI)
  ${colors.acidLime}cline-marketplace${colors.reset}                   Launch local control plane server
  ${colors.acidLime}cline-marketplace --no-open${colors.reset}         Start server without auto-opening browser
  ${colors.acidLime}cline-marketplace --port <number>${colors.reset}   Bind server to a specific local port (default: 5173)

${colors.bold}${colors.cyan}SUBCOMMANDS:${colors.reset}
  ${colors.yellow}status${colors.reset}                              Show local server telemetry, catalog, and storage roots
  ${colors.yellow}health${colors.reset}                              Run runtime environment and CLI toolchain diagnostics
  ${colors.yellow}list${colors.reset}                                List all locally discovered and installed primitives
  ${colors.yellow}refresh${colors.reset}                             Re-download official catalog and upstream commit metadata
  ${colors.yellow}refresh --catalog${colors.reset}                   Fast catalog refresh (skip commit histories)
  ${colors.yellow}update${colors.reset}                              Check upstream git/npm for package updates
  ${colors.yellow}help${colors.reset}, ${colors.yellow}--help${colors.reset}, ${colors.yellow}-h${colors.reset}                 Display this interactive reference manual

${colors.bold}${colors.cyan}ENVIRONMENT VARIABLES:${colors.reset}
  ${colors.magenta}PORT${colors.reset}                                Server listening port (default: 5173)
  ${colors.magenta}HOST${colors.reset}                                Bind address (default: 127.0.0.1)
  ${colors.magenta}CLINEMARKET_DATA_DIR${colors.reset}               Custom path for data persistence directory
  ${colors.magenta}CLINEMARKET_LOG_DIR${colors.reset}                Custom path for rotating daily log files
  ${colors.magenta}NO_COLOR${colors.reset}                            Disable ANSI terminal colors and formatting

${colors.bold}${colors.cyan}EXAMPLES:${colors.reset}
  $ cline-marketplace --port 8080 --no-open
  $ cline-marketplace health
  $ cline-marketplace refresh --catalog
`;

// Self-bootstrap: ensure dependencies are installed (crucial for npx execution)
export async function ensureDependencies() {
  const expressModule = join(pkgRoot, "node_modules", "express");
  if (!existsSync(expressModule)) {
    log("Initializing local runtime dependencies (first-time setup)...");
    try {
      await execFileP(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--omit=dev"], {
        cwd: pkgRoot,
        timeout: 90_000,
      });
      logger.success("Runtime dependencies ready.");
    } catch (err) {
      warn(`Could not run npm install automatically: ${err.message}`);
    }
  }
}

export function ensureServerEntry() {
  if (!existsSync(serverEntry)) {
    error(`server.js not found at ${serverEntry}`);
    process.exit(1);
  }
}

export function hasFreshCatalog() {
  if (!existsSync(catalogFile)) return false;
  try { return Date.now() - statSync(catalogFile).mtimeMs < 24 * 60 * 60 * 1000; }
  catch { return false; }
}

export async function fetchCatalog() {
  log("Downloading catalog from upstream registry...");
  try {
    await execFileP(process.execPath, [refreshScript, "--catalog"], { cwd: pkgRoot, timeout: 60_000 });
    logger.success("Catalog downloaded successfully.");
    return true;
  } catch (err) {
    warn(`Catalog download failed: ${err.message}`);
    return false;
  }
}

export async function checkForRemoteUpdates() {
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
        logger.box(
          [
            `Current: ${colors.dim}v${currentVersion}${colors.reset}  →  Latest: ${colors.acidLime}v${remotePkg.version}${colors.reset}`,
            `Run ${colors.cyan}git pull${colors.reset} or ${colors.cyan}npm install -g cline-marketplace${colors.reset} to update.`,
          ],
          {
            title: "Update Available",
            borderColor: colors.yellow,
            titleColor: colors.bold + colors.yellow,
          }
        );
        console.log("");
      }
    }
  } catch {}
}

export async function isPortOpen(port, host) {
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    return false;
  }
  return new Promise((resolveOpen) => {
    try {
      const sock = net.connect({ port, host });
      let settled = false;
      const done = (v) => {
        if (!settled) {
          settled = true;
          resolveOpen(v);
          try {
            sock.destroy();
          } catch {}
        }
      };
      sock.once("connect", () => done(true));
      sock.once("error", () => done(false));
      setTimeout(() => done(false), 800);
    } catch {
      resolveOpen(false);
    }
  });
}

export function checkPortAvailable(port, host) {
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    try {
      const tester = net.createServer()
        .once("error", () => resolve(false))
        .once("listening", () => {
          try {
            tester.once("close", () => resolve(true)).close();
          } catch {
            resolve(true);
          }
        })
        .listen(port, host);
    } catch {
      resolve(false);
    }
  });
}

export async function findAvailablePort(startPort, host, maxAttempts = 20) {
  if (typeof startPort !== "number" || !Number.isInteger(startPort) || startPort < 1 || startPort > 65535) {
    return null;
  }
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = startPort + i;
    if (candidate > 65535) break;
    const isAvail = await checkPortAvailable(candidate, host);
    if (isAvail) return candidate;
  }
  return null;
}

export async function waitForServer(port, host, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port, host)) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

/**
 * F12 — Discovers the server's effective port by probing /api/status across a range.
 * server.js falls back to findAvailablePort() when the CLI-chosen port was taken
 * during a TOCTOU race between the pre-check and the bind; without this sync the
 * CLI opens the browser at the wrong port.
 * @param {string} host
 * @param {number} startPort
 * @param {number} endPort
 * @param {number} timeoutMs
 * @returns {Promise<number|null>} Puerto efectivo, o null si no responde nada
 */
export async function discoverEffectivePort(host, startPort, endPort, timeoutMs = 10_000) {
  if (!Number.isInteger(startPort) || !Number.isInteger(endPort) || startPort < 1 || startPort > endPort) {
    return null;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let p = startPort; p <= endPort; p++) {
      try {
        const r = await fetch(`http://${host}:${p}/api/status`, { signal: AbortSignal.timeout(500) });
        if (r.ok) return p;
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

export async function probeStatus(port, host, timeoutMs = 5_000) {
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

export function startServer(port, host) {
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
      console.log(`\n${colors.yellow}[CLI]${colors.reset} Server process stopped.`);
    } else if (code !== 0 && code !== null) {
      error(`Server exited with code ${code}`);
    }
    process.exit(code ?? 0);
  });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  return child;
}

export function openBrowser(url) {
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

export async function runCliStatus(host = "127.0.0.1", port = 5173) {
  console.log(`\n${colors.bold}${colors.acidLime}Probing Cline Marketplace Control Plane...${colors.reset}\n`);
  try {
    const r = await fetch(`http://${host}:${port}/api/status`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    logger.box(
      [
        `Status:       ${colors.green}● ACTIVE (ONLINE)${colors.reset}`,
        `Node Runtime: ${colors.cyan}${data.node || process.version}${colors.reset} (${process.arch})`,
        `Server URL:   ${colors.cyan}http://${host}:${port}${colors.reset}`,
        `Catalog:      ${colors.yellow}${data.catalog?.total || 0} primitives${colors.reset} (${data.catalog?.installed || 0} installed)`,
        `Uptime:       ${colors.gray}${Math.floor(data.uptime || 0)}s${colors.reset}`,
      ],
      { title: "Cline Marketplace Status" }
    );
    return true;
  } catch (err) {
    logger.box(
      [
        `Status:       ${colors.red}○ OFFLINE (Server not running on port ${port})${colors.reset}`,
        `Tip:          Run ${colors.acidLime}cline-marketplace${colors.reset} to launch the control plane.`,
      ],
      { title: "Cline Marketplace Status", borderColor: colors.red, titleColor: colors.bold + colors.red }
    );
    return false;
  }
}

export async function runCliHealth(host = "127.0.0.1", port = 5173) {
  console.log(`\n${colors.bold}${colors.acidLime}Running System & Diagnostic Probes...${colors.reset}\n`);
  try {
    const r = await fetch(`http://${host}:${port}/api/health`, { signal: AbortSignal.timeout(3500) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    const okCount = (data.checks || []).filter((c) => c.ok).length;
    const totalCount = (data.checks || []).length;
    console.log(`Diagnostic checks: ${okCount === totalCount ? colors.green : colors.yellow}${okCount}/${totalCount} passed${colors.reset}\n`);

    for (const c of data.checks || []) {
      const mark = c.ok ? `${colors.green}[✓]${colors.reset}` : `${colors.red}[✗]${colors.reset}`;
      console.log(`  ${mark} ${colors.bold}${c.name}${colors.reset}: ${c.message}`);
    }

    if (data.rootsDetail && data.rootsDetail.length > 0) {
      console.log(`\n${colors.bold}${colors.cyan}Discovered Storage Roots:${colors.reset}`);
      for (const root of data.rootsDetail) {
        const mark = root.exists ? `${colors.green}●${colors.reset}` : `${colors.gray}○${colors.reset}`;
        console.log(`  ${mark} ${root.path} ${colors.dim}(${root.plugins}p · ${root.skills}s · ${root.mcps}m)${colors.reset}`);
      }
    }
    console.log("");
    // F1: a degraded health state also counts as a failure for CI/scripts.
    return okCount === totalCount && data.healthy !== false;
  } catch (err) {
    error(`Health check failed: ${err.message}. Make sure server is running.`);
    return false;
  }
}

export async function runCliList(host = "127.0.0.1", port = 5173) {
  try {
    const r = await fetch(`http://${host}:${port}/api/installed`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const list = data.installed || [];
    console.log(`\n${colors.bold}${colors.acidLime}Discovered & Installed Primitives (${list.length}):${colors.reset}\n`);
    for (const item of list) {
      const typeColor = item.type === "plugin" ? colors.green : item.type === "skill" ? colors.iris : colors.cobalt;
      console.log(`  ${typeColor}[${item.type.toUpperCase()}]${colors.reset} ${colors.bold}${item.id}${colors.reset} ${colors.dim}(${item.scope || "global"})${colors.reset}`);
    }
    console.log("");
    return true;
  } catch (err) {
    error(`Could not list installed primitives: ${err.message}`);
    return false;
  }
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h") || argv[0] === "help") {
    console.log(HELP);
    process.exit(0);
  }

  const sub = argv[0];
  const NO_OPEN = argv.includes("--no-open");
  const portIdx = argv.indexOf("--port");
  let cliPort = null;

  if (portIdx >= 0) {
    const rawPort = argv[portIdx + 1];
    const num = Number(rawPort);
    if (!rawPort || !Number.isInteger(num) || num < 1 || num > 65535) {
      error(`Invalid port "${rawPort ?? ""}". Port must be an integer between 1 and 65535.`);
      process.exit(1);
    }
    cliPort = num;
  }

  let envPort = null;
  if (process.env.PORT) {
    const rawEnv = process.env.PORT;
    const num = Number(rawEnv);
    if (!Number.isInteger(num) || num < 1 || num > 65535) {
      error(`Invalid PORT environment variable "${rawEnv}". Port must be an integer between 1 and 65535.`);
      process.exit(1);
    }
    envPort = num;
  }

  const host = process.env.HOST || "127.0.0.1";
  const port = cliPort || envPort || 5173;

  if (sub === "status") {
    const ok = await runCliStatus(host, port);
    process.exit(ok ? 0 : 1);
  } else if (sub === "health") {
    const ok = await runCliHealth(host, port);
    process.exit(ok ? 0 : 1);
  } else if (sub === "list") {
    const ok = await runCliList(host, port);
    process.exit(ok ? 0 : 1);
  } else if (sub === "update") {
    log("Checking for updates and pulling latest changes...");
    try {
      const gitDir = join(pkgRoot, ".git");
      if (existsSync(gitDir)) {
        await execFileP("git", ["pull", "origin", "main"], { cwd: pkgRoot });
        logger.success("Updated from git successfully.");
      } else {
        await execFileP(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "-g", "cline-marketplace@latest"]);
        logger.success("Updated global package via npm.");
      }
      process.exit(0);
    } catch (err) {
      error(`Update failed: ${err.message}`);
      process.exit(1);
    }
  } else if (sub === "refresh") {
    await ensureDependencies();
    ensureServerEntry();
    log("Running catalog refresh...");
    const child = spawn(process.execPath, [refreshScript, ...argv.slice(1)], { stdio: "inherit", cwd: pkgRoot });
    child.on("exit", (code) => process.exit(code ?? 0));
  } else {
    // Default: full launch flow
    await ensureDependencies();
    ensureServerEntry();
    const initialPort = port;

    if (!hasFreshCatalog()) {
      log("Catalog cache missing or older than 24h.");
      await fetchCatalog();
    }

    // Non-blocking update check
    checkForRemoteUpdates().catch(() => {});

    let targetPort = initialPort;
    let ownedChild = null;

    if (await isPortOpen(initialPort, host)) {
      log(`Port ${initialPort} is active; probing existing instance...`);
      const status = await probeStatus(initialPort, host, 4000);
      if (status) {
        logger.success(`Connected to active instance (${status.catalog?.total ?? 0} entries loaded).`);
        targetPort = initialPort;
      } else {
        warn(`Port ${initialPort} is occupied by another process. Starting on next available port...`);
        const avail = await findAvailablePort(initialPort + 1, host);
        if (!avail) {
          error(`No available port found in range ${initialPort + 1}–${initialPort + 20}`);
          process.exit(1);
        }
        targetPort = avail;
        ownedChild = startServer(targetPort, host);
      }
    } else {
      const isAvail = await checkPortAvailable(initialPort, host);
      if (!isAvail) {
        const avail = await findAvailablePort(initialPort, host);
        if (!avail) {
          error(`No available port found in range ${initialPort}–${initialPort + 20}`);
          process.exit(1);
        }
        targetPort = avail;
      } else {
        targetPort = initialPort;
      }
      ownedChild = startServer(targetPort, host);
    }

    let url = `http://${host}:${targetPort}`;
    let ready = await waitForServer(targetPort, host);
    if (!ready && ownedChild) {
      // F12: server.js puede haber derivado a otro puerto (TOCTOU con findAvailablePort
      // en server.js). Sincronizar con el puerto efectivo antes de abrir el browser.
      const effective = await discoverEffectivePort(host, targetPort, Math.min(targetPort + 20, 65535), 10_000);
      if (effective) {
        warn(`Server effective port drifted from ${targetPort} to ${effective}.`);
        targetPort = effective;
        url = `http://${host}:${targetPort}`;
        ready = true;
      }
    }
    if (!ready && !ownedChild) {
      error(`Server failed to respond on ${url} within timeout.`);
      process.exit(1);
    } else if (!ready && ownedChild) {
      error(`Server failed to start on ${url} within timeout.`);
      try { ownedChild.kill("SIGTERM"); } catch {}
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
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const invokedFile = process.argv[1];
    return resolve(thisFile) === resolve(invokedFile) ||
      (existsSync(thisFile) && existsSync(invokedFile) && realpathSync(thisFile) === realpathSync(invokedFile));
  } catch {
    return true;
  }
}

if (isDirectExecution()) {
  main(process.argv.slice(2)).catch((err) => {
    error(`Execution failed: ${err.message}`);
    process.exit(1);
  });
}

