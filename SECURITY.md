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

## Security Architecture & Design Principles

Cline Marketplace is designed with local-first, defense-in-depth principles:

1. **Local Loopback Only**: The Express HTTP server strictly binds to `127.0.0.1`.
2. **Subprocess Isolation**: External binaries (`cline`, `gh`, `npm`) are executed using argument vectors via `child_process.spawn()` with `windowsHide: true` and shell execution disabled (`shell: false`) for all variable inputs to prevent command injection.
3. **Strict Input Sanitization**:
   - Primitive types are restricted to `plugin`, `skill`, or `mcp`.
   - Primitive IDs are validated against `/^[a-zA-Z0-9@_.-]+$/` with explicit checks preventing path traversal (`..`), slashes, and control characters.
   - Workspace paths supplied to heuristics are validated with `statSync.isDirectory()` before processing.
4. **Atomic File Writes**: State modifications (`data/installed.json`, `data/watchlist.json`) use temporary files followed by atomic renames to prevent partial write corruption.
5. **Security Headers**: Standard HTTP headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`) are enforced across all responses.
