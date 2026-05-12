/**
 * apply-national-benchmarks — overlay national hospitality benchmark feeds
 * onto the engine's `serviceTemplates` input before each calc.
 *
 * Counterpart to `apply-model-constants.ts`. Both files implement the same
 * pattern at the boundary between admin-governed data and the engine:
 *
 *   apply-model-constants     →  Universal/country Model Constants on `globalAssumptions`
 *   apply-national-benchmarks →  ICP national feeds on `serviceTemplates` and property cost rates
 *
 * Data path:
 *   Pietro scheduler → Gaetano (vendor_passthrough_costs) + Renato
 *   (mgmt_co_markup_factors) → `getLatestNationalBenchmarks()` reader →
 *   pure overlay in `@calc/services/national-anchors` → engine.
 *
 * Two exported functions:
 *
 *   withNationalBenchmarks(templates)      — task #1415: serviceMarkup overlay
 *   withPropertyCostAnchors(properties)   — task #1484: property costRate* overlay
 *
 * Behavior:
 *   - When the DB tables hold rows (minions have run), the overlaid
 *     `serviceMarkup` per template is derived from the latest national
 *     averages.
 *   - When a service line has no row, the hardcoded national anchor in
 *     `@calc/services/national-anchors` is used as the fallback. The
 *     anchors mirror the values seeded by the minions so engine output
 *     is stable across "minion has run" / "minion has not run".
 *   - Templates without a benchmark mapping (e.g. "General Management",
 *     "Procurement") and `direct`-model templates are returned unchanged.
 *   - Errors loading benchmarks from the DB never block compute: the
 *     reader returns empty arrays on failure and the overlay falls back
 *     to anchors.
 *
 * Shared behavior for both:
 *   - When the DB tables hold rows (minions have run), the overlaid values are
 *     derived from the latest national averages.
 *   - When a service line has no row, the hardcoded national anchor in
 *     `@calc/services/national-anchors` is used as the fallback.
 *   - Errors loading benchmarks from the DB never block compute: the reader
 *     returns empty arrays on failure and the hardcoded anchors win.
 *
 * Task #1415 contract.
 */

import type { ServiceTemplate } from "@calc/services/types";
import {
  overlayNationalMarkupsOnTemplates,
  overlayNationalCostAnchorsOnProperty,
  derivePropertyCostAnchors,
} from "@calc/services/national-anchors";
import { getLatestNationalBenchmarks } from "./national-benchmarks";

/**
 * Async overlay: load latest national benchmark rows and apply them to
 * the supplied service template list. Always resolves; on DB error the
 * underlying reader returns empty arrays and the hardcoded anchors win.
 *
 * Task #1415 contract.
 */
export async function withNationalBenchmarks(
  templates: readonly ServiceTemplate[],
): Promise<ServiceTemplate[]> {
  const { vendorCosts, markupFactors } = await getLatestNationalBenchmarks();
  return overlayNationalMarkupsOnTemplates(templates, vendorCosts, markupFactors);
}

/**
 * Async overlay: load latest national benchmark rows and apply property-level
 * cost rate anchors (rooms, propertyOps, F&B) to any property whose
 * corresponding field is null or undefined.
 *
 * Null / undefined signals "operator has not explicitly overridden this rate".
 * Explicit numeric values are preserved unchanged so per-property operator
 * overrides always win over national benchmarks.
 *
 * Falls back to hardcoded national anchors when the DB is empty.
 * Always resolves — DB failures produce the hardcoded anchor values.
 *
 * Task #1484 contract.
 */
export async function withPropertyCostAnchors<
  T extends {
    costRateRooms?: number | null;
    costRateFB?: number | null;
    costRatePropertyOps?: number | null;
  },
>(properties: readonly T[]): Promise<T[]> {
  const { vendorCosts } = await getLatestNationalBenchmarks();
  const anchors = derivePropertyCostAnchors(vendorCosts);
  return properties.map(p => overlayNationalCostAnchorsOnProperty(p, anchors));
}

