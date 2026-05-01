import type { StatementEvent } from "../domain/ledger/types.js";
import type { RoundingPolicy } from "../domain/types/rounding.js";
import { postEvents } from "../engine/posting/post.js";
import { buildTrialBalance } from "../engine/posting/trial-balance.js";
import { extractIncomeStatement } from "./income-statement.js";
import { extractBalanceSheet } from "./balance-sheet.js";
import { extractCashFlow } from "./cash-flow.js";
import { reconcile } from "./reconcile.js";
import type { StatementApplierOutput, PeriodIncomeStatement } from "./types.js";
import type { TrialBalanceEntry } from "../domain/ledger/types.js";
import { roundTo } from "../domain/types/rounding.js";

/**
 * Main orchestrator: apply statement events to produce financial statements.
 *
 * 1. Post all events → PostedEntry[] + validation flags
 * 2. Determine all periods spanned
 * 3. For each period: trial balance → IS, BS, CF
 * 4. Run reconciliation checks
 * 5. Assemble output
 */
export function applyEvents(
  events: StatementEvent[],
  rounding: RoundingPolicy,
): StatementApplierOutput {
  const r = (v: number) => roundTo(v, rounding);

  // 1. Post events
  const { entries, unbalanced_events } = postEvents(events, rounding);

  // 2. Determine all periods
  const periodSet = new Set<string>();
  for (const entry of entries) {
    periodSet.add(entry.period);
  }
  const periods = Array.from(periodSet).sort();

  // 3. Build statements per period
  const trial_balances = new Map<string, TrialBalanceEntry[]>();
  const income_statements: PeriodIncomeStatement[] = [];
  const balance_sheets = [];
  const cash_flows = [];

  let cumulativeNetIncome = 0;

  for (const period of periods) {
    // Trial balance for this period only (IS accounts)
    const tb = buildTrialBalance(entries, period, rounding);
    trial_balances.set(period, tb);

    // Income statement for this period
    const is = extractIncomeStatement(tb, period, rounding);
    income_statements.push(is);
    cumulativeNetIncome = r(cumulativeNetIncome + is.net_income);

    // Balance sheet (cumulative through this period, including retained earnings)
    const bs = extractBalanceSheet(entries, period, cumulativeNetIncome, rounding);
    balance_sheets.push(bs);

    // Cash flow for this period
    const cf = extractCashFlow(entries, period, rounding);
    cash_flows.push(cf);
  }

  // 4. Reconciliation
  const reconciliation = reconcile(
    entries,
    income_statements,
    balance_sheets,
    cash_flows,
    rounding,
  );

  // 5. Assemble output
  return {
    posted_entries: entries,
    periods,
    trial_balances,
    income_statements,
    balance_sheets,
    cash_flows,
    reconciliation,
    flags: {
      unbalanced_events,
      has_posting_errors: unbalanced_events.length > 0,
    },
  };
}
