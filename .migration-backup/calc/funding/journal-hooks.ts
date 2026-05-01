import type { JournalDelta } from "../../domain/types/journal-delta.js";
import type { FundingEvent } from "./types.js";

/**
 * Build journal hooks for all funding events.
 *
 * Each funding event produces a balanced pair:
 *   CASH            debit=amount   BS_ASSET    FINANCING
 *   EQUITY_CONTRIBUTED  credit=amount  BS_EQUITY   FINANCING
 *
 * GAAP invariant: Equity contributions never hit IS.
 */
export function buildFundingJournalHooks(
  events: FundingEvent[],
): JournalDelta[] {
  const deltas: JournalDelta[] = [];

  for (const event of events) {
    const entityLabel =
      event.target_entity.type === "OPCO"
        ? "OpCo"
        : event.target_entity.name;

    deltas.push({
      account: "CASH",
      debit: event.amount,
      credit: 0,
      classification: "BS_ASSET",
      cash_flow_bucket: "FINANCING",
      memo: `${event.label} — cash received by ${entityLabel}`,
    });

    deltas.push({
      account: "EQUITY_CONTRIBUTED",
      debit: 0,
      credit: event.amount,
      classification: "BS_EQUITY",
      cash_flow_bucket: "FINANCING",
      memo: `${event.label} — equity contribution to ${entityLabel}`,
    });
  }

  return deltas;
}
