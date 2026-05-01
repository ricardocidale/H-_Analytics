import type { FundingEvent, EquityRollForwardEntry } from "./types.js";
import { roundTo } from "../../domain/types/rounding.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

/**
 * Extract YYYY-MM from a YYYY-MM-DD date string.
 */
function toPeriod(date: string): string {
  return date.slice(0, 7);
}

/**
 * Generate an array of YYYY-MM periods from startDate through endDate (inclusive).
 */
function generatePeriods(startDate: string, endDate: string): string[] {
  const periods: string[] = [];
  const [startY, startM] = startDate.slice(0, 7).split("-").map(Number);
  const [endY, endM] = endDate.slice(0, 7).split("-").map(Number);

  let y = startY;
  let m = startM;

  while (y < endY || (y === endY && m <= endM)) {
    periods.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  return periods;
}

/**
 * Build a period-by-period equity roll-forward for each entity
 * from model_start through the last funding event.
 *
 * Distributions are 0 in Skill 3 (modeled in Skills 5/6).
 */
export function buildEquityRollForward(
  events: FundingEvent[],
  modelStartDate: string,
  rounding: RoundingPolicy,
): EquityRollForwardEntry[] {
  if (events.length === 0) return [];

  // Determine date range
  const lastEventDate = events[events.length - 1].date; // events are sorted
  const periods = generatePeriods(modelStartDate, lastEventDate);

  // Collect unique entity IDs
  const entityIds = Array.from(
    new Set(events.map((e) => e.target_entity.id)),
  );

  // Group contributions by entity_id → period → total amount
  const contributionMap = new Map<string, Map<string, number>>();
  for (const event of events) {
    const eid = event.target_entity.id;
    if (!contributionMap.has(eid)) {
      contributionMap.set(eid, new Map());
    }
    const periodMap = contributionMap.get(eid)!;
    const period = toPeriod(event.date);
    periodMap.set(period, (periodMap.get(period) ?? 0) + event.amount);
  }

  // Build roll-forward per entity per period
  const entries: EquityRollForwardEntry[] = [];

  for (const entityId of entityIds) {
    const periodMap = contributionMap.get(entityId) ?? new Map<string, number>();
    let balance = 0;

    for (const period of periods) {
      const contributions = roundTo(periodMap.get(period) ?? 0, rounding);
      const beginningBalance = roundTo(balance, rounding);
      const endingBalance = roundTo(beginningBalance + contributions, rounding);

      entries.push({
        period,
        entity_id: entityId,
        beginning_balance: beginningBalance,
        contributions,
        distributions: 0,
        ending_balance: endingBalance,
      });

      balance = endingBalance;
    }
  }

  return entries;
}
