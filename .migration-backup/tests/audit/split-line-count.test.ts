import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { REPO_ROOT, listTsFilesRecursive } from "./_helpers/import-graph";

/**
 * Split-scope line-count guard.
 *
 * Each of the four split chains (intelligence-v2, data-routing,
 * risk-intelligence, icp-intelligence) was created to escape a single
 * monolithic file. Without a guard, those folders silently regrow into the
 * same problem one PR at a time.
 *
 * This test fails CI if any `.ts` file inside one of the four split scope
 * folders exceeds the line budget without an explicit allow directive on the
 * first 10 lines of the file:
 *
 *     // AUDIT-ALLOW-LARGE: <reason>
 *
 * The reason is required so future readers know why the file is exempt.
 *
 * Scope is intentionally narrow to the four split folders — this is not a
 * general "no large files anywhere" rule (those exist elsewhere in the
 * codebase for legitimate reasons). It only guards the surfaces the splits
 * were meant to keep small.
 */

const MAX_LINES = 500;

const SPLIT_SCOPES = [
  "server/storage/intelligence",
  "server/ai/data-routing",
  "server/ai/risk",
  "server/ai/icp",
] as const;

const ALLOW_DIRECTIVE_RE = /^\s*\/\/\s*AUDIT-ALLOW-LARGE\s*:\s*(.+\S)/;

function relToRepo(p: string): string {
  return path.relative(REPO_ROOT, p);
}

function fileLineCount(file: string): number {
  const src = fs.readFileSync(file, "utf-8");
  if (src.length === 0) return 0;
  // Count newline-terminated lines plus a trailing partial line if present.
  let count = 0;
  for (let i = 0; i < src.length; i++) {
    if (src.charCodeAt(i) === 0x0a /* \n */) count++;
  }
  if (src.charCodeAt(src.length - 1) !== 0x0a) count++;
  return count;
}

function hasAllowDirective(file: string): { allowed: boolean; reason: string | null } {
  const src = fs.readFileSync(file, "utf-8");
  // Allow the directive anywhere within the first ~10 source lines so it can
  // sit above the file's doc-block or just below it.
  const headLines = src.split(/\r?\n/, 10);
  for (const line of headLines) {
    const m = line.match(ALLOW_DIRECTIVE_RE);
    if (m) return { allowed: true, reason: m[1].trim() };
  }
  return { allowed: false, reason: null };
}

describe(`Split-scope line-count guard — files must be ≤${MAX_LINES} lines or carry AUDIT-ALLOW-LARGE`, () => {
  for (const scope of SPLIT_SCOPES) {
    const dir = path.resolve(REPO_ROOT, scope);

    it(`${scope}: exists`, () => {
      expect(
        fs.existsSync(dir),
        `Scope folder ${scope} is missing. If a split was renamed or removed, ` +
          `update SPLIT_SCOPES in tests/audit/split-line-count.test.ts.`,
      ).toBe(true);
    });

    if (!fs.existsSync(dir)) continue;

    const files = listTsFilesRecursive(dir);

    it(`${scope}: contains at least one source file`, () => {
      expect(files.length).toBeGreaterThan(0);
    });

    for (const file of files) {
      const rel = relToRepo(file);
      it(`${rel}: is ≤${MAX_LINES} lines or carries an AUDIT-ALLOW-LARGE directive`, () => {
        const lines = fileLineCount(file);
        if (lines <= MAX_LINES) return;
        const { allowed, reason } = hasAllowDirective(file);
        expect(
          allowed,
          `${rel} is ${lines} lines (limit ${MAX_LINES}). ` +
            `Either split it into focused submodules under ${scope}/, or — if the ` +
            `large size is structural (e.g. a generated table) — add the directive ` +
            `\`// AUDIT-ALLOW-LARGE: <reason>\` within the first 10 lines of the file ` +
            `explaining why it is exempt.`,
        ).toBe(true);
        // When allowed, surface the reason in the test name's failure path so
        // future readers can audit exemptions at a glance.
        expect(reason, `AUDIT-ALLOW-LARGE directive in ${rel} must include a reason`).toBeTruthy();
      });
    }
  }
});
