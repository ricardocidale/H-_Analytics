/**
 * cashFlowAggregator — GAAP indirect-method yearly cash flow builder
 *
 * Single source of truth for YearlyCashFlowResult[] — consumed by
 * YearlyCashFlowStatement, excelExport, and PropertyDetail.
 *
 * All debt service, depreciation, tax, and refinance values are read directly
 * from the engine's MonthlyFinancials — nothing is recomputed here.
 * This eliminates the dual-path problem where statement and export rows
 * diverged because exports independently re-derived these values.
 *
 * GAAP indirect method (ASC 230):
 *   Operating CF  = Net Income + Depreciation add-back
 *   Financing CF  = -Principal + Refinancing Proceeds
 *   Cash from ops = Operating CF (working capital change modeled as 0)
 *
 * Exit year annualization: in the final year the exit sale proceeds are
 * added to the last-year cash flow. The function caller is responsible
 * for computing and passing those proceeds separately.
 */

import { MonthlyFinancials } from "../types";
import {
  LoanParams,
  GlobalLoanParams,
  calculateLoanParams,
  getAcquisitionYear,
  YearlyCashFlowResult,
} from "../debt/loanCalculations";
import { DEFAULT_EXIT_CAP_RATE, DEFAULT_COMMISSION_RATE } from "@/lib/constants";

/**
 * Aggregate monthly engine data into yearly YearlyCashFlowResult[].
 *
 * All debt, depreciation, tax, and refinance values come from the engine's
 * monthly calculations — nothing is re-derived. This guarantees that IS, CF,
 * BS, and all exports use identical numbers.
 */
export function aggregateCashFlowByYear(
  data: MonthlyFinancials[],
  property: LoanParams,
  global: GlobalLoanParams | undefined,
  years: number
): YearlyCashFlowResult[] {
  const loan = calculateLoanParams(property, global);
  const acquisitionYear = getAcquisitionYear(loan);
  const results: YearlyCashFlowResult[] = [];
  let cumulative = 0;

  const exitCapRate = property.exitCapRate ?? global?.exitCapRate ?? DEFAULT_EXIT_CAP_RATE;
  const commissionRate = property.dispositionCommission ?? DEFAULT_COMMISSION_RATE;

  for (let y = 0; y < years; y++) {
    const yearStart = y * 12;
    const yearEnd = Math.min((y + 1) * 12, data.length);
    let noi = 0, anoi = 0, interestExpense = 0, principalPayment = 0,
        debtService = 0, depreciationExpense = 0, taxLiability = 0,
        netIncome = 0, refiProceeds = 0, expenseFFE = 0, workingCapitalChange = 0;
    let operationalMonthsInYear = 0;
    for (let mi = yearStart; mi < yearEnd; mi++) {
      const m = data[mi];
      noi += m.noi;
      anoi += m.anoi;
      interestExpense += m.interestExpense;
      principalPayment += m.principalPayment;
      debtService += m.debtPayment;
      depreciationExpense += m.depreciationExpense;
      taxLiability += m.incomeTax;
      netIncome += m.netIncome;
      refiProceeds += m.refinancingProceeds;
      expenseFFE += m.expenseFFE;
      workingCapitalChange += m.workingCapitalChange;
      if (m.revenueTotal > 0) operationalMonthsInYear++;
    }

    const operatingCashFlow = netIncome + depreciationExpense;
    const cashFromOperations = operatingCashFlow - workingCapitalChange;
    const freeCashFlow = cashFromOperations - expenseFFE;
    const freeCashFlowToEquity = freeCashFlow - principalPayment;
    const btcf = anoi - debtService;
    const taxableIncome = anoi - interestExpense - depreciationExpense;
    const atcf = btcf - taxLiability;

    const isLastYear = y === years - 1;
    const annualizedNOI = operationalMonthsInYear >= 12
      ? noi
      : operationalMonthsInYear > 0
        ? (noi / operationalMonthsInYear) * 12
        : 0;
    let exitValue = 0;
    if (isLastYear && exitCapRate > 0 && annualizedNOI > 0) {
      const grossValue = annualizedNOI / exitCapRate;
      const commission = grossValue * commissionRate;
      const outstandingDebt = yearEnd > yearStart ? data[yearEnd - 1].debtOutstanding : 0;
      exitValue = grossValue - commission - outstandingDebt;
    }

    const capitalExpenditures = y === acquisitionYear ? loan.equityInvested : 0;
    const netCashFlowToInvestors = atcf + refiProceeds + (isLastYear ? exitValue : 0) - (y === acquisitionYear ? loan.equityInvested : 0);
    cumulative += netCashFlowToInvestors;

    results.push({
      year: y,
      noi,
      anoi,
      interestExpense,
      depreciation: depreciationExpense,
      netIncome,
      taxLiability,
      operatingCashFlow,
      workingCapitalChange,
      cashFromOperations,
      maintenanceCapex: expenseFFE,
      freeCashFlow,
      principalPayment,
      debtService,
      freeCashFlowToEquity,
      btcf,
      taxableIncome,
      atcf,
      capitalExpenditures,
      refinancingProceeds: refiProceeds,
      exitValue,
      netCashFlowToInvestors,
      cumulativeCashFlow: cumulative,
    });
  }

  return results;
}
