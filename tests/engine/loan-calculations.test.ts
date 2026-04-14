import { describe, it, expect } from "vitest";
import {
  calculateLoanParams,
  getAcquisitionOutstandingBalance,
  calculateRefinanceParams,
  getRefiOutstandingBalance,
  getOutstandingDebtAtYear,
  calculateYearlyDebtService,
  calculateExitValue,
  getAcquisitionYear,
  LoanParams,
  GlobalLoanParams,
  LoanCalculation,
  RefinanceCalculation,
} from "../../client/src/lib/financial/loanCalculations.js";
import { DEFAULT_LTV, DEFAULT_INTEREST_RATE, DEFAULT_TERM_YEARS, DEFAULT_PROPERTY_TAX_RATE, DEPRECIATION_YEARS } from "../../client/src/lib/constants.js";
import { pmt } from "../../calc/shared/pmt.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** Full Equity property: no debt, $2M purchase, $100K improvements. */
const fullEquityProperty: LoanParams = {
  purchasePrice: 2_000_000,
  buildingImprovements: 100_000,
  landValuePercent: 0.25,
  preOpeningCosts: 50_000,
  operatingReserve: 30_000,
  type: "Full Equity",
  acquisitionDate: "2026-04-01",
  taxRate: 0.25,
  acquisitionLTV: null,
  acquisitionInterestRate: null,
  acquisitionTermYears: null,
  willRefinance: "No",
  refinanceDate: null,
  refinanceLTV: null,
  refinanceInterestRate: null,
  refinanceTermYears: null,
  refinanceClosingCostRate: null,
  exitCapRate: 0.085,
};

/** Financed property: 75% LTV, 9% rate, 25-year term. */
const financedProperty: LoanParams = {
  purchasePrice: 2_000_000,
  buildingImprovements: 100_000,
  landValuePercent: 0.25,
  preOpeningCosts: 50_000,
  operatingReserve: 30_000,
  type: "Financed",
  acquisitionDate: "2026-04-01",
  taxRate: 0.25,
  acquisitionLTV: 0.75,
  acquisitionInterestRate: 0.09,
  acquisitionTermYears: 25,
  willRefinance: "No",
  refinanceDate: null,
  refinanceLTV: null,
  refinanceInterestRate: null,
  refinanceTermYears: null,
  refinanceClosingCostRate: null,
  exitCapRate: 0.085,
};

/** Standard global assumptions. */
const globalParams: GlobalLoanParams = {
  modelStartDate: "2026-04-01",
  commissionRate: 0.05,
  salesCommissionRate: 0.05,
  exitCapRate: 0.085,
  companyTaxRate: 0.30,
  debtAssumptions: {
    acqLTV: 0.75,
    interestRate: 0.09,
    amortizationYears: 25,
    refiLTV: 0.65,
    refiClosingCostRate: 0.03,
  },
};

/** Default (no-refi) RefinanceCalculation for reuse. */
const noRefi: RefinanceCalculation = {
  refiYear: -1,
  refiProceeds: 0,
  refiLoanAmount: 0,
  refiMonthlyPayment: 0,
  refiInterestRate: 0,
  refiTermYears: 0,
  refiMonthlyRate: 0,
  refiTotalPayments: 0,
};

// ---------------------------------------------------------------------------
// 1. calculateLoanParams
// ---------------------------------------------------------------------------

