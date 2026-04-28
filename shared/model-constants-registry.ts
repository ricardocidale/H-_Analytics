/**
 * Model Constants Registry — classifies every governed value with metadata.
 *
 * Single source of truth for:
 *   - Which constants exist (the canonical key list)
 *   - Whether a constant is universal, country-keyed, or country+state
 *   - How to look up the TS factory baseline (last-resort fallback only —
 *     the runtime resolver consults the DB canonical layer first)
 *   - The cited authority + helper text for documentation
 *
 * Phase 2 scope (canonical-DB-first): seven keys registered.
 *   universal:         daysPerMonth
 *   country-keyed:     depreciationYears, countryRiskPremium, inflationRate, capitalGainsRate
 *   country+state:     taxRate, costRateTaxes
 *
 * The TS values reached via `factoryValue` here serve only as a fallback
 * when the DB canonical row for a locality is missing (e.g. an unseeded
 * country). Authoritative values live in `model_constants` table; admins
 * can update them without a deploy.
 */

import { DAYS_PER_MONTH, GOVERNED_FIELDS, type GovernedFieldMeta } from "./constants";
import { USALI_FFE_RESERVE_BENCHMARK } from "./constants-brand";
import { COUNTRY_DEFAULTS, US_STATE_DEFAULTS, type CountryDefaults, type UsStateDefaults } from "./countryDefaults";

export type ConstantLocality = "universal" | "country" | "country+state";

export interface ConstantRegistryEntry {
  key: string;
  label: string;
  locality: ConstantLocality;
  meta: GovernedFieldMeta;
  /**
   * Phase 3 (Constants doctrine): when true, this constant is authority-
   * sourced and is owned by an AI Intelligence Specialist (declared via
   * `constantsOwned[]` in `engine/analyst/registry/specialist-catalog.ts`).
   * The server-side guard in `PUT /api/admin/model-constants/:key` rejects
   * any `source = 'manual'` write for these keys with HTTP 422 — the only
   * supported writer is the analyst-apply path. Defaults to `true` for
   * every entry below; flip to `false` only for non-authority keys that
   * still want to allow manual overrides (none today).
   */
  specialistOwned: boolean;
  /**
   * Factory-value resolver (TS fallback). For country/country+state keys,
   * falls back to the United States baseline if the requested country has
   * no entry. Returns undefined only when no US baseline is registered.
   */
  factoryValue(country?: string | null, subdivision?: string | null): unknown;
}

const depreciationYearsMeta = GOVERNED_FIELDS.depreciationYears!;
const daysPerMonthMeta = GOVERNED_FIELDS.daysPerMonth!;

/** Build a meta block for keys not yet present in GOVERNED_FIELDS. */
function buildMeta(fieldName: string, authority: string, helperText: string, referenceUrl?: string): GovernedFieldMeta {
  return {
    fieldName,
    authority,
    helperText,
    referenceUrl,
  } as GovernedFieldMeta;
}

const taxRateMeta = buildMeta(
  "Income tax rate",
  "Country corporate income tax statute (federal + state where applicable)",
  "Effective corporate income tax rate. For US, federal 21% plus state corporate tax.",
);
const costRateTaxesMeta = buildMeta(
  "Property tax (% of revenue)",
  "Local property/real-estate tax authority (municipal, state, or national)",
  "Property/real-estate taxes as % of revenue, mapped to the USALI Property Taxes line.",
);
const countryRiskPremiumMeta = buildMeta(
  "Country Risk Premium",
  "Damodaran NYU Stern Country Risk Premium table (Jan 2026)",
  "Equity risk premium add-on for the country, applied to the discount rate.",
  "https://pages.stern.nyu.edu/~adamodar/",
);
const inflationRateMeta = buildMeta(
  "Inflation rate",
  "Country central bank long-run inflation target / IMF WEO outlook",
  "Annual cost escalation rate. For dollarized economies (Argentina, El Salvador, Panama), reflects USD escalation, not local currency.",
);
const capitalGainsRateMeta = buildMeta(
  "Capital gains tax rate",
  "Country tax statute governing capital gains on real property",
  "Tax rate applied to gains on disposal of the property.",
);
const ffeReserveBenchmarkUsaliMeta = buildMeta(
  "FF&E Reserve Benchmark (USALI)",
  "USALI 11th Edition (Uniform System of Accounts for the Lodging Industry)",
  "Long-run FF&E reserve floor recommended for full-service / boutique hotels, expressed as % of gross revenue. Drives the adequacy badge on the Reserves & Brand Costs panel.",
  "https://www.ahla.com/usali",
);

