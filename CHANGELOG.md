# Changelog

All notable changes to **Cline Marketplace** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.2] - 2026-09-01

### Added
- **Control-Token Authentication on Mutating Routes** (`lib/routes.js`, `server.js`): `CLINEMARKET_CONTROL_TOKEN` is now actually enforced on every `POST`, `PUT`, `DELETE`, and `PATCH` request whenever the server is bound to a non-loopback host (`ALLOW_REMOTE_HOST=1`). Comparison uses `crypto.timingSafeEqual` and accepts the token via `Authorization: Bearer <token>` or `X-Control-Token`. Unauthenticated requests receive `401 UNAUTHORIZED` with `{ ok: false, code: "UNAUTHORIZED" }`. The previously unguarded `POST /api/shutdown` (audit 2026-08-30 finding H6) is now also gated by the same middleware. Single-user local-only operation is unaffected (no auth on loopback).
- **Rate Limiting for Mutating Endpoints** (`lib/routes.js`): `express-rate-limit@^7` middleware (`60s` window, `120 req` limit, `RATE_LIMITED` code) shields endpoints that spawn the `cline` subprocess (`/api/install`, `/api/bulk`) from abuse when the server is exposed on the LAN. Standard `RateLimit-*` headers are returned; legacy `X-RateLimit-*` are suppressed.
- **Structured JSON Log Output & Level Gating** (`lib/logger.js`): `LOG_FORMAT=json` emits one JSON object per line (`ts`, `level`, `pid`, `msg`) for log shippers; `LOG_LEVEL=trace|debug|info|warn|error` filters stream and file output. Default behavior (`plain` + `info`) is fully backward compatible.
- **Coverage Script** (`package.json`): `npm run test:coverage` instruments `lib/**/*.js` (excluding `lib/logger.js`) with Node's built-in `--experimental-test-coverage`. The library layer currently measures **100.00% line/branch/function** coverage across 53 unit tests.

### Changed
- **Inline `onerror` Removed From Card Icons** (`public/app.js`): the entry icon's failure handler no longer uses an inline `onerror="..."` attribute. It is now bound via `addEventListener('error', …, { once: true })` after the card is mounted. Closes audit 2026-08-30 finding H5 (`SyntaxError` when `entry.name` starts with a single quote).
- **README Coverage Table Replaced with Measured Values**: the previous claim of "82.2% line coverage / 22 TAP test suites" was stale relative to the real suite (53 unit tests). The README now reflects the actual measured values emitted by `npm run test:coverage`.

### Security
- Closes audit 2026-09-01 findings **A1** (control token dead at startup), **A2** (unguarded `POST /api/shutdown`), **A3** (no rate limit on mutating routes), **A4** (inline `onerror` XSS-adjacent surface), and **A8** (no log level/format control).

---

## [1.2.1] - 2026-08-31

### Added
- **Rewritten Context-Aware Recommendation Engine** (`lib/recommender.js`): Rebuilt from scratch with a cleaner, testable module surface (`scoreEntry`, `buildRecommendations`, `buildBundles`). New signals for a richer affinity model: `package.json`/`pyproject.toml` dependency names, workspace hint matches, direct id matches, and stack-bundle fit, alongside the existing language/framework/tag/repo signals.
- **Extended Stack-Bundle Catalog**: Grown from 10 to **12 bundle rules** (`golang-services`, `rust-systems`) with per-entry stack signals for Go, Rust, databases, testing/QA, and API development.
- **Recommendation Quality Controls**: Reasons are deduplicated and capped per entry, and `matchPercent` is now a calibrated 0-100 score (positive signals land in the 50-99 band; zero maps to 0) instead of a 50-99 clamp.
- **Performance Optimizations**: Entry corpus tokenization is memoized with a `WeakMap` per entry identity, garbage-collected when catalog snapshots rotate between refreshes; keys use raw `type:id` (case and hyphens preserved).
- **Full Engine Integration** (`lib/routes.js`): `GET /api/context` now delegates scoring and bundle assembly to the recommender engine. Curated hardcoded bundle lists were replaced with data-driven bundles assembled from catalog entries that match each rule's stack signals, plus a workspace-top-matches fallback. Already-installed primitives are excluded from recommendations.

### Changed
- **MCP Installation Flag Ordering**: Fixed `buildInstallArgs` in `lib/routes.js` to insert non-interactive flags (`--yes --json`) before the `--` delimiter so that sub-command arguments (e.g. `npx chrome-devtools-mcp@1.2.0`) are properly separated and Cline CLI executes non-interactively without TTY prompts.
- **Hash-Suffixed Plugin Normalization & Deduplication**: Enhanced `lib/probes.js`, `lib/reconciler.js`, and `lib/routes.js` to normalize marketplace plugin directories (e.g. `branch-protector-9cfb2c234999`), eliminating duplicate synthetic local cards and ensuring active status without drift.
- **`/api/context` bundle contract**: Bundles now include a `completionPercent` field (0-100) computed from installed vs. total matching entries; the `items` array is capped at six entries per bundle.

---

## [1.2.0] - 2026-08-30

