/**
 * T009 — parity guard for the Admin Model Defaults Analyst soft-gate.
 *
 * The soft-gate looks up guidance by `guidanceKey` and reads the draft by
 * `draftKey`. When the two drift apart (e.g. tab form was refactored to use
 * a prefixed `default…` key but the Analyst field list wasn't updated),
 * `computeAnalystViolations` silently no-ops. These tests lock the two in
 * place:
 *
 *   1. Every listed `draftKey` appears on a realistic Draft sample for
 *      that tab (catches typos + stale renames).
 *   2. Given a high-confidence guidance record whose band is violated by
 *      >20%, the helper returns `shouldInterrupt=true` AND the reported
 *      violation's `field` is the draft key — not the guidance key.
 */
import { describe, it, expect } from "vitest";
import {
  COMPANY_TAB_ANALYST_FIELDS,
  MARKET_MACRO_TAB_ANALYST_FIELDS,
  PROPERTY_UNDERWRITING_TAB_ANALYST_FIELDS,
  unionAnalystFieldSpecs,
  toGuidanceKeys,
  type AnalystFieldSpec,
} from "../../client/src/components/admin/model-defaults/analyst-fields";
import {
  computeAnalystViolations,
  ANALYST_VIOLATION_THRESHOLD,
} from "../../client/src/components/analyst/analyst-violations";
import type { AnalystGuidanceRecord } from "../../client/src/components/analyst/useAnalystRefresh";

// Realistic draft samples — keys mirror what the three ModelDefaults
// sub-tab forms emit through `onChange("…", v)`. If a form adds or
// renames a key, mirror it here so the parity check stays honest.
const COMPANY_DRAFT_SAMPLE: Record<string, number | string> = {
  companyName: "Test Co",
  companyOpsStartDate: "2025-01-01",
  projectionYears: 10,
  baseManagementFee: 0.03,
  incentiveManagementFee: 0.1,
  companyTaxRate: 0.21,
  costOfEquity: 0.18,
  exitCapRate: 0.08,
  salesCommissionRate: 0.02,
};

const MARKET_MACRO_DRAFT_SAMPLE: Record<string, number> = {
  inflationRate: 0.03,
  costOfEquity: 0.18,
  fiscalYearStartMonth: 1,
};

const PROPERTY_UNDERWRITING_DRAFT_SAMPLE: Record<string, number> = {
  defaultStartAdr: 180,
  defaultAdrGrowthRate: 0.03,
  defaultStartOccupancy: 0.65,
  defaultMaxOccupancy: 0.78,
  defaultOccupancyRampMonths: 24,
  defaultRoomCount: 80,
  defaultRevShareFb: 0.25,
  defaultRevShareEvents: 0.05,
  defaultRevShareOther: 0.02,
  defaultCateringBoostPct: 0.1,
  defaultCostRateRooms: 0.25,
  defaultCostRateFb: 0.7,
  defaultCostRateAdmin: 0.08,
  defaultCostRateMarketing: 0.05,
  defaultCostRatePropertyOps: 0.05,
  defaultCostRateUtilities: 0.035,
  defaultCostRateTaxes: 0.02,
  defaultCostRateIt: 0.01,
  defaultCostRateFfe: 0.04,
  defaultCostRateInsurance: 0.015,
  defaultCostRateOther: 0.01,
  depreciationYears: 39,
  defaultPropertyTaxRate: 0.015,
  defaultLandValuePercent: 0.2,
  inflationRate: 0.03,
};

let nextGuidanceId = 1;
function makeGuidance(
  guidanceKey: string,
  low: number,
  high: number,
): AnalystGuidanceRecord {
  return {
    id: nextGuidanceId++,
    assumptionKey: guidanceKey,
    valueLow: low,
    valueMid: (low + high) / 2,
    valueHigh: high,
    confidence: "high",
    reasoning: "test",
    sourceName: "test source",
    sourceDate: "2025-01-01",
  };
}

interface TabFixture {
  name: string;
  fields: readonly AnalystFieldSpec[];
  draft: Record<string, unknown>;
}

const FIXTURES: TabFixture[] = [
  {
    name: "CompanyTab",
    fields: COMPANY_TAB_ANALYST_FIELDS,
    draft: COMPANY_DRAFT_SAMPLE,
  },
  {
    name: "MarketMacroTab",
    fields: MARKET_MACRO_TAB_ANALYST_FIELDS,
    draft: MARKET_MACRO_DRAFT_SAMPLE,
  },
  {
    name: "PropertyUnderwritingTab",
    fields: PROPERTY_UNDERWRITING_TAB_ANALYST_FIELDS,
    draft: PROPERTY_UNDERWRITING_DRAFT_SAMPLE,
  },
];

