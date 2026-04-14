/**
 * refinance-pass — Post-processing pass that applies refinancing to the
 * property pro-forma financials array.
 *
 * Pass 2 of the property engine: if the property is configured for refinancing,
 * this function rebuilds the debt schedule from the refi month onward using
 * computeRefinance() output, re-computes income tax (with NOL carryforward),
 * and re-seeds the operating reserve at the acquisition month.
 *
 * The financials array is mutated in place (same mutation pattern as the
 * original monolithic engine).
 */
import { startOfMonth } from "date-fns";
import { computeRefinance } from '@calc/refinance';
import { DEFAULT_ACCOUNTING_POLICY } from '@domain/types/accounting-policy';
import {
  DEFAULT_INTEREST_RATE,
  DEFAULT_TERM_YEARS,
  DEFAULT_REFI_LTV,
  DEFAULT_REFI_CLOSING_COST_RATE,
} from '@/lib/constants';
import { NOL_UTILIZATION_CAP, MONTHS_PER_YEAR } from '@shared/constants';
import { PropertyInput, GlobalInput, MonthlyFinancials } from '../types';
import { parseLocalDate } from '../helpers/utils';

export interface RefinanceContext {
  modelStart: Date;
  acquisitionDate: Date;
  originalLoanAmount: number;
  taxRate: number;
}

export function applyRefinancePostProcessing(
  financials: MonthlyFinancials[],
  property: PropertyInput,
  global: GlobalInput,
  ctx: RefinanceContext,
  months: number
): void {
  if (property.willRefinance !== "Yes" || !property.refinanceDate) {
    return;
  }

  const refiDate = startOfMonth(parseLocalDate(property.refinanceDate));
  const refiMonthIndex = (refiDate.getFullYear() - ctx.modelStart.getFullYear()) * MONTHS_PER_YEAR +
                         (refiDate.getMonth() - ctx.modelStart.getMonth());

  if (refiMonthIndex < 0 || refiMonthIndex >= months) {
    return;
  }

  const refiYear = Math.floor(refiMonthIndex / MONTHS_PER_YEAR);
  const projectionYears = Math.ceil(months / MONTHS_PER_YEAR);
  const yearlyNOI: number[] = [];
  const yearlyOperationalMonths: number[] = [];
  for (let y = 0; y < projectionYears; y++) {
    const yearSlice = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
    yearlyNOI.push(yearSlice.reduce((sum, m) => sum + m.noi, 0));
    yearlyOperationalMonths.push(yearSlice.filter(m => m.revenueTotal > 0 || m.anoi !== 0).length);
  }

  const refiLTV = property.refinanceLTV ?? DEFAULT_REFI_LTV;
  const costBasisValue = (property.purchasePrice ?? 0) + (property.buildingImprovements ?? 0);
  const refiRate = property.refinanceInterestRate ?? DEFAULT_INTEREST_RATE;
  const refiTermYears = property.refinanceTermYears ?? DEFAULT_TERM_YEARS;
  const closingCostRate = property.refinanceClosingCostRate ?? DEFAULT_REFI_CLOSING_COST_RATE;
  const existingDebt = refiMonthIndex > 0 ? financials[refiMonthIndex - 1].debtOutstanding : ctx.originalLoanAmount;

  const refiOutput = computeRefinance({
    refinance_date: property.refinanceDate!,
    current_loan_balance: existingDebt,
    valuation: { method: "direct", property_value_at_refi: costBasisValue },
    ltv_max: refiLTV,
    closing_cost_pct: closingCostRate,
    prepayment_penalty: { type: "none", value: 0 },
    new_loan_terms: {
      rate_annual: refiRate,
      term_months: refiTermYears * MONTHS_PER_YEAR,
      amortization_months: refiTermYears * MONTHS_PER_YEAR,
      io_months: 0,
    },
    accounting_policy_ref: DEFAULT_ACCOUNTING_POLICY,
    rounding_policy: { precision: 2, bankers_rounding: false },
  });

  if (refiOutput.flags.invalid_inputs.length > 0) {
    return;
  }

  const refiProceeds = refiOutput.cash_out_to_equity;
  const schedule = refiOutput.new_debt_service_schedule;

  const acqMonthIdx = (ctx.acquisitionDate.getFullYear() - ctx.modelStart.getFullYear()) * MONTHS_PER_YEAR +
                      (ctx.acquisitionDate.getMonth() - ctx.modelStart.getMonth());
  let cumCash = 0;
  let refiNolBalance = refiMonthIndex > 0 ? financials[refiMonthIndex - 1].nolBalance : 0;
  for (let i = 0; i < months; i++) {
    const m = financials[i];

    if (i < refiMonthIndex) {
      if (i === acqMonthIdx) {
        cumCash += (property.operatingReserve ?? 0);
      }
      cumCash += m.cashFlow;
      m.endingCash = cumCash;
      m.cashShortfall = cumCash < 0;
    } else {
      const monthsSinceRefi = i - refiMonthIndex;

      let debtPayment = 0;
      let interestExpense = 0;
      let principalPayment = 0;
      let debtOutstanding = 0;

      if (monthsSinceRefi < schedule.length) {
        const entry = schedule[monthsSinceRefi];
        interestExpense = entry.interest;
        principalPayment = entry.principal;
        debtPayment = entry.payment;
        debtOutstanding = entry.ending_balance;
      }

      const taxableIncome = m.anoi - interestExpense - m.depreciationExpense;
      let incomeTax: number;
      if (taxableIncome < 0) {
        refiNolBalance += Math.abs(taxableIncome);
        incomeTax = 0;
      } else if (refiNolBalance > 0) {
        const maxUtil = taxableIncome * NOL_UTILIZATION_CAP;
        const nolUsed = Math.min(refiNolBalance, maxUtil);
        refiNolBalance -= nolUsed;
        incomeTax = (taxableIncome - nolUsed) > 0 ? (taxableIncome - nolUsed) * ctx.taxRate : 0;
      } else {
        incomeTax = taxableIncome > 0 ? taxableIncome * ctx.taxRate : 0;
      }
      m.nolBalance = refiNolBalance;
      const netIncome = m.anoi - interestExpense - m.depreciationExpense - incomeTax;
      const cashFlow = m.anoi - debtPayment - incomeTax;
      const operatingCashFlow = netIncome + m.depreciationExpense;
      const financingCashFlow = -principalPayment;

      const proceeds = (i === refiMonthIndex) ? refiProceeds : 0;

      m.interestExpense = interestExpense;
      m.principalPayment = principalPayment;
      m.debtPayment = debtPayment;
      m.debtOutstanding = debtOutstanding;
      m.incomeTax = incomeTax;
      m.netIncome = netIncome;
      m.cashFlow = cashFlow + proceeds;
      m.operatingCashFlow = operatingCashFlow;
      m.financingCashFlow = financingCashFlow + proceeds;
      m.refinancingProceeds = proceeds;

      cumCash += m.cashFlow;
      m.endingCash = cumCash;
      m.cashShortfall = cumCash < 0;
    }
  }
}
