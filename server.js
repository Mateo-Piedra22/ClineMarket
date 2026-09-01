#!/usr/bin/env node
// Cline Marketplace — Local Browser, Primitive Registry & Control Plane
// High-performance Express application serving 250+ plugins, skills, and MCP servers.

import express from "express";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { logger } from "./lib/logger.js";
import { createApiRouter } from "./lib/routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const dataDir = process.env.CLINEMARKET_DATA_DIR || process.env.DATA_DIR || join(root, "data");
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// Initialize Daily Rotating Persistent File Logging
logger.initFileLogging({
  logDir: process.env.CLINEMARKET_LOG_DIR || join(dataDir, "logs"),
  retentionDays: Number(process.env.LOG_RETENTION_DAYS || 14),
});

const CATALOG_PATH = join(root, "catalog.json");
const PREV_CATALOG_PATH = join(dataDir, "catalog-prev.json");
const META_PATH = join(dataDir, "upstream-meta.json");
const INSTALLED_PATH = join(dataDir, "installed.json");
const WATCHLIST_PATH = join(dataDir, "watchlist.json");
const CONTEXT_PATH = join(dataDir, "context-cache.json");
const SETTINGS_PATH = join(dataDir, "user-settings.json");

const DEFAULT_PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "127.0.0.1";

// C4-12 (docs/audits/2026-08-30-audit-install-gestion/04-seguridad-installs.md, Low):
// `HOST` era overridable sin guardia; con HOST=0.0.0.0 el control plane completo
// quedaba expuesto a la LAN sin auth ni rate limit. Bloqueamos no-loopback salvo
// explicit opt-in (ALLOW_REMOTE_HOST=1), which also requires a control token.
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "::ffff:127.0.0.1"]);
if (!LOOPBACK_HOSTS.has(HOST)) {
  if (process.env.ALLOW_REMOTE_HOST !== "1") {
    logger.warn(`Non-loopback HOST blocked ("${HOST}"); forcing 127.0.0.1. Set ALLOW_REMOTE_HOST=1 to enable it explicitly.`);
  } else if (!process.env.CLINEMARKET_CONTROL_TOKEN) {
    logger.error("ALLOW_REMOTE_HOST=1 with a non-loopback HOST requires CLINEMARKET_CONTROL_TOKEN. Set that variable before exposing the server to the network.");
    process.exit(1);
  }
}
const EFFECTIVE_HOST = LOOPBACK_HOSTS.has(HOST) ? HOST : (process.env.ALLOW_REMOTE_HOST === "1" ? HOST : "127.0.0.1");

export const app = express();

// Security and Content-Type Headers Middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "interest-cohort=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://api.github.com https://raw.githubusercontent.com; frame-ancestors 'none';"
  );
  next();
});

// Mutating Requests Loopback / Same-Origin CSRF Protection
app.use((req, res, next) => {
  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    const origin = req.headers.origin || req.headers.referer;
    const secFetchSite = req.headers["sec-fetch-site"];

    if (secFetchSite && !["same-origin", "same-site", "none"].includes(secFetchSite)) {
      return res.status(403).json({ ok: false, error: "Forbidden: Cross-origin mutating requests are blocked.", code: "CSRF_BLOCKED" });
    }

    if (origin) {
      try {
        const u = new URL(origin);
        const isLocal = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname);
        if (!isLocal) {
          return res.status(403).json({ ok: false, error: "Forbidden: Request origin is not a trusted local host.", code: "UNTRUSTED_ORIGIN" });
        }
      } catch {
        return res.status(403).json({ ok: false, error: "Forbidden: Invalid origin header.", code: "INVALID_ORIGIN" });
      }
    }
  }
  next();
});

// JSON Body Parser with 1MB safety guard
app.use(express.json({ limit: "1mb" }));

// Static Assets Serving
app.use(express.static(join(root, "public")));
app.use("/docs", express.static(join(root, "docs")));

// Logging Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api/")) {
      logger.http(req.method, req.path, res.statusCode, Date.now() - start);
    }
  });
  next();
});

// Mount Modular API Router
const apiRouter = createApiRouter({
  root,
  dataDir,
  CATALOG_PATH,
  PREV_CATALOG_PATH,
  META_PATH,
  INSTALLED_PATH,
  WATCHLIST_PATH,
  CONTEXT_PATH,
  SETTINGS_PATH,
  // Audit 2026-09-01 A1/A2: the control token is now actually enforced on
  // mutating routes when the server is exposed on a non-loopback host.
  // requireControlAuth is only true when ALLOW_REMOTE_HOST=1 (set above) so
  // local single-user usage is unaffected.
  controlToken: process.env.CLINEMARKET_CONTROL_TOKEN || null,
  requireControlAuth: process.env.ALLOW_REMOTE_HOST === "1",
});
app.use("/api", apiRouter);

// Fallback index.html for SPA routes (Express 5 compatible)
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/") || req.path === "/api") return next();
  res.sendFile(join(root, "public", "index.html"));
});

// Dedicated 404 handler for unmatched /api routes
app.use("/api", (req, res) => {
  res.status(404).json({
    ok: false,
    error: `Endpoint not found: ${req.method} ${req.originalUrl || req.url}`,
    code: "NOT_FOUND",
  });
});

// Global Express Error Handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled request error: ${err.message}`);
  const status = err.status || 500;
  res.status(status).json({
    ok: false,
    error: err.message || "Internal Server Error",
    code: err.code || (status === 400 ? "BAD_REQUEST" : "INTERNAL_ERROR"),
  });
});

// Port Discovery & Server Startup
function checkPortAvailable(port, host) {
  return new Promise((resolve) => {
    const tester = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => {
        tester.once("close", () => resolve(true)).close();
      })
      .listen(port, host);
  });
}

async function findAvailablePort(startPort, host, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = startPort + i;
    const isAvail = await checkPortAvailable(candidate, host);
    if (isAvail) return candidate;
  }
  return null;
}

export async function startServer() {
  const port = await findAvailablePort(DEFAULT_PORT, EFFECTIVE_HOST);
  if (!port) {
    logger.error(`No available port found in range ${DEFAULT_PORT}–${DEFAULT_PORT + 20}`);
    process.exit(1);
  }

  const server = app.listen(port, EFFECTIVE_HOST, () => {
    const url = `http://${EFFECTIVE_HOST}:${port}`;
    console.log("");
    logger.box(
      [
        `Local URL:    \x1b[36m${url}\x1b[0m`,
        `Catalog:      \x1b[33m250+ Community & Custom Primitives\x1b[0m`,
        `Security:     \x1b[32mLoopback only (127.0.0.1) · Zero external telemetry\x1b[0m`,
        `Logs:         \x1b[90m${join(dataDir, "logs")}\x1b[0m`,
      ],
      {
        title: "Cline Marketplace Local Control Plane",
      }
    );
    console.log("");
  });

  return { app, server, port };
}

// Direct invocation check
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch((err) => {
    logger.error(`Failed to launch server: ${err.message}`);
    process.exit(1);
  });
}