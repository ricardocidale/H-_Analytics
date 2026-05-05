import { describe, it, expect } from "vitest";
import { analyzePortfolioCapitalRaise } from "./portfolio-capital-raise.js";
import type { PropertyInput, GlobalInput, MonthlyFinancials } from "../types.js";

// ---------------------------------------------------------------------------
// Minimal factory helpers
// ---------------------------------------------------------------------------

function makeGlobal(overrides: Partial<GlobalInput> = {}): GlobalInput {
  return {
    modelStartDate: "2025-01-01",
    inflationRate: 0.03,
    marketingRate: 0.02,
    projectionYears: 10,
    exitCapRate: 0.07,
    debtAssumptions: {
      interestRate: 0.065,
      amortizationYears: 25,
    },
    ...overrides,
  };
}

function makeProperty(overrides: Partial<PropertyInput> = {}): PropertyInput {
  return {
    operationsStartDate: "2025-01-01",
    roomCount: 20,
    startAdr: 200,
    adrGrowthRate: 0.03,
    startOccupancy: 0.5,
    maxOccupancy: 0.8,
    occupancyRampMonths: 12,
    occupancyGrowthStep: 0.05,
    purchasePrice: 1_000_000,
    buildingImprovements: 200_000,
    type: "Financed",
    acquisitionLTV: 0.65,
    acquisitionInterestRate: 0.065,
    acquisitionTermYears: 25,
    costRateRooms: 0.25,
    costRateFB: 0.3,
    costRateAdmin: 0.08,
    costRateMarketing: 0.04,
    costRatePropertyOps: 0.05,
    costRateUtilities: 0.03,
    costRateTaxes: 0.02,
    costRateIT: 0.01,
    costRateFFE: 0.02,
    costRateOther: 0.01,
    costRateInsurance: 0.01,
    revShareEvents: 0.1,
    revShareFB: 0.3,
    revShareOther: 0.05,
    ...overrides,
  };
}

/**
 * Build a minimal MonthlyFinancials array with constant NOI for testing.
 * Returns 120 months (10 years) of flat NOI.
 */
