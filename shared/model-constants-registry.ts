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
import { COUNTRY_DEFAULTS, US_STATE_DEFAULTS, type CountryDefaults, type UsStateDefaults } from "./countryDefaults";

export type ConstantLocality = "universal" | "country" | "country+state";

export interface ConstantRegistryEntry {
  key: string;
  label: string;
  locality: ConstantLocality;
  meta: GovernedFieldMeta;
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
  taxRate: {
    key: "taxRate",
    label: taxRateMeta.fieldName,
    locality: "country+state",
    meta: taxRateMeta,
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
    factoryValue: (country) => {
      if (!country) return COUNTRY_DEFAULTS["United States"]!.capitalGainsRate;
      const def: CountryDefaults | undefined = COUNTRY_DEFAULTS[country];
      return def?.capitalGainsRate ?? COUNTRY_DEFAULTS["United States"]!.capitalGainsRate;
    },
  },
};

export const REGISTERED_CONSTANT_KEYS = Object.keys(MODEL_CONSTANTS_REGISTRY);

export function hasStateOverlay(key: string, country: string | null | undefined): boolean {
  const entry = MODEL_CONSTANTS_REGISTRY[key];
  return !!entry && entry.locality === "country+state" && country === "United States";
}

export function getFactoryValue(
  key: string,
  country?: string | null,
  subdivision?: string | null,
): unknown {
  const entry = MODEL_CONSTANTS_REGISTRY[key];
  if (!entry) return undefined;
  return entry.factoryValue(country, subdivision);
}

export type { CountryDefaults, UsStateDefaults };
