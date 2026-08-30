# Changelog

All notable changes to **Cline Marketplace** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
  - `ci.yml`: Multi-OS (Ubuntu, Windows, macOS) and multi-Node (18, 20, 22) matrix test runner.
  - `sync-catalog.yml`: Scheduled 6-hour cron sync with upstream `cline/marketplace`.
  - `release.yml`: Automatic GitHub Release and asset generation.
  - `codeql.yml`: Static Application Security Testing (SAST).
  - `dependabot.yml`: Automated dependency monitoring.
- **Community Governance & Standards**: Complete suite of security policies, contributing guides, code of conduct, issue templates, and PR checklists.

### Security
- Comprehensive input sanitization blocking path traversal, command injection, and illegal primitive identifiers.
- Atomic file write mechanisms with temporary files and rename guards.
- Local loopback interface binding (`127.0.0.1`) and strict HTTP security headers (`nosniff`, `SAMEORIGIN`, `strict-origin-when-cross-origin`).
