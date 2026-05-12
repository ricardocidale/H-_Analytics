/**
 * national-anchors.ts — Pure overlay layer for national hospitality benchmarks.
 *
 * Bridges the two ICP research feeds populated by the Pietro scheduler minions
 * (Gaetano → vendor_passthrough_costs, Renato → mgmt_co_markup_factors) into
 * the `serviceMarkup` value the company financial engine consumes per service
 * template (`@calc/services/cost-of-services`).
 *
 * Contract:
 * - Pure: takes benchmark rows + template list, returns a derived markup map.
 *   Database access lives one tier up in the api-server (see
 *   `artifacts/api-server/src/finance/apply-national-benchmarks.ts`).
 * - Falls back to hardcoded national anchors when the DB is empty for a given
 *   service line. The anchors here MUST stay in sync with the per-service-line
 *   anchors seeded by the two minions; they are the same numbers, restated
 *   here so the calc layer can resolve a markup without touching the DB.
 *
 * Markup conversion math:
 *   The minions store percent-of-revenue figures:
 *     vendor cost line item = costPctRevenue × revenue
 *     ManCo markup line item = markupPctRevenue × revenue
 *   The engine's `serviceMarkup` is a cost-plus multiplier:
 *     fee = vendorCost × (1 + serviceMarkup)
 *   Therefore for a given template we sum the contributing service-line
 *   percentages and derive:
 *     serviceMarkup = sum(markupPctRevenue) / sum(costPctRevenue)
 */

import type { ServiceTemplate } from "./types.js";

/** Service-line slugs as written by the Pietro minions. */
export const NATIONAL_SERVICE_LINES = [
  "marketing",
  "it",
  "accounting",
  "reservations",
  "housekeeping",
  "maintenance",
  "revenue_management",
  "food_beverage",
  "branding",
  "performance_bonus",
] as const;
export type NationalServiceLine = (typeof NATIONAL_SERVICE_LINES)[number];

/**
 * Hardcoded fallback anchors, mirroring the seeded values in
 * `artifacts/api-server/src/ai/ambient/minions/vendor-passthrough-costs.ts`.
 * Sourced from STR HOST 2024 + CBRE Hotels Americas Research 2024 + HVS 2024.
 * Decimal fractions of total revenue.
 */
export const NATIONAL_VENDOR_COST_ANCHORS: Record<NationalServiceLine, number> = {
  marketing:          0.0350,
  it:                 0.0150,
  accounting:         0.0200,
  reservations:       0.0250,
  housekeeping:       0.0900,
  maintenance:        0.0400,
  revenue_management: 0.0120,
  food_beverage:      0.0600,
  branding:           0.0100,
  performance_bonus:  0.0050,
};

/**
 * Hardcoded fallback anchors, mirroring the seeded values in
 * `artifacts/api-server/src/ai/ambient/minions/mgmt-co-markup-factors.ts`.
 * Sourced from HVS 2024 + CBRE Hotels Americas Research 2024 + PKF 2024.
 * Decimal fractions of total revenue.
 */
export const NATIONAL_MARKUP_FACTOR_ANCHORS: Record<NationalServiceLine, number> = {
  marketing:          0.0050,
  it:                 0.0030,
  accounting:         0.0040,
  reservations:       0.0050,
  housekeeping:       0.0150,
  maintenance:        0.0080,
  revenue_management: 0.0025,
  food_beverage:      0.0100,
  branding:           0.0020,
  performance_bonus:  0.0010,
};

/**
 * Map canonical service template names → contributing minion service lines.
 * Template names match `DEFAULT_COMPANY_SERVICE_TEMPLATES` in
 * `lib/db/src/constants.ts`. Templates without a national-feed mapping
 * (e.g. "General Management", "Procurement") simply keep their stored
 * `serviceMarkup` and are not overlaid.
 */
