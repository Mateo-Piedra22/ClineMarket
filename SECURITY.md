# Security Policy

## Supported Versions

We provide security updates and patches for the following versions:

| Version | Supported          |
| :------ | :----------------- |
| 1.x.x   | :white_check_mark: |
| < 1.0.0 | :x:                |

## Reporting a Vulnerability

We take the security of Cline Marketplace Local Browser seriously. If you believe you have found a security vulnerability in this project, please report it responsibly.

### How to Report

**Please DO NOT report security vulnerabilities through public GitHub issues.**

Instead, please report security issues using one of the following methods:

1. **GitHub Security Advisory (Recommended)**: Submit a private advisory via [GitHub Security Advisories](https://github.com/Mateo-Piedra22/ClineMarket/security/advisories/new).
2. **Direct Contact**: Reach out to the maintainer directly via GitHub profile [@Mateo-Piedra22](https://github.com/Mateo-Piedra22).

### What to Include in Your Report

To help us triage and resolve the issue quickly, please provide:

- A clear description of the vulnerability.
- Step-by-step instructions to reproduce the issue (proof-of-concept script or HTTP payload).
- Impact assessment (e.g., potential for local command injection, path traversal, CSRF).
- Any proposed remediation or patch if available.

### Response Timeline

- **Initial Acknowledgment**: Within 48 hours.
- **Triage & Assessment**: Within 5 business days.
- **Fix & Public Disclosure**: We aim to release a patch within 14 days of confirmation.

## Security Architecture & Threat Model

Cline Marketplace is designed with local-first, defense-in-depth principles:

1. **Local Loopback Only & CSRF Mitigation**:
   - The Express HTTP server strictly binds to `127.0.0.1` by default. A non-loopback `HOST` is blocked and forced back to loopback unless explicitly opted-in via `ALLOW_REMOTE_HOST=1`, which additionally requires a `CLINEMARKET_CONTROL_TOKEN`; without it the server refuses to start. The realized `EFFECTIVE_HOST` is used for both port discovery and the actual bind.
   - Mutating requests (`POST`, `PUT`, `DELETE`) are protected with `Origin` and `Sec-Fetch-Site` validation to prevent malicious cross-origin websites from triggering loopback actions.
   - **Control-Token Authentication (since 1.2.2)**: when `ALLOW_REMOTE_HOST=1` and `CLINEMARKET_CONTROL_TOKEN` is set, every mutating route (`POST`, `PUT`, `DELETE`, `PATCH`) requires the token via `Authorization: Bearer <token>` (or `X-Control-Token` header). The token is compared with `crypto.timingSafeEqual` to avoid timing oracles. Requests without a valid token receive `401 UNAUTHORIZED` (`{ ok: false, code: "UNAUTHORIZED" }`). This also closes the previously unguarded `POST /api/shutdown` endpoint. On plain loopback (default), the middleware short-circuits and no token is required.
   - **Rate Limiting (since 1.2.2)**: all mutating routes are additionally capped at **120 requests per 60-second window** via `express-rate-limit`. Bursts beyond the limit return `429` with `{ ok: false, code: "RATE_LIMITED" }`. The limit applies regardless of the bind address and protects subprocess-spawning endpoints (`/api/install`, `/api/bulk`, `/api/mark`, `/api/forget`, etc.) from abuse.
2. **Content-Security-Policy (CSP) & Defense-in-Depth Headers**:
   - `Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://api.github.com https://raw.githubusercontent.com; frame-ancestors 'none';`
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: SAMEORIGIN`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: interest-cohort=()`
3. **Subprocess Isolation, Environment Segmentation & Process Tree Cleanup**:
   - External binaries (`cline`, `gh`, `npm`) are executed using argument vectors via `child_process.execFile` / `spawn` with `windowsHide: true`.
   - The child environment is built from a strict **allowlist** (`getExecutionEnv()` in `lib/runner.js`): platform/path variables (`PATH`, `PATHEXT`, `ComSpec`, `SystemRoot`, `HOME`, `TEMP`, proxies, `npm_config_*`/`CLINEMARKET_*` prefixes) are preserved while credentials (`GITHUB_TOKEN`, `GH_TOKEN`, `*_API_KEY`, `*_SECRET`, `NODE_OPTIONS`) are **never propagated** to child processes. Callers can explicitly opt in to specific secrets via `getExecutionEnv({ inheritSecrets: [...] })`.
   - On Windows, timeouts trigger process tree termination (`taskkill /pid ${proc.pid} /T /F`); on POSIX the entire spawned process group is signaled (`process.kill(-pid)`), preventing orphaned grandchildren.
   - Buffer size limits (`maxBuffer: 5MB`) are strictly bounded, with truncation warnings emitted to the log.
4. **Strict Input Sanitization & Path Traversal Guards**:
   - Primitive types are restricted strictly to `plugin`, `skill`, or `mcp`.
   - Primitive IDs are validated against `/^[a-zA-Z0-9@_.-]+$/` with explicit checks preventing path traversal (`..`), slashes, and control characters.
   - Workspace paths supplied to heuristics are normalized and validated with `statSync.isDirectory()` before processing.
5. **Atomic File Persistence & Corruption Quarantine**:
   - All state modifications (`data/installed.json`, `data/watchlist.json`, `data/settings.json`) write to temporary files before executing atomic renames.
   - If an unparseable JSON file is detected during startup, an automatic backup `${p}.corrupt.<timestamp>` is quarantined and destructive overwriting is prevented.
