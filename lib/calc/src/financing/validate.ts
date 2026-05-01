import type { FinancingInput } from "./types.js";

export function validateFinancingInput(input: FinancingInput): string[] {
  const errors: string[] = [];

  if (input.purchase_price <= 0) {
    errors.push("purchase_price must be > 0");
  }

  // Exactly one of ltv_max or loan_amount_override must be provided
  const hasLtv = input.ltv_max !== undefined;
  const hasOverride = input.loan_amount_override !== undefined;

  if (!hasLtv && !hasOverride) {
    errors.push("Either ltv_max or loan_amount_override must be provided");
  }
  if (hasLtv && hasOverride) {
    errors.push("ltv_max and loan_amount_override are mutually exclusive");
  }

  if (hasLtv && (input.ltv_max! <= 0 || input.ltv_max! > 1)) {
    errors.push("ltv_max must be between 0 (exclusive) and 1 (inclusive)");
  }
  if (hasOverride && input.loan_amount_override! <= 0) {
    errors.push("loan_amount_override must be > 0");
  }

  if (input.closing_cost_pct < 0 || input.closing_cost_pct >= 1) {
    errors.push("closing_cost_pct must be between 0 and 1");
  }

  if (input.interest_rate_annual < 0) {
    errors.push("interest_rate_annual must be >= 0");
  }
  if (input.term_months <= 0) {
    errors.push("term_months must be > 0");
  }
  if (input.amortization_months <= 0) {
    errors.push("amortization_months must be > 0");
  }

  // IO_then_amortizing requires term > amortization to have an IO period
  if (input.loan_type === "IO_then_amortizing") {
    if (input.term_months <= input.amortization_months) {
      errors.push(
        "IO_then_amortizing requires term_months > amortization_months",
      );
    }
  }

  if (input.term_months < 1) {
    errors.push("term_months must be >= 1");
  }

  if (input.fixed_fees !== undefined && input.fixed_fees < 0) {
    errors.push("fixed_fees must be >= 0");
  }
  if (input.upfront_reserves !== undefined && input.upfront_reserves < 0) {
    errors.push("upfront_reserves must be >= 0");
  }

  return errors;
}
