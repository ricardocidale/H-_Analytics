/**
 * loanCalculations.ts — Loan, refinance, and debt service math for hotel properties
 *
 * This module handles all the financing math for individual properties:
 *   - Acquisition loan sizing (purchase price × LTV)
 *   - Monthly payment calculation using the standard PMT formula
 *   - Amortization schedule and outstanding balance tracking
 *   - Refinancing (new loan based on stabilized NOI / cap rate × refi LTV)
 *   - Yearly debt service breakdown (interest vs. principal)
 *   - Exit value calculation (NOI / cap rate − commission − outstanding debt)
 *
 * Key financial concepts:
 *   - LTV (Loan-to-Value): what percentage of the property cost is financed
 *   - PMT: the fixed monthly payment on a fully amortizing loan
 *   - DSCR (Debt Service Coverage Ratio): NOI / annual debt service — lenders
 *     typically require ≥ 1.25x
 *   - Cap Rate: NOI / property value — used to estimate market value at exit
 *   - Depreciation: under IRS rules, commercial real estate (excluding land)
 *     is depreciated straight-line over 39 years (nonresidential hotel per IRC §168(e)(2)(A))
 */

export interface LoanParams {
  purchasePrice: number;
  buildingImprovements: number;
  landValuePercent?: number | null;
  preOpeningCosts: number;
  operatingReserve: number;
  type: string;
  acquisitionDate?: string | null;
  taxRate?: number | null;
  acquisitionLTV?: number | null;
  acquisitionInterestRate?: number | null;
  acquisitionTermYears?: number | null;
  willRefinance?: string | null;
  refinanceDate?: string | null;
  refinanceLTV?: number | null;
  refinanceInterestRate?: number | null;
  refinanceTermYears?: number | null;
  refinanceClosingCostRate?: number | null;
  exitCapRate?: number | null;
  dispositionCommission?: number | null;
  depreciationYears?: number | null;
}

export interface GlobalLoanParams {
  modelStartDate: string;
  commissionRate?: number;
  salesCommissionRate?: number;
  exitCapRate?: number;
  companyTaxRate?: number;
  depreciationYears?: number;
  debtAssumptions?: {
    acqLTV?: number;
    interestRate?: number;
    amortizationYears?: number;
    refiLTV?: number;
    refiClosingCostRate?: number;
  };
}

export interface LoanCalculation {
  totalInvestment: number;
  loanAmount: number;
  equityInvested: number;
  interestRate: number;
  termYears: number;
  monthlyRate: number;
  totalPayments: number;
  monthlyPayment: number;
  acqMonthsFromModelStart: number;
  buildingValue: number;
  annualDepreciation: number;
  taxRate: number;
  commissionRate: number;
}

interface RefinanceCalculation {
  refiYear: number;
  refiProceeds: number;
  refiLoanAmount: number;
  refiMonthlyPayment: number;
  refiInterestRate: number;
  refiTermYears: number;
  refiMonthlyRate: number;
  refiTotalPayments: number;
}

import { startOfMonth } from "date-fns";
import { parseLocalDate } from "@shared/dates";
import { pmt } from "@calc/shared/pmt";
import {
  totalPropertyCost,
  acquisitionLoanAmount,
  acqMonthsFromModelStart as sharedAcqMonths,
} from "./equityCalculations";
import { outstandingBalance, debtServiceForPeriod } from "./amortization";

import {
  DEFAULT_LTV, 
  DEFAULT_INTEREST_RATE, 
  DEFAULT_TERM_YEARS, 
  DEFAULT_PROPERTY_INCOME_TAX_RATE, 
  DEFAULT_COMMISSION_RATE, 
  DEFAULT_EXIT_CAP_RATE, 
  DEPRECIATION_YEARS, 
  DEFAULT_REFI_LTV, 
  DEFAULT_REFI_CLOSING_COST_RATE,
  DEFAULT_ACQ_CLOSING_COST_RATE,
  DEFAULT_LAND_VALUE_PERCENT,
  PROJECTION_YEARS,
  PROJECTION_MONTHS,
  DEFAULT_MODEL_START_DATE,
  MONTHS_PER_YEAR,
} from '@/lib/constants';

