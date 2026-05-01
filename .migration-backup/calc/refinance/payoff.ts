import type { PrepaymentPenalty } from "./types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";

export interface PayoffResult {
  old_loan_balance: number;
  prepayment_penalty: number;
  accrued_interest: number;
  total: number;
}

export function computePayoff(
  currentBalance: number,
  penalty: PrepaymentPenalty,
  accruedInterest: number,
  rounding: RoundingPolicy,
): PayoffResult {
  let penaltyAmount = 0;
  switch (penalty.type) {
    case "pct_of_balance":
      penaltyAmount = roundTo(currentBalance * penalty.value, rounding);
      break;
    case "fixed":
      penaltyAmount = roundTo(penalty.value, rounding);
      break;
    case "none":
    default:
      penaltyAmount = 0;
  }

  const total = roundTo(
    currentBalance + penaltyAmount + accruedInterest,
    rounding,
  );

  return {
    old_loan_balance: roundTo(currentBalance, rounding),
    prepayment_penalty: penaltyAmount,
    accrued_interest: roundTo(accruedInterest, rounding),
    total,
  };
}
