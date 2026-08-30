# Changelog

All notable changes to **Cline Marketplace** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-08-30

### Added
- **Multi-Root Storage Probing**: Expanded filesystem candidate scanners in `lib/probes.js` to discover `~/.commandcode`, `~/.agents`, Roo-Cline (`rooveterinaryinc.roo-cline`), Cursor (`.cursor`), and Claude Desktop installations across Windows, macOS, and Linux.
- **Robust YAML Frontmatter Parser**: Zero-dependency parser `parseYamlFrontmatter` in `lib/probes.js` supporting multi-line folded block scalars (`>`), literal block scalars (`|`), metadata dictionaries, tags, and keywords in `SKILL.md` files without residue corruption.
- **Dynamic Binary & Shim Resolver**: Created `lib/resolver.js` supporting multi-package managers (Scoop, Chocolatey, fnm, nvm, Homebrew, PATH) and cross-platform Chrome/Chromium detection.
- **Configurable Data Persistence**: Added `getDataDir()` in `lib/state.js` respecting environment precedence (`CLINEMARKET_DATA_DIR` > `DATA_DIR` > `data/`), allowing fully isolated unit/smoke test executions in `os.tmpdir()`.
- **Workspace Context & Stack Engine**: Integrated `GET /api/context` providing deep heuristic analysis of workspace dependencies, frameworks, and matched catalog recommendations with bundles.
- **REST Endpoints & Canonical Error Contracts**:
  - `POST /api/refresh` for in-process catalog and upstream metadata synchronization.
  - `DELETE /api/mark/:type/:id` and `DELETE /api/forget/:type/:id` for granular lifecycle management.
  - `POST /api/watchlist` and `DELETE /api/watchlist/:type/:id` for direct watchlist manipulations.
  - `POST /api/bulk` support for `watch` and `unwatch` bulk operations.
  - Dedicated 404 JSON middleware under `/api/*` returning `{ ok: false, error: string, code: "NOT_FOUND" }`.
  - Standardized error envelopes `{ ok: false, error: string, code?: string }` across all REST handlers.
- **Strict Quality Gate**: Integrated `node:assert/strict` across 14 native unit tests (`scripts/unit-test.mjs`) and smoke tests (`scripts/smoke-test.mjs`) with assertions on all API endpoints.
- **Automated Hook Installer**: Added `scripts/setup-hooks.mjs` invoked automatically via `npm run prepare` to configure git `pre-commit` and `pre-push` verification gates.

### Changed
- **Express 5 Upgrade & Modularization**: Refactored backend into pure ES Modules (`lib/state.js`, `lib/probes.js`, `lib/reconciler.js`, `lib/runner.js`, `lib/routes.js`, `lib/logger.js`, `lib/sanitizers.js`, `lib/resolver.js`).
- **Distribution Package Optimization**: Excluded screenshots and audit directories via `.npmignore`, reducing npm distribution tarball size by 95.4% to **114.9 KB**.
- **CLI Robustness**: Fixed `RangeError` on invalid port numbers with `[1, 65535]` range validation; ensured CLI `update` command exits with `exit(1)` on error.
- **CI/CD Actions Modernization**: Upgraded GitHub Actions workflow tags to official stable versions (`actions/checkout@v4`, `actions/setup-node@v5`, `actions/github-script@v7`) and added Node `24.x` matrix testing.
- **Asynchronous Execution**: Migrated all remaining `execSync` invocations in routes to promisified `execFile` without blocking the Node.js Event Loop.
- **Observability**: Updated `lib/logger.js` to respect `NO_COLOR` and non-TTY execution environments; switched server metrics to `process.uptime()` and `process.memoryUsage()`.

### Security
- **Content-Security-Policy (CSP)**: Added strict CSP headers restricting script, font, and connect origins to loopback and verified GitHub APIs.
- **Loopback CSRF Protection**: Added mutating request origin checks (`Origin` and `Sec-Fetch-Site`) for loopback security.
- **Corruption Quarantine**: Added `.corrupt.<timestamp>` automatic quarantine backup when unparseable JSON is detected, protecting existing installation state.
- **Subprocess Tree Cleanup**: Implemented process tree termination on Windows (`taskkill /pid ${proc.pid} /T /F`) and POSIX signal escalation for subprocess timeouts.

---

## [1.0.0] - 2026-08-30

### Added
- **Local Control Plane & Web Browser**: Offline-first Express application serving 250+ plugins, skills, and MCP servers.
- **DESIGN.md Theme Implementation**: Full dark chalkboard aesthetic (`#141414`), 1000px pill navigation, 25px card radius, and single Acid Lime (`#c7ff69`) primary CTA.
- **Integrated Brand Micro-Palette**: Header-integrated 5 candy-colored primitives badge (`#7a78ff`, `#00a652`, `#ff6d38`, `#ffc412`, `#478bff`).
- **Zero-Friction NPX Runner**: Automatic dependency installation, catalog bootstrapping, and port allocation via `npx cline-marketplace`.
- **Automated Update Engine**: In-app floating banner notifications and `cline-marketplace update` subcommand with background GitHub releases check.
- **Workspace Stack Heuristics & Curated Toolchains**: Multi-language detection (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, Git remotes) and toolchain bundles (*Fullstack & API Toolchain*, *Cloudflare Serverless Suite*, *Database & Storage Toolchain*).
- **Diagnostics & Probes Tab**: 2-column card grid probing Node runtime, Cline CLI, GitHub CLI, local directories, and catalog freshness.
- **GitHub Actions Automation**:
  - `ci.yml`: Multi-OS (Ubuntu, Windows, macOS) and multi-Node (18, 20, 22, 24) matrix test runner.
  - `sync-catalog.yml`: Scheduled 6-hour cron sync with upstream `cline/marketplace`.
  - `release.yml`: Automatic GitHub Release and asset generation.
  - `codeql.yml`: Static Application Security Testing (SAST).
  - `dependabot.yml`: Automated dependency monitoring.
- **Community Governance & Standards**: Complete suite of security policies, contributing guides, code of conduct, issue templates, and PR checklists.
