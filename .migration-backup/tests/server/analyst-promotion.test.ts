import { describe, it, expect } from "vitest";
import {
  ANALYST_FIELD_TO_PROPERTY_COLUMN,
  isColumnPromotable,
  promoteResearchValuesToProperty,
  recordPromotionProvenance,
  type PromotionResearchValues,
} from "../../server/ai/analyst-promotion";
import type { Property } from "@shared/schema";

/**
 * Build a minimal Property-shaped fixture. The real Property type has ~80
 * fields; for these tests we only care about the scalar columns the
 * promotion helper touches, so we cast through `Partial` + `as Property`.
 */
function makeProperty(overrides: Partial<Property> = {}): Property {
  const base: Partial<Property> = {
    id: 1,
    name: "Test Hotel",
    startAdr: null as unknown as number, // simulate fresh property with no scalar value yet
    adrGrowthRate: null as unknown as number,
    maxOccupancy: null as unknown as number,
    startOccupancy: null as unknown as number,
    occupancyGrowthStep: null as unknown as number,
    occupancyRampMonths: null as unknown as number,
    cateringBoostPercent: null as unknown as number,
    revShareFB: null as unknown as number,
    revShareEvents: null as unknown as number,
    revShareOther: null as unknown as number,
    exitCapRate: null as unknown as number,
    dispositionCommission: null as unknown as number,
    costRateRooms: null as unknown as number,
    costRateFB: null as unknown as number,
    costRateAdmin: null as unknown as number,
    costRateMarketing: null as unknown as number,
    costRatePropertyOps: null as unknown as number,
    costRateUtilities: null as unknown as number,
    costRateFFE: null as unknown as number,
    costRateIT: null as unknown as number,
    costRateOther: null as unknown as number,
    costRateTaxes: null as unknown as number,
    incentiveManagementFeeRate: null as unknown as number,
    taxRate: null as unknown as number,
    inflationRate: null,
    arDays: null as unknown as number,
    apDays: null as unknown as number,
    preOpeningCosts: null as unknown as number,
  };
  return { ...base, ...overrides } as Property;
}

function rv(entries: Record<string, { mid: number }>, extras: Partial<PromotionResearchValues> = {}): PromotionResearchValues {
  const out: PromotionResearchValues = {};
  for (const [k, v] of Object.entries(entries)) {
    out[k] = { display: String(v.mid), mid: v.mid, source: "ai" };
  }
  return { ...out, ...extras };
}

describe("ANALYST_FIELD_TO_PROPERTY_COLUMN mapping", () => {
  it("maps canonical research fields to valid Property column names", () => {
    // Spot-check the core mappings the plan called out
    expect(ANALYST_FIELD_TO_PROPERTY_COLUMN.adr).toBe("startAdr");
    expect(ANALYST_FIELD_TO_PROPERTY_COLUMN.occupancy).toBe("maxOccupancy");
    expect(ANALYST_FIELD_TO_PROPERTY_COLUMN.capRate).toBe("exitCapRate");
    expect(ANALYST_FIELD_TO_PROPERTY_COLUMN.costHousekeeping).toBe("costRateRooms");
    expect(ANALYST_FIELD_TO_PROPERTY_COLUMN.saleCommission).toBe("dispositionCommission");
    expect(ANALYST_FIELD_TO_PROPERTY_COLUMN.arDays).toBe("arDays");
    expect(ANALYST_FIELD_TO_PROPERTY_COLUMN.apDays).toBe("apDays");
  });

  it("omits the risky cross-domain fields", () => {
    // These have semantic mismatches with Property columns and must not map.
    expect(ANALYST_FIELD_TO_PROPERTY_COLUMN.ltv).toBeUndefined();
    expect(ANALYST_FIELD_TO_PROPERTY_COLUMN.interestRate).toBeUndefined();
    expect(ANALYST_FIELD_TO_PROPERTY_COLUMN.landValue).toBeUndefined();
    expect(ANALYST_FIELD_TO_PROPERTY_COLUMN.platformFee).toBeUndefined();
  });
});

describe("isColumnPromotable", () => {
  it("returns true when column is null", () => {
    const p = makeProperty({ inflationRate: null });
    expect(isColumnPromotable(p, "inflationRate", {})).toBe(true);
  });

  it("returns false when user-typed value is present and no provenance markers", () => {
    const p = makeProperty({ startAdr: 450 });
    expect(isColumnPromotable(p, "startAdr", {})).toBe(false);
  });

  it("returns true when column was filled by smart-defaults (_defaultSources)", () => {
    const p = makeProperty({ costRateRooms: 0.25 });
    const values: PromotionResearchValues = {
      _defaultSources: { costRateRooms: "model:hotel" },
    };
    expect(isColumnPromotable(p, "costRateRooms", values)).toBe(true);
  });

  it("returns true when column was previously promoted by the Analyst (_promoted)", () => {
    const p = makeProperty({ startAdr: 310 });
    const values: PromotionResearchValues = { _promoted: ["startAdr"] };
    expect(isColumnPromotable(p, "startAdr", values)).toBe(true);
  });
});

