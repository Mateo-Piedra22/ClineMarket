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
//   - hints: ["...", ...]          (human-readable "you might want X because Y")

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const cwd = resolve(process.argv[2] || process.cwd());

const result = {
  cwd,
  repo: null,
  languages: [],
  frameworks: [],
  tags: [],
  hints: [],
};

// ---- Git repo detection ---------------------------------------------------

function detectGitRepo() {
  try {
    const remoteUrl = execFileSync(
      "git",
      ["config", "--get", "remote.origin.url"],
      { cwd, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" },
    ).trim();
    if (!remoteUrl) return null;

    let m = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
    if (!m) m = remoteUrl.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
    if (!m) return { url: remoteUrl, owner: null, name: null };
    return {
      url: `https://github.com/${m[1]}/${m[2]}`,
      owner: m[1],
      name: m[2],
    };
  } catch {
    return null;
  }
}

result.repo = detectGitRepo();

// ---- File probes ----------------------------------------------------------

function readIfExists(p) {
  try {
    if (!existsSync(p)) return null;
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function listFilesShallow(dir) {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir);
  } catch {
    return [];
  }
}

const shallowFiles = listFilesShallow(cwd);

// Languages
const pkg = readIfExists(join(cwd, "package.json"));
if (pkg) {
  result.languages.push("javascript");
  try {
    const j = JSON.parse(pkg);
    if (j.devDependencies?.typescript || j.dependencies?.typescript || existsSync(join(cwd, "tsconfig.json"))) {
      result.languages.push("typescript");
    }
  } catch {}
}
if (existsSync(join(cwd, "pyproject.toml")) || existsSync(join(cwd, "requirements.txt")) || shallowFiles.some((f) => f.endsWith(".py"))) {
  result.languages.push("python");
}
if (existsSync(join(cwd, "go.mod")) || shallowFiles.some((f) => f.endsWith(".go"))) result.languages.push("go");
if (existsSync(join(cwd, "Cargo.toml")) || shallowFiles.some((f) => f.endsWith(".rs"))) result.languages.push("rust");
if (existsSync(join(cwd, "pom.xml")) || existsSync(join(cwd, "build.gradle")) || shallowFiles.some((f) => f.endsWith(".java"))) result.languages.push("java");
if (existsSync(join(cwd, "composer.json")) || shallowFiles.some((f) => f.endsWith(".php"))) result.languages.push("php");
if (shallowFiles.some((f) => f.endsWith(".cs") || f.endsWith(".csproj") || f.endsWith(".sln"))) result.languages.push("csharp");
if (existsSync(join(cwd, "pubspec.yaml"))) result.languages.push("dart");
if (existsSync(join(cwd, "Dockerfile")) || existsSync(join(cwd, "docker-compose.yml"))) result.frameworks.push("docker");

// JavaScript / Node Frameworks
if (pkg) {
  try {
    const j = JSON.parse(pkg);
    const all = { ...(j.dependencies || {}), ...(j.devDependencies || {}) };
    const has = (name) => Boolean(all[name]);
    if (has("next")) result.frameworks.push("nextjs");
    if (has("react")) result.frameworks.push("react");
    if (has("vue")) result.frameworks.push("vue");
    if (has("nuxt")) result.frameworks.push("nuxt");
    if (has("svelte") || has("@sveltejs/kit")) result.frameworks.push("svelte");
    if (has("astro")) result.frameworks.push("astro");
    if (has("@angular/core")) result.frameworks.push("angular");
    if (has("express")) result.frameworks.push("express");
    if (has("fastify")) result.frameworks.push("fastify");
    if (has("@nestjs/core")) result.frameworks.push("nestjs");
    if (has("tailwindcss")) result.frameworks.push("tailwind");
    if (has("prisma") || has("@prisma/client")) result.frameworks.push("prisma");
    if (has("drizzle-orm")) result.frameworks.push("drizzle");
    if (has("supabase") || has("@supabase/supabase-js")) result.frameworks.push("supabase");
    if (has("@neondatabase/serverless") || has("postgres") || has("pg")) result.frameworks.push("postgres");
    if (has("mongoose")) result.frameworks.push("mongoose");
    if (has("redis") || has("ioredis")) result.frameworks.push("redis");
    if (has("vitest") || has("jest")) result.frameworks.push("testing");
    if (has("playwright") || has("@playwright/test")) result.frameworks.push("playwright");
    if (has("cypress")) result.frameworks.push("cypress");
    if (has("@cloudflare/workers-types") || has("wrangler")) result.frameworks.push("cloudflare");
  } catch {}
}

// Python frameworks
if (existsSync(join(cwd, "pyproject.toml")) || existsSync(join(cwd, "requirements.txt"))) {
  const txt = (readIfExists(join(cwd, "pyproject.toml")) || "") + " " + (readIfExists(join(cwd, "requirements.txt")) || "");
  if (/fastapi/i.test(txt)) result.frameworks.push("fastapi");
  if (/django/i.test(txt)) result.frameworks.push("django");
  if (/flask/i.test(txt)) result.frameworks.push("flask");
  if (/pytest/i.test(txt)) result.frameworks.push("pytest");
}

// Tag suggestions
if (result.languages.length || result.frameworks.length) {
  result.tags.push("software");
}
if (result.languages.includes("python") || result.frameworks.some((f) => ["fastapi", "django", "flask"].includes(f))) {
  result.tags.push("research");
}
if (result.frameworks.includes("postgres") || result.frameworks.includes("drizzle") || result.frameworks.includes("prisma") || result.frameworks.includes("mongoose")) {
  result.tags.push("databases");
  result.tags.push("data");
}
if (result.frameworks.includes("cloudflare")) {
  result.tags.push("cloud");
  result.tags.push("software");
}
if (existsSync(join(cwd, ".github"))) result.tags.push("software");

// Deduplicate
result.languages = [...new Set(result.languages)];
result.frameworks = [...new Set(result.frameworks)];
result.tags = [...new Set(result.tags)];

// Hints
if (result.repo) result.hints.push(`Detected repo ${result.repo.owner}/${result.repo.name}`);
if (result.languages.includes("typescript")) result.hints.push("TypeScript project → software/dev tooling entries will help most");
if (result.frameworks.includes("nextjs")) result.hints.push("Next.js detected → look at software + research entries");
if (result.frameworks.includes("postgres") || result.frameworks.includes("prisma")) result.hints.push("Database in use → databases + data tags are prioritized");
if (result.frameworks.includes("playwright")) result.hints.push("Playwright in use → testing-focused skills will be useful");
if (result.frameworks.includes("cloudflare")) result.hints.push("Cloudflare stack in use → Cloudflare MCPs and tools prioritized");
if (!result.repo && !result.languages.length) {
  result.hints.push("No project context detected — browse the full catalog");
}

console.log(JSON.stringify(result, null, 2));