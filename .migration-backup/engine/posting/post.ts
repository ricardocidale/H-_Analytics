import type { StatementEvent, PostedEntry } from "../../domain/ledger/types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";

export interface PostingResult {
  entries: PostedEntry[];
  unbalanced_events: string[];
}

/** Extract YYYY-MM period from a YYYY-MM-DD date string. */
function toPeriod(date: string): string {
  return date.slice(0, 7);
}

/**
 * Validate and post StatementEvents to produce PostedEntry[].
 * Enforces double-entry: Σ(debit) = Σ(credit) per event.
 * Unbalanced events are skipped and recorded in unbalanced_events.
 */
export function postEvents(
  events: StatementEvent[],
  rounding: RoundingPolicy,
): PostingResult {
  const entries: PostedEntry[] = [];
  const unbalanced_events: string[] = [];
  const r = (v: number) => roundTo(v, rounding);

  for (const event of events) {
    const totalDebit = event.journal_deltas.reduce(
      (sum, d) => sum + r(d.debit),
      0,
    );
    const totalCredit = event.journal_deltas.reduce(
      (sum, d) => sum + r(d.credit),
      0,
    );

    // Allow tiny floating-point variance (< 0.01)
    if (Math.abs(r(totalDebit) - r(totalCredit)) >= 0.01) {
      unbalanced_events.push(event.event_id);
      continue;
    }

    const period = toPeriod(event.date);
    for (const delta of event.journal_deltas) {
      entries.push({
        period,
        event_id: event.event_id,
        account: delta.account,
        debit: r(delta.debit),
        credit: r(delta.credit),
        classification: delta.classification,
        cash_flow_bucket: delta.cash_flow_bucket,
        memo: delta.memo,
      });
    }
  }

  return { entries, unbalanced_events };
}
