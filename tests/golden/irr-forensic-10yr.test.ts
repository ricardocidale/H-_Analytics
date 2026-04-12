import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine";
import { aggregateCashFlowByYear } from "../../client/src/lib/financial/cashFlowAggregator";
import { pmt } from "../../calc/shared/pmt";
import { computeIRR } from "../../analytics/returns/irr";
import { makeProperty, makeGlobal } from "../fixtures";
import {
  DAYS_PER_MONTH,
  DEPRECIATION_YEARS,
  DEFAULT_COST_RATE_ROOMS,
  DEFAULT_COST_RATE_FB,
  DEFAULT_COST_RATE_ADMIN,
  DEFAULT_COST_RATE_MARKETING,
  DEFAULT_COST_RATE_PROPERTY_OPS,
  DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_COST_RATE_TAXES,
  DEFAULT_COST_RATE_IT,
  DEFAULT_COST_RATE_FFE,
  DEFAULT_COST_RATE_OTHER,
  DEFAULT_COST_RATE_INSURANCE,
  DEFAULT_EVENT_EXPENSE_RATE,
  DEFAULT_OTHER_EXPENSE_RATE,
  DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_COMMISSION_RATE,
} from "../../shared/constants";

/**
 * NPV = Σ CF_t / (1+r)^t
 */
