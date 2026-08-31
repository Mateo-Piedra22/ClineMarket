// ANSI Structured & Persistent Daily Rotating Logger for Cline Marketplace
// Supports rich terminal formatting, daily file rotation, and automated retention pruning.

import { existsSync, mkdirSync, appendFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const useColor =
  !process.env.NO_COLOR &&
  process.env.FORCE_COLOR !== "0" &&
  (process.stdout?.isTTY ?? true);

export const colors = {
  reset: useColor ? "\x1b[0m" : "",
  bold: useColor ? "\x1b[1m" : "",
  dim: useColor ? "\x1b[2m" : "",
  italic: useColor ? "\x1b[3m" : "",
  underline: useColor ? "\x1b[4m" : "",
  cyan: useColor ? "\x1b[36m" : "",
  green: useColor ? "\x1b[32m" : "",
  yellow: useColor ? "\x1b[33m" : "",
  red: useColor ? "\x1b[31m" : "",
  magenta: useColor ? "\x1b[35m" : "",
  blue: useColor ? "\x1b[34m" : "",
  gray: useColor ? "\x1b[90m" : "",
  white: useColor ? "\x1b[37m" : "",
  // Brand Navigate palette ANSI escapes
  acidLime: useColor ? "\x1b[38;2;199;255;105m" : "",
  iris: useColor ? "\x1b[38;2;122;120;255m" : "",
  ember: useColor ? "\x1b[38;2;255;109;56m" : "",
  schoolbus: useColor ? "\x1b[38;2;255;196;18m" : "",
  cobalt: useColor ? "\x1b[38;2;71;139;255m" : "",
  toxicGreen: useColor ? "\x1b[38;2;0;166;82m" : "",
};

export function stripAnsi(str) {
  if (typeof str !== "string") return String(str);
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

function ts() {
  return new Date().toISOString().slice(11, 19);
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

let activeLogDir = null;
let activeRetentionDays = 14;
const memoryLogBuffer = [];
const MAX_MEMORY_LOGS = 300;

export function initFileLogging({ logDir, retentionDays = 14 } = {}) {
  if (!logDir) return;
  try {
    activeLogDir = logDir;
    activeRetentionDays = retentionDays;
    if (!existsSync(activeLogDir)) {
      mkdirSync(activeLogDir, { recursive: true });
    }
    pruneOldLogs(activeLogDir, activeRetentionDays);
  } catch (err) {
    console.warn(`[LOGGER] Could not initialize file logging at ${logDir}: ${err.message}`);
  }
}

export function pruneOldLogs(logDir = activeLogDir, maxAgeDays = activeRetentionDays) {
  if (!logDir || !existsSync(logDir)) return 0;
  let pruned = 0;
  try {
    const files = readdirSync(logDir);
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    for (const f of files) {
      if (f.startsWith("clinemarket-") && f.endsWith(".log")) {
        const fullPath = join(logDir, f);
        try {
          const stats = statSync(fullPath);
          if (now - stats.mtimeMs > maxAgeMs) {
            unlinkSync(fullPath);
            pruned++;
          }
        } catch {}
      }
    }
  } catch {}
  return pruned;
}

function writeToFile(level, rawMessage) {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [pid:${process.pid}] ${stripAnsi(rawMessage)}\n`;

  // Maintain circular memory buffer
  memoryLogBuffer.push({
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message: stripAnsi(rawMessage),
  });
  if (memoryLogBuffer.length > MAX_MEMORY_LOGS) {
    memoryLogBuffer.shift();
  }

  if (!activeLogDir) return;
  try {
    const filename = `clinemarket-${isoDate()}.log`;
    const filePath = join(activeLogDir, filename);
    appendFileSync(filePath, line, "utf8");
  } catch {}
}

export const logger = {
  initFileLogging,
  pruneOldLogs,

  getRecentLogs(limit = 100) {
    return memoryLogBuffer.slice(-Math.min(limit, memoryLogBuffer.length));
  },

  info(msg, ...args) {
    const text = typeof msg === "string" ? msg : JSON.stringify(msg);
    console.log(`${colors.dim}[${ts()}]${colors.reset} ${colors.cyan}INFO${colors.reset}  ${msg}`, ...args);
    writeToFile("info", text + (args.length ? " " + args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ") : ""));
  },

  warn(msg, ...args) {
    const text = typeof msg === "string" ? msg : JSON.stringify(msg);
    console.warn(`${colors.dim}[${ts()}]${colors.reset} ${colors.yellow}WARN${colors.reset}  ${msg}`, ...args);
    writeToFile("warn", text + (args.length ? " " + args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ") : ""));
  },

  error(msg, ...args) {
    const text = typeof msg === "string" ? msg : JSON.stringify(msg);
    console.error(`${colors.dim}[${ts()}]${colors.reset} ${colors.red}ERROR${colors.reset} ${msg}`, ...args);
    writeToFile("error", text + (args.length ? " " + args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ") : ""));
  },

  success(msg, ...args) {
    const text = typeof msg === "string" ? msg : JSON.stringify(msg);
    console.log(`${colors.dim}[${ts()}]${colors.reset} ${colors.acidLime}OK${colors.reset}    ${msg}`, ...args);
    writeToFile("ok", text + (args.length ? " " + args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ") : ""));
  },

  cli(msg, ...args) {
    const text = typeof msg === "string" ? msg : JSON.stringify(msg);
    console.log(`${colors.dim}[${ts()}]${colors.reset} ${colors.iris}CLI${colors.reset}   ${msg}`, ...args);
    writeToFile("cli", text + (args.length ? " " + args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ") : ""));
  },

  exec(cmd, durationMs, code = 0) {
    const status = code === 0
      ? `${colors.green}exit 0${colors.reset}`
      : `${colors.red}exit ${code}${colors.reset}`;
    const dur = `${colors.dim}(${durationMs}ms)${colors.reset}`;
    const logStr = `${cmd} -> ${status} ${dur}`;
    console.log(`${colors.dim}[${ts()}]${colors.reset} ${colors.magenta}EXEC${colors.reset}  ${logStr}`);
    writeToFile("exec", `${cmd} -> exit ${code} (${durationMs}ms)`);
  },

  http(method, path, status, durationMs) {
    const col = status < 400 ? colors.green : status < 500 ? colors.yellow : colors.red;
    console.log(`${colors.dim}[${ts()}]${colors.reset} ${colors.blue}HTTP${colors.reset}  ${method} ${path} -> ${col}${status}${colors.reset} ${colors.dim}(${durationMs}ms)${colors.reset}`);
    writeToFile("http", `${method} ${path} -> ${status} (${durationMs}ms)`);
  },

  storage(action, detail) {
    console.log(`${colors.dim}[${ts()}]${colors.reset} ${colors.yellow}STORE${colors.reset} ${action} ${detail}`);
    writeToFile("store", `${action} ${detail}`);
  },

  box(lines, { title = "", borderColor = colors.gray, titleColor = colors.bold + colors.acidLime } = {}) {
    const plainLines = lines.map((l) => stripAnsi(l));
    const maxLen = Math.max(...plainLines.map((l) => l.length), stripAnsi(title).length + 4, 56);
    const topBorder = `┌${"─".repeat(maxLen + 2)}┐`;
    const bottomBorder = `└${"─".repeat(maxLen + 2)}┘`;

    console.log(`${borderColor}${topBorder}${colors.reset}`);
    if (title) {
      const padRight = maxLen - stripAnsi(title).length;
      console.log(`${borderColor}│${colors.reset}  ${titleColor}${title}${colors.reset}${" ".repeat(Math.max(0, padRight))} ${borderColor}│${colors.reset}`);
      console.log(`${borderColor}├${"─".repeat(maxLen + 2)}┤${colors.reset}`);
    }
    for (let i = 0; i < lines.length; i++) {
      const padRight = maxLen - plainLines[i].length;
      console.log(`${borderColor}│${colors.reset}  ${lines[i]}${" ".repeat(Math.max(0, padRight))} ${borderColor}│${colors.reset}`);
    }
    console.log(`${borderColor}${bottomBorder}${colors.reset}`);
  },
};
