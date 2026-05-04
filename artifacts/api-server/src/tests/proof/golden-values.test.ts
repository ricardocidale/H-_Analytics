import { describe, it, expect } from 'vitest';
import { generatePropertyProForma } from '@server/finance/core/property-pipeline';
import { aggregatePropertyByYear } from '@server/finance/core/yearly-aggregator';
import { dRound } from '@calc/shared/decimal';
import type { PropertyInput, GlobalInput } from '@engine/types';

const MINIMAL_GLOBAL: GlobalInput = {
  modelStartDate: '2024-01-01',
  projectionYears: 1,
  inflationRate: 0.0,
  marketingRate: 0.0,
  debtAssumptions: {
    interestRate: 0.0,
    amortizationYears: 25,
    acqLTV: 0.0,
  },
};

const BASE_COSTS = {
  costRateRooms: 0.2,
  costRateFB: 0.3,
  costRateAdmin: 0.1,
  costRateMarketing: 0.05,
  costRatePropertyOps: 0.05,
  costRateUtilities: 0.05,
  costRateTaxes: 0.05,
  costRateIT: 0.01,
  costRateFFE: 0.03,
  costRateOther: 0.02,
  costRateInsurance: 0.01,
  revShareEvents: 0.0,
  revShareFB: 0.0,
  revShareOther: 0.0,
};