export const TEMPLATE_TO_SERVICE_LINES: Readonly<Record<string, readonly NationalServiceLine[]>> = {
  "Marketing & Brand":         ["marketing", "branding"],
  "Technology & Reservations": ["it", "reservations"],
  "Accounting":                ["accounting"],
  "Revenue Management":        ["revenue_management"],
};

/**
 * Map property-engine cost-rate field names → the single national service line
 * that anchors them.
 *
 * Only three property cost rates have a direct national benchmark counterpart:
 *   housekeeping  → costRateRooms      (rooms dept: housekeeping + front desk)
 *   maintenance   → costRatePropertyOps (property ops & maintenance)
 *   food_beverage → costRateFB         (F&B operating cost)
 *
 * Other cost rates (admin, utilities, taxes, IT, FFE, insurance, other) are
 * either fixed-overhead categories with no vendor-feed equivalent, or are
 * country-specific (taxes) and therefore excluded from this overlay.
 */
export const PROPERTY_COST_RATE_TO_SERVICE_LINE: Readonly<{
  costRateRooms: NationalServiceLine;
  costRatePropertyOps: NationalServiceLine;
  costRateFB: NationalServiceLine;
}> = {
  costRateRooms:       "housekeeping",
  costRatePropertyOps: "maintenance",
  costRateFB:          "food_beverage",
};

/**
 * The three property-level cost rates that can be sourced from national feeds.
 * A value of `null` signals "not yet resolved / use model default" —
 * the overlay fills these from DB benchmarks, falling back to hardcoded anchors.
 */
export interface PropertyCostRateAnchors {
  costRateRooms: number;
  costRatePropertyOps: number;
  costRateFB: number;
}

/**
 * Derive property-level cost rate anchors from national vendor cost rows.
 *
 * Reads the `housekeeping`, `maintenance`, and `food_beverage` service lines
 * from the resolved cost map and returns them as property engine cost rate
 * values. DB rows take precedence over hardcoded anchors (via `resolveCostMap`).
 *
 * Returns a `PropertyCostRateAnchors` object — no markup math required here,
 * because the property engine consumes cost rates directly (not cost-plus
 * multipliers like the service templates do).
 */
export function derivePropertyCostAnchors(
  vendorRows: readonly NationalVendorCostInput[],
): PropertyCostRateAnchors {
  const costMap = resolveCostMap(vendorRows);
  return {
    costRateRooms:       costMap[PROPERTY_COST_RATE_TO_SERVICE_LINE.costRateRooms],
    costRatePropertyOps: costMap[PROPERTY_COST_RATE_TO_SERVICE_LINE.costRatePropertyOps],
    costRateFB:          costMap[PROPERTY_COST_RATE_TO_SERVICE_LINE.costRateFB],
  };
}

/**
 * Overlay national cost-rate anchors onto a single property's optional cost
 * rates. Only null / undefined slots are filled — explicit numeric values from
 * the property record are preserved unchanged, honoring the operator's override.
 *
 * Designed to be called before the engine so that national benchmarks act as
 * the intelligent default when the operator has not explicitly configured a rate.
 */
export function overlayNationalCostAnchorsOnProperty<
  T extends {
    costRateRooms?: number | null;
    costRateFB?: number | null;
    costRatePropertyOps?: number | null;
  },
>(property: T, anchors: PropertyCostRateAnchors): T {
  return {
    ...property,
    costRateRooms:       property.costRateRooms       ?? anchors.costRateRooms,
    costRateFB:          property.costRateFB          ?? anchors.costRateFB,
    costRatePropertyOps: property.costRatePropertyOps ?? anchors.costRatePropertyOps,
  };
}

/** Minimal shape of a benchmark row consumed by the overlay. */
export interface NationalVendorCostInput {
  serviceLine: string;
  costPctRevenue: number;
}
export interface NationalMarkupFactorInput {
  serviceLine: string;
  markupPctRevenue: number;
}

