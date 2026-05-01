/**
 * consolidation.ts — Portfolio-level consolidation of yearly property financials
 *
 * Replaces the generic numeric-sum loop in usePortfolioFinancials with
 * explicit aggregation rules per field:
 *   SUM      — flow metrics (revenue, expenses, cash flows)
 *   WEIGHTED — rates that require denominator weighting (ADR)
 *   PICK_LAST — stock variables that represent point-in-time balances
 *
 * This function is pure (no hooks, no React) so it can be used in both
 * the dashboard hook and in test/export contexts.
 */

import type { YearlyPropertyFinancials } from "./yearlyAggregator";
import type { WeightedMetrics } from "../types";

/** Typed helper: add all numeric fields from source into target */
function addPropertyYear(target: YearlyPropertyFinancials, src: YearlyPropertyFinancials): void {
  target.soldRooms += src.soldRooms;
  target.availableRooms += src.availableRooms;
  target.revenueRooms += src.revenueRooms;
  target.revenueEvents += src.revenueEvents;
  target.revenueFB += src.revenueFB;
  target.revenueOther += src.revenueOther;
  target.revenueTotal += src.revenueTotal;
  target.expenseRooms += src.expenseRooms;
  target.expenseFB += src.expenseFB;
  target.expenseEvents += src.expenseEvents;
  target.expenseOther += src.expenseOther;
  target.expenseOtherCosts += src.expenseOtherCosts;
  target.expenseInsurance += src.expenseInsurance;
  target.expenseMarketing += src.expenseMarketing;
  target.expensePropertyOps += src.expensePropertyOps;
  target.expenseUtilitiesVar += src.expenseUtilitiesVar;
  target.expenseUtilitiesFixed += src.expenseUtilitiesFixed;
  target.expenseUtilities += src.expenseUtilities;
  target.expenseAdmin += src.expenseAdmin;
  target.expenseIT += src.expenseIT;
  target.expenseTaxes += src.expenseTaxes;
  target.expenseFFE += src.expenseFFE;
  target.expensePlatformFees += src.expensePlatformFees;
  target.expensePreOpening += src.expensePreOpening;
  target.feeBase += src.feeBase;
  target.feeIncentive += src.feeIncentive;
  target.totalExpenses += src.totalExpenses;
  target.gop += src.gop;
  target.agop += src.agop;
  target.noi += src.noi;
  target.anoi += src.anoi;
  target.interestExpense += src.interestExpense;
  target.depreciationExpense += src.depreciationExpense;
  target.incomeTax += src.incomeTax;
  target.netIncome += src.netIncome;
  target.principalPayment += src.principalPayment;
  target.debtPayment += src.debtPayment;
  target.refinancingProceeds += src.refinancingProceeds;
  target.accountsReceivable += src.accountsReceivable;
  target.accountsPayable += src.accountsPayable;
  target.workingCapitalChange += src.workingCapitalChange;
  // NOL is entity-specific (per SPV) — not meaningful when summed across portfolio.
  // Keep as sum for display purposes only; never use in portfolio-level tax calculations.
  target.nolBalance += src.nolBalance;
  target.cashFlow += src.cashFlow;
  target.operatingCashFlow += src.operatingCashFlow;
  target.financingCashFlow += src.financingCashFlow;
  target.endingCash += src.endingCash;
}

/**
 * Consolidate per-property yearly IS data into portfolio-level yearly data.
 *
 * Rules:
 * - Most numeric fields: SUM across properties
 * - cleanAdr: WEIGHTED average (room revenue / rooms sold)
 * - serviceFeesByCategory: SUM by category key
 * - year: set to year index
 */
export function consolidateYearlyFinancials(
  allPropertyYearlyIS: YearlyPropertyFinancials[][],
  projectionYears: number,
): YearlyPropertyFinancials[] {
  if (!allPropertyYearlyIS.length) return [];

  return Array.from({ length: projectionYears }, (_, y) => {
    const base = createEmptyYear(y);

    for (const propYearly of allPropertyYearlyIS) {
      const py = propYearly[y];
      if (!py) continue;

      addPropertyYear(base, py);

      // SUM service fee categories
      if (py.serviceFeesByCategory) {
        for (const [cat, val] of Object.entries(py.serviceFeesByCategory)) {
          base.serviceFeesByCategory[cat] = (base.serviceFeesByCategory[cat] ?? 0) + val;
        }
      }
    }

    // WEIGHTED: cleanAdr = total room revenue / total rooms sold
    base.cleanAdr = base.soldRooms > 0 ? base.revenueRooms / base.soldRooms : 0;

    return base;
  });
}

/**
 * Compute weighted operating metrics for the portfolio.
 * Separated from consolidation because these are presentation-layer metrics
 * that don't belong in the YearlyPropertyFinancials interface.
 */
export function computeWeightedMetrics(
  allPropertyYearlyIS: YearlyPropertyFinancials[][],
  projectionYears: number,
): WeightedMetrics[] {
  if (!allPropertyYearlyIS.length) return [];

  return Array.from({ length: projectionYears }, (_, yearIndex) => {
    let totalAvailableRoomNights = 0;
    let totalRoomsSold = 0;
    let totalRoomRevenue = 0;

    for (const propYearly of allPropertyYearlyIS) {
      const py = propYearly[yearIndex];
      if (!py) continue;
      totalAvailableRoomNights += py.availableRooms;
      totalRoomsSold += py.soldRooms;
      totalRoomRevenue += py.revenueRooms;
    }

    const weightedADR = totalRoomsSold > 0 ? totalRoomRevenue / totalRoomsSold : 0;
    const weightedOcc = totalAvailableRoomNights > 0 ? totalRoomsSold / totalAvailableRoomNights : 0;
    const revPAR = totalAvailableRoomNights > 0 ? totalRoomRevenue / totalAvailableRoomNights : 0;

    return { weightedADR, weightedOcc, revPAR, totalAvailableRoomNights };
  });
}

/** Create an empty YearlyPropertyFinancials with all zeros */
function createEmptyYear(yearIndex: number): YearlyPropertyFinancials {
  return {
    year: yearIndex,
    soldRooms: 0, availableRooms: 0, cleanAdr: 0,
    revenueRooms: 0, revenueEvents: 0, revenueFB: 0, revenueOther: 0, revenueTotal: 0,
    expenseRooms: 0, expenseFB: 0, expenseEvents: 0, expenseOther: 0, expenseOtherCosts: 0,
    expenseInsurance: 0, expenseMarketing: 0, expensePropertyOps: 0,
    expenseUtilitiesVar: 0, expenseUtilitiesFixed: 0, expenseUtilities: 0,
    expenseAdmin: 0, expenseIT: 0, expenseTaxes: 0, expenseFFE: 0,
    expensePlatformFees: 0, expensePreOpening: 0,
    feeBase: 0, feeIncentive: 0, serviceFeesByCategory: {},
    totalExpenses: 0, gop: 0, agop: 0, noi: 0, anoi: 0,
    interestExpense: 0, depreciationExpense: 0, incomeTax: 0, netIncome: 0,
    principalPayment: 0, debtPayment: 0, refinancingProceeds: 0,
    accountsReceivable: 0, accountsPayable: 0, workingCapitalChange: 0,
    nolBalance: 0,
    cashFlow: 0, operatingCashFlow: 0, financingCashFlow: 0, endingCash: 0,
  };
}
