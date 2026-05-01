import { execSync } from "child_process";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, extname } from "path";

export function shell(cmd: string, timeout = 30_000): string {
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    return (e.stdout ?? "") + (e.stderr ?? "");
  }
}

export interface TscResult {
  passed: boolean;
  errorCount: number;
  firstError?: string;
}

export function runTsc(): TscResult {
  const output = shell("npx tsc --noEmit 2>&1", 180_000);
  if (!output.trim()) return { passed: true, errorCount: 0 };

  const lines = output.trim().split("\n");
  const errors = lines.filter((l) => l.includes("error TS"));
  if (errors.length === 0) return { passed: true, errorCount: 0 };

  return {
    passed: false,
    errorCount: errors.length,
    firstError: errors[0]?.trim().slice(0, 120),
  };
}

export function countTestsFromFiles(): { testCount: number; fileCount: number } {
  const raw = shell(
    "rg -c '(\\bit\\(|\\btest\\(|\\bit\\.each|\\btest\\.each)' tests/ --glob '*.test.ts' 2>/dev/null",
    15_000,
  );
  if (!raw) return { testCount: 0, fileCount: 0 };

  let testCount = 0;
  let fileCount = 0;
  for (const line of raw.split("\n").filter(Boolean)) {
    const match = line.match(/:(\d+)$/);
    if (match) {
      testCount += parseInt(match[1], 10);
      fileCount++;
    }
  }
  return { testCount, fileCount };
}

export interface FileCounts {
  files: number;
  lines: number;
}

export function countFiles(dir: string, exts: string[]): FileCounts {
  let files = 0;
  let lines = 0;

  function walk(d: string) {
    try {
      for (const entry of readdirSync(d)) {
        if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
        const full = join(d, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (exts.includes(extname(entry))) {
          files++;
          try {
            const content = readFileSync(full, "utf-8");
            lines += content.split("\n").length;
          } catch {
            /* skip unreadable files */
          }
        }
      }
    } catch {
      /* skip inaccessible dirs */
    }
  }

  walk(dir);
  return { files, lines };
}