describe("analyst-fields ↔ draft parity", () => {
  for (const { name, fields, draft } of FIXTURES) {
    describe(name, () => {
      it("every draftKey exists on the realistic draft sample", () => {
        for (const spec of fields) {
          expect(
            Object.prototype.hasOwnProperty.call(draft, spec.draftKey),
            `${name}: draftKey "${spec.draftKey}" (for guidanceKey "${spec.guidanceKey}") is missing from the sample draft — did the form rename this field?`,
          ).toBe(true);
        }
      });

      it("synthetic high-confidence violation triggers the gate and reports draftKey", () => {
        // Pick the first spec and build guidance whose band is far from the draft value.
        const spec = fields[0];
        if (!spec) return; // empty list (placeholder tabs) — nothing to assert.
        const current = Number(draft[spec.draftKey]);
        expect(Number.isFinite(current)).toBe(true);

        // Build a band that the current value is 50% above (well over the 20% threshold).
        const low = current * 0.4;
        const high = current * 0.6;
        const guidance = [makeGuidance(spec.guidanceKey, low, high)];

        const result = computeAnalystViolations({
          draft,
          guidance,
          fields: [spec],
        });

        expect(result.shouldInterrupt).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].field).toBe(spec.draftKey);
        expect(result.violations[0].guidanceKey).toBe(spec.guidanceKey);
        expect(result.violations[0].outOfBandPct).toBeGreaterThan(
          ANALYST_VIOLATION_THRESHOLD,
        );
      });
    });
  }

  it("unionAnalystFieldSpecs dedupes by draftKey", () => {
    const union = unionAnalystFieldSpecs(
      COMPANY_TAB_ANALYST_FIELDS,
      MARKET_MACRO_TAB_ANALYST_FIELDS,
      PROPERTY_UNDERWRITING_TAB_ANALYST_FIELDS,
    );
    const draftKeys = union.map((s) => s.draftKey);
    expect(new Set(draftKeys).size).toBe(draftKeys.length);
    // Sanity — costOfEquity + inflationRate are the known overlaps.
    expect(draftKeys).toContain("costOfEquity");
    expect(draftKeys).toContain("inflationRate");
  });

  it("toGuidanceKeys returns guidanceKey per spec", () => {
    const keys = toGuidanceKeys(COMPANY_TAB_ANALYST_FIELDS);
    expect(keys).toContain("dispositionCommission");
    // The draft-side key MUST NOT leak into the API request.
    expect(keys).not.toContain("salesCommissionRate");
  });

  it("union across all tabs never maps the same draftKey to two different guidanceKeys", () => {
    // Invariant: a given UI control can only correspond to ONE guidance key.
    // If two tab lists disagreed (e.g. one says costOfEquity, another says
    // costEquity for the same draft key), `unionAnalystFieldSpecs`'s
    // first-wins dedup would silently hide the second mapping. Fail loudly.
    const all: AnalystFieldSpec[] = [
      ...COMPANY_TAB_ANALYST_FIELDS,
      ...MARKET_MACRO_TAB_ANALYST_FIELDS,
      ...PROPERTY_UNDERWRITING_TAB_ANALYST_FIELDS,
    ];
    const byDraft = new Map<string, string>();
    for (const spec of all) {
      const prev = byDraft.get(spec.draftKey);
      if (prev !== undefined && prev !== spec.guidanceKey) {
        throw new Error(
          `Conflicting mapping for draftKey "${spec.draftKey}": "${prev}" vs "${spec.guidanceKey}"`,
        );
      }
      byDraft.set(spec.draftKey, spec.guidanceKey);
    }
    // Also: no two different draft keys should reduce to the same guidance
    // key within a single tab (would double-count on Save).
    for (const fixture of FIXTURES) {
      const seen = new Map<string, string>();
      for (const spec of fixture.fields) {
        const prior = seen.get(spec.guidanceKey);
        if (prior !== undefined && prior !== spec.draftKey) {
          throw new Error(
            `${fixture.name}: guidanceKey "${spec.guidanceKey}" mapped by two draft keys ("${prior}", "${spec.draftKey}")`,
          );
        }
        seen.set(spec.guidanceKey, spec.draftKey);
      }
    }
  });

  it("guidance matched to a mismatched draftKey yields no violation (the bug T009 fixed)", () => {
    // Regression guard: before T009, CompanyTab's salesCommissionRate was
    // looked up as draft["dispositionCommission"] → undefined → no
    // violation. Prove the new shape reads the correct draft key.
    const guidance = [makeGuidance("dispositionCommission", 0.04, 0.05)];
    const draft = { salesCommissionRate: 0.2 }; // 4x the band
    const result = computeAnalystViolations({
      draft,
      guidance,
      fields: [{ guidanceKey: "dispositionCommission", draftKey: "salesCommissionRate" }],
    });
    expect(result.shouldInterrupt).toBe(true);
    expect(result.violations[0].field).toBe("salesCommissionRate");
    expect(result.violations[0].guidanceKey).toBe("dispositionCommission");
  });
});