// Re-export constants for backwards compatibility
export { 
  DEFAULT_LTV, 
  DEFAULT_INTEREST_RATE, 
  DEFAULT_TERM_YEARS, 
  DEFAULT_PROPERTY_INCOME_TAX_RATE, 
  DEFAULT_COMMISSION_RATE, 
  DEFAULT_EXIT_CAP_RATE, 
  DEPRECIATION_YEARS, 
  DEFAULT_REFI_LTV, 
  DEFAULT_REFI_CLOSING_COST_RATE,
  DEFAULT_ACQ_CLOSING_COST_RATE,
  DEFAULT_LAND_VALUE_PERCENT,
  PROJECTION_YEARS,
  PROJECTION_MONTHS,
  DEFAULT_MODEL_START_DATE
};

/**
 * Calculate all loan parameters for a property's acquisition financing.
 *
 * Returns the total investment, loan amount (purchase × LTV), equity required,
 * monthly payment (via PMT formula), depreciable building value (excluding land
 * per IRS Publication 946 / ASC 360), and annual straight-line depreciation.
 */
export function calculateLoanParams(
  property: LoanParams,
  global?: GlobalLoanParams
): LoanCalculation {
  const totalInvestment = totalPropertyCost(property);
  const loanAmount = acquisitionLoanAmount(property);
  const equityInvested = totalInvestment - loanAmount;
  
  const interestRate = property.acquisitionInterestRate ?? DEFAULT_INTEREST_RATE;
  const termYears = property.acquisitionTermYears ?? DEFAULT_TERM_YEARS;
  const taxRate = property.taxRate ?? DEFAULT_PROPERTY_INCOME_TAX_RATE;
  const commissionRate = property.dispositionCommission ?? DEFAULT_COMMISSION_RATE;
  
  // Depreciable basis: land doesn't depreciate (IRS Publication 946 / ASC 360)
  const landPct = property.landValuePercent ?? DEFAULT_LAND_VALUE_PERCENT;
  const buildingValue = property.purchasePrice * (1 - landPct) + (property.buildingImprovements ?? 0);
  const effectiveDepYears = property.depreciationYears ?? global?.depreciationYears ?? DEPRECIATION_YEARS;
  const annualDepreciation = buildingValue / effectiveDepYears;
  
  const monthlyRate = interestRate / MONTHS_PER_YEAR;
  const totalPayments = termYears * MONTHS_PER_YEAR;
  
  let monthlyPayment = 0;
  if (loanAmount > 0) {
    monthlyPayment = pmt(loanAmount, monthlyRate, totalPayments);
  }
  
  const acqMonthsFromModelStart = sharedAcqMonths(
    property.acquisitionDate,
    null,
    global?.modelStartDate || DEFAULT_MODEL_START_DATE,
  );
  
  return {
    totalInvestment,
    loanAmount,
    equityInvested,
    interestRate,
    termYears,
    monthlyRate,
    totalPayments,
    monthlyPayment,
    acqMonthsFromModelStart,
    buildingValue,
    annualDepreciation,
    taxRate,
    commissionRate
  };
}

/**
 * Calculate the remaining principal balance on the acquisition loan at the end
 * of a given year. Uses the present-value-of-annuity formula to determine the
 * outstanding balance based on how many monthly payments have been made.
 *
 * Formula: Balance = PMT × [1 − (1+r)^(−remaining)] / r
 */
export function getAcquisitionOutstandingBalance(
  loan: LoanCalculation,
  yearEnd: number
): number {
  if (loan.loanAmount === 0) return 0;
  const endOfYearMonth = (yearEnd + 1) * 12;
  if (endOfYearMonth <= loan.acqMonthsFromModelStart) return 0;
  const monthsPaid = Math.max(0, Math.min(endOfYearMonth - loan.acqMonthsFromModelStart, loan.totalPayments));
  return outstandingBalance(loan.monthlyPayment, loan.monthlyRate, monthsPaid, loan.totalPayments, loan.loanAmount);
}

/**
 * Calculate refinancing parameters when a property opts to refinance.
 *
 * Refinancing replaces the original acquisition loan with a new one based on
 * the property's current market value (stabilized NOI / cap rate × refi LTV).
 * The net refi proceeds = new loan amount − closing costs − existing debt payoff.
 * These proceeds are returned to investors as a partial equity return.
 */
