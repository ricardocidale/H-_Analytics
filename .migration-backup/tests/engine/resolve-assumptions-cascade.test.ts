import { describe, it, expect } from "vitest";
import { resolvePropertyAssumptions } from "../../client/src/lib/financial/resolve-assumptions.js";
import { generatePropertyProForma } from "../../client/src/lib/financial/property-engine.js";
import type { PropertyInput, GlobalInput } from "../../client/src/lib/financial/types.js";
import { DEPRECIATION_YEARS, DAYS_PER_MONTH } from "../../shared/constants.js";

function makeProperty(overrides: Partial<PropertyInput> = {}): PropertyInput {
  return {
    operationsStartDate: "2026-04-01",
    roomCount: 50,
    startAdr: 200,
    adrGrowthRate: 0.03,
    startOccupancy: 0.65,
    maxOccupancy: 0.85,
    occupancyRampMonths: 12,
    occupancyGrowthStep: 0.01,
    purchasePrice: 5_000_000,
    type: "Full Equity",
    costRateRooms: 0.25,
    costRateFB: 0.3,
    costRateAdmin: 0.08,
    costRateMarketing: 0.05,
    costRatePropertyOps: 0.06,
    costRateUtilities: 0.04,
    costRateTaxes: 0.05,
    costRateIT: 0.02,
    costRateFFE: 0.04,
    costRateOther: 0.02,
    costRateInsurance: 0.02,
    revShareEvents: 0.15,
    revShareFB: 0.2,
    revShareOther: 0.05,
    ...overrides,
  };
}

function makeGlobal(overrides: Partial<GlobalInput> = {}): GlobalInput {
  return {
    modelStartDate: "2026-01-01",
    inflationRate: 0.03,
    marketingRate: 0.02,
    ...overrides,
  };
}

describe("resolve-assumptions cascade: depreciationYears", () => {
  it("falls back to DEPRECIATION_YEARS constant when both property and global are undefined", () => {
    const ctx = resolvePropertyAssumptions(makeProperty(), makeGlobal(), 120);
    expect(ctx.depreciationYears).toBe(DEPRECIATION_YEARS);
  });

  it("uses global depreciationYears when property has none", () => {
    const ctx = resolvePropertyAssumptions(
      makeProperty(),
      makeGlobal({ depreciationYears: 30 }),
      120
    );
    expect(ctx.depreciationYears).toBe(30);
  });

  it("uses property depreciationYears over global value", () => {
    const ctx = resolvePropertyAssumptions(
      makeProperty({ depreciationYears: 20 }),
      makeGlobal({ depreciationYears: 30 }),
      120
    );
    expect(ctx.depreciationYears).toBe(20);
  });

  it("uses property depreciationYears over constant when global is undefined", () => {
    const ctx = resolvePropertyAssumptions(
      makeProperty({ depreciationYears: 15 }),
      makeGlobal(),
      120
    );
    expect(ctx.depreciationYears).toBe(15);
  });

  it("treats null property depreciationYears as absent (falls through to global)", () => {
    const ctx = resolvePropertyAssumptions(
      makeProperty({ depreciationYears: null }),
      makeGlobal({ depreciationYears: 25 }),
      120
    );
    expect(ctx.depreciationYears).toBe(25);
  });

  it("affects monthly depreciation calculation", () => {
    const prop = makeProperty({ depreciationYears: 10, landValuePercent: 0.2 });
    const ctx = resolvePropertyAssumptions(prop, makeGlobal(), 120);
    const buildingValue = prop.purchasePrice * (1 - 0.2);
    const expected = buildingValue / 10 / 12;
    expect(ctx.monthlyDepreciation).toBeCloseTo(expected, 2);
  });
});

describe("resolve-assumptions cascade: daysPerMonth", () => {
  it("falls back to DAYS_PER_MONTH constant when global is undefined", () => {
    const ctx = resolvePropertyAssumptions(makeProperty(), makeGlobal(), 120);
    expect(ctx.availableRooms).toBe(50 * DAYS_PER_MONTH);
  });

  it("uses global daysPerMonth when set", () => {
    const ctx = resolvePropertyAssumptions(
      makeProperty(),
      makeGlobal({ daysPerMonth: 31 }),
      120
    );
    expect(ctx.availableRooms).toBe(50 * 31);
  });

  it("affects base monthly room revenue", () => {
    const prop = makeProperty({ roomCount: 100, startAdr: 150, startOccupancy: 0.70 });
    const glob = makeGlobal({ daysPerMonth: 28 });
    const ctx = resolvePropertyAssumptions(prop, glob, 120);
    const expected = 100 * 28 * 150 * 0.70;
    expect(ctx.baseMonthlyRoomRev).toBeCloseTo(expected, 2);
  });
});

