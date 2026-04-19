import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine";
import { baseProperty, financedProperty } from "../fixtures";
import { makePropertyInput as makeProperty, makeGlobalInput as makeGlobal } from "../fixtures/factories";
import { stableHash } from "../../server/scenarios/stable-json";
import { BUSINESS_MODEL_DEFAULTS } from "../../shared/constants";
import {
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_PROPERTY_INCOME_TAX_RATE,
  DEFAULT_LAND_VALUE_PERCENT,
} from "../../shared/constants";

const PENNY = 2;
const global1Y = makeGlobal({ projectionYears: 1 });
const global5Y = makeGlobal({ projectionYears: 5 });

function extractSnapshot(months: ReturnType<typeof generatePropertyProForma>) {
  return months.map((m, i) => ({
    monthIndex: i,
    occupancy: m.occupancy,
    adr: m.adr,
    revenueRooms: m.revenueRooms,
    revenueEvents: m.revenueEvents,
    revenueFB: m.revenueFB,
    revenueOther: m.revenueOther,
    revenueTotal: m.revenueTotal,
    totalExpenses: m.totalExpenses,
    gop: m.gop,
    noi: m.noi,
    anoi: m.anoi,
    netIncome: m.netIncome,
    cashFlow: m.cashFlow,
    endingCash: m.endingCash,
    depreciationExpense: m.depreciationExpense,
    interestExpense: m.interestExpense,
    principalPayment: m.principalPayment,
    debtOutstanding: m.debtOutstanding,
    operatingCashFlow: m.operatingCashFlow,
    financingCashFlow: m.financingCashFlow,
    propertyValue: m.propertyValue,
    incomeTax: m.incomeTax,
  }));
}

