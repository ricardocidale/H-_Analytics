/**
 * refinance-calculator.ts — Hotel Property Refinance Engine
 *
 * When a hotel property's value increases (through higher NOI or market appreciation),
 * the owner can refinance — take out a new, larger loan to pay off the old one and
 * pocket the difference as tax-free cash (called "cash-out refinance").
 *
 * This is one of the most important wealth-building strategies in real estate:
 * you get cash without selling the property, and the cash isn't taxed because
 * it's borrowed money (a liability), not income.
 *
 * The refinance calculation pipeline has 8 steps:
 *   1. Validate inputs (no negative values, rates within bounds, etc.)
 *   2. Compute payoff — how much is needed to retire the old loan
 *      (remaining balance + prepayment penalty + accrued interest)
 *   3. Size the new loan — the lesser of LTV max and DSCR constraint
 *      LTV (Loan-to-Value): New loan ≤ X% of property value (e.g., 75%)
 *      DSCR (Debt Service Coverage Ratio): Annual NOI ÷ annual debt service ≥ Y (e.g., 1.25×)
 *      The binding constraint (whichever produces the smaller loan) wins.
 *   4. Compute cash-out = New loan net proceeds - Payoff amount
 *      If negative (new loan doesn't cover old debt), cash-out is zero.
 *   5. Build a proceeds breakdown (like a settlement statement at closing)
 *   6. Generate the new loan's amortization schedule (monthly payments)
 *   7. Build journal hooks — pre-formatted accounting entries for GAAP journals
 *   8. Assemble flags (which constraint bound, whether cash-out was negative)
 *
 * GAAP treatment:
 *   - Old debt removal and new debt recording are separate journal entries
 *   - Prepayment penalties and closing costs are expensed in the period incurred
 *   - Cash-out is classified as financing cash flow (ASC 230), never as income
 *   - Only interest from the new loan flows through the income statement
 */
import { validateRefinanceInput } from "./validate.js";
import { computePayoff } from "./payoff.js";
import { computeSizing } from "./sizing.js";
import { buildSchedule } from "./schedule.js";
import { buildJournalHooks } from "./journal-hooks.js";
import type {
  RefinanceInput,
  RefinanceOutput,
  RefinanceFlags,
  ProceedsLineItem,
} from "./types.js";
import { roundTo } from "../../domain/types/rounding.js";

/**
 * Main entry point for the Refinance Calculator.
 *
 * Computes refinance proceeds, payoff amounts, penalties, new debt schedule,
 * and equity cash-out. Returns structured flags and journal hooks.
 *
 * GAAP invariants enforced:
 * - Payoff reduces old debt; new debt recorded separately
 * - Penalties/fees recognized in period incurred (default policy)
 * - Cash-out is financing cash flow, not income
 * - Only interest hits IS; principal reduces BS/CF
 */
export function computeRefinance(input: RefinanceInput): RefinanceOutput {
  const r = (v: number) => roundTo(v, input.rounding_policy);

  // Step 1: Validate inputs
  const validationErrors = validateRefinanceInput(input);
  if (validationErrors.length > 0) {
    return buildErrorResult(validationErrors);
  }

  // Step 2: Compute payoff amount
  const payoff = computePayoff(
    input.current_loan_balance,
    input.prepayment_penalty,
    input.accrued_interest_to_payoff ?? 0,
    input.rounding_policy,
  );

  // Step 3: Size the new loan (LTV vs DSCR)
  const sizing = computeSizing(
    input.valuation,
    input.ltv_max,
    input.new_loan_terms,
    input.dscr_min,
    input.noi_for_dscr,
    input.rounding_policy,
  );

  const newLoanGross = sizing.final_loan_amount;
  const closingCosts = r(newLoanGross * input.closing_cost_pct);
  const newLoanNet = r(newLoanGross - closingCosts);

  // Step 4: Compute cash-out to equity (or cash-in required)
  const rawCashOut = r(newLoanNet - payoff.total);
  const negativeCashOut = rawCashOut < 0;
  const cashOutToEquity = negativeCashOut ? 0 : rawCashOut;
  const cashInRequired = negativeCashOut ? r(Math.abs(rawCashOut)) : 0;

  // Step 5: Build proceeds breakdown
  const proceeds: ProceedsLineItem[] = [
    { label: "New Loan (Gross)", amount: newLoanGross },
    { label: "Less: Closing Costs", amount: -closingCosts },
    { label: "Net Loan Proceeds", amount: newLoanNet },
    { label: "Less: Old Loan Payoff", amount: -payoff.old_loan_balance },
  ];
  if (payoff.prepayment_penalty > 0) {
    proceeds.push({
      label: "Less: Prepayment Penalty",
      amount: -payoff.prepayment_penalty,
    });
  }
  if (payoff.accrued_interest > 0) {
    proceeds.push({
      label: "Less: Accrued Interest",
      amount: -payoff.accrued_interest,
    });
  }
  if (cashInRequired > 0) {
    proceeds.push({ label: "Cash-In Required (Equity Contribution)", amount: -cashInRequired });
  } else {
    proceeds.push({ label: "Cash-Out to Equity", amount: cashOutToEquity });
  }

  // Step 6: Build new debt service schedule
  const schedule = buildSchedule(
    newLoanGross,
    input.new_loan_terms,
    input.rounding_policy,
  );

  // Step 7: Build journal hooks
  const journalHooks = buildJournalHooks({
    old_loan_balance: payoff.old_loan_balance,
    prepayment_penalty: payoff.prepayment_penalty,
    accrued_interest: payoff.accrued_interest,
    new_loan_amount: newLoanGross,
    closing_costs: closingCosts,
    cash_out_to_equity: cashOutToEquity,
    cash_in_required: cashInRequired,
    policy: input.accounting_policy_ref,
    rounding: input.rounding_policy,
  });

  // Step 8: Assemble flags
  const flags: RefinanceFlags = {
    dscr_binding: sizing.dscr_binding,
    ltv_binding: sizing.ltv_binding,
    negative_cash_out: negativeCashOut,
    invalid_inputs: [],
  };

  return {
    new_loan_amount_gross: newLoanGross,
    new_loan_amount_net: newLoanNet,
    payoff_total: payoff.total,
    payoff_breakdown: {
      old_loan_balance: payoff.old_loan_balance,
      prepayment_penalty: payoff.prepayment_penalty,
      accrued_interest: payoff.accrued_interest,
    },
    cash_out_to_equity: cashOutToEquity,
    cash_in_required: cashInRequired,
    proceeds_breakdown: proceeds,
    new_debt_service_schedule: schedule,
    journal_hooks: journalHooks,
    flags,
  };
}

function buildErrorResult(errors: string[]): RefinanceOutput {
  return {
    new_loan_amount_gross: 0,
    new_loan_amount_net: 0,
    payoff_total: 0,
    payoff_breakdown: {
      old_loan_balance: 0,
      prepayment_penalty: 0,
      accrued_interest: 0,
    },
    cash_out_to_equity: 0,
    cash_in_required: 0,
    proceeds_breakdown: [],
    new_debt_service_schedule: [],
    journal_hooks: [],
    flags: {
      dscr_binding: false,
      ltv_binding: false,
      negative_cash_out: false,
      invalid_inputs: errors,
    },
  };
}
