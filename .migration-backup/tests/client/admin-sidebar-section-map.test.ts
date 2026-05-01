/**
 * P6d contract test — `SPECIALIST_SECTION_TO_ID` is the single source of
 * truth for the section-key ↔ Specialist-catalog-id boundary.
 *
 * Catches the cross-check-invariants drift hazard where a Specialist is
 * added to `SPECIALIST_CATALOG` but not the sidebar map (or vice versa),
 * which would silently break navigation to the new Specialist's page.
 *
 * See: .claude/replit-handoffs/phase-6d-section-id-cross-check.md
 */
import { describe, it, expect } from "vitest";
import { SPECIALIST_SECTION_TO_ID } from "@/components/admin/AdminSidebar";
import { SPECIALIST_CATALOG } from "../../engine/analyst/registry/specialist-catalog";

describe("admin sidebar — SPECIALIST_SECTION_TO_ID", () => {
  const mapKeys = Object.keys(SPECIALIST_SECTION_TO_ID);
  const mapValues = Object.values(SPECIALIST_SECTION_TO_ID);
  const catalogIds = SPECIALIST_CATALOG.map((s) => s.id);

  it("every key matches the URL-safe dashed format `specialist-<subject>-<name>`", () => {
    const pattern = /^specialist-[a-z0-9-]+$/;
    for (const key of mapKeys) {
      expect(key, `key "${key}" violates URL-safe dashed format`).toMatch(pattern);
    }
  });

  it("every map value is a real Specialist id in SPECIALIST_CATALOG", () => {
    for (const value of mapValues) {
      expect(catalogIds, `map value "${value}" not present in SPECIALIST_CATALOG`).toContain(value);
    }
  });

  it("every Specialist in SPECIALIST_CATALOG has a sidebar map entry (no orphans)", () => {
    for (const id of catalogIds) {
      expect(mapValues, `catalog Specialist "${id}" has no sidebar section — unreachable from UI`).toContain(id);
    }
  });

  it("map keys and values are unique (strict bijection — no aliases, no duplicates)", () => {
    expect(new Set(mapKeys).size, "duplicate keys in SPECIALIST_SECTION_TO_ID").toBe(mapKeys.length);
    expect(new Set(mapValues).size, "duplicate values in SPECIALIST_SECTION_TO_ID — two sections aliasing the same Specialist").toBe(mapValues.length);
    expect(mapKeys.length, "sidebar map cardinality must match SPECIALIST_CATALOG cardinality").toBe(catalogIds.length);
  });

  it("the section→id transform is reversible: replacing dots with dashes in a catalog id produces its map key", () => {
    for (const id of catalogIds) {
      const expectedKey = `specialist-${id.replace(/\./g, "-")}`;
      expect(
        SPECIALIST_SECTION_TO_ID[expectedKey as keyof typeof SPECIALIST_SECTION_TO_ID],
        `expected key "${expectedKey}" to map back to "${id}"`,
      ).toBe(id);
    }
  });
});
