import type {
  FundingTranche,
  FundingEvent,
  PropertyFundingRequirement,
} from "./types.js";

/**
 * Resolve a tranche trigger to a concrete date string (YYYY-MM-DD).
 * - "scheduled": use the explicit date
 * - "on_acquisition": resolve from property requirements
 * - "conditional": use fallback_date (conditions are evaluated externally)
 */
function resolveDate(
  tranche: FundingTranche,
  propertyMap: Map<string, PropertyFundingRequirement>,
): string | null {
  const trigger = tranche.trigger;

  if (trigger.type === "scheduled") {
    return trigger.date;
  }

  if (trigger.type === "on_acquisition") {
    const prop = propertyMap.get(trigger.property_id);
    return prop ? prop.acquisition_date : null;
  }

  // conditional: use fallback_date
  return trigger.fallback_date;
}

/**
 * Build a chronologically-sorted funding timeline by resolving all
 * tranche triggers to concrete dates.
 *
 * Returns { events, warnings } — warnings for unresolvable tranches.
 */
export function buildFundingTimeline(
  tranches: FundingTranche[],
  propertyRequirements: PropertyFundingRequirement[],
): { events: FundingEvent[]; warnings: string[] } {
  const propertyMap = new Map(
    propertyRequirements.map((p) => [p.property_id, p]),
  );

  const events: FundingEvent[] = [];
  const warnings: string[] = [];

  for (const tranche of tranches) {
    const date = resolveDate(tranche, propertyMap);

    if (!date) {
      warnings.push(
        `Tranche "${tranche.label}" (${tranche.tranche_id}): ` +
          `could not resolve trigger to a date — skipped`,
      );
      continue;
    }

    events.push({
      date,
      tranche_id: tranche.tranche_id,
      label: tranche.label,
      amount: tranche.amount,
      target_entity: tranche.target_entity,
      source: tranche.source,
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  return { events, warnings };
}
