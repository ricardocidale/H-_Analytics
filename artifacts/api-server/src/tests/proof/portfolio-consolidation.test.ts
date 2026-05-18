/**
 * T009 — Portfolio Consolidation Aggregation Rules
 *
 * Pins the per-field aggregation rules in consolidateYearlyFinancials and
 * computeWeightedMetrics. Complements T008 (consolidation-crosscheck) which
 * verifies sum invariants; T009 targets the rules that are NOT simply "sum":
 *
 *   cleanAdr  — WEIGHTED (revenue / rooms), not arithmetic mean
 *   endingCash — SUM at portfolio level (vs PICK_LAST at property level)
 *   computeWeightedMetrics — weightedADR, weightedOcc, revPAR formulas
 */
import { describe, it, expect } from 'vitest';
import { consolidateYearlyFinancials, computeWeightedMetrics } from '@server/finance/core/consolidation';
import { aggregatePropertyByYear } from '@server/finance/core/yearly-aggregator';
import { generatePropertyProForma } from '@server/finance/core/property-pipeline';
import type { YearlyPropertyFinancials } from '@server/finance/core/yearly-aggregator';
import type { PropertyInput, GlobalInput } from '@engine/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeYear(y: number, overrides: Partial<YearlyPropertyFinancials> = {}): YearlyPropertyFinancials {
  return {
    year: y,
    soldRooms: 0, availableRooms: 0, cleanAdr: 0,
    revenueRooms: 0, revenueEvents: 0, revenueFB: 0, revenueOther: 0, revenueTotal: 0,
    expenseRooms: 0, expenseFB: 0, expenseEvents: 0, expenseOther: 0, expenseOtherCosts: 0,
    expenseInsurance: 0, expenseMarketing: 0, expensePropertyOps: 0,
    expenseUtilitiesVar: 0, expenseUtilitiesFixed: 0, expenseUtilities: 0,
    expenseAdmin: 0, expenseIT: 0, expenseTaxes: 0, expenseFFE: 0,
    expensePlatformFees: 0, expensePreOpening: 0,
    feeBase: 0, feeIncentive: 0, serviceFeesByCategory: {},
    totalExpenses: 0, gop: 0, agop: 0, noi: 0, anoi: 0,
    interestExpense: 0, depreciationExpense: 0, incomeTax: 0, netIncome: 0,
    principalPayment: 0, debtPayment: 0, refinancingProceeds: 0,
    accountsReceivable: 0, accountsPayable: 0, workingCapitalChange: 0,
    nolBalance: 0,
    cashFlow: 0, operatingCashFlow: 0, financingCashFlow: 0, endingCash: 0,
    ...overrides,
  };
}

const PROJ_YEARS = 3;
const PROJ_MONTHS = PROJ_YEARS * 12;

const GLOBAL: GlobalInput = {
  modelStartDate: '2024-01-01',
  inflationRate: 0.02,
  marketingRate: 0.01,
  miscOpsRate: 0.0,
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
  landValuePercent: 0.25,
  exitCapRate: 0.085,
  dispositionCommission: 0.05,
};

