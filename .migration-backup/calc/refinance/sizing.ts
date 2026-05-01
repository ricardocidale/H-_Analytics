import { pmt } from "../shared/pmt.js";
import type { NewLoanTerms } from "../shared/types.js";
import type { PropertyValuation } from "./types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";
import { MONTHS_PER_YEAR } from "../../shared/constants.js";
import { dPow } from "../shared/decimal.js";

export interface SizingResult {
  property_value: number;
  max_loan_ltv: number;
  max_loan_dscr: number | null;
  final_loan_amount: number;
  dscr_binding: boolean;
  ltv_binding: boolean;
}

export function resolvePropertyValue(valuation: PropertyValuation): number {
  if (valuation.method === "direct") {
    return valuation.property_value_at_refi;
  }
  if (valuation.cap_rate === 0) return 0;
  return valuation.stabilized_noi / valuation.cap_rate;
}

/**
 * Size the new refinance loan subject to LTV and optional DSCR constraints.
 *
 * DSCR constraint uses amortizing-period debt service (worst case):
 *   annual_ds = 12 * PMT(L, r, amort_months)
 *   PMT is linear in L, so: annual_ds = 12 * L * k
 *   where k = r*(1+r)^n / ((1+r)^n - 1)
 *
 *   DSCR = NOI / annual_ds >= dscr_min
 *   => L <= NOI / (12 * k * dscr_min)
 */
export function computeSizing(
  valuation: PropertyValuation,
  ltv_max: number,
  terms: NewLoanTerms,
  dscr_min: number | undefined,
  noi_for_dscr: number | undefined,
  rounding: RoundingPolicy,
): SizingResult {
  const property_value = resolvePropertyValue(valuation);
  const max_loan_ltv = roundTo(property_value * ltv_max, rounding);

  let max_loan_dscr: number | null = null;

  if (
    dscr_min !== undefined &&
    dscr_min > 0 &&
    noi_for_dscr !== undefined &&
    noi_for_dscr > 0
  ) {
    const monthlyRate = terms.rate_annual / MONTHS_PER_YEAR;
    const amortPayments = terms.amortization_months;

    if (monthlyRate === 0) {
      // Zero rate: annual_ds = MONTHS_PER_YEAR * L / amort_months
      // L <= noi * amort_months / (MONTHS_PER_YEAR * dscr_min)
      max_loan_dscr = roundTo(
        (noi_for_dscr * amortPayments) / (MONTHS_PER_YEAR * dscr_min),
        rounding,
      );
    } else {
      const factor = dPow(1 + monthlyRate, amortPayments);
      const k = (monthlyRate * factor) / (factor - 1);
      max_loan_dscr = roundTo(
        noi_for_dscr / (12 * k * dscr_min),
        rounding,
      );
    }
  }

  let final_loan_amount: number;
  let dscr_binding = false;
  let ltv_binding = false;

  if (max_loan_dscr !== null) {
    if (max_loan_dscr < max_loan_ltv) {
      final_loan_amount = max_loan_dscr;
      dscr_binding = true;
    } else {
      final_loan_amount = max_loan_ltv;
      ltv_binding = true;
    }
  } else {
    final_loan_amount = max_loan_ltv;
    ltv_binding = true;
  }

  return {
    property_value: roundTo(property_value, rounding),
    max_loan_ltv,
    max_loan_dscr,
    final_loan_amount,
    dscr_binding,
    ltv_binding,
  };
}