describe('Golden Values — Business Model Baselines', () => {
  it('Hotel baseline: zero-growth analytical check', async () => {
    const hotelInput: PropertyInput = {
      ...BASE_COSTS,
      operationsStartDate: '2024-01-01',
      acquisitionDate: '2024-01-01',
      roomCount: 20,
      startAdr: 150,
      adrGrowthRate: 0,
      startOccupancy: 0.7,
      maxOccupancy: 0.7,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 2_000_000,
      type: 'hotel',
      businessModel: 'hotel',
      pricingModel: 'per_room',
    };

    const monthly = generatePropertyProForma(hotelInput, MINIMAL_GLOBAL);
    const yearly = aggregatePropertyByYear(monthly, MINIMAL_GLOBAL.projectionYears!);

    const year1 = yearly[0];
    expect(year1).toBeDefined();

    // 20 rooms * 0.7 occ * 365.25 days / 12 months * 12 months ≈ 5113.5 sold rooms
    // The engine uses ctx.availableRooms = roomCount * 30.5 (usually)
    // Let's check the result and see why it is 5124.
    // 5124 / 20 / 0.7 = 366.
    // Ah, 2024 is a leap year. 366 days * 0.7 * 20 = 5124.
    expect(year1.soldRooms).toBe(5124);
    
    // 5124 * 150 ADR = 768,600
    expect(year1.revenueRooms).toBeCloseTo(768600, 0);

    // Internal consistency
    expect(year1.revenueTotal).toBeGreaterThanOrEqual(year1.revenueRooms);
    
    // Identity: NOI = AGOP - Fixed Fees (Taxes)
    expect(year1.noi).toBeCloseTo(year1.agop - year1.expenseTaxes, 2);
    
    // Finiteness
    Object.values(year1).forEach(val => {
      if (typeof val === 'number') {
        expect(Number.isFinite(val)).toBe(true);
      }
    });
  });

  it('Lodge baseline: zero-growth check', async () => {
    const lodgeInput: PropertyInput = {
      ...BASE_COSTS,
      operationsStartDate: '2024-01-01',
      acquisitionDate: '2024-01-01',
      roomCount: 8,
      startAdr: 300,
      adrGrowthRate: 0,
      startOccupancy: 0.6,
      maxOccupancy: 0.6,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 1_200_000,
      type: 'lodge',
      businessModel: 'lodge',
      pricingModel: 'per_room',
    };

    const monthly = generatePropertyProForma(lodgeInput, MINIMAL_GLOBAL);
    const yearly = aggregatePropertyByYear(monthly, MINIMAL_GLOBAL.projectionYears!);

    const year1 = yearly[0];
    expect(year1.revenueTotal).toBeGreaterThan(0);
    expect(year1.soldRooms).toBeGreaterThan(0);
    
    // Identity: NOI = AGOP - Fixed Fees (Taxes)
    expect(year1.noi).toBeCloseTo(year1.agop - year1.expenseTaxes, 2);

    // Lodge often includes F&B or other revenue by default in some engines
    expect(year1.revenueTotal).toBeGreaterThanOrEqual(year1.revenueRooms);
    
    Object.values(year1).forEach(val => {
      if (typeof val === 'number') {
        expect(Number.isFinite(val)).toBe(true);
      }
    });
  });

  it('VRBO baseline: zero-growth check', async () => {
    const vrboInput: PropertyInput = {
      ...BASE_COSTS,
      operationsStartDate: '2024-01-01',
      acquisitionDate: '2024-01-01',
      roomCount: 5,
      startAdr: 400,
      adrGrowthRate: 0,
      startOccupancy: 0.55,
      maxOccupancy: 0.55,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 800_000,
      type: 'vrbo',
      businessModel: 'vrbo',
      pricingModel: 'per_property',
      nightlyPropertyRate: 400,
    };

    const monthly = generatePropertyProForma(vrboInput, MINIMAL_GLOBAL);
    const yearly = aggregatePropertyByYear(monthly, MINIMAL_GLOBAL.projectionYears!);

    const year1 = yearly[0];
    expect(year1.revenueTotal).toBeGreaterThan(0);
    expect(year1.soldRooms).toBeGreaterThan(0);
    
    // Identity: NOI = AGOP - Fixed Fees (Taxes)
    expect(year1.noi).toBeCloseTo(year1.agop - year1.expenseTaxes, 2);
    
    Object.values(year1).forEach(val => {
      if (typeof val === 'number') {
        expect(Number.isFinite(val)).toBe(true);
      }
    });
  });

  it('Internal consistency identities for all models', async () => {
    const models = ['hotel', 'lodge', 'vrbo'] as const;
    for (const model of models) {
      const input: PropertyInput = {
        ...BASE_COSTS,
        operationsStartDate: '2024-01-01',
        roomCount: 10,
        startAdr: 200,
        adrGrowthRate: 0,
        startOccupancy: 0.5,
        maxOccupancy: 0.5,
        occupancyRampMonths: 0,
        occupancyGrowthStep: 0,
        purchasePrice: 1_000_000,
        type: model,
        businessModel: model,
        pricingModel: model === 'vrbo' ? 'per_property' : 'per_room',
        nightlyPropertyRate: model === 'vrbo' ? 500 : undefined,
      };

      const monthly = generatePropertyProForma(input, MINIMAL_GLOBAL);
      const yearly = aggregatePropertyByYear(monthly, MINIMAL_GLOBAL.projectionYears!);
      const year1 = yearly[0];

      // Identity: GOP = Total Revenue - Operating Expenses (Rooms, FB, Events, Other, Marketing, Ops, Utilities, Admin, IT, Maintenance, FFE, Insurance, etc.)
      // In the engine, totalExpenses usually includes all operating costs.
      expect(year1.gop).toBeCloseTo(year1.revenueTotal - (year1.expenseRooms + year1.expenseFB + year1.expenseEvents + year1.expenseOther + year1.expenseMarketing + year1.expensePropertyOps + year1.expenseUtilitiesVar + year1.expenseUtilitiesFixed + year1.expenseAdmin + year1.expenseIT + year1.expenseInsurance + year1.expenseOtherCosts + year1.expensePlatformFees), 2);
      
      // Identity: NOI = AGOP - Fixed Fees (Taxes)
      expect(year1.noi).toBeCloseTo(year1.agop - year1.expenseTaxes, 2);
      
      // Identity: Total Expenses includes all costs
      // totalOperatingExpenses = sum of rooms, fb, events, other, marketing, propOps, utilitiesVar, admin, it, utilitiesFixed, insurance, otherCosts, platformFees, preOpening
      // totalExpenses = totalOperatingExpenses + feeBase + feeIncentive + expenseTaxes + expenseFFE
      expect(year1.noi).toBeCloseTo(year1.revenueTotal - year1.totalExpenses + year1.expenseFFE, 2);
    }
  });
});
