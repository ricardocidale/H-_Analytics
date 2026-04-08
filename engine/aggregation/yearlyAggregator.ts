/**
 * yearlyAggregator — Monthly-to-yearly rollup for property financials
 *
 * Single source of truth replacing 6 independent implementations across
 * Dashboard, PropertyDetail, YearlyIncomeStatement, YearlyCashFlowStatement,
 * and excelExport that each reimplemented the same slice-and-reduce pattern.
 *
 * Two aggregation strategies are used:
 *   SUM fields   — revenue, expenses, NOI, debt service, cash flows: monthly
 *                  values are summed to produce the annual total.
 *   PICK_LAST    — endingCash: the December (last month) value of the year is
 *                  used because cash is a stock, not a flow. Summing it would
 *                  produce a nonsensical running total × 12.
 *   DERIVED      — expenseUtilities = expenseUtilitiesVar + expenseUtilitiesFixed
 *                  (computed after accumulation, not a raw engine field).
 *   PICK_LAST ADR — cleanAdr is the last non-zero ADR in the year (end-of-year
 *                  rate, not a blended average).
 *
 * Empty years (yearData.length === 0) are skipped entirely via `continue`.
 *
 * Optimized: uses direct index arithmetic instead of data.slice() to avoid
 * intermediate array allocations per year.
 */

import type { MonthlyFinancials } from "../types";
import type { YearlyCashFlowResult } from "../debt/loanCalculations";
import {
  LoanParams,
  GlobalLoanParams,
  calculateLoanParams,
  getAcquisitionYear,
} from "../debt/loanCalculations";
import { DEFAULT_EXIT_CAP_RATE, DEFAULT_COMMISSION_RATE, MONTHS_PER_YEAR } from "@/lib/constants";

/** Superset of all yearly fields needed by IS, CF, BS, and export consumers. */
export interface YearlyPropertyFinancials {
  year: number;

  // Room metrics (SUM)
  soldRooms: number;
  availableRooms: number;

  // Clean ADR: the end-of-year rate from the engine (not blended)
  cleanAdr: number;

  // Revenue (SUM)
  revenueRooms: number;
  revenueEvents: number;
  revenueFB: number;
  revenueOther: number;
  revenueTotal: number;

  // Operating Expenses (SUM)
  expenseRooms: number;
  expenseFB: number;
  expenseEvents: number;
  expenseOther: number;
  expenseOtherCosts: number;
  expenseInsurance: number;
  expenseMarketing: number;
  expensePropertyOps: number;
  expenseUtilitiesVar: number;
  expenseUtilitiesFixed: number;
  expenseUtilities: number; // derived: var + fixed
  expenseAdmin: number;
  expenseIT: number;
  expenseTaxes: number;
  expenseFFE: number;
  expensePlatformFees: number;
  expensePreOpening: number;

  // Fees (SUM)
  feeBase: number;
  feeIncentive: number;
  serviceFeesByCategory: Record<string, number>;

  // Profitability (SUM)
  totalExpenses: number;
  gop: number;
  agop: number;
  noi: number;
  anoi: number;

  // Below-the-line (SUM)
  interestExpense: number;
  depreciationExpense: number;
  incomeTax: number;
  netIncome: number;

  // Financing (SUM)
  principalPayment: number;
  debtPayment: number;
  refinancingProceeds: number;

  // Working capital
  accountsReceivable: number;
  accountsPayable: number;
  workingCapitalChange: number;

  // NOL carryforward
  nolBalance: number;

  // Cash Flow (SUM except endingCash)
  cashFlow: number;
  operatingCashFlow: number;
  financingCashFlow: number;
  endingCash: number; // PICK-LAST: last month of year
}

/**
 * Aggregate engine monthly data into yearly property financials.
 *
 * All values come from the engine's MonthlyFinancials — nothing is re-derived.
 * endingCash uses the last month of each year (pick-last, not sum).
 * expenseUtilities is derived as var + fixed.
 *
 * Optimized: uses direct index arithmetic (y*12 to min((y+1)*12, data.length))
 * instead of data.slice() to avoid allocating intermediate arrays per year.
 */
