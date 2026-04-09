import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine.js";
import { aggregatePropertyByYear } from "../../engine/aggregation/yearlyAggregator.js";
import { consolidateYearlyFinancials } from "../../engine/aggregation/consolidation.js";
import {
  DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_PROPERTY_TAX_RATE,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_EVENT_EXPENSE_RATE,
  DEFAULT_OTHER_EXPENSE_RATE,
  DEFAULT_UTILITIES_VARIABLE_SPLIT,
  BUSINESS_MODEL_DEFAULTS,
  MONTHS_PER_YEAR,
  DAYS_PER_MONTH,
} from "../../shared/constants.js";

const PENNY = 2;

function makeProperty(overrides: Record<string, unknown> = {}) {
  return {
    operationsStartDate: "2026-04-01",
    acquisitionDate: "2026-04-01",
    roomCount: 10,
    startAdr: 200,
    adrGrowthRate: 0.03,
    startOccupancy: 0.60,
    maxOccupancy: 0.85,
    occupancyRampMonths: 6,
    occupancyGrowthStep: 0.05,
    purchasePrice: 1_000_000,
    buildingImprovements: 0,
    landValuePercent: DEFAULT_LAND_VALUE_PERCENT,
    preOpeningCosts: 0,
    operatingReserve: 0,
    costRateRooms: 0.20,
    costRateFB: 0.09,
    costRateAdmin: 0.08,
    costRateMarketing: 0.01,
    costRatePropertyOps: 0.04,
    costRateUtilities: 0.05,
    costRateTaxes: 0.03,
    costRateIT: 0.005,
    costRateFFE: 0.04,
    costRateOther: 0.05,
    revShareEvents: 0.43,
    revShareFB: 0.22,
    revShareOther: 0.07,
    cateringBoostPercent: 0.30,
    baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
    incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
    taxRate: DEFAULT_PROPERTY_TAX_RATE,
    type: "Financed",
    acquisitionLTV: 0.75,
    acquisitionInterestRate: 0.06,
    acquisitionTermYears: 25,
    ...overrides,
  };
}

const baseGlobal = {
  modelStartDate: "2026-04-01",
  projectionYears: 10,
  inflationRate: 0.03,
  fixedCostEscalationRate: 0.03,
  eventExpenseRate: DEFAULT_EVENT_EXPENSE_RATE,
  otherExpenseRate: DEFAULT_OTHER_EXPENSE_RATE,
  utilitiesVariableSplit: DEFAULT_UTILITIES_VARIABLE_SPLIT,
};

