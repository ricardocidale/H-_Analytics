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
  DEFAULT_EXIT_CAP_RATE,
} from '@shared/constants';
import { NOL_UTILIZATION_CAP, MONTHS_PER_YEAR } from '@shared/constants';
import { PropertyInput, GlobalInput, MonthlyFinancials } from '../types';
import { parseLocalDate } from '../helpers/utils';

export interface RefinanceContext {
  modelStart: Date;
  acquisitionDate: Date;
  originalLoanAmount: number;
  taxRate: number;
}

/**
 * Cap the refi LTV so the resulting new-loan amount does not exceed
 * `originalLoanAmount × refiMaxLtvToOriginal` (Plan 2026-05-13-001 U2).
 *
 * Without this cap, the refi can dwarf the original debt: e.g. a property
 * bought at $5M (acquisition loan $3.75M) whose Year-7 NOI implies a new
 * loan of $11M at 70% LTV-of-new-value silently produces a $7M+ cash-out
 * spike that inflates the combined-portfolio IRR.
 *
 * The cap on the resulting loan amount translates into an upper bound on
 * the effective LTV-against-valuation:
 *
 *   maxLtv = (originalLoan × refiMaxLtvToOriginal) / propertyValueAtRefi
 *   effectiveLtv = min(refiLtv, maxLtv)
 *
 * Degenerate inputs (`propertyValueAtRefi <= 0` or `originalLoanAmount <= 0`)
 * fall through with `capBinds=false` and the original `refiLtv` — the caller's
 * existing cost-basis fallback / invalid-inputs branch handles them.
 *
 * Pure function (no I/O, no logging) — the engine logs the binding when
 * `capBinds === true`. Extracted from `applyRefinancePostProcessing` so the
 * branch logic is testable without constructing a full MonthlyFinancials[].
 */
export function applyRefiLtvOriginalCap(args: {
  refiLtv: number;
  refiMaxLtvToOriginal: number;
  originalLoanAmount: number;
  propertyValueAtRefi: number;
}): { effectiveLtv: number; capBinds: boolean; impliedLtvCap: number | null } {
  const { refiLtv, refiMaxLtvToOriginal, originalLoanAmount, propertyValueAtRefi } = args;
  if (propertyValueAtRefi <= 0 || originalLoanAmount <= 0) {
    return { effectiveLtv: refiLtv, capBinds: false, impliedLtvCap: null };
  }
  const impliedLtvCap = (originalLoanAmount * refiMaxLtvToOriginal) / propertyValueAtRefi;
  if (impliedLtvCap < refiLtv) {
    return { effectiveLtv: impliedLtvCap, capBinds: true, impliedLtvCap };
  }
  return { effectiveLtv: refiLtv, capBinds: false, impliedLtvCap };
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

  // Reject refinance before acquisition date
  const acqDate = startOfMonth(parseLocalDate(property.acquisitionDate ?? ctx.modelStart.toISOString().slice(0, 10)));
  const acqIdx = (acqDate.getFullYear() - ctx.modelStart.getFullYear()) * MONTHS_PER_YEAR +
                 (acqDate.getMonth() - ctx.modelStart.getMonth());
  if (refiMonthIndex < Math.max(0, acqIdx)) {
    return;
  }

  const refiYear = Math.floor(refiMonthIndex / MONTHS_PER_YEAR);
  const projectionYears = Math.ceil(months / MONTHS_PER_YEAR);
  const yearlyNOI: number[] = [];
  const yearlyOperationalMonths: number[] = [];
  for (let y = 0; y < projectionYears; y++) {
    const yearSlice = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
    yearlyNOI.push(yearSlice.reduce((sum, m) => sum + m.noi, 0)); // NOI (pre-FF&E) — lender appraises against pre-reserve income by convention; ANOI used for cash flows below
    yearlyOperationalMonths.push(yearSlice.filter(m => m.revenueTotal > 0 || m.anoi !== 0).length);
  }

  const refiLTV = property.refinanceLTV ?? DEFAULT_REFI_LTV;
  const costBasisValue = (property.purchasePrice ?? 0) + (property.buildingImprovements ?? 0);
  const refiRate = property.refinanceInterestRate ?? DEFAULT_INTEREST_RATE;
  const refiTermYears = property.refinanceTermYears ?? DEFAULT_TERM_YEARS;
  const closingCostRate = property.refinanceClosingCostRate ?? DEFAULT_REFI_CLOSING_COST_RATE;
  const existingDebt = refiMonthIndex > 0 ? financials[refiMonthIndex - 1].debtOutstanding : ctx.originalLoanAmount;

  // Income-capitalization: refiLoan = (yearlyNOI[refiYear] / exitCapRate) × refiLTV
  // Fallback to cost-basis when NOI ≤ 0 (zero-NOI or pre-stabilization property).
  const exitCapRate = property.exitCapRate ?? global.exitCapRate ?? DEFAULT_EXIT_CAP_RATE;
  const refiNOI = yearlyNOI[refiYear] ?? 0;
  let propertyValueAtRefi: number;
  if (refiNOI <= 0) {
    console.warn(
      `[refinance-pass] NOI ≤ 0 at refiYear=${refiYear} (NOI=${refiNOI}); falling back to cost-basis valuation.`
    );
    propertyValueAtRefi = costBasisValue;
  } else {
    // Direct income-cap: value = NOI / capRate; loan = value × LTV
    propertyValueAtRefi = refiNOI / exitCapRate;
  }

  // Refi LTV cap relative to ORIGINAL acquisition loan amount (Plan 2026-05-13-001 U2).
  // See `applyRefiLtvOriginalCap` for the cap math + rationale.
  const refiMaxLtvToOriginal = property.refiMaxLtvToOriginal;
  const capResult = applyRefiLtvOriginalCap({
    refiLtv: refiLTV,
    refiMaxLtvToOriginal,
    originalLoanAmount: ctx.originalLoanAmount,
    propertyValueAtRefi,
  });
  if (capResult.capBinds) {
    console.warn(
      `[refinance-pass] refi_max_ltv_to_original cap binds at refiMonth=${refiMonthIndex}: ` +
      `originalLoan=${ctx.originalLoanAmount.toFixed(2)} × cap=${refiMaxLtvToOriginal} = ` +
      `${(ctx.originalLoanAmount * refiMaxLtvToOriginal).toFixed(2)} (max new-loan); ` +
      `propertyValueAtRefi=${propertyValueAtRefi.toFixed(2)}; ` +
      `effective LTV lowered from ${refiLTV} to ${capResult.effectiveLtv.toFixed(4)}.`
    );
  }

  const refiOutput = computeRefinance({
    refinance_date: property.refinanceDate!,
    current_loan_balance: existingDebt,
    valuation: { method: "direct", property_value_at_refi: propertyValueAtRefi },
    ltv_max: capResult.effectiveLtv,
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
  let refiNolBalance = refiMonthIndex > 0 ? financials[refiMonthIndex - 1].nolBalance : financials[0].nolBalance;
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
