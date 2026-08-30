# Contributing to Cline Marketplace

Thank you for your interest in contributing to **Cline Marketplace Local Browser & Control Plane**!

This project provides a local, developer-grade control plane for browsing, managing, and executing primitives published in the official Cline ecosystem.

---

## Code of Conduct

All contributors and maintainers are expected to adhere to our [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## Development Setup

### Prerequisites

- **Node.js**: `v18.0.0` or higher (`v22.x` recommended).
- **npm**: `v9.x` or higher.
- **Git**: Latest version.
- **Cline CLI**: Optional but recommended (`npm install -g cline`).
- **GitHub CLI**: Optional for commit metadata caching (`gh auth login`).

### Step-by-Step Local Setup

1. **Fork and Clone**:
   ```bash
   git clone https://github.com/<your-username>/ClineMarket.git
   cd ClineMarket
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Fetch Initial Catalog**:
   ```bash
   npm run refresh
   ```

4. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Open `http://127.0.0.1:5173` in your browser.

5. **Run Automated Test Suite**:
   ```bash
   npm test
   ```

---

## Project Structure

```
ClineMarket/
├── .github/                  # GitHub Actions, Issue templates, and configs
│   ├── workflows/            # CI, CodeQL, Sync-Catalog, Release
│   └── ISSUE_TEMPLATE/       # Structured issue forms
├── bin/
│   └── cline-marketplace.js  # Zero-friction executable & CLI bootstrap
├── data/                     # Local state & caches (gitignored)
│   ├── installed.json        # Reconciled local primitives
│   ├── watchlist.json        # Starred items
│   └── upstream-meta.json    # Upstream GitHub commit cache
├── docs/                     # Visual screenshots & architectural diagrams
├── public/                   # Frontend assets (Vanilla ES Modules)
│   ├── index.html            # Main UI markup
│   ├── styles.css            # DESIGN.md CSS design system
│   ├── app.js                # State management, filtering & modals
│   └── cline-logo.svg        # Authentic vector mascot
├── scripts/                  # Utilities & tooling
│   ├── capture-screenshots.mjs # DevTools protocol automated captures
│   ├── detect-context.mjs    # Workspace stack heuristic analyzer
│   ├── refresh-catalog.mjs   # Upstream mirror & sync worker
│   └── smoke-test.mjs        # Automated API & CLI test suite
├── catalog.json              # Upstream catalog snapshot
├── server.js                 # Express server & control plane
└── package.json              # Project manifest & scripts
```

---

## Design System Guidelines

All frontend modifications must adhere to [`DESIGN.md`](./DESIGN.md):

- **Theme Palette**: Pitch Black (`#141414`), Charcoal 900 (`#232323`), Warm Cream (`#fdf9f0`), Bone Gray (`#eeeeee`).
- **Primary CTA**: Acid Lime (`#c7ff69`) is the sole primary action color.
- **Brand Palette**: The 5-color candy lockup (`#7a78ff`, `#00a652`, `#ff6d38`, `#ffc412`, `#478bff`).
- **Radii**:
  - `1000px` for buttons, pills, search inputs, tags, and tabs.
  - `25px` for package cards, bundles, diagnostics items, and modals.
- **Aesthetic**: Flat, poster-style (no drop shadows).

---

## Pull Request Process

1. **Branch Naming**:
   - `feat/feature-name` for new capabilities.
   - `fix/issue-description` for bug fixes.
   - `docs/update-description` for documentation.
2. **Ensure Smoke Tests Pass**:
   ```bash
   npm test
   ```
3. **Commit Conventions**:
   We follow Conventional Commits:
   - `feat: add new bundle recommendation heuristic`
   - `fix: resolve port conflict on Windows platforms`
   - `docs: update API reference in README`
4. **Submit PR**:
   - Fill out the [Pull Request Template](./.github/PULL_REQUEST_TEMPLATE.md).
   - Ensure GitHub Actions CI checks pass.

---

## License

By contributing, you agree that your contributions will be licensed under the **Apache-2.0 License**.
