/**
 * default-resolver — Computes intelligent property defaults based on quality tier,
 * business model, country, and room count.
 *
 * PURE function — no I/O, no database access. Uses only constants and arguments.
 * Resolves defaults using a layered approach:
 *   1. Business model defaults (hotel/lodge/vrbo)
 *   2. Country defaults (tax rate, depreciation, property tax)
 *   3. Quality tier (ADR and occupancy brackets)
 *   4. Scale adjustment (small property cost premium)
 */

import { getCountryDefaults, getUsStateDefaults } from '@norfolk/shared/countryDefaults';
import { BUSINESS_MODEL_DEFAULTS, type BusinessModelType } from '@norfolk/shared/constants-business-models';
import {
  DEFAULT_ADR_GROWTH_RATE,
  DEFAULT_MAX_OCCUPANCY,
  DEFAULT_PROPERTY_INCOME_TAX_RATE,
  QUALITY_TIER_OCCUPANCY_BRACKETS,
  DEFAULT_FALLBACK_OCCUPANCY,
  SCALE_THRESHOLD_SMALL_ROOMS,
  SCALE_THRESHOLD_MEDIUM_ROOMS,
  SCALE_ADJUSTMENT_SMALL_PROPERTY,
  SCALE_ADJUSTMENT_MEDIUM_PROPERTY,
} from '@norfolk/shared/constants';
import { getFactoryNumber } from '@norfolk/shared/model-constants-registry';

// ── Quality tier ADR brackets ──────────────────────────────────────────────
const QUALITY_TIER_ADR: Record<string, { min: number; max: number; default: number }> = {
  "Luxury":          { min: 350, max: 500, default: 400 },
  "Upper Upscale":   { min: 250, max: 400, default: 300 },
  "Upscale":         { min: 180, max: 300, default: 220 },
  "Upper Midscale":  { min: 130, max: 200, default: 160 },
  "Midscale":        { min: 90,  max: 150, default: 120 },
  "Economy":         { min: 60,  max: 100, default: 80 },
};

// ── Quality tier occupancy brackets — sourced from constants-benchmarks.ts ──
const QUALITY_TIER_OCCUPANCY = QUALITY_TIER_OCCUPANCY_BRACKETS;

export interface PropertyDefaults {
  // Revenue
  startAdr: number;
  adrGrowthRate: number;
  startOccupancy: number;
  maxOccupancy: number;
  revShareFB: number;
  revShareEvents: number;
  revShareOther: number;

  // Operating costs
  costRateRooms: number;
  costRateFB: number;
  costRateEvents: number;
  costRateAdmin: number;
  costRateMarketing: number;
  costRatePropertyOps: number;
  costRateUtilities: number;
  costRateIT: number;
  costRateFFE: number;

  // Capital structure
  depreciationYears: number;
  incomeTaxRate: number;
  propertyTaxRate: number;

  // Management fees
  baseFeePercent: number;
  incentiveFeePercent: number;

  // Metadata
  sources: Record<string, string>;
}

/**
 * Compute intelligent property defaults from quality tier, business model,
 * country, room count, and optional US state.
 *
 * Layer order:
 *   1. Business model base (hotel/lodge/vrbo cost rates and revenue shares)
 *   2. Country overrides (tax, depreciation, property tax)
 *   3. Quality tier overrides (ADR, occupancy)
 *   4. Scale adjustment (cost premium for small properties)
 */
