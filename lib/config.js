// Single Source of Truth for runtime constants (audit 2026-09-05, SSOT pass).
// Every port default/range in server.js, bin/, and scripts/ derives from here.
// Docs (README/SUPPORT) reference 5173; update them together with DEFAULT_PORT.

/** First port tried by the HTTP server and assumed by CLI subcommands. */
export const DEFAULT_PORT = 5173;

/** Number of consecutive ports probed when the preferred one is taken. */
export const PORT_ATTEMPTS = 20;

/** Inclusive upper bound when scanning for an already-running instance. */
export const PORT_SCAN_END = 5195;

/** Host the control plane binds to by default (loopback-only unless overridden). */
export const DEFAULT_HOST = "127.0.0.1";

/**
 * Machine-readable startup marker. server.js prints
 * `__CLINEMARKET_READY__ port=<n>` on the effective listen port so the CLI
 * launcher can handshake the real port (TOCTOU-safe) instead of guessing.
 */
export const READY_MARKER = "__CLINEMARKET_READY__";
