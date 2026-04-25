/**
 * Phase 1 redirect-safety guard.
 *
 * Snapshots the full alias-resolution map for the admin sidebar so a
 * future restructure can't ship a deep link that lands on a blank page.
 *
 * Walks every alias source (the AdminSection union surface, every
 * SECTION_REDIRECTS key, every LEGACY_ADMIN_SECTION_REDIRECTS key
 * exposed via `normalizeAdminSection`, every SPECIALIST_SECTION_TO_ID
 * key, and every section listed in `buildNavGroups()`) and asserts each
 * resolves to a section that is actually rendered by `Admin.tsx`'s
 * `SectionContent` switch.
 *
 * If you add or remove a renderable admin section, update
 * `RENDERABLE_ADMIN_SECTIONS` below to match the `case` labels in
 * `client/src/pages/Admin.tsx#SectionContent`.
 */
import { describe, it, expect } from "vitest";
import {
  SECTION_REDIRECTS,
  SPECIALIST_SECTION_TO_ID,
  RESOURCES_LEGACY_SECTIONS,
  buildNavGroups,
  normalizeAdminSection,
  resolveSection,
  isResourcesLegacySection,
  type AdminSection,
} from "@/components/admin/AdminSidebar";

// Canonical sections rendered by `SectionContent` in `client/src/pages/Admin.tsx`.
// Specialist sections are handled by the default branch via
// `SPECIALIST_SECTION_TO_ID`, so they aren't listed here individually.
const RENDERABLE_ADMIN_SECTIONS: ReadonlySet<AdminSection> = new Set<AdminSection>([
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

function isRenderable(section: AdminSection): boolean {
  if (RENDERABLE_ADMIN_SECTIONS.has(section)) return true;
  // Specialist sections render via the default branch.
  return section in SPECIALIST_SECTION_TO_ID;
}

describe("admin redirects — guard & snapshot", () => {
  it("every alias in SECTION_REDIRECTS resolves to a renderable section", () => {
    for (const key of Object.keys(SECTION_REDIRECTS) as AdminSection[]) {
      const resolved = resolveSection(key);
      expect(
        isRenderable(resolved),
        `alias "${key}" resolves to "${resolved}" which has no renderer in Admin.tsx`,
      ).toBe(true);
    }
  });

  it("every section listed in the sidebar nav resolves to a renderable section", () => {
    for (const group of buildNavGroups()) {
      for (const section of group.sections) {
        const resolved = resolveSection(section.value);
        expect(
          isRenderable(resolved),
          `nav entry "${section.value}" (group "${group.id}") resolves to "${resolved}" which has no renderer`,
        ).toBe(true);
      }
    }
  });

  it("every Specialist section is rendered (Specialist catalog roundtrip)", () => {
    for (const sectionKey of Object.keys(SPECIALIST_SECTION_TO_ID)) {
      expect(
        isRenderable(sectionKey as AdminSection),
        `Specialist section "${sectionKey}" must be renderable`,
      ).toBe(true);
    }
  });

  it("`required-fields` is its own renderable canonical section (no longer a redirect)", () => {
    const resolved = resolveSection(normalizeAdminSection("required-fields"));
    expect(resolved).toBe("required-fields");
    expect(isRenderable(resolved)).toBe(true);
  });

  it("resources-* legacy keys are NOT swallowed by normalizeAdminSection (handled by setAdminSection)", () => {
    // After Phase 1, resources-* keys must be intercepted by `setAdminSection`
    // and routed to /ai-intelligence — they should NOT silently normalize to
    // an admin section any more.
    for (const key of RESOURCES_LEGACY_SECTIONS) {
      expect(isResourcesLegacySection(key)).toBe(true);
      // normalizeAdminSection passes them through unchanged because
      // LEGACY_ADMIN_SECTION_REDIRECTS no longer maps them.
      expect(normalizeAdminSection(key)).toBe(key);
    }
  });

  it("snapshot of the full alias → resolved-section map is locked", () => {
    const map: Record<string, AdminSection> = {};
    for (const key of Object.keys(SECTION_REDIRECTS).sort()) {
      map[key] = resolveSection(key as AdminSection);
    }
    expect(map).toMatchInlineSnapshot(`
      {
        "constants": "model-defaults",
        "default-assignments": "scenarios",
        "defaults-management-company": "model-defaults",
        "defaults-market-macro": "model-defaults",
        "defaults-property": "model-defaults",
        "llms": "data-sources",
        "logos": "brand",
        "sources": "data-sources",
        "themes": "brand",
      }
    `);
  });

});
