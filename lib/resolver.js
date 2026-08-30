// Resolves the absolute path to a CLI executable or shim across platforms.
// Specifically handles Windows where npm global installs generate .cmd / .ps1 shims
// that Node child_process spawn() will fail on without shell or exact path.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, platform } from "node:os";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const isWin = platform() === "win32";

/**
 * Searches standard npm global, package manager and system locations as a fallback.
 * @param {string} cmdName
 * @returns {string[]}
 */
function getStandardCandidates(cmdName) {
  const home = homedir();
  const candidates = [];

  if (isWin) {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";

    // Windows npm/pnpm/yarn/scoop/choco global binaries (.cmd, .exe, .bat)
    candidates.push(
      join(appData, "npm", `${cmdName}.cmd`),
      join(appData, "npm", `${cmdName}.exe`),
      join(appData, "npm", `${cmdName}.bat`),
      join(localAppData, "npm", `${cmdName}.cmd`),
      join(localAppData, "npm", `${cmdName}.exe`),
      join(localAppData, "pnpm", `${cmdName}.cmd`),
      join(localAppData, "pnpm", `${cmdName}.exe`),
      join(home, "scoop", "shims", `${cmdName}.exe`),
      join(home, "scoop", "shims", `${cmdName}.cmd`),
      join(process.env.ProgramData || "C:\\ProgramData", "chocolatey", "bin", `${cmdName}.exe`),
      join(home, ".cargo", "bin", `${cmdName}.exe`),
      join(programFiles, "nodejs", `${cmdName}.cmd`),
      join(programFiles, "nodejs", `${cmdName}.exe`),
      join(programFiles, "GitHub CLI", `${cmdName}.exe`),
      join(localAppData, "Programs", "GitHub CLI", `${cmdName}.exe`),
      join(home, "AppData", "Local", "Programs", "GitHub CLI", `${cmdName}.exe`),
      join(programFiles, "Google", "Chrome", "Application", `${cmdName}.exe`),
      join(localAppData, "Google", "Chrome", "Application", `${cmdName}.exe`)
    );
  } else {
    candidates.push(
      `/usr/local/bin/${cmdName}`,
      `/usr/bin/${cmdName}`,
      `/bin/${cmdName}`,
      join(home, ".npm-global", "bin", cmdName),
      join(home, ".cargo", "bin", cmdName),
      join(home, ".local", "bin", cmdName),
      `/opt/homebrew/bin/${cmdName}`,
      `/opt/homebrew/sbin/${cmdName}`
    );
  }

  return candidates;
}

/**
 * Resolves a command to its absolute executable path.
 * @param {string} cmdName Name of binary (e.g. 'cline', 'gh', 'node', 'git')
 * @returns {Promise<string|null>}
 */
export async function resolveCommand(cmdName) {
  if (!cmdName) return null;

  // 1. If it's already an absolute or relative path that exists
  if (existsSync(cmdName)) {
    return resolve(cmdName);
  }

  // 2. Try OS path lookup tool: `where.exe` on Windows, `which` on POSIX
  try {
    const lookupTool = isWin ? "where.exe" : "which";
    const { stdout } = await execFileP(lookupTool, [cmdName], {
      windowsHide: true,
      timeout: 3000,
    });

    const lines = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && existsSync(s));

    if (lines.length > 0) {
      if (isWin) {
        // On Windows, prefer .cmd or .exe if multiple shims exist
        const preferred =
          lines.find((l) => l.toLowerCase().endsWith(".cmd")) ||
          lines.find((l) => l.toLowerCase().endsWith(".exe")) ||
          lines.find((l) => l.toLowerCase().endsWith(".bat")) ||
          lines[0];
        return preferred;
      }
      return lines[0];
    }
  } catch {
    // lookup tool failed or binary not found in current PATH
  }

  // 3. Check fallback standard installation directories
  const fallbacks = getStandardCandidates(cmdName);
  for (const candidate of fallbacks) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Helper to determine if a command is a Windows batch/cmd shim requiring shell: true.
 * @param {string} exePath
 * @returns {boolean}
 */
export function isWindowsBatchShim(exePath) {
  if (!isWin || !exePath) return false;
  const lower = exePath.toLowerCase();
  return lower.endsWith(".cmd") || lower.endsWith(".bat");
}
