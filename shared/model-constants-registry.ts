/**
 * Model Constants Registry — classifies every governed value with metadata.
 *
 * This registry is the single source of truth for:
 *   - Which constants exist (the canonical key list)
 *   - Whether a constant is universal or country-keyed
 *   - Whether a country-keyed constant additionally varies by US state
 *   - How to look up the factory baseline value (TS factory)
 *   - The "documentation" cited authority + helper text (re-uses GOVERNED_FIELDS where present)
 *
 * It does NOT store values directly. Universal constants point at exports
 * from `shared/constants.ts`; country-keyed constants point into
 * `COUNTRY_DEFAULTS` / `US_STATE_DEFAULTS` in `shared/countryDefaults.ts`.
 *
 * The runtime value comes from `getEffectiveConstant`
 * (see `shared/get-effective-constant.ts`), which layers DB overrides on top.
 *
 * Phase 1 scope: register the two existing GOVERNED_FIELDS
 * (`depreciationYears`, `daysPerMonth`). More constants can be migrated into
 * this registry incrementally without breaking callers — until the registry
 * holds an entry for a key, the helper still falls back to plain TS lookup.
 */

import { DAYS_PER_MONTH, GOVERNED_FIELDS, type GovernedFieldMeta } from "./constants";
import { COUNTRY_DEFAULTS, US_STATE_DEFAULTS, type CountryDefaults, type UsStateDefaults } from "./countryDefaults";

/**
 * Locality of a constant:
 *   - "universal"     → one value worldwide (e.g. days per month)
 *   - "country"       → varies by country, no sub-divisions
 *   - "country+state" → country-keyed AND US has per-state overlays
 */
export type ConstantLocality = "universal" | "country" | "country+state";

/**
 * Where the factory value lives in TS. The registry exposes a getter so the
 * helper can resolve a (key, country, subdivision) tuple to a TS value
 * without each caller knowing the file layout.
 */
export interface ConstantRegistryEntry {
  /** Stable key as used in DB rows and admin UI. */
  key: string;
  /** Display label for UI. */
  label: string;
  /** Where the constant varies. */
  locality: ConstantLocality;
  /** Documentation block (authority, helper text, reference URL). */
  meta: GovernedFieldMeta;
  /**
   * Factory-value resolver. For "universal" → ignores arguments.
   * For "country" / "country+state" → reads COUNTRY_DEFAULTS / US_STATE_DEFAULTS.
   * Returns undefined if no factory value exists for that locality (e.g.
   * unregistered country) — caller should treat as "not seeded".
   */
  factoryValue(country?: string | null, subdivision?: string | null): unknown;
}

const depreciationYearsMeta = GOVERNED_FIELDS.depreciationYears!;
const daysPerMonthMeta = GOVERNED_FIELDS.daysPerMonth!;

export const MODEL_CONSTANTS_REGISTRY: Record<string, ConstantRegistryEntry> = {
  depreciationYears: {
    key: "depreciationYears",
    label: depreciationYearsMeta.fieldName,
    locality: "country",
    meta: depreciationYearsMeta,
    factoryValue: (country) => {
      if (!country) return COUNTRY_DEFAULTS["United States"]!.depreciationYears;
      const def: CountryDefaults | undefined = COUNTRY_DEFAULTS[country];
      return def?.depreciationYears ?? COUNTRY_DEFAULTS["United States"]!.depreciationYears;
    },
  },
  daysPerMonth: {
    key: "daysPerMonth",
    label: daysPerMonthMeta.fieldName,
    locality: "universal",
    meta: daysPerMonthMeta,
    factoryValue: () => DAYS_PER_MONTH,
  },
};

/** All registered constant keys (Phase 1: depreciationYears, daysPerMonth). */
export const REGISTERED_CONSTANT_KEYS = Object.keys(MODEL_CONSTANTS_REGISTRY);

/**
 * Helper: does this country have a US-state overlay for this constant?
 * Currently only relevant for keys with locality === "country+state" + country === "United States".
 * (No country+state constants in Phase 1, but the helper is here for Phase 3.)
 */
export function hasStateOverlay(key: string, country: string | null | undefined): boolean {
  const entry = MODEL_CONSTANTS_REGISTRY[key];
  return !!entry && entry.locality === "country+state" && country === "United States";
}

/**
 * Convenience: return the factory value at a locality WITHOUT consulting the
 * DB. Used by callers that explicitly want the "what would baseline say"
 * answer (e.g. the diff preview in Admin's regenerate flow).
 */
export function getFactoryValue(
  key: string,
  country?: string | null,
  subdivision?: string | null,
): unknown {
  const entry = MODEL_CONSTANTS_REGISTRY[key];
  if (!entry) return undefined;
  return entry.factoryValue(country, subdivision);
}

// Re-export for convenience so callers can import everything from one place.
export type { CountryDefaults, UsStateDefaults };