describe("calculateLoanParams", () => {
  it("Full Equity property has zero loan and equity = totalInvestment", () => {
    const loan = calculateLoanParams(fullEquityProperty, globalParams);

    // totalInvestment = 2M + 100K + 50K + 30K = 2,180,000
    expect(loan.totalInvestment).toBe(2_180_000);
    expect(loan.loanAmount).toBe(0);
    expect(loan.equityInvested).toBe(2_180_000);
    expect(loan.monthlyPayment).toBe(0);
  });

  it("Financed property computes correct loan amount and equity", () => {
    const loan = calculateLoanParams(financedProperty, globalParams);

    // loanAmount = (purchasePrice + improvements) * LTV = (2M + 100K) * 0.75 = 1,575,000
    const expectedLoan = (2_000_000 + 100_000) * 0.75;
    expect(loan.loanAmount).toBe(expectedLoan);

    // totalInvestment = 2M + 100K + 50K + 30K = 2,180,000
    expect(loan.totalInvestment).toBe(2_180_000);
    expect(loan.equityInvested).toBe(2_180_000 - expectedLoan);

    // PMT check
    const monthlyRate = 0.09 / 12;
    const totalPayments = 25 * 12;
    const expectedPMT = pmt(expectedLoan, monthlyRate, totalPayments);
    expect(loan.monthlyPayment).toBeCloseTo(expectedPMT, 2);
    expect(loan.monthlyRate).toBeCloseTo(monthlyRate, 10);
    expect(loan.totalPayments).toBe(totalPayments);
  });

  it("computes depreciation correctly (ASC 360)", () => {
    const loan = calculateLoanParams(financedProperty, globalParams);

    // buildingValue = purchasePrice * (1 - landPct) + improvements
    //              = 2,000,000 * 0.75 + 100,000 = 1,600,000
    const expectedBuildingValue = 2_000_000 * (1 - 0.25) + 100_000;
    expect(loan.buildingValue).toBe(expectedBuildingValue);

    expect(loan.annualDepreciation).toBeCloseTo(expectedBuildingValue / DEPRECIATION_YEARS, 2);
  });

  it("uses fallback chain: property -> constants (per-property financing)", () => {
    const bareboneProperty: LoanParams = {
      purchasePrice: 1_000_000,
      buildingImprovements: 0,
      preOpeningCosts: 0,
      operatingReserve: 0,
      type: "Financed",
      acquisitionLTV: null,
      acquisitionInterestRate: null,
      acquisitionTermYears: null,
      taxRate: null,
      willRefinance: "No",
      refinanceDate: null,
      refinanceLTV: null,
      refinanceInterestRate: null,
      refinanceTermYears: null,
      refinanceClosingCostRate: null,
      exitCapRate: null,
    };

    const customGlobal: GlobalLoanParams = {
      modelStartDate: "2026-04-01",
      debtAssumptions: {
        acqLTV: 0.60,
        interestRate: 0.07,
        amortizationYears: 20,
      },
    };

    const loan = calculateLoanParams(bareboneProperty, customGlobal);

    expect(loan.loanAmount).toBe(1_000_000 * DEFAULT_LTV);
    expect(loan.interestRate).toBe(DEFAULT_INTEREST_RATE);
    expect(loan.termYears).toBe(DEFAULT_TERM_YEARS);
    expect(loan.taxRate).toBe(DEFAULT_PROPERTY_TAX_RATE);
  });

  it("zero interest rate computes straight-line monthly payment", () => {
    const zeroRateProperty: LoanParams = {
      ...financedProperty,
      acquisitionInterestRate: 0,
    };
    const zeroRateGlobal: GlobalLoanParams = {
      ...globalParams,
      debtAssumptions: { ...globalParams.debtAssumptions, interestRate: 0 },
    };

    const loan = calculateLoanParams(zeroRateProperty, zeroRateGlobal);

    // loanAmount = (2M + 100K) * 0.75 = 1,575,000
    const expectedLoan = 1_575_000;
    // straight-line: principal / totalPayments
    expect(loan.monthlyPayment).toBeCloseTo(expectedLoan / (25 * 12), 2);
    expect(loan.monthlyRate).toBe(0);
  });

  it("acqMonthsFromModelStart = 0 when acquisition == model start", () => {
    const loan = calculateLoanParams(financedProperty, globalParams);
    expect(loan.acqMonthsFromModelStart).toBe(0);
  });

  it("acqMonthsFromModelStart reflects delay from model start", () => {
    const delayedProperty: LoanParams = {
      ...financedProperty,
      acquisitionDate: "2027-04-01", // 12 months after model start
    };
    const loan = calculateLoanParams(delayedProperty, globalParams);
    expect(loan.acqMonthsFromModelStart).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// 2. getAcquisitionOutstandingBalance
// ---------------------------------------------------------------------------

describe("getAcquisitionOutstandingBalance", () => {
  it("returns 0 for full equity (no loan)", () => {
    const loan = calculateLoanParams(fullEquityProperty, globalParams);
    expect(getAcquisitionOutstandingBalance(loan, 0)).toBe(0);
    expect(getAcquisitionOutstandingBalance(loan, 5)).toBe(0);
  });

  it("year 0 balance is less than initial loan amount (principal paid)", () => {
    const loan = calculateLoanParams(financedProperty, globalParams);
    const balance = getAcquisitionOutstandingBalance(loan, 0);
    expect(balance).toBeGreaterThan(0);
    expect(balance).toBeLessThan(loan.loanAmount);
  });

  it("balance decreases year over year (amortization)", () => {
    const loan = calculateLoanParams(financedProperty, globalParams);
    const y0 = getAcquisitionOutstandingBalance(loan, 0);
    const y5 = getAcquisitionOutstandingBalance(loan, 5);
    const y10 = getAcquisitionOutstandingBalance(loan, 10);
    expect(y5).toBeLessThan(y0);
    expect(y10).toBeLessThan(y5);
  });

  it("returns 0 before acquisition date", () => {
    const delayedProperty: LoanParams = {
      ...financedProperty,
      acquisitionDate: "2028-04-01", // 24 months after model start
    };
    const loan = calculateLoanParams(delayedProperty, globalParams);
    // Year 0 end is month 12, acquisition at month 24 -> no debt yet
    expect(getAcquisitionOutstandingBalance(loan, 0)).toBe(0);
    // Year 1 end is month 24, which equals acqMonthsFromModelStart (24)
    // endOfYearMonth = (1+1)*12 = 24, acqMonths = 24, so 24 <= 24 -> 0
    expect(getAcquisitionOutstandingBalance(loan, 1)).toBe(0);
    // Year 2 should have debt
    expect(getAcquisitionOutstandingBalance(loan, 2)).toBeGreaterThan(0);
  });

  it("returns 0 after full amortization (25-year term)", () => {
    const loan = calculateLoanParams(financedProperty, globalParams);
    // After 25 years of payments (year 24 is the last payment year for 0-indexed)
    const balanceAfterTerm = getAcquisitionOutstandingBalance(loan, 25);
    expect(balanceAfterTerm).toBe(0);
  });

  it("zero interest rate produces linear paydown", () => {
    const zeroRateProperty: LoanParams = {
      ...financedProperty,
      acquisitionInterestRate: 0,
    };
    const loan = calculateLoanParams(zeroRateProperty, {
      ...globalParams,
      debtAssumptions: { ...globalParams.debtAssumptions, interestRate: 0 },
    });

    const balY0 = getAcquisitionOutstandingBalance(loan, 0);
    const balY1 = getAcquisitionOutstandingBalance(loan, 1);
    const yearlyPaydown = loan.monthlyPayment * 12;

    // Each year reduces balance by exactly 12 monthly payments
    expect(balY0).toBeCloseTo(loan.loanAmount - yearlyPaydown, 0);
    expect(balY1).toBeCloseTo(loan.loanAmount - 2 * yearlyPaydown, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. calculateRefinanceParams
// ---------------------------------------------------------------------------

describe("calculateRefinanceParams", () => {
  it("willRefinance = 'No' returns defaults (refiYear = -1)", () => {
    const loan = calculateLoanParams(financedProperty, globalParams);
    const yearlyNOI = Array(10).fill(300_000);

    const refi = calculateRefinanceParams(financedProperty, globalParams, loan, yearlyNOI, 10);

    expect(refi.refiYear).toBe(-1);
    expect(refi.refiProceeds).toBe(0);
    expect(refi.refiLoanAmount).toBe(0);
    expect(refi.refiMonthlyPayment).toBe(0);
  });

  it("willRefinance = 'Yes' calculates new loan from NOI/capRate * LTV", () => {
    const refiProperty: LoanParams = {
      ...financedProperty,
      willRefinance: "Yes",
      refinanceDate: "2029-04-01", // 3 years after model start -> refiYear = 3
      refinanceLTV: 0.65,
      refinanceInterestRate: 0.08,
      refinanceTermYears: 25,
      refinanceClosingCostRate: 0.03,
    };

    const loan = calculateLoanParams(refiProperty, globalParams);
    const yearlyNOI = Array(10).fill(400_000);

    const refi = calculateRefinanceParams(refiProperty, globalParams, loan, yearlyNOI, 10);

    expect(refi.refiYear).toBe(3);

    // propertyValue = purchasePrice + buildingImprovements (cost-basis approach)
    const propertyValue = 2_000_000 + 100_000;
    const expectedRefiLoan = propertyValue * 0.65;
    expect(refi.refiLoanAmount).toBeCloseTo(expectedRefiLoan, 0);

    // Monthly payment on the new loan
    const refiMonthlyRate = 0.08 / 12;
    const refiTotalPayments = 25 * 12;
    const expectedPMT = pmt(expectedRefiLoan, refiMonthlyRate, refiTotalPayments);
    expect(refi.refiMonthlyPayment).toBeCloseTo(expectedPMT, 2);

    // Proceeds = newLoan - closingCosts - existingDebt
    const closingCosts = expectedRefiLoan * 0.03;
    const existingDebt = getAcquisitionOutstandingBalance(loan, 2); // refiYear - 1
    const expectedProceeds = Math.max(0, expectedRefiLoan - closingCosts - existingDebt);
    expect(refi.refiProceeds).toBeCloseTo(expectedProceeds, 0);
  });

  it("returns defaults when refi date is beyond projection period", () => {
    const refiProperty: LoanParams = {
      ...financedProperty,
      willRefinance: "Yes",
      refinanceDate: "2040-04-01", // far beyond 10-year projection
      refinanceLTV: 0.65,
    };
    const loan = calculateLoanParams(refiProperty, globalParams);
    const yearlyNOI = Array(10).fill(300_000);

    const refi = calculateRefinanceParams(refiProperty, globalParams, loan, yearlyNOI, 10);

    expect(refi.refiYear).toBe(-1);
    expect(refi.refiLoanAmount).toBe(0);
  });

  it("returns defaults when refinanceDate is missing", () => {
    const refiProperty: LoanParams = {
      ...financedProperty,
      willRefinance: "Yes",
      refinanceDate: null,
    };
    const loan = calculateLoanParams(refiProperty, globalParams);
    const yearlyNOI = Array(10).fill(300_000);

    const refi = calculateRefinanceParams(refiProperty, globalParams, loan, yearlyNOI, 10);

    expect(refi.refiYear).toBe(-1);
  });

  it("returns defaults when modelStartDate is missing from global", () => {
    const refiProperty: LoanParams = {
      ...financedProperty,
      willRefinance: "Yes",
      refinanceDate: "2029-04-01",
    };
    const loan = calculateLoanParams(refiProperty, globalParams);
    const yearlyNOI = Array(10).fill(300_000);

    // Global without modelStartDate
    const refi = calculateRefinanceParams(refiProperty, undefined, loan, yearlyNOI, 10);

    expect(refi.refiYear).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// 4. getRefiOutstandingBalance
// ---------------------------------------------------------------------------

describe("getRefiOutstandingBalance", () => {
  it("returns 0 when no refinance (refiLoanAmount = 0)", () => {
    expect(getRefiOutstandingBalance(noRefi, 0)).toBe(0);
    expect(getRefiOutstandingBalance(noRefi, 5)).toBe(0);
  });

  it("returns refiLoanAmount before refi year", () => {
    const refi: RefinanceCalculation = {
      refiYear: 3,
      refiProceeds: 100_000,
      refiLoanAmount: 1_000_000,
      refiMonthlyPayment: pmt(1_000_000, 0.08 / 12, 25 * 12),
      refiInterestRate: 0.08,
      refiTermYears: 25,
      refiMonthlyRate: 0.08 / 12,
      refiTotalPayments: 25 * 12,
    };

    // Year 1 is before refiYear 3, yearsFromRefi = 1 - 3 + 1 = -1 < 0
    expect(getRefiOutstandingBalance(refi, 1)).toBe(refi.refiLoanAmount);
  });

  it("balance decreases after refi year (amortization)", () => {
    const refi: RefinanceCalculation = {
      refiYear: 3,
      refiProceeds: 100_000,
      refiLoanAmount: 1_000_000,
      refiMonthlyPayment: pmt(1_000_000, 0.08 / 12, 25 * 12),
      refiInterestRate: 0.08,
      refiTermYears: 25,
      refiMonthlyRate: 0.08 / 12,
      refiTotalPayments: 25 * 12,
    };

    const balY4 = getRefiOutstandingBalance(refi, 4);
    const balY8 = getRefiOutstandingBalance(refi, 8);

    expect(balY4).toBeGreaterThan(0);
    expect(balY8).toBeLessThan(balY4);
  });

  it("returns 0 after full refi amortization", () => {
    const refi: RefinanceCalculation = {
      refiYear: 0,
      refiProceeds: 50_000,
      refiLoanAmount: 500_000,
      refiMonthlyPayment: pmt(500_000, 0.06 / 12, 10 * 12),
      refiInterestRate: 0.06,
      refiTermYears: 10,
      refiMonthlyRate: 0.06 / 12,
      refiTotalPayments: 10 * 12,
    };

    // Year 10 from refi year 0: yearsFromRefi = 10 - 0 + 1 = 11
    // monthsPaid = min(11*12, 120) = 120 = totalPayments -> remaining = 0
    expect(getRefiOutstandingBalance(refi, 10)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. getOutstandingDebtAtYear
// ---------------------------------------------------------------------------

describe("getOutstandingDebtAtYear", () => {
  it("uses acquisition balance when no refinance", () => {
    const loan = calculateLoanParams(financedProperty, globalParams);

    const debtY5 = getOutstandingDebtAtYear(loan, noRefi, 5);
    const acqBalY5 = getAcquisitionOutstandingBalance(loan, 5);

    expect(debtY5).toBeCloseTo(acqBalY5, 2);
  });

  it("uses refi balance after refi year", () => {
    const loan = calculateLoanParams(financedProperty, globalParams);
    const refi: RefinanceCalculation = {
      refiYear: 3,
      refiProceeds: 100_000,
      refiLoanAmount: 1_200_000,
      refiMonthlyPayment: pmt(1_200_000, 0.08 / 12, 25 * 12),
      refiInterestRate: 0.08,
      refiTermYears: 25,
      refiMonthlyRate: 0.08 / 12,
      refiTotalPayments: 25 * 12,
    };

    // Before refi: uses acquisition balance
    const debtY2 = getOutstandingDebtAtYear(loan, refi, 2);
    const acqBalY2 = getAcquisitionOutstandingBalance(loan, 2);
    expect(debtY2).toBeCloseTo(acqBalY2, 2);

    // At/after refi year: uses refi balance
    const debtY5 = getOutstandingDebtAtYear(loan, refi, 5);
    const refiBalY5 = getRefiOutstandingBalance(refi, 5);
    expect(debtY5).toBeCloseTo(refiBalY5, 2);
  });

  it("full equity with no refi is always 0", () => {
    const loan = calculateLoanParams(fullEquityProperty, globalParams);
    for (let y = 0; y < 10; y++) {
      expect(getOutstandingDebtAtYear(loan, noRefi, y)).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. calculateYearlyDebtService
// ---------------------------------------------------------------------------

describe("calculateYearlyDebtService", () => {
  it("full equity property returns all zeros", () => {
    const loan = calculateLoanParams(fullEquityProperty, globalParams);
    const ds = calculateYearlyDebtService(loan, noRefi, 0);

    expect(ds.debtService).toBe(0);
    expect(ds.interestExpense).toBe(0);
    expect(ds.principalPayment).toBe(0);
  });

  it("interest + principal = debtService for financed property", () => {
    const loan = calculateLoanParams(financedProperty, globalParams);

    for (let y = 0; y < 5; y++) {
      const ds = calculateYearlyDebtService(loan, noRefi, y);
      expect(ds.interestExpense + ds.principalPayment).toBeCloseTo(ds.debtService, 2);
    }
  });

  it("interest decreases and principal increases over time (amortization)", () => {
    const loan = calculateLoanParams(financedProperty, globalParams);

    const dsY0 = calculateYearlyDebtService(loan, noRefi, 0);
    const dsY5 = calculateYearlyDebtService(loan, noRefi, 5);

    // Interest should decrease as balance decreases
    expect(dsY5.interestExpense).toBeLessThan(dsY0.interestExpense);
    // Principal should increase over time
    expect(dsY5.principalPayment).toBeGreaterThan(dsY0.principalPayment);
  });

  it("debt service equals 12 monthly payments in a full year", () => {
    const loan = calculateLoanParams(financedProperty, globalParams);
    const ds = calculateYearlyDebtService(loan, noRefi, 1);

    expect(ds.debtService).toBeCloseTo(loan.monthlyPayment * 12, 2);
  });

  it("uses refi schedule after refi year", () => {
    const loan = calculateLoanParams(financedProperty, globalParams);
    const refi: RefinanceCalculation = {
      refiYear: 2,
      refiProceeds: 80_000,
      refiLoanAmount: 1_200_000,
      refiMonthlyPayment: pmt(1_200_000, 0.08 / 12, 25 * 12),
      refiInterestRate: 0.08,
      refiTermYears: 25,
      refiMonthlyRate: 0.08 / 12,
      refiTotalPayments: 25 * 12,
    };

    // Year 0 should use acquisition loan
    const dsY0 = calculateYearlyDebtService(loan, refi, 0);
    expect(dsY0.debtService).toBeCloseTo(loan.monthlyPayment * 12, 2);

    // Year 3 should use refi loan (refiYear = 2, year 3 >= 2)
    const dsY3 = calculateYearlyDebtService(loan, refi, 3);
    expect(dsY3.debtService).toBeCloseTo(refi.refiMonthlyPayment * 12, 2);
  });
});

// ---------------------------------------------------------------------------
// 7. calculateExitValue
// ---------------------------------------------------------------------------

describe("calculateExitValue", () => {
  it("computes net exit value = grossValue - commission - outstandingDebt", () => {
    const loan = calculateLoanParams(financedProperty, globalParams);
    const noi = 400_000;
    const capRate = 0.085;
    const year = 9;

    const exitVal = calculateExitValue(noi, loan, noRefi, year, capRate);

    const grossValue = noi / capRate;
    const commission = grossValue * loan.commissionRate;
    const debt = getOutstandingDebtAtYear(loan, noRefi, year);
    const expectedNet = grossValue - commission - debt;

    expect(exitVal).toBeCloseTo(expectedNet, 0);
  });

  it("full equity exit has no debt deduction", () => {
    const loan = calculateLoanParams(fullEquityProperty, globalParams);
    const noi = 300_000;
    const capRate = 0.085;

    const exitVal = calculateExitValue(noi, loan, noRefi, 9, capRate);

    const grossValue = noi / capRate;
    const commission = grossValue * loan.commissionRate;
    expect(exitVal).toBeCloseTo(grossValue - commission, 0);
  });

  it("returns 0 when NOI is 0", () => {
    const loan = calculateLoanParams(fullEquityProperty, globalParams);
    expect(calculateExitValue(0, loan, noRefi, 9, 0.085)).toBe(0);
  });

  it("returns 0 when cap rate is 0 (guard against division by zero)", () => {
    const loan = calculateLoanParams(fullEquityProperty, globalParams);
    expect(calculateExitValue(300_000, loan, noRefi, 9, 0)).toBe(0);
  });

  it("uses DEFAULT_EXIT_CAP_RATE when exitCapRate is null", () => {
    const loan = calculateLoanParams(fullEquityProperty, globalParams);
    const noi = 300_000;

    const exitVal = calculateExitValue(noi, loan, noRefi, 9, null);

    // DEFAULT_EXIT_CAP_RATE = 0.085
    const grossValue = noi / 0.085;
    const commission = grossValue * loan.commissionRate;
    expect(exitVal).toBeCloseTo(grossValue - commission, 0);
  });

  it("deducts refi debt when refinance is active", () => {
    const loan = calculateLoanParams(financedProperty, globalParams);
    const refi: RefinanceCalculation = {
      refiYear: 2,
      refiProceeds: 50_000,
      refiLoanAmount: 1_000_000,
      refiMonthlyPayment: pmt(1_000_000, 0.08 / 12, 25 * 12),
      refiInterestRate: 0.08,
      refiTermYears: 25,
      refiMonthlyRate: 0.08 / 12,
      refiTotalPayments: 25 * 12,
    };

    const noi = 400_000;
    const year = 5; // after refi
    const exitVal = calculateExitValue(noi, loan, refi, year, 0.085);

    const grossValue = noi / 0.085;
    const commission = grossValue * loan.commissionRate;
    const debt = getRefiOutstandingBalance(refi, year);
    expect(exitVal).toBeCloseTo(grossValue - commission - debt, 0);
  });
});

// ---------------------------------------------------------------------------
// 8. getAcquisitionYear
// ---------------------------------------------------------------------------

describe("getAcquisitionYear", () => {
  it("acqMonthsFromModelStart = 0 yields year 0", () => {
    const loan = calculateLoanParams(financedProperty, globalParams);
    // financedProperty acquisition == model start
    expect(loan.acqMonthsFromModelStart).toBe(0);
    expect(getAcquisitionYear(loan)).toBe(0);
  });

  it("acqMonthsFromModelStart = 12 yields year 1", () => {
    const delayed: LoanParams = {
      ...financedProperty,
      acquisitionDate: "2027-04-01",
    };
    const loan = calculateLoanParams(delayed, globalParams);
    expect(loan.acqMonthsFromModelStart).toBe(12);
    expect(getAcquisitionYear(loan)).toBe(1);
  });

  it("acqMonthsFromModelStart = 6 yields year 0 (mid-year)", () => {
    const midYear: LoanParams = {
      ...financedProperty,
      acquisitionDate: "2026-10-01", // 6 months after 2026-04-01
    };
    const loan = calculateLoanParams(midYear, globalParams);
    expect(loan.acqMonthsFromModelStart).toBe(6);
    expect(getAcquisitionYear(loan)).toBe(0);
  });

  it("acqMonthsFromModelStart = 24 yields year 2", () => {
    const twoYears: LoanParams = {
      ...financedProperty,
      acquisitionDate: "2028-04-01",
    };
    const loan = calculateLoanParams(twoYears, globalParams);
    expect(loan.acqMonthsFromModelStart).toBe(24);
    expect(getAcquisitionYear(loan)).toBe(2);
  });
});
