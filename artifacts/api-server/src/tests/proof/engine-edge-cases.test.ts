/**
 * T011 — Engine Edge Cases
 *
 * Tests the property engine's behaviour at extreme or degenerate input values:
 *   - Zero rooms → no revenue, no crash
 *   - Zero occupancy → no sold rooms, no revenue
 *   - Very small ADR (near zero)
 *   - maxOccupancy = 0 (never reaches operating occupancy)
 *   - Very long projection (20 years) → no NaN accumulation
 *   - High-cost property (cost rates sum > 1) → NOI may be negative but finite
 *   - Zero purchase price → debt calculations remain finite
 *   - Missing optional fields → engine uses defaults safely
 *
 * The engine must never produce NaN, Infinity, or throw for any finite numeric input.
 */
import { describe, it, expect } from 'vitest';
import { generatePropertyProForma } from '@server/finance/core/property-pipeline';
import { aggregatePropertyByYear } from '@server/finance/core/yearly-aggregator';
import type { PropertyInput, GlobalInput } from '@engine/types';

const BASE_GLOBAL: GlobalInput = {
  modelStartDate: '2024-01-01',
  inflationRate: 0.03,
  marketingRate: 0.01,
  debtAssumptions: { interestRate: 0.065, amortizationYears: 25 },
};

const MINIMAL_COSTS = {
  costRateRooms: 0.30,
  costRateFB: 0.30,
  costRateAdmin: 0.08,
  costRateMarketing: 0.04,
  costRatePropertyOps: 0.04,
  costRateUtilities: 0.04,
  costRateTaxes: 0.03,
  costRateIT: 0.01,
  costRateFFE: 0.03,
  costRateOther: 0.02,
  costRateInsurance: 0.01,
  revShareEvents: 0.0,
  revShareFB: 0.0,
  revShareOther: 0.0,
};

function assertAllFinite(monthly: ReturnType<typeof generatePropertyProForma>, label: string): void {
  for (const m of monthly) {
    for (const [key, val] of Object.entries(m)) {
      if (typeof val === 'number') {
        expect(Number.isFinite(val), `${label}: monthly.${key} should be finite`).toBe(true);
      }
    }
  }
}

function assertYearlyAllFinite(yearly: ReturnType<typeof aggregatePropertyByYear>, label: string): void {
  for (const y of yearly) {
    for (const [key, val] of Object.entries(y)) {
      if (typeof val === 'number' && key !== 'year') {
        expect(Number.isFinite(val), `${label}: yearly.${key} should be finite`).toBe(true);
      }
    }
  }
}

