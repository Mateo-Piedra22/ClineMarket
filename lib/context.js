// Unified workspace stack-detection engine (audit 2026-09-05).
// Replaces the divergent duplicated heuristics that lived in
// lib/routes.js::analyzeWorkspaceContext and scripts/detect-context.mjs.
// Single source of truth: the superset of both detection sets, pure (no
// subprocesses, no catalog access). Routes layer enriches the result with
// recommendations/bundles; the CLI diagnostic prints it as JSON.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

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

/**
 * Resolves owner/name of the git remote origin by reading .git/config
 * (worktree or worktree-pointer via gitdir:), falling back to the
 * `repository` field of package.json. Pure file reads, no subprocess.
 * @param {string} targetCwd
 * @returns {{ owner: string, name: string }|null}
 */
export function parseGitRepo(targetCwd) {
  try {
    let gitPath = join(targetCwd, ".git");
    if (existsSync(gitPath)) {
      try {
        const stat = statSync(gitPath);
        if (stat.isFile()) {
          const content = readFileSync(gitPath, "utf8");
          const match = content.match(/gitdir:\s*(.+)/i);
          if (match) {
            gitPath = resolve(targetCwd, match[1].trim());
          }
        }
      } catch {}

      const configPath = join(gitPath, "config");
      if (existsSync(configPath)) {
        const configText = readIfExists(configPath);
        const originSection = configText?.match(/\[remote\s+["']origin["']\][^[]*?url\s*=\s*([^\r\n]+)/is) ||
                             configText?.match(/\[remote\s+[^\]]+\][^[]*?url\s*=\s*([^\r\n]+)/is);
        if (originSection) {
          const rawUrl = originSection[1].trim();
          const match = rawUrl.match(/(?:[:/])([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/);
          if (match) {
            return { owner: match[1], name: match[2] };
          }
        }
      }
    }

    try {
      const pkgPath = join(targetCwd, "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        let repoStr = null;
        if (typeof pkg.repository === "string") repoStr = pkg.repository;
        else if (pkg.repository && typeof pkg.repository.url === "string") repoStr = pkg.repository.url;
        if (repoStr) {
          const m = repoStr.match(/(?:[:/])([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/);
          if (m) {
            return { owner: m[1], name: m[2] };
          }
        }
      }
    } catch {}

    return null;
  } catch {
    return null;
  }
}


/**
 * Reads the current branch/commit from .git/HEAD without subprocesses.
 * @param {string} cwd
 * @returns {{ branch: string|null, commit: string|null }}
 */
export function readGitHead(cwd) {
  let branch = null;
  let commit = null;
  const gitHeadPath = join(cwd, ".git", "HEAD");
  if (existsSync(gitHeadPath)) {
    try {
      const headContent = readFileSync(gitHeadPath, "utf8").trim();
      if (headContent.startsWith("ref: refs/heads/")) {
        branch = headContent.replace("ref: refs/heads/", "");
        const refPath = join(cwd, ".git", "refs", "heads", branch);
        if (existsSync(refPath)) {
          commit = readFileSync(refPath, "utf8").trim().slice(0, 7);
        }
      } else {
        commit = headContent.slice(0, 7);
      }
    } catch {}
  }
  return { branch, commit };
}

/**
 * Detects the stack of a workspace directory. Superset of the previous
 * duplicated engines (lib/routes.js + scripts/detect-context.mjs).
 * Assumes `cwd` exists (callers verify first).
 */
export function detectStack(targetCwd) {
  const cwd = resolve(targetCwd || process.cwd());
  const repo = parseGitRepo(cwd);
  const { branch, commit } = readGitHead(cwd);
  const languages = new Set();
  const frameworks = new Set();
  const tags = new Set();
  const hints = new Set();
  const dependencies = new Set();

  const shallowFiles = listFilesShallow(cwd);

  // ---- JavaScript / Node ----------------------------------------------------
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    languages.add("javascript");
    try {
      const j = JSON.parse(readFileSync(pkgPath, "utf8"));
      const allDeps = { ...(j.dependencies || {}), ...(j.devDependencies || {}) };
      for (const depName of Object.keys(allDeps)) dependencies.add(depName);
      const has = (name) => Boolean(allDeps[name]);

      if (allDeps.typescript || existsSync(join(cwd, "tsconfig.json"))) {
        languages.add("typescript");
        hints.add("TypeScript configured");
      }
      if (has("react")) { frameworks.add("react"); tags.add("frontend"); tags.add("react"); }
      if (has("vue")) { frameworks.add("vue"); tags.add("frontend"); tags.add("vue"); }
      if (allDeps.next || allDeps.nextjs) {
        frameworks.add("nextjs");
        tags.add("fullstack");
        tags.add("react");
        hints.add("Next.js framework detected");
      }
      if (has("nuxt")) frameworks.add("nuxt");
      if (has("svelte") || has("@sveltejs/kit")) { frameworks.add("svelte"); tags.add("frontend"); }
      if (has("astro")) frameworks.add("astro");
      if (has("@angular/core")) frameworks.add("angular");
      if (has("express")) { frameworks.add("express"); tags.add("backend"); tags.add("api"); }
      if (has("fastify")) { frameworks.add("fastify"); tags.add("backend"); tags.add("api"); }
      if (allDeps["@nestjs/core"] || allDeps.nestjs) { frameworks.add("nestjs"); tags.add("backend"); }
      if (has("tailwindcss")) { frameworks.add("tailwind"); tags.add("css"); }
      if (has("prisma") || has("@prisma/client")) frameworks.add("prisma");
      if (has("drizzle-orm")) frameworks.add("drizzle");
      if (has("supabase") || has("@supabase/supabase-js")) frameworks.add("supabase");
      if (has("@neondatabase/serverless") || has("postgres") || has("pg")) frameworks.add("postgres");
      if (has("mongoose")) frameworks.add("mongoose");
      if (has("redis") || has("ioredis")) frameworks.add("redis");
      if (has("@cloudflare/workers-types") || has("wrangler")) frameworks.add("cloudflare");
      if (has("electron")) { frameworks.add("electron"); tags.add("desktop"); hints.add("Electron framework detected"); }
      if (has("vite")) { frameworks.add("vite"); tags.add("frontend"); }
      if (allDeps.jest || allDeps.vitest || allDeps.mocha) { tags.add("testing"); hints.add("Test suite configured"); }
      if (allDeps.playwright || allDeps["@playwright/test"]) frameworks.add("playwright");
      if (allDeps.cypress) frameworks.add("cypress");
    } catch {}
  }

  // ---- Python ---------------------------------------------------------------
  const pyProject = join(cwd, "pyproject.toml");
  const reqTxt = join(cwd, "requirements.txt");
  const pipfile = join(cwd, "Pipfile");
  const setupPy = join(cwd, "setup.py");
  if (existsSync(pyProject) || existsSync(reqTxt) || existsSync(pipfile) || existsSync(setupPy) || shallowFiles.some((f) => f.endsWith(".py"))) {
    languages.add("python");
    let pyContent = "";
    try {
      if (existsSync(reqTxt)) pyContent += readFileSync(reqTxt, "utf8");
      if (existsSync(pyProject)) pyContent += readFileSync(pyProject, "utf8");
    } catch {}
    const pyLower = pyContent.toLowerCase();
    if (pyLower.includes("django")) { frameworks.add("django"); tags.add("backend"); }
    if (pyLower.includes("flask")) { frameworks.add("flask"); tags.add("backend"); }
    if (pyLower.includes("fastapi")) { frameworks.add("fastapi"); tags.add("backend"); tags.add("api"); }
    if (pyLower.includes("torch") || pyLower.includes("tensorflow") || pyLower.includes("transformers") || pyLower.includes("langchain") || pyLower.includes("pydantic-ai") || pyLower.includes("openai")) {
      frameworks.add("ai-ml");
      tags.add("ai");
      tags.add("data");
      hints.add("AI/ML dependencies detected");
    }
    if (pyLower.includes("pytest")) {
      tags.add("testing");
      hints.add("pytest suite configured");
    }
  }

  // ---- Other languages ------------------------------------------------------
  if (existsSync(join(cwd, "go.mod")) || shallowFiles.some((f) => f.endsWith(".go"))) {
    languages.add("go");
    try {
      const goMod = readFileSync(join(cwd, "go.mod"), "utf8");
      if (goMod.includes("gin-gonic")) frameworks.add("gin");
    } catch {}
  }
  if (existsSync(join(cwd, "Cargo.toml")) || shallowFiles.some((f) => f.endsWith(".rs"))) {
    languages.add("rust");
    try {
      const cargoToml = readFileSync(join(cwd, "Cargo.toml"), "utf8");
      if (cargoToml.includes("tokio")) { frameworks.add("tokio"); hints.add("Tokio async runtime configured"); }
      if (cargoToml.includes("actix")) frameworks.add("actix");
      if (cargoToml.includes("axum")) frameworks.add("axum");
    } catch {}
  }
  if (existsSync(join(cwd, "pom.xml")) || existsSync(join(cwd, "build.gradle")) || shallowFiles.some((f) => f.endsWith(".java"))) {
    languages.add("java");
  }
  if (existsSync(join(cwd, "composer.json")) || shallowFiles.some((f) => f.endsWith(".php"))) {
    languages.add("php");
  }
  if (shallowFiles.some((f) => f.endsWith(".cs") || f.endsWith(".csproj") || f.endsWith(".sln"))) {
    languages.add("csharp");
  }
  if (existsSync(join(cwd, "pubspec.yaml"))) {
    languages.add("dart");
  }

  // ---- Tooling / infra ------------------------------------------------------
  if (existsSync(join(cwd, "Dockerfile")) || existsSync(join(cwd, "docker-compose.yml")) || existsSync(join(cwd, "compose.yaml"))) {
    frameworks.add("docker");
    tags.add("devops");
    hints.add("Docker container workflow detected");
  }

  let packageManager = null;
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) packageManager = "pnpm";
  else if (existsSync(join(cwd, "yarn.lock"))) packageManager = "yarn";
  else if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) packageManager = "bun";
  else if (existsSync(join(cwd, "package-lock.json"))) packageManager = "npm";

  if (existsSync(join(cwd, ".git")) || repo) {
    frameworks.add("git");
    tags.add("git");
    hints.add("Git version control active");
  }

  // ---- Tag suggestions (from detect-context.mjs, shared by CLI + recommender)
  if (languages.size || frameworks.size) tags.add("software");
  if (languages.has("python") || [...frameworks].some((f) => ["fastapi", "django", "flask"].includes(f))) tags.add("research");
  if (["postgres", "drizzle", "prisma", "mongoose"].some((f) => frameworks.has(f))) {
    tags.add("databases");
    tags.add("data");
  }
  if (frameworks.has("cloudflare")) {
    tags.add("cloud");
    tags.add("software");
  }
  if (existsSync(join(cwd, ".github"))) tags.add("software");

  return {
    repo,
    branch,
    commit,
    packageManager,
    languages: Array.from(languages),
    frameworks: Array.from(frameworks),
    tags: Array.from(tags),
    hints: Array.from(hints),
    dependencies: Array.from(dependencies),
  };
}