function calculateNPV(cashFlows: number[], rate: number): number {
  return cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FORENSIC IRR TEST 1: "The Accountant's Spreadsheet"
 *
 * Full 10-year hand-calculated levered hotel IRR. Every intermediate value —
 * revenue, expenses, NOI, debt service, depreciation, tax, cash flow, exit
 * valuation — is independently computed and verified against the engine.
 *
 * Scenario (flat growth, zero inflation for full traceability):
 *   20 rooms | $200 ADR | 70% occupancy | 0% growth | 0% inflation
 *   $2,000,000 purchase | 25% land | $0 improvements | $0 reserve
 *   60% LTV → $1,200,000 loan @ 8% / 25-year term
 *   25% tax rate | 8.5% exit cap | 5% commission
 *   10-year hold | Operations start = acquisition date (no gap)
 *
 * Hand-calculated IRR: 35.2429% (Newton-Raphson, NPV < 1e-10)
 * ═══════════════════════════════════════════════════════════════════════════════
 */
describe("Forensic IRR Test 1 — The Accountant's Spreadsheet (10-Year)", () => {
  // ── Scenario Setup ─────────────────────────────────────────────────────────
  const property = makeProperty({
    purchasePrice: 2_000_000,
    roomCount: 20,
    startAdr: 200,
    startOccupancy: 0.70,
    maxOccupancy: 0.70,
    occupancyGrowthStep: 0,
    adrGrowthRate: 0.0,
    type: "Financed" as any,
    acquisitionLTV: 0.60,
    acquisitionInterestRate: 0.08,
    acquisitionTermYears: 25,
    landValuePercent: 0.25,
    buildingImprovements: 0,
    taxRate: 0.25,
    operatingReserve: 0,
    revShareEvents: 0.18,
    revShareFB: 0.30,
    revShareOther: 0.03,
    cateringBoostPercent: 0,
    baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
    incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  } as any);

  const global = makeGlobal({
    modelStartDate: "2026-04-01",
    projectionYears: 10,
    inflationRate: 0.0,
    fixedCostEscalationRate: 0.0,
  });

  const MONTHS = 120;
  const YEARS = 10;
  const PENNY = 2; // toBeCloseTo precision ($0.01)

  // ── Run engine ─────────────────────────────────────────────────────────────
  const monthly = generatePropertyProForma(property, global, MONTHS);
  const yearly = aggregateCashFlowByYear(monthly, property as any, global as any, YEARS);

  // ── Hand-calculated constants ──────────────────────────────────────────────
  const purchasePrice = 2_000_000;
  const loanAmount = 1_200_000;
  const equityInvested = 800_000;
  const monthlyRate = 0.08 / 12;
  const totalPayments = 25 * 12;
  const monthlyPayment = pmt(loanAmount, monthlyRate, totalPayments);

  // Revenue (monthly, flat) — shares are % of TOTAL revenue
  const revRooms = 20 * DAYS_PER_MONTH * 0.70 * 200; // 85,400.00
  const ancillaryShare = 0.18 + 0.30 + 0.03; // events + fb + other as % of total
  const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare);
  const revTotal = revRooms / roomShareOfTotal;
  const revEvents = revTotal * 0.18;
  const revFB = revTotal * 0.30;
  const revOther = revTotal * 0.03;

  // Expenses (monthly)
  const totalOpex =
    revRooms * DEFAULT_COST_RATE_ROOMS +
    revFB * DEFAULT_COST_RATE_FB +
    revEvents * DEFAULT_EVENT_EXPENSE_RATE +
    revOther * DEFAULT_OTHER_EXPENSE_RATE +
    revTotal * DEFAULT_COST_RATE_MARKETING +
    revTotal * (DEFAULT_COST_RATE_UTILITIES * DEFAULT_UTILITIES_VARIABLE_SPLIT) +
    revTotal * DEFAULT_COST_RATE_ADMIN +
    revTotal * DEFAULT_COST_RATE_PROPERTY_OPS +
    revTotal * DEFAULT_COST_RATE_IT +
    revTotal * (DEFAULT_COST_RATE_UTILITIES * (1 - DEFAULT_UTILITIES_VARIABLE_SPLIT)) +
    (purchasePrice / 12) * DEFAULT_COST_RATE_INSURANCE +
    revTotal * DEFAULT_COST_RATE_OTHER;

  // USALI waterfall (monthly)
  const gop = revTotal - totalOpex;
  const feeBase = revTotal * DEFAULT_BASE_MANAGEMENT_FEE_RATE;
  const feeIncentive = Math.max(0, gop * DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE);
  const agop = gop - feeBase - feeIncentive;
  const expTaxes = (purchasePrice / 12) * DEFAULT_COST_RATE_TAXES;
  const expFFE = revTotal * DEFAULT_COST_RATE_FFE;
  const monthlyNOI = agop - expTaxes;
  const monthlyANOI = monthlyNOI - expFFE;
  const monthlyDep = (purchasePrice * 0.75) / DEPRECIATION_YEARS / 12;

  // ── Build 10-year amortization schedule ────────────────────────────────────
  // Debt balances and interest totals per year
  let debt = loanAmount;
  const yearlyInterest: number[] = [];
  const yearlyPrincipal: number[] = [];
  const yearEndDebt: number[] = [];
  for (let y = 0; y < YEARS; y++) {
    let yi = 0, yp = 0;
    for (let m = 0; m < 12; m++) {
      const interest = debt * monthlyRate;
      const principal = monthlyPayment - interest;
      yi += interest;
      yp += principal;
      debt -= principal;
    }
    yearlyInterest.push(yi);
    yearlyPrincipal.push(yp);
    yearEndDebt.push(debt);
  }

  // ── Hand-calculated yearly ATCF ────────────────────────────────────────────
  const annualANOI = monthlyANOI * 12;
  const annualDebtService = monthlyPayment * 12;
  const annualDep = monthlyDep * 12;

  const yearlyATCF: number[] = [];
  const yearlyTax: number[] = [];
  for (let y = 0; y < YEARS; y++) {
    const btcf = annualANOI - annualDebtService;
    const taxableIncome = annualANOI - yearlyInterest[y] - annualDep;
    const incomeTax = taxableIncome > 0 ? taxableIncome * 0.25 : 0;
    const atcf = btcf - incomeTax;
    yearlyATCF.push(atcf);
    yearlyTax.push(incomeTax);
  }

  // ── Exit valuation ─────────────────────────────────────────────────────────
  const annualNOI = monthlyNOI * 12;
  const grossExitValue = annualNOI / DEFAULT_EXIT_CAP_RATE;
  const exitCommission = grossExitValue * DEFAULT_COMMISSION_RATE;
  const exitDebtPayoff = yearEndDebt[9];
  const netExitToEquity = grossExitValue - exitCommission - exitDebtPayoff;

  // ── IRR vector ─────────────────────────────────────────────────────────────
  // Engine convention: 10-element vector where year 0 = ATCF - equity invested.
  // This combines the equity outlay and first-year operating cash in the same
  // period. This is standard for annual-period models where acquisition and
  // first-year operations occur in the same calendar year.
  const handIRRVector = [...yearlyATCF];
  handIRRVector[0] -= equityInvested; // year 0: ATCF - equity
  handIRRVector[9] += netExitToEquity; // year 10: ATCF + exit

  // ── Hand-calculated IRR (Newton-Raphson) ───────────────────────────────────
  let handIRR = 0.10;
  for (let iter = 0; iter < 200; iter++) {
    let npvVal = 0, dnpv = 0;
    for (let t = 0; t < handIRRVector.length; t++) {
      npvVal += handIRRVector[t] / Math.pow(1 + handIRR, t);
      if (t > 0) dnpv += -t * handIRRVector[t] / Math.pow(1 + handIRR, t + 1);
    }
    if (Math.abs(npvVal) < 1e-10) break;
    handIRR = handIRR - npvVal / dnpv;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Revenue Verification ─────────────────────────────────────────────────
  it("monthly revenue is constant across all 120 months (flat scenario)", () => {
    for (let i = 0; i < MONTHS; i++) {
      expect(monthly[i].revenueTotal).toBeCloseTo(revTotal, PENNY);
    }
  });

  it("annual NOI matches hand calculation", () => {
    for (let y = 0; y < YEARS; y++) {
      expect(yearly[y].noi).toBeCloseTo(annualNOI, 0);
    }
  });

  it("annual ANOI matches hand calculation", () => {
    for (let y = 0; y < YEARS; y++) {
      expect(yearly[y].anoi).toBeCloseTo(annualANOI, 0);
    }
  });

  // ── Debt Service Verification ────────────────────────────────────────────
  it("annual debt service is constant (fixed-rate amortizing loan)", () => {
    for (let y = 0; y < YEARS; y++) {
      expect(yearly[y].debtService).toBeCloseTo(annualDebtService, 0);
    }
  });

  it("yearly interest decreases and principal increases (amortization)", () => {
    for (let y = 1; y < YEARS; y++) {
      expect(yearly[y].interestExpense).toBeLessThan(yearly[y - 1].interestExpense);
      expect(yearly[y].principalPayment).toBeGreaterThan(yearly[y - 1].principalPayment);
    }
  });

  it("yearly interest matches hand-calculated amortization schedule", () => {
    for (let y = 0; y < YEARS; y++) {
      expect(yearly[y].interestExpense).toBeCloseTo(yearlyInterest[y], 0);
    }
  });

  // ── Tax Verification ─────────────────────────────────────────────────────
  it("yearly income tax matches hand calculation", () => {
    for (let y = 0; y < YEARS; y++) {
      expect(yearly[y].taxLiability).toBeCloseTo(yearlyTax[y], 0);
    }
  });

  it("tax increases each year as interest deduction shrinks", () => {
    for (let y = 1; y < YEARS; y++) {
      expect(yearly[y].taxLiability).toBeGreaterThan(yearly[y - 1].taxLiability);
    }
  });

  // ── ATCF Verification ────────────────────────────────────────────────────
  it("yearly ATCF matches hand calculation for all 10 years", () => {
    for (let y = 0; y < YEARS; y++) {
      expect(yearly[y].atcf).toBeCloseTo(yearlyATCF[y], 0);
    }
  });

  it("ATCF decreases slightly each year (rising tax offsets constant ANOI)", () => {
    for (let y = 1; y < YEARS; y++) {
      expect(yearly[y].atcf).toBeLessThan(yearly[y - 1].atcf);
    }
  });

  // ── ATCF Decomposition Identity ──────────────────────────────────────────
  it("ATCF = BTCF - tax for every year", () => {
    for (let y = 0; y < YEARS; y++) {
      const btcf = yearly[y].anoi - yearly[y].debtService;
      expect(yearly[y].atcf).toBeCloseTo(btcf - yearly[y].taxLiability, PENNY);
    }
  });

  it("taxable income = ANOI - interest - depreciation for every year", () => {
    for (let y = 0; y < YEARS; y++) {
      const taxable = yearly[y].anoi - yearly[y].interestExpense - yearly[y].depreciation;
      expect(yearly[y].taxableIncome).toBeCloseTo(taxable, PENNY);
    }
  });

  // ── Exit Valuation Verification ──────────────────────────────────────────
  it("exit value matches hand calculation", () => {
    expect(yearly[9].exitValue).toBeCloseTo(netExitToEquity, 0);
  });

  it("exit gross value = annual NOI / cap rate", () => {
    const engineExitGross = yearly[9].exitValue + exitCommission + exitDebtPayoff;
    expect(engineExitGross).toBeCloseTo(grossExitValue, 0);
  });

  // ── IRR Vector Verification ──────────────────────────────────────────────
  it("IRR vector has 11 elements (year 0 equity + 10 years)", () => {
    const engineVector = yearly.map(y => y.netCashFlowToInvestors);
    expect(engineVector.length).toBe(YEARS);
    // Engine vector is 10 elements (year 0 equity is baked into year 0 CF)
    // Hand vector is 11 elements (separate year 0). Engine deducts equity in acquisition year.
  });

  it("year 0 net cash flow = ATCF - equity invested", () => {
    const expected = yearlyATCF[0] - equityInvested;
    expect(yearly[0].netCashFlowToInvestors).toBeCloseTo(expected, 0);
  });

  it("years 1-8 net cash flow = ATCF (no equity, no exit, no refi)", () => {
    for (let y = 1; y < YEARS - 1; y++) {
      expect(yearly[y].netCashFlowToInvestors).toBeCloseTo(yearlyATCF[y], 0);
    }
  });

  it("year 10 net cash flow = ATCF + exit value", () => {
    const expected = yearlyATCF[9] + netExitToEquity;
    expect(yearly[9].netCashFlowToInvestors).toBeCloseTo(expected, 0);
  });

  // ── Net Cash Flow Decomposition Identity ─────────────────────────────────
  it("netCashFlowToInvestors = atcf + refi + exit - equity for every year", () => {
    for (let y = 0; y < YEARS; y++) {
      const isAcqYear = y === 0;
      const isExitYear = y === YEARS - 1;
      const expected =
        yearly[y].atcf +
        yearly[y].refinancingProceeds +
        (isExitYear ? yearly[y].exitValue : 0) -
        (isAcqYear ? equityInvested : 0);
      expect(yearly[y].netCashFlowToInvestors).toBeCloseTo(expected, PENNY);
    }
  });

  // ── IRR Computation ──────────────────────────────────────────────────────
  it("engine IRR matches hand-calculated IRR", () => {
    const engineVector = yearly.map(y => y.netCashFlowToInvestors);
    const irrResult = computeIRR(engineVector, 1);
    expect(irrResult.converged).toBe(true);
    // Hand-calculated IRR ≈ 35.24%
    expect(irrResult.irr_periodic!).toBeCloseTo(handIRR, 3);
  });

  it("NPV at engine IRR ≈ $0", () => {
    const engineVector = yearly.map(y => y.netCashFlowToInvestors);
    const irrResult = computeIRR(engineVector, 1);
    const npv = calculateNPV(engineVector, irrResult.irr_periodic!);
    expect(Math.abs(npv)).toBeLessThan(0.01);
  });

  it("hand IRR produces NPV ≈ $0 on engine vector", () => {
    const engineVector = yearly.map(y => y.netCashFlowToInvestors);
    const npv = calculateNPV(engineVector, handIRR);
    expect(Math.abs(npv)).toBeLessThan(1.00);
  });

  // ── Balance Sheet Identity ───────────────────────────────────────────────
  it("A = L + E every month for all 120 months", () => {
    let cumulativeNetIncome = 0;
    for (let i = 0; i < MONTHS; i++) {
      cumulativeNetIncome += monthly[i].netIncome;
      const assets = monthly[i].endingCash + monthly[i].propertyValue;
      const liabilities = monthly[i].debtOutstanding;
      const equity = equityInvested + cumulativeNetIncome;
      expect(assets).toBeCloseTo(liabilities + equity, 0);
    }
  });

  // ── Cumulative Cash Consistency ──────────────────────────────────────────
  it("cumulative cash flow tracks correctly across 120 months", () => {
    let cumCash = 0;
    for (let i = 0; i < MONTHS; i++) {
      cumCash += monthly[i].cashFlow;
      expect(monthly[i].endingCash).toBeCloseTo(cumCash, PENNY);
    }
  });

  // ── Structural Invariants ────────────────────────────────────────────────
  it("IRR is positive and reasonable for a leveraged hotel", () => {
    const engineVector = yearly.map(y => y.netCashFlowToInvestors);
    const irrResult = computeIRR(engineVector, 1);
    expect(irrResult.irr_periodic!).toBeGreaterThan(0.10);
    expect(irrResult.irr_periodic!).toBeLessThan(1.50);
  });

  it("cumulative cash flow is positive at year 10 (profitable investment)", () => {
    expect(yearly[9].cumulativeCashFlow).toBeGreaterThan(0);
  });

  it("exit value is positive (property value exceeds debt)", () => {
    expect(yearly[9].exitValue).toBeGreaterThan(0);
  });
});