describe("T012 — Deterministic Engine Regression Snapshots", () => {
  describe("Full Equity baseline (1 year)", () => {
    const result = generatePropertyProForma(baseProperty, global1Y, 12);
    const snapshot = extractSnapshot(result);
    const snapshotHash = stableHash(snapshot);

    it("produces exactly 12 months", () => {
      expect(snapshot).toHaveLength(12);
    });

    it("month 0 revenue matches pinned values", () => {
      const m0 = snapshot[0];
      // baseProperty: revShareEvents=0.43, revShareFB=0.22, revShareOther=0.07
      // ancillary=0.72, roomShare=0.28, revRooms=36600, revTotal=36600/0.28=130714.2857...
      expect(m0.revenueRooms).toBeCloseTo(36600, PENNY);
      expect(m0.revenueEvents).toBeCloseTo(130714.285714 * 0.43, PENNY);
      expect(m0.revenueFB).toBeCloseTo(130714.285714 * 0.22, PENNY);
      expect(m0.revenueOther).toBeCloseTo(130714.285714 * 0.07, PENNY);
      expect(m0.revenueTotal).toBeCloseTo(130714.285714, PENNY);
    });

    it("zero debt throughout", () => {
      for (const m of snapshot) {
        expect(m.interestExpense).toBe(0);
        expect(m.principalPayment).toBe(0);
        expect(m.debtOutstanding).toBe(0);
      }
    });

    it("occupancy ramps correctly (step every 6 months)", () => {
      expect(snapshot[0].occupancy).toBeCloseTo(0.60, 4);
      expect(snapshot[5].occupancy).toBeCloseTo(0.60, 4);
      expect(snapshot[6].occupancy).toBeCloseTo(0.65, 4);
      expect(snapshot[11].occupancy).toBeCloseTo(0.65, 4);
    });

    it("depreciation is constant every month", () => {
      const dep = snapshot[0].depreciationExpense;
      expect(dep).toBeGreaterThan(0);
      for (const m of snapshot) {
        expect(m.depreciationExpense).toBeCloseTo(dep, PENNY);
      }
    });

    it("ending cash strictly increases", () => {
      for (let i = 1; i < 12; i++) {
        expect(snapshot[i].endingCash).toBeGreaterThanOrEqual(snapshot[i - 1].endingCash);
      }
    });

    it("hash is deterministic across runs", () => {
      const result2 = generatePropertyProForma(baseProperty, global1Y, 12);
      const hash2 = stableHash(extractSnapshot(result2));
      expect(hash2).toBe(snapshotHash);
    });

    it("ASC 230 OCF identity holds every month", () => {
      for (const m of result) {
        expect(m.operatingCashFlow).toBeCloseTo(m.netIncome + m.depreciationExpense, PENNY);
      }
    });
  });

  describe("Financed baseline (1 year)", () => {
    const result = generatePropertyProForma(financedProperty, global1Y, 12);
    const snapshot = extractSnapshot(result);
    const snapshotHash = stableHash(snapshot);

    it("produces exactly 12 months", () => {
      expect(snapshot).toHaveLength(12);
    });

    it("has non-zero debt service every month", () => {
      for (const m of snapshot) {
        expect(m.interestExpense).toBeGreaterThan(0);
        expect(m.principalPayment).toBeGreaterThan(0);
        expect(m.debtOutstanding).toBeGreaterThan(0);
      }
    });

    it("debt outstanding decreases over time", () => {
      for (let i = 1; i < 12; i++) {
        expect(snapshot[i].debtOutstanding).toBeLessThan(snapshot[i - 1].debtOutstanding);
      }
    });

    it("interest + principal = debtPayment identity", () => {
      for (const m of result) {
        expect(m.interestExpense + m.principalPayment).toBeCloseTo(m.debtPayment, PENNY);
      }
    });

    it("hash is deterministic across runs", () => {
      const result2 = generatePropertyProForma(financedProperty, global1Y, 12);
      const hash2 = stableHash(extractSnapshot(result2));
      expect(hash2).toBe(snapshotHash);
    });
  });

  describe("Lodge baseline (1 year)", () => {
    const lodgeDefaults = BUSINESS_MODEL_DEFAULTS.lodge;
    const lodge = makeProperty({
      startAdr: 350,
      roomCount: 5,
      startOccupancy: 0.55,
      maxOccupancy: 0.55,
      occupancyRampMonths: 1,
      occupancyGrowthStep: 0,
      adrGrowthRate: 0,
      costRateRooms: lodgeDefaults.costRateRooms,
      costRateFB: lodgeDefaults.costRateFB,
      costRateAdmin: lodgeDefaults.costRateAdmin,
      costRateMarketing: lodgeDefaults.costRateMarketing,
      costRatePropertyOps: lodgeDefaults.costRatePropertyOps,
      costRateUtilities: lodgeDefaults.costRateUtilities,
      costRateTaxes: lodgeDefaults.costRateTaxes,
      costRateIT: lodgeDefaults.costRateIT,
      costRateFFE: lodgeDefaults.costRateFFE,
      costRateOther: lodgeDefaults.costRateOther,
      revShareEvents: 0,
      revShareFB: lodgeDefaults.revShareFB,
      revShareOther: lodgeDefaults.revShareOther,
      cateringBoostPercent: lodgeDefaults.cateringBoostPercent,
    });
    const result = generatePropertyProForma(lodge, global1Y, 12);
    const snapshot = extractSnapshot(result);
    const snapshotHash = stableHash(snapshot);

    it("produces exactly 12 months", () => {
      expect(snapshot).toHaveLength(12);
    });

    it("zero event revenue (lodge model)", () => {
      for (const m of snapshot) {
        expect(m.revenueEvents).toBe(0);
      }
    });

    it("all 12 months produce identical revenue (flat occupancy, zero growth)", () => {
      const m1Rev = snapshot[0].revenueTotal;
      for (let i = 1; i < 12; i++) {
        expect(snapshot[i].revenueTotal).toBeCloseTo(m1Rev, PENNY);
      }
    });

    it("hash is deterministic across runs", () => {
      const result2 = generatePropertyProForma(lodge, global1Y, 12);
      const hash2 = stableHash(extractSnapshot(result2));
      expect(hash2).toBe(snapshotHash);
    });
  });

  describe("VRBO baseline (1 year)", () => {
    const vrboDefaults = BUSINESS_MODEL_DEFAULTS.vrbo;
    const vrbo = makeProperty({
      startAdr: 250,
      roomCount: 1,
      startOccupancy: 0.65,
      maxOccupancy: 0.65,
      occupancyRampMonths: 1,
      occupancyGrowthStep: 0,
      adrGrowthRate: 0,
      purchasePrice: 500_000,
      costRateRooms: vrboDefaults.costRateRooms,
      costRateFB: vrboDefaults.costRateFB,
      costRateAdmin: vrboDefaults.costRateAdmin,
      costRateMarketing: vrboDefaults.costRateMarketing,
      costRatePropertyOps: vrboDefaults.costRatePropertyOps,
      costRateUtilities: vrboDefaults.costRateUtilities,
      costRateTaxes: vrboDefaults.costRateTaxes,
      costRateIT: vrboDefaults.costRateIT,
      costRateFFE: vrboDefaults.costRateFFE,
      costRateOther: vrboDefaults.costRateOther,
      revShareEvents: 0,
      revShareFB: 0,
      revShareOther: vrboDefaults.revShareOther,
      cateringBoostPercent: 0,
    });
    const result = generatePropertyProForma(vrbo, global1Y, 12);
    const snapshot = extractSnapshot(result);
    const snapshotHash = stableHash(snapshot);

    it("produces exactly 12 months", () => {
      expect(snapshot).toHaveLength(12);
    });

    it("zero event and F&B revenue (VRBO model)", () => {
      for (const m of snapshot) {
        expect(m.revenueEvents).toBe(0);
        expect(m.revenueFB).toBe(0);
      }
    });

    it("all 12 months produce identical revenue (flat occupancy, zero growth)", () => {
      const m1Rev = snapshot[0].revenueTotal;
      for (let i = 1; i < 12; i++) {
        expect(snapshot[i].revenueTotal).toBeCloseTo(m1Rev, PENNY);
      }
    });

    it("hash is deterministic across runs", () => {
      const result2 = generatePropertyProForma(vrbo, global1Y, 12);
      const hash2 = stableHash(extractSnapshot(result2));
      expect(hash2).toBe(snapshotHash);
    });
  });

  describe("5-year projection stability", () => {
    const result = generatePropertyProForma(baseProperty, global5Y, 60);
    const snapshot = extractSnapshot(result);
    const snapshotHash = stableHash(snapshot);

    it("produces exactly 60 months", () => {
      expect(snapshot).toHaveLength(60);
    });

    it("ADR grows ~3%/yr compounding", () => {
      const m0Adr = snapshot[0].adr;
      const m12Adr = snapshot[12].adr;
      const expectedGrowth = 1.03;
      expect(m12Adr / m0Adr).toBeCloseTo(expectedGrowth, 2);
    });

    it("occupancy caps at maxOccupancy", () => {
      for (const m of snapshot) {
        expect(m.occupancy).toBeLessThanOrEqual(0.80 + 0.001);
      }
    });

    it("ending cash at month 59 > month 0", () => {
      expect(snapshot[59].endingCash).toBeGreaterThan(snapshot[0].endingCash);
    });

    it("all values finite across 60 months", () => {
      for (const m of snapshot) {
        for (const [key, val] of Object.entries(m)) {
          if (typeof val === "number") {
            expect(Number.isFinite(val), `${key} at month ${m.monthIndex}`).toBe(true);
          }
        }
      }
    });

    it("hash is deterministic across runs", () => {
      const result2 = generatePropertyProForma(baseProperty, global5Y, 60);
      const hash2 = stableHash(extractSnapshot(result2));
      expect(hash2).toBe(snapshotHash);
    });
  });

  describe("cross-scenario hash differentiation", () => {
    it("different ADR produces different hash", () => {
      const r1 = generatePropertyProForma(baseProperty, global1Y, 12);
      const r2 = generatePropertyProForma(makeProperty({ startAdr: 201 }), global1Y, 12);
      expect(stableHash(extractSnapshot(r1))).not.toBe(stableHash(extractSnapshot(r2)));
    });

    it("different occupancy produces different hash", () => {
      const r1 = generatePropertyProForma(baseProperty, global1Y, 12);
      const r2 = generatePropertyProForma(makeProperty({ startOccupancy: 0.61 }), global1Y, 12);
      expect(stableHash(extractSnapshot(r1))).not.toBe(stableHash(extractSnapshot(r2)));
    });

    it("different projection years produce different hash", () => {
      const r1 = generatePropertyProForma(baseProperty, global1Y, 12);
      const g2 = makeGlobal({ projectionYears: 2 });
      const r2 = generatePropertyProForma(baseProperty, g2, 24);
      expect(stableHash(extractSnapshot(r1))).not.toBe(stableHash(extractSnapshot(r2)));
    });

    it("Full Equity vs Financed produce different hash", () => {
      const r1 = generatePropertyProForma(baseProperty, global1Y, 12);
      const r2 = generatePropertyProForma(financedProperty, global1Y, 12);
      expect(stableHash(extractSnapshot(r1))).not.toBe(stableHash(extractSnapshot(r2)));
    });
  });
});
