/**
 * calc/financing/closing-costs.ts — Closing cost computation for loan origination.
 *
 * PURPOSE:
 * Computes the total closing costs incurred when originating a new loan (acquisition
 * or refinance). Closing costs have two components:
 *   1. Percentage-based fees (e.g., 2% of loan amount) — covers origination fees,
 *      title insurance, and lender legal costs.
 *   2. Fixed fees (e.g., $15,000) — covers appraisal, environmental reports (Phase I),
 *      survey, and other flat-fee items.
 *
 * HOW IT FITS THE SYSTEM:
 * Called by `computeFinancing()` and the refinance calculator. The resulting
 * `ClosingCostBreakdown` affects equity required (closing costs increase the
 * equity check size) and may be capitalized on the balance sheet under ASC 310-20
 * (loan origination costs are deferred and amortized over the loan term).
 *
 * GAAP NOTE (ASC 310-20):
 * Loan origination costs paid by the borrower are netted against the loan balance
 * on the balance sheet (presented as a reduction of the liability) and amortized
 * to interest expense over the loan term using the effective interest method.
 * The `accounting_policy_ref` in the parent financing input controls whether
 * costs are deferred or expensed.
 */
import type { ClosingCostBreakdown } from "./types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";

export function computeClosingCosts(
  loanAmount: number,
  closingCostPct: number,
  fixedFees: number,
  rounding: RoundingPolicy,
): ClosingCostBreakdown {
  const pctBased = roundTo(loanAmount * closingCostPct, rounding);
  const fixed = roundTo(fixedFees, rounding);
  return {
    pct_based: pctBased,
    fixed_fees: fixed,
    total: roundTo(pctBased + fixed, rounding),
  };
}
