import { spawn } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCommand } from "../lib/resolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const CDP_PORT = 9222;

async function getChromeExecutable() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "chrome",
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
    const resolved = await resolveCommand(c);
    if (resolved && existsSync(resolved)) return resolved;
  }
  return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function findActiveServerPort() {
  for (let port = 5173; port <= 5185; port++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
        signal: AbortSignal.timeout(600),
      });
      if (res.ok) return port;
    } catch {}
  }
  return null;
}

async function capture() {
  let spawnedServer = null;
  let serverPort = await findActiveServerPort();

  if (!serverPort) {
    console.log("==> Spawning temporary local server for captures...");
    spawnedServer = spawn(process.execPath, [join(root, "server.js")], {
      cwd: root,
      stdio: "ignore",
      windowsHide: true,
    });

    for (let i = 0; i < 30; i++) {
      await sleep(250);
      serverPort = await findActiveServerPort();
      if (serverPort) break;
    }

    if (!serverPort) {
      if (spawnedServer) { try { spawnedServer.kill(); } catch {} }
      throw new Error("Could not start server for screenshot capture");
    }
  }

  const targetUrl = `http://127.0.0.1:${serverPort}`;
  console.log(`==> Target Server is verified active on: ${targetUrl}`);
  console.log("==> Spawning headless Chrome on CDP port", CDP_PORT);

  const chromeExe = await getChromeExecutable();
  const chrome = spawn(chromeExe, [
    `--remote-debugging-port=${CDP_PORT}`,
    "--headless=new",
    "--disable-gpu",
    "--window-size=1600,1000",
    "--hide-scrollbars",
    targetUrl,
  ], { stdio: "ignore" });

  try {
    let jsonVersion = null;
    for (let i = 0; i < 35; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, {
          signal: AbortSignal.timeout(500),
        });
        if (r.ok) { jsonVersion = await r.json(); break; }
      } catch {}
      await sleep(200);
    }

    if (!jsonVersion) throw new Error("Could not connect to Chrome DevTools port");
    console.log("Connected to Chrome DevTools:", jsonVersion.Browser);

    const pagesRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const pages = await pagesRes.json();
    const targetPage = pages.find((p) => p.type === "page") || pages[0];
    if (!targetPage || !targetPage.webSocketDebuggerUrl) {
      throw new Error("No target page found");
    }

    console.log("Connecting to WebSocket:", targetPage.webSocketDebuggerUrl);
    const ws = new WebSocket(targetPage.webSocketDebuggerUrl);

    let idCounter = 1;
    const callbacks = new Map();

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
    };

    await new Promise((resolveOpen) => (ws.onopen = resolveOpen));

    function send(method, params = {}) {
      const id = idCounter++;
      return new Promise((resolveCmd, rejectCmd) => {
        callbacks.set(id, (res) => {
          if (res.error) rejectCmd(new Error(res.error.message));
          else resolveCmd(res.result);
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send("Page.enable");
    await send("Runtime.enable");
    await send("DOM.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1600,
      height: 1000,
      deviceScaleFactor: 2,
      mobile: false,
    });

    console.log("Waiting for catalog DOM to render...");
    for (let i = 0; i < 30; i++) {
      const evalRes = await send("Runtime.evaluate", {
        expression: `Boolean(document.querySelector('.card'))`,
      });
      if (evalRes?.result?.value === true) break;
      await sleep(250);
    }
    await sleep(800);

    // 1. Screenshot Catalog View
    console.log("Capturing Catalog View...");
    const catShot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync("docs/screenshot-catalog.png", Buffer.from(catShot.data, "base64"));
    console.log("Saved docs/screenshot-catalog.png");

    // 2. Switch to Recommended Tab
    console.log("Switching to Recommended tab...");
    await send("Runtime.evaluate", {
      expression: `document.querySelector('.tab[data-tab="recommended"]').click();`,
    });
    await sleep(1200);
    const recShot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync("docs/screenshot-recommended.png", Buffer.from(recShot.data, "base64"));
    console.log("Saved docs/screenshot-recommended.png");

    // 3. Switch to Stats Tab
    console.log("Switching to Stats tab...");
    await send("Runtime.evaluate", {
      expression: `document.querySelector('.tab[data-tab="stats"]').click();`,
    });
    await sleep(1200);
    const statsShot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync("docs/screenshot-stats.png", Buffer.from(statsShot.data, "base64"));
    console.log("Saved docs/screenshot-stats.png");

    // 4. Switch to Health Tab
    console.log("Switching to Health tab...");
    await send("Runtime.evaluate", {
      expression: `document.querySelector('.tab[data-tab="health"]').click();`,
    });
    for (let i = 0; i < 20; i++) {
      const evalRes = await send("Runtime.evaluate", {
        expression: `Boolean(document.querySelector('#healthList .health-item'))`,
      });
      if (evalRes?.result?.value === true) break;
      await sleep(200);
    }
    await sleep(500);
    const healthShot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync("docs/screenshot-health.png", Buffer.from(healthShot.data, "base64"));
    console.log("Saved docs/screenshot-health.png");

    // 5. Switch to Changelog Tab
    console.log("Switching to Changelog tab...");
    await send("Runtime.evaluate", {
      expression: `document.querySelector('.tab[data-tab="changelog"]').click();`,
    });
    await sleep(1000);
    const chlogShot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync("docs/screenshot-changelog.png", Buffer.from(chlogShot.data, "base64"));
    console.log("Saved docs/screenshot-changelog.png");

    // 6. Switch back to Catalog and Open Detail Modal
    console.log("Opening Detail Modal...");
    await send("Runtime.evaluate", {
      expression: `
        document.querySelector('.tab[data-tab="catalog"]').click();
        setTimeout(() => {
          const firstCard = document.querySelector('.card');
          if (firstCard) firstCard.click();
        }, 300);
      `,
    });
    await sleep(1200);
    const detailShot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync("docs/screenshot-detail.png", Buffer.from(detailShot.data, "base64"));
    console.log("Saved docs/screenshot-detail.png");

    // 7. Capture Workspace Control Card in Sidebar
    console.log("Capturing Project Workspace Sidebar Focus...");
    await send("Runtime.evaluate", {
      expression: `
        document.querySelector('#detailClose')?.click();
        const wsSection = document.querySelector('#projectWorkspaceSection');
        if (wsSection) wsSection.scrollIntoView({ behavior: 'instant', block: 'center' });
      `,
    });
    await sleep(600);
    const wsShot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync("docs/screenshot-workspace.png", Buffer.from(wsShot.data, "base64"));
    console.log("Saved docs/screenshot-workspace.png");

    ws.close();
    console.log("==> ALL SCREENSHOTS CAPTURED SUCCESSFULLY!");
  } finally {
    try { chrome.kill(); } catch {}
    if (spawnedServer) {
      try { spawnedServer.kill(); } catch {}
    }
  }
}

capture().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
