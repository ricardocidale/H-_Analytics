import type { JournalDelta } from "../../domain/types/journal-delta.js";
import type { AccountingPolicy } from "../../domain/types/accounting-policy.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";

export interface AcqJournalHookInputs {
  loan_amount: number;
  closing_costs: number;
  equity_required: number;
  upfront_reserves: number;
  purchase_price: number;
  policy: AccountingPolicy;
  rounding: RoundingPolicy;
}

/**
 * Build structured journal deltas describing the BS/CF impact of an acquisition financing event.
 * These are descriptive hooks for Skill 4 (Statements.EventApplier) — NOT direct postings.
 */
export function buildAcqJournalHooks(inputs: AcqJournalHookInputs): JournalDelta[] {
  const r = (v: number) => roundTo(v, inputs.rounding);
  const deltas: JournalDelta[] = [];
  const costBucket = inputs.policy.cash_flow_classification.debt_issuance_costs;

  // 1. Record property asset (investing activity)
  deltas.push({
    account: "PROPERTY",
    debit: r(inputs.purchase_price),
    credit: 0,
    classification: "BS_ASSET",
    cash_flow_bucket: "INVESTING",
    memo: "Acquisition of property asset",
  });

  // 2. Record new debt (financing inflow)
  if (inputs.loan_amount > 0) {
    deltas.push({
      account: "DEBT_ACQUISITION",
      debit: 0,
      credit: r(inputs.loan_amount),
      classification: "BS_LIABILITY",
      cash_flow_bucket: "FINANCING",
      memo: "Acquisition loan proceeds",
    });
  }

  // 3. Closing costs (deferred by default per accounting policy)
  if (inputs.closing_costs > 0) {
    deltas.push({
      account: "CLOSING_COSTS",
      debit: r(inputs.closing_costs),
      credit: 0,
      classification:
        costBucket === "FINANCING" ? "BS_DEFERRED" : "IS_EXPENSE",
      cash_flow_bucket: costBucket,
      memo: "Acquisition loan closing costs",
    });
  }

  // 4. Equity contribution (financing, never IS)
  if (inputs.equity_required > 0) {
    deltas.push({
      account: "EQUITY_CONTRIBUTED",
      debit: 0,
      credit: r(inputs.equity_required),
      classification: "BS_EQUITY",
      cash_flow_bucket: "FINANCING",
      memo: "Equity contribution for acquisition",
    });
  }

  // 5. Upfront reserves (asset, funded from equity/debt proceeds)
  if (inputs.upfront_reserves > 0) {
    deltas.push({
      account: "RESERVES",
      debit: r(inputs.upfront_reserves),
      credit: 0,
      classification: "BS_ASSET",
      cash_flow_bucket: "INVESTING",
      memo: "Upfront reserves funded at closing",
    });
  }

  return deltas;
}