export function aggregatePropertyByYear(
  data: MonthlyFinancials[],
  years: number,
): YearlyPropertyFinancials[] {
  const results: YearlyPropertyFinancials[] = [];

  for (let y = 0; y < years; y++) {
    const yearStart = y * MONTHS_PER_YEAR;
    const yearEnd = Math.min((y + 1) * MONTHS_PER_YEAR, data.length);
    if (yearStart >= data.length) continue;

    let soldRooms = 0, availableRooms = 0;
    let revenueRooms = 0, revenueEvents = 0, revenueFB = 0, revenueOther = 0, revenueTotal = 0;
    let expenseRooms = 0, expenseFB = 0, expenseEvents = 0, expenseOther = 0;
    let expenseOtherCosts = 0, expenseInsurance = 0, expenseMarketing = 0, expensePropertyOps = 0;
    let expenseUtilitiesVar = 0, expenseUtilitiesFixed = 0;
    let expenseAdmin = 0, expenseIT = 0, expenseTaxes = 0, expenseFFE = 0;
    let expensePlatformFees = 0, expensePreOpening = 0;
    let feeBase = 0, feeIncentive = 0;
    let totalExpenses = 0, gop = 0, agop = 0, noi = 0, anoi = 0;
    let interestExpense = 0, depreciationExpense = 0, incomeTax = 0, netIncome = 0;
    let principalPayment = 0, debtPayment = 0, refinancingProceeds = 0;
    let accountsReceivable = 0, accountsPayable = 0, workingCapitalChange = 0;
    let cashFlow = 0, operatingCashFlow = 0, financingCashFlow = 0;
    const catFees: Record<string, number> = {};

    for (let mi = yearStart; mi < yearEnd; mi++) {
      const m = data[mi];
      soldRooms += m.soldRooms;
      availableRooms += m.availableRooms;
      revenueRooms += m.revenueRooms;
      revenueEvents += m.revenueEvents;
      revenueFB += m.revenueFB;
      revenueOther += m.revenueOther;
      revenueTotal += m.revenueTotal;
      expenseRooms += m.expenseRooms;
      expenseFB += m.expenseFB;
      expenseEvents += m.expenseEvents;
      expenseOther += m.expenseOther;
      expenseOtherCosts += m.expenseOtherCosts;
      expenseInsurance += m.expenseInsurance;
      expenseMarketing += m.expenseMarketing;
      expensePropertyOps += m.expensePropertyOps;
      expenseUtilitiesVar += m.expenseUtilitiesVar;
      expenseUtilitiesFixed += m.expenseUtilitiesFixed;
      expenseAdmin += m.expenseAdmin;
      expenseIT += m.expenseIT;
      expenseTaxes += m.expenseTaxes;
      expenseFFE += m.expenseFFE;
      expensePlatformFees += m.expensePlatformFees;
      expensePreOpening += m.expensePreOpening;
      feeBase += m.feeBase;
      feeIncentive += m.feeIncentive;
      totalExpenses += m.totalExpenses;
      gop += m.gop;
      agop += m.agop;
      noi += m.noi;
      anoi += m.anoi;
      interestExpense += m.interestExpense;
      depreciationExpense += m.depreciationExpense;
      incomeTax += m.incomeTax;
      netIncome += m.netIncome;
      principalPayment += m.principalPayment;
      debtPayment += m.debtPayment;
      refinancingProceeds += m.refinancingProceeds;
      accountsReceivable += m.accountsReceivable;
      accountsPayable += m.accountsPayable;
      workingCapitalChange += m.workingCapitalChange;
      cashFlow += m.cashFlow;
      operatingCashFlow += m.operatingCashFlow;
      financingCashFlow += m.financingCashFlow;
      if (m.serviceFeesByCategory) {
        for (const [cat, val] of Object.entries(m.serviceFeesByCategory)) {
          catFees[cat] = (catFees[cat] ?? 0) + val;
        }
      }
    }

    let cleanAdr = 0;
    for (let mi = yearEnd - 1; mi >= yearStart; mi--) {
      if (data[mi].adr > 0) {
        cleanAdr = data[mi].adr;
        break;
      }
    }

    const lastMonth = data[yearEnd - 1];
    results.push({
      year: y,
      soldRooms,
      availableRooms,
      cleanAdr,
      revenueRooms,
      revenueEvents,
      revenueFB,
      revenueOther,
      revenueTotal,
      expenseRooms,
      expenseFB,
      expenseEvents,
      expenseOther,
      expenseOtherCosts,
      expenseInsurance,
      expenseMarketing,
      expensePropertyOps,
      expenseUtilitiesVar,
      expenseUtilitiesFixed,
      expenseUtilities: expenseUtilitiesVar + expenseUtilitiesFixed,
      expenseAdmin,
      expenseIT,
      expenseTaxes,
      expenseFFE,
      expensePlatformFees,
      expensePreOpening,
      feeBase,
      feeIncentive,
      serviceFeesByCategory: catFees,
      totalExpenses,
      gop,
      agop,
      noi,
      anoi,
      interestExpense,
      depreciationExpense,
      incomeTax,
      netIncome,
      principalPayment,
      debtPayment,
      refinancingProceeds,
      accountsReceivable,
      accountsPayable,
      workingCapitalChange,
      nolBalance: lastMonth.nolBalance,
      cashFlow,
      operatingCashFlow,
      financingCashFlow,
      endingCash: lastMonth.endingCash,
    });
  }

  return results;
}

