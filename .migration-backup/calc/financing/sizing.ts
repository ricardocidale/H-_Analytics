import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";

export interface AcqSizingResult {
  loan_amount: number;
  ltv_binding: boolean;
  override_binding: boolean;
}

/**
 * Size acquisition loan: either purchase_price * ltv_max, or a fixed override.
 * Exactly one of ltv_max or loan_amount_override should be provided (validated upstream).
 */
export function computeAcqSizing(
  purchasePrice: number,
  ltv_max: number | undefined,
  loan_amount_override: number | undefined,
  rounding: RoundingPolicy,
): AcqSizingResult {
  if (loan_amount_override !== undefined) {
    return {
      loan_amount: roundTo(loan_amount_override, rounding),
      ltv_binding: false,
      override_binding: true,
    };
  }

  return {
    loan_amount: roundTo(purchasePrice * (ltv_max ?? 0), rounding),
    ltv_binding: true,
    override_binding: false,
  };
}
