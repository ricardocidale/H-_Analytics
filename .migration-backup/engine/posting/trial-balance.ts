import type { PostedEntry, TrialBalanceEntry } from "../../domain/ledger/types.js";
import { getAccount } from "../../domain/ledger/accounts.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";
import { dSum } from "@calc/shared/decimal.js";

function aggregateEntries(
  filteredEntries: PostedEntry[],
  rounding: RoundingPolicy,
): TrialBalanceEntry[] {
  const r = (v: number) => roundTo(v, rounding);

  const byAccount = new Map<string, { debits: number[]; credits: number[] }>();
  for (const entry of filteredEntries) {
    const existing = byAccount.get(entry.account) ?? { debits: [], credits: [] };
    if (entry.debit !== 0) existing.debits.push(entry.debit);
    if (entry.credit !== 0) existing.credits.push(entry.credit);
    byAccount.set(entry.account, existing);
  }

  const result: TrialBalanceEntry[] = [];
  for (const [account, parts] of Array.from(byAccount.entries())) {
    const debitTotal = dSum(parts.debits);
    const creditTotal = dSum(parts.credits);
    const acctDef = getAccount(account);
    const normalSide = acctDef?.normal_side ?? "DEBIT";
    const balance =
      normalSide === "DEBIT"
        ? r(debitTotal - creditTotal)
        : r(creditTotal - debitTotal);

    result.push({
      account,
      debit_total: r(debitTotal),
      credit_total: r(creditTotal),
      balance,
    });
  }

  result.sort((a, b) => a.account.localeCompare(b.account));
  return result;
}

/**
 * Build a trial balance for a specific period.
 * Groups posted entries by account and computes debit/credit totals.
 * Balance respects normal side: DEBIT normal → debit - credit, CREDIT normal → credit - debit.
 */
export function buildTrialBalance(
  entries: PostedEntry[],
  period: string,
  rounding: RoundingPolicy,
): TrialBalanceEntry[] {
  return aggregateEntries(
    entries.filter((e) => e.period === period),
    rounding,
  );
}

/**
 * Build cumulative trial balance from the start period through the target period.
 * Used for balance sheet (which is a point-in-time snapshot of cumulative activity).
 */
export function buildCumulativeTrialBalance(
  entries: PostedEntry[],
  throughPeriod: string,
  rounding: RoundingPolicy,
): TrialBalanceEntry[] {
  return aggregateEntries(
    entries.filter((e) => e.period <= throughPeriod),
    rounding,
  );
}
