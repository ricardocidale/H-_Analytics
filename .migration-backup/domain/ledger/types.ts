import type { JournalDelta, CashFlowBucket } from "../types/journal-delta.js";

/** A timestamped event carrying journal deltas for posting to the ledger. */
export interface StatementEvent {
  event_id: string;
  event_type: string; // "ACQUISITION" | "REFINANCE" | "FUNDING" | "DEBT_SERVICE" | "DEPRECIATION"
  date: string; // YYYY-MM-DD
  entity_id: string; // property ID or "opco"
  journal_deltas: JournalDelta[];
}

/** A posted entry in the general ledger (journal delta + period metadata). */
export interface PostedEntry {
  period: string; // YYYY-MM
  event_id: string;
  account: string;
  debit: number;
  credit: number;
  classification: string;
  cash_flow_bucket: CashFlowBucket | null;
  memo: string;
}

/** Trial balance line for a single account in a period. */
export interface TrialBalanceEntry {
  account: string;
  debit_total: number;
  credit_total: number;
  balance: number; // net balance respecting normal side
}

/** Account definition in the chart of accounts. */
export interface AccountDef {
  code: string;
  name: string;
  normal_side: "DEBIT" | "CREDIT";
  classification: string; // BS_ASSET, BS_DEFERRED, BS_LIABILITY, BS_EQUITY, IS_REVENUE, IS_EXPENSE
}
