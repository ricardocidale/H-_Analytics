import { describe, it, expect } from "vitest";
import { collectMissingLockedHardFields } from "../../client/src/lib/locked-hard-preflight";
import { getLockedHardCandidateFields } from "../../engine/analyst/registry/specialist-catalog";

describe("Locked-hard preflight flow — block, fill, retry parity", () => {
  const propertySpecialists = [
    "property.risk-intelligence",
    "property.executive-summary",
  ] as const;

  it("blocks when locked-hard fields are missing", () => {
    const incomplete = { name: "", country: null, hospitalityType: undefined };
    const missing = collectMissingLockedHardFields(propertySpecialists, incomplete);
    expect(missing.length).toBeGreaterThan(0);
    const keys = new Set(missing.map((m) => m.key));
    expect(keys.has("name")).toBe(true);
    expect(keys.has("country")).toBe(true);
    expect(keys.has("hospitalityType")).toBe(true);
  });

  it("clears the gate once every locked-hard field has a real value", () => {
    const filled = {
      name: "Hotel Test",
      country: "US",
      hospitalityType: "hotel",
    };
    const missing = collectMissingLockedHardFields(propertySpecialists, filled);
    expect(missing).toEqual([]);
  });

  it("each missing field returns a deep-link surface and anchor", () => {
    const empty: Record<string, unknown> = {};
    const missing = collectMissingLockedHardFields(propertySpecialists, empty);
    for (const m of missing) {
      expect(m.surface).toBe("property-edit");
      expect(typeof m.surfaceAnchor === "string" && m.surfaceAnchor.length > 0).toBe(true);
    }
  });

  it("client preflight set matches catalog locked-hard set per specialist", () => {
    for (const sid of propertySpecialists) {
      const lockedFromCatalog = getLockedHardCandidateFields(sid).map((f) => f.key).sort();
      const missingOnEmpty = collectMissingLockedHardFields([sid], {})
        .map((m) => m.key)
        .sort();
      expect(missingOnEmpty).toEqual(lockedFromCatalog);
    }
  });
});
