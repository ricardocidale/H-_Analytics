/**
 * Typed test fixture factories.
 *
 * These produce fully-typed PropertyInput and GlobalInput objects
 * with sensible defaults for every required field. Use spread overrides
 * to customize for specific test scenarios.
 *
 * Usage:
 *   const prop = makePropertyInput({ startAdr: 300, roomCount: 20 });
 *   const global = makeGlobalInput({ projectionYears: 5 });
 *   const result = generatePropertyProForma(prop, global, 24);
 *
 * No more `as any` needed.
 */

import type { PropertyInput, GlobalInput } from "../../engine/types";
import { DEFAULT_PROPERTY_INFLATION_RATE } from "../../shared/constants";

// ── Property Defaults ────────────────────────────────────────────

const PROPERTY_DEFAULTS: PropertyInput = {
  operationsStartDate: "2026-04-01",
  acquisitionDate: "2026-04-01",
  roomCount: 10,
  startAdr: 200,
  adrGrowthRate: 0.03,
  startOccupancy: 0.60,
  maxOccupancy: 0.80,
  occupancyRampMonths: 6,
  occupancyGrowthStep: 0.05,
  purchasePrice: 1_000_000,
  buildingImprovements: 0,
  landValuePercent: 0.25,
  preOpeningCosts: 0,
  operatingReserve: 0,
  type: "Full Equity",
  costRateRooms: 0.20,
  costRateFB: 0.09,
  costRateAdmin: 0.08,
  costRateMarketing: 0.01,
  costRatePropertyOps: 0.04,
  costRateUtilities: 0.05,
  costRateTaxes: 0.03,
  costRateIT: 0.005,
  costRateFFE: 0.04,
  costRateOther: 0.05,
  costRateInsurance: 0.015,
  revShareEvents: 0.43,
  revShareFB: 0.22,
  revShareOther: 0.07,
  cateringBoostPercent: 0.30,
};

/** Create a fully-typed PropertyInput with sensible defaults. */
export function makePropertyInput(overrides?: Partial<PropertyInput>): PropertyInput {
  return { ...PROPERTY_DEFAULTS, ...overrides };
}

/** Shorthand: financed property with LTV, interest, and term. */
export function makeFinancedProperty(overrides?: Partial<PropertyInput>): PropertyInput {
  return makePropertyInput({
    type: "Financed",
    acquisitionLTV: 0.60,
    acquisitionInterestRate: 0.08,
    acquisitionTermYears: 25,
    ...overrides,
  });
}

/** Shorthand: luxury property with higher ADR and quality tier. */
export function makeLuxuryProperty(overrides?: Partial<PropertyInput>): PropertyInput {
  return makePropertyInput({
    qualityTier: "luxury",
    startAdr: 450,
    startOccupancy: 0.55,
    maxOccupancy: 0.75,
    roomCount: 8,
    ...overrides,
  });
}

// ── Global Defaults ──────────────────────────────────────────────

const GLOBAL_DEFAULTS: GlobalInput = {
  modelStartDate: "2026-04-01",
  projectionYears: 2,
  inflationRate: DEFAULT_PROPERTY_INFLATION_RATE,
  fixedCostEscalationRate: DEFAULT_PROPERTY_INFLATION_RATE,
  baseManagementFee: 0.05,
  incentiveManagementFee: 0.15,
  marketingRate: 0.05,
  debtAssumptions: {
    interestRate: 0.09,
    amortizationYears: 25,
    acqLTV: 0.75,
  },
};

/** Create a fully-typed GlobalInput with sensible defaults. */
export function makeGlobalInput(overrides?: Partial<GlobalInput>): GlobalInput {
  return { ...GLOBAL_DEFAULTS, ...overrides };
}

/** Shorthand: long projection (10 years). */
export function makeLongProjectionGlobal(overrides?: Partial<GlobalInput>): GlobalInput {
  return makeGlobalInput({ projectionYears: 10, ...overrides });
}

// ── Re-export raw defaults for backward compatibility ────────────

export { PROPERTY_DEFAULTS, GLOBAL_DEFAULTS };
