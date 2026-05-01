import type { PostedEntry } from "../domain/ledger/types.js";
import type { RoundingPolicy } from "../domain/types/rounding.js";
import { roundTo } from "../domain/types/rounding.js";
import type {
  PeriodBalanceSheet,
  PeriodCashFlow,
  PeriodIncomeStatement,
  ReconciliationCheck,
  ReconciliationResult,
} from "./types.js";
import { computeCashDelta } from "./cash-flow.js";

const TOLERANCE = 0.01;

function check(
  name: string,
  period: string,
  expected: number,
  actual: number,
  gaap_ref: string,
): ReconciliationCheck {
  const variance = Math.abs(expected - actual);
  return {
    check: name,
    period,
    passed: variance < TOLERANCE,
    expected,
    actual,
    variance,
    gaap_ref,
  };
}

/**
 * Run reconciliation checks across all periods.
 *
 * 1. BS Balance: Assets = Liabilities + Equity every period (FASB)
 * 2. CF Tie-out: Net CF = ΔCASH every period (ASC 230)
 * 3. IS→RE: Cumulative Net Income = change in Retained Earnings equity line (FASB)
 */
export function reconcile(
  entries: PostedEntry[],
  incomeStatements: PeriodIncomeStatement[],
  balanceSheets: PeriodBalanceSheet[],
  cashFlows: PeriodCashFlow[],
  rounding: RoundingPolicy,
): ReconciliationResult {
  const r = (v: number) => roundTo(v, rounding);
  const checks: ReconciliationCheck[] = [];

  // 1. BS Balance: A = L + E
  for (const bs of balanceSheets) {
    checks.push(
      check(
        "BS_BALANCE",
        bs.period,
        r(bs.total_assets),
        r(bs.total_liabilities + bs.total_equity),
        "FASB",
      ),
    );
  }

  // 2. CF Tie-out: Net CF = ΔCASH
  for (const cf of cashFlows) {
    const cashDelta = computeCashDelta(entries, cf.period, rounding);
    checks.push(
      check(
        "CF_TIEOUT",
        cf.period,
        r(cf.net_cash_change),
        r(cashDelta),
        "ASC 230",
      ),
    );
  }

  // 3. IS→RE: Cumulative net income = retained earnings balance
  let cumulativeNetIncome = 0;
  for (const is of incomeStatements) {
    cumulativeNetIncome = r(cumulativeNetIncome + is.net_income);
    const bs = balanceSheets.find((b) => b.period === is.period);
    if (bs) {
      const reLine = bs.equity.find((e) => e.account === "RETAINED_EARNINGS");
      const reBalance = reLine?.balance ?? 0;
      checks.push(
        check(
          "IS_TO_RE",
          is.period,
          r(cumulativeNetIncome),
          r(reBalance),
          "FASB",
        ),
      );
    }
  }

  return {
    checks,
    all_passed: checks.every((c) => c.passed),
  };
}
