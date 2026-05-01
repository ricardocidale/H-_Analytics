import type { RefinanceInput } from "./types.js";

export function validateRefinanceInput(input: RefinanceInput): string[] {
  const errors: string[] = [];

  if (input.current_loan_balance < 0) {
    errors.push("current_loan_balance must be >= 0");
  }
  if (input.ltv_max <= 0 || input.ltv_max > 1) {
    errors.push("ltv_max must be between 0 (exclusive) and 1 (inclusive)");
  }
  if (input.closing_cost_pct < 0 || input.closing_cost_pct >= 1) {
    errors.push("closing_cost_pct must be between 0 and 1");
  }

  // Valuation validation
  const v = input.valuation;
  if (v.method === "noi_cap") {
    if (v.stabilized_noi <= 0) errors.push("stabilized_noi must be > 0");
    if (v.cap_rate <= 0) errors.push("cap_rate must be > 0");
  } else if (v.method === "direct") {
    if (v.property_value_at_refi <= 0) {
      errors.push("property_value_at_refi must be > 0");
    }
  }

  // DSCR: if min provided, noi_for_dscr must also be provided
  if (input.dscr_min !== undefined && input.dscr_min > 0) {
    if (input.noi_for_dscr === undefined || input.noi_for_dscr <= 0) {
      errors.push("noi_for_dscr is required and must be > 0 when dscr_min is specified");
    }
  }

  // New loan terms
  const t = input.new_loan_terms;
  if (t.rate_annual < 0) errors.push("rate_annual must be >= 0");
  if (t.term_months <= 0) errors.push("term_months must be > 0");
  if (t.amortization_months <= 0) errors.push("amortization_months must be > 0");
  if (t.io_months < 0) errors.push("io_months must be >= 0");
  if (t.io_months >= t.term_months) {
    errors.push("io_months must be < term_months");
  }

  // Penalty validation
  if (
    input.prepayment_penalty.type === "pct_of_balance" &&
    input.prepayment_penalty.value < 0
  ) {
    errors.push("prepayment penalty pct must be >= 0");
  }
  if (
    input.prepayment_penalty.type === "fixed" &&
    input.prepayment_penalty.value < 0
  ) {
    errors.push("prepayment penalty fixed amount must be >= 0");
  }

  return errors;
}
