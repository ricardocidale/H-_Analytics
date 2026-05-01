import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * External Service Safety — all fetch() calls in server/integrations/
 * must include a signal: for timeout. Bare fetch() can hang indefinitely.
 */

const INTEGRATIONS_DIR = path.resolve(__dirname, "../../server/integrations");

describe("External Service Safety — no fetch() without timeout", () => {
  const files = fs.readdirSync(INTEGRATIONS_DIR)
    .filter(f => f.endsWith(".ts") && !f.includes(".test."))
    .map(f => path.join(INTEGRATIONS_DIR, f));

  for (const file of files) {
    const rel = path.basename(file);
    it(`${rel}: every fetch() call includes signal: for timeout`, () => {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      const violations: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Find lines with await fetch( that are not comments
        if (/await\s+fetch\(/.test(line) && !line.trimStart().startsWith("//")) {
          // Check this line and the next 5 lines for "signal:"
          const block = lines.slice(i, Math.min(i + 6, lines.length)).join("\n");
          if (!block.includes("signal:") && !block.includes("signal :")) {
            violations.push(`  line ${i + 1}: ${line.trim()}`);
          }
        }
      }

      expect(
        violations.length,
        `${rel} has fetch() calls without timeout signal:\n${violations.join("\n")}`
      ).toBe(0);
    });
  }
});
