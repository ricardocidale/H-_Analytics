/**
 * Integration test for the renovation hypothesis cutover (task #1406).
 *
 * Confirms that property-engine.ts stamps `propertyState` on every
 * MonthlyFinancials row using the same cutover that
 * `resolvePropertyFactsForYear` uses: every month strictly before
 * January of `plannedReopeningYear` is `as_purchased`, every month from
 * January of `plannedReopeningYear` onward is `as_improved`. When no
 * reopening year has been captured every month stays in the
 * As-Purchased configuration.
 */
import { describe, expect, it } from 'vitest';
import { generatePropertyProForma } from './property-engine';
import type { GlobalInput, PropertyInput } from '../types';

const BASE_GLOBAL: GlobalInput = {
  modelStartDate: '2024-01-01',
  inflationRate: 0.03,
  marketingRate: 0.01,
  debtAssumptions: { interestRate: 0.065, amortizationYears: 25 },
};

const BASE_PROPERTY: PropertyInput = {
  operationsStartDate: '2024-01-01',
  acquisitionDate: '2024-01-01',
  roomCount: 24,
  startAdr: 220,
  adrGrowthRate: 0.03,
  startOccupancy: 0.55,
  maxOccupancy: 0.70,
  occupancyRampMonths: 12,
  occupancyGrowthStep: 0.01,
  purchasePrice: 6_500_000,
  type: 'Hotel',
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

describe('property-engine renovation cutover (task #1406)', () => {
  it('stamps propertyState=as_purchased before reopening and as_improved from January of plannedReopeningYear', () => {
    const property: PropertyInput = {
      ...BASE_PROPERTY,
      fbVenues: 1,
      fbSeats: 30,
      eventSpaceSqft: 0,
      totalBuildingSqft: 9000,
      fbVenuesImproved: 2,
      fbSeatsImproved: 90,
      eventSpaceSqftImproved: 1200,
      totalBuildingSqftImproved: 12500,
      plannedReopeningYear: 2027,
      descriptionPurchased: 'Tired roadside motor inn — 24 keys.',
      descriptionImproved: 'Reborn boutique lodge with chef-driven tavern.',
    };
    // 4 years × 12 months = 48 months from 2024-01 through 2027-12.
    const monthly = generatePropertyProForma(property, BASE_GLOBAL, 48);

    // Sanity: every row carries a state stamp.
    for (const m of monthly) {
      expect(m.propertyState === 'as_purchased' || m.propertyState === 'as_improved').toBe(true);
    }

    // 2024, 2025, 2026 rows must all be as_purchased; 2027 rows must all
    // be as_improved.
    for (const m of monthly) {
      const year = new Date(m.date).getFullYear();
      if (year < 2027) {
        expect(m.propertyState, `month ${m.date} should be as_purchased`).toBe('as_purchased');
      } else {
        expect(m.propertyState, `month ${m.date} should be as_improved`).toBe('as_improved');
      }
    }

    // The exact cutover boundary: December 2026 is As-Purchased, January
    // 2027 is As-Improved.
    const dec2026 = monthly.find(m => new Date(m.date).getFullYear() === 2026 && new Date(m.date).getMonth() === 11);
    const jan2027 = monthly.find(m => new Date(m.date).getFullYear() === 2027 && new Date(m.date).getMonth() === 0);
    expect(dec2026?.propertyState).toBe('as_purchased');
    expect(jan2027?.propertyState).toBe('as_improved');
  });

  it('stays in as_purchased for the entire horizon when plannedReopeningYear is null', () => {
    const property: PropertyInput = {
      ...BASE_PROPERTY,
      fbVenues: 1,
      fbSeats: 30,
      // No plannedReopeningYear — operator has not captured a renovation
      // hypothesis yet. The engine must keep every month in As-Purchased.
      plannedReopeningYear: null,
    };
    const monthly = generatePropertyProForma(property, BASE_GLOBAL, 36);
    expect(monthly.length).toBe(36);
    for (const m of monthly) {
      expect(m.propertyState).toBe('as_purchased');
    }
  });
});
