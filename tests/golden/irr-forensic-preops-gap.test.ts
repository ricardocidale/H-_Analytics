import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine";
import { aggregateCashFlowByYear } from "../../client/src/lib/financial/cashFlowAggregator";
import { pmt } from "../../calc/shared/pmt";
import { computeIRR } from "../../analytics/returns/irr";
import { makePropertyInput as makeProperty, makeGlobalInput as makeGlobal } from "../fixtures/factories";
import {
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_COMMISSION_RATE,
} from "../../shared/constants";

function calculateNPV(cashFlows: number[], rate: number): number {
  return cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FORENSIC IRR TEST 2: "The Pre-Ops Gap"
 *
 * Same scenario as Test 1, but with a 6-month gap between acquisition and
 * operations start. During the gap, debt service accrues with zero revenue.
 * This tests the highest-risk area identified in the audit: can pre-ops debt
 * payments create a misleading IRR?
 *
 * Scenario:
 *   Acquisition: 2026-01-01 | Operations start: 2026-07-01 (6-month gap)
 *   20 rooms | $200 ADR | 70% occ | 0% growth | 0% inflation
 *   $2,000,000 | 60% LTV @ 8% / 25yr | $250,000 operating reserve
 *   25% tax | 8.5% exit cap | 5% commission | 10-year hold
 *
 * Key verification points:
 *   - Months 1-6: zero revenue, debt service accruing, reserve covering cash
 *   - Year 1: only 6 months of revenue but 12 months of debt service
 *   - IRR should be LOWER than the no-gap scenario (Test 1)
 *   - Operating reserve seeds initial cash balance
 * ═══════════════════════════════════════════════════════════════════════════════
 */
describe("Forensic IRR Test 2 — Pre-Ops Gap (6 Months)", () => {
  const property = makeProperty({
    purchasePrice: 2_000_000,
    roomCount: 20,
    startAdr: 200,
    startOccupancy: 0.70,
    maxOccupancy: 0.70,
    occupancyGrowthStep: 0,
    adrGrowthRate: 0.0,
    type: "Financed",
    acquisitionLTV: 0.60,
    acquisitionInterestRate: 0.08,
    acquisitionTermYears: 25,
    landValuePercent: 0.25,
    buildingImprovements: 0,
    taxRate: 0.25,
    operatingReserve: 250_000,
    acquisitionDate: "2026-01-01",
    operationsStartDate: "2026-07-01",
    revShareEvents: 0.30,
    revShareFB: 0.18,
    revShareOther: 0.05,
    cateringBoostPercent: 0.22,
    baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
    incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  });

  const global = makeGlobal({
    modelStartDate: "2026-01-01",
    projectionYears: 10,
    inflationRate: 0.0,
    fixedCostEscalationRate: 0.0,
  });

  const MONTHS = 120;
  const YEARS = 10;
  const PENNY = 2;

  const monthly = generatePropertyProForma(property, global, MONTHS);
  const yearly = aggregateCashFlowByYear(monthly, property, global, YEARS);

  // Hand-calculated constants
  const loanAmount = 1_200_000;
  const monthlyRate = 0.08 / 12;
  const monthlyPayment = pmt(loanAmount, monthlyRate, 300);
  const equityInvested = 2_000_000 + 250_000 - loanAmount; // purchase + reserve - loan = 1,050,000

  // ── Pre-Ops Gap Verification ──────────────────────────────────────────────

  it("months 1-6 have zero revenue (pre-ops gap)", () => {
    for (let i = 0; i < 6; i++) {
      expect(monthly[i].revenueTotal).toBe(0);
      expect(monthly[i].revenueRooms).toBe(0);
    }
  });

  it("months 1-6 have debt service accruing (acquired but not operating)", () => {
    for (let i = 0; i < 6; i++) {
      expect(monthly[i].debtPayment).toBeCloseTo(monthlyPayment, PENNY);
      expect(monthly[i].interestExpense).toBeGreaterThan(0);
    }
  });

  it("month 7 onward has full revenue (operations started)", () => {
    for (let i = 6; i < MONTHS; i++) {
      expect(monthly[i].revenueTotal).toBeGreaterThan(100_000);
    }
  });

  it("operating reserve seeds initial cash balance", () => {
    // Reserve is added to cumulative cash at acquisition month
    // Month 0 ending cash = reserve + month 0 cash flow (which is negative: -debt payment)
    expect(monthly[0].endingCash).toBeCloseTo(250_000 + monthly[0].cashFlow, PENNY);
  });

  it("cash stays positive through pre-ops gap (reserve covers debt)", () => {
    // The reserve should be large enough to cover 6 months of debt service
    const sixMonthsDebt = monthlyPayment * 6;
    expect(250_000).toBeGreaterThan(sixMonthsDebt); // reserve > gap debt
    for (let i = 0; i < 6; i++) {
      expect(monthly[i].endingCash).toBeGreaterThan(0);
    }
  });

  // ── Year 1 Cash Flow Verification ─────────────────────────────────────────

  it("year 1 has 12 months of debt service but only 6 months of revenue", () => {
    expect(yearly[0].debtService).toBeCloseTo(monthlyPayment * 12, 0);
    // Year 1 NOI = 6 months of operational NOI (months 7-12)
    expect(yearly[0].noi).toBeLessThan(yearly[1].noi); // year 1 < year 2 (partial)
  });

  it("year 2 onward has full 12-month revenue", () => {
    for (let y = 1; y < YEARS; y++) {
      expect(yearly[y].noi).toBeCloseTo(yearly[1].noi, 0); // all equal (flat)
    }
  });

  // ── IRR Vector Decomposition ──────────────────────────────────────────────

  it("netCashFlowToInvestors = atcf + refi + exit - equity for every year", () => {
    for (let y = 0; y < YEARS; y++) {
      const isAcqYear = y === 0;
      const isExitYear = y === YEARS - 1;
      const expected =
        yearly[y].atcf +
        yearly[y].refinancingProceeds +
        (isExitYear ? yearly[y].exitValue : 0) -
        (isAcqYear ? yearly[y].capitalExpenditures : 0);
      expect(yearly[y].netCashFlowToInvestors).toBeCloseTo(expected, PENNY);
    }
  });

  it("year 0 net cash flow is negative (equity + gap debt > partial revenue)", () => {
    expect(yearly[0].netCashFlowToInvestors).toBeLessThan(0);
  });

  // ── IRR Computation ──────────────────────────────────────────────────────

  it("IRR converges and is positive", () => {
    const vector = yearly.map(y => y.netCashFlowToInvestors);
    const irrResult = computeIRR(vector, 1);
    expect(irrResult.converged).toBe(true);
    expect(irrResult.irr_periodic!).toBeGreaterThan(0);
  });

  it("NPV at IRR ≈ $0", () => {
    const vector = yearly.map(y => y.netCashFlowToInvestors);
    const irrResult = computeIRR(vector, 1);
    const npv = calculateNPV(vector, irrResult.irr_periodic!);
    expect(Math.abs(npv)).toBeLessThan(0.01);
  });

  it("pre-ops gap IRR is LOWER than no-gap scenario", () => {
    // No-gap scenario from Test 1: ~47.44%
    // Gap scenario: equity is higher ($1,050K vs $800K due to reserve),
    // year 1 revenue is halved, same debt — IRR must be lower
    const vector = yearly.map(y => y.netCashFlowToInvestors);
    const irrResult = computeIRR(vector, 1);
    expect(irrResult.irr_periodic!).toBeLessThan(0.4744);
  });

  // ── Balance Sheet & Cash Tracking ─────────────────────────────────────────

  it("cumulative cash tracks correctly through the gap and operations", () => {
    let cumCash = 250_000; // reserve seeds initial cash
    for (let i = 0; i < MONTHS; i++) {
      cumCash += monthly[i].cashFlow;
      expect(monthly[i].endingCash).toBeCloseTo(cumCash, PENNY);
    }
  });

  it("exit value is positive (property worth more than remaining debt)", () => {
    expect(yearly[9].exitValue).toBeGreaterThan(0);
  });

  it("IRR is reasonable for a leveraged hotel with pre-ops gap (15-45%)", () => {
    const vector = yearly.map(y => y.netCashFlowToInvestors);
    const irrResult = computeIRR(vector, 1);
    expect(irrResult.irr_periodic!).toBeGreaterThan(0.15);
    expect(irrResult.irr_periodic!).toBeLessThan(0.45);
  });
});