export const MODEL_CONSTANTS_REGISTRY: Record<string, ConstantRegistryEntry> = {
  depreciationYears: {
    key: "depreciationYears",
    label: depreciationYearsMeta.fieldName,
    locality: "country",
    meta: depreciationYearsMeta,
    specialistOwned: true,
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
    specialistOwned: true,
    factoryValue: () => DAYS_PER_MONTH,
  },
  taxRate: {
    key: "taxRate",
    label: taxRateMeta.fieldName,
    locality: "country+state",
    meta: taxRateMeta,
    specialistOwned: true,
    factoryValue: (country, subdivision) => {
      if (country === "United States" && subdivision) {
        const st: UsStateDefaults | undefined = US_STATE_DEFAULTS[subdivision];
        if (st) return st.taxRate;
      }
      if (!country) return COUNTRY_DEFAULTS["United States"]!.taxRate;
      const def: CountryDefaults | undefined = COUNTRY_DEFAULTS[country];
      return def?.taxRate ?? COUNTRY_DEFAULTS["United States"]!.taxRate;
    },
  },
  costRateTaxes: {
    key: "costRateTaxes",
    label: costRateTaxesMeta.fieldName,
    locality: "country+state",
    meta: costRateTaxesMeta,
    specialistOwned: true,
    factoryValue: (country, subdivision) => {
      if (country === "United States" && subdivision) {
        const st: UsStateDefaults | undefined = US_STATE_DEFAULTS[subdivision];
        if (st) return st.costRateTaxes;
      }
      if (!country) return COUNTRY_DEFAULTS["United States"]!.costRateTaxes;
      const def: CountryDefaults | undefined = COUNTRY_DEFAULTS[country];
      return def?.costRateTaxes ?? COUNTRY_DEFAULTS["United States"]!.costRateTaxes;
    },
  },
  countryRiskPremium: {
    key: "countryRiskPremium",
    label: countryRiskPremiumMeta.fieldName,
    locality: "country",
    meta: countryRiskPremiumMeta,
    specialistOwned: true,
    factoryValue: (country) => {
      if (!country) return COUNTRY_DEFAULTS["United States"]!.countryRiskPremium;
      const def: CountryDefaults | undefined = COUNTRY_DEFAULTS[country];
      return def?.countryRiskPremium ?? COUNTRY_DEFAULTS["United States"]!.countryRiskPremium;
    },
  },
  inflationRate: {
    key: "inflationRate",
    label: inflationRateMeta.fieldName,
    locality: "country",
    meta: inflationRateMeta,
    specialistOwned: true,
    factoryValue: (country) => {
      if (!country) return COUNTRY_DEFAULTS["United States"]!.inflationRate;
      const def: CountryDefaults | undefined = COUNTRY_DEFAULTS[country];
      return def?.inflationRate ?? COUNTRY_DEFAULTS["United States"]!.inflationRate;
    },
  },
  capitalGainsRate: {
    key: "capitalGainsRate",
    label: capitalGainsRateMeta.fieldName,
    locality: "country",
    meta: capitalGainsRateMeta,
    specialistOwned: true,
    factoryValue: (country) => {
      if (!country) return COUNTRY_DEFAULTS["United States"]!.capitalGainsRate;
      const def: CountryDefaults | undefined = COUNTRY_DEFAULTS[country];
      return def?.capitalGainsRate ?? COUNTRY_DEFAULTS["United States"]!.capitalGainsRate;
    },
  },
  ffeReserveBenchmarkUsali: {
    key: "ffeReserveBenchmarkUsali",
    label: ffeReserveBenchmarkUsaliMeta.fieldName,
    locality: "universal",
    meta: ffeReserveBenchmarkUsaliMeta,
    specialistOwned: true,
    factoryValue: () => USALI_FFE_RESERVE_BENCHMARK,
  },
};

export const REGISTERED_CONSTANT_KEYS = Object.keys(MODEL_CONSTANTS_REGISTRY);

