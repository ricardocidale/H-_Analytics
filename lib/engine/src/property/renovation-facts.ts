/**
 * renovation-facts — Resolve property descriptors against the renovation
 * hypothesis (As-Purchased vs. As-Improved).
 *
 * Milestone B (task #1406): the engine, slide factory, Rebecca tools, and
 * report exports must agree on which physical configuration applies to a
 * given projection year. Pre-renovation years use the As-Purchased values
 * captured at acquisition; from `plannedReopeningYear` onward the property
 * operates in its As-Improved configuration.
 *
 * Behaviour:
 *   - When `plannedReopeningYear` is null, the property is assumed to stay
 *     in its As-Purchased configuration for the entire projection horizon.
 *   - When the requested calendar year < `plannedReopeningYear`, every
 *     descriptor is read from its As-Purchased twin.
 *   - When the requested calendar year >= `plannedReopeningYear`, each
 *     descriptor reads from its As-Improved twin and falls back to the
 *     As-Purchased value when the improved value is null.
 *   - Descriptions follow the same rule but additionally fall back to the
 *     legacy `description` column for backwards compatibility.
 *
 * The fields covered here (fbVenues / fbSeats / eventSpaceSqft /
 * totalBuildingSqft / description) are descriptors consumed by ICP analysis,
 * the slide factory, the Rebecca property tools, and the report export
 * pipeline. property-engine.ts also stamps `propertyState` on every
 * `MonthlyFinancials` row using the same cutover (see
 * `reopeningMonthIdx` on `PropertyEngineContext`), so any future
 * cash-flow-affecting field can read the active state directly off the
 * monthly row instead of re-deriving it. Centralising the lookup here
 * ensures every consumer agrees on the cut-over year and applies the same
 * fallback rules.
 */
import type { PropertyInput } from '../types';

export type RenovationState = 'as_purchased' | 'as_improved';

export interface ResolvedPropertyFacts {
  state: RenovationState;
  fbVenues: number | null;
  fbSeats: number | null;
  eventSpaceSqft: number | null;
  totalBuildingSqft: number | null;
  description: string | null;
}

type RenovationFactsInput = Pick<
  PropertyInput,
  | 'fbVenues'
  | 'fbSeats'
  | 'eventSpaceSqft'
  | 'totalBuildingSqft'
  | 'description'
  | 'descriptionPurchased'
  | 'fbVenuesImproved'
  | 'fbSeatsImproved'
  | 'eventSpaceSqftImproved'
  | 'totalBuildingSqftImproved'
  | 'plannedReopeningYear'
  | 'descriptionImproved'
>;

/**
 * Returns the As-Purchased descriptor snapshot. Used by report exports and
 * Rebecca tools that need to surface the acquisition-state facts explicitly.
 */
export function resolveAsPurchasedFacts(property: RenovationFactsInput): ResolvedPropertyFacts {
  return {
    state: 'as_purchased',
    fbVenues: property.fbVenues ?? null,
    fbSeats: property.fbSeats ?? null,
    eventSpaceSqft: property.eventSpaceSqft ?? null,
    totalBuildingSqft: property.totalBuildingSqft ?? null,
    description: property.descriptionPurchased ?? property.description ?? null,
  };
}

/**
 * Returns the As-Improved descriptor snapshot, falling back to As-Purchased
 * for any field that has not yet been captured.
 */
export function resolveAsImprovedFacts(property: RenovationFactsInput): ResolvedPropertyFacts {
  const purchased = resolveAsPurchasedFacts(property);
  return {
    state: 'as_improved',
    fbVenues: property.fbVenuesImproved ?? purchased.fbVenues,
    fbSeats: property.fbSeatsImproved ?? purchased.fbSeats,
    eventSpaceSqft: property.eventSpaceSqftImproved ?? purchased.eventSpaceSqft,
    totalBuildingSqft: property.totalBuildingSqftImproved ?? purchased.totalBuildingSqft,
    description: property.descriptionImproved ?? purchased.description,
  };
}

/**
 * Returns the descriptor snapshot that applies for the requested calendar
 * year. Pre-reopening years (and any year when `plannedReopeningYear` is
 * null) yield the As-Purchased snapshot; from the reopening year onward
 * the As-Improved snapshot applies (with per-field fallback to the
 * As-Purchased twin).
 */
export function resolvePropertyFactsForYear(
  property: RenovationFactsInput,
  calendarYear: number,
): ResolvedPropertyFacts {
  const reopen = property.plannedReopeningYear;
  if (reopen == null || calendarYear < reopen) {
    return resolveAsPurchasedFacts(property);
  }
  return resolveAsImprovedFacts(property);
}

/**
 * Returns true when the operator has captured at least one As-Improved
 * descriptor (any field or planned reopening year). Used by report and
 * slide consumers to decide whether to render a "post-renovation" block.
 */
export function hasRenovationHypothesis(property: RenovationFactsInput): boolean {
  return (
    property.plannedReopeningYear != null ||
    property.fbVenuesImproved != null ||
    property.fbSeatsImproved != null ||
    property.eventSpaceSqftImproved != null ||
    property.totalBuildingSqftImproved != null ||
    (property.descriptionImproved != null && property.descriptionImproved.trim().length > 0)
  );
}
