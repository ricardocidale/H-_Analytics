import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * FIELD_DEFINITIONS No-Prescription-Hints Guard
 *
 * Rule: .claude/rules/field-definitions-no-prescription-hints.md
 *
 * Enforces that FIELD_DEFINITIONS entries in server/ai/synthesis-schema.ts
 * do not carry numeric typical-range hints. Such hints cause Opus
 * prescription leakage under Vercel AI SDK structured output, producing
 * mode-collapsed per-market outputs (verbatim identical ranges across
 * all markets). See docs/operational-tooling/BLOCKED-ota3.md for the
 * full incident writeup.
 *
 * The test parses synthesis-schema.ts as text, extracts each
 * FIELD_DEFINITIONS entry, and checks its string content against the
 * banned patterns.
 */

const SYNTHESIS_PATH = path.resolve(__dirname, "../../server/ai/synthesis-schema.ts");

const BANNED_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  {
    pattern: /typical\s+\$?[\d,.]+\s*[–\-]\s*\$?[\d,.]+/i,
    label: 'range hint (e.g. "typical 8-15%", "typical $200K-$2M")',
  },
  {
    pattern: /e\.g\.,?\s+\$?[\d,.]+\s*[–\-]\s*\$?[\d,.]+/i,
    label: 'e.g. hint (e.g. "e.g., 24-36 months")',
  },
  {
    pattern: /typical\s+\d/i,
    label: '"typical " followed by a digit',
  },
];

/**
 * Extract FIELD_DEFINITIONS entries from synthesis-schema.ts by parsing the
 * `{ key: "...", ... }` object literal assigned to each canonical field.
 * Simple regex approach — good enough for a proof test, no full AST needed.
 */
function extractFieldEntries(src: string): Array<{ key: string; body: string }> {
  const defsStart = src.indexOf("export const FIELD_DEFINITIONS");
  if (defsStart === -1) {
    throw new Error("Could not locate FIELD_DEFINITIONS in synthesis-schema.ts");
  }
  const afterDefs = src.slice(defsStart);

  const entries: Array<{ key: string; body: string }> = [];
  // Match `keyName: { key: "keyName", ... },`
  // The entry body is the { ... } block
  const entryRe = /(\w+):\s*\{\s*key:\s*"(\w+)",([\s\S]*?)\}\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(afterDefs)) !== null) {
    const [, propertyKey, innerKey, body] = m;
    if (propertyKey !== innerKey) continue; // defensive: skip anything that isn't a FIELD_DEFINITIONS entry
    entries.push({ key: propertyKey, body });
  }
  return entries;
}

describe("FIELD_DEFINITIONS — no prescription hints", () => {
  const src = fs.readFileSync(SYNTHESIS_PATH, "utf-8");
  const entries = extractFieldEntries(src);

  it("extracted at least 30 FIELD_DEFINITIONS entries (sanity)", () => {
    // Current count is ~41; dropping below 30 means the parser broke
    expect(entries.length).toBeGreaterThanOrEqual(30);
  });

  it("no entry contains a numeric typical-range hint", () => {
    const violations: Array<{ key: string; pattern: string; matched: string }> = [];

    for (const { key, body } of entries) {
      for (const { pattern, label } of BANNED_PATTERNS) {
        const match = body.match(pattern);
        if (match) {
          violations.push({ key, pattern: label, matched: match[0] });
        }
      }
    }

    if (violations.length > 0) {
      const details = violations
        .map((v) => `  • ${v.key}: matched ${v.pattern}\n    "${v.matched}"`)
        .join("\n");
      throw new Error(
        `FIELD_DEFINITIONS prescription-hint violations detected:\n\n${details}\n\n` +
          `Why this fails: numeric typical-range hints cause Opus mode collapse under\n` +
          `Vercel AI SDK structured output. See docs/operational-tooling/BLOCKED-ota3.md.\n\n` +
          `To fix: replace the range with a per-market reasoning cue naming the actual\n` +
          `evidence sources (e.g. "Reason per-market from jurisdiction millage and\n` +
          `assessor allocations"). Add "do NOT emit a generic textbook X" for\n` +
          `rate-sensitive fields.\n\n` +
          `Rule: .claude/rules/field-definitions-no-prescription-hints.md`,
      );
    }
    expect(violations).toHaveLength(0);
  });
});