describe("T007 — Monthly-to-Yearly Aggregation Cross-Check", () => {
  const property = makeProperty();
  const monthly = generatePropertyProForma(property, baseGlobal, 120);
  const yearly = aggregatePropertyByYear(monthly, 10);

  const sumFields = [
    "revenueRooms", "revenueEvents", "revenueFB", "revenueOther", "revenueTotal",
    "expenseRooms", "expenseFB", "expenseEvents", "expenseOther",
    "expenseMarketing", "expensePropertyOps", "expenseAdmin", "expenseIT",
    "expenseUtilitiesVar", "expenseUtilitiesFixed",
    "expenseTaxes", "expenseFFE", "expenseOtherCosts", "expenseInsurance",
    "expensePlatformFees", "expensePreOpening",
    "feeBase", "feeIncentive",
    "totalExpenses", "gop", "agop", "noi", "anoi",
    "interestExpense", "depreciationExpense", "incomeTax", "netIncome",
    "principalPayment", "debtPayment", "refinancingProceeds",
    "accountsReceivable", "accountsPayable", "workingCapitalChange",
    "cashFlow", "operatingCashFlow", "financingCashFlow",
    "soldRooms", "availableRooms",
  ] as const;

  for (const field of sumFields) {
    it(`yearly ${field} = sum of 12 monthly values (every year)`, () => {
      for (let y = 0; y < 10; y++) {
        let monthlySum = 0;
        for (let m = y * 12; m < (y + 1) * 12; m++) {
          monthlySum += (monthly[m] as Record<string, number>)[field];
        }
        const yearlyValue = (yearly[y] as Record<string, number>)[field];
        expect(yearlyValue).toBeCloseTo(monthlySum, PENNY);
      }
    });
  }

  const pickLastFields = ["endingCash", "nolBalance"] as const;
  for (const field of pickLastFields) {
    it(`yearly ${field} = last month of year (PICK_LAST, not sum)`, () => {
      for (let y = 0; y < 10; y++) {
        const lastMonthIdx = (y + 1) * 12 - 1;
        expect((yearly[y] as Record<string, number>)[field]).toBeCloseTo(
          (monthly[lastMonthIdx] as Record<string, number>)[field], PENNY
        );
      }
    });
  }

  it("yearly expenseUtilities = var + fixed (DERIVED)", () => {
    for (let y = 0; y < 10; y++) {
      expect(yearly[y].expenseUtilities).toBeCloseTo(
        yearly[y].expenseUtilitiesVar + yearly[y].expenseUtilitiesFixed,
        PENNY
      );
    }
  });

  it("yearly cleanAdr = last non-zero ADR in year", () => {
    for (let y = 0; y < 10; y++) {
      let lastAdr = 0;
      for (let m = (y + 1) * 12 - 1; m >= y * 12; m--) {
        if (monthly[m].adr > 0) {
          lastAdr = monthly[m].adr;
          break;
        }
      }
      expect(yearly[y].cleanAdr).toBeCloseTo(lastAdr, PENNY);
    }
  });

  it("yearly service fee categories sum correctly", () => {
    for (let y = 0; y < 10; y++) {
      const catSums: Record<string, number> = {};
      for (let m = y * 12; m < (y + 1) * 12; m++) {
        if (monthly[m].serviceFeesByCategory) {
          for (const [cat, val] of Object.entries(monthly[m].serviceFeesByCategory)) {
            catSums[cat] = (catSums[cat] ?? 0) + val;
          }
        }
      }
      for (const [cat, expectedSum] of Object.entries(catSums)) {
        expect(yearly[y].serviceFeesByCategory[cat] ?? 0).toBeCloseTo(expectedSum, PENNY);
      }
    }
  });
});