describe("promoteResearchValuesToProperty", () => {
  it("promotes every mapped field on a fresh (all-null) property", () => {
    const property = makeProperty();
    const values = rv({
      adr: { mid: 285 },
      occupancy: { mid: 0.72 },
      capRate: { mid: 0.075 },
      costHousekeeping: { mid: 0.27 },
      saleCommission: { mid: 0.025 },
    });
    const { patch, promotedFields, skipped } = promoteResearchValuesToProperty(property, values);

    expect(patch).toEqual({
      startAdr: 285,
      maxOccupancy: 0.72,
      exitCapRate: 0.075,
      costRateRooms: 0.27,
      dispositionCommission: 0.025,
    });
    expect(promotedFields.sort()).toEqual(
      ["costRateRooms", "dispositionCommission", "exitCapRate", "maxOccupancy", "startAdr"],
    );
    expect(skipped).toEqual([]);
  });

  it("does NOT overwrite a user-set scalar column (no provenance marker)", () => {
    const property = makeProperty({ startAdr: 450 }); // user-typed
    const values = rv({ adr: { mid: 285 }, occupancy: { mid: 0.72 } });
    const { patch, promotedFields, skipped } = promoteResearchValuesToProperty(property, values);

    expect(patch).toEqual({ maxOccupancy: 0.72 });
    expect(promotedFields).toEqual(["maxOccupancy"]);
    expect(skipped).toContainEqual({ field: "adr", reason: "not-eligible" });
  });

  it("overwrites a column that was smart-defaulted (_defaultSources marker)", () => {
    const property = makeProperty({ costRateRooms: 0.25 });
    const values = rv(
      { costHousekeeping: { mid: 0.27 } },
      { _defaultSources: { costRateRooms: "model:hotel" } },
    );
    const { patch, promotedFields } = promoteResearchValuesToProperty(property, values);

    expect(patch).toEqual({ costRateRooms: 0.27 });
    expect(promotedFields).toEqual(["costRateRooms"]);
  });

  it("skips entries with no mid, NaN, or Infinity", () => {
    const property = makeProperty();
    const values: PromotionResearchValues = {
      adr: { display: "—", mid: null, source: "ai" },
      occupancy: { display: "NaN", mid: NaN, source: "ai" },
      capRate: { display: "Inf", mid: Infinity, source: "ai" },
      costHousekeeping: { display: "0.27", mid: 0.27, source: "ai" },
    };
    const { patch, promotedFields, skipped } = promoteResearchValuesToProperty(property, values);

    expect(patch).toEqual({ costRateRooms: 0.27 });
    expect(promotedFields).toEqual(["costRateRooms"]);
    expect(skipped).toContainEqual({ field: "adr", reason: "no-mid" });
    expect(skipped).toContainEqual({ field: "occupancy", reason: "not-finite" });
    expect(skipped).toContainEqual({ field: "capRate", reason: "not-finite" });
  });

  it("ignores canonical fields that are intentionally unmapped", () => {
    const property = makeProperty();
    const values = rv({
      ltv: { mid: 0.6 },          // not mapped — must be ignored
      landValue: { mid: 2_500_000 },// not mapped — must be ignored
      adr: { mid: 285 },            // mapped — must promote
    });
    const { patch, promotedFields, skipped } = promoteResearchValuesToProperty(property, values);

    expect(patch).toEqual({ startAdr: 285 });
    expect(promotedFields).toEqual(["startAdr"]);
    expect(skipped.map(s => s.field).sort()).toEqual(["landValue", "ltv"]);
    expect(skipped.every(s => s.reason === "no-column" || ["ltv", "landValue"].includes(s.field))).toBe(true);
  });

  it("ignores the internal _defaultSources and _promoted provenance keys", () => {
    const property = makeProperty();
    const values: PromotionResearchValues = {
      adr: { display: "285", mid: 285, source: "ai" },
      _defaultSources: { startAdr: "model:hotel" },
      _promoted: ["costRateRooms"],
    };
    const { patch, promotedFields, skipped } = promoteResearchValuesToProperty(property, values);

    expect(patch).toEqual({ startAdr: 285 });
    expect(promotedFields).toEqual(["startAdr"]);
    // Internal keys must never show up in skipped either
    expect(skipped.map(s => s.field)).not.toContain("_defaultSources");
    expect(skipped.map(s => s.field)).not.toContain("_promoted");
  });

  it("returns empty patch for null/undefined researchValues", () => {
    const property = makeProperty();
    expect(promoteResearchValuesToProperty(property, null)).toEqual({
      patch: {},
      promotedFields: [],
      skipped: [],
    });
    expect(promoteResearchValuesToProperty(property, undefined)).toEqual({
      patch: {},
      promotedFields: [],
      skipped: [],
    });
  });
});

describe("recordPromotionProvenance", () => {
  it("adds new _promoted entries and deduplicates with existing", () => {
    const values: PromotionResearchValues = { _promoted: ["startAdr"] };
    const out = recordPromotionProvenance(values, ["startAdr", "maxOccupancy", "costRateRooms"]);
    expect(out._promoted).toEqual(["startAdr", "maxOccupancy", "costRateRooms"]);
  });

  it("is a no-op when nothing was promoted", () => {
    const values: PromotionResearchValues = { _promoted: ["startAdr"] };
    const out = recordPromotionProvenance(values, []);
    expect(out).toBe(values);
  });

  it("initializes _promoted when it did not previously exist", () => {
    const out = recordPromotionProvenance({}, ["startAdr"]);
    expect(out._promoted).toEqual(["startAdr"]);
  });
});
