/**
 * getEffectiveConstant — single resolver for governed model constants.
 *
 * Resolution order (Option B, TS factory + DB overlay):
 *
 *   1. Manual override   (most specific locality match)
 *   2. Analyst override  (most specific locality match)
 *   3. Factory value from MODEL_CONSTANTS_REGISTRY (TS source)
 *
 * "Most specific locality" means: for a country+state constant queried as
 * (country='United States', subdivision='Florida'):
 *
 *   subdivision row > country row > universal row
 *
 * The override layer is supplied as a plain array — caller is expected to
 * have already loaded relevant overrides via `IStorage.listModelConstantOverrides`.
 * That keeps this helper pure and shared between client and server.
 *
 * NOTE: This helper does no IO. The server-side route assembles the override
 * array from the DB; the client-side admin UI assembles it from the API
 * response. Both call this same function for the resolution math.
 */

import type { ModelConstantOverride } from "./schema/model-constants";
import { MODEL_CONSTANTS_REGISTRY, getFactoryValue } from "./model-constants-registry";

export type ResolvedSource = "manual" | "analyst" | "factory";

export interface ResolvedConstant<T = unknown> {
  /** The effective value. `undefined` if no factory and no override exist. */
  value: T | undefined;
  /** Where the value came from. */
  source: ResolvedSource;
  /** Authority citation, if present (analyst-set or factory). */
  authority?: string;
  /** Reference URL, if present. */
  referenceUrl?: string;
  /** Locality at which the override was found, if any. */
  resolvedAt?: "subdivision" | "country" | "universal";
  /** The override row that matched (when source !== "factory"). */
  override?: ModelConstantOverride;
}

export interface GetEffectiveConstantArgs {
  key: string;
  country?: string | null;
  subdivision?: string | null;
  /** All overrides for this key. Caller pre-filters to the key. */
  overrides: readonly ModelConstantOverride[];
}

/**
 * Pick the highest-priority override row that matches at the most specific
 * locality. Source priority: manual > analyst.
 */
function pickOverride(
  overrides: readonly ModelConstantOverride[],
  country: string | null | undefined,
  subdivision: string | null | undefined,
): { row: ModelConstantOverride; resolvedAt: "subdivision" | "country" | "universal" } | undefined {
  // Build candidate list ordered by locality specificity.
  // Subdivision-level matches must match BOTH country and subdivision.
  const subdivisionMatches = subdivision
    ? overrides.filter((o) => o.country === country && o.countrySubdivision === subdivision)
    : [];
  const countryMatches = country
    ? overrides.filter((o) => o.country === country && o.countrySubdivision === null)
    : [];
  const universalMatches = overrides.filter((o) => o.country === null && o.countrySubdivision === null);

  for (const [matches, locality] of [
    [subdivisionMatches, "subdivision" as const],
    [countryMatches, "country" as const],
    [universalMatches, "universal" as const],
  ] as const) {
    if (matches.length === 0) continue;
    // Within same locality, manual wins over analyst.
    const manual = matches.find((m) => m.source === "manual");
    if (manual) return { row: manual, resolvedAt: locality };
    const analyst = matches.find((m) => m.source === "analyst");
    if (analyst) return { row: analyst, resolvedAt: locality };
  }
  return undefined;
}

export function getEffectiveConstant<T = unknown>({
  key,
  country = null,
  subdivision = null,
  overrides,
}: GetEffectiveConstantArgs): ResolvedConstant<T> {
  const entry = MODEL_CONSTANTS_REGISTRY[key];
  const overridesForKey = overrides.filter((o) => o.constantKey === key);

  const picked = pickOverride(overridesForKey, country, subdivision);
  if (picked) {
    return {
      value: picked.row.value as T,
      source: picked.row.source as ResolvedSource,
      authority: picked.row.authority ?? entry?.meta.authority,
      referenceUrl: picked.row.referenceUrl ?? entry?.meta.referenceUrl,
      resolvedAt: picked.resolvedAt,
      override: picked.row,
    };
  }

  // No override → factory baseline.
  const factory = getFactoryValue(key, country, subdivision);
  return {
    value: factory as T | undefined,
    source: "factory",
    authority: entry?.meta.authority,
    referenceUrl: entry?.meta.referenceUrl,
  };
}
