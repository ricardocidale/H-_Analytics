import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * TypeScript Safety — Financial Calculation Paths
 *
 * Ensures no `as any` casts exist in financial calculation code.
 * These paths must be fully typed for correctness guarantees.
 */

const FINANCIAL_DIRS = [
  "client/src/lib/financial",
  "calc",
];

const FINANCIAL_FILES_STANDALONE = [
  "client/src/lib/financialEngine.ts",
  "client/src/lib/yearlyAggregator.ts",
  "client/src/lib/cashFlowAggregator.ts",
  "client/src/lib/equityCalculations.ts",
  "shared/constants.ts",
  "shared/dates.ts",
];

function getAllTsFiles(dir: string): string[] {
  const absDir = path.resolve(__dirname, "../..", dir);
  if (!fs.existsSync(absDir)) return [];
  const files: string[] = [];
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsFilesAbs(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

function getAllTsFilesAbs(absDir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsFilesAbs(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

const financialFiles: { relativePath: string; content: string }[] = [];

for (const dir of FINANCIAL_DIRS) {
  for (const file of getAllTsFiles(dir)) {
    const relativePath = path.relative(path.resolve(__dirname, "../.."), file);
    financialFiles.push({ relativePath, content: fs.readFileSync(file, "utf-8") });
  }
}

for (const file of FINANCIAL_FILES_STANDALONE) {
  const absPath = path.resolve(__dirname, "../..", file);
  if (fs.existsSync(absPath)) {
    financialFiles.push({ relativePath: file, content: fs.readFileSync(absPath, "utf-8") });
  }
}

describe("TypeScript Safety — No `as any` in financial calculation paths", () => {
  for (const { relativePath, content } of financialFiles) {
    it(`${relativePath} has no \`as any\` casts`, () => {
      const matches = [...content.matchAll(/as any/g)];
      expect(
        matches.length,
        `${relativePath} contains ${matches.length} \`as any\` cast(s). Financial code must be fully typed.`,
      ).toBe(0);
    });
  }
});

describe("TypeScript Safety — No @ts-ignore in financial paths", () => {
  for (const { relativePath, content } of financialFiles) {
    it(`${relativePath} has no @ts-ignore`, () => {
      expect(content).not.toContain("@ts-ignore");
    });
  }
});

describe("TypeScript Safety — No @ts-expect-error in financial paths", () => {
  for (const { relativePath, content } of financialFiles) {
    it(`${relativePath} has no @ts-expect-error`, () => {
      expect(content).not.toContain("@ts-expect-error");
    });
  }
});
