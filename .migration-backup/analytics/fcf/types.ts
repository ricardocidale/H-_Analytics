import type { PostedEntry } from "../../domain/ledger/types.js";
import type {
  PeriodIncomeStatement,
  PeriodCashFlow,
} from "../../statements/types.js";

/** Free cash flow breakdown for a single period. */
export interface FCFEntry {
  period: string;
  entity_id: string;
  net_income: number;
  depreciation: number;
  other_non_cash: number;
  working_capital_change: number;
  capex: number;
  fcff: number;
  interest_expense: number;
  net_borrowing: number;
  fcfe: number;
}

/** FCF timeline for a single entity. */
export interface FCFTimeline {
  entity_id: string;
  entries: FCFEntry[];
  total_fcff: number;
  total_fcfe: number;
}

/** Input for FCF computation. */
export interface FCFInput {
  income_statements: PeriodIncomeStatement[];
  cash_flows: PeriodCashFlow[];
  posted_entries: PostedEntry[];
  entity_filter?: string;
  working_capital_changes?: Record<string, number>;
}

/** Complete FCF output. */
export interface FCFOutput {
  timelines: FCFTimeline[];
  consolidated: FCFTimeline;
  reconciliation: {
    fcfe_ties_to_cf: boolean;
    periods_checked: number;
  };
}
