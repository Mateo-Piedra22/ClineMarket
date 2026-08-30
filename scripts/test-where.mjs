import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileP = promisify(execFile);

const { stdout } = await execFileP("where", ["cline"], { windowsHide: true });
const lines = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
console.log("all paths:");
for (const l of lines) console.log("  ", l);
const preferred = lines.find((l) => l.endsWith(".cmd")) || lines[0];
console.log("\npreferred:", preferred);