### Added
- **Persistent Daily Rotating File Logging**: Added `initFileLogging` in `lib/logger.js` writing to `data/logs/clinemarket-YYYY-MM-DD.log` with ANSI escape sequence stripping (`stripAnsi`) and automatic 14-day log retention pruning (`pruneOldLogs`).
- **ANSI Terminal Branding & CLI Engine**: Overhauled `bin/cline-marketplace.js` and `server.js` with Navigate brand palette ANSI output (`#c7ff69` acid lime, `#7a78ff` iris, `#00a652` toxic green), telemetry info (active repository, git branch, short commit sha, RAM metrics, uptime, storage roots), and dedicated subcommands (`status`, `health`, `list`, `refresh`, `update`, `--help`).
- **REST Endpoints**:
  - `GET /api/logs` returning recent in-memory and disk log lines with configurable limit.
  - `POST /api/workspaces/validate` validating workspace directory existence, `.git` repository status, and `.cline` configurations.
- **Upstream Release Timeline & Activity Stream**: Synthesized `recentReleases` in `/api/changelog` from `catalog.json` and `data/upstream-meta.json` with commit authors, avatars, relative/absolute timestamps, tags, and 1-click "Details" and "Install" triggers.
- **Changelog Sync Status Banner**: Compact visual alert (`.chlog-sync-banner`) displaying up-to-date registry state and inline diff trigger when zero diffs are detected.
- **Subprocess Environment & PATH Augmentation**: Augmented `lib/runner.js` with `getExecutionEnv()` ensuring `PATH`, `Path`, `PATHEXT`, and `ComSpec` include Node.js and global npm directories, preventing `ENOENT: uv_spawn 'npm'` failures during primitive installations.
- **High-Speed Concurrent Metadata Refresh**: Refactored `scripts/refresh-catalog.mjs` to fetch GitHub commit timestamps in parallel chunks with 120s server timeout, dropping sync runtime from 75s to ~15s.
- **Wide-Screen 2-Column Responsive Grid**: Overhauled Health and Changelog tab layouts with full-width responsive 2-column card grids, eliminating horizontal whitespace on wide displays.
- **Catalog Deduplication & Real-Time State Synchronization**: Added canonical key injection (`e.key || \`${e.type}:${e.id}\``) in `/api/catalog` route builder, completely preventing duplicate local synthetic cards for installed marketplace primitives (e.g., Goal plugin, community skills, MCPs). Added automatic real-time catalog and modal state synchronization after install, uninstall, mark, and forget actions.
- **Multi-Root Storage & Workspace Drift Resolution**: Expanded `clineRootCandidates` and `fsProbe` in `lib/probes.js` to automatically discover skills and plugins across `.agents`, `.claude`, `.opencode`, and `.config/opencode` in both global and workspace paths, resolving false-positive `DRIFT` states on workspace-installed skills (such as `cline-sdk`).
- **Deep CSS & UI Polish**:
  - Dark customized Webkit scrollbars (`::-webkit-scrollbar`).
  - Spring-like modal scale-in / fade-in animations with `backdrop-filter: blur(10px)`.
  - Accessible focus rings (`:focus-visible` with 2px acid lime outline).
  - Floating bulk actions toolbar dock (`.bulk-bar`).
  - Environment variable schema tables in detail modals (`.env-table`).
  - ANSI code filter (`stripAnsi`) on modal execution log streams.

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
- **Strict Quality Gate**: Integrated `node:assert/strict` across 22 native unit tests (`scripts/unit-test.mjs`) and smoke tests (`scripts/smoke-test.mjs`) with assertions on all API endpoints, achieving **82.2% global code coverage** and **88.4% domain package coverage**.
- **Automated Hook Installer**: Added `scripts/setup-hooks.mjs` invoked automatically via `npm run prepare` to configure git `pre-commit` and `pre-push` verification gates.

### Changed
- **Express 5 Upgrade & Modularization**: Refactored backend into pure ES Modules (`lib/state.js`, `lib/probes.js`, `lib/reconciler.js`, `lib/runner.js`, `lib/routes.js`, `lib/logger.js`, `lib/sanitizers.js`, `lib/resolver.js`).
- **Resilient State Persistence**: Implemented retry loop with backoff for Windows `renameSync` in `lib/state.js` to guard against transient `EBUSY`/`EPERM` locks.
- **Child Process Race Resolution**: Added `settled` callback protection in `lib/runner.js` to prevent double-settlement on asynchronous spawn error vs close events.
- **Catalog Refresh Reliability**: Added 15s `AbortSignal.timeout` to network calls and atomic `.tmp` writes in `scripts/refresh-catalog.mjs`.
- **Distribution Package Optimization**: Excluded screenshots and audit directories via `.npmignore`, reducing npm distribution tarball size by 95.4% to **114.9 KB**.
- **CLI Robustness**: Fixed `RangeError` on invalid port numbers with `[1, 65535]` range validation; ensured CLI `update` command exits with `exit(1)` on error.
- **CI/CD Actions Modernization**: Upgraded GitHub Actions workflow tags to official stable versions (`actions/checkout@v4`, `actions/setup-node@v5`, `actions/github-script@v7`) and added Node `24.x` matrix testing.
- **Asynchronous Execution**: Migrated all remaining `execSync` invocations in routes to promisified `execFile` without blocking the Node.js Event Loop.
- **Observability**: Updated `lib/logger.js` to respect `NO_COLOR` and non-TTY execution environments; switched server metrics to `process.uptime()` and `process.memoryUsage()`.

### Security
- **Content-Security-Policy (CSP)**: Added strict CSP headers restricting script, font, and connect origins to loopback and verified GitHub APIs.
- **Loopback CSRF Protection**: Added mutating request origin checks (`Origin` and `Sec-Fetch-Site`) using full URL hostname verification.
- **Defensive Request Validation**: Sanitized `recentWorkspaces` array, `/bulk` items, and `/import` records against `null`/malformed objects.
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