describe("resolve-assumptions cascade: combined effects", () => {
  it("both DB-backed values flow into engine context correctly", () => {
    const ctx = resolvePropertyAssumptions(
      makeProperty({ depreciationYears: 39 }),
      makeGlobal({ daysPerMonth: 30 }),
      120
    );
    expect(ctx.depreciationYears).toBe(39);
    expect(ctx.availableRooms).toBe(50 * 30);
  });

  it("cost-seg rest life uses resolved depreciationYears", () => {
    const prop = makeProperty({
      depreciationYears: 20,
      landValuePercent: 0.25,
      costSegEnabled: true,
      costSeg5yrPct: 0.1,
      costSeg7yrPct: 0.1,
      costSeg15yrPct: 0.1,
    });
    const ctx = resolvePropertyAssumptions(prop, makeGlobal(), 120);
    expect(ctx.depreciationYears).toBe(20);
    const restBasis = prop.purchasePrice * (1 - 0.25) * (1 - 0.1 - 0.1 - 0.1);
    const expectedRestMonthly = restBasis / 20 / 12;
    expect(ctx.costSegRestMonthly).toBeCloseTo(expectedRestMonthly, 2);
  });
});

describe("engine end-to-end: DB-backed values affect outputs", () => {
  it("changing global depreciationYears changes depreciation expense in engine output", () => {
    const prop = makeProperty({ landValuePercent: 0.2 });
    const globalDefault = makeGlobal();
    const global30yr = makeGlobal({ depreciationYears: 30 });

    const resultsDefault = generatePropertyProForma(prop, globalDefault, 48);
    const results30yr = generatePropertyProForma(prop, global30yr, 48);

    const depDefault = resultsDefault.find(m => m.depreciationExpense > 0)!.depreciationExpense;
    const dep30yr = results30yr.find(m => m.depreciationExpense > 0)!.depreciationExpense;

    expect(depDefault).not.toBe(dep30yr);
    const buildingValue = prop.purchasePrice * (1 - 0.2);
    expect(depDefault).toBeCloseTo(buildingValue / DEPRECIATION_YEARS / 12, 2);
    expect(dep30yr).toBeCloseTo(buildingValue / 30 / 12, 2);
  });

  it("property override wins over global in engine output", () => {
    const prop = makeProperty({ depreciationYears: 15, landValuePercent: 0.2 });
    const glob = makeGlobal({ depreciationYears: 30 });

    const results = generatePropertyProForma(prop, glob, 48);
    const dep = results.find(m => m.depreciationExpense > 0)!.depreciationExpense;
    const buildingValue = prop.purchasePrice * (1 - 0.2);
    expect(dep).toBeCloseTo(buildingValue / 15 / 12, 2);
  });

  it("changing global daysPerMonth changes room revenue in engine output", () => {
    const prop = makeProperty();
    const globalDefault = makeGlobal();
    const global31 = makeGlobal({ daysPerMonth: 31 });

    const resultsDefault = generatePropertyProForma(prop, globalDefault, 48);
    const results31 = generatePropertyProForma(prop, global31, 48);

    const revDefault = resultsDefault.find(m => m.revenueRooms > 0)!.revenueRooms;
    const rev31 = results31.find(m => m.revenueRooms > 0)!.revenueRooms;

    expect(rev31).toBeGreaterThan(revDefault);
    expect(rev31 / revDefault).toBeCloseTo(31 / DAYS_PER_MONTH, 4);
  });

  it("golden outputs preserved when DB values match constants", () => {
    const prop = makeProperty({ landValuePercent: 0.2 });
    const globExplicit = makeGlobal({ depreciationYears: DEPRECIATION_YEARS, daysPerMonth: DAYS_PER_MONTH });
    const globImplicit = makeGlobal();

    const explicit = generatePropertyProForma(prop, globExplicit, 48);
    const implicit = generatePropertyProForma(prop, globImplicit, 48);

    for (let i = 0; i < explicit.length; i++) {
      expect(explicit[i].revenueRooms).toBe(implicit[i].revenueRooms);
      expect(explicit[i].depreciationExpense).toBe(implicit[i].depreciationExpense);
      expect(explicit[i].noi).toBe(implicit[i].noi);
      expect(explicit[i].cashFlow).toBe(implicit[i].cashFlow);
    }
  });
});
