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
 * Plan 2026-05-13-002 U7 — All descriptor reads route through the
 * `property-descriptor-accessor` so JSONB blobs (`descriptors_purchased` /
 * `descriptors_improved`) and the typed-column dual-write window both feed
 * the same priority chain. The accessor is the migration seam that will
 * survive the U8 typed-column drop.
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
import {
  getEffectiveDescriptor,
  getImprovedDescriptor,
  getPurchasedDescriptor,
  type PropertyRow,
} from '@workspace/db/property-descriptor-accessor';
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

/**
 * Inputs accepted by the renovation-facts helpers. We intentionally widen the
 * type to `PropertyRow` so the helpers work against both:
 *   - The engine's `PropertyInput` shape (typed columns at the camelCase
 *     surface). Dual-write keeps these in sync with the JSONB blobs.
 *   - Raw DB rows with the JSONB blobs (`descriptorsPurchased` /
 *     `descriptorsImproved`).
 * The accessor's `readJsonbBlob` returns `{}` when the blob is missing, so
 * typed-column-only rows still resolve through the dual-write fallback.
 *
 * The narrowed `Pick<PropertyInput, ...>` type below documents the engine's
 * historical column-level dependencies so type errors at consumer sites
 * still surface useful field names while we migrate.
 */
type RenovationFactsInput = PropertyRow & Partial<Pick<
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
>>;

// ─── Coercion helpers ────────────────────────────────────────────────────
// The accessor returns `unknown` (JSONB blobs are loosely typed). Narrow at
// each call site so the public ResolvedPropertyFacts shape stays strict.

function asNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  return null;
}

/**
 * Returns the As-Purchased descriptor snapshot. Used by report exports and
 * Rebecca tools that need to surface the acquisition-state facts explicitly.
 *
 * Reads route through `getPurchasedDescriptor` so the JSONB blob is preferred
 * over the typed column when both are present (dual-write window — once U8
 * lands and drops the typed columns, only the blob path remains).
 *
 * Descriptions retain a tail fallback to the legacy un-versioned `description`
 * column for rows seeded before `description_purchased` existed.
 */
export function resolveAsPurchasedFacts(property: RenovationFactsInput): ResolvedPropertyFacts {
  return {
    state: 'as_purchased',
    fbVenues: asNumberOrNull(getPurchasedDescriptor(property, 'fbVenues')),
    fbSeats: asNumberOrNull(getPurchasedDescriptor(property, 'fbSeats')),
    eventSpaceSqft: asNumberOrNull(getPurchasedDescriptor(property, 'eventSpaceSqft')),
    totalBuildingSqft: asNumberOrNull(getPurchasedDescriptor(property, 'totalBuildingSqft')),
    description:
      asStringOrNull(getPurchasedDescriptor(property, 'description'))
        ?? asStringOrNull(property.description as unknown)
        ?? null,
  };
}

/**
 * Returns the As-Improved descriptor snapshot, falling back to As-Purchased
 * for any field that has not yet been captured.
 *
 * Implemented by reading the effective (improved-then-purchased) view through
 * `getEffectiveDescriptor` — that single call subsumes the historical
 * `improved ?? purchased` chain. The description tail fallback to the legacy
 * `description` column is preserved for the rare row where neither side has a
 * descriptor-catalog entry populated.
 */
export function resolveAsImprovedFacts(property: RenovationFactsInput): ResolvedPropertyFacts {
  return {
    state: 'as_improved',
    fbVenues: asNumberOrNull(getEffectiveDescriptor(property, 'fbVenues')),
    fbSeats: asNumberOrNull(getEffectiveDescriptor(property, 'fbSeats')),
    eventSpaceSqft: asNumberOrNull(getEffectiveDescriptor(property, 'eventSpaceSqft')),
    totalBuildingSqft: asNumberOrNull(getEffectiveDescriptor(property, 'totalBuildingSqft')),
    description:
      asStringOrNull(getEffectiveDescriptor(property, 'description'))
        ?? asStringOrNull(property.description as unknown)
        ?? null,
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
  const reopen = asNumberOrNull(getImprovedDescriptor(property, 'plannedReopeningYear'));
  if (reopen == null || calendarYear < reopen) {
    return resolveAsPurchasedFacts(property);
  }
  return resolveAsImprovedFacts(property);
}

/**
 * Returns true when the operator has captured at least one As-Improved
 * descriptor (any field or planned reopening year). Used by report and
 * slide consumers to decide whether to render a "post-renovation" block.
 *
 * Implemented via `getImprovedDescriptor` per catalog field so the predicate
 * sees both JSONB blob entries and typed-improved-column values.
 */
export function hasRenovationHypothesis(property: RenovationFactsInput): boolean {
  if (getImprovedDescriptor(property, 'plannedReopeningYear') != null) return true;
  if (getImprovedDescriptor(property, 'fbVenues') != null) return true;
  if (getImprovedDescriptor(property, 'fbSeats') != null) return true;
  if (getImprovedDescriptor(property, 'eventSpaceSqft') != null) return true;
  if (getImprovedDescriptor(property, 'totalBuildingSqft') != null) return true;

  const desc = asStringOrNull(getImprovedDescriptor(property, 'description'));
  if (desc != null && desc.trim().length > 0) return true;

  return false;
}
