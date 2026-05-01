export type CashFlowBucket = "OPERATING" | "INVESTING" | "FINANCING";

export interface JournalDelta {
  account: string;
  debit: number;
  credit: number;
  classification: string;
  cash_flow_bucket: CashFlowBucket | null;
  memo: string;
}
