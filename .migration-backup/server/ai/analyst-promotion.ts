/**
 * Analyst default-promotion — Slice 1 of the auto-defaults pipeline.
 *
 * When the Analyst (orchestrateResearch) produces a `researchValues` map for a
 * property, this helper promotes the `mid` value of each mapped canonical
 * field into the corresponding scalar column on the Property row, so the
 * Steady State engine stops falling back to generic MC defaults and uses the
 * market-sourced number instead.
 *
 * Invariant — NEVER overwrite a user-typed value. A column is eligible for
 * promotion only when one of:
 *   (a) its current value is null or undefined (true for the nullable subset,
 *       e.g. inflationRate, acquisitionLTV), OR
 *   (b) the column name appears in `researchValues._defaultSources` — meaning
 *       it was filled by the Layer-2 smart-defaults step at property create
 *       and has not been user-edited since, OR
 *   (c) the column name appears in `researchValues._promoted` — meaning a
 *       previous Analyst run already promoted it (safe to refresh).
 *
 * After promotion, the column names are added to `researchValues._promoted`
 * so subsequent Analyst runs can idempotently refresh without getting blocked
 * by their own prior writes (prior writes no longer appear in
 * `_defaultSources`, only `_promoted`).
 */

import type { Property } from "@shared/schema";
import type { CanonicalResearchField } from "./synthesis-schema";

/** Shape of each entry in a Property's `researchValues` map after synthesis. */
export interface PromotionValueEntry {
  display?: string;
  mid?: number | null;
  source?: string;
}

/** The Analyst emits the map + two internal provenance markers. */
export type PromotionResearchValues = Record<string, PromotionValueEntry | unknown> & {
  _defaultSources?: Record<string, string>;
  _promoted?: string[];
};

/**
 * Canonical Analyst field → Property scalar column name.
 *
 * Conservative subset: we only map fields whose semantics align cleanly with
 * a Property column (same unit, same denominator). Risky cross-domain fields
 * (ltv, interestRate — acquisition-vs-refinance ambiguous; landValue — is $
 * in Analyst but % in Property) are deliberately excluded.
 *
 * Keep this in sync with CANONICAL_RESEARCH_FIELDS in synthesis-schema.ts and
 * the Property column definitions in shared/schema/properties.ts.
 */
export const ANALYST_FIELD_TO_PROPERTY_COLUMN: Partial<
  Record<CanonicalResearchField, keyof Property>
> = {
  // Revenue
  adr: "startAdr",
  adrGrowth: "adrGrowthRate",
  occupancy: "maxOccupancy",
  startOccupancy: "startOccupancy",
  occupancyStep: "occupancyGrowthStep",
  rampMonths: "occupancyRampMonths",
  catering: "cateringBoostPercent",
  revShareFB: "revShareFB",
  revShareEvents: "revShareEvents",
  revShareOther: "revShareOther",

  // Valuation & exit
  capRate: "exitCapRate",
  saleCommission: "dispositionCommission",

  // Operating cost rates
  costHousekeeping: "costRateRooms",
  costFB: "costRateFB",
  costAdmin: "costRateAdmin",
  costMarketing: "costRateMarketing",
  costPropertyOps: "costRatePropertyOps",
  costUtilities: "costRateUtilities",
  costFFE: "costRateFFE",
  costIT: "costRateIT",
  costOther: "costRateOther",
  costPropertyTaxes: "costRateTaxes",

  // Management fees
  incentiveFee: "incentiveManagementFeeRate",

  // Tax & macro
  incomeTax: "taxRate",
  inflationRate: "inflationRate",

  // Capital structure
  costSeg5yrPct: "costSeg5yrPct",
  costSeg7yrPct: "costSeg7yrPct",
  costSeg15yrPct: "costSeg15yrPct",
  arDays: "arDays",
  apDays: "apDays",
  preOpeningCosts: "preOpeningCosts",
};

/**
 * Determine whether a given Property column is eligible for Analyst promotion.
 * See the file-level invariant above for the rules.
 */
export function isColumnPromotable(
  property: Pick<Property, keyof Property>,
  column: keyof Property,
  researchValues: PromotionResearchValues | null | undefined,
): boolean {
  const current = (property as Record<string, unknown>)[column as string];
  if (current === null || current === undefined) return true;

  const defaultSources = researchValues?._defaultSources;
  if (defaultSources && Object.prototype.hasOwnProperty.call(defaultSources, column)) {
    return true;
  }

  const promoted = researchValues?._promoted;
  if (Array.isArray(promoted) && promoted.includes(column as string)) {
    return true;
  }

  return false;
}

/**
 * Compute the patch that promotes `mid` values from a researchValues map into
 * the corresponding Property scalar columns. Pure; does not mutate inputs.
 *
 * Returns the patch to apply via `storage.updateProperty`, the list of field
 * names promoted (for logging and for updating `_promoted`), and a skipped
 * breakdown for diagnostics.
 */
export function promoteResearchValuesToProperty(
  property: Property,
  researchValues: PromotionResearchValues | null | undefined,
): {
  patch: Partial<Property>;
  promotedFields: string[];
  skipped: { field: string; reason: "no-mid" | "not-finite" | "not-eligible" | "no-column" }[];
} {
  const patch: Record<string, number> = {};
  const promotedFields: string[] = [];
  const skipped: { field: string; reason: "no-mid" | "not-finite" | "not-eligible" | "no-column" }[] = [];

  if (!researchValues) {
    return { patch: {}, promotedFields, skipped };
  }

  for (const [field, rawEntry] of Object.entries(researchValues)) {
    // Skip our own provenance markers
    if (field.startsWith("_")) continue;

    const column = (ANALYST_FIELD_TO_PROPERTY_COLUMN as Record<string, keyof Property | undefined>)[field];
    if (!column) {
      skipped.push({ field, reason: "no-column" });
      continue;
    }

    const entry = rawEntry as PromotionValueEntry | undefined;
    const mid = entry?.mid;
    if (mid === null || mid === undefined) {
      skipped.push({ field, reason: "no-mid" });
      continue;
    }
    if (typeof mid !== "number" || !Number.isFinite(mid)) {
      skipped.push({ field, reason: "not-finite" });
      continue;
    }

    if (!isColumnPromotable(property, column, researchValues)) {
      skipped.push({ field, reason: "not-eligible" });
      continue;
    }

    patch[column as string] = mid;
    promotedFields.push(column as string);
  }

  return { patch: patch as Partial<Property>, promotedFields, skipped };
}

/**
 * Merge the list of newly promoted column names into
 * `researchValues._promoted`, returning an updated researchValues object.
 * Idempotent; preserves insertion order, deduplicates.
 */
export function recordPromotionProvenance(
  researchValues: PromotionResearchValues,
  promotedFields: string[],
): PromotionResearchValues {
  if (promotedFields.length === 0) return researchValues;
  const existing = Array.isArray(researchValues._promoted) ? researchValues._promoted : [];
  const merged = Array.from(new Set([...existing, ...promotedFields]));
  return { ...researchValues, _promoted: merged };
}
