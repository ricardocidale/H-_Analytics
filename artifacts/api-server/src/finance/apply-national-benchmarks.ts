/**
 * apply-national-benchmarks — overlay national hospitality benchmark feeds
 * onto the engine's `serviceTemplates` input before each calc.
 *
 * Counterpart to `apply-model-constants.ts`. Both files implement the same
 * pattern at the boundary between admin-governed data and the engine:
 *
 *   apply-model-constants    →  Universal/country Model Constants on `globalAssumptions`
 *   apply-national-benchmarks →  ICP national feeds on `serviceTemplates`
 *
 * Data path:
 *   Pietro scheduler → Gaetano (vendor_passthrough_costs) + Renato
 *   (mgmt_co_markup_factors) → `getLatestNationalBenchmarks()` reader →
 *   pure overlay in `@calc/services/national-anchors` → engine.
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
 * Task #1415 contract.
 */

import type { ServiceTemplate } from "@calc/services/types";
import { overlayNationalMarkupsOnTemplates } from "@calc/services/national-anchors";
import { getLatestNationalBenchmarks } from "./national-benchmarks";

/**
 * Async overlay: load latest national benchmark rows and apply them to
 * the supplied service template list. Always resolves; on DB error the
 * underlying reader returns empty arrays and the hardcoded anchors win.
 */
export async function withNationalBenchmarks(
  templates: readonly ServiceTemplate[],
): Promise<ServiceTemplate[]> {
  const { vendorCosts, markupFactors } = await getLatestNationalBenchmarks();
  return overlayNationalMarkupsOnTemplates(templates, vendorCosts, markupFactors);
}