function makeProForma(monthlyNoi: number, length = 120): MonthlyFinancials[] {
  return Array.from({ length }, (_, i) => ({
    date: new Date(2025, i, 1),
    monthIndex: i,
    occupancy: 0.7,
    adr: 200,
    availableRooms: 600,
    soldRooms: 420,
    revenueRooms: 84_000,
    revenueEvents: 0,
    revenueFB: 0,
    revenueOther: 0,
    revenueTotal: 84_000,
    expenseRooms: 0,
    expenseFB: 0,
    expenseEvents: 0,
    expenseOther: 0,
    expenseMarketing: 0,
    expensePropertyOps: 0,
    expenseUtilitiesVar: 0,
    expenseFFE: 0,
    feeBase: 0,
    feeIncentive: 0,
    serviceFeesByCategory: {},
    expenseAdmin: 0,
    expenseIT: 0,
    expenseTaxes: 0,
    expenseUtilitiesFixed: 0,
    expenseEWW: 0,
    expenseInsurance: 0,
    expenseOtherCosts: 0,
    expensePlatformFees: 0,
    expensePreOpening: 0,
    totalExpenses: 0,
    gop: monthlyNoi,
    agop: monthlyNoi,
    noi: monthlyNoi,
    anoi: monthlyNoi,
    interestExpense: 0,
    principalPayment: 0,
    debtPayment: 0,
    netIncome: monthlyNoi,
    incomeTax: 0,
    cashFlow: monthlyNoi,
    depreciationExpense: 0,
    propertyValue: 1_200_000,
    debtOutstanding: 780_000,
    refinancingProceeds: 0,
    operatingCashFlow: monthlyNoi,
    financingCashFlow: 0,
    endingCash: monthlyNoi * (i + 1),
    accountsReceivable: 0,
    accountsPayable: 0,
    workingCapitalChange: 0,
    nolBalance: 0,
    cashShortfall: false,
    deferredFees: 0,
    cumulativeDeferredFees: 0,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("analyzePortfolioCapitalRaise()", () => {
  describe("edge case: empty properties array", () => {
    it("returns zeroed result without throwing", () => {
      const result = analyzePortfolioCapitalRaise([], {}, makeGlobal());
      expect(result.perPropertyEquity).toEqual([]);
      expect(result.totalEquityRequired).toBe(0);
      expect(result.firstCloseMinimum).toBe(0);
      expect(result.rampOverlapWindows).toEqual([]);
      expect(result.portfolioDscrBlended).toBeNull();
      expect(result.impliedIrr).toBeNull();
      expect(result.rampCarryUnderstated).toBe(true);
    });
  });

  describe("edge case: acquisitionLTV = 0 (all-cash property)", () => {
    it("sets estimatedDscr to null and does not divide by zero", () => {
      const prop = makeProperty({ type: "Full Equity", acquisitionLTV: 0 });
      const proForma = makeProForma(8_000);
      const result = analyzePortfolioCapitalRaise([prop], { 0: proForma }, makeGlobal());

      expect(result.perPropertyEquity).toHaveLength(1);
      const summary = result.perPropertyEquity[0];
      expect(summary.ltv).toBe(0);
      expect(summary.estimatedDscr).toBeNull();
      // All-cash: equity = full cost (no loan subtracted)
      expect(summary.equityRequired).toBeGreaterThan(0);
    });
  });

  describe("happy path: single property", () => {
    it("returns one perPropertyEquity entry, no ramp overlap windows, and correct firstCloseMinimum", () => {
      const prop = makeProperty({
        acquisitionDate: "2025-01-01",
        operationsStartDate: "2025-01-01",
        occupancyRampMonths: 12,
      });
      const proForma = makeProForma(10_000);
      const result = analyzePortfolioCapitalRaise([prop], { 0: proForma }, makeGlobal());

      expect(result.perPropertyEquity).toHaveLength(1);
      expect(result.rampOverlapWindows).toHaveLength(0);

      const summary = result.perPropertyEquity[0];
      expect(summary.propertyIndex).toBe(0);
      expect(summary.deploymentMonth).toBe(0);
      expect(summary.equityRequired).toBeGreaterThan(0);

      // firstCloseMinimum = max(firstPropertyEquity, total * 30%)
      // For a single property they are equal, so firstCloseMinimum === equityRequired
      expect(result.firstCloseMinimum).toBe(summary.equityRequired);
      expect(result.totalEquityRequired).toBe(summary.equityRequired);
      expect(result.rampCarryUnderstated).toBe(true);
    });
  });

  describe("happy path: two properties with 9-month gap", () => {
    it("assigns distinct deploymentMonth values and detects ramp overlap when ramps overlap", () => {
      const prop0 = makeProperty({
        acquisitionDate: "2025-01-01",
        operationsStartDate: "2025-01-01",
        occupancyRampMonths: 12,
      });
      // Property 1 acquired 9 months after model start — ramps from month 9 to 21
      // Property 0 ramps from month 0 to 12 → overlap months 9-12
      const prop1 = makeProperty({
        acquisitionDate: "2025-10-01", // 9 months after 2025-01-01
        operationsStartDate: "2025-10-01",
        occupancyRampMonths: 12,
      });
      const proForma0 = makeProForma(10_000);
      const proForma1 = makeProForma(9_000);

      const result = analyzePortfolioCapitalRaise(
        [prop0, prop1],
        { 0: proForma0, 1: proForma1 },
        makeGlobal(),
      );

      expect(result.perPropertyEquity).toHaveLength(2);

      const [s0, s1] = result.perPropertyEquity;
      expect(s0.deploymentMonth).toBe(0);
      expect(s1.deploymentMonth).toBe(9);
      expect(s1.deploymentMonth).toBeGreaterThan(s0.deploymentMonth);

      // With ramps 0→12 and 9→21, months 9–11 (inclusive) have 2 concurrent — expect ≥1 overlap window
      expect(result.rampOverlapWindows.length).toBeGreaterThanOrEqual(1);
      const window = result.rampOverlapWindows[0];
      expect(window.concurrentCount).toBeGreaterThanOrEqual(2);
      expect(window.startMonth).toBeGreaterThanOrEqual(9);

      // Total equity is sum of both
      expect(result.totalEquityRequired).toBeCloseTo(s0.equityRequired + s1.equityRequired, 2);

      // firstCloseMinimum ≥ 30% of total
      expect(result.firstCloseMinimum).toBeGreaterThanOrEqual(result.totalEquityRequired * 0.30 - 0.01);

      expect(result.rampCarryUnderstated).toBe(true);
    });

    it("returns DSCR values for financed properties when NOI is available", () => {
      const prop0 = makeProperty({ acquisitionDate: "2025-01-01", operationsStartDate: "2025-01-01" });
      const prop1 = makeProperty({ acquisitionDate: "2025-10-01", operationsStartDate: "2025-10-01" });
      const proForma0 = makeProForma(10_000);
      const proForma1 = makeProForma(9_000);

      const result = analyzePortfolioCapitalRaise(
        [prop0, prop1],
        { 0: proForma0, 1: proForma1 },
        makeGlobal(),
      );

      for (const summary of result.perPropertyEquity) {
        // Both are financed with non-zero LTV → DSCR should be calculable (not null)
        expect(summary.estimatedDscr).not.toBeNull();
        expect(summary.estimatedDscr).toBeGreaterThan(0);
      }

      // Blended DSCR should be average of the two
      expect(result.portfolioDscrBlended).not.toBeNull();
      const avg = (result.perPropertyEquity[0].estimatedDscr! + result.perPropertyEquity[1].estimatedDscr!) / 2;
      expect(result.portfolioDscrBlended).toBeCloseTo(avg, 6);
    });
  });

  describe("impliedIrr", () => {
    it("returns null when exitCapRate is not provided", () => {
      const prop = makeProperty();
      const proForma = makeProForma(8_000);
      const globalNoExit = makeGlobal({ exitCapRate: undefined });
      const result = analyzePortfolioCapitalRaise([prop], { 0: proForma }, globalNoExit);
      expect(result.impliedIrr).toBeNull();
    });

    it("returns a positive number when exitCapRate and NOI are available", () => {
      const prop = makeProperty({
        acquisitionDate: "2025-01-01",
        operationsStartDate: "2025-01-01",
        occupancyRampMonths: 12,
      });
      const proForma = makeProForma(10_000);
      const result = analyzePortfolioCapitalRaise([prop], { 0: proForma }, makeGlobal());
      expect(result.impliedIrr).not.toBeNull();
      expect(result.impliedIrr).toBeGreaterThan(0);
    });
  });
});
