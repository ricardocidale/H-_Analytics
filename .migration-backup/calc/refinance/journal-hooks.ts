import type { JournalDelta } from "../../domain/types/journal-delta.js";
import type { AccountingPolicy } from "../../domain/types/accounting-policy.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";

export interface JournalHookInputs {
  old_loan_balance: number;
  prepayment_penalty: number;
  accrued_interest: number;
  new_loan_amount: number;
  closing_costs: number;
  cash_out_to_equity: number;
  cash_in_required?: number;
  policy: AccountingPolicy;
  rounding: RoundingPolicy;
}

/**
 * Build structured journal deltas describing the BS/CF impact of a refinance event.
 * These are descriptive hooks for Skill 4 (Statements.EventApplier) — NOT direct postings.
 */
export function buildJournalHooks(inputs: JournalHookInputs): JournalDelta[] {
  const r = (v: number) => roundTo(v, inputs.rounding);
  const deltas: JournalDelta[] = [];
  const costBucket = inputs.policy.cash_flow_classification.debt_issuance_costs;

  // 1. Retire old debt
  deltas.push({
    account: "DEBT_OLD",
    debit: r(inputs.old_loan_balance),
    credit: 0,
    classification: "BS_LIABILITY",
    cash_flow_bucket: "FINANCING",
    memo: "Payoff of existing loan principal",
  });

  // 2. Prepayment penalty (expense in period incurred by default)
  if (inputs.prepayment_penalty > 0) {
    deltas.push({
      account: "PREPAYMENT_PENALTY_EXPENSE",
      debit: r(inputs.prepayment_penalty),
      credit: 0,
      classification: "IS_EXPENSE",
      cash_flow_bucket: "FINANCING",
      memo: "Prepayment penalty on old loan",
    });
  }

  // 3. Accrued interest payoff
  if (inputs.accrued_interest > 0) {
    deltas.push({
      account: "ACCRUED_INTEREST_PAYABLE",
      debit: r(inputs.accrued_interest),
      credit: 0,
      classification: "BS_LIABILITY",
      cash_flow_bucket:
        inputs.policy.cash_flow_classification.interest_paid === "OPERATING"
          ? "OPERATING"
          : "FINANCING",
      memo: "Pay accrued interest on old loan to payoff date",
    });
  }

  // 4. Record new debt
  deltas.push({
    account: "DEBT_NEW",
    debit: 0,
    credit: r(inputs.new_loan_amount),
    classification: "BS_LIABILITY",
    cash_flow_bucket: "FINANCING",
    memo: "New refinance loan proceeds",
  });

  // 5. Closing costs
  if (inputs.closing_costs > 0) {
    deltas.push({
      account: "CLOSING_COSTS",
      debit: r(inputs.closing_costs),
      credit: 0,
      classification:
        costBucket === "FINANCING" ? "BS_DEFERRED" : "IS_EXPENSE",
      cash_flow_bucket: costBucket,
      memo: "Refinance closing costs",
    });
  }

  // 6. Cash-out to equity (financing cash flow, NOT income)
  if (inputs.cash_out_to_equity > 0) {
    deltas.push({
      account: "CASH",
      debit: r(inputs.cash_out_to_equity),
      credit: 0,
      classification: "BS_ASSET",
      cash_flow_bucket: "FINANCING",
      memo: "Cash-out to equity from refinance proceeds",
    });
  }

  // 7. Cash-in required (equity contribution when new loan < payoff)
  if (inputs.cash_in_required && inputs.cash_in_required > 0) {
    deltas.push({
      account: "CASH",
      debit: r(inputs.cash_in_required),
      credit: 0,
      classification: "BS_ASSET",
      cash_flow_bucket: "FINANCING",
      memo: "Cash-in required: equity contribution to complete refinance",
    });
    deltas.push({
      account: "EQUITY_CONTRIBUTED",
      debit: 0,
      credit: r(inputs.cash_in_required),
      classification: "BS_EQUITY",
      cash_flow_bucket: "FINANCING",
      memo: "Equity contribution for refinance shortfall",
    });
  }

  return deltas;
}
