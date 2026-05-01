import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Admin + AI Intelligence Surface Coverage
 *
 * Static analysis that catches the failure modes documented in
 * `.claude/audits/admin-intelligence-inventory.md`:
 *
 *   T1. Dead routes — sidebar entry that points to no rendered component
 *   T2. Specialist tab form-input drift — new edit affordances on
 *       Specialist tabs that should be read-only per
 *       `specialists-are-dev-defined-only.md`
 *   T3. Dual mounts — two sidebar entries rendering the same component
 *       with the same props (the "Knowledge Base" / "Conversations" bug)
 *
 * Each test maintains a baseline allow-list of CURRENT violations so
 * the test passes today. The allow-list shrinks as remediation lands,
 * driven toward [] over time. New violations beyond the baseline fail
 * immediately. This is the same ratchet pattern used by
 * `tests/proof/orphan-files.test.ts` and `tests/proof/any-prop-detector.test.ts`.
 */

const REPO = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(REPO, rel), "utf-8");
}

// ────────────────────────────────────────────────────────────────────
// T1 — Every sidebar `value:` resolves to a real `case "<value>":` branch.
// ────────────────────────────────────────────────────────────────────

function extractSidebarValues(content: string): string[] {
  // Match `value: "kebab-case-id"` in object literals
  const matches = [...content.matchAll(/value:\s*"([a-z][a-z0-9-]*)"/g)];
  return [...new Set(matches.map(m => m[1]))];
}

function extractCaseLabels(content: string): string[] {
  const matches = [...content.matchAll(/case\s+"([a-z][a-z0-9-]*)":/g)];
  return [...new Set(matches.map(m => m[1]))];
}

function extractRedirectKeys(redirectMapContent: string): Set<string> {
  // Match keys like `"foo": "bar"` inside SECTION_REDIRECTS
  const matches = [...redirectMapContent.matchAll(/"([a-z][a-z0-9-]*)"\s*:\s*"[a-z][a-z0-9-]*"/g)];
  return new Set(matches.map(m => m[1]));
}

