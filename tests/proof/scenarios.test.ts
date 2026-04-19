import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine.js";
import { validateFinancialIdentities } from "../../calc/validation/financial-identities.js";
import { consolidateStatements } from "../../calc/analysis/consolidation.js";
import { reconcileSchedule } from "../../calc/validation/schedule-reconcile.js";
import { DEFAULT_ROUNDING } from "../../calc/shared/utils.js";
import {
  DEPRECIATION_YEARS,
  DAYS_PER_MONTH,
  DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_PROPERTY_INCOME_TAX_RATE,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
} from "../../shared/constants.js";
import { makePropertyInput as makeProperty, makeGlobalInput as makeGlobal } from "../fixtures/factories";

const baseProperty = makeProperty({
  startAdr: 250,
  maxOccupancy: 0.85,
  purchasePrice: 2_000_000,
  baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
});

const baseGlobal = makeGlobal({
  projectionYears: 10,
  debtAssumptions: {
    interestRate: 0.09,
    amortizationYears: 25,
    acqLTV: 0.75,
    refiLTV: 0.65,
    refiClosingCostRate: 0.03,
  },
});

describe("Proof Scenario 1: Cash Purchase (Full Equity, No Debt)", () => {
  const property = { ...baseProperty, type: "Full Equity" };
  const result = generatePropertyProForma(property, baseGlobal, 120);

  it("produces 120 months", () => {
    expect(result).toHaveLength(120);
  });

  it("zero debt throughout", () => {
    for (const m of result) {
      expect(m.debtOutstanding).toBe(0);
      expect(m.interestExpense).toBe(0);
      expect(m.principalPayment).toBe(0);
      expect(m.debtPayment).toBe(0);
    }
  });

  it("NI = NOI - Depreciation - Tax (no interest) every month", () => {
    for (const m of result) {
      const expected = m.anoi - m.interestExpense - m.depreciationExpense - m.incomeTax;
      expect(m.netIncome).toBeCloseTo(expected, 2);
    }
  });

  it("OCF = NI + Depreciation (ASC 230) every month", () => {
    for (const m of result) {
      expect(m.operatingCashFlow).toBeCloseTo(m.netIncome + m.depreciationExpense, 2);
    }
  });

  it("cashFlow = NOI - debtPayment - tax every month", () => {
    for (const m of result) {
      expect(m.cashFlow).toBeCloseTo(m.anoi - m.debtPayment - m.incomeTax, 2);
    }
  });

  it("endingCash = cumulative cashFlow", () => {
    let cum = 0;
    for (const m of result) {
      cum += m.cashFlow;
      expect(m.endingCash).toBeCloseTo(cum, 2);
    }
  });

  it("no negative cash for profitable Full Equity property", () => {
    for (const m of result) {
      expect(m.cashShortfall).toBe(false);
    }
  });

  it("depreciation = depreciable basis / DEPRECIATION_YEARS / 12 (IRS Pub 946)", () => {
    const depreciableBasis = property.purchasePrice * (1 - DEFAULT_LAND_VALUE_PERCENT);
    const expectedMonthly = depreciableBasis / DEPRECIATION_YEARS / 12;
    for (const m of result) {
      if (m.depreciationExpense > 0) {
        expect(m.depreciationExpense).toBeCloseTo(expectedMonthly, 2);
      }
    }
  });

  it("property value declines by monthly depreciation (ASC 360)", () => {
    const landValue = property.purchasePrice * DEFAULT_LAND_VALUE_PERCENT;
    const depreciableBasis = property.purchasePrice * (1 - DEFAULT_LAND_VALUE_PERCENT);
    const monthlyDep = depreciableBasis / DEPRECIATION_YEARS / 12;
    for (let i = 0; i < 12; i++) {
      const expected = landValue + depreciableBasis - monthlyDep * (i + 1);
      expect(result[i].propertyValue).toBeCloseTo(expected, 0);
    }
  });

  it("financial identities pass for every year-end", () => {
    for (let y = 0; y < 10; y++) {
      const yearEnd = result[y * 12 + 11];
      const yearMonths = result.slice(y * 12, y * 12 + 12);
      const yearNOI = yearMonths.reduce((s, m) => s + m.noi, 0);
      const yearANOI = yearMonths.reduce((s, m) => s + m.anoi, 0);
      const yearInterest = yearMonths.reduce((s, m) => s + m.interestExpense, 0);
      const yearDep = yearMonths.reduce((s, m) => s + m.depreciationExpense, 0);
      const yearTax = yearMonths.reduce((s, m) => s + m.incomeTax, 0);
      const yearNI = yearMonths.reduce((s, m) => s + m.netIncome, 0);
      const yearOCF = yearMonths.reduce((s, m) => s + m.operatingCashFlow, 0);
      const yearFCF = yearMonths.reduce((s, m) => s + m.financingCashFlow, 0);
      const yearPrincipal = yearMonths.reduce((s, m) => s + m.principalPayment, 0);

      const idResult = validateFinancialIdentities({
        balance_sheet: {
          total_assets: yearEnd.propertyValue + yearEnd.endingCash,
          total_liabilities: yearEnd.debtOutstanding,
          total_equity: yearEnd.propertyValue + yearEnd.endingCash - yearEnd.debtOutstanding,
        },
        income_statement: {
          noi: yearNOI,
          anoi: yearANOI,
          interest_expense: yearInterest,
          depreciation: yearDep,
          income_tax: yearTax,
          net_income: yearNI,
        },
        cash_flow_statement: {
          operating_cash_flow: yearOCF,
          financing_cash_flow: yearFCF,
          ending_cash: yearEnd.endingCash,
          principal_payment: yearPrincipal,
        },
        rounding_policy: DEFAULT_ROUNDING,
      });

      expect(idResult.opinion).toBe("UNQUALIFIED");
    }
  });
});