describe("T008 — Portfolio Consolidation Verification", () => {
  const prop1 = makeProperty({ startAdr: 200, roomCount: 10 });
  const prop2 = makeProperty({ startAdr: 300, roomCount: 15, purchasePrice: 2_000_000 });
  const prop3 = makeProperty({
    startAdr: 150,
    roomCount: 8,
    purchasePrice: 750_000,
    type: "Full Equity",
  });

  const monthly1 = generatePropertyProForma(prop1, baseGlobal, 120);
  const monthly2 = generatePropertyProForma(prop2, baseGlobal, 120);
  const monthly3 = generatePropertyProForma(prop3, baseGlobal, 120);

  const yearly1 = aggregatePropertyByYear(monthly1, 10);
  const yearly2 = aggregatePropertyByYear(monthly2, 10);
  const yearly3 = aggregatePropertyByYear(monthly3, 10);

  const consolidated = consolidateYearlyFinancials([yearly1, yearly2, yearly3], 10);

  const consSumFields = [
    "revenueRooms", "revenueEvents", "revenueFB", "revenueOther", "revenueTotal",
    "expenseRooms", "expenseFB", "expenseEvents", "expenseOther",
    "expenseMarketing", "expensePropertyOps", "expenseAdmin", "expenseIT",
    "expenseUtilitiesVar", "expenseUtilitiesFixed", "expenseUtilities",
    "expenseTaxes", "expenseFFE", "expenseOtherCosts", "expenseInsurance",
    "expensePlatformFees", "expensePreOpening",
    "feeBase", "feeIncentive",
    "totalExpenses", "gop", "agop", "noi", "anoi",
    "interestExpense", "depreciationExpense", "incomeTax", "netIncome",
    "principalPayment", "debtPayment", "refinancingProceeds",
    "accountsReceivable", "accountsPayable", "workingCapitalChange",
    "nolBalance",
    "cashFlow", "operatingCashFlow", "financingCashFlow", "endingCash",
    "soldRooms", "availableRooms",
  ] as const;

  for (const field of consSumFields) {
    it(`consolidated ${field} = sum of all properties (every year)`, () => {
      for (let y = 0; y < 10; y++) {
        const sum = (yearly1[y] as Record<string, number>)[field] +
                    (yearly2[y] as Record<string, number>)[field] +
                    (yearly3[y] as Record<string, number>)[field];
        const consValue = (consolidated[y] as Record<string, number>)[field];
        expect(consValue).toBeCloseTo(sum, PENNY);
      }
    });
  }

  it("consolidated cleanAdr = weighted average (roomRev / soldRooms)", () => {
    for (let y = 0; y < 10; y++) {
      const totalRoomRev = yearly1[y].revenueRooms + yearly2[y].revenueRooms + yearly3[y].revenueRooms;
      const totalSold = yearly1[y].soldRooms + yearly2[y].soldRooms + yearly3[y].soldRooms;
      const expectedAdr = totalSold > 0 ? totalRoomRev / totalSold : 0;
      expect(consolidated[y].cleanAdr).toBeCloseTo(expectedAdr, PENNY);
    }
  });

  it("consolidated service fee categories sum across properties", () => {
    for (let y = 0; y < 10; y++) {
      const allCats = new Set([
        ...Object.keys(yearly1[y].serviceFeesByCategory),
        ...Object.keys(yearly2[y].serviceFeesByCategory),
        ...Object.keys(yearly3[y].serviceFeesByCategory),
      ]);
      for (const cat of allCats) {
        const sum = (yearly1[y].serviceFeesByCategory[cat] ?? 0) +
                    (yearly2[y].serviceFeesByCategory[cat] ?? 0) +
                    (yearly3[y].serviceFeesByCategory[cat] ?? 0);
        expect(consolidated[y].serviceFeesByCategory[cat] ?? 0).toBeCloseTo(sum, PENNY);
      }
    }
  });

  it("all consolidated yearly values are finite", () => {
    for (const cy of consolidated) {
      for (const field of consSumFields) {
        const val = (cy as Record<string, number>)[field];
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });
});

describe("T007 — Accounting Identity Cross-Checks (Yearly)", () => {
  const property = makeProperty();
  const monthly = generatePropertyProForma(property, baseGlobal, 120);
  const yearly = aggregatePropertyByYear(monthly, 10);

  it("GOP = revenueTotal - totalOperatingExpenses (every year)", () => {
    for (const y of yearly) {
      const totalOpEx =
        y.expenseRooms + y.expenseFB + y.expenseEvents + y.expenseOther +
        y.expenseMarketing + y.expensePropertyOps +
        y.expenseUtilitiesVar + y.expenseUtilitiesFixed +
        y.expenseAdmin + y.expenseIT +
        y.expenseInsurance + y.expenseOtherCosts +
        y.expensePlatformFees + y.expensePreOpening;
      expect(y.gop).toBeCloseTo(y.revenueTotal - totalOpEx, PENNY);
    }
  });

  it("AGOP = GOP - feeBase - feeIncentive (every year)", () => {
    for (const y of yearly) {
      expect(y.agop).toBeCloseTo(y.gop - y.feeBase - y.feeIncentive, PENNY);
    }
  });

  it("NOI = AGOP - taxes (every year)", () => {
    for (const y of yearly) {
      expect(y.noi).toBeCloseTo(y.agop - y.expenseTaxes, PENNY);
    }
  });

  it("ANOI = NOI - FFE (every year)", () => {
    for (const y of yearly) {
      expect(y.anoi).toBeCloseTo(y.noi - y.expenseFFE, PENNY);
    }
  });

  it("OCF = netIncome + depreciation (ASC 230, every year)", () => {
    for (const y of yearly) {
      expect(y.operatingCashFlow).toBeCloseTo(y.netIncome + y.depreciationExpense, PENNY);
    }
  });

  it("financingCashFlow = -principalPayment (every year)", () => {
    for (const y of yearly) {
      expect(y.financingCashFlow).toBeCloseTo(-y.principalPayment, PENNY);
    }
  });

  it("cashFlow = ANOI - debtPayment - incomeTax (every year)", () => {
    for (const y of yearly) {
      expect(y.cashFlow).toBeCloseTo(y.anoi - y.debtPayment - y.incomeTax, PENNY);
    }
  });

  it("interest + principal = debtPayment (every year)", () => {
    for (const y of yearly) {
      if (y.debtPayment > 0) {
        expect(y.interestExpense + y.principalPayment).toBeCloseTo(y.debtPayment, PENNY);
      }
    }
  });
});

describe("T010 — Business Model Golden Scenarios", () => {
  describe("Lodge business model", () => {
    const lodgeDefaults = BUSINESS_MODEL_DEFAULTS.lodge;
    const lodge = makeProperty({
      type: "Full Equity",
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
      revShareEvents: lodgeDefaults.revShareEvents,
      revShareFB: lodgeDefaults.revShareFB,
      revShareOther: lodgeDefaults.revShareOther,
      cateringBoostPercent: lodgeDefaults.cateringBoostPct,
      baseManagementFeeRate: lodgeDefaults.baseMgmtFeeRate,
      incentiveManagementFeeRate: lodgeDefaults.incentiveMgmtFeeRate,
    });

    const lodgeGlobal = {
      ...baseGlobal,
      inflationRate: 0,
      fixedCostEscalationRate: 0,
      eventExpenseRate: lodgeDefaults.eventExpenseRate,
      otherExpenseRate: lodgeDefaults.otherExpenseRate,
    };

    const result = generatePropertyProForma(lodge, lodgeGlobal, 12);
    const m = result[0];

    it("lodge has zero event revenue", () => {
      expect(m.revenueEvents).toBe(0);
    });

    it("lodge F&B share matches config", () => {
      expect(m.revenueFB).toBeCloseTo(m.revenueRooms * lodgeDefaults.revShareFB, PENNY);
    });

    it("lodge management fee uses lodge rate", () => {
      expect(m.feeBase).toBeCloseTo(m.revenueTotal * lodgeDefaults.baseMgmtFeeRate, PENNY);
    });

    it("all lodge monthly values are finite", () => {
      for (const month of result) {
        expect(Number.isFinite(month.revenueTotal)).toBe(true);
        expect(Number.isFinite(month.gop)).toBe(true);
        expect(Number.isFinite(month.noi)).toBe(true);
        expect(Number.isFinite(month.cashFlow)).toBe(true);
      }
    });

    it("lodge month 1 golden values are pinned", () => {
      const m = result[0];
      const avail = 5 * DAYS_PER_MONTH;
      const sold = avail * 0.55;
      const revRooms = sold * 350;
      expect(m.revenueRooms).toBeCloseTo(revRooms, PENNY);
      expect(m.revenueEvents).toBe(0);
      const revFB = revRooms * lodgeDefaults.revShareFB;
      expect(m.revenueFB).toBeCloseTo(revFB, PENNY);
      const revOther = revRooms * lodgeDefaults.revShareOther;
      expect(m.revenueOther).toBeCloseTo(revOther, PENNY);
      const revTotal = revRooms + revFB + revOther;
      expect(m.revenueTotal).toBeCloseTo(revTotal, PENNY);
      const expRooms = revRooms * lodgeDefaults.costRateRooms;
      expect(m.expenseRooms).toBeCloseTo(expRooms, PENNY);
      const feeBase = revTotal * lodgeDefaults.baseMgmtFeeRate;
      expect(m.feeBase).toBeCloseTo(feeBase, PENNY);
    });

    it("lodge all 12 months produce identical revenue (zero growth)", () => {
      const m1Rev = result[0].revenueTotal;
      for (let i = 1; i < 12; i++) {
        expect(result[i].revenueTotal).toBeCloseTo(m1Rev, PENNY);
      }
    });

    it("lodge GOP identity holds every month", () => {
      for (const m of result) {
        const totalOpEx =
          m.expenseRooms + m.expenseFB + m.expenseEvents + m.expenseOther +
          m.expenseMarketing + m.expensePropertyOps + m.expenseUtilitiesVar +
          m.expenseAdmin + m.expenseIT +
          m.expenseUtilitiesFixed + m.expenseInsurance + m.expenseOtherCosts +
          m.expensePlatformFees + m.expensePreOpening;
        expect(m.gop).toBeCloseTo(m.revenueTotal - totalOpEx, PENNY);
      }
    });
  });

  describe("VRBO/STR business model", () => {
    const vrboDefaults = BUSINESS_MODEL_DEFAULTS.vrbo;
    const vrbo = makeProperty({
      type: "Full Equity",
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
      costRateInsurance: vrboDefaults.costRateInsurance,
      revShareEvents: vrboDefaults.revShareEvents,
      revShareFB: vrboDefaults.revShareFB,
      revShareOther: vrboDefaults.revShareOther,
      cateringBoostPercent: vrboDefaults.cateringBoostPct,
      baseManagementFeeRate: vrboDefaults.baseMgmtFeeRate,
      incentiveManagementFeeRate: vrboDefaults.incentiveMgmtFeeRate,
      platformFeeRate: vrboDefaults.platformFeeRate,
    });

    const vrboGlobal = {
      ...baseGlobal,
      inflationRate: 0,
      fixedCostEscalationRate: 0,
      eventExpenseRate: vrboDefaults.eventExpenseRate,
      otherExpenseRate: vrboDefaults.otherExpenseRate,
    };

    const result = generatePropertyProForma(vrbo, vrboGlobal, 12);
    const m = result[0];

    it("VRBO has zero event revenue", () => {
      expect(m.revenueEvents).toBe(0);
    });

    it("VRBO has zero F&B revenue", () => {
      expect(m.revenueFB).toBe(0);
    });

    it("VRBO platform fees are deducted correctly", () => {
      expect(m.expensePlatformFees).toBeCloseTo(
        m.revenueRooms * vrboDefaults.platformFeeRate,
        PENNY
      );
    });

    it("VRBO management fee applied to net revenue (after platform fees)", () => {
      const netRev = m.revenueTotal - m.expensePlatformFees;
      expect(m.feeBase).toBeCloseTo(netRev * vrboDefaults.baseMgmtFeeRate, PENNY);
    });

    it("VRBO has zero incentive fee", () => {
      expect(m.feeIncentive).toBe(0);
    });

    it("all VRBO monthly values are finite", () => {
      for (const month of result) {
        expect(Number.isFinite(month.revenueTotal)).toBe(true);
        expect(Number.isFinite(month.gop)).toBe(true);
        expect(Number.isFinite(month.noi)).toBe(true);
        expect(Number.isFinite(month.cashFlow)).toBe(true);
      }
    });

    it("VRBO month 1 golden values are pinned", () => {
      const avail = 1 * DAYS_PER_MONTH;
      const sold = avail * 0.65;
      const revRooms = sold * 250;
      expect(m.revenueRooms).toBeCloseTo(revRooms, PENNY);
      expect(m.revenueEvents).toBe(0);
      expect(m.revenueFB).toBe(0);
      const revOther = revRooms * vrboDefaults.revShareOther;
      expect(m.revenueOther).toBeCloseTo(revOther, PENNY);
      const revTotal = revRooms + revOther;
      expect(m.revenueTotal).toBeCloseTo(revTotal, PENNY);
      const platformFees = revRooms * vrboDefaults.platformFeeRate;
      expect(m.expensePlatformFees).toBeCloseTo(platformFees, PENNY);
      const netRev = revTotal - platformFees;
      const feeBase = netRev * vrboDefaults.baseMgmtFeeRate;
      expect(m.feeBase).toBeCloseTo(feeBase, PENNY);
    });

    it("VRBO all 12 months produce identical revenue (zero growth)", () => {
      const m1Rev = result[0].revenueTotal;
      for (let i = 1; i < 12; i++) {
        expect(result[i].revenueTotal).toBeCloseTo(m1Rev, PENNY);
      }
    });

    it("VRBO GOP identity holds every month", () => {
      for (const month of result) {
        const totalOpEx =
          month.expenseRooms + month.expenseFB + month.expenseEvents + month.expenseOther +
          month.expenseMarketing + month.expensePropertyOps + month.expenseUtilitiesVar +
          month.expenseAdmin + month.expenseIT +
          month.expenseUtilitiesFixed + month.expenseInsurance + month.expenseOtherCosts +
          month.expensePlatformFees + month.expensePreOpening;
        expect(month.gop).toBeCloseTo(month.revenueTotal - totalOpEx, PENNY);
      }
    });

    it("VRBO cashFlow = ANOI - incomeTax every month (no debt)", () => {
      for (const month of result) {
        expect(month.cashFlow).toBeCloseTo(month.anoi - month.incomeTax, PENNY);
      }
    });
  });
});

describe("T011 — Engine Edge Case Tests", () => {
  it("partial projection horizon (36 months) runs correctly", () => {
    const prop = makeProperty({ type: "Full Equity" });
    const result = generatePropertyProForma(prop, { ...baseGlobal, projectionYears: 3 }, 36);
    expect(result).toHaveLength(36);
    for (const m of result) {
      expect(Number.isFinite(m.cashFlow)).toBe(true);
      expect(Number.isFinite(m.revenueTotal)).toBe(true);
    }
  });

  it("1-month projection produces valid output", () => {
    const prop = makeProperty({ type: "Full Equity" });
    const result = generatePropertyProForma(prop, baseGlobal, 1);
    expect(result).toHaveLength(1);
    expect(Number.isFinite(result[0].cashFlow)).toBe(true);
  });

  it("100% occupancy produces maximum revenue", () => {
    const prop = makeProperty({
      type: "Full Equity",
      startOccupancy: 1.0,
      maxOccupancy: 1.0,
      adrGrowthRate: 0,
    });
    const g = { ...baseGlobal, inflationRate: 0, fixedCostEscalationRate: 0 };
    const result = generatePropertyProForma(prop, g, 12);
    for (const m of result) {
      expect(m.soldRooms).toBeCloseTo(m.availableRooms, PENNY);
      expect(Number.isFinite(m.revenueTotal)).toBe(true);
    }
  });

  it("zero-rate loan (cash-equivalent) produces zero interest", () => {
    const prop = makeProperty({
      type: "Financed",
      acquisitionLTV: 0.50,
      acquisitionInterestRate: 0,
      acquisitionTermYears: 10,
    });
    const result = generatePropertyProForma(prop, baseGlobal, 12);
    for (const m of result) {
      expect(m.interestExpense).toBe(0);
      if (m.debtPayment > 0) {
        expect(m.principalPayment).toBeCloseTo(m.debtPayment, PENNY);
      }
    }
  });

  it("very high ADR ($10,000) doesn't overflow", () => {
    const prop = makeProperty({ type: "Full Equity", startAdr: 10_000, adrGrowthRate: 0 });
    const g = { ...baseGlobal, inflationRate: 0 };
    const result = generatePropertyProForma(prop, g, 120);
    for (const m of result) {
      expect(Number.isFinite(m.revenueTotal)).toBe(true);
      expect(Number.isFinite(m.cashFlow)).toBe(true);
      expect(m.revenueTotal).toBeGreaterThan(0);
    }
  });

  it("very low ADR ($1) produces positive but small revenue", () => {
    const prop = makeProperty({ type: "Full Equity", startAdr: 1, adrGrowthRate: 0 });
    const g = { ...baseGlobal, inflationRate: 0 };
    const result = generatePropertyProForma(prop, g, 12);
    for (const m of result) {
      expect(m.revenueTotal).toBeGreaterThan(0);
      expect(Number.isFinite(m.cashFlow)).toBe(true);
    }
  });

  it("30-year projection (360 months) runs without error", () => {
    const prop = makeProperty({ type: "Full Equity", adrGrowthRate: 0.03 });
    const g = { ...baseGlobal, projectionYears: 30, inflationRate: 0.03 };
    const result = generatePropertyProForma(prop, g, 360);
    expect(result).toHaveLength(360);
    expect(Number.isFinite(result[359].revenueTotal)).toBe(true);
    expect(Number.isFinite(result[359].cashFlow)).toBe(true);
    expect(result[359].revenueTotal).toBeGreaterThan(result[0].revenueTotal);
  });

  it("pre-acquisition months have zero revenue and expenses", () => {
    const prop = makeProperty({
      type: "Full Equity",
      operationsStartDate: "2026-10-01",
      acquisitionDate: "2026-10-01",
    });
    const g = { ...baseGlobal, modelStartDate: "2026-04-01" };
    const result = generatePropertyProForma(prop, g, 12);
    for (let i = 0; i < 6; i++) {
      expect(result[i].revenueTotal).toBe(0);
      expect(result[i].soldRooms).toBe(0);
    }
    expect(result[6].revenueTotal).toBeGreaterThan(0);
  });
});
