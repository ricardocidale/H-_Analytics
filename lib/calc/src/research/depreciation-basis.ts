/**
 * depreciation-basis.ts — Deterministic Depreciation Basis Calculator
 *
 * Computes the IRS-compliant depreciation basis, monthly/annual depreciation,
 * and land value allocation for a given property. Used by AI research to
 * validate land value recommendations against exact tax math.
 *
 * IRS Publication 946 / IRC §168(e)(2)(A):
 *   - Residential rental property                     → 27.5 years SL
 *   - Nonresidential real property (incl. hotels)     → 39 years SL
 *
 * Audit Task #966 — depreciable life now branches on (country, property type).
 * Ownership decision: the lookup lives LOCAL to this file rather than being
 * pushed into `model-constants-registry`, because the registry's
 * `depreciationYears` factory is keyed only by country and is consumed by
 * other code paths that have no notion of property type. Adding a property
 * dimension at the registry level would require changing every consumer.
 * Keeping the type-aware lookup here means the registry value continues to
 * serve as the country-level fallback, and only this calculator (which has
 * the property record in scope) does the type branching.
 */
import { roundCents } from "../shared/utils.js";
import {
  RESEARCH_TAX_RATE_25_PCT,
  RESEARCH_TAX_RATE_30_PCT,
  MONTHS_PER_YEAR,
  DEPRECIATION_YEARS_US_RESIDENTIAL,
  DEPRECIATION_YEARS_US_NON_RESIDENTIAL,
} from "@shared/constants";
import { getFactoryNumber } from "@shared/model-constants-registry";

/**
 * IRS Publication 946 categorises buildings into two depreciable classes:
 * residential rental (27.5 yr) and nonresidential real property (39 yr).
 * Hotels are nonresidential. Vacation rentals (single-family / condo
 * rentals classed as "dwelling units" where >80% of revenue is from
 * rentals of <30 days are *also* nonresidential, but the IRS
 * residential-vs-nonresidential test for short-term rentals is
 * fact-specific; we treat short-term-rental business models as
 * residential by default since that matches the conservative tax
 * position H+ Analytics has historically used. Override via the
 * explicit `depreciation_years` input when the property's accountant
 * has classified it differently.
 */
type DepreciableCategory = "residential" | "non_residential";

/**
 * (country, category) → depreciable life in years. Lookup is keyed by
 * canonical category — callers pass property_type as a free-form string
 * and we normalize via `categorizeProperty` below. Unknown keys fall
 * through to the country-level registry value (existing behavior).
 *
 * Sources:
 *   - US: IRS Pub 946 (27.5 / 39 years)
 *   - Other countries: see `lib/shared/src/countryDefaults.ts` —
 *     populated as country-level entries today (no residential split).
 *     A non-US residential split can land as a follow-up; until then
 *     non-US lookups fall through to the registry country value, which
 *     is the existing pre-#966 behavior and is therefore safe.
 */
const DEPRECIATION_YEARS_BY_COUNTRY_TYPE: Record<
  string,
  Partial<Record<DepreciableCategory, number>>
> = {
  "United States": {
    residential: DEPRECIATION_YEARS_US_RESIDENTIAL,
    non_residential: DEPRECIATION_YEARS_US_NON_RESIDENTIAL,
  },
};

/**
 * Map a free-form `property_type` (BusinessModel, HospitalityType, or the
 * raw IRS category) onto the canonical `DepreciableCategory`. Returns
 * `null` when the input is missing or unrecognized — caller falls back to
 * the country-level registry value.
 */
function categorizeProperty(propertyType: string | undefined): DepreciableCategory | null {
  if (!propertyType) return null;
  const normalized = propertyType.toLowerCase().trim();
  // Direct IRS categories.
  if (normalized === "residential") return "residential";
  if (normalized === "non_residential" || normalized === "nonresidential" ||
      normalized === "commercial") return "non_residential";
  // Business models / hospitality types defined in
  // `lib/db/src/schema/properties.ts`.
  if (normalized === "vrbo" || normalized === "vrbo_owner_managed") return "residential";
  if (normalized === "hotel" || normalized === "lodge" ||
      normalized === "resort" || normalized === "boutique_hotel" ||
      normalized === "business_hotel" || normalized === "wellness_resort" ||
      normalized === "conference_hotel" || normalized === "extended_stay") {
    return "non_residential";
  }
  return null;
}

