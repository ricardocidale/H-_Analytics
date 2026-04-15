import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Route Parameter Safety — ensures no route handler uses raw Number(req.params.*)
 * without parseRouteId. Raw Number() returns NaN for invalid strings.
 */

const ROUTES_DIR = path.resolve(__dirname, "../../server/routes");

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTsFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
      results.push(full);
    }
  }
  return results;
}

const routeFiles = findTsFiles(ROUTES_DIR);

describe("Route Parameter Safety — no raw Number(req.params)", () => {
  for (const file of routeFiles) {
    const rel = path.relative(ROUTES_DIR, file);
    it(`${rel}: uses parseRouteId instead of Number(req.params.*)`, () => {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      const violations: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match Number(req.params.anything) but not in comments
        if (/Number\(req\.params\./.test(line) && !line.trimStart().startsWith("//")) {
          violations.push(`  line ${i + 1}: ${line.trim()}`);
        }
      }

      expect(
        violations.length,
        `${rel} uses raw Number(req.params.*) — use parseRouteId() instead:\n${violations.join("\n")}`
      ).toBe(0);
    });
  }
});
