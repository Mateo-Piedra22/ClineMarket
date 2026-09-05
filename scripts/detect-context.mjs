// Heuristics to detect the current project's stack so we can recommend
// matching marketplace entries.
//
//   node scripts/detect-context.mjs [cwd]
//
// Prints a JSON object on stdout describing:
//   - repo: { owner, name, url }   (from .git/config or CWD)
//   - languages: ["typescript", ...]
//   - frameworks: ["nextjs", ...]
//   - tags: ["software", ...]      (suggested tags)
//   - hints: ["...", ...]          (human-readable context hints)
//
// Delegates to the shared detection engine in lib/context.js (audit
// 2026-09-05: single source of truth, previously duplicated here with
// divergent framework coverage).

import { resolve } from "node:path";
import { detectStack } from "../lib/context.js";

const cwd = resolve(process.argv[2] || process.cwd());

const stack = detectStack(cwd);

const result = {
  cwd,
  repo: stack.repo
    ? {
        owner: stack.repo.owner,
        name: stack.repo.name,
        url: stack.repo.owner && stack.repo.name ? `https://github.com/${stack.repo.owner}/${stack.repo.name}` : null,
      }
    : null,
  languages: stack.languages,
  frameworks: stack.frameworks,
  tags: stack.tags,
  hints: stack.hints,
};

if (result.repo) result.hints.unshift(`Detected repo ${result.repo.owner}/${result.repo.name}`);
if (result.languages.includes("typescript")) result.hints.push("TypeScript project → software/dev tooling entries will help most");
if (result.frameworks.includes("nextjs")) result.hints.push("Next.js detected → look at software + research entries");
if (result.frameworks.includes("postgres") || result.frameworks.includes("prisma")) result.hints.push("Database in use → databases + data tags are prioritized");
if (result.frameworks.includes("playwright")) result.hints.push("Playwright in use → testing-focused skills will be useful");
if (result.frameworks.includes("cloudflare")) result.hints.push("Cloudflare stack in use → Cloudflare MCPs and tools prioritized");
if (!result.repo && !result.languages.length) {
  result.hints.push("No project context detected — browse the full catalog");
}

console.log(JSON.stringify(result, null, 2));
