import { describe, it, expect } from "vitest";
import { SPECIALIST_CATALOG } from "../../engine/analyst/registry/specialist-catalog";
import { properties } from "../../shared/schema/properties";

describe("Specialist catalog — locked-hard candidate keys are canonical entity columns", () => {
  it("every property-subject lockedHard candidate field key exists on the properties table", () => {
    const propertyColumnKeys = new Set(Object.keys(properties));
    const violations: { specialistId: string; key: string }[] = [];
    for (const spec of SPECIALIST_CATALOG) {
      if (spec.subject !== "property") continue;
      for (const f of spec.candidateFields ?? []) {
        if (!f.lockedHard) continue;
        if (f.surface !== "property-edit") continue;
        if (!propertyColumnKeys.has(f.key)) {
          violations.push({ specialistId: spec.id, key: f.key });
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
