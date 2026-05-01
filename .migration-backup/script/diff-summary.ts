/**
 * Diff Summary — compact git status + diff stats in ~5-10 lines.
 * Shows: branch, staged/unstaged/untracked counts, file-level diff stat.
 *
 * Usage: npm run diff:summary
 */
import { execSync } from "child_process";

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 10_000 }).trim();
  } catch {
    return "";
  }
}

const branch = run("git branch --show-current");
const status = run("git status --porcelain");

if (!status) {
  console.log(`${branch} — clean working tree`);
  process.exit(0);
}

const lines = status.split("\n").filter(Boolean);
const staged = lines.filter((l) => l[0] !== " " && l[0] !== "?").length;
const unstaged = lines.filter((l) => l[1] === "M" || l[1] === "D").length;
const untracked = lines.filter((l) => l.startsWith("??")).length;
const newFiles = lines.filter((l) => l.startsWith("A ") || l.startsWith("?? ")).map((l) => l.slice(3));

console.log(`${branch} — ${staged} staged, ${unstaged} unstaged, ${untracked} untracked`);
console.log("");

// Diff stat for tracked changes
const diffStat = run("git diff --stat HEAD 2>/dev/null") || run("git diff --stat 2>/dev/null");
if (diffStat) {
  // Show just the per-file lines + summary (last line)
  const diffLines = diffStat.split("\n").filter(Boolean);
  for (const line of diffLines) {
    console.log("  " + line.trim());
  }
}

// List new/untracked files
if (newFiles.length > 0) {
  for (const f of newFiles.slice(0, 10)) {
    console.log(`  ${f} (new)`);
  }
  if (newFiles.length > 10) {
    console.log(`  ... and ${newFiles.length - 10} more new files`);
  }
}
