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
const dataDir = join(root, "data");
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const CATALOG_PATH = join(root, "catalog.json");
const PREV_CATALOG_PATH = join(dataDir, "catalog-prev.json");
const META_PATH = join(dataDir, "upstream-meta.json");
const INSTALLED_PATH = join(dataDir, "installed.json");
const WATCHLIST_PATH = join(dataDir, "watchlist.json");
const CONTEXT_PATH = join(dataDir, "context-cache.json");
const SETTINGS_PATH = join(dataDir, "user-settings.json");

const DEFAULT_PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "127.0.0.1";

export const app = express();

// Security and Content-Type Headers Middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "interest-cohort=()");
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
});
app.use("/api", apiRouter);

// Fallback index.html for SPA routes
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(join(root, "public", "index.html"));
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
  const port = await findAvailablePort(DEFAULT_PORT, HOST);
  if (!port) {
    logger.error(`No available port found in range ${DEFAULT_PORT}–${DEFAULT_PORT + 20}`);
    process.exit(1);
  }

  const server = app.listen(port, HOST, () => {
    const url = `http://${HOST}:${port}`;
    console.log("");
    console.log("┌──────────────────────────────────────────────────────────┐");
    console.log(`│  \x1b[1m\x1b[32mCline Marketplace Local Control Plane\x1b[0m                   │`);
    console.log(`│  \x1b[36mLocal URL:\x1b[0m   ${url.padEnd(42)} │`);
    console.log(`│  \x1b[33mCatalog:\x1b[0m     250+ Community & Custom Primitives         │`);
    console.log(`│  \x1b[35mSecurity:\x1b[0m    Defense-in-depth on 127.0.0.1 (Loopback)   │`);
    console.log("└──────────────────────────────────────────────────────────┘");
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