/**
 * Resolve a per-service-line cost-percentage map. DB rows take precedence;
 * any missing service line falls back to the hardcoded national anchor.
 *
 * Row precedence: only the FIRST occurrence of each `serviceLine` is kept.
 * The reader (`getLatestNationalBenchmarks`) returns rows ordered by
 * `fetched_at DESC`, so first-seen == newest. Older duplicates from prior
 * periods must NOT overwrite newer values.
 */
function resolveCostMap(
  rows: readonly NationalVendorCostInput[],
): Record<NationalServiceLine, number> {
  const out: Record<string, number> = { ...NATIONAL_VENDOR_COST_ANCHORS };
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.serviceLine)) continue;
    seen.add(r.serviceLine); // newest row claims the slot, valid or not
    if (Number.isFinite(r.costPctRevenue) && r.costPctRevenue >= 0) {
      out[r.serviceLine] = r.costPctRevenue;
    }
  }
  return out as Record<NationalServiceLine, number>;
}

/**
 * Resolve a per-service-line markup-percentage map. DB rows take precedence;
 * any missing service line falls back to the hardcoded national anchor.
 *
 * Row precedence: only the FIRST occurrence of each `serviceLine` is kept.
 * See `resolveCostMap` above.
 */
function resolveMarkupMap(
  rows: readonly NationalMarkupFactorInput[],
): Record<NationalServiceLine, number> {
  const out: Record<string, number> = { ...NATIONAL_MARKUP_FACTOR_ANCHORS };
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.serviceLine)) continue;
    seen.add(r.serviceLine); // newest row claims the slot, valid or not
    if (Number.isFinite(r.markupPctRevenue) && r.markupPctRevenue >= 0) {
      out[r.serviceLine] = r.markupPctRevenue;
    }
  }
  return out as Record<NationalServiceLine, number>;
}

/**
 * Derive a per-template cost-plus markup map from national benchmark rows.
 *
 * For each template name in `TEMPLATE_TO_SERVICE_LINES`, sums the
 * contributing service-line cost & markup percentages and returns
 *   markupPctRevenue_total / costPctRevenue_total.
 *
 * If `vendorRows` and `markupRows` are both empty, the result is purely
 * derived from the hardcoded anchors — guaranteeing the engine continues
 * to compute even if no minion has ever populated the DB.
 */
export function deriveTemplateMarkupsFromNationalBenchmarks(
  vendorRows: readonly NationalVendorCostInput[],
  markupRows: readonly NationalMarkupFactorInput[],
): Record<string, number> {
  const costMap = resolveCostMap(vendorRows);
  const markupMap = resolveMarkupMap(markupRows);
  const out: Record<string, number> = {};
  for (const [templateName, lines] of Object.entries(TEMPLATE_TO_SERVICE_LINES)) {
    let costSum = 0;
    let markupSum = 0;
    for (const line of lines) {
      costSum += costMap[line] ?? 0;
      markupSum += markupMap[line] ?? 0;
    }
    if (costSum > 0) {
      out[templateName] = markupSum / costSum;
    }
  }
  return out;
}

/**
 * Overlay the derived national markups onto a list of service templates.
 * Returns a new array; templates without a benchmark mapping are returned
 * unchanged. Only `centralized` templates are overlaid — `direct` templates
 * earn an oversight margin and do not have a vendor cost component, so the
 * national markup is irrelevant to them.
 */
export function overlayNationalMarkupsOnTemplates(
  templates: readonly ServiceTemplate[],
  vendorRows: readonly NationalVendorCostInput[],
  markupRows: readonly NationalMarkupFactorInput[],
): ServiceTemplate[] {
  const markupByTemplate = deriveTemplateMarkupsFromNationalBenchmarks(
    vendorRows,
    markupRows,
  );
  return templates.map(t => {
    if (t.serviceModel !== "centralized") return t;
    const overlay = markupByTemplate[t.name];
    if (overlay === undefined) return t;
    return { ...t, serviceMarkup: overlay };
  });
}