function makeHotel(name: string, roomCount: number, startAdr: number): PropertyInput {
  return {
    ...BASE_COSTS,
    name,
    operationsStartDate: '2024-01-01',
    arDays: 30,
    apDays: 45,
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

// ---------------------------------------------------------------------------
// cleanAdr: WEIGHTED aggregation rule
// ---------------------------------------------------------------------------

describe('Portfolio Consolidation — cleanAdr is WEIGHTED (T009)', () => {
  it('cleanAdr is revenue-weighted, not an arithmetic mean', () => {
    // Property A: 100 soldRooms at $200/room → $20,000 room revenue
    // Property B:  50 soldRooms at $300/room → $15,000 room revenue
    //
    // Arithmetic mean: ($200 + $300) / 2 = $250   ← WRONG
    // Revenue-weighted: $35,000 / 150 rooms ≈ $233.33  ← CORRECT
    const propA: YearlyPropertyFinancials[] = [
      makeYear(0, { soldRooms: 100, revenueRooms: 20_000 }),
      makeYear(1, { soldRooms: 100, revenueRooms: 20_000 }),
      makeYear(2, { soldRooms: 100, revenueRooms: 20_000 }),
    ];
    const propB: YearlyPropertyFinancials[] = [
      makeYear(0, { soldRooms: 50, revenueRooms: 15_000 }),
      makeYear(1, { soldRooms: 50, revenueRooms: 15_000 }),
      makeYear(2, { soldRooms: 50, revenueRooms: 15_000 }),
    ];

    const consolidated = consolidateYearlyFinancials([propA, propB], PROJ_YEARS);

    const expectedWeighted = 35_000 / 150;      // ≈ 233.33
    const arithmeticMean = (200 + 300) / 2;     //   250.00

    for (let y = 0; y < PROJ_YEARS; y++) {
      expect(consolidated[y].cleanAdr).toBeCloseTo(expectedWeighted, 6);
      expect(consolidated[y].cleanAdr).not.toBeCloseTo(arithmeticMean, 1);
    }
  });

  it('cleanAdr falls back to 0 when no rooms are sold (no NaN/Infinity)', () => {
    const propA: YearlyPropertyFinancials[] = [makeYear(0, { soldRooms: 0, revenueRooms: 0 })];
    const propB: YearlyPropertyFinancials[] = [makeYear(0, { soldRooms: 0, revenueRooms: 0 })];

    const consolidated = consolidateYearlyFinancials([propA, propB], 1);

    expect(Number.isFinite(consolidated[0].cleanAdr)).toBe(true);
    expect(consolidated[0].cleanAdr).toBe(0);
  });

  it('cleanAdr is unaffected by properties with zero room revenue', () => {
    // Property A contributes rooms and revenue; property B has no room activity.
    // The zero-revenue property must not dilute the ADR.
    const propA: YearlyPropertyFinancials[] = [makeYear(0, { soldRooms: 100, revenueRooms: 20_000 })];
    const propB: YearlyPropertyFinancials[] = [makeYear(0, { soldRooms: 0, revenueRooms: 0 })];

    const consolidated = consolidateYearlyFinancials([propA, propB], 1);

    expect(consolidated[0].cleanAdr).toBeCloseTo(20_000 / 100, 6); // 200.0
  });
});

// ---------------------------------------------------------------------------
// endingCash: SUM at portfolio level
// ---------------------------------------------------------------------------

describe('Portfolio Consolidation — endingCash is SUM (T009)', () => {
  it('portfolio endingCash = sum of individual property endingCash values', () => {
    // Use the full pipeline so endingCash reflects real PICK_LAST values per
    // property, then verify consolidation sums them rather than picking one.
    const propA = makeHotel('Hotel A', 20, 150);
    const propB = makeHotel('Hotel B', 15, 200);

    const yearlyA = aggregatePropertyByYear(generatePropertyProForma(propA, GLOBAL, PROJ_MONTHS), PROJ_YEARS);
    const yearlyB = aggregatePropertyByYear(generatePropertyProForma(propB, GLOBAL, PROJ_MONTHS), PROJ_YEARS);

    const consolidated = consolidateYearlyFinancials([yearlyA, yearlyB], PROJ_YEARS);

    for (let y = 0; y < PROJ_YEARS; y++) {
      const expected = yearlyA[y].endingCash + yearlyB[y].endingCash;
      expect(consolidated[y].endingCash).toBeCloseTo(expected, 4);
    }
  });

  it('single-property: portfolio endingCash equals the property endingCash', () => {
    const prop = makeHotel('Solo Hotel', 18, 160);
    const yearly = aggregatePropertyByYear(generatePropertyProForma(prop, GLOBAL, PROJ_MONTHS), PROJ_YEARS);
    const consolidated = consolidateYearlyFinancials([yearly], PROJ_YEARS);

    for (let y = 0; y < PROJ_YEARS; y++) {
      expect(consolidated[y].endingCash).toBeCloseTo(yearly[y].endingCash, 4);
    }
  });
});

// ---------------------------------------------------------------------------
// computeWeightedMetrics formula correctness
// ---------------------------------------------------------------------------

describe('computeWeightedMetrics — formula accuracy (T009)', () => {
  it('empty portfolio returns empty array without error', () => {
    const result = computeWeightedMetrics([], PROJ_YEARS);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('weightedADR = totalRoomRevenue / totalRoomsSold', () => {
    // Property A: 200 rooms sold, $40,000 revenue → ADR = $200
    // Property B: 100 rooms sold, $30,000 revenue → ADR = $300
    // Weighted: $70,000 / 300 = $233.33...
    const propA: YearlyPropertyFinancials[] = [
      makeYear(0, { soldRooms: 200, availableRooms: 400, revenueRooms: 40_000 }),
    ];
    const propB: YearlyPropertyFinancials[] = [
      makeYear(0, { soldRooms: 100, availableRooms: 200, revenueRooms: 30_000 }),
    ];

    const metrics = computeWeightedMetrics([propA, propB], 1);

    expect(metrics[0].weightedADR).toBeCloseTo(70_000 / 300, 6);
  });

  it('weightedOcc = totalRoomsSold / totalAvailableRoomNights', () => {
    const propA: YearlyPropertyFinancials[] = [
      makeYear(0, { soldRooms: 200, availableRooms: 400, revenueRooms: 40_000 }),
    ];
    const propB: YearlyPropertyFinancials[] = [
      makeYear(0, { soldRooms: 100, availableRooms: 200, revenueRooms: 30_000 }),
    ];

    const metrics = computeWeightedMetrics([propA, propB], 1);

    expect(metrics[0].weightedOcc).toBeCloseTo(300 / 600, 6); // 0.5
    expect(metrics[0].totalAvailableRoomNights).toBe(600);
  });

  it('revPAR = totalRoomRevenue / totalAvailableRoomNights', () => {
    const propA: YearlyPropertyFinancials[] = [
      makeYear(0, { soldRooms: 200, availableRooms: 400, revenueRooms: 40_000 }),
    ];
    const propB: YearlyPropertyFinancials[] = [
      makeYear(0, { soldRooms: 100, availableRooms: 200, revenueRooms: 30_000 }),
    ];

    const metrics = computeWeightedMetrics([propA, propB], 1);

    expect(metrics[0].revPAR).toBeCloseTo(70_000 / 600, 6); // ≈ 116.67
  });

  it('zero rooms sold → weightedADR = 0, no NaN or Infinity', () => {
    const prop: YearlyPropertyFinancials[] = [
      makeYear(0, { soldRooms: 0, availableRooms: 200, revenueRooms: 0 }),
    ];

    const metrics = computeWeightedMetrics([prop], 1);

    expect(Number.isFinite(metrics[0].weightedADR)).toBe(true);
    expect(metrics[0].weightedADR).toBe(0);
  });

  it('zero available rooms → weightedOcc = 0 and revPAR = 0, no NaN', () => {
    const prop: YearlyPropertyFinancials[] = [
      makeYear(0, { soldRooms: 0, availableRooms: 0, revenueRooms: 0 }),
    ];

    const metrics = computeWeightedMetrics([prop], 1);

    expect(Number.isFinite(metrics[0].weightedOcc)).toBe(true);
    expect(Number.isFinite(metrics[0].revPAR)).toBe(true);
    expect(metrics[0].weightedOcc).toBe(0);
    expect(metrics[0].revPAR).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Consistency: cleanAdr === computeWeightedMetrics.weightedADR
// ---------------------------------------------------------------------------

describe('Consolidation consistency — cleanAdr equals computeWeightedMetrics.weightedADR (T009)', () => {
  it('cleanAdr from consolidateYearlyFinancials matches weightedADR from computeWeightedMetrics', () => {
    // Both functions compute revenueRooms / soldRooms from the same inputs.
    // They must agree — a divergence would mean one of them drifted.
    const propA = makeHotel('Hotel A', 20, 150);
    const propB = makeHotel('Hotel B', 30, 220);

    const yearlyA = aggregatePropertyByYear(generatePropertyProForma(propA, GLOBAL, PROJ_MONTHS), PROJ_YEARS);
    const yearlyB = aggregatePropertyByYear(generatePropertyProForma(propB, GLOBAL, PROJ_MONTHS), PROJ_YEARS);

    const consolidated = consolidateYearlyFinancials([yearlyA, yearlyB], PROJ_YEARS);
    const metrics = computeWeightedMetrics([yearlyA, yearlyB], PROJ_YEARS);

    for (let y = 0; y < PROJ_YEARS; y++) {
      expect(consolidated[y].cleanAdr).toBeCloseTo(metrics[y].weightedADR, 6);
    }
  });
});
