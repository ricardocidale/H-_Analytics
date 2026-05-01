/**
 * Per-Specialist allow-lists for admin-authored requiredFields keys.
 *
 * Background (P6a follow-up):
 * The Surface Router's required-fields gate is only effective if admins
 * author keys in the SAME namespace the gate evaluates against. That
 * namespace differs per Specialist:
 *   - mgmt-co.funding → keys of `CapitalRaiseInputs` (the dispatch payload)
 *   - mgmt-co.revenue → saved-row column names from `global_assumptions`
 *     (the route handler runs the gate BEFORE the `?? DEFAULT_*` substitution
 *     that builds the dispatch payload, so the natural namespace is the row).
 *
 * Without this allow-list, an admin who types a wrong key (or the right key
 * from the wrong namespace, e.g. "marketingRate" for revenue) gets a silent
 * no-op: save succeeds, the missing-field check never fires for that key,
 * and enforcement looks wired but isn't.
 *
 * Specialists not listed here return `null`, which means "no allow-list,
 * accept any string" — preserves backward-compat for Specialists that
 * declare the `required-fields` capability but don't yet have wired
 * enforcement (ICP Intelligence, Risk Intelligence, Watchdog).
 */

/**
 * mgmt-co.funding — keys of `CapitalRaiseInputs` (engine/watchdog/capitalRaiseEvaluator.ts).
 * Source of truth: the interface itself. If a field is added/removed there,
 * update this list; the contract test in tests/analyst/required-fields-allow-list.test.ts
 * pins the alignment.
 */
export const FUNDING_VALID_REQUIRED_FIELD_KEYS = [
  "runwayBufferMonths",
  "sizingOvershootPct",
  "trancheGapMonths",
  "revenueRampDelayMonths",
  "burnFlexDownPct",
] as const;

/**
 * mgmt-co.revenue — single source of truth for the saved-row → dispatch-payload
 * mapping. Used by BOTH:
 *   1. server/routes/global-assumptions.ts to build the dispatch payload
 *      (iterates this map; previously had 5 hand-written `num("…") ?? DEFAULT_*`
 *      lines that could drift from the allow-list silently).
 *   2. The admin allow-list below (REVENUE_VALID_REQUIRED_FIELD_KEYS) which
 *      is derived from this map's keys, so the two cannot diverge.
 *
 * To add/remove a revenue field: edit this map only. The TS `keyof RevenueInputs`
 * type on `dispatchKey` ensures every entry maps to a real RevenueInputs field;
 * the contract test in tests/analyst/required-fields-allow-list.test.ts pins
 * coverage in the other direction (every RevenueInputs key has an entry).
 *
 * Saved-row keys are columns of `global_assumptions` (shared/schema/config.ts).
 */
import type { RevenueInputs } from "../../watchdog/revenueEvaluator";
import type { globalAssumptions } from "@workspace/db/schema/config";

type GlobalAssumptionsRow = typeof globalAssumptions.$inferSelect;

export const REVENUE_FIELD_MAPPINGS = [
  { savedRowKey: "defaultCostRateMarketing", dispatchKey: "marketingRate" },
  { savedRowKey: "defaultRevShareFb",        dispatchKey: "fbRevenueShare" },
  { savedRowKey: "defaultRevShareEvents",    dispatchKey: "eventsRevenueShare" },
  { savedRowKey: "defaultRevShareOther",     dispatchKey: "otherRevenueShare" },
  { savedRowKey: "defaultCateringBoostPct",  dispatchKey: "cateringBoostPct" },
] as const satisfies readonly {
  // Both sides of the mapping are bidirectionally pinned at compile time:
  //   - savedRowKey must be an actual column of `global_assumptions` (typo /
  //     rename of a DB column breaks compilation here).
  //   - dispatchKey must be a real RevenueInputs field (typo / removal of a
  //     RevenueInputs key breaks compilation here).
  // The contract test in tests/analyst/required-fields-allow-list.test.ts
  // pins the *other* direction (no missing keys in either set).
  savedRowKey: keyof GlobalAssumptionsRow;
  dispatchKey: keyof RevenueInputs;
}[];

export const REVENUE_VALID_REQUIRED_FIELD_KEYS = REVENUE_FIELD_MAPPINGS.map(
  (m) => m.savedRowKey,
) as readonly (typeof REVENUE_FIELD_MAPPINGS[number]["savedRowKey"])[];

const ALLOW_LISTS: Record<string, readonly string[]> = {
  "mgmt-co.funding": FUNDING_VALID_REQUIRED_FIELD_KEYS,
  "mgmt-co.revenue": REVENUE_VALID_REQUIRED_FIELD_KEYS,
};

/**
 * Returns the allow-list for a Specialist's requiredFields, or `null` if
 * the Specialist has no allow-list wired yet (accept any string).
 */
export function getValidRequiredFieldKeys(
  specialistId: string,
): readonly string[] | null {
  return ALLOW_LISTS[specialistId] ?? null;
}

/**
 * Returns the keys in `fields` that are NOT in the Specialist's allow-list.
 * Returns [] if the Specialist has no allow-list (any key is valid).
 */
export function findInvalidRequiredFieldKeys(
  specialistId: string,
  fields: readonly string[],
): string[] {
  const allow = getValidRequiredFieldKeys(specialistId);
  if (allow === null) return [];
  const allowSet = new Set(allow);
  return fields.filter((f) => !allowSet.has(f));
}
