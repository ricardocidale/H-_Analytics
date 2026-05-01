import type { AccountDef } from "./types.js";

/**
 * Canonical chart of accounts used by Skills 1-3 journal hooks.
 * Every account code referenced in JournalDelta outputs must appear here.
 */
export const CHART_OF_ACCOUNTS: readonly AccountDef[] = [
  // --- BS_ASSET ---
  { code: "CASH", name: "Cash & Equivalents", normal_side: "DEBIT", classification: "BS_ASSET" },
  { code: "PROPERTY", name: "Property Asset", normal_side: "DEBIT", classification: "BS_ASSET" },
  { code: "RESERVES", name: "Upfront Reserves", normal_side: "DEBIT", classification: "BS_ASSET" },
  { code: "CLOSING_COSTS", name: "Deferred Closing Costs", normal_side: "DEBIT", classification: "BS_DEFERRED" },

  // --- BS_LIABILITY ---
  { code: "DEBT_ACQUISITION", name: "Acquisition Loan", normal_side: "CREDIT", classification: "BS_LIABILITY" },
  { code: "DEBT_NEW", name: "Refinance Loan", normal_side: "CREDIT", classification: "BS_LIABILITY" },
  { code: "DEBT_OLD", name: "Old Loan (retired)", normal_side: "CREDIT", classification: "BS_LIABILITY" },
  { code: "ACCRUED_INTEREST_PAYABLE", name: "Accrued Interest", normal_side: "CREDIT", classification: "BS_LIABILITY" },

  // --- BS_EQUITY ---
  { code: "EQUITY_CONTRIBUTED", name: "Contributed Equity", normal_side: "CREDIT", classification: "BS_EQUITY" },
  { code: "RETAINED_EARNINGS", name: "Retained Earnings", normal_side: "CREDIT", classification: "BS_EQUITY" },

  // --- IS_EXPENSE ---
  { code: "INTEREST_EXPENSE", name: "Interest Expense", normal_side: "DEBIT", classification: "IS_EXPENSE" },
  { code: "DEPRECIATION_EXPENSE", name: "Depreciation", normal_side: "DEBIT", classification: "IS_EXPENSE" },
  { code: "PREPAYMENT_PENALTY_EXPENSE", name: "Prepayment Penalty", normal_side: "DEBIT", classification: "IS_EXPENSE" },
] as const;

/** Lookup map: account code → AccountDef. */
export const ACCOUNT_MAP: ReadonlyMap<string, AccountDef> = new Map(
  CHART_OF_ACCOUNTS.map((a) => [a.code, a]),
);

/** Get the AccountDef for a code, or undefined if unknown. */
export function getAccount(code: string): AccountDef | undefined {
  return ACCOUNT_MAP.get(code);
}
