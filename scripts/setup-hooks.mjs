import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

const gitHooksDir = join(process.cwd(), ".git", "hooks");
if (existsSync(join(process.cwd(), ".git"))) {
  if (!existsSync(gitHooksDir)) mkdirSync(gitHooksDir, { recursive: true });

  const preCommitHook = `#!/usr/bin/env sh
node scripts/pre-commit.mjs
`;

  const prePushHook = `#!/usr/bin/env sh
node scripts/pre-push.mjs
`;

  const preCommitPath = join(gitHooksDir, "pre-commit");
  const prePushPath = join(gitHooksDir, "pre-push");

  writeFileSync(preCommitPath, preCommitHook, "utf8");
  writeFileSync(prePushPath, prePushHook, "utf8");

  try {
    chmodSync(preCommitPath, 0o755);
    chmodSync(prePushPath, 0o755);
  } catch {}

  console.log("Git hooks configured successfully in .git/hooks/");
}
