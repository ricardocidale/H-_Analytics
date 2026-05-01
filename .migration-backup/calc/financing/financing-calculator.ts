/**
 * calc/financing/financing-calculator.ts — Main entry point for the Acquisition Financing Calculator.
 *
 * PURPOSE:
 * Orchestrates the full acquisition financing workflow: validates inputs, sizes the
 * loan (via LTV or override), computes closing costs, calculates equity required,
 * builds the monthly debt service schedule, and generates GAAP-compliant journal
 * entries for loan origination. This is "Skill 1" in the calculation engine's
 * skill taxonomy.
 *
 * PIPELINE (7 steps):
 *   1. Validate — Reject impossible inputs (negative rates, zero purchase price, etc.)
 *   2. Size the loan — Apply LTV cap or use the explicit override amount
 *   3. Closing costs — Percentage-based + fixed fees
 *   4. Net loan proceeds — Gross loan minus closing costs
 *   5. Equity required — purchase_price + closing_costs + reserves − net_proceeds
 *   6. Build schedule — Monthly amortization table (interest, principal, balance)
 *   7. Journal hooks — Double-entry entries for the balance sheet at origination
 *
 * GAAP INVARIANTS ENFORCED:
 * - Closing costs are deferred (capitalized) per ASC 310-20, not immediately expensed.
 * - Only interest expense hits the Income Statement; principal payments reduce the
 *   loan liability on the Balance Sheet and appear in Financing Cash Flow (ASC 470).
 * - Equity contributions flow through equity accounts, never the Income Statement.
 * - The amortization schedule is self-consistent: ending_balance = beginning_balance − principal.
 *
 * HOW IT FITS THE SYSTEM:
 * The financial engine calls `computeFinancing()` once per property at the acquisition
 * date. The returned schedule populates monthly debt service rows, and the journal
 * hooks ensure the balance sheet is initialized correctly on day one.
 */
import { validateFinancingInput } from "./validate.js";
import { computeAcqSizing } from "./sizing.js";
import { computeClosingCosts } from "./closing-costs.js";
import { buildAcqJournalHooks } from "./journal-hooks.js";
import { buildSchedule } from "../shared/schedule.js";
import type { NewLoanTerms } from "../shared/types.js";
import type { FinancingInput, FinancingOutput, FinancingFlags } from "./types.js";
import { roundTo } from "../../domain/types/rounding.js";

/**
 * Main entry point for the Financing Calculator (Skill 1).
 *
 * Computes acquisition loan sizing, closing costs, equity required,
 * debt service schedule, and journal hooks.
 *
 * GAAP invariants enforced:
 * - Closing costs deferred by default (not expensed immediately)
 * - Only interest hits IS; principal hits BS/CF (ASC 470)
 * - Equity contributions flow through equity accounts, never IS
 * - Schedule reconciles: ending_balance = beginning_balance - principal
 */
export function computeFinancing(input: FinancingInput): FinancingOutput {
  const r = (v: number) => roundTo(v, input.rounding_policy);

  // Step 1: Validate inputs
  const validationErrors = validateFinancingInput(input);
  if (validationErrors.length > 0) {
    return buildErrorResult(validationErrors);
  }

  // Step 2: Size the loan (LTV or override)
  const sizing = computeAcqSizing(
    input.purchase_price,
    input.ltv_max,
    input.loan_amount_override,
    input.rounding_policy,
  );

  const loanAmountGross = sizing.loan_amount;

  // Step 3: Compute closing costs
  const closingCosts = computeClosingCosts(
    loanAmountGross,
    input.closing_cost_pct,
    input.fixed_fees ?? 0,
    input.rounding_policy,
  );

  const loanAmountNet = r(loanAmountGross - closingCosts.total);
  const reserves = r(input.upfront_reserves ?? 0);

  // Step 4: Compute equity required
  // Equity = purchase price + closing costs + reserves - gross loan amount
  // (closing costs are funded from the loan, so net proceeds = gross - closing;
  //  using gross here avoids double-counting closing costs)
  const equityRequired = r(
    input.purchase_price + closingCosts.total + reserves - loanAmountGross,
  );

  // Step 5: Derive loan terms and build schedule
  const ioMonths =
    input.loan_type === "IO_then_amortizing"
      ? input.term_months - input.amortization_months
      : 0;

  const terms: NewLoanTerms = {
    rate_annual: input.interest_rate_annual,
    term_months: input.term_months,
    amortization_months: input.amortization_months,
    io_months: ioMonths,
  };

  const schedule = buildSchedule(loanAmountGross, terms, input.rounding_policy);

  // Step 6: Build journal hooks
  const journalHooks = buildAcqJournalHooks({
    loan_amount: loanAmountGross,
    closing_costs: closingCosts.total,
    equity_required: equityRequired,
    upfront_reserves: reserves,
    purchase_price: input.purchase_price,
    policy: input.accounting_policy_ref,
    rounding: input.rounding_policy,
  });

  // Step 7: Assemble flags
  const flags: FinancingFlags = {
    ltv_binding: sizing.ltv_binding,
    override_binding: sizing.override_binding,
    invalid_inputs: [],
  };

  return {
    loan_amount_gross: loanAmountGross,
    loan_amount_net: loanAmountNet,
    closing_costs: closingCosts,
    equity_required: equityRequired,
    initial_cash_in: loanAmountNet,
    upfront_reserves: reserves,
    debt_service_schedule: schedule,
    journal_hooks: journalHooks,
    flags,
  };
}

function buildErrorResult(errors: string[]): FinancingOutput {
  return {
    loan_amount_gross: 0,
    loan_amount_net: 0,
    closing_costs: { pct_based: 0, fixed_fees: 0, total: 0 },
    equity_required: 0,
    initial_cash_in: 0,
    upfront_reserves: 0,
    debt_service_schedule: [],
    journal_hooks: [],
    flags: {
      ltv_binding: false,
      override_binding: false,
      invalid_inputs: errors,
    },
  };
}
