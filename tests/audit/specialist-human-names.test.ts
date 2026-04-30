import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

/**
 * Guard: Specialist human codenames (Gaspar, Ana, Bia, Cecília, Daniela,
 * Eloá, Fernanda, Giovanna, Helena, Isadora, Júlia, Kamila, Letícia) MUST
 * NOT appear in user-facing client/src/* files. Per the binding product
 * instruction (task #769), the app addresses agents by ROLE in user-facing
 * copy ("The Analyst", "The Funding Specialist", "The Tax Specialist",
 * etc.) and never by their internal human name.
 *
 * Admin-only surfaces (the AI Intelligence realm and the /admin pages) are
 * exempt because the human names are useful for operator clarity in audit
 * tables, runtime tabs, and internal logs.
 *
 * Brand voice rule: see `.claude/brand-voice-guidelines.md` §6 ("Canonical
 * Names" — Specialist human names are internal-only).
 */

/**
 * The 13 known Specialist human names declared in
 * `engine/analyst/registry/specialist-catalog.ts` plus the orchestrator
 * persona in `engine/analyst/identity.ts`.
 *
 * Names are matched with ripgrep word boundaries so common substrings
 * ("Ana" inside "Analyst", "Bia" inside arbitrary identifiers) don't
 * trip the check.
 */
const SPECIALIST_HUMAN_NAMES = [
  "Gaspar",
  "Ana",
  "Bia",
  "Cecília",
  "Daniela",
  "Eloá",
  "Fernanda",
  "Giovanna",
  "Helena",
  "Isadora",
  "Júlia",
  "Kamila",
  "Letícia",
] as const;

/**
 * Admin-only path prefixes. Files under these paths are allowed to
 * reference Specialists by their human name because they're operator
 * surfaces (audit tables, runtime tabs, identity overrides, etc.) — not
 * end-user copy. Paths are matched as prefixes against the file path
 * returned by ripgrep (which is relative to repo root).
 */
const ADMIN_PATH_PREFIXES = [
  "client/src/pages/admin/",
  "client/src/components/admin/",
  "client/src/pages/Admin.tsx",
  "client/src/pages/AiIntelligence.tsx",
  "client/src/pages/ai-intelligence/",
  "client/src/components/ai-intelligence/",
  // The canonical `<SpecialistName />` primitive and its barrel re-export
  // are the implementation that turns specialist ids into persona-first
  // strings for admin surfaces. Their JSDoc and palette comments
  // necessarily reference example human names ("Ana", "Fernanda",
  // "Gaspar", "Eloá") to document what the resolver returns. The
  // primitive itself never renders into front-of-app surfaces (those
  // continue to address agents by role per `front-of-app-admin-isolation`),
  // so the names in its source are docs/data, not user-facing copy.
  "client/src/components/specialists/",
];

interface Hit {
  file: string;
  line: number;
  text: string;
  name: string;
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

function isAdminPath(file: string): boolean {
  return ADMIN_PATH_PREFIXES.some((prefix) => file.startsWith(prefix));
}

describe("Specialist human names — user-facing copy guard", () => {
  it("no Specialist human name appears in non-admin client/src/* files", () => {
    const violations: Hit[] = [];
    for (const name of SPECIALIST_HUMAN_NAMES) {
      // Word-boundary match — ripgrep's \b respects Unicode word characters
      // so the accented names (Cecília, Eloá, Júlia, Letícia) are matched
      // as whole words too.
      const pattern = String.raw`\b` + name + String.raw`\b`;
      for (const hit of rgScan(pattern)) {
        if (isAdminPath(hit.file)) continue;
        violations.push({ ...hit, name });
      }
    }

    if (violations.length > 0) {
      const summary = violations
        .map((v) => `  ${v.file}:${v.line}  "${v.name}" leaked into user-facing copy\n    ${v.text}`)
        .join("\n");
      throw new Error(
        `${violations.length} Specialist-name leak(s) outside admin surfaces:\n${summary}\n\n` +
          'Rule: user-facing copy must address agents by role ("The Analyst", ' +
          '"The Funding Specialist", "The Tax Specialist", etc.) and never by ' +
          "their internal human codename. Admin-only surfaces under " +
          "client/src/pages/admin/, client/src/components/admin/, and the AI " +
          "Intelligence realm are exempt. See .claude/brand-voice-guidelines.md §6.",
      );
    }
    expect(violations).toEqual([]);
  });
});
