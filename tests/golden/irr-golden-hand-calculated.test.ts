import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine";
import { pmt } from "../../calc/shared/pmt";
import { computeIRR } from "../../analytics/returns/irr";
import { makePropertyInput as makeProperty, makeGlobalInput as makeGlobal } from "../fixtures/factories";
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
  DEFAULT_COMMISSION_RATE,
  DEFAULT_EXIT_CAP_RATE,
} from "../../shared/constants";

/**
 * NPV helper for cross-checking IRR results.
 * NPV = Sigma CF_t / (1+r)^t
 */
function calculateNPV(cashFlows: number[], rate: number): number {
  return cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
}

/**
 * Golden Lodge: Hand-Calculated 5-Year Levered Hotel IRR
 *
 * This golden test constructs a flat-growth, zero-inflation, 20-room financed hotel
 * and hand-verifies every intermediate value in Month 1, then aggregates to a 5-year
 * IRR. Every month is identical on the revenue/expense side (only debt amortization
 * differs), making hand verification tractable.
 *
 * Scenario:
 *   Purchase: $2,000,000 | 20 rooms | ADR $200 | 70% occ | 0% growth | 0% inflation
 *   Financing: 60% LTV ($1,200,000 loan) | 8% annual | 25-year term
 *   Land: 25% of purchase | Tax rate: 25% | Exit cap: 8.5% | Commission: 5%
 *   Projection: 60 months (5 years) starting 2026-04-01
 */
