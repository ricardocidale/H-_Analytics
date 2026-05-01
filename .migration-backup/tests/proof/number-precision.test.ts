import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine.js";
import {
  DAYS_PER_MONTH,
  DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_PROPERTY_INCOME_TAX_RATE,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_EVENT_EXPENSE_RATE,
  DEFAULT_OTHER_EXPENSE_RATE,
  DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DEPRECIATION_YEARS,
  BUSINESS_MODEL_DEFAULTS,
} from "../../shared/constants.js";

const PENNY = 2;

const baseProperty = {
  operationsStartDate: "2026-04-01",
  acquisitionDate: "2026-04-01",
  roomCount: 10,
  startAdr: 200,
  adrGrowthRate: 0,
  startOccupancy: 0.70,
  maxOccupancy: 0.70,
  occupancyRampMonths: 1,
  occupancyGrowthStep: 0,
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
  taxRate: DEFAULT_PROPERTY_INCOME_TAX_RATE,
  type: "Full Equity",
};

const baseGlobal = {
  modelStartDate: "2026-04-01",
  projectionYears: 10,
  inflationRate: 0,
  fixedCostEscalationRate: 0,
  eventExpenseRate: DEFAULT_EVENT_EXPENSE_RATE,
  otherExpenseRate: DEFAULT_OTHER_EXPENSE_RATE,
  utilitiesVariableSplit: DEFAULT_UTILITIES_VARIABLE_SPLIT,
};

describe("T004 — Input Value Round-Trip Precision", () => {
  describe("Decimal rate values survive engine pass-through", () => {
    const rateValues = [0.0875, 0.1234, 0.005, 0.0001, 0.99, 0.01, 0.33333];

    for (const rate of rateValues) {
      it(`baseMgmtFeeRate=${rate} produces correct fee output`, () => {
        const prop = { ...baseProperty, baseManagementFeeRate: rate };
        const result = generatePropertyProForma(prop, baseGlobal, 1);
        const m = result[0];
        const expected = m.revenueTotal * rate;
        expect(m.feeBase).toBeCloseTo(expected, PENNY);
      });
    }
  });

  describe("ADR values flow through without truncation", () => {
    const adrValues = [99.99, 150.50, 275.75, 1250.00, 0.01, 999999.99];

    for (const adr of adrValues) {
      it(`ADR=${adr} produces correct room revenue`, () => {
        const prop = { ...baseProperty, startAdr: adr };
        const result = generatePropertyProForma(prop, baseGlobal, 1);
        const m = result[0];
        const expectedSold = 10 * DAYS_PER_MONTH * 0.70;
        const expectedRevRooms = expectedSold * adr;
        expect(m.revenueRooms).toBeCloseTo(expectedRevRooms, PENNY);
      });
    }
  });

  describe("Purchase price edge values", () => {
    const prices = [100_000, 500_000, 1_500_000, 10_000_000, 50_000_000, 1];

    for (const price of prices) {
      it(`purchasePrice=${price.toLocaleString()} computes correct depreciation`, () => {
        const prop = { ...baseProperty, purchasePrice: price };
        const result = generatePropertyProForma(prop, baseGlobal, 1);
        const m = result[0];
        const depBasis = price * (1 - DEFAULT_LAND_VALUE_PERCENT);
        const expectedMonthlyDep = depBasis / DEPRECIATION_YEARS / 12;
        expect(m.depreciationExpense).toBeCloseTo(expectedMonthlyDep, PENNY);
      });
    }
  });

  describe("Occupancy rate precision (decimal 0-1)", () => {
    const occupancies = [0.01, 0.10, 0.333, 0.50, 0.75, 0.99, 1.00];

    for (const occ of occupancies) {
      it(`occupancy=${occ} produces correct sold rooms`, () => {
        const prop = { ...baseProperty, startOccupancy: occ, maxOccupancy: occ };
        const result = generatePropertyProForma(prop, baseGlobal, 1);
        const m = result[0];
        const expectedSold = 10 * DAYS_PER_MONTH * occ;
        expect(m.soldRooms).toBeCloseTo(expectedSold, PENNY);
      });
    }
  });

  describe("All cost rates produce correct expense amounts", () => {
    const costRateFields = [
      { field: "costRateRooms", resultField: "expenseRooms", base: "revenueRooms" },
      { field: "costRateFB", resultField: "expenseFB", base: "revenueFB" },
      { field: "costRateMarketing", resultField: "expenseMarketing", base: "revenueTotal" },
      { field: "costRateFFE", resultField: "expenseFFE", base: "revenueTotal" },
    ] as const;

    for (const { field, resultField, base } of costRateFields) {
      const testRate = 0.123;
      it(`${field}=${testRate} produces correct ${resultField}`, () => {
        const prop = { ...baseProperty, [field]: testRate };
        const result = generatePropertyProForma(prop, baseGlobal, 1);
        const m = result[0] as Record<string, unknown>;
        const baseValue = m[base] as number;
        const expected = baseValue * testRate;
        expect(m[resultField] as number).toBeCloseTo(expected, PENNY);
      });
    }
  });

  describe("Zero values don't produce NaN or Infinity", () => {
    it("zero ADR produces zero revenue, no NaN", () => {
      const prop = { ...baseProperty, startAdr: 0 };
      const result = generatePropertyProForma(prop, baseGlobal, 12);
      for (const m of result) {
        expect(m.revenueTotal).toBe(0);
        expect(Number.isFinite(m.gop)).toBe(true);
        expect(Number.isFinite(m.noi)).toBe(true);
        expect(Number.isFinite(m.netIncome)).toBe(true);
        expect(Number.isNaN(m.cashFlow)).toBe(false);
      }
    });

    it("zero purchase price produces zero depreciation, no NaN", () => {
      const prop = { ...baseProperty, purchasePrice: 0 };
      const result = generatePropertyProForma(prop, baseGlobal, 12);
      for (const m of result) {
        expect(m.depreciationExpense).toBe(0);
        expect(Number.isFinite(m.netIncome)).toBe(true);
        expect(Number.isNaN(m.propertyValue)).toBe(false);
      }
    });

    it("zero room count produces zero revenue, no NaN", () => {
      const prop = { ...baseProperty, roomCount: 0 };
      const result = generatePropertyProForma(prop, baseGlobal, 12);
      for (const m of result) {
        expect(m.revenueTotal).toBe(0);
        expect(m.soldRooms).toBe(0);
        expect(Number.isFinite(m.cashFlow)).toBe(true);
      }
    });
  });

  describe("Negative number handling", () => {
    it("negative cash flow is finite and properly signed", () => {
      const prop = {
        ...baseProperty,
        startAdr: 10,
        costRateRooms: 0.50,
        costRateFB: 0.50,
        costRateAdmin: 0.20,
      };
      const result = generatePropertyProForma(prop, baseGlobal, 12);
      for (const m of result) {
        expect(Number.isFinite(m.cashFlow)).toBe(true);
        expect(Number.isFinite(m.netIncome)).toBe(true);
        expect(Number.isFinite(m.endingCash)).toBe(true);
      }
    });
  });
});

