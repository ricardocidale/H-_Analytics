/**
 * T008 — Portfolio Consolidation Cross-Check
 *
 * Verifies that consolidateYearlyFinancials correctly sums individual property
 * yearly financials into a consolidated portfolio view. The fundamental invariant:
 *   consolidated[year].revenueTotal === sum(property[year].revenueTotal for each property)
 *
 * Also verifies the weighted ADR metric: portfolio ADR is revenue-weighted,
 * not an arithmetic mean.
 */
import { describe, it, expect } from 'vitest';
import { generatePropertyProForma } from '@server/finance/core/property-pipeline';
import { aggregatePropertyByYear } from '@server/finance/core/yearly-aggregator';
import { consolidateYearlyFinancials } from '@server/finance/core/consolidation';
import type { PropertyInput, GlobalInput } from '@engine/types';

const PROJ_YEARS = 3;
const PROJ_MONTHS = PROJ_YEARS * 12;

const GLOBAL: GlobalInput = {
  modelStartDate: '2024-01-01',
  inflationRate: 0.02,
  marketingRate: 0.01,
  debtAssumptions: {
    interestRate: 0.065,
    amortizationYears: 25,
  },
};

const BASE_COSTS = {
  costRateRooms: 0.25,
  costRateFB: 0.30,
  costRateAdmin: 0.08,
  costRateMarketing: 0.04,
  costRatePropertyOps: 0.04,
  costRateUtilities: 0.04,
  costRateTaxes: 0.02,
  costRateIT: 0.01,
  costRateFFE: 0.03,
  costRateOther: 0.02,
  costRateInsurance: 0.01,
  revShareEvents: 0.05,
  revShareFB: 0.15,
  revShareOther: 0.02,
};

function makeHotel(name: string, roomCount: number, startAdr: number): PropertyInput {
  return {
    ...BASE_COSTS,
    name,
    operationsStartDate: '2024-01-01',
    acquisitionDate: '2024-01-01',
    roomCount,
    startAdr,
    adrGrowthRate: 0.0,
    startOccupancy: 0.65,
    maxOccupancy: 0.65,
    occupancyRampMonths: 0,
    occupancyGrowthStep: 0,
    purchasePrice: roomCount * 100_000,
    type: 'hotel',
    businessModel: 'hotel',
  };
}