interface DepreciationBasisInput {
  purchase_price: number;
  land_value_pct: number; // 0-1 decimal (e.g., 0.20 for 20%)
  building_improvements?: number;
  depreciation_years?: number;
  /**
   * Property classification used to pick the IRS depreciable life.
   * Accepts either a canonical category ("residential" | "commercial" |
   * "non_residential") or a BusinessModel / HospitalityType string from
   * `lib/db/src/schema/properties.ts` (e.g. "hotel", "vrbo", "lodge").
   * Unknown values fall back to the country-level registry value.
   */
  property_type?: string;
  /**
   * Country name (matches `COUNTRY_DEFAULTS` keys, e.g. "United States").
   * Used to pick the per-country depreciation schedule. When omitted the
   * registry falls back to the United States baseline, which is the
   * pre-#966 behavior.
   */
  country?: string;
}

interface DepreciationBasisOutput {
  purchase_price: number;
  land_value_pct: number;
  land_value_dollars: number;
  building_value: number;
  building_improvements: number;
  depreciable_basis: number;
  annual_depreciation: number;
  monthly_depreciation: number;
  depreciation_years: number;
  tax_shield_at_25pct: number;
  tax_shield_at_30pct: number;
  effective_cost_reduction_pct: number;
}

export function computeDepreciationBasis(input: DepreciationBasisInput): DepreciationBasisOutput {
  const {
    purchase_price,
    land_value_pct,
    building_improvements = 0,
  } = input;

  // Audit Task #966 — resolution order:
  //   1. explicit `depreciation_years` input wins (caller knows best).
  //   2. (country, property-type-category) lookup for the IRS split
  //      (US residential 27.5 / non-residential 39).
  //   3. country-level registry value (`depreciationYears`) — pre-#966
  //      fallback. Aligned with the hold-vs-sell missing-input policy
  //      (#965): default rather than fail loud, since callers may not
  //      have property_type / country in scope yet.
  const country = input.country ?? "United States";
  const category = categorizeProperty(input.property_type);
  const lookupYears = category
    ? DEPRECIATION_YEARS_BY_COUNTRY_TYPE[country]?.[category]
    : undefined;
  const depYears =
    input.depreciation_years
    ?? lookupYears
    ?? getFactoryNumber('depreciationYears', country);
  const landValue = roundCents(purchase_price * land_value_pct);
  const buildingValue = roundCents(purchase_price * (1 - land_value_pct));
  const depreciableBasis = roundCents(buildingValue + building_improvements);
  const annualDepreciation = roundCents(depreciableBasis / depYears);
  const monthlyDepreciation = roundCents(depreciableBasis / depYears / MONTHS_PER_YEAR);

  // Tax shields show the annual tax savings from depreciation
  const taxShield25 = roundCents(annualDepreciation * RESEARCH_TAX_RATE_25_PCT);
  const taxShield30 = roundCents(annualDepreciation * RESEARCH_TAX_RATE_30_PCT);

  // Effective cost reduction: how much depreciation reduces effective annual cost as % of purchase price
  const effectiveCostReduction = purchase_price > 0
    ? roundCents((annualDepreciation / purchase_price) * 100)
    : 0;

  return {
    purchase_price,
    land_value_pct,
    land_value_dollars: landValue,
    building_value: buildingValue,
    building_improvements,
    depreciable_basis: depreciableBasis,
    annual_depreciation: annualDepreciation,
    monthly_depreciation: monthlyDepreciation,
    depreciation_years: depYears,
    tax_shield_at_25pct: taxShield25,
    tax_shield_at_30pct: taxShield30,
    effective_cost_reduction_pct: effectiveCostReduction,
  };
}
