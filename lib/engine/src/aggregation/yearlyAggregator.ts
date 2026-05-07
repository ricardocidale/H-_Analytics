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
import { DEFAULT_EXIT_CAP_RATE, DEFAULT_COMMISSION_RATE, MONTHS_PER_YEAR } from "@shared/constants";

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
 * Accumulator state for one year's worth of monthly IS fields.
 * Shared by aggregatePropertyByYear and aggregateUnifiedByYear to avoid
 * duplicating the ~50-field inner loop.
 */
interface YearAccumulator {
  soldRooms: number; availableRooms: number;
  revenueRooms: number; revenueEvents: number; revenueFB: number; revenueOther: number; revenueTotal: number;
  expenseRooms: number; expenseFB: number; expenseEvents: number; expenseOther: number;
  expenseOtherCosts: number; expenseInsurance: number; expenseMarketing: number; expensePropertyOps: number;
  expenseUtilitiesVar: number; expenseUtilitiesFixed: number;
  expenseAdmin: number; expenseIT: number; expenseTaxes: number; expenseFFE: number;
  expensePlatformFees: number; expensePreOpening: number;
  feeBase: number; feeIncentive: number;
  totalExpenses: number; gop: number; agop: number; noi: number; anoi: number;
  interestExpense: number; depreciationExpense: number; incomeTax: number; netIncome: number;
  principalPayment: number; debtPayment: number; refinancingProceeds: number;
  accountsReceivable: number; accountsPayable: number; workingCapitalChange: number;
  cashFlow: number; operatingCashFlow: number; financingCashFlow: number;
  catFees: Record<string, number>;
}

function makeAccumulator(): YearAccumulator {
  return {
    soldRooms: 0, availableRooms: 0,
    revenueRooms: 0, revenueEvents: 0, revenueFB: 0, revenueOther: 0, revenueTotal: 0,
    expenseRooms: 0, expenseFB: 0, expenseEvents: 0, expenseOther: 0,
    expenseOtherCosts: 0, expenseInsurance: 0, expenseMarketing: 0, expensePropertyOps: 0,
    expenseUtilitiesVar: 0, expenseUtilitiesFixed: 0,
    expenseAdmin: 0, expenseIT: 0, expenseTaxes: 0, expenseFFE: 0,
    expensePlatformFees: 0, expensePreOpening: 0,
    feeBase: 0, feeIncentive: 0,
    totalExpenses: 0, gop: 0, agop: 0, noi: 0, anoi: 0,
    interestExpense: 0, depreciationExpense: 0, incomeTax: 0, netIncome: 0,
    principalPayment: 0, debtPayment: 0, refinancingProceeds: 0,
    accountsReceivable: 0, accountsPayable: 0, workingCapitalChange: 0,
    cashFlow: 0, operatingCashFlow: 0, financingCashFlow: 0,
    catFees: {},
  };
}

/**
 * Accumulate one month's MonthlyFinancials into the year accumulator.
 * Extracted to eliminate the duplicated 50-field loop between
 * aggregatePropertyByYear and aggregateUnifiedByYear.
 */