export function calculateRefinanceParams(
  property: LoanParams,
  global: GlobalLoanParams | undefined,
  loan: LoanCalculation,
  yearlyNOIData: number[],
  years: number
): RefinanceCalculation {
  const defaultResult: RefinanceCalculation = {
    refiYear: -1,
    refiProceeds: 0,
    refiLoanAmount: 0,
    refiMonthlyPayment: 0,
    refiInterestRate: 0,
    refiTermYears: 0,
    refiMonthlyRate: 0,
    refiTotalPayments: 0
  };
  
  if (property.willRefinance !== "Yes" || !property.refinanceDate || !global?.modelStartDate) {
    return defaultResult;
  }
  
  const modelStart = startOfMonth(parseLocalDate(global.modelStartDate));
  const refiDate = startOfMonth(parseLocalDate(property.refinanceDate));
  const monthsDiff = (refiDate.getFullYear() - modelStart.getFullYear()) * MONTHS_PER_YEAR +
                     (refiDate.getMonth() - modelStart.getMonth());
  const refiYear = Math.floor(monthsDiff / MONTHS_PER_YEAR);
  
  if (refiYear < 0 || refiYear >= years) {
    return defaultResult;
  }
  
  const refiInterestRate = property.refinanceInterestRate ?? DEFAULT_INTEREST_RATE;
  const refiTermYears = property.refinanceTermYears ?? DEFAULT_TERM_YEARS;
  const refiMonthlyRate = refiInterestRate / MONTHS_PER_YEAR;
  const refiTotalPayments = refiTermYears * MONTHS_PER_YEAR;
  
  const refiLTV = property.refinanceLTV ?? DEFAULT_REFI_LTV;
  const costBasisValue = (property.purchasePrice ?? 0) + (property.buildingImprovements ?? 0);
  const refiLoanAmount = costBasisValue * refiLTV;
  
  let refiMonthlyPayment = 0;
  if (refiLoanAmount > 0) {
    refiMonthlyPayment = pmt(refiLoanAmount, refiMonthlyRate, refiTotalPayments);
  }
  
  const closingCostRate = property.refinanceClosingCostRate ?? DEFAULT_REFI_CLOSING_COST_RATE;
  const closingCosts = refiLoanAmount * closingCostRate;
  const existingDebt = getAcquisitionOutstandingBalance(loan, refiYear - 1);
  const refiProceeds = Math.max(0, refiLoanAmount - closingCosts - existingDebt);
  
  return {
    refiYear,
    refiProceeds,
    refiLoanAmount,
    refiMonthlyPayment,
    refiInterestRate,
    refiTermYears,
    refiMonthlyRate,
    refiTotalPayments
  };
}

/**
 * Calculate the remaining principal on the refinanced loan at year-end.
 * Same present-value-of-annuity approach as getAcquisitionOutstandingBalance,
 * but measured from the refinance date rather than the acquisition date.
 */
export function getRefiOutstandingBalance(
  refi: RefinanceCalculation,
  yearEnd: number
): number {
  if (refi.refiLoanAmount === 0 || refi.refiYear < 0) return 0;
  const yearsFromRefi = yearEnd - refi.refiYear + 1;
  if (yearsFromRefi < 0) return refi.refiLoanAmount;
  const monthsPaid = Math.min(yearsFromRefi * 12, refi.refiTotalPayments);
  return outstandingBalance(refi.refiMonthlyPayment, refi.refiMonthlyRate, monthsPaid, refi.refiTotalPayments, refi.refiLoanAmount);
}

/**
 * Get total outstanding debt for a property at the end of a given year.
 * After the refinance year, the refi loan replaces the acquisition loan;
 * before that, only the acquisition loan balance is counted.
 */
export function getOutstandingDebtAtYear(
  loan: LoanCalculation,
  refi: RefinanceCalculation,
  year: number
): number {
  if (refi.refiYear >= 0 && year >= refi.refiYear && refi.refiLoanAmount > 0) {
    return getRefiOutstandingBalance(refi, year);
  }
  return getAcquisitionOutstandingBalance(loan, year);
}

export interface YearlyDebtService {
  debtService: number;
  interestExpense: number;
  principalPayment: number;
}

/**
 * Calculate a full year's debt service broken down into interest and principal.
 *
 * Walks through each month of the year, applying the amortization formula:
 *   Interest = outstanding balance × monthly rate
 *   Principal = monthly payment − interest
 *
 * Handles the transition from acquisition loan to refi loan mid-projection,
 * and correctly counts partial years (e.g., property acquired mid-year).
 */