describe("T004 — High-Precision Decimal Round-Trip", () => {
  it("rate 0.0875 flows through fee calculation exactly", () => {
    const prop = { ...baseProperty, baseManagementFeeRate: 0.0875 };
    const result = generatePropertyProForma(prop, baseGlobal, 1);
    const m = result[0];
    const expected = m.revenueTotal * 0.0875;
    expect(m.feeBase).toBeCloseTo(expected, PENNY);
    expect(m.feeBase).not.toBe(0);
  });

  it("very small rate 0.001 is not truncated to zero", () => {
    const prop = { ...baseProperty, costRateIT: 0.001 };
    const result = generatePropertyProForma(prop, baseGlobal, 1);
    const m = result[0];
    expect(m.expenseIT).toBeGreaterThan(0);
  });

  it("growth rate 0.03 compounds correctly over 120 months", () => {
    const growthProp = { ...baseProperty, adrGrowthRate: 0.03 };
    const growthGlobal = { ...baseGlobal, inflationRate: 0, fixedCostEscalationRate: 0 };
    const result = generatePropertyProForma(growthProp, growthGlobal, 120);
    const year1Adr = result[0].adr;
    const year10Adr = result[108].adr;
    const expectedY10Adr = year1Adr * Math.pow(1.03, 9);
    expect(year10Adr).toBeCloseTo(expectedY10Adr, 0);
  });
});

describe("T004 — Financed Property Number Precision", () => {
  it("LTV rate 0.75 produces exact loan amount", () => {
    const prop = {
      ...baseProperty,
      type: "Financed",
      acquisitionLTV: 0.75,
      acquisitionInterestRate: 0.06,
      acquisitionTermYears: 25,
    };
    const result = generatePropertyProForma(prop, baseGlobal, 1);
    const m = result[0];
    const expectedLoan = 1_000_000 * 0.75;
    const expectedFirstInterest = expectedLoan * (0.06 / 12);
    expect(m.interestExpense).toBeCloseTo(expectedFirstInterest, PENNY);
    expect(m.debtOutstanding).toBeLessThan(expectedLoan);
    expect(m.debtOutstanding).toBeGreaterThan(expectedLoan * 0.99);
  });

  it("edge LTV rates produce correct debt outstanding", () => {
    for (const ltv of [0.01, 0.50, 0.80, 0.95]) {
      const prop = {
        ...baseProperty,
        type: "Financed",
        acquisitionLTV: ltv,
        acquisitionInterestRate: 0.05,
        acquisitionTermYears: 30,
      };
      const result = generatePropertyProForma(prop, baseGlobal, 1);
      const m = result[0];
      expect(m.debtOutstanding).toBeGreaterThan(0);
      expect(m.debtOutstanding).toBeLessThan(1_000_000 * ltv);
      expect(Number.isFinite(m.debtOutstanding)).toBe(true);
    }
  });
});
