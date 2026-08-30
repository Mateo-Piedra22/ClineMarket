import { spawn } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;
const TARGET_URL = "http://127.0.0.1:5173";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function capture() {
  console.log("==> Spawning headless Chrome on port", PORT);
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--disable-gpu",
    "--window-size=1600,1000",
    "--hide-scrollbars",
    TARGET_URL,
  ], { stdio: "ignore" });

  try {
    // Wait for CDP endpoint to become ready
    let jsonVersion = null;
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        if (r.ok) { jsonVersion = await r.json(); break; }
      } catch {}
      await sleep(200);
    }

    if (!jsonVersion) throw new Error("Could not connect to Chrome DevTools port");
    console.log("Connected to Chrome DevTools:", jsonVersion.Browser);

    // Get list of targets/pages
    const pagesRes = await fetch(`http://127.0.0.1:${PORT}/json/list`);
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

    await new Promise((resolveOpen) => ws.onopen = resolveOpen);

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

    // Enable domains
    await send("Page.enable");
    await send("Runtime.enable");
    await send("DOM.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1600,
      height: 1000,
      deviceScaleFactor: 2,
      mobile: false,
    });

    // Wait for catalog to load
    console.log("Waiting for catalog DOM to render...");
    await sleep(2500);

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
    await sleep(1500);
    const recShot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync("docs/screenshot-recommended.png", Buffer.from(recShot.data, "base64"));
    console.log("Saved docs/screenshot-recommended.png");

    // 3. Switch to Stats Tab
    console.log("Switching to Stats tab...");
    await send("Runtime.evaluate", {
      expression: `document.querySelector('.tab[data-tab="stats"]').click();`,
    });
    await sleep(1500);
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
      await sleep(300);
    }
    await sleep(600);
    const healthShot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync("docs/screenshot-health.png", Buffer.from(healthShot.data, "base64"));
    console.log("Saved docs/screenshot-health.png");

    // 5. Switch back to Catalog and Open Detail Modal
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
    await sleep(1500);
    const detailShot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync("docs/screenshot-detail.png", Buffer.from(detailShot.data, "base64"));
    console.log("Saved docs/screenshot-detail.png");

    ws.close();
    console.log("==> ALL SCREENSHOTS CAPTURED SUCCESSFULLY!");
  } finally {
    try { chrome.kill(); } catch {}
  }
}

capture().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