describe("Golden Lodge — Hand-Calculated IRR Scenario", () => {
  // ── Scenario inputs ──────────────────────────────────────────────────────
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
    operatingReserve: 0,
    revShareEvents: 0.18,
    revShareFB: 0.30,
    revShareOther: 0.03,
    cateringBoostPercent: 0,
    baseManagementFeeRate: 0.085,
    incentiveManagementFeeRate: 0.12,
  });

  const global = makeGlobal({
    modelStartDate: "2026-04-01",
    inflationRate: 0.0,
    fixedCostEscalationRate: 0.0,
  });

  const MONTHS = 60;
  const result = generatePropertyProForma(property, global, MONTHS);
  const m = result[0]; // Month 1 (index 0)
  const PENNY = 2; // toBeCloseTo precision (within $0.01)

  // ── Hand-calculated constants ────────────────────────────────────────────
  const purchasePrice = 2_000_000;
  const totalPropertyValue = purchasePrice; // buildingImprovements = 0
  const loanAmount = 1_200_000; // 60% LTV
  const monthlyRate = 0.08 / 12;
  const totalPayments = 25 * 12; // 300
  const monthlyPayment = pmt(loanAmount, monthlyRate, totalPayments);

  // ── Revenue (hand-calculated step by step) ─────────────────────────────
  // Revenue shares are % of TOTAL revenue; room share = 1 - ancillary
  const availableRooms = 20 * DAYS_PER_MONTH; // 20 * 30.5 = 610
  const soldRooms = availableRooms * 0.70; // 610 * 0.70 = 427
  const revenueRooms = soldRooms * 200; // 427 * 200 = 85,400.00
  const ancillaryShare = 0.18 + 0.30 + 0.03; // 0.51
  const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare); // 0.49
  const revenueTotal = revenueRooms / roomShareOfTotal; // 85,400 / 0.49 = 174,285.71...
  const revenueEvents = revenueTotal * 0.18;
  const revenueFB = revenueTotal * 0.30;
  const revenueOther = revenueTotal * 0.03;

  // ── Variable expenses (on actual revenue) ──────────────────────────────
  const expenseRooms = revenueRooms * DEFAULT_COST_RATE_ROOMS; // 85,400 * 0.20 = 17,080.00
  const expenseFB = revenueFB * DEFAULT_COST_RATE_FB; // 18,753.84 * 0.09 = 1,687.8456
  const expenseEvents = revenueEvents * DEFAULT_EVENT_EXPENSE_RATE; // 25,620 * 0.65 = 16,653.00
  const expenseOther = revenueOther * DEFAULT_OTHER_EXPENSE_RATE; // 4,270 * 0.60 = 2,562.00
  const expenseMarketing = revenueTotal * DEFAULT_COST_RATE_MARKETING; // 134,043.84 * 0.01 = 1,340.4384
  const expenseUtilitiesVar = revenueTotal * (DEFAULT_COST_RATE_UTILITIES * DEFAULT_UTILITIES_VARIABLE_SPLIT);
  // 134,043.84 * (0.05 * 0.60) = 134,043.84 * 0.03 = 4,021.3152

  // ── Fixed expenses (baseMonthlyTotalRev = revenueTotal since flat) ─────
  const expenseAdmin = revenueTotal * DEFAULT_COST_RATE_ADMIN; // 134,043.84 * 0.08 = 10,723.5072
  const expensePropertyOps = revenueTotal * DEFAULT_COST_RATE_PROPERTY_OPS; // 134,043.84 * 0.04 = 5,361.7536
  const expenseIT = revenueTotal * DEFAULT_COST_RATE_IT; // 134,043.84 * 0.005 = 670.2192
  // (2,000,000 / 12) * 0.02 = 166,666.667 * 0.02 = 3,333.3333...
  const expenseTaxes = (totalPropertyValue / 12) * DEFAULT_COST_RATE_TAXES;
  // (2,000,000 / 12) * 0.03 = 166,666.667 * 0.03 = 5,000.00
  const expenseUtilitiesFixed = revenueTotal * (DEFAULT_COST_RATE_UTILITIES * (1 - DEFAULT_UTILITIES_VARIABLE_SPLIT));
  // 134,043.84 * (0.05 * 0.40) = 134,043.84 * 0.02 = 2,680.8768
  const expenseOtherCosts = revenueTotal * DEFAULT_COST_RATE_OTHER; // 134,043.84 * 0.05 = 6,702.192
  const expenseInsurance = (totalPropertyValue / 12) * DEFAULT_COST_RATE_INSURANCE;
  const expenseFFE = revenueTotal * DEFAULT_COST_RATE_FFE; // 134,043.84 * 0.04 = 5,361.7536

  // ── USALI waterfall ────────────────────────────────────────────────────
  // totalOperatingExpenses: 12 items (NOT taxes, FFE)
  const totalOperatingExpenses =
    expenseRooms + expenseFB + expenseEvents + expenseOther +
    expenseMarketing + expensePropertyOps + expenseUtilitiesVar +
    expenseAdmin + expenseIT + expenseUtilitiesFixed + expenseInsurance + expenseOtherCosts;

  const gop = revenueTotal - totalOperatingExpenses;
  const feeBase = revenueTotal * DEFAULT_BASE_MANAGEMENT_FEE_RATE; // 134,043.84 * 0.085
  const feeIncentive = Math.max(0, gop * DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE); // gop * 0.12
  const agop = gop - feeBase - feeIncentive;
  const noi = agop - expenseTaxes;
  const anoi = noi - expenseFFE;

  // ── Debt service Month 1 ───────────────────────────────────────────────
  const interestMonth1 = loanAmount * monthlyRate; // 1,200,000 * (0.08/12) = 8,000.00
  const principalMonth1 = monthlyPayment - interestMonth1;
  const debtOutstandingMonth1 = loanAmount - principalMonth1;

  // ── Depreciation ───────────────────────────────────────────────────────
  const buildingValue = purchasePrice * 0.75; // 1,500,000
  const monthlyDepreciation = buildingValue / DEPRECIATION_YEARS / 12;
  // = 1,500,000 / 39 / 12 = 1,500,000 / 468 = 3,205.128205...

  // ── Income statement ───────────────────────────────────────────────────
  const taxableIncome = anoi - interestMonth1 - monthlyDepreciation;
  const incomeTax = taxableIncome > 0 ? taxableIncome * 0.25 : 0;
  const netIncome = anoi - interestMonth1 - monthlyDepreciation - incomeTax;

  // ── Cash flow ──────────────────────────────────────────────────────────
  const cashFlow = anoi - monthlyPayment - incomeTax;
  const operatingCF = netIncome + monthlyDepreciation;
  const financingCF = -principalMonth1;
  const endingCash = cashFlow; // Month 1, cumulative starts at 0 (reserve=0)

  // ══════════════════════════════════════════════════════════════════════════
  // TESTS
  // ══════════════════════════════════════════════════════════════════════════

  it("Month 1 revenue breakdown", () => {
    expect(m.availableRooms).toBeCloseTo(availableRooms, PENNY);
    expect(m.soldRooms).toBeCloseTo(soldRooms, PENNY);
    expect(m.revenueRooms).toBeCloseTo(revenueRooms, PENNY);
    expect(m.revenueEvents).toBeCloseTo(revenueEvents, PENNY);
    expect(m.revenueFB).toBeCloseTo(revenueFB, PENNY);
    expect(m.revenueOther).toBeCloseTo(revenueOther, PENNY);
    expect(m.revenueTotal).toBeCloseTo(revenueTotal, PENNY);
  });

  it("Month 1 expense breakdown", () => {
    // Variable
    expect(m.expenseRooms).toBeCloseTo(expenseRooms, PENNY);
    expect(m.expenseFB).toBeCloseTo(expenseFB, PENNY);
    expect(m.expenseEvents).toBeCloseTo(expenseEvents, PENNY);
    expect(m.expenseOther).toBeCloseTo(expenseOther, PENNY);
    expect(m.expenseMarketing).toBeCloseTo(expenseMarketing, PENNY);
    expect(m.expenseUtilitiesVar).toBeCloseTo(expenseUtilitiesVar, PENNY);
    // Fixed
    expect(m.expenseAdmin).toBeCloseTo(expenseAdmin, PENNY);
    expect(m.expensePropertyOps).toBeCloseTo(expensePropertyOps, PENNY);
    expect(m.expenseIT).toBeCloseTo(expenseIT, PENNY);
    expect(m.expenseTaxes).toBeCloseTo(expenseTaxes, PENNY);
    expect(m.expenseUtilitiesFixed).toBeCloseTo(expenseUtilitiesFixed, PENNY);
    expect(m.expenseOtherCosts).toBeCloseTo(expenseOtherCosts, PENNY);
    expect(m.expenseFFE).toBeCloseTo(expenseFFE, PENNY);
  });

  it("Month 1 USALI waterfall", () => {
    // Verify totalOperatingExpenses (the 12-item sum)
    const engineTotalOpex =
      m.expenseRooms + m.expenseFB + m.expenseEvents + m.expenseOther +
      m.expenseMarketing + m.expensePropertyOps + m.expenseUtilitiesVar +
      m.expenseAdmin + m.expenseIT + m.expenseUtilitiesFixed + m.expenseInsurance + m.expenseOtherCosts;
    expect(engineTotalOpex).toBeCloseTo(totalOperatingExpenses, PENNY);

    expect(m.gop).toBeCloseTo(gop, PENNY);
    expect(m.feeBase).toBeCloseTo(feeBase, PENNY);
    expect(m.feeIncentive).toBeCloseTo(feeIncentive, PENNY);
    expect(m.agop).toBeCloseTo(agop, PENNY);
    expect(m.noi).toBeCloseTo(noi, PENNY);
    expect(m.anoi).toBeCloseTo(anoi, PENNY);
  });

  it("Month 1 debt service", () => {
    // PMT cross-check with explicit formula
    const r = 0.08 / 12;
    const n = 300;
    const factor = Math.pow(1 + r, n);
    const expectedPMT = (1_200_000 * r * factor) / (factor - 1);
    expect(monthlyPayment).toBeCloseTo(expectedPMT, 4);

    expect(m.debtPayment).toBeCloseTo(monthlyPayment, PENNY);
    expect(m.interestExpense).toBeCloseTo(interestMonth1, PENNY);
    expect(m.principalPayment).toBeCloseTo(principalMonth1, PENNY);
    expect(m.debtOutstanding).toBeCloseTo(debtOutstandingMonth1, PENNY);
  });

  it("Month 1 income statement", () => {
    expect(m.depreciationExpense).toBeCloseTo(monthlyDepreciation, PENNY);
    // Verify taxable income computation
    const engineTaxable = m.anoi - m.interestExpense - m.depreciationExpense;
    expect(engineTaxable).toBeCloseTo(taxableIncome, PENNY);
    expect(m.incomeTax).toBeCloseTo(incomeTax, PENNY);
    expect(m.netIncome).toBeCloseTo(netIncome, PENNY);
  });

  it("Month 1 cash flow", () => {
    expect(m.cashFlow).toBeCloseTo(cashFlow, PENNY);
    expect(m.operatingCashFlow).toBeCloseTo(operatingCF, PENNY);
    expect(m.financingCashFlow).toBeCloseTo(financingCF, PENNY);
    expect(m.endingCash).toBeCloseTo(endingCash, PENNY);
  });

  it("Month 1 equals Month 12 (flat scenario invariant)", () => {
    const m12 = result[11];
    // Revenue is identical every month (no growth, no inflation)
    expect(m12.revenueRooms).toBeCloseTo(m.revenueRooms, PENNY);
    expect(m12.revenueEvents).toBeCloseTo(m.revenueEvents, PENNY);
    expect(m12.revenueFB).toBeCloseTo(m.revenueFB, PENNY);
    expect(m12.revenueOther).toBeCloseTo(m.revenueOther, PENNY);
    expect(m12.revenueTotal).toBeCloseTo(m.revenueTotal, PENNY);
    // Operating expenses are identical
    expect(m12.expenseRooms).toBeCloseTo(m.expenseRooms, PENNY);
    expect(m12.expenseFB).toBeCloseTo(m.expenseFB, PENNY);
    expect(m12.expenseEvents).toBeCloseTo(m.expenseEvents, PENNY);
    expect(m12.expenseOther).toBeCloseTo(m.expenseOther, PENNY);
    expect(m12.expenseMarketing).toBeCloseTo(m.expenseMarketing, PENNY);
    expect(m12.expenseUtilitiesVar).toBeCloseTo(m.expenseUtilitiesVar, PENNY);
    expect(m12.expenseAdmin).toBeCloseTo(m.expenseAdmin, PENNY);
    expect(m12.expensePropertyOps).toBeCloseTo(m.expensePropertyOps, PENNY);
    expect(m12.expenseIT).toBeCloseTo(m.expenseIT, PENNY);
    expect(m12.expenseTaxes).toBeCloseTo(m.expenseTaxes, PENNY);
    expect(m12.expenseUtilitiesFixed).toBeCloseTo(m.expenseUtilitiesFixed, PENNY);
    expect(m12.expenseOtherCosts).toBeCloseTo(m.expenseOtherCosts, PENNY);
    expect(m12.expenseFFE).toBeCloseTo(m.expenseFFE, PENNY);
    // USALI waterfall is identical
    expect(m12.gop).toBeCloseTo(m.gop, PENNY);
    expect(m12.feeBase).toBeCloseTo(m.feeBase, PENNY);
    expect(m12.feeIncentive).toBeCloseTo(m.feeIncentive, PENNY);
    expect(m12.agop).toBeCloseTo(m.agop, PENNY);
    expect(m12.noi).toBeCloseTo(m.noi, PENNY);
    expect(m12.anoi).toBeCloseTo(m.anoi, PENNY);
    // Debt payment amount (PMT) is constant
    expect(m12.debtPayment).toBeCloseTo(m.debtPayment, PENNY);
    // But interest, principal, debtOutstanding DIFFER due to amortization
    expect(m12.interestExpense).not.toBeCloseTo(m.interestExpense, 4);
    expect(m12.principalPayment).not.toBeCloseTo(m.principalPayment, 4);
    expect(m12.debtOutstanding).not.toBeCloseTo(m.debtOutstanding, 0);
    // endingCash differs (cumulative)
    expect(m12.endingCash).not.toBeCloseTo(m.endingCash, 0);
  });

  it("Year 1-5 annual cash flow sums", () => {
    const yearlyCF: number[] = [];
    for (let y = 0; y < 5; y++) {
      const start = y * 12;
      const end = start + 12;
      const yearSum = result.slice(start, end).reduce((s, mo) => s + mo.cashFlow, 0);
      yearlyCF.push(yearSum);
    }
    // Each year's cash flow should be positive for this profitable scenario
    yearlyCF.forEach((cf, i) => {
      expect(cf).toBeGreaterThan(0);
    });
    // Since revenue/expenses are flat but interest decreases over time (more
    // principal paid down), taxable income increases, causing higher incomeTax.
    // cashFlow = ANOI - PMT - incomeTax. ANOI and PMT are constant, but
    // incomeTax grows, so cashFlow slightly DECREASES over the 5-year horizon.
    // The tax effect dominates because only 75% of the reduced interest is
    // retained (25% tax rate), while 100% of the interest reduction flows through.
    expect(yearlyCF[4]).toBeLessThan(yearlyCF[0]);

    // Cross-check: sum of 60 monthly cashFlows = sum of 5 yearly cashFlows
    const totalMonthlyCF = result.reduce((s, mo) => s + mo.cashFlow, 0);
    const totalYearlyCF = yearlyCF.reduce((s, cf) => s + cf, 0);
    expect(totalMonthlyCF).toBeCloseTo(totalYearlyCF, 0);
  });

  it("Exit valuation", () => {
    // Year 5 annual NOI (months 48-59)
    const year5NOI = result.slice(48, 60).reduce((s, mo) => s + mo.noi, 0);
    // Since scenario is flat, year 5 NOI should equal 12 * monthly NOI
    expect(year5NOI).toBeCloseTo(12 * noi, 0);

    // Gross sale price = Annual NOI / exit cap rate
    const grossSalePrice = year5NOI / DEFAULT_EXIT_CAP_RATE;
    // Commission = gross * 5%
    const commission = grossSalePrice * DEFAULT_COMMISSION_RATE;
    // Net sale proceeds
    const netSaleProceeds = grossSalePrice - commission;
    // Outstanding debt at month 60 (index 59)
    const debtAtExit = result[59].debtOutstanding;
    // Net to equity
    const netToEquity = netSaleProceeds - debtAtExit;

    // Verify exit valuation is reasonable
    expect(grossSalePrice).toBeGreaterThan(purchasePrice);
    expect(netToEquity).toBeGreaterThan(0);
    expect(debtAtExit).toBeGreaterThan(0); // Still has debt after 5 of 25 years
    expect(debtAtExit).toBeLessThan(loanAmount); // But less than original

    // Verify net sale exceeds debt (positive equity at exit)
    expect(netSaleProceeds).toBeGreaterThan(debtAtExit);
  });

  it("IRR vector and computation", () => {
    // Build the 6-element annual IRR vector
    const equity = purchasePrice - loanAmount; // $800,000
    expect(equity).toBe(800_000);

    // Annual cash flow sums
    const yearlyCF: number[] = [];
    for (let y = 0; y < 5; y++) {
      const start = y * 12;
      const end = start + 12;
      yearlyCF.push(result.slice(start, end).reduce((s, mo) => s + mo.cashFlow, 0));
    }

    // Exit proceeds
    const year5NOI = result.slice(48, 60).reduce((s, mo) => s + mo.noi, 0);
    const grossSalePrice = year5NOI / DEFAULT_EXIT_CAP_RATE;
    const commission = grossSalePrice * DEFAULT_COMMISSION_RATE;
    const netSaleProceeds = grossSalePrice - commission;
    const debtAtExit = result[59].debtOutstanding;
    const netToEquity = netSaleProceeds - debtAtExit;

    // IRR vector: Year 0 = -equity, Years 1-4 = operating CF, Year 5 = operating CF + exit
    const irrVector = [
      -equity,
      yearlyCF[0],
      yearlyCF[1],
      yearlyCF[2],
      yearlyCF[3],
      yearlyCF[4] + netToEquity,
    ];

    // Verify vector structure
    expect(irrVector[0]).toBe(-800_000);
    expect(irrVector.length).toBe(6);

    // Compute IRR (annual periods)
    const irrResult = computeIRR(irrVector, 1);
    expect(irrResult.converged).toBe(true);

    // NPV at the computed IRR should be approximately zero
    const npvAtIRR = calculateNPV(irrVector, irrResult.irr_periodic!);
    expect(Math.abs(npvAtIRR)).toBeLessThan(0.01);

    // IRR should be positive and reasonable for a leveraged boutique hotel
    expect(irrResult.irr_periodic!).toBeGreaterThan(0.05);
    expect(irrResult.irr_periodic!).toBeLessThan(1.00);

    // For annual periods, irr_annualized = irr_periodic
    expect(irrResult.irr_annualized).toBeCloseTo(irrResult.irr_periodic!, 6);
  });

  it("Balance sheet identity A=L+E every month", () => {
    const equityInvested = purchasePrice - loanAmount; // $800,000
    let cumulativeNetIncome = 0;

    for (let i = 0; i < MONTHS; i++) {
      const mo = result[i];
      cumulativeNetIncome += mo.netIncome;

      // Assets = endingCash + propertyValue
      const assets = mo.endingCash + mo.propertyValue;
      // Liabilities = debtOutstanding
      const liabilities = mo.debtOutstanding;
      // Equity = initial equity + retained earnings (cumulative net income)
      const equity = equityInvested + cumulativeNetIncome;

      // A = L + E
      expect(assets).toBeCloseTo(liabilities + equity, 0); // within $0.50
    }
  });

  // ── Additional structural invariants ─────────────────────────────────────

  it("Cumulative cash tracks correctly across all 60 months", () => {
    let cumCash = 0;
    for (let i = 0; i < MONTHS; i++) {
      cumCash += result[i].cashFlow;
      expect(result[i].endingCash).toBeCloseTo(cumCash, PENNY);
    }
  });

  it("Debt amortization is monotonically decreasing", () => {
    for (let i = 1; i < MONTHS; i++) {
      expect(result[i].debtOutstanding).toBeLessThan(result[i - 1].debtOutstanding);
    }
  });

  it("Interest expense decreases over time as principal is paid down", () => {
    // Month 1 vs Month 60: interest should be lower in Month 60
    expect(result[59].interestExpense).toBeLessThan(result[0].interestExpense);
    // Principal should be higher in Month 60
    expect(result[59].principalPayment).toBeGreaterThan(result[0].principalPayment);
    // But total payment (PMT) stays constant
    expect(result[59].debtPayment).toBeCloseTo(result[0].debtPayment, PENNY);
  });
});
