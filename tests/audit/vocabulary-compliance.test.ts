import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Vocabulary Compliance — ensures forbidden terms from the vocabulary skill
 * never appear in user-facing client code.
 */

const CLIENT_SRC = path.resolve(__dirname, "../../client/src");

function findFiles(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      results.push(...findFiles(full, ext));
    } else if (ext.some(e => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

const clientFiles = findFiles(CLIENT_SRC, [".tsx", ".ts"]);

// Exclude test files, manual sections (documentation may reference old terms for historical context)
const relevantFiles = clientFiles.filter(f =>
  !f.includes(".test.") &&
  !f.includes("__test") &&
  !f.includes("/checker-manual/")
);

describe("Vocabulary Compliance — Forbidden Terms", () => {
  const FORBIDDEN = [
    { term: "Regenerate Intelligence", replacement: "Ask the Analyst" },
    { term: "No Intelligence", replacement: "Not yet reviewed" },
    { term: "Ask the Analysts", replacement: "Ask the Analyst (singular)" },
  ];

  for (const { term, replacement } of FORBIDDEN) {
    it(`no "${term}" in client code (use "${replacement}")`, () => {
      const violations: string[] = [];
      for (const file of relevantFiles) {
        const content = fs.readFileSync(file, "utf-8");
        if (content.includes(term)) {
          const rel = path.relative(CLIENT_SRC, file);
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(term)) {
              violations.push(`${rel}:${i + 1}`);
            }
          }
        }
      }
      expect(violations, `Found "${term}" — use "${replacement}" instead:\n${violations.join("\n")}`).toHaveLength(0);
    });
  }
});
