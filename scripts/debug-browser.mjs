import { spawn } from "node:child_process";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;
const TARGET_URL = "http://127.0.0.1:5173";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function debugBrowser() {
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--disable-gpu",
    TARGET_URL,
  ], { stdio: "ignore" });

  try {
    await sleep(1000);
    const pagesRes = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const pages = await pagesRes.json();
    const targetPage = pages.find((p) => p.type === "page") || pages[0];
    const ws = new WebSocket(targetPage.webSocketDebuggerUrl);

    let id = 1;
    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.method === "Runtime.consoleAPICalled") {
        console.log("[BROWSER CONSOLE]", msg.params.type, msg.params.args.map(a => a.value || a.description));
      }
      if (msg.method === "Runtime.exceptionThrown") {
        console.error("[BROWSER EXCEPTION]", msg.params.exceptionDetails.text, msg.params.exceptionDetails.exception?.description);
      }
    };

    await new Promise((r) => ws.onopen = r);
    ws.send(JSON.stringify({ id: id++, method: "Runtime.enable" }));
    ws.send(JSON.stringify({ id: id++, method: "Page.enable" }));

    await sleep(3000);

    // Evaluate state
    const evalId = id++;
    const statePromise = new Promise((resolve) => {
      const listener = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.id === evalId) {
          console.log("[EVAL RESULT]", JSON.stringify(msg.result?.result?.value));
          resolve();
        }
      };
      ws.addEventListener("message", listener);
    });

    ws.send(JSON.stringify({
      id: evalId,
      method: "Runtime.evaluate",
      params: {
        expression: `({
          catalogEntries: state.catalog?.entries?.length,
          filteredCount: state.filtered?.length,
          resultsChildren: document.getElementById('results')?.children?.length,
          activeTab: state.activeTab,
          bodyHtmlLen: document.body.innerHTML.length
        })`,
        returnByValue: true
      }
    }));

    await statePromise;
    ws.close();
  } finally {
    try { chrome.kill(); } catch {}
  }
}

debugBrowser().catch(console.error);
