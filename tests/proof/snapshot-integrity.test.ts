import { describe, it, expect } from "vitest";
import {
  computePropertyDiff,
  applyPropertyDiff,
  computeAssumptionDiff,
  computeFullDiff,
  reconstructScenarioProperties,
  computeSnapshotHash,
  DELETED_SENTINEL,
} from "../../server/scenarios/diff-engine";
import { stableHash, stableEquals } from "../../server/scenarios/stable-json";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine";
import { baseProperty, makeGlobal, makeProperty, financedProperty } from "../fixtures";

const PENNY = 2;

const NUMERIC_FIELDS = [
  "roomCount", "startAdr", "adrGrowthRate", "startOccupancy", "maxOccupancy",
  "occupancyRampMonths", "occupancyGrowthStep", "purchasePrice",
  "buildingImprovements", "landValuePercent", "preOpeningCosts", "operatingReserve",
  "costRateRooms", "costRateFB", "costRateAdmin", "costRateMarketing",
  "costRatePropertyOps", "costRateUtilities", "costRateTaxes", "costRateIT",
  "costRateFFE", "costRateOther", "revShareEvents", "revShareFB", "revShareOther",
  "cateringBoostPercent",
] as const;

describe("T006 — Scenario Snapshot Integrity", () => {
  describe("JSONB round-trip preserves numeric types", () => {
    it("all numeric fields survive JSON.parse(JSON.stringify())", () => {
      const prop = { ...baseProperty, name: "Test" } as Record<string, unknown>;
      const roundTripped = JSON.parse(JSON.stringify(prop));

      for (const field of NUMERIC_FIELDS) {
        expect(typeof roundTripped[field]).toBe("number");
        expect(roundTripped[field]).toBe(prop[field]);
      }
    });

    it("high-precision decimals survive serialization", () => {
      const precisionValues = [
        0.0875, 0.00125, 0.333333333, 1e-10, 0.123456789012345,
        Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER,
      ];
      for (const val of precisionValues) {
        const roundTripped = JSON.parse(JSON.stringify({ v: val }));
        expect(roundTripped.v).toBe(val);
      }
    });

    it("special values are handled safely in JSON", () => {
      const obj = { a: 0, b: -0, c: null };
      const rt = JSON.parse(JSON.stringify(obj));
      expect(rt.a).toBe(0);
      expect(rt.b).toBe(0);
      expect(rt.c).toBeNull();
    });

    it("NaN and Infinity become null in JSON (known limitation)", () => {
      const obj = { nan: NaN, inf: Infinity, negInf: -Infinity };
      const rt = JSON.parse(JSON.stringify(obj));
      expect(rt.nan).toBeNull();
      expect(rt.inf).toBeNull();
      expect(rt.negInf).toBeNull();
    });
  });

  describe("stableHash determinism", () => {
    it("same object always produces same hash", () => {
      const obj = { ...baseProperty, name: "HashTest" };
      const h1 = stableHash(obj);
      const h2 = stableHash(obj);
      expect(h1).toBe(h2);
    });

    it("key order does not affect hash", () => {
      const a = { x: 1, y: 2, z: 3 };
      const b = { z: 3, x: 1, y: 2 };
      expect(stableHash(a)).toBe(stableHash(b));
    });

    it("numeric precision differences produce different hashes", () => {
      const a = { rate: 0.0875 };
      const b = { rate: 0.08750000000000001 };
      expect(stableHash(a)).not.toBe(stableHash(b));
    });

    it("baseProperty hash is stable across calls", () => {
      const hash1 = stableHash(baseProperty);
      const hash2 = stableHash({ ...baseProperty });
      expect(hash1).toBe(hash2);
    });

    it("computeSnapshotHash is deterministic", () => {
      const assumptions = { inflationRate: 0.03, projectionYears: 5 };
      const properties = [{ ...baseProperty, name: "A" }];
      const h1 = computeSnapshotHash(assumptions, properties as any[]);
      const h2 = computeSnapshotHash(assumptions, properties as any[]);
      expect(h1).toBe(h2);
    });
  });

  describe("stableEquals correctness", () => {
    it("identical objects are equal", () => {
      expect(stableEquals(baseProperty, { ...baseProperty })).toBe(true);
    });

    it("different numeric values are not equal", () => {
      const modified = { ...baseProperty, startAdr: 201 };
      expect(stableEquals(baseProperty, modified)).toBe(false);
    });

    it("nested objects compare deeply", () => {
      const a = { config: { rates: [0.05, 0.10] } };
      const b = { config: { rates: [0.05, 0.10] } };
      const c = { config: { rates: [0.05, 0.11] } };
      expect(stableEquals(a, b)).toBe(true);
      expect(stableEquals(a, c)).toBe(false);
    });
  });

  describe("property diff preserves numeric precision", () => {
    it("unchanged property produces empty diff", () => {
      const base = { name: "Hotel", startAdr: 200, costRateRooms: 0.20 };
      const diff = computePropertyDiff(base, { ...base });
      expect(Object.keys(diff)).toHaveLength(0);
    });

    it("numeric changes appear in diff with exact values", () => {
      const base = { name: "Hotel", startAdr: 200, costRateRooms: 0.20 };
      const modified = { name: "Hotel", startAdr: 225, costRateRooms: 0.0875 };
      const diff = computePropertyDiff(base, modified);
      expect(diff.startAdr).toBe(225);
      expect(diff.costRateRooms).toBe(0.0875);
      expect(diff.name).toBeUndefined();
    });

    it("apply then diff roundtrip produces identity", () => {
      const base = { name: "Hotel", startAdr: 200, costRateRooms: 0.20, costRateIT: 0.005 };
      const override = { startAdr: 250, costRateIT: 0.0125 };
      const applied = applyPropertyDiff(base, override);
      expect(applied.startAdr).toBe(250);
      expect(applied.costRateIT).toBe(0.0125);
      expect(applied.costRateRooms).toBe(0.20);
    });

    it("diff → apply → diff produces empty diff", () => {
      const base = { name: "Hotel", startAdr: 200, rate: 0.0875 };
      const modified = { name: "Hotel", startAdr: 225, rate: 0.0950 };
      const diff1 = computePropertyDiff(base, modified);
      const reconstructed = applyPropertyDiff(base, diff1);
      const diff2 = computePropertyDiff(modified, reconstructed);
      expect(Object.keys(diff2)).toHaveLength(0);
    });

    it("DELETED_SENTINEL removes fields on apply", () => {
      const base = { name: "Hotel", optional: "value", rate: 0.05 };
      const applied = applyPropertyDiff(base, { optional: DELETED_SENTINEL });
      expect(applied.optional).toBeUndefined();
      expect(applied.name).toBe("Hotel");
      expect(applied.rate).toBe(0.05);
    });
  });

  describe("assumption diff preserves values", () => {
    it("unchanged assumptions produce empty diff", () => {
      const base = { inflationRate: 0.03, projectionYears: 5 };
      const diff = computeAssumptionDiff(base, { ...base });
      expect(Object.keys(diff)).toHaveLength(0);
    });

    it("changed assumption values are captured exactly", () => {
      const base = { inflationRate: 0.03, projectionYears: 5 };
      const modified = { inflationRate: 0.025, projectionYears: 10 };
      const diff = computeAssumptionDiff(base, modified);
      expect(diff.inflationRate).toBe(0.025);
      expect(diff.projectionYears).toBe(10);
    });
  });

  describe("full diff cycle (computeFullDiff + reconstruct)", () => {
    const baseProp = { name: "PropA", startAdr: 200, costRateRooms: 0.20 };
    const baseAssumptions = { inflationRate: 0.03 };

    it("identical scenario produces no diffs", () => {
      const result = computeFullDiff(
        baseAssumptions, [baseProp],
        { ...baseAssumptions }, [{ ...baseProp }]
      );
      expect(Object.keys(result.assumptionOverrides)).toHaveLength(0);
      expect(result.propertyDiffs).toHaveLength(0);
    });

    it("modified property is captured and reconstructible", () => {
      const modProp = { name: "PropA", startAdr: 250, costRateRooms: 0.25 };
      const result = computeFullDiff(
        baseAssumptions, [baseProp],
        baseAssumptions, [modProp]
      );
      expect(result.propertyDiffs).toHaveLength(1);
      expect(result.propertyDiffs[0].changeType).toBe("modified");
      expect(result.propertyDiffs[0].overrides.startAdr).toBe(250);

      const reconstructed = reconstructScenarioProperties([baseProp], result.propertyDiffs);
      expect(reconstructed).toHaveLength(1);
      expect(reconstructed[0].startAdr).toBe(250);
      expect(reconstructed[0].costRateRooms).toBe(0.25);
    });

    it("added property appears in diff", () => {
      const newProp = { name: "PropB", startAdr: 300 };
      const result = computeFullDiff(
        baseAssumptions, [baseProp],
        baseAssumptions, [baseProp, newProp]
      );
      const added = result.propertyDiffs.find(d => d.changeType === "added");
      expect(added).toBeDefined();
      expect(added!.propertyName).toBe("PropB");
    });

    it("removed property appears in diff", () => {
      const result = computeFullDiff(
        baseAssumptions, [baseProp],
        baseAssumptions, []
      );
      const removed = result.propertyDiffs.find(d => d.changeType === "removed");
      expect(removed).toBeDefined();
      expect(removed!.propertyName).toBe("PropA");
    });

    it("snapshotHash is consistent", () => {
      const r1 = computeFullDiff(baseAssumptions, [baseProp], baseAssumptions, [baseProp]);
      const r2 = computeFullDiff(baseAssumptions, [baseProp], baseAssumptions, [baseProp]);
      expect(r1.snapshotHash).toBe(r2.snapshotHash);
    });
  });

  describe("engine output determinism (same inputs → same outputs)", () => {
    const global = makeGlobal({ projectionYears: 1 });

    it("Full Equity property produces identical results on repeated runs", () => {
      const r1 = generatePropertyProForma(baseProperty, global, 12);
      const r2 = generatePropertyProForma(baseProperty, global, 12);
      expect(r1).toHaveLength(12);
      for (let i = 0; i < 12; i++) {
        expect(r1[i].revenueTotal).toBe(r2[i].revenueTotal);
        expect(r1[i].totalExpenses).toBe(r2[i].totalExpenses);
        expect(r1[i].netIncome).toBe(r2[i].netIncome);
        expect(r1[i].endingCash).toBe(r2[i].endingCash);
        expect(r1[i].cashFlow).toBe(r2[i].cashFlow);
      }
    });

    it("Financed property produces identical results on repeated runs", () => {
      const r1 = generatePropertyProForma(financedProperty, global, 12);
      const r2 = generatePropertyProForma(financedProperty, global, 12);
      for (let i = 0; i < 12; i++) {
        expect(r1[i].interestExpense).toBe(r2[i].interestExpense);
        expect(r1[i].principalPayment).toBe(r2[i].principalPayment);
        expect(r1[i].debtOutstanding).toBe(r2[i].debtOutstanding);
        expect(r1[i].endingCash).toBe(r2[i].endingCash);
      }
    });

    it("outputHash from stableHash is deterministic for engine output", () => {
      const result = generatePropertyProForma(baseProperty, global, 12);
      const h1 = stableHash(result);
      const h2 = stableHash(result);
      expect(h1).toBe(h2);
    });

    it("different inputs produce different outputHash", () => {
      const r1 = generatePropertyProForma(baseProperty, global, 12);
      const modified = makeProperty({ startAdr: 201 });
      const r2 = generatePropertyProForma(modified, global, 12);
      expect(stableHash(r1)).not.toBe(stableHash(r2));
    });
  });

  describe("load → save → load numeric identity", () => {
    it("property numeric fields survive full diff cycle exactly", () => {
      const prop = { ...baseProperty, name: "Identity" } as Record<string, unknown>;
      const assumptions = { inflationRate: 0.03, projectionYears: 5 };

      const fullDiff = computeFullDiff(assumptions, [prop], assumptions, [prop]);
      expect(fullDiff.propertyDiffs).toHaveLength(0);

      const reconstructed = reconstructScenarioProperties([prop], fullDiff.propertyDiffs);
      expect(reconstructed).toHaveLength(1);

      for (const field of NUMERIC_FIELDS) {
        expect(reconstructed[0][field]).toBe(prop[field]);
      }
    });

    it("modified property survives diff → reconstruct → diff cycle", () => {
      const base = { name: "Cycle", startAdr: 200, costRateRooms: 0.20, rate: 0.05 };
      const modified = { name: "Cycle", startAdr: 275, costRateRooms: 0.0875, rate: 0.05 };

      const diff1 = computeFullDiff({}, [base], {}, [modified]);
      expect(diff1.propertyDiffs).toHaveLength(1);
      expect(diff1.propertyDiffs[0].changeType).toBe("modified");

      const reconstructed = reconstructScenarioProperties([base], diff1.propertyDiffs);
      expect(reconstructed).toHaveLength(1);
      expect(reconstructed[0].startAdr).toBe(275);
      expect(reconstructed[0].costRateRooms).toBe(0.0875);

      const diff2 = computeFullDiff({}, [modified], {}, reconstructed);
      expect(diff2.propertyDiffs).toHaveLength(0);
    });

    it("engine results match after property round-trip through diff", () => {
      const global = makeGlobal({ projectionYears: 1 });
      const prop = { ...baseProperty, name: "EngineRT" } as Record<string, unknown>;

      const r1 = generatePropertyProForma(baseProperty, global, 12);

      const diff = computeFullDiff({}, [prop], {}, [{ ...prop, startAdr: 250 }]);
      const reconstructed = reconstructScenarioProperties([prop], diff.propertyDiffs);
      const rtProp = reconstructed[0] as typeof baseProperty;

      const r2 = generatePropertyProForma(rtProp, global, 12);

      for (let i = 0; i < 12; i++) {
        expect(r2[i].adr).toBeCloseTo(250, 4);
      }
      expect(r2[0].revenueRooms).not.toBe(r1[0].revenueRooms);
    });
  });
});
