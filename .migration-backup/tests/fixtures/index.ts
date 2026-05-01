import { DEFAULT_PROPERTY_INFLATION_RATE } from "../../shared/constants";

/**
 * Shared test fixtures — single source of truth for baseProperty and baseGlobal.
 *
 * 10-room Full Equity property with $200 ADR, 60% starting occupancy.
 * Matches the canonical golden-scenario test in tests/engine/proforma-golden.test.ts.
 */

export const baseProperty = {
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
  type: "Full Equity" as const,
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
  revShareEvents: 0.43,
  revShareFB: 0.22,
  revShareOther: 0.07,
  cateringBoostPercent: 0.30,
};

export const baseGlobal = {
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

export type BaseProperty = typeof baseProperty;
export type BaseGlobal = typeof baseGlobal;

export function makeProperty(overrides?: Partial<BaseProperty>): BaseProperty {
  return { ...baseProperty, ...overrides };
}

export function makeGlobal(overrides?: Partial<BaseGlobal>): BaseGlobal {
  return { ...baseGlobal, ...overrides };
}

export const financedProperty = makeProperty({
  type: "Financed",
  acquisitionLTV: 0.60,
  acquisitionInterestRate: 0.08,
  acquisitionTermYears: 25,
} as Partial<BaseProperty>);

// Re-export typed factories for new tests
export { makePropertyInput, makeGlobalInput, makeFinancedProperty, makeLuxuryProperty } from "./factories";
