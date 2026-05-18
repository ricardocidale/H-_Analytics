import { describe, it, expect } from 'vitest';
import { generatePropertyProForma } from '@server/finance/core/property-pipeline';
import { aggregatePropertyByYear } from '@server/finance/core/yearly-aggregator';
import type { PropertyInput, GlobalInput } from '@engine/types';

describe('T_C: Monthly-to-Yearly Aggregation Cross-Check (T007)', () => {
  const MINIMAL_GLOBAL: GlobalInput = {
    modelStartDate: '2024-01-01',
    inflationRate: 0.03,
    marketingRate: 0.05,
    miscOpsRate: 0.0,
    debtAssumptions: {
      interestRate: 0.06,
      amortizationYears: 25,
    },
  };

  const MINIMAL_HOTEL: PropertyInput = {
    name: 'Test Hotel',
    operationsStartDate: '2024-01-01',
    acquisitionDate: '2024-01-01',
    roomCount: 10,
    startAdr: 100,
    adrGrowthRate: 0.0,
    startOccupancy: 0.5,
    maxOccupancy: 0.7,
    occupancyRampMonths: 12,
    occupancyGrowthStep: 0.1,
    purchasePrice: 1_000_000,
    businessModel: 'hotel',
    type: 'hotel',
    costRateRooms: 0.2,
    costRateFB: 0.3,
    costRateAdmin: 0.1,
    costRateMarketing: 0.05,
    costRatePropertyOps: 0.05,
    costRateUtilities: 0.05,
    costRateTaxes: 0.02,
    costRateIT: 0.01,
    costRateFFE: 0.04,
    costRateOther: 0.05,
    costRateInsurance: 0.01,
    revShareEvents: 0.1,
    revShareFB: 0.2,
    revShareOther: 0.05,
    landValuePercent: 0.25,
    exitCapRate: 0.085,
    dispositionCommission: 0.05,
  };

  it('correctly sums 12 monthly values into yearly totals for a 5-year projection', () => {
    const projectionYears = 5;
    const months = projectionYears * 12;
    
    const monthly = generatePropertyProForma(MINIMAL_HOTEL, MINIMAL_GLOBAL, months);
    const yearly = aggregatePropertyByYear(monthly, projectionYears);

    expect(yearly).toHaveLength(projectionYears);

    for (let y = 0; y < projectionYears; y++) {
      const yearData = yearly[y];
      const monthlySlice = monthly.slice(y * 12, (y + 1) * 12);

      // SUM checks
      const sumRevenueRooms = monthlySlice.reduce((sum, m) => sum + m.revenueRooms, 0);
      const sumRevenueTotal = monthlySlice.reduce((sum, m) => sum + m.revenueTotal, 0);
      const sumNoi = monthlySlice.reduce((sum, m) => sum + m.noi, 0);
      const sumGop = monthlySlice.reduce((sum, m) => sum + m.gop, 0);
      const sumTotalExpenses = monthlySlice.reduce((sum, m) => sum + m.totalExpenses, 0);
      const sumSoldRooms = monthlySlice.reduce((sum, m) => sum + m.soldRooms, 0);

      expect(yearData.revenueRooms).toBeCloseTo(sumRevenueRooms, 4);
      expect(yearData.revenueTotal).toBeCloseTo(sumRevenueTotal, 4);
      expect(yearData.noi).toBeCloseTo(sumNoi, 4);
      expect(yearData.gop).toBeCloseTo(sumGop, 4);
      expect(yearData.totalExpenses).toBeCloseTo(sumTotalExpenses, 4);
      expect(yearData.soldRooms).toBe(sumSoldRooms);

      // PICK-LAST checks
      const lastMonth = monthlySlice[monthlySlice.length - 1];
      expect(yearData.endingCash).toBe(lastMonth.endingCash);
      expect(yearData.nolBalance).toBe(lastMonth.nolBalance);

      // DERIVED check
      expect(yearData.expenseUtilities).toBeCloseTo(yearData.expenseUtilitiesVar + yearData.expenseUtilitiesFixed, 4);

      // Finiteness check
      Object.entries(yearData).forEach(([key, val]) => {
        if (typeof val === 'number') {
          expect(Number.isFinite(val)).toBe(true);
        }
      });
    }
  });

  it('produces no yearly rows for an empty monthly array', () => {
    const result = aggregatePropertyByYear([], 5);
    expect(result).toHaveLength(0);
  });

  it('produces exactly 1 yearly row for a single-year projection', () => {
    const projectionYears = 1;
    const monthly = generatePropertyProForma(MINIMAL_HOTEL, MINIMAL_GLOBAL, 12);
    const yearly = aggregatePropertyByYear(monthly, projectionYears);
    expect(yearly).toHaveLength(1);
    expect(yearly[0].year).toBe(0);
  });
});
