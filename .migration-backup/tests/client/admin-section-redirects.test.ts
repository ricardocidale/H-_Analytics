/**
 * Catch broken admin redirects before they ship (Task #448).
 *
 * `SECTION_REDIRECTS` in `client/src/components/admin/AdminSidebar.tsx`
 * maps legacy/alias section names to canonical ones. Without a guard, a
 * future edit could silently introduce:
 *   - a typo on the right-hand side that points an alias at a section
 *     that no longer exists,
 *   - a multi-hop redirect (alias → alias → canonical),
 *   - a redirect cycle, or
 *   - a target that no admin page actually renders.
 *
 * Any of those would deliver users to a blank page. This test walks
 * every key in `SECTION_REDIRECTS`, calls `resolveSection()`, and
 * asserts:
 *   1. The resolved value is itself NOT a key of `SECTION_REDIRECTS`
 *      (no multi-hop dead-ends and no cycles).
 *   2. The resolved target appears either as a section value in
 *      `buildNavGroups()` or as one of the canonical top-level sections
 *      handled by `Admin.tsx`'s `SectionContent` switch.
 *
 * Companion to `tests/client/admin-sidebar-structure.test.ts`, which
 * locks in the sidebar group/section shape itself.
 */
import { describe, it, expect } from "vitest";
import {
  SECTION_REDIRECTS,
  SPECIALIST_SECTION_TO_ID,
  buildNavGroups,
  resolveSection,
  type AdminSection,
} from "@/components/admin/AdminSidebar";

// Canonical top-level admin sections handled by the `case` arms of
// `SectionContent` in `client/src/pages/Admin.tsx`. If you add or remove
// a renderable case there, mirror the change here.
const ADMIN_TSX_RENDERABLE_SECTIONS: ReadonlySet<AdminSection> = new Set<AdminSection>([
  "model-defaults",
  "required-fields",
  "users",
  "activity",
  "scenarios",
  "brand",
  "exports",
  "ai-agents",
  "engine-dashboard",
  "data-sources",
  "pipeline-config",
  "qa-sandbox",
  "scheduled-research",
  "benchmarks",
  "analyst-tables",
  "vector-bench",
  "notifications",
  "sidebar-visibility",
  "verification",
  "database",
  "observability",
]);

function navGroupSectionValues(): Set<AdminSection> {
  const values = new Set<AdminSection>();
  for (const group of buildNavGroups()) {
    for (const section of group.sections) {
      values.add(section.value);
    }
  }
  return values;
}

describe("SECTION_REDIRECTS — no broken admin redirects", () => {
  const redirectKeys = Object.keys(SECTION_REDIRECTS) as AdminSection[];

  it("has at least one redirect to actually guard (sanity check)", () => {
    // If this drops to zero we want a deliberate decision rather than a
    // silent no-op suite.
    expect(redirectKeys.length).toBeGreaterThan(0);
  });

  it("every alias resolves in a single hop (no multi-hop dead-ends, no cycles)", () => {
    const offenders: string[] = [];
    for (const key of redirectKeys) {
      const resolved = resolveSection(key);
      if ((SECTION_REDIRECTS as Record<string, AdminSection | undefined>)[resolved] !== undefined) {
        offenders.push(`"${key}" → "${resolved}" (which is itself a redirect key)`);
      }
    }
    expect(
      offenders,
      `multi-hop or cyclic redirects detected: ${offenders.join("; ")}`,
    ).toEqual([]);
  });

  it("no alias resolves back to itself (cycle guard)", () => {
    const selfLoops: string[] = [];
    for (const key of redirectKeys) {
      if (resolveSection(key) === key) {
        selfLoops.push(key);
      }
    }
    expect(
      selfLoops,
      `redirect aliases that resolve to themselves: ${selfLoops.join(", ")}`,
    ).toEqual([]);
  });

  it("every resolved target is either rendered by Admin.tsx or listed in buildNavGroups()", () => {
    const navValues = navGroupSectionValues();
    const orphans: string[] = [];
    for (const key of redirectKeys) {
      const resolved = resolveSection(key);
      const renderable =
        ADMIN_TSX_RENDERABLE_SECTIONS.has(resolved) ||
        navValues.has(resolved) ||
        // Specialist sections render via Admin.tsx's default branch.
        (resolved as string) in SPECIALIST_SECTION_TO_ID;
      if (!renderable) {
        orphans.push(`"${key}" → "${resolved}"`);
      }
    }
    expect(
      orphans,
      `redirects whose target is neither rendered by Admin.tsx nor in buildNavGroups(): ${orphans.join("; ")}`,
    ).toEqual([]);
  });
});
