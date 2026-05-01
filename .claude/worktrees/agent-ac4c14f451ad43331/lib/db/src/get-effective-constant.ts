/**
 * Resolver for model constants.
 *
 * Resolution order (canonical-DB-first, TS-fallback):
 *
 *   1. Manual override   (most specific locality match)
 *   2. Analyst override  (most specific locality match)
 *   3. DB canonical row  (most specific locality: subdivision > country > universal)
 *   4. TS factory value  (last-resort fallback when no canonical row found)
 *
 * The override layer (`overrides`) and the canonical layer (`canonicals`) are
 * supplied as plain arrays — caller is expected to have already loaded both
 * via `IStorage.listModelConstantOverrides` and `IStorage.listCanonicals`.
 * Keeping the helper pure means it can be shared between client and server.
 *
 * `source` semantics:
 *   - "manual"  → manual admin override
 *   - "analyst" → analyst-driven override (research-backed)
 *   - "factory" → the resolved baseline. With the canonical-DB layer in place,
 *     "factory" now means "DB canonical row OR TS fallback, whichever
 *     resolves first". The `factoryFrom` field disambiguates which.
 *
 * NOTE: This helper does no IO.
 */

import type { ModelConstantOverride } from "./schema/model-constants";
import type { ModelConstant } from "./schema/model-canonicals";
import { MODEL_CONSTANTS_REGISTRY, getFactoryValue } from "./model-constants-registry";

export type ResolvedSource = "manual" | "analyst" | "factory";

/** Where the "factory" baseline came from when source === "factory". */
export type FactoryFrom = "canonical_subdivision" | "canonical_country" | "canonical_universal" | "ts_fallback" | "none";

export interface ResolvedConstant<T = unknown> {
  /** The effective value. `undefined` if no factory and no override exist. */
  value: T | undefined;
  /** Where the value came from (high-level). */
  source: ResolvedSource;
  /** Authority citation, if present (analyst-set, canonical, or factory). */
  authority?: string;
  /** Reference URL, if present. */
  referenceUrl?: string;
  /** Locality at which the override was found, if any. */
  resolvedAt?: "subdivision" | "country" | "universal";
  /** The override row that matched (when source !== "factory"). */
  override?: ModelConstantOverride;
  /** When source === "factory", which baseline layer answered. */
  factoryFrom?: FactoryFrom;
  /** When source === "factory" and factoryFrom starts with "canonical_", the row. */
  canonical?: ModelConstant;
}

export interface GetEffectiveConstantArgs {
  key: string;
  country?: string | null;
  subdivision?: string | null;
  /** All overrides for this key (caller may pass the full set; we filter here). */
  overrides: readonly ModelConstantOverride[];
  /**
   * All canonical rows for this key, optionally. When omitted, behaviour is
   * backward-compatible: only TS factory is consulted.
   */
  canonicals?: readonly ModelConstant[];
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
    const manual = matches.find((m) => m.source === "manual");
    if (manual) return { row: manual, resolvedAt: locality };
    const analyst = matches.find((m) => m.source === "analyst");
    if (analyst) return { row: analyst, resolvedAt: locality };
  }
  return undefined;
}

/**
 * Pick the most-specific canonical row that matches the requested locality.
 * Specificity: subdivision row > country row > universal row.
 */
function pickCanonical(
  canonicals: readonly ModelConstant[],
  country: string | null | undefined,
  subdivision: string | null | undefined,
): { row: ModelConstant; from: "canonical_subdivision" | "canonical_country" | "canonical_universal" } | undefined {
  if (subdivision) {
    const sub = canonicals.find((c) => c.country === country && c.countrySubdivision === subdivision);
    if (sub) return { row: sub, from: "canonical_subdivision" };
  }
  if (country) {
    const cou = canonicals.find((c) => c.country === country && c.countrySubdivision === null);
    if (cou) return { row: cou, from: "canonical_country" };
  }
  const uni = canonicals.find((c) => c.country === null && c.countrySubdivision === null);
  if (uni) return { row: uni, from: "canonical_universal" };
  return undefined;
}

export function getEffectiveConstant<T = unknown>({
  key,
  country = null,
  subdivision = null,
  overrides,
  canonicals,
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

  // No override → look up the canonical baseline.
  if (canonicals && canonicals.length > 0) {
    const canonicalsForKey = canonicals.filter((c) => c.constantKey === key);
    const cpicked = pickCanonical(canonicalsForKey, country, subdivision);
    if (cpicked) {
      return {
        value: cpicked.row.value as T,
        source: "factory",
        authority: cpicked.row.authoritySource ?? entry?.meta.authority,
        referenceUrl: cpicked.row.authorityRef ?? entry?.meta.referenceUrl,
        factoryFrom: cpicked.from,
        canonical: cpicked.row,
      };
    }
  }

  // Last-resort: TS factory.
  const factory = getFactoryValue(key, country, subdivision);
  return {
    value: factory as T | undefined,
    source: "factory",
    authority: entry?.meta.authority,
    referenceUrl: entry?.meta.referenceUrl,
    factoryFrom: factory === undefined ? "none" : "ts_fallback",
  };
}