export function calculateYearlyDebtService(
  loan: LoanCalculation,
  refi: RefinanceCalculation,
  year: number
): YearlyDebtService {
  let yearlyDebtService = 0;
  let yearlyInterest = 0;
  let yearlyPrincipal = 0;
  
  const yearStartMonth = year * 12;
  const yearEndMonth = (year + 1) * 12;
  
  if (refi.refiYear >= 0 && year >= refi.refiYear && refi.refiLoanAmount > 0) {
    const refiStartMonth = refi.refiYear * 12;
    const refiPaymentsThisYear = Math.min(12,
      Math.max(0, Math.min(yearEndMonth, refiStartMonth + refi.refiTotalPayments) - Math.max(yearStartMonth, refiStartMonth))
    );
    const skipMonths = Math.max(0, yearStartMonth - refiStartMonth);
    const { interest, principal } = debtServiceForPeriod(
      refi.refiMonthlyPayment, refi.refiMonthlyRate, skipMonths, refiPaymentsThisYear, refi.refiLoanAmount
    );
    yearlyInterest = interest;
    yearlyPrincipal = principal;
    yearlyDebtService = refi.refiMonthlyPayment * refiPaymentsThisYear;
  } else if (loan.loanAmount > 0) {
    const loanPaymentsThisYear = Math.min(12,
      Math.max(0, Math.min(yearEndMonth, loan.acqMonthsFromModelStart + loan.totalPayments) - Math.max(yearStartMonth, loan.acqMonthsFromModelStart))
    );

    if (loanPaymentsThisYear > 0) {
      const skipMonths = Math.max(0, yearStartMonth - loan.acqMonthsFromModelStart);
      const { interest, principal } = debtServiceForPeriod(
        loan.monthlyPayment, loan.monthlyRate, skipMonths, loanPaymentsThisYear, loan.loanAmount
      );
      yearlyInterest = interest;
      yearlyPrincipal = principal;
      yearlyDebtService = loan.monthlyPayment * loanPaymentsThisYear;
    }
  }
  
  return {
    debtService: yearlyDebtService,
    interestExpense: yearlyInterest,
    principalPayment: yearlyPrincipal
  };
}

/**
 * Calculate the net exit value (proceeds to equity holders) when a property is sold.
 *
 * Exit Value = (Terminal NOI / Cap Rate) − Sales Commission − Outstanding Debt
 *
 * The cap rate converts the property's stabilized NOI into a market value
 * (lower cap rate = higher value). The commission covers broker fees, and
 * outstanding debt must be repaid from sale proceeds before equity gets paid.
 */
export function calculateExitValue(
  noi: number,
  loan: LoanCalculation,
  refi: RefinanceCalculation,
  year: number,
  exitCapRate?: number | null
): number {
  const capRate = exitCapRate ?? DEFAULT_EXIT_CAP_RATE;
  const grossValue = capRate > 0 ? noi / capRate : 0;
  const commission = grossValue * loan.commissionRate;
  const outstandingDebt = getOutstandingDebtAtYear(loan, refi, year);
  return grossValue - commission - outstandingDebt;
}

/** Determine which model year (0-indexed) the property was acquired in. */
export function getAcquisitionYear(loan: LoanCalculation): number {
  return Math.floor(loan.acqMonthsFromModelStart / MONTHS_PER_YEAR);
}

export interface YearlyCashFlowResult {
  year: number;
  // Operating Performance
  noi: number;
  anoi: number;
  interestExpense: number;
  depreciation: number;
  // GAAP Net Income Calculation
  netIncome: number;           // NOI - Interest - Depreciation - Tax
  taxLiability: number;
  // GAAP Operating Cash Flow (Indirect Method)
  operatingCashFlow: number;   // Net Income + Depreciation (add back non-cash)
  workingCapitalChange: number; // Changes in receivables, payables, etc.
  cashFromOperations: number;  // OCF ± Working Capital Changes
  // GAAP Free Cash Flow (to the property)
  maintenanceCapex: number;    // Ongoing capital expenditures (FF&E reserves, maintenance)
  freeCashFlow: number;        // Cash from Operations - Maintenance CapEx
  // Financing Activities
  principalPayment: number;
  debtService: number;
  // Free Cash Flow to Equity (after debt service)
  freeCashFlowToEquity: number; // FCF - Principal Payments
  // Legacy fields for compatibility
  btcf: number;                // NOI - Debt Service (Before-Tax Cash Flow)
  taxableIncome: number;       // NOI - Interest - Depreciation
  atcf: number;                // BTCF - Tax (After-Tax Cash Flow)
  // Capital Events (Investing/Financing)
  capitalExpenditures: number; // Initial equity investment (negative in acquisition year)
  refinancingProceeds: number;
  exitValue: number;
  // Net to Investors
  netCashFlowToInvestors: number;
  cumulativeCashFlow: number;
}

