# AGENTS.md — Design Rules & SSOT Map (ClineMarket)

Rules every agent/contributor MUST follow. Laziest correct solution wins; read
code before writing code; never expand a fix into a refactor.

## Single Sources of Truth (SSOT)

| Concept | SSOT | Derived from it |
|---|---|---|
| Default port / scan ranges | `lib/config.js` (`DEFAULT_PORT`, `PORT_ATTEMPTS`, `PORT_SCAN_END`, `DEFAULT_HOST`) | `server.js`, `bin/cline-marketplace.js`, `scripts/smoke-test.mjs`, `scripts/capture-screenshots.mjs` |
| Effective server port | `READY_MARKER` line printed by `server.js` on bind | CLI launcher handshake (`child.readyPort`), probe fallback `discoverEffectivePort` |
| Release process | `auto-changelog.yml` (CHANGELOG.md top header = version) | package.json auto-synced by CI; tags `vX.Y.Z`; **no other release workflow may exist** |
| Version | `CHANGELOG.md` top-most `## [X.Y.Z]` header | `package.json.version` (CI syncs on drift) |
| Stack detection | `lib/context.js` (`detectStack`) | `lib/routes.js` `/api/context`, `scripts/detect-context.mjs` |
| Input sanitization | `lib/sanitizers.js` | routes, runner, reconciler |
| State persistence | `lib/state.js` (atomic write + write queue + corrupt quarantine) | everything touching `data/*.json` |
| MCP config redaction | `lib/sanitizers.js::sanitizeMcpConfig` | `lib/reconciler.js`, `/api/installed`, `/api/export` — secrets NEVER hit disk/API |
| Install arg validation | `lib/routes.js::validateInstallArgToken` (argv-array + shell-metachar rejection) | `/api/install`, `/api/bulk` |
| Skills integrity | `skills-lock.json` + `lib/integrity.js` (`verifySkillsLock`) | `scripts/verify-skills-lock.mjs`, CI |

## Security invariants (never simplify away)

1. Server binds loopback unless `ALLOW_REMOTE_HOST=1` **and** `CLINEMARKET_CONTROL_TOKEN` (fail-closed).
2. Subprocesses: argv arrays, `shell:false`; Windows shim fallback only through `escapeWindowsShellArg`.
3. Mutating routes: CSRF (Origin/Sec-Fetch-Site) + rate limit + control token when exposed.
4. Frontend: every dynamic interpolation into `innerHTML` goes through `escapeHtml`; CSP `script-src 'self'`.
5. Zero secrets in `data/*.json` or API responses (sanitize-then-persist).

## Verification protocol (green bar)

```bash
npm run verify   # = test:unit + test:smoke + npm audit --omit=dev + verify-skills-lock
```

Or, explicitly:
```bash
npm run test:unit   # 57+ tests, node --test
npm run test:smoke  # end-to-end + security assertions
npm audit --omit=dev
node scripts/verify-skills-lock.mjs
```

CI and the pre-push hook run the same checks. Never declare done without the counts.

## Workflow conventions

- GitHub Actions pinned by full commit SHA (`uses: x/y@<sha> # vX.Y.Z`).
- CHANGELOG.md is the release trigger — a push touching it ships a release.
- `data/` is runtime state, gitignored except CI-synced catalog artifacts.
- New engine logic goes in `lib/`; `scripts/` may only wrap `lib/` exports.
