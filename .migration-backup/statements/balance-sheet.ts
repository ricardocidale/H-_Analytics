import type { PostedEntry } from "../domain/ledger/types.js";
import { buildCumulativeTrialBalance } from "../engine/posting/trial-balance.js";
import { getAccount } from "../domain/ledger/accounts.js";
import type { RoundingPolicy } from "../domain/types/rounding.js";
import { roundTo } from "../domain/types/rounding.js";
import type { PeriodBalanceSheet } from "./types.js";

/**
 * Extract balance sheet from cumulative posted entries through a given period.
 * BS is a point-in-time snapshot of cumulative activity.
 *
 * Assets = BS_ASSET + BS_DEFERRED (debit normal)
 * Liabilities = BS_LIABILITY (credit normal)
 * Equity = BS_EQUITY (credit normal)
 *
 * Retained Earnings receives cumulative net income (IS accounts roll into equity).
 * Verify: Assets = Liabilities + Equity.
 */
export function extractBalanceSheet(
  entries: PostedEntry[],
  period: string,
  cumulativeNetIncome: number,
  rounding: RoundingPolicy,
): PeriodBalanceSheet {
  const r = (v: number) => roundTo(v, rounding);
  const tb = buildCumulativeTrialBalance(entries, period, rounding);

  const assets: { account: string; balance: number }[] = [];
  const liabilities: { account: string; balance: number }[] = [];
  const equity: { account: string; balance: number }[] = [];

  for (const entry of tb) {
    const acctDef = getAccount(entry.account);
    if (!acctDef) continue;

    const cls = acctDef.classification;
    if (cls === "BS_ASSET" || cls === "BS_DEFERRED") {
      assets.push({ account: entry.account, balance: r(entry.balance) });
    } else if (cls === "BS_LIABILITY") {
      liabilities.push({ account: entry.account, balance: r(entry.balance) });
    } else if (cls === "BS_EQUITY") {
      if (entry.account === "RETAINED_EARNINGS") {
        // Retained earnings account balance + cumulative net income
        equity.push({
          account: entry.account,
          balance: r(entry.balance + cumulativeNetIncome),
        });
      } else {
        equity.push({ account: entry.account, balance: r(entry.balance) });
      }
    }
    // IS accounts are NOT on the balance sheet
  }

  // If there's no explicit RETAINED_EARNINGS in the TB but we have net income,
  // add it as a derived equity line
  if (
    cumulativeNetIncome !== 0 &&
    !equity.some((e) => e.account === "RETAINED_EARNINGS")
  ) {
    equity.push({
      account: "RETAINED_EARNINGS",
      balance: r(cumulativeNetIncome),
    });
  }

  const total_assets = r(assets.reduce((sum, a) => sum + a.balance, 0));
  const total_liabilities = r(
    liabilities.reduce((sum, a) => sum + a.balance, 0),
  );
  const total_equity = r(equity.reduce((sum, a) => sum + a.balance, 0));

  const balanced = Math.abs(total_assets - (total_liabilities + total_equity)) < 0.01;

  return {
    period,
    assets,
    liabilities,
    equity,
    total_assets,
    total_liabilities,
    total_equity,
    balanced,
  };
}