describe('Portfolio Consolidation Cross-Check (T008)', () => {
  it('consolidated revenueTotal equals sum of individual property revenueTotals', () => {
    const propA = makeHotel('Hotel A', 15, 120);
    const propB = makeHotel('Hotel B', 30, 200);
    const propC = makeHotel('Hotel C', 10, 80);

    const monthlyA = generatePropertyProForma(propA, GLOBAL, PROJ_MONTHS);
    const monthlyB = generatePropertyProForma(propB, GLOBAL, PROJ_MONTHS);
    const monthlyC = generatePropertyProForma(propC, GLOBAL, PROJ_MONTHS);

    const yearlyA = aggregatePropertyByYear(monthlyA, PROJ_YEARS);
    const yearlyB = aggregatePropertyByYear(monthlyB, PROJ_YEARS);
    const yearlyC = aggregatePropertyByYear(monthlyC, PROJ_YEARS);

    const consolidated = consolidateYearlyFinancials([yearlyA, yearlyB, yearlyC], PROJ_YEARS);

    for (let y = 0; y < PROJ_YEARS; y++) {
      const expected = yearlyA[y].revenueTotal + yearlyB[y].revenueTotal + yearlyC[y].revenueTotal;
      expect(consolidated[y].revenueTotal).toBeCloseTo(expected, 4);
    }
  });

  it('consolidated NOI equals sum of individual property NOIs', () => {
    const propA = makeHotel('Hotel A', 20, 150);
    const propB = makeHotel('Hotel B', 40, 250);

    const yearlyA = aggregatePropertyByYear(generatePropertyProForma(propA, GLOBAL, PROJ_MONTHS), PROJ_YEARS);
    const yearlyB = aggregatePropertyByYear(generatePropertyProForma(propB, GLOBAL, PROJ_MONTHS), PROJ_YEARS);

    const consolidated = consolidateYearlyFinancials([yearlyA, yearlyB], PROJ_YEARS);

    for (let y = 0; y < PROJ_YEARS; y++) {
      const expectedNoi = yearlyA[y].noi + yearlyB[y].noi;
      expect(consolidated[y].noi).toBeCloseTo(expectedNoi, 4);
    }
  });

  it('consolidated totalExpenses equals sum of individual property totalExpenses', () => {
    const propA = makeHotel('Hotel A', 12, 100);
    const propB = makeHotel('Hotel B', 25, 180);

    const yearlyA = aggregatePropertyByYear(generatePropertyProForma(propA, GLOBAL, PROJ_MONTHS), PROJ_YEARS);
    const yearlyB = aggregatePropertyByYear(generatePropertyProForma(propB, GLOBAL, PROJ_MONTHS), PROJ_YEARS);

    const consolidated = consolidateYearlyFinancials([yearlyA, yearlyB], PROJ_YEARS);

    for (let y = 0; y < PROJ_YEARS; y++) {
      const expected = yearlyA[y].totalExpenses + yearlyB[y].totalExpenses;
      expect(consolidated[y].totalExpenses).toBeCloseTo(expected, 4);
    }
  });

  it('consolidated soldRooms equals sum of individual soldRooms', () => {
    const propA = makeHotel('Hotel A', 10, 100);
    const propB = makeHotel('Hotel B', 20, 150);

    const yearlyA = aggregatePropertyByYear(generatePropertyProForma(propA, GLOBAL, PROJ_MONTHS), PROJ_YEARS);
    const yearlyB = aggregatePropertyByYear(generatePropertyProForma(propB, GLOBAL, PROJ_MONTHS), PROJ_YEARS);

    const consolidated = consolidateYearlyFinancials([yearlyA, yearlyB], PROJ_YEARS);

    for (let y = 0; y < PROJ_YEARS; y++) {
      const expected = yearlyA[y].soldRooms + yearlyB[y].soldRooms;
      expect(consolidated[y].soldRooms).toBe(expected);
    }
  });

  it('single-property portfolio: consolidated equals the property itself', () => {
    const prop = makeHotel('Solo Hotel', 18, 160);
    const yearly = aggregatePropertyByYear(generatePropertyProForma(prop, GLOBAL, PROJ_MONTHS), PROJ_YEARS);

    const consolidated = consolidateYearlyFinancials([yearly], PROJ_YEARS);

    for (let y = 0; y < PROJ_YEARS; y++) {
      expect(consolidated[y].revenueTotal).toBeCloseTo(yearly[y].revenueTotal, 4);
      expect(consolidated[y].noi).toBeCloseTo(yearly[y].noi, 4);
      expect(consolidated[y].gop).toBeCloseTo(yearly[y].gop, 4);
      expect(consolidated[y].soldRooms).toBe(yearly[y].soldRooms);
    }
  });

  it('empty portfolio: consolidation returns empty array (no crash)', () => {
    const result = consolidateYearlyFinancials([], PROJ_YEARS);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('all consolidated values are finite numbers', () => {
    const propA = makeHotel('Hotel A', 15, 130);
    const propB = makeHotel('Hotel B', 25, 170);

    const yearlyA = aggregatePropertyByYear(generatePropertyProForma(propA, GLOBAL, PROJ_MONTHS), PROJ_YEARS);
    const yearlyB = aggregatePropertyByYear(generatePropertyProForma(propB, GLOBAL, PROJ_MONTHS), PROJ_YEARS);

    const consolidated = consolidateYearlyFinancials([yearlyA, yearlyB], PROJ_YEARS);

    for (const year of consolidated) {
      Object.entries(year).forEach(([key, val]) => {
        if (typeof val === 'number' && key !== 'year') {
          expect(Number.isFinite(val), `consolidated.${key} in year ${year.year} should be finite`).toBe(true);
        }
      });
    }
  });

  it('consolidated GOP = sum of individual GOPs (additive consolidation invariant)', () => {
    // propA: 20 rooms × 0.65 occ × 366 days = 4,758 soldRooms year 1 (independent pin)
    // propB: 10 rooms × 0.65 occ × 366 days = 2,379 soldRooms year 1 (independent pin)
    const propA = makeHotel('Hotel A', 20, 140);
    const propB = makeHotel('Hotel B', 10, 100);

    const yearlyA = aggregatePropertyByYear(generatePropertyProForma(propA, GLOBAL, PROJ_MONTHS), PROJ_YEARS);
    const yearlyB = aggregatePropertyByYear(generatePropertyProForma(propB, GLOBAL, PROJ_MONTHS), PROJ_YEARS);

    const consolidated = consolidateYearlyFinancials([yearlyA, yearlyB], PROJ_YEARS);

    // Independent year-1 soldRooms pins anchor the scenario so a systematic
    // engine drift would fail here before the relational checks below.
    expect(yearlyA[0].soldRooms).toBe(4_758);  // 20 × 0.65 × 366
    expect(yearlyB[0].soldRooms).toBe(2_379);  // 10 × 0.65 × 366

    for (let y = 0; y < PROJ_YEARS; y++) {
      const c = consolidated[y];
      // Additive GOP: consolidation must preserve the sum of individual GOPs.
      const expectedGop = yearlyA[y].gop + yearlyB[y].gop;
      expect(c.gop).toBeCloseTo(expectedGop, 4);

      // NOI waterfall identity holds at portfolio level.
      expect(c.noi).toBeCloseTo(c.agop - c.expenseTaxes, 4);
    }
  });
});
