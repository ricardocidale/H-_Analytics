/**
 * Domain Boundaries — proof test enforcing architectural separation.
 *
 * Verifies:
 * 1. No route file imports `db` directly (storage facade enforcement)
 * 2. No calc/ file imports from server/ (tool purity)
 * 3. Financial engine isolation from AI/media domains
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../..");

function readFile(path: string): string {
  return readFileSync(join(ROOT, path), "utf-8");
}

function listFilesRecursively(dir: string, ext = ".ts"): string[] {
  const fullDir = join(ROOT, dir);
  if (!existsSync(fullDir)) return [];
  const files: string[] = [];
  const entries = readdirSync(fullDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(entryPath, ext));
    } else if (entry.name.endsWith(ext)) {
      files.push(entryPath);
    }
  }
  return files;
}

describe("Domain Boundaries — Storage Facade Enforcement", () => {
  const routeFiles = listFilesRecursively("server/routes");

  it("no route file imports db directly", () => {
    const violations: string[] = [];
    for (const file of routeFiles) {
      const src = readFile(file);
      // Match: import { db } from "../db" or "../../db" etc.
      if (/import\s+\{[^}]*\bdb\b[^}]*\}\s+from\s+["'][^"']*\/db["']/.test(src)) {
        violations.push(file);
      }
    }
    expect(violations, `Routes importing db directly: ${violations.join(", ")}`).toEqual([]);
  });

  it("no route file imports drizzle-orm directly", () => {
    const violations: string[] = [];
    for (const file of routeFiles) {
      const src = readFile(file);
      if (/from\s+["']drizzle-orm["']/.test(src)) {
        // Allow type-only imports
        const lines = src.split("\n").filter(l =>
          /from\s+["']drizzle-orm["']/.test(l) && !/import\s+type/.test(l)
        );
        if (lines.length > 0) violations.push(file);
      }
    }
    expect(violations, `Routes importing drizzle-orm: ${violations.join(", ")}`).toEqual([]);
  });
});

describe("Domain Boundaries — Calc Tool Purity", () => {
  const calcFiles = listFilesRecursively("calc");

  it("no calc file imports from server/", () => {
    const violations: string[] = [];
    for (const file of calcFiles) {
      const src = readFile(file);
      if (/from\s+["'][^"']*server\//.test(src)) {
        violations.push(file);
      }
    }
    expect(violations, `Calc files importing from server/: ${violations.join(", ")}`).toEqual([]);
  });

  it("no calc file imports from client/", () => {
    const violations: string[] = [];
    for (const file of calcFiles) {
      const src = readFile(file);
      if (/from\s+["'][^"']*client\//.test(src)) {
        violations.push(file);
      }
    }
    expect(violations, `Calc files importing from client/: ${violations.join(", ")}`).toEqual([]);
  });
});

describe("Domain Boundaries — Financial Engine Isolation", () => {
  const financialFiles = [
    ...listFilesRecursively("calc/returns"),
    ...listFilesRecursively("calc/financing"),
    ...listFilesRecursively("calc/validation"),
    ...listFilesRecursively("calc/analysis"),
    ...listFilesRecursively("calc/services"),
  ];

  it("financial calc files never import AI services", () => {
    const bannedPatterns = [
      /from\s+["'][^"']*openai/i,
      /from\s+["'][^"']*anthropic/i,
    ];

    const violations: string[] = [];
    for (const file of financialFiles) {
      const src = readFile(file);
      for (const pattern of bannedPatterns) {
        if (pattern.test(src)) {
          violations.push(file);
          break;
        }
      }
    }
    expect(violations, `Financial files importing AI SDKs: ${violations.join(", ")}`).toEqual([]);
  });
});