export interface UnifiedYearlyResult {
  yearlyIS: YearlyPropertyFinancials[];
  yearlyCF: YearlyCashFlowResult[];
}

export function aggregateUnifiedByYear(
  data: MonthlyFinancials[],
  property: LoanParams,
  global: GlobalLoanParams | undefined,
  years: number,
): UnifiedYearlyResult {
  const loan = calculateLoanParams(property, global);
  const acquisitionYear = getAcquisitionYear(loan);
  const exitCapRate = property.exitCapRate ?? global?.exitCapRate ?? DEFAULT_EXIT_CAP_RATE;
  const commissionRate = property.dispositionCommission ?? DEFAULT_COMMISSION_RATE;

  const yearlyIS: YearlyPropertyFinancials[] = [];
  const yearlyCF: YearlyCashFlowResult[] = [];
  let cumulative = 0;

  for (let y = 0; y < years; y++) {
    const yearStart = y * MONTHS_PER_YEAR;
    const yearEnd = Math.min((y + 1) * MONTHS_PER_YEAR, data.length);
    if (yearStart >= data.length) continue;

    let soldRooms = 0, availableRooms = 0;
    let revenueRooms = 0, revenueEvents = 0, revenueFB = 0, revenueOther = 0, revenueTotal = 0;
    let expenseRooms = 0, expenseFB = 0, expenseEvents = 0, expenseOther = 0;
    let expenseOtherCosts = 0, expenseInsurance = 0, expenseMarketing = 0, expensePropertyOps = 0;
    let expenseUtilitiesVar = 0, expenseUtilitiesFixed = 0;
    let expenseAdmin = 0, expenseIT = 0, expenseTaxes = 0, expenseFFE = 0;
    let expensePlatformFees = 0, expensePreOpening = 0;
    let feeBase = 0, feeIncentive = 0;
    let totalExpenses = 0, gop = 0, agop = 0, noi = 0, anoi = 0;
    let interestExpense = 0, depreciationExpense = 0, incomeTax = 0, netIncome = 0;
    let principalPayment = 0, debtPayment = 0, refinancingProceeds = 0;
    let accountsReceivable = 0, accountsPayable = 0, workingCapitalChange = 0;
    let cashFlow = 0, operatingCashFlow = 0, financingCashFlow = 0;
    const catFees: Record<string, number> = {};
    let operationalMonthsInYear = 0;

    for (let mi = yearStart; mi < yearEnd; mi++) {
      const m = data[mi];
      soldRooms += m.soldRooms;
      availableRooms += m.availableRooms;
      revenueRooms += m.revenueRooms;
      revenueEvents += m.revenueEvents;
      revenueFB += m.revenueFB;
      revenueOther += m.revenueOther;
      revenueTotal += m.revenueTotal;
      expenseRooms += m.expenseRooms;
      expenseFB += m.expenseFB;
      expenseEvents += m.expenseEvents;
      expenseOther += m.expenseOther;
      expenseOtherCosts += m.expenseOtherCosts;
      expenseInsurance += m.expenseInsurance;
      expenseMarketing += m.expenseMarketing;
      expensePropertyOps += m.expensePropertyOps;
      expenseUtilitiesVar += m.expenseUtilitiesVar;
      expenseUtilitiesFixed += m.expenseUtilitiesFixed;
      expenseAdmin += m.expenseAdmin;
      expenseIT += m.expenseIT;
      expenseTaxes += m.expenseTaxes;
      expenseFFE += m.expenseFFE;
      expensePlatformFees += m.expensePlatformFees;
      expensePreOpening += m.expensePreOpening;
      feeBase += m.feeBase;
      feeIncentive += m.feeIncentive;
      totalExpenses += m.totalExpenses;
      gop += m.gop;
      agop += m.agop;
      noi += m.noi;
      anoi += m.anoi;
      interestExpense += m.interestExpense;
      depreciationExpense += m.depreciationExpense;
      incomeTax += m.incomeTax;
      netIncome += m.netIncome;
      principalPayment += m.principalPayment;
      debtPayment += m.debtPayment;
      refinancingProceeds += m.refinancingProceeds;
      accountsReceivable += m.accountsReceivable;
      accountsPayable += m.accountsPayable;
      workingCapitalChange += m.workingCapitalChange;
      cashFlow += m.cashFlow;
      operatingCashFlow += m.operatingCashFlow;
      financingCashFlow += m.financingCashFlow;
      if (m.serviceFeesByCategory) {
        for (const [cat, val] of Object.entries(m.serviceFeesByCategory)) {
          catFees[cat] = (catFees[cat] ?? 0) + val;
        }
      }
      if (m.revenueTotal > 0 || m.noi !== 0) operationalMonthsInYear++;
    }

    let cleanAdr = 0;
    for (let mi = yearEnd - 1; mi >= yearStart; mi--) {
      if (data[mi].adr > 0) {
        cleanAdr = data[mi].adr;
        break;
      }
    }

    const lastMonth = data[yearEnd - 1];

    yearlyIS.push({
      year: y,
      soldRooms,
      availableRooms,
      cleanAdr,
      revenueRooms,
      revenueEvents,
      revenueFB,
      revenueOther,
      revenueTotal,
      expenseRooms,
      expenseFB,
      expenseEvents,
      expenseOther,
      expenseOtherCosts,
      expenseInsurance,
      expenseMarketing,
      expensePropertyOps,
      expenseUtilitiesVar,
      expenseUtilitiesFixed,
      expenseUtilities: expenseUtilitiesVar + expenseUtilitiesFixed,
      expenseAdmin,
      expenseIT,
      expenseTaxes,
      expenseFFE,
      expensePlatformFees,
      expensePreOpening,
      feeBase,
      feeIncentive,
      serviceFeesByCategory: catFees,
      totalExpenses,
      gop,
      agop,
      noi,
      anoi,
      interestExpense,
      depreciationExpense,
      incomeTax,
      netIncome,
      principalPayment,
      debtPayment,
      refinancingProceeds,
      accountsReceivable,
      accountsPayable,
      workingCapitalChange,
      nolBalance: lastMonth.nolBalance,
      cashFlow,
      operatingCashFlow,
      financingCashFlow,
      endingCash: lastMonth.endingCash,
    });

    const cfOperatingCashFlow = netIncome + depreciationExpense;
    const cashFromOperations = cfOperatingCashFlow - workingCapitalChange;
    const freeCashFlow = cashFromOperations - expenseFFE;
    const freeCashFlowToEquity = freeCashFlow - principalPayment;
    const btcf = anoi - debtPayment;
    const taxableIncome = anoi - interestExpense - depreciationExpense;
    const atcf = btcf - incomeTax;

    const isLastYear = y === years - 1;
    const annualizedNOI = operationalMonthsInYear >= MONTHS_PER_YEAR
      ? noi
      : operationalMonthsInYear > 0
        ? (noi / operationalMonthsInYear) * MONTHS_PER_YEAR
        : 0;
    let exitValue = 0;
    if (isLastYear && exitCapRate > 0) {
      const grossValue = annualizedNOI / exitCapRate;
      const commission = grossValue * commissionRate;
      const outstandingDebt = yearEnd > yearStart ? data[yearEnd - 1].debtOutstanding : 0;
      exitValue = grossValue - commission - outstandingDebt;
    }

    const capitalExpenditures = y === acquisitionYear ? loan.equityInvested : 0;
    const netCashFlowToInvestors = atcf + refinancingProceeds + (isLastYear ? exitValue : 0) - (y === acquisitionYear ? loan.equityInvested : 0);
    cumulative += netCashFlowToInvestors;

    yearlyCF.push({
      year: y,
      noi,
      anoi,
      interestExpense,
      depreciation: depreciationExpense,
      netIncome,
      taxLiability: incomeTax,
      operatingCashFlow: cfOperatingCashFlow,
      workingCapitalChange,
      cashFromOperations,
      maintenanceCapex: expenseFFE,
      freeCashFlow,
      principalPayment,
      debtService: debtPayment,
      freeCashFlowToEquity,
      btcf,
      taxableIncome,
      atcf,
      capitalExpenditures,
      refinancingProceeds,
      exitValue,
      netCashFlowToInvestors,
      cumulativeCashFlow: cumulative,
    });
  }

  return { yearlyIS, yearlyCF };
}
