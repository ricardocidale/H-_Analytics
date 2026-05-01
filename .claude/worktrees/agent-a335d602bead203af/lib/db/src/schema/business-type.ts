/**
 * Business-type bucket for `model_defaults` scoping.
 *
 * Locked by user instruction (2026-04-21): two buckets today (`hotel`,
 * `short-term-rental`) with the codebase prepared for a third. Implemented
 * as a typed enum + lookup table — never a binary — so adding the third
 * bucket is a one-line change. Mapper from the per-property
 * `hospitalityType` enum (9 values) to the coarser business type:
 *   - `vrbo` → `short-term-rental`
 *   - everything else (`hotel`, `resort`, `boutique_hotel`,
 *     `business_hotel`, `wellness_resort`, `conference_hotel`,
 *     `extended_stay`, `lodge`) → `hotel`
 *
 * Property-defaults rows in `model_defaults` use this value in the
 * `business_type` column. NULL there still means "universal" (per
 * `server/defaults.ts` resolution rules); a non-null value scopes the row
 * to that bucket and only that bucket.
 *
 * When the third bucket lands (e.g. `serviced-apartment`), add it to
 * `BUSINESS_TYPES`, extend the mapper, and add a single migration row to
 * `model_defaults` for any value that should differ for the new bucket.
 * No other code change should be required.
 */

import type { HospitalityType } from "./properties";

/**
 * Authoritative list of business-type buckets used to scope property
 * defaults. Order matters only for deterministic UI rendering — the
 * resolver in `server/defaults.ts` does not depend on it.
 */
export const BUSINESS_TYPES = ["hotel", "short-term-rental"] as const;
export type BusinessType = typeof BUSINESS_TYPES[number];

/**
 * Human-readable labels for the business-type selector. Centralised so
 * the Admin Defaults > Property page and any other consumer render the
 * same wording.
 */
export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  "hotel": "Hotel",
  "short-term-rental": "Short-Term Rental",
};

/**
 * Map a property's `hospitalityType` enum value to its coarser business
 * type bucket. Returns `"hotel"` as the safe default for any value the
 * mapper doesn't explicitly recognise — keeps existing rows from falling
 * through to a null bucket if the hospitalityType enum gains a value
 * before this mapper is updated.
 */
export function hospitalityTypeToBusinessType(
  hospitalityType: HospitalityType | null | undefined,
): BusinessType {
  if (hospitalityType === "vrbo") return "short-term-rental";
  return "hotel";
}

/**
 * Type guard for runtime validation (e.g. on incoming request bodies).
 * Mirrors the registry above so adding a new bucket only requires the one
 * edit to `BUSINESS_TYPES`.
 */
export function isBusinessType(value: unknown): value is BusinessType {
  return typeof value === "string" && (BUSINESS_TYPES as readonly string[]).includes(value);
}
