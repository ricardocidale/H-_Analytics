import type { PostedEntry } from "../domain/ledger/types.js";
import type { RoundingPolicy } from "../domain/types/rounding.js";
import { roundTo } from "../domain/types/rounding.js";
import { getAccount } from "../domain/ledger/accounts.js";
import type { PeriodCashFlow } from "./types.js";

/**
 * Extract cash flow statement for a single period.
 * Groups entries by cash_flow_bucket: OPERATING, INVESTING, FINANCING.
 * Net Cash Change = Operating + Investing + Financing.
 *
 * Cash impact is computed from the cash account's perspective:
 *   - Debit to cash account = cash inflow (positive)
 *   - Credit to cash account = cash outflow (negative)
 *
 * For non-cash accounts, the cash impact of a bucket is derived from
 * the net debit/credit pattern:
 *   - For DEBIT-normal accounts: debits are uses of cash (negative), credits are sources
 *   - For CREDIT-normal accounts: credits are sources of cash (positive when issuing debt),
 *     debits are uses (positive when retiring debt)
 *
 * Simplified: we compute cash flow from CASH account entries only,
 * since every balanced journal entry affecting cash has a CASH line.
 */
export function extractCashFlow(
  entries: PostedEntry[],
  period: string,
  rounding: RoundingPolicy,
): PeriodCashFlow {
  const r = (v: number) => roundTo(v, rounding);

  const periodEntries = entries.filter((e) => e.period === period);

  let operating = 0;
  let investing = 0;
  let financing = 0;

  for (const entry of periodEntries) {
    // Only look at CASH entries — they directly tell us the cash impact
    if (entry.account === "CASH") {
      const cashImpact = entry.debit - entry.credit; // debit=inflow, credit=outflow
      switch (entry.cash_flow_bucket) {
        case "OPERATING":
          operating += cashImpact;
          break;
        case "INVESTING":
          investing += cashImpact;
          break;
        case "FINANCING":
          financing += cashImpact;
          break;
      }
    }
  }

  operating = r(operating);
  investing = r(investing);
  financing = r(financing);
  const net_cash_change = r(operating + investing + financing);

  return { period, operating, investing, financing, net_cash_change };
}

/**
 * Compute total cash change for a period from CASH account entries only.
 * Used for CF tie-out verification.
 */
export function computeCashDelta(
  entries: PostedEntry[],
  period: string,
  rounding: RoundingPolicy,
): number {
  const r = (v: number) => roundTo(v, rounding);

  const cashEntries = entries.filter(
    (e) => e.period === period && e.account === "CASH",
  );
  const delta = cashEntries.reduce(
    (sum, e) => sum + e.debit - e.credit,
    0,
  );
  return r(delta);
}