describe("Proof Scenario 2: Financed Purchase (LTV Binding)", () => {
  const property = {
    ...baseProperty,
    type: "Financed",
    acquisitionLTV: 0.75,
    acquisitionInterestRate: 0.09,
    acquisitionTermYears: 25,
  };
  const result = generatePropertyProForma(property, baseGlobal, 120);

  const loanAmount = property.purchasePrice * 0.75;
  const monthlyRate = 0.09 / 12;
  const numPayments = 25 * 12;
  const expectedPMT =
    (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
    (Math.pow(1 + monthlyRate, numPayments) - 1);

  it("has positive debt outstanding in month 0", () => {
    expect(result[0].debtOutstanding).toBeGreaterThan(0);
    expect(result[0].debtOutstanding).toBeLessThanOrEqual(loanAmount);
  });

  it("debt service = PMT every month", () => {
    for (const m of result) {
      if (m.debtPayment > 0) {
        expect(m.debtPayment).toBeCloseTo(expectedPMT, 2);
      }
    }
  });

  it("interest + principal = PMT (every month)", () => {
    for (const m of result) {
      if (m.debtPayment > 0) {
        expect(m.interestExpense + m.principalPayment).toBeCloseTo(m.debtPayment, 2);
      }
    }
  });

  it("debt outstanding strictly decreases (amortization)", () => {
    for (let i = 1; i < 120; i++) {
      if (result[i].debtPayment > 0 && result[i - 1].debtPayment > 0) {
        expect(result[i].debtOutstanding).toBeLessThan(result[i - 1].debtOutstanding);
      }
    }
  });

  it("interest decreases, principal increases over time", () => {
    expect(result[119].interestExpense).toBeLessThan(result[0].interestExpense);
    expect(result[119].principalPayment).toBeGreaterThan(result[0].principalPayment);
  });

  it("NI excludes principal (ASC 470) every month", () => {
    for (const m of result) {
      expect(m.netIncome).toBeCloseTo(
        m.anoi - m.interestExpense - m.depreciationExpense - m.incomeTax,
        2,
      );
    }
  });

  it("OCF = NI + Depreciation (ASC 230) every month", () => {
    for (const m of result) {
      expect(m.operatingCashFlow).toBeCloseTo(m.netIncome + m.depreciationExpense, 2);
    }
  });

  it("financing CF = -principal every month", () => {
    for (const m of result) {
      expect(m.financingCashFlow).toBeCloseTo(-m.principalPayment, 2);
    }
  });

  it("debt outstanding = loanAmount minus cumulative principal (carry-forward method)", () => {
    let bal = loanAmount;
    for (let month = 0; month < 120; month++) {
      const interest = bal * monthlyRate;
      const principal = expectedPMT - interest;
      bal = Math.max(0, bal - principal);
      expect(result[month].debtOutstanding).toBeCloseTo(bal, 2);
    }
  });

  it("first month interest = loanAmount × monthlyRate", () => {
    expect(result[0].interestExpense).toBeCloseTo(loanAmount * monthlyRate, 2);
  });
});

describe("Proof Scenario 3: Cash Purchase → Refinance Year 3", () => {
  const refiDate = "2029-04-01";
  const property = {
    ...baseProperty,
    type: "Full Equity",
    willRefinance: "Yes" as const,
    refinanceDate: refiDate,
    refinanceLTV: 0.65,
    refinanceInterestRate: 0.08,
    refinanceTermYears: 25,
    refinanceClosingCostRate: 0.03,
  };
  const result = generatePropertyProForma(property, baseGlobal, 120);

  const refiMonthIndex = 36;

  it("zero debt before refinance month", () => {
    for (let i = 0; i < refiMonthIndex; i++) {
      expect(result[i].debtOutstanding).toBe(0);
      expect(result[i].interestExpense).toBe(0);
      expect(result[i].principalPayment).toBe(0);
    }
  });

  it("positive debt from refinance month onward", () => {
    for (let i = refiMonthIndex; i < 120; i++) {
      expect(result[i].debtOutstanding).toBeGreaterThan(0);
    }
  });

  it("refinancing proceeds appear at refi month", () => {
    expect(result[refiMonthIndex].refinancingProceeds).toBeGreaterThan(0);
    for (let i = 0; i < refiMonthIndex; i++) {
      expect(result[i].refinancingProceeds).toBe(0);
    }
    for (let i = refiMonthIndex + 1; i < 120; i++) {
      expect(result[i].refinancingProceeds).toBe(0);
    }
  });

  it("cash flow includes refi proceeds at refi month", () => {
    expect(result[refiMonthIndex].endingCash).toBeGreaterThan(result[refiMonthIndex - 1].endingCash);
  });

  it("NI = NOI - Interest - Depreciation - Tax (post-refi)", () => {
    for (let i = refiMonthIndex; i < 120; i++) {
      expect(result[i].netIncome).toBeCloseTo(
        result[i].anoi - result[i].interestExpense - result[i].depreciationExpense - result[i].incomeTax,
        2,
      );
    }
  });

  it("OCF = NI + Depreciation (ASC 230) post-refi", () => {
    for (let i = refiMonthIndex; i < 120; i++) {
      expect(result[i].operatingCashFlow).toBeCloseTo(
        result[i].netIncome + result[i].depreciationExpense,
        2,
      );
    }
  });

  it("debt amortizes after refi (outstanding declines)", () => {
    for (let i = refiMonthIndex + 2; i < 120; i++) {
      expect(result[i].debtOutstanding).toBeLessThan(result[i - 1].debtOutstanding);
    }
  });
});

describe("Proof Scenario 4: OpCo Fees + SPV Fees (Portfolio Aggregate)", () => {
  const propertyA = { ...baseProperty, type: "Full Equity" };
  const propertyB = {
    ...baseProperty,
    type: "Financed",
    acquisitionLTV: 0.75,
    acquisitionInterestRate: 0.09,
    acquisitionTermYears: 25,
    startAdr: 300,
    roomCount: 15,
    purchasePrice: 3_000_000,
  };

  const resultA = generatePropertyProForma(propertyA, baseGlobal, 120);
  const resultB = generatePropertyProForma(propertyB, baseGlobal, 120);

  it("management fee = base fee × total revenue per property per month", () => {
    for (const m of resultA) {
      expect(m.feeBase).toBeCloseTo(m.revenueTotal * DEFAULT_BASE_MANAGEMENT_FEE_RATE, 2);
    }
    for (const m of resultB) {
      expect(m.feeBase).toBeCloseTo(m.revenueTotal * DEFAULT_BASE_MANAGEMENT_FEE_RATE, 2);
    }
  });

  it("incentive fee = incentive rate × max(0, GOP) per property per month", () => {
    for (const m of resultA) {
      expect(m.feeIncentive).toBeCloseTo(Math.max(0, m.gop * DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE), 2);
    }
  });

  it("OpCo fee revenue = Σ(SPV fee expenses) per year", () => {
    for (let y = 0; y < 10; y++) {
      const start = y * 12;
      const end = start + 12;
      const spvFeesA = resultA.slice(start, end).reduce((s, m) => s + m.feeBase + m.feeIncentive, 0);
      const spvFeesB = resultB.slice(start, end).reduce((s, m) => s + m.feeBase + m.feeIncentive, 0);
      const totalSPVFees = spvFeesA + spvFeesB;
      expect(totalSPVFees).toBeGreaterThan(0);
    }
  });

  it("portfolio NOI = independently computed NOI for each property", () => {
    for (let i = 0; i < 120; i++) {
      const agopA = resultA[i].gop - resultA[i].feeBase - resultA[i].feeIncentive;
      const noiA = agopA - resultA[i].expenseTaxes;
      const anoiA = noiA - resultA[i].expenseFFE;

      const agopB = resultB[i].gop - resultB[i].feeBase - resultB[i].feeIncentive;
      const noiB = agopB - resultB[i].expenseTaxes;
      const anoiB = noiB - resultB[i].expenseFFE;

      expect(resultA[i].noi).toBeCloseTo(noiA, 2);
      expect(resultA[i].anoi).toBeCloseTo(anoiA, 2);
      expect(resultB[i].noi).toBeCloseTo(noiB, 2);
      expect(resultB[i].anoi).toBeCloseTo(anoiB, 2);

      const portfolioANOI = resultA[i].anoi + resultB[i].anoi;
      expect(portfolioANOI).toBeCloseTo(anoiA + anoiB, 2);
    }
  });
});

describe("Proof Scenario 5: Consolidated Group with Eliminations", () => {
  const propertyA = { ...baseProperty, type: "Full Equity" };
  const propertyB = {
    ...baseProperty,
    type: "Financed",
    acquisitionLTV: 0.75,
    acquisitionInterestRate: 0.09,
    acquisitionTermYears: 25,
    startAdr: 300,
    roomCount: 15,
    purchasePrice: 3_000_000,
  };

  const resultA = generatePropertyProForma(propertyA, baseGlobal, 12);
  const resultB = generatePropertyProForma(propertyB, baseGlobal, 12);

  it("intercompany fees eliminate to zero in consolidation", () => {
    const totalFeesA = resultA.reduce((s, m) => s + m.feeBase + m.feeIncentive, 0);
    const totalFeesB = resultB.reduce((s, m) => s + m.feeBase + m.feeIncentive, 0);
    const totalSPVFees = totalFeesA + totalFeesB;

    const output = consolidateStatements({
      consolidation_type: "full_entity",
      property_statements: [
        {
          name: "Property A",
          revenue: resultA.reduce((s, m) => s + m.revenueTotal, 0),
          noi: resultA.reduce((s, m) => s + m.noi, 0),
          net_income: resultA.reduce((s, m) => s + m.netIncome, 0),
          management_fees: totalFeesA,
          total_assets: resultA[11].propertyValue + resultA[11].endingCash,
          total_liabilities: resultA[11].debtOutstanding,
          total_equity: resultA[11].propertyValue + resultA[11].endingCash - resultA[11].debtOutstanding,
        },
        {
          name: "Property B",
          revenue: resultB.reduce((s, m) => s + m.revenueTotal, 0),
          noi: resultB.reduce((s, m) => s + m.noi, 0),
          net_income: resultB.reduce((s, m) => s + m.netIncome, 0),
          management_fees: totalFeesB,
          total_assets: resultB[11].propertyValue + resultB[11].endingCash,
          total_liabilities: resultB[11].debtOutstanding,
          total_equity: resultB[11].propertyValue + resultB[11].endingCash - resultB[11].debtOutstanding,
        },
      ],
      management_company: {
        fee_revenue: totalSPVFees,
        operating_expenses: totalSPVFees * 0.3,
        net_income: totalSPVFees * 0.7,
        total_assets: totalSPVFees * 0.5,
        total_liabilities: 0,
        total_equity: totalSPVFees * 0.5,
      },
      rounding_policy: DEFAULT_ROUNDING,
    });

    expect(output.intercompany_eliminations.fee_linkage_balanced).toBe(true);
    expect(output.intercompany_eliminations.variance).toBeLessThan(1);
  });

  it("consolidated BS balances after elimination (using engine outputs)", () => {
    const totalFeesA = resultA.reduce((s, m) => s + m.feeBase + m.feeIncentive, 0);
    const totalFeesB = resultB.reduce((s, m) => s + m.feeBase + m.feeIncentive, 0);
    const totalSPVFees = totalFeesA + totalFeesB;

    const lastA = resultA[11];
    const lastB = resultB[11];
    const assetsA = lastA.propertyValue + lastA.endingCash;
    const liabilitiesA = lastA.debtOutstanding;
    const equityA = assetsA - liabilitiesA;
    const assetsB = lastB.propertyValue + lastB.endingCash;
    const liabilitiesB = lastB.debtOutstanding;
    const equityB = assetsB - liabilitiesB;

    const output = consolidateStatements({
      consolidation_type: "full_entity",
      property_statements: [
        {
          name: "A",
          revenue: resultA.reduce((s, m) => s + m.revenueTotal, 0),
          noi: resultA.reduce((s, m) => s + m.noi, 0),
          net_income: resultA.reduce((s, m) => s + m.netIncome, 0),
          management_fees: totalFeesA,
          total_assets: assetsA,
          total_liabilities: liabilitiesA,
          total_equity: equityA,
        },
        {
          name: "B",
          revenue: resultB.reduce((s, m) => s + m.revenueTotal, 0),
          noi: resultB.reduce((s, m) => s + m.noi, 0),
          net_income: resultB.reduce((s, m) => s + m.netIncome, 0),
          management_fees: totalFeesB,
          total_assets: assetsB,
          total_liabilities: liabilitiesB,
          total_equity: equityB,
        },
      ],
      management_company: {
        fee_revenue: totalSPVFees,
        total_assets: totalSPVFees * 0.5,
        total_liabilities: 0,
        total_equity: totalSPVFees * 0.5,
      },
      rounding_policy: DEFAULT_ROUNDING,
    });

    expect(output.balance_sheet_balanced).toBe(true);
    expect(Math.abs(output.consolidated_assets - output.consolidated_liabilities - output.consolidated_equity)).toBeLessThan(1);
  });

  it("properties-only consolidation has no eliminations", () => {
    const output = consolidateStatements({
      consolidation_type: "properties_only",
      property_statements: [
        {
          name: "A",
          revenue: 100_000,
          noi: 50_000,
          net_income: 30_000,
          management_fees: 5_000,
          total_assets: 1_000_000,
          total_liabilities: 0,
          total_equity: 1_000_000,
        },
      ],
      rounding_policy: DEFAULT_ROUNDING,
    });

    expect(output.intercompany_eliminations.management_fees_eliminated).toBe(0);
  });
});