function accumulateMonthlyIS(acc: YearAccumulator, m: MonthlyFinancials): void {
  acc.soldRooms += m.soldRooms;
  acc.availableRooms += m.availableRooms;
  acc.revenueRooms += m.revenueRooms;
  acc.revenueEvents += m.revenueEvents;
  acc.revenueFB += m.revenueFB;
  acc.revenueOther += m.revenueOther;
  acc.revenueTotal += m.revenueTotal;
  acc.expenseRooms += m.expenseRooms;
  acc.expenseFB += m.expenseFB;
  acc.expenseEvents += m.expenseEvents;
  acc.expenseOther += m.expenseOther;
  acc.expenseOtherCosts += m.expenseOtherCosts;
  acc.expenseInsurance += m.expenseInsurance;
  acc.expenseMarketing += m.expenseMarketing;
  acc.expensePropertyOps += m.expensePropertyOps;
  acc.expenseUtilitiesVar += m.expenseUtilitiesVar;
  acc.expenseUtilitiesFixed += m.expenseUtilitiesFixed;
  acc.expenseAdmin += m.expenseAdmin;
  acc.expenseIT += m.expenseIT;
  acc.expenseTaxes += m.expenseTaxes;
  acc.expenseFFE += m.expenseFFE;
  acc.expensePlatformFees += m.expensePlatformFees;
  acc.expensePreOpening += m.expensePreOpening;
  acc.feeBase += m.feeBase;
  acc.feeIncentive += m.feeIncentive;
  acc.totalExpenses += m.totalExpenses;
  acc.gop += m.gop;
  acc.agop += m.agop;
  acc.noi += m.noi;
  acc.anoi += m.anoi;
  acc.interestExpense += m.interestExpense;
  acc.depreciationExpense += m.depreciationExpense;
  acc.incomeTax += m.incomeTax;
  acc.netIncome += m.netIncome;
  acc.principalPayment += m.principalPayment;
  acc.debtPayment += m.debtPayment;
  acc.refinancingProceeds += m.refinancingProceeds;
  acc.accountsReceivable += m.accountsReceivable;
  acc.accountsPayable += m.accountsPayable;
  acc.workingCapitalChange += m.workingCapitalChange;
  acc.cashFlow += m.cashFlow;
  acc.operatingCashFlow += m.operatingCashFlow;
  acc.financingCashFlow += m.financingCashFlow;
  if (m.serviceFeesByCategory) {
    for (const [cat, val] of Object.entries(m.serviceFeesByCategory)) {
      acc.catFees[cat] = (acc.catFees[cat] ?? 0) + val;
    }
  }
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

    const acc = makeAccumulator();
    for (let mi = yearStart; mi < yearEnd; mi++) {
      accumulateMonthlyIS(acc, data[mi]);
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
      soldRooms: acc.soldRooms,
      availableRooms: acc.availableRooms,
      cleanAdr,
      revenueRooms: acc.revenueRooms,
      revenueEvents: acc.revenueEvents,
      revenueFB: acc.revenueFB,
      revenueOther: acc.revenueOther,
      revenueTotal: acc.revenueTotal,
      expenseRooms: acc.expenseRooms,
      expenseFB: acc.expenseFB,
      expenseEvents: acc.expenseEvents,
      expenseOther: acc.expenseOther,
      expenseOtherCosts: acc.expenseOtherCosts,
      expenseInsurance: acc.expenseInsurance,
      expenseMarketing: acc.expenseMarketing,
      expensePropertyOps: acc.expensePropertyOps,
      expenseUtilitiesVar: acc.expenseUtilitiesVar,
      expenseUtilitiesFixed: acc.expenseUtilitiesFixed,
      expenseUtilities: acc.expenseUtilitiesVar + acc.expenseUtilitiesFixed,
      expenseAdmin: acc.expenseAdmin,
      expenseIT: acc.expenseIT,
      expenseTaxes: acc.expenseTaxes,
      expenseFFE: acc.expenseFFE,
      expensePlatformFees: acc.expensePlatformFees,
      expensePreOpening: acc.expensePreOpening,
      feeBase: acc.feeBase,
      feeIncentive: acc.feeIncentive,
      serviceFeesByCategory: acc.catFees,
      totalExpenses: acc.totalExpenses,
      gop: acc.gop,
      agop: acc.agop,
      noi: acc.noi,
      anoi: acc.anoi,
      interestExpense: acc.interestExpense,
      depreciationExpense: acc.depreciationExpense,
      incomeTax: acc.incomeTax,
      netIncome: acc.netIncome,
      principalPayment: acc.principalPayment,
      debtPayment: acc.debtPayment,
      refinancingProceeds: acc.refinancingProceeds,
      accountsReceivable: acc.accountsReceivable,
      accountsPayable: acc.accountsPayable,
      workingCapitalChange: acc.workingCapitalChange,
      nolBalance: lastMonth.nolBalance,
      cashFlow: acc.cashFlow,
      operatingCashFlow: acc.operatingCashFlow,
      financingCashFlow: acc.financingCashFlow,
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

    const acc = makeAccumulator();
    let operationalMonthsInYear = 0;

    for (let mi = yearStart; mi < yearEnd; mi++) {
      const m = data[mi];
      accumulateMonthlyIS(acc, m);
      if (m.revenueTotal > 0) operationalMonthsInYear++;
    }

    let cleanAdr = 0;
    for (let mi = yearEnd - 1; mi >= yearStart; mi--) {
      if (data[mi].adr > 0) {
        cleanAdr = data[mi].adr;
        break;
      }
    }

    const lastMonth = data[yearEnd - 1];

    const {
      soldRooms, availableRooms,
      revenueRooms, revenueEvents, revenueFB, revenueOther, revenueTotal,
      expenseRooms, expenseFB, expenseEvents, expenseOther,
      expenseOtherCosts, expenseInsurance, expenseMarketing, expensePropertyOps,
      expenseUtilitiesVar, expenseUtilitiesFixed,
      expenseAdmin, expenseIT, expenseTaxes, expenseFFE,
      expensePlatformFees, expensePreOpening,
      feeBase, feeIncentive,
      totalExpenses, gop, agop, noi, anoi,
      interestExpense, depreciationExpense, incomeTax, netIncome,
      principalPayment, debtPayment, refinancingProceeds,
      accountsReceivable, accountsPayable, workingCapitalChange,
      cashFlow, operatingCashFlow, financingCashFlow,
      catFees,
    } = acc;

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
    if (isLastYear && exitCapRate > 0 && annualizedNOI > 0) {
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
