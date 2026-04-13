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

import { getCountryDefaults, getUsStateDefaults } from '@shared/countryDefaults';
import { BUSINESS_MODEL_DEFAULTS, type BusinessModelType } from '@shared/constants-business-models';
import {
  DEFAULT_ADR_GROWTH_RATE,
  DEFAULT_MAX_OCCUPANCY,
  DEPRECIATION_YEARS,
} from '@shared/constants';

// ── Quality tier ADR brackets ──────────────────────────────────────────────
const QUALITY_TIER_ADR: Record<string, { min: number; max: number; default: number }> = {
  "Luxury":          { min: 350, max: 500, default: 400 },
  "Upper Upscale":   { min: 250, max: 400, default: 300 },
  "Upscale":         { min: 180, max: 300, default: 220 },
  "Upper Midscale":  { min: 130, max: 200, default: 160 },
  "Midscale":        { min: 90,  max: 150, default: 120 },
  "Economy":         { min: 60,  max: 100, default: 80 },
};

// ── Quality tier occupancy brackets ────────────────────────────────────────
const QUALITY_TIER_OCCUPANCY: Record<string, { min: number; max: number; default: number }> = {
  "Luxury":          { min: 0.65, max: 0.75, default: 0.70 },
  "Upper Upscale":   { min: 0.65, max: 0.75, default: 0.70 },
  "Upscale":         { min: 0.70, max: 0.80, default: 0.75 },
  "Upper Midscale":  { min: 0.70, max: 0.80, default: 0.75 },
  "Midscale":        { min: 0.60, max: 0.70, default: 0.65 },
  "Economy":         { min: 0.60, max: 0.70, default: 0.65 },
};

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
  let incomeTaxRate = 0.25; // fallback
  let depreciationYears = DEPRECIATION_YEARS;
  let propertyTaxRate = modelDefaults.costRateTaxes;

  const countryDef = getCountryDefaults(country);
  if (countryDef) {
    incomeTaxRate = countryDef.taxRate;
    depreciationYears = countryDef.depreciationYears;
    propertyTaxRate = countryDef.costRateTaxes;
    sources.incomeTaxRate = `country:${country}`;
    sources.depreciationYears = `country:${country}:${countryDef.depreciationAuthority}`;
    sources.propertyTaxRate = `country:${country}`;
  } else {
    sources.incomeTaxRate = "fallback:constants";
    sources.depreciationYears = "fallback:constants";
    sources.propertyTaxRate = `model:${bm}`;
  }

  // US state override (refines federal tax + property tax)
  if (country === "United States" && stateProvince) {
    const stateDef = getUsStateDefaults(stateProvince);
    if (stateDef) {
      incomeTaxRate = stateDef.taxRate;
      propertyTaxRate = stateDef.costRateTaxes;
      sources.incomeTaxRate = `state:${stateProvince}`;
      sources.propertyTaxRate = `state:${stateProvince}`;
    }
  }

  // ── 3. Quality tier ADR & occupancy ──────────────────────────────────────
  const tierAdr = QUALITY_TIER_ADR[qualityTier];
  const startAdr = tierAdr ? tierAdr.default : 220; // fallback to Upscale
  sources.startAdr = tierAdr
    ? `tier:${qualityTier}:range_${tierAdr.min}-${tierAdr.max}`
    : "fallback:upscale";

  const tierOcc = QUALITY_TIER_OCCUPANCY[qualityTier];
  const startOccupancy = tierOcc ? tierOcc.default : 0.70;
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
  if (roomCount < 10) {
    scaleAdjustment = 0.05;
    scaleSource = "scale:<10_rooms:+5pct";
  } else if (roomCount < 20) {
    scaleAdjustment = 0.02;
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