export function computePropertyDefaults(
  qualityTier: string,
  businessModel: string,
  country: string,
  roomCount: number,
  stateProvince?: string,
): PropertyDefaults {
  const sources: Record<string, string> = {};

  // ── 1. Business model defaults ───────────────────────────────────────────
  const bm = (businessModel as BusinessModelType) || 'hotel';
  const modelDefaults = BUSINESS_MODEL_DEFAULTS[bm] ?? BUSINESS_MODEL_DEFAULTS.hotel;

  let costRateRooms = modelDefaults.costRateRooms;
  let costRateFB = modelDefaults.costRateFB;
  let costRateEvents = modelDefaults.eventExpenseRate;
  let costRateAdmin = modelDefaults.costRateAdmin;
  let costRateMarketing = modelDefaults.costRateMarketing;
  let costRatePropertyOps = modelDefaults.costRatePropertyOps;
  let costRateUtilities = modelDefaults.costRateUtilities;
  let costRateIT = modelDefaults.costRateIT;
  let costRateFFE = modelDefaults.costRateFFE;

  sources.costRateRooms = `model:${bm}`;
  sources.costRateFB = `model:${bm}`;
  sources.costRateEvents = `model:${bm}`;
  sources.costRateAdmin = `model:${bm}`;
  sources.costRateMarketing = `model:${bm}`;
  sources.costRatePropertyOps = `model:${bm}`;
  sources.costRateUtilities = `model:${bm}`;
  sources.costRateIT = `model:${bm}`;
  sources.costRateFFE = `model:${bm}`;

  const revShareFB = modelDefaults.revShareFB;
  const revShareEvents = modelDefaults.revShareEvents;
  const revShareOther = modelDefaults.revShareOther;
  sources.revShareFB = `model:${bm}`;
  sources.revShareEvents = `model:${bm}`;
  sources.revShareOther = `model:${bm}`;

  const baseFeePercent = modelDefaults.baseMgmtFeeRate;
  const incentiveFeePercent = modelDefaults.incentiveMgmtFeeRate;
  sources.baseFeePercent = `model:${bm}`;
  sources.incentiveFeePercent = `model:${bm}`;

  // ── 2. Country defaults ──────────────────────────────────────────────────
  // Audit #319 R4: tax / property-tax / depreciation come through the
  // model-constants registry so admin/Specialist overrides are honored
  // by every consumer. The registry's country/state resolvers read from
  // COUNTRY_DEFAULTS internally, so factory values are unchanged.
  const countryDef = getCountryDefaults(country);
  const stateDef =
    country === "United States" && stateProvince
      ? getUsStateDefaults(stateProvince)
      : undefined;

  // Unknown-country fallbacks intentionally short-circuit the registry: the
  // registry would silently return the US baseline, but for an unknown
  // country we prefer an explicit "no data" stance (constants fallback for
  // tax/depreciation, business-model rate for property tax) so nothing
  // pretends to be locality-aware when it isn't.
  let incomeTaxRate: number;
  let depreciationYears: number;
  let propertyTaxRate: number;

  if (countryDef) {
    incomeTaxRate = stateDef
      ? getFactoryNumber('taxRate', country, stateProvince)
      : getFactoryNumber('taxRate', country);
    depreciationYears = getFactoryNumber('depreciationYears', country, stateProvince);
    propertyTaxRate = stateDef
      ? getFactoryNumber('costRateTaxes', country, stateProvince)
      : getFactoryNumber('costRateTaxes', country);

    sources.incomeTaxRate = stateDef
      ? `registry:taxRate:state:${stateProvince}`
      : `registry:taxRate:country:${country}`;
    sources.depreciationYears = `registry:depreciationYears:country:${country}:${countryDef.depreciationAuthority}`;
    sources.propertyTaxRate = stateDef
      ? `registry:costRateTaxes:state:${stateProvince}`
      : `registry:costRateTaxes:country:${country}`;
  } else {
    incomeTaxRate = DEFAULT_PROPERTY_INCOME_TAX_RATE;
    depreciationYears = getFactoryNumber('depreciationYears');
    propertyTaxRate = modelDefaults.costRateTaxes;
    sources.incomeTaxRate = "fallback:constants";
    sources.depreciationYears = "fallback:constants";
    sources.propertyTaxRate = `model:${bm}`;
  }

  // ── 3. Quality tier ADR & occupancy ──────────────────────────────────────
  const tierAdr = QUALITY_TIER_ADR[qualityTier];
  const startAdr = tierAdr ? tierAdr.default : 220; // fallback to Upscale
  sources.startAdr = tierAdr
    ? `tier:${qualityTier}:range_${tierAdr.min}-${tierAdr.max}`
    : "fallback:upscale";

  const tierOcc = QUALITY_TIER_OCCUPANCY[qualityTier];
  const startOccupancy = tierOcc ? tierOcc.default : DEFAULT_FALLBACK_OCCUPANCY;
  sources.startOccupancy = tierOcc
    ? `tier:${qualityTier}:range_${tierOcc.min * 100}-${tierOcc.max * 100}pct`
    : "fallback:70pct";

  const adrGrowthRate = DEFAULT_ADR_GROWTH_RATE;
  sources.adrGrowthRate = "constant:DEFAULT_ADR_GROWTH_RATE";

  const maxOccupancy = DEFAULT_MAX_OCCUPANCY;
  sources.maxOccupancy = "constant:DEFAULT_MAX_OCCUPANCY";

  // ── 4. Scale adjustment (small property cost premium) ────────────────────
  let scaleAdjustment = 0;
  let scaleSource = "scale:20+_rooms";
  if (roomCount < SCALE_THRESHOLD_SMALL_ROOMS) {
    scaleAdjustment = SCALE_ADJUSTMENT_SMALL_PROPERTY;
    scaleSource = "scale:<10_rooms:+5pct";
  } else if (roomCount < SCALE_THRESHOLD_MEDIUM_ROOMS) {
    scaleAdjustment = SCALE_ADJUSTMENT_MEDIUM_PROPERTY;
    scaleSource = "scale:10-19_rooms:+2pct";
  }

  if (scaleAdjustment > 0) {
    costRateRooms += scaleAdjustment;
    costRateFB += scaleAdjustment;
    costRateEvents += scaleAdjustment;
    costRateAdmin += scaleAdjustment;
    costRateMarketing += scaleAdjustment;
    costRatePropertyOps += scaleAdjustment;
    costRateUtilities += scaleAdjustment;
    costRateIT += scaleAdjustment;
    costRateFFE += scaleAdjustment;

    // Update sources to reflect scale adjustment
    for (const key of [
      'costRateRooms', 'costRateFB', 'costRateEvents', 'costRateAdmin',
      'costRateMarketing', 'costRatePropertyOps', 'costRateUtilities',
      'costRateIT', 'costRateFFE',
    ]) {
      sources[key] = `${sources[key]}+${scaleSource}`;
    }
  }

  return {
    startAdr,
    adrGrowthRate,
    startOccupancy,
    maxOccupancy,
    revShareFB,
    revShareEvents,
    revShareOther,
    costRateRooms,
    costRateFB,
    costRateEvents,
    costRateAdmin,
    costRateMarketing,
    costRatePropertyOps,
    costRateUtilities,
    costRateIT,
    costRateFFE,
    depreciationYears,
    incomeTaxRate,
    propertyTaxRate,
    baseFeePercent,
    incentiveFeePercent,
    sources,
  };
}