describe("admin-surface coverage T1 — no dead sidebar routes", () => {
  it("every Admin sidebar value either has a `case` branch or a redirect", () => {
    const sidebar = read("client/src/components/admin/AdminSidebar.tsx");
    const page = read("client/src/pages/Admin.tsx");

    const sidebarValues = extractSidebarValues(sidebar);
    const caseLabels = new Set(extractCaseLabels(page));

    // Pull SECTION_REDIRECTS keys — those forward to a canonical case.
    const redirectBlock = sidebar.match(/SECTION_REDIRECTS[^{]*\{([\s\S]*?)\};/)?.[1] ?? "";
    const redirects = extractRedirectKeys(redirectBlock);

    // Specialist sections all route through one case-statement that
    // matches by SPECIALIST_SECTION_TO_ID lookup, not literal case.
    const isSpecialistSection = (v: string) => v.startsWith("specialist-");

    const dead = sidebarValues.filter(v =>
      !caseLabels.has(v) && !redirects.has(v) && !isSpecialistSection(v),
    );

    expect(
      dead,
      `Admin sidebar entries with no \`case "${dead[0] ?? ""}":\` branch and no redirect: ${dead.join(", ")}`,
    ).toEqual([]);
  });

  it("every AI Intelligence sidebar value either has a `case` branch or is a Specialist section", () => {
    const sidebar = read("client/src/components/ai-intelligence/AiIntelligenceSidebar.tsx");
    const page = read("client/src/pages/AiIntelligence.tsx");

    const sidebarValues = extractSidebarValues(sidebar);
    const caseLabels = new Set(extractCaseLabels(page));

    const isSpecialistSection = (v: string) => v.startsWith("specialist-");

    const dead = sidebarValues.filter(v => !caseLabels.has(v) && !isSpecialistSection(v));

    expect(
      dead,
      `AI Intelligence sidebar entries with no resolution: ${dead.join(", ")}`,
    ).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────
// T2 — Specialist tab form-input drift.
//
// Per `specialists-are-dev-defined-only.md` §3, admins cannot edit
// Specialist persona, prompts, models, field requirements, or routing
// at runtime. The 4 tabs below currently violate this rule
// (documented in `.claude/audits/admin-intelligence-inventory.md`).
//
// The baseline counts each tab's CURRENT input/select/textarea
// occurrences. Adding new edit affordances pushes the count up and
// fails the test. Removing them (the remediation) drops the count;
// when remediation lands, lower the baseline.
// ────────────────────────────────────────────────────────────────────

const SPECIALIST_TABS = [
  "client/src/pages/admin/specialist/tabs/IdentityTab.tsx",
  "client/src/pages/admin/specialist/tabs/RequiredFieldsTab.tsx",
  "client/src/pages/admin/specialist/tabs/LlmConfigTab.tsx",
  "client/src/pages/admin/specialist/tabs/RuntimeTab.tsx",
] as const;

function countEditAffordances(content: string): number {
  // Count form-input tags. Hits on read-only display markup are filtered
  // by checking for `disabled` / `readonly` attributes — those don't count.
  const inputs = [...content.matchAll(/<(Input|Textarea|Select(?:Trigger)?|Switch|Slider|Checkbox|RadioGroup)\b([^>]*)>/g)];
  return inputs.filter(m => {
    const attrs = m[2];
    return !/(\bdisabled\b|\breadOnly\b|\breadonly\b)(?!\s*=\s*\{?\s*false)/.test(attrs);
  }).length;
}

const SPECIALIST_TAB_BASELINE: Record<string, number> = {
  // Baseline lowered 2026-05-01 by admin-cleanup-specialist-readonly packet.
  // Per `.claude/rules/specialists-are-dev-defined-only.md` §3, admins
  // cannot edit Specialist persona, prompts, models, field requirements,
  // or routing — these tabs are now read-only display.
  "client/src/pages/admin/specialist/tabs/IdentityTab.tsx": 0,
  "client/src/pages/admin/specialist/tabs/RequiredFieldsTab.tsx": 0,
  "client/src/pages/admin/specialist/tabs/LlmConfigTab.tsx": 0,
  // RuntimeTab.tsx baseline is 2 because the file also exports CadenceCard,
  // which has 2 editable Inputs (refresh-cadence days + change-summary).
  // Scheduling cadence is OUTSIDE the dev-defined-only rule (which scopes
  // to persona, prompts, models, field requirements, and routing) so it
  // remains admin-tunable. The RuntimeTab function itself is now 0
  // edit-affordances (was: Textarea + Input + Save Button).
  "client/src/pages/admin/specialist/tabs/RuntimeTab.tsx": 2,
};

describe("admin-surface coverage T2 — Specialist tabs are read-only per rule", () => {
  for (const tabPath of SPECIALIST_TABS) {
    it(`${path.basename(tabPath)} edit affordances do not exceed baseline`, () => {
      if (!fs.existsSync(path.join(REPO, tabPath))) {
        // Tab deleted (good — that's the ultimate remediation).
        return;
      }
      const content = read(tabPath);
      const count = countEditAffordances(content);
      const baseline = SPECIALIST_TAB_BASELINE[tabPath];
      expect(
        count,
        `${tabPath} has ${count} edit affordances; baseline allows ${baseline}. ` +
          `Per specialists-are-dev-defined-only.md, adding new edit affordances on Specialist tabs is a rule violation. ` +
          `If you intended to REDUCE the count (remediation), lower the baseline in this file.`,
      ).toBeLessThanOrEqual(baseline);
    });
  }
});

// ────────────────────────────────────────────────────────────────────
// T3 — Dual mounts: two sidebar entries returning the same component.
// ────────────────────────────────────────────────────────────────────

function extractCaseToReturn(content: string): Map<string, string> {
  // Pull each `case "x": return <Y ...>;` and normalize the JSX to its
  // component name + sorted attribute list. Two cases with the same
  // normalized form are a dual mount.
  const pattern = /case\s+"([a-z][a-z0-9-]*)":\s*return\s*(<[A-Z][^;]*?\/?>);/g;
  const out = new Map<string, string>();
  for (const m of content.matchAll(pattern)) {
    out.set(m[1], normalizeJsx(m[2]));
  }
  return out;
}

function normalizeJsx(jsx: string): string {
  // Strip whitespace + sort attributes so `<X a={1} b={2}/>` and
  // `<X b={2} a={1} />` compare equal.
  const trimmed = jsx.replace(/\s+/g, " ").trim();
  const compMatch = trimmed.match(/<(\w+)([^/>]*)\/?>/);
  if (!compMatch) return trimmed;
  const [, name, attrsRaw] = compMatch;
  const attrs = [...attrsRaw.matchAll(/(\w+)(?:=\{[^}]+\}|="[^"]*")?/g)]
    .map(m => m[0])
    .sort()
    .join(" ");
  return `<${name} ${attrs}>`;
}

const KNOWN_DUAL_MOUNTS: Record<string, Set<string>> = {
  // Documented in admin-intelligence-inventory.md as dual-mount UX bugs
  // pending remediation. Empty set after fix.
  "AiIntelligence.tsx": new Set(["ai-agents"]),
};

describe("admin-surface coverage T3 — no dual mounts", () => {
  it("Admin.tsx has no two cases returning the same component+props", () => {
    const content = read("client/src/pages/Admin.tsx");
    const caseToReturn = extractCaseToReturn(content);

    const byReturn = new Map<string, string[]>();
    for (const [c, ret] of caseToReturn) {
      if (!byReturn.has(ret)) byReturn.set(ret, []);
      byReturn.get(ret)!.push(c);
    }

    const known = KNOWN_DUAL_MOUNTS["Admin.tsx"] ?? new Set();
    const dupes = [...byReturn.entries()]
      .filter(([, cases]) => cases.length > 1)
      .map(([, cases]) => cases.filter(c => !known.has(c)))
      .filter(cases => cases.length > 1);

    expect(
      dupes,
      `Admin.tsx dual-mounts (same component, multiple sidebar entries): ${JSON.stringify(dupes)}`,
    ).toEqual([]);
  });

  it("AiIntelligence.tsx dual-mounts do not exceed documented baseline", () => {
    const content = read("client/src/pages/AiIntelligence.tsx");
    const caseToReturn = extractCaseToReturn(content);

    const byReturn = new Map<string, string[]>();
    for (const [c, ret] of caseToReturn) {
      if (!byReturn.has(ret)) byReturn.set(ret, []);
      byReturn.get(ret)!.push(c);
    }

    const known = KNOWN_DUAL_MOUNTS["AiIntelligence.tsx"] ?? new Set();
    const dupes = [...byReturn.entries()]
      .filter(([, cases]) => cases.length > 1)
      .flatMap(([, cases]) => cases.filter(c => !known.has(c)));

    expect(
      dupes,
      `AiIntelligence.tsx introduces NEW dual-mounts beyond the documented baseline (${[...known].join(", ")}): ${dupes.join(", ")}`,
    ).toEqual([]);
  });
});