/**
 * Display unit for a constant. Constants are rendered to admins as
 * read-only cards; the unit suffix (`%`, `years`, `days`) clarifies
 * what the bare numeric value means without surfacing a free-form
 * "unit" column in the registry. Centralised here so the admin tab
 * and any future renderers stay consistent.
 */
export type ConstantUnit = "percent" | "years" | "days" | "ratio";

const CONSTANT_UNIT_BY_KEY: Record<string, ConstantUnit> = {
  taxRate: "percent",
  capitalGainsRate: "percent",
  costRateTaxes: "percent",
  inflationRate: "percent",
  countryRiskPremium: "percent",
  depreciationYears: "years",
  daysPerMonth: "days",
  ffeReserveBenchmarkUsali: "percent",
};

export function getConstantUnit(key: string): ConstantUnit {
  return CONSTANT_UNIT_BY_KEY[key] ?? "ratio";
}

export function hasStateOverlay(key: string, country: string | null | undefined): boolean {
  const entry = MODEL_CONSTANTS_REGISTRY[key];
  return !!entry && entry.locality === "country+state" && country === "United States";
}

/**
 * Compile-time-checked union of every key currently registered in
 * `MODEL_CONSTANTS_REGISTRY`. New keys added to the registry literal are
 * picked up automatically. Audit #319 R4 — typed accessors.
 */
export type RegisteredConstantKey = keyof typeof MODEL_CONSTANTS_REGISTRY;

export function getFactoryValue(
  key: RegisteredConstantKey,
  country?: string | null,
  subdivision?: string | null,
): unknown {
  const entry = MODEL_CONSTANTS_REGISTRY[key];
  if (!entry) return undefined;
  return entry.factoryValue(country, subdivision);
}

/**
 * Typed factory accessor. All seven registered keys today resolve to numbers
 * (`taxRate`, `depreciationYears`, `inflationRate`, `costRateTaxes`,
 * `countryRiskPremium`, `capitalGainsRate`, `daysPerMonth`). This wrapper
 * removes the `unknown`-cast noise from call sites and throws fast if a
 * future non-numeric key is added without updating consumers.
 *
 * Audit Task #319 R4 — preferred read path. Direct imports of the legacy
 * `DEFAULT_*` exports are now `@deprecated`.
 */
export function getFactoryNumber(
  key: RegisteredConstantKey,
  country?: string | null,
  subdivision?: string | null,
): number {
  const value = getFactoryValue(key, country, subdivision);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `getFactoryNumber: registry key "${key}" returned non-numeric value (got ${typeof value})`,
    );
  }
  return value;
}

/**
 * Provenance of a registry-resolved value. Renderers (badges, tooltips,
 * explainers) use this to tell users *why* a property's tax / inflation /
 * depreciation number is what it is, without forcing every surface to
 * re-implement the country / state / override cascade.
 *
 * Cascade order (highest priority first):
 *   1. `propertyOverride` — value stored on the property row itself.
 *   2. `stateOverlay`     — US state row in `US_STATE_DEFAULTS` (only for
 *                            `country+state` keys with country = "United States").
 *   3. `countryDefault`   — country row in `COUNTRY_DEFAULTS` (any country
 *                            other than the United States itself).
 *   4. `baseline`         — universal fallback. For country/country+state
 *                            keys this is the United States row in
 *                            `COUNTRY_DEFAULTS`; for `universal` keys it is
 *                            the single global value.
 */
export type FactorySourceKind =
  | "propertyOverride"
  | "stateOverlay"
  | "countryDefault"
  | "baseline";

export interface FactorySource {
  /** Numeric value resolved from the cascade (decimal for percent keys). */
  value: number;
  /** Where the value came from. */
  kind: FactorySourceKind;
  /** Short user-facing label, e.g. `"1.8% — Texas overlay"`. */
  label: string;
  /** Country used for the resolution (or "United States" if none was given). */
  country: string;
  /** Subdivision used for the resolution (only meaningful for state overlays). */
  subdivision: string | null;
}