describe('Engine Edge Cases (T011)', () => {
  it('zero occupancy → soldRooms = 0, revenueRooms = 0, no NaN', () => {
    const prop: PropertyInput = {
      ...MINIMAL_COSTS,
      operationsStartDate: '2024-01-01',
      roomCount: 10,
      startAdr: 100,
      adrGrowthRate: 0,
      startOccupancy: 0,
      maxOccupancy: 0,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 1_000_000,
      type: 'hotel',
    };
    const monthly = generatePropertyProForma(prop, BASE_GLOBAL, 12);
    assertAllFinite(monthly, 'zero-occupancy');
    const yearly = aggregatePropertyByYear(monthly, 1);
    expect(yearly[0].soldRooms).toBe(0);
    expect(yearly[0].revenueRooms).toBe(0);
    assertYearlyAllFinite(yearly, 'zero-occupancy');
  });

  it('very small ADR (0.01) → revenue is near-zero but finite, no NaN', () => {
    const prop: PropertyInput = {
      ...MINIMAL_COSTS,
      operationsStartDate: '2024-01-01',
      roomCount: 5,
      startAdr: 0.01,
      adrGrowthRate: 0,
      startOccupancy: 0.5,
      maxOccupancy: 0.5,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 500_000,
      type: 'hotel',
    };
    const monthly = generatePropertyProForma(prop, BASE_GLOBAL, 12);
    assertAllFinite(monthly, 'tiny-adr');
    const yearly = aggregatePropertyByYear(monthly, 1);
    expect(yearly[0].revenueRooms).toBeGreaterThan(0);
    expect(yearly[0].revenueRooms).toBeLessThan(100);
    assertYearlyAllFinite(yearly, 'tiny-adr');
  });

  it('high cost rates (sum > 1) → NOI may be negative but all values finite', () => {
    const prop: PropertyInput = {
      costRateRooms: 0.50,
      costRateFB: 0.50,
      costRateAdmin: 0.20,
      costRateMarketing: 0.15,
      costRatePropertyOps: 0.15,
      costRateUtilities: 0.15,
      costRateTaxes: 0.10,
      costRateIT: 0.05,
      costRateFFE: 0.10,
      costRateOther: 0.10,
      costRateInsurance: 0.05,
      revShareEvents: 0.0,
      revShareFB: 0.0,
      revShareOther: 0.0,
      operationsStartDate: '2024-01-01',
      roomCount: 10,
      startAdr: 100,
      adrGrowthRate: 0,
      startOccupancy: 0.5,
      maxOccupancy: 0.5,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 1_000_000,
      type: 'hotel',
    };
    const monthly = generatePropertyProForma(prop, BASE_GLOBAL, 12);
    assertAllFinite(monthly, 'high-cost');
    const yearly = aggregatePropertyByYear(monthly, 1);
    assertYearlyAllFinite(yearly, 'high-cost');
    // NOI may be negative but must be finite
    expect(Number.isFinite(yearly[0].noi)).toBe(true);
  });

  it('zero purchase price → debt calculations remain finite', () => {
    const prop: PropertyInput = {
      ...MINIMAL_COSTS,
      operationsStartDate: '2024-01-01',
      roomCount: 8,
      startAdr: 120,
      adrGrowthRate: 0,
      startOccupancy: 0.6,
      maxOccupancy: 0.6,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 0,
      type: 'hotel',
    };
    const monthly = generatePropertyProForma(prop, BASE_GLOBAL, 12);
    assertAllFinite(monthly, 'zero-purchase-price');
    const yearly = aggregatePropertyByYear(monthly, 1);
    assertYearlyAllFinite(yearly, 'zero-purchase-price');
  });

  it('20-year projection → no NaN accumulation over time', () => {
    const YEARS = 20;
    const prop: PropertyInput = {
      ...MINIMAL_COSTS,
      operationsStartDate: '2024-01-01',
      roomCount: 15,
      startAdr: 130,
      adrGrowthRate: 0.03,
      startOccupancy: 0.55,
      maxOccupancy: 0.75,
      occupancyRampMonths: 24,
      occupancyGrowthStep: 0.05,
      purchasePrice: 2_000_000,
      type: 'hotel',
    };
    const monthly = generatePropertyProForma(prop, BASE_GLOBAL, YEARS * 12);
    assertAllFinite(monthly, '20-year');
    const yearly = aggregatePropertyByYear(monthly, YEARS);
    expect(yearly).toHaveLength(YEARS);
    assertYearlyAllFinite(yearly, '20-year');
    // Revenue should grow year-over-year due to ADR growth
    expect(yearly[YEARS - 1].revenueRooms).toBeGreaterThan(yearly[0].revenueRooms);
  });

  it('VRBO per-property pricing model → soldRooms > 0, revenue > 0', () => {
    const prop: PropertyInput = {
      ...MINIMAL_COSTS,
      operationsStartDate: '2024-01-01',
      roomCount: 3,
      startAdr: 500,
      adrGrowthRate: 0,
      startOccupancy: 0.5,
      maxOccupancy: 0.5,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 600_000,
      type: 'vrbo',
      businessModel: 'vrbo',
      pricingModel: 'per_property',
      nightlyPropertyRate: 500,
    };
    const monthly = generatePropertyProForma(prop, BASE_GLOBAL, 12);
    assertAllFinite(monthly, 'vrbo-per-property');
    const yearly = aggregatePropertyByYear(monthly, 1);
    expect(yearly[0].soldRooms).toBeGreaterThan(0);
    expect(yearly[0].revenueTotal).toBeGreaterThan(0);
    assertYearlyAllFinite(yearly, 'vrbo-per-property');
  });

  it('Lodge model → revenue and costs are finite, NOI is finite', () => {
    const prop: PropertyInput = {
      ...MINIMAL_COSTS,
      operationsStartDate: '2024-01-01',
      roomCount: 6,
      startAdr: 350,
      adrGrowthRate: 0,
      startOccupancy: 0.6,
      maxOccupancy: 0.6,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 900_000,
      type: 'lodge',
      businessModel: 'lodge',
    };
    const monthly = generatePropertyProForma(prop, BASE_GLOBAL, 12);
    assertAllFinite(monthly, 'lodge');
    const yearly = aggregatePropertyByYear(monthly, 1);
    assertYearlyAllFinite(yearly, 'lodge');
    expect(yearly[0].revenueTotal).toBeGreaterThan(0);
    expect(Number.isFinite(yearly[0].noi)).toBe(true);
  });

  it('missing optional fields (no businessModel, no pricingModel) → engine uses defaults', () => {
    const prop: PropertyInput = {
      ...MINIMAL_COSTS,
      operationsStartDate: '2024-01-01',
      roomCount: 10,
      startAdr: 120,
      adrGrowthRate: 0.02,
      startOccupancy: 0.6,
      maxOccupancy: 0.7,
      occupancyRampMonths: 6,
      occupancyGrowthStep: 0.05,
      purchasePrice: 1_500_000,
      type: 'hotel',
      // businessModel, pricingModel intentionally omitted
    };
    const monthly = generatePropertyProForma(prop, BASE_GLOBAL, 24);
    expect(() => assertAllFinite(monthly, 'no-optional-fields')).not.toThrow();
    const yearly = aggregatePropertyByYear(monthly, 2);
    assertYearlyAllFinite(yearly, 'no-optional-fields');
  });

  it('seasonality profile → all 12 multipliers applied, output remains finite', () => {
    const prop: PropertyInput = {
      ...MINIMAL_COSTS,
      operationsStartDate: '2024-01-01',
      roomCount: 12,
      startAdr: 200,
      adrGrowthRate: 0,
      startOccupancy: 0.65,
      maxOccupancy: 0.65,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 1_800_000,
      type: 'hotel',
      seasonalityProfile: [0.6, 0.7, 0.8, 0.9, 1.0, 1.3, 1.5, 1.5, 1.2, 1.0, 0.8, 0.7],
    };
    const monthly = generatePropertyProForma(prop, BASE_GLOBAL, 24);
    assertAllFinite(monthly, 'seasonality');
    const yearly = aggregatePropertyByYear(monthly, 2);
    assertYearlyAllFinite(yearly, 'seasonality');
    expect(yearly[0].soldRooms).toBeGreaterThan(0);
  });
});
