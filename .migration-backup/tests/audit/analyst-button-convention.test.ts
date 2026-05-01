import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard: every research-trigger button in client/src/ MUST present as the
 * canonical Analyst affordance — Sparkles icon + "Analyst" label.
 *
 * Forbidden patterns scanned by ripgrep (rule lives in
 * `.agents/skills/analyst-research-buttons/SKILL.md` and the top-level
 * doctrine entry in `replit.md`):
 *
 *   1. The literal label `>Refresh research<` / `>Refresh Research<`.
 *   2. A `data-testid="button-refresh-research-…"` on a button (rename to
 *      `button-analyst-…`).
 *
 * If a surface legitimately needs a non-Analyst refresh affordance (a pure
 * cache-bust that does NOT call into The Analyst or any specialist), add
 * its file path to ALLOWED_FILES below with a one-line justification.
 */
const ALLOWED_FILES: Array<{ path: string; reason: string }> = [
  // (none today — all current research triggers use the Analyst affordance)
];

/**
 * The patterns below are the high-signal ones we can statically detect without
 * false positives. The full doctrine (forbidden labels: Refresh / Run / Run now
 * / Re-fetch / Update from source; forbidden lead icons: RefreshCw / Play /
 * Zap) is necessarily broader than what a static grep can safely enforce —
 * those words appear legitimately throughout the app on non-research surfaces.
 * The skill `.agents/skills/analyst-research-buttons/SKILL.md` is the
 * authoritative rule and is auto-loaded whenever an agent touches a
 * research-trigger UI control; this guard is the safety net for the most
 * common regression — labels and test-ids that explicitly say
 * "refresh research".
 */
const FORBIDDEN_PATTERNS: Array<{ pattern: string; description: string }> = [
  {
    pattern: String.raw`>\s*Refresh research\s*<`,
    description: 'Button label ">Refresh research<" — replace with ">Analyst<".',
  },
  {
    pattern: String.raw`>\s*Refresh Research\s*<`,
    description: 'Button label ">Refresh Research<" — replace with ">Analyst<".',
  },
  {
    // Catches popover / section headings that still say "Refresh research — X".
    pattern: String.raw`Refresh research\s+[—-]`,
    description:
      'Header "Refresh research — …" — replace with "Analyst — …".',
  },
  {
    // Matches double-quoted, single-quoted, and backtick-template variants.
    pattern: 'data-testid=[`"\']button-refresh-research',
    description:
      'data-testid="button-refresh-research-…" — rename to "button-analyst-…".',
  },
  {
    // Catches sibling regressions where the verb is reworded but the testid
    // still leaks the old vocabulary on a research trigger.
    pattern: 'data-testid=[`"\']button-(rerun|refetch)-research',
    description:
      'data-testid="button-{rerun,refetch}-research-…" — rename to "button-analyst-…".',
  },
];

interface Hit {
  file: string;
  line: number;
  text: string;
  description: string;
}

function rgScan(pattern: string): Array<{ file: string; line: number; text: string }> {
  const res = spawnSync(
    "rg",
    [
      "--no-heading",
      "--with-filename",
      "--line-number",
      "--color=never",
      "-e",
      pattern,
      "--",
      "client/src",
    ],
    { encoding: "utf8" },
  );
  if (res.status !== 0 && res.status !== 1) {
    throw new Error(`ripgrep failed for pattern ${pattern}: ${res.stderr || res.stdout}`);
  }
  if (!res.stdout) return [];
  const out: Array<{ file: string; line: number; text: string }> = [];
  for (const line of res.stdout.split("\n")) {
    if (!line) continue;
    const firstColon = line.indexOf(":");
    if (firstColon === -1) continue;
    const secondColon = line.indexOf(":", firstColon + 1);
    if (secondColon === -1) continue;
    out.push({
      file: line.slice(0, firstColon),
      line: Number(line.slice(firstColon + 1, secondColon)),
      text: line.slice(secondColon + 1).trim(),
    });
  }
  return out;
}

function isAllowed(file: string): boolean {
  return ALLOWED_FILES.some((entry) => entry.path === file);
}

describe("Analyst research-button convention guard", () => {
  it("no forbidden labels or test-ids appear on research-trigger buttons in client/src", () => {
    const violations: Hit[] = [];
    for (const { pattern, description } of FORBIDDEN_PATTERNS) {
      for (const hit of rgScan(pattern)) {
        if (isAllowed(hit.file)) continue;
        violations.push({ ...hit, description });
      }
    }

    if (violations.length > 0) {
      const summary = violations
        .map((v) => `  ${v.file}:${v.line}  ${v.description}\n    ${v.text}`)
        .join("\n");
      throw new Error(
        `${violations.length} Analyst-button-convention violation(s):\n${summary}\n\n` +
          'Rule: research-trigger buttons render with the "Analyst" label and the Sparkles icon. ' +
          "See .agents/skills/analyst-research-buttons/SKILL.md.",
      );
    }
    expect(violations).toEqual([]);
  });

  it("the canonical AnalystActionButton component still exists", () => {
    const path = resolve("client/src/components/analyst/AnalystActionButton.tsx");
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, "utf-8");
    // Both pieces of the contract live in the canonical component.
    expect(src).toMatch(/from ["']lucide-react["']/);
    expect(src).toMatch(/Sparkles/);
    expect(src).toMatch(/label\s*=\s*["']Analyst["']/);
    expect(src).toMatch(/Studying…|Studying\.\.\./);
  });

  it("the doctrine rule and skill are both in place", () => {
    expect(existsSync(resolve(".agents/skills/analyst-research-buttons/SKILL.md"))).toBe(true);
    const replitMd = readFileSync(resolve("replit.md"), "utf-8");
    expect(replitMd).toMatch(/Research-trigger buttons say "Analyst" with the sparkle icon/);
  });
});