function formatFactoryValue(value: number, unit: ConstantUnit): string {
  switch (unit) {
    case "percent": {
      // 0.0125 → "1.25%", 0.012 → "1.2%", 0.018 → "1.8%".
      // toFixed(2) then parseFloat strips trailing zeros while keeping
      // the meaningful decimal for sub-1% rates like Costa Rica's 0.25%.
      const pct = value * 100;
      return `${parseFloat(pct.toFixed(2))}%`;
    }
    case "years":
      return `${value} years`;
    case "days":
      return `${value} days`;
    case "ratio":
    default:
      return `${value}`;
  }
}

/**
 * Describe where a registry-resolved value came from. See `FactorySource`
 * for the cascade order. The label is meant to be shown verbatim in a small
 * badge or tooltip ("1.2% — United States baseline" / "1.8% — Texas overlay" /
 * "0.25% — Costa Rica country default" / "1.5% — property override") so
 * Property Edit, the Yearly Income Statement explainer, and the PP&E /
 * Cost-Basis Schedule all describe the same value the same way.
 *
 * Pass `propertyOverride` whenever the property row stores its own copy of
 * the value — for `costRateTaxes` that is `property.costRateTaxes`. When it
 * is `null` / `undefined`, the cascade falls through to country / state /
 * baseline as appropriate.
 */
export function describeFactorySource(
  key: RegisteredConstantKey,
  country?: string | null,
  subdivision?: string | null,
  propertyOverride?: number | null,
): FactorySource {
  const entry = MODEL_CONSTANTS_REGISTRY[key];
  if (!entry) {
    throw new Error(`describeFactorySource: unknown registry key "${key}"`);
  }

  const unit = getConstantUnit(key);
  const fmt = (v: number) => formatFactoryValue(v, unit);
  const resolvedCountry = country ?? "United States";
  const resolvedSubdivision = subdivision ?? null;

  // 1. Property override wins over every locality default.
  if (propertyOverride != null && Number.isFinite(propertyOverride)) {
    return {
      value: propertyOverride,
      kind: "propertyOverride",
      label: `${fmt(propertyOverride)} — property override`,
      country: resolvedCountry,
      subdivision: resolvedSubdivision,
    };
  }

  // 2. US state overlay (only relevant for country+state keys).
  if (
    entry.locality === "country+state" &&
    country === "United States" &&
    subdivision
  ) {
    const stateRow = US_STATE_DEFAULTS[subdivision] as
      | (UsStateDefaults & Record<string, unknown>)
      | undefined;
    const stateValue = stateRow?.[key];
    if (typeof stateValue === "number" && Number.isFinite(stateValue)) {
      return {
        value: stateValue,
        kind: "stateOverlay",
        label: `${fmt(stateValue)} — ${subdivision} overlay`,
        country: "United States",
        subdivision,
      };
    }
  }

  // 3. Country default (skip when the country is the United States — that
  //    is the baseline, not an overlay).
  if (entry.locality !== "universal" && country && country !== "United States") {
    const countryRow = COUNTRY_DEFAULTS[country] as
      | (CountryDefaults & Record<string, unknown>)
      | undefined;
    const countryValue = countryRow?.[key];
    if (typeof countryValue === "number" && Number.isFinite(countryValue)) {
      return {
        value: countryValue,
        kind: "countryDefault",
        label: `${fmt(countryValue)} — ${country} country default`,
        country,
        subdivision: resolvedSubdivision,
      };
    }
  }

  // 4. Baseline — let the registry's own factoryValue do the final fallback
  //    (US row for country / country+state keys, the global constant for
  //    universal keys). This is the source of truth so we never drift from
  //    `getFactoryNumber`.
  const fallbackValue = entry.factoryValue(country, subdivision);
  if (typeof fallbackValue !== "number" || !Number.isFinite(fallbackValue)) {
    throw new Error(
      `describeFactorySource: registry key "${key}" returned non-numeric fallback (got ${typeof fallbackValue})`,
    );
  }

  if (entry.locality === "universal") {
    return {
      value: fallbackValue,
      kind: "baseline",
      label: `${fmt(fallbackValue)} — global baseline`,
      country: resolvedCountry,
      subdivision: resolvedSubdivision,
    };
  }

  return {
    value: fallbackValue,
    kind: "baseline",
    label: `${fmt(fallbackValue)} — United States baseline`,
    country: resolvedCountry,
    subdivision: resolvedSubdivision,
  };
}

export type { CountryDefaults, UsStateDefaults };
