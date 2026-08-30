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
   - The Express HTTP server strictly binds to `127.0.0.1`.
   - Mutating requests (`POST`, `PUT`, `DELETE`) are protected with `Origin` and `Sec-Fetch-Site` validation to prevent malicious cross-origin websites from triggering loopback actions.
2. **Content-Security-Policy (CSP) & Defense-in-Depth Headers**:
   - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.github.com; frame-ancestors 'none';`
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: SAMEORIGIN`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `X-XSS-Protection: 1; mode=block`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
3. **Subprocess Isolation & Process Tree Cleanup**:
   - External binaries (`cline`, `gh`, `npm`) are executed using argument vectors via `child_process.execFile` / `spawn` with `windowsHide: true`.
   - On Windows, timeouts trigger process tree termination (`taskkill /pid ${proc.pid} /T /F`) to prevent rogue child processes.
   - Buffer size limits (`maxBuffer: 5MB`) are strictly bounded.
4. **Strict Input Sanitization & Path Traversal Guards**:
   - Primitive types are restricted strictly to `plugin`, `skill`, or `mcp`.
   - Primitive IDs are validated against `/^[a-zA-Z0-9@_.-]+$/` with explicit checks preventing path traversal (`..`), slashes, and control characters.
   - Workspace paths supplied to heuristics are normalized and validated with `statSync.isDirectory()` before processing.
5. **Atomic File Persistence & Corruption Quarantine**:
   - All state modifications (`data/installed.json`, `data/watchlist.json`, `data/settings.json`) write to temporary files before executing atomic renames.
   - If an unparseable JSON file is detected during startup, an automatic backup `${p}.corrupt.<timestamp>` is quarantined and destructive overwriting is prevented.
