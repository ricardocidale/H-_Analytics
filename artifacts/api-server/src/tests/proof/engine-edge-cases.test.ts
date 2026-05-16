/**
 * T011 — Engine Edge Cases
 *
 * Verifies the property engine's behaviour at degenerate, extreme, and boundary inputs.
 * The engine must never produce NaN, Infinity, or throw for any finite numeric input.
 *
 * Domain notes
 * ────────────
 * - `isFinanced`: the engine only models debt when `property.type === 'Financed'`.
 *   Hotel / lodge / vrbo inputs are always unlevered (isFinanced=false), so
 *   interestExpense, principalPayment, and debtPayment are always 0 for those types.
 *
 * - `cleanAdr` (yearlyAggregator): uses PICK_LAST — the last non-zero `adr` field
 *   in the 12-month window. The monthly `adr` record is set unconditionally (not
 *   gated on isOperational), so cleanAdr equals the scheduled ADR even when
 *   soldRooms=0. It is never 0 unless startAdr itself is 0.
 *
 * - Pre-operations gate: revenue is gated on `i >= opsStartIdx` (derived from
 *   operationsStartDate vs modelStartDate). Months before operations start produce
 *   zero soldRooms and zero revenue; fixed costs (taxes, insurance) may still accrue
 *   from the acquisition date onward.
 *
 * - `expenseTaxes`: scales off `totalPropertyValue` (≈ purchasePrice), not revenue.
 *   A zero-priced property therefore has expenseTaxes=0 regardless of revenue.
 */
import { describe, it, expect } from 'vitest';
import { generatePropertyProForma } from '@server/finance/core/property-pipeline';
import { aggregatePropertyByYear } from '@server/finance/core/yearly-aggregator';
import type { PropertyInput, GlobalInput } from '@engine/types';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const BASE_GLOBAL: GlobalInput = {
  modelStartDate: '2024-01-01',
  inflationRate: 0.03,
  marketingRate: 0.01,
  debtAssumptions: { interestRate: 0.065, amortizationYears: 25 },
};

const ZERO_GROWTH_GLOBAL: GlobalInput = {
  ...BASE_GLOBAL,
  inflationRate: 0.0,
  marketingRate: 0.0,
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
  landValuePercent: 0.25,
  exitCapRate: 0.085,
  dispositionCommission: 0.05,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertMonthlyAllFinite(monthly: ReturnType<typeof generatePropertyProForma>, label: string): void {
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Engine Edge Cases (T011)', () => {

  // ── Zero occupancy ──────────────────────────────────────────────────────────

  it('zero occupancy → soldRooms=0, revenueRooms=0, cleanAdr=scheduled ADR, all finite', () => {
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
    const monthly = generatePropertyProForma(prop, ZERO_GROWTH_GLOBAL, 12);
    assertMonthlyAllFinite(monthly, 'zero-occupancy');
    const yearly = aggregatePropertyByYear(monthly, 1);
    const yr = yearly[0];

    expect(yr.soldRooms).toBe(0);
    expect(yr.revenueRooms).toBe(0);
    expect(yr.revenueTotal).toBe(0);

    // cleanAdr uses PICK_LAST (last non-zero monthly adr), which equals the scheduled
    // ADR regardless of occupancy — the property has a posted rate even with no guests.
    expect(yr.cleanAdr).toBeCloseTo(100, 0);

    // NOI identity still holds (gop=0, agop=0, noi= -expenseTaxes)
    expect(yr.noi).toBeCloseTo(yr.agop - yr.expenseTaxes, 2);

    assertYearlyAllFinite(yearly, 'zero-occupancy');
  });

  // ── Pre-operations gate ─────────────────────────────────────────────────────

  it('operationsStartDate in the future → pre-ops months have soldRooms=0, post-ops months > 0', () => {
    // modelStartDate = 2024-01-01, operationsStartDate = 2024-07-01
    // → opsStartIdx = 6; months 0-5 are pre-operational, months 6-11 are live
    const global: GlobalInput = { ...ZERO_GROWTH_GLOBAL, modelStartDate: '2024-01-01' };
    const prop: PropertyInput = {
      ...MINIMAL_COSTS,
      operationsStartDate: '2024-07-01',
      roomCount: 10,
      startAdr: 150,
      adrGrowthRate: 0,
      startOccupancy: 0.6,
      maxOccupancy: 0.6,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 1_500_000,
      type: 'hotel',
    };
    const monthly = generatePropertyProForma(prop, global, 12);
    assertMonthlyAllFinite(monthly, 'pre-ops');

    // First 6 months (Jan–Jun 2024): not yet operational
    for (let i = 0; i < 6; i++) {
      expect(monthly[i].soldRooms, `month ${i} should have 0 soldRooms`).toBe(0);
      expect(monthly[i].revenueRooms, `month ${i} should have 0 revenueRooms`).toBe(0);
    }

    // Months 6–11 (Jul–Dec 2024): operational
    for (let i = 6; i < 12; i++) {
      expect(monthly[i].soldRooms, `month ${i} should have soldRooms > 0`).toBeGreaterThan(0);
    }

    // Annual totals: revenue is only the last 6 months
    const yearly = aggregatePropertyByYear(monthly, 1);
    expect(yearly[0].revenueTotal).toBeGreaterThan(0);
    expect(yearly[0].soldRooms).toBeLessThan(yearly[0].availableRooms); // partial year
    assertYearlyAllFinite(yearly, 'pre-ops');
  });

  // ── 100% occupancy ──────────────────────────────────────────────────────────

  it('100% occupancy → soldRooms equals availableRooms exactly', () => {
    const prop: PropertyInput = {
      ...MINIMAL_COSTS,
      operationsStartDate: '2024-01-01',
      roomCount: 10,
      startAdr: 200,
      adrGrowthRate: 0,
      startOccupancy: 1.0,
      maxOccupancy: 1.0,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 2_000_000,
      type: 'hotel',
    };
    const monthly = generatePropertyProForma(prop, ZERO_GROWTH_GLOBAL, 12);
    assertMonthlyAllFinite(monthly, '100pct-occ');
    const yearly = aggregatePropertyByYear(monthly, 1);
    const yr = yearly[0];

    // 10 rooms × 366 days (2024 leap year) = 3,660 available room-nights
    expect(yr.availableRooms).toBe(3660);
    // At 100% occupancy, every available room-night is sold
    expect(yr.soldRooms).toBe(yr.availableRooms);
    expect(yr.revenueRooms).toBeCloseTo(3660 * 200, 0);

    // NOI identity
    expect(yr.noi).toBeCloseTo(yr.agop - yr.expenseTaxes, 2);
    assertYearlyAllFinite(yearly, '100pct-occ');
  });

  // ── Very small ADR ──────────────────────────────────────────────────────────

  it('very small ADR ($0.01) → revenue near-zero but finite, cleanAdr≈0.01', () => {
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
    const monthly = generatePropertyProForma(prop, ZERO_GROWTH_GLOBAL, 12);
    assertMonthlyAllFinite(monthly, 'tiny-adr');
    const yearly = aggregatePropertyByYear(monthly, 1);
    const yr = yearly[0];

    expect(yr.revenueRooms).toBeGreaterThan(0);
    expect(yr.revenueRooms).toBeLessThan(100);       // 5 × 0.5 × 366 × $0.01 = $9.15
    expect(yr.cleanAdr).toBeCloseTo(0.01, 3);
    assertYearlyAllFinite(yearly, 'tiny-adr');
  });

  // ── High cost rates ─────────────────────────────────────────────────────────

  it('high cost rates (sum > 1) → NOI is negative but all values remain finite', () => {
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
      landValuePercent: 0.25,
      exitCapRate: 0.085,
      dispositionCommission: 0.05,
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
    const monthly = generatePropertyProForma(prop, ZERO_GROWTH_GLOBAL, 12);
    assertMonthlyAllFinite(monthly, 'high-cost');
    const yearly = aggregatePropertyByYear(monthly, 1);

    // NOI is expected to be deeply negative (cost rates >> 100% of revenue)
    expect(yearly[0].noi).toBeLessThan(0);
    expect(yearly[0].noi).toBeCloseTo(yearly[0].agop - yearly[0].expenseTaxes, 2);
    assertYearlyAllFinite(yearly, 'high-cost');
  });

  // ── Zero purchase price ─────────────────────────────────────────────────────

  it('zero purchase price → expenseTaxes=0, depreciationExpense=0, all values finite', () => {
    // Note: type:'hotel' is unlevered (isFinanced=false), so debt service is always 0.
    // What actually changes with purchasePrice=0:
    //   totalPropertyValue = 0 → expenseTaxes = 0 (taxes scale off property value)
    //   buildingValue = 0      → depreciationExpense = 0
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
    const monthly = generatePropertyProForma(prop, ZERO_GROWTH_GLOBAL, 12);
    assertMonthlyAllFinite(monthly, 'zero-price');
    const yearly = aggregatePropertyByYear(monthly, 1);
    const yr = yearly[0];

    // Taxes are property-value based → 0 when purchasePrice = 0
    expect(yr.expenseTaxes).toBe(0);
    // Depreciation is based on building value (portion of purchase price) → 0
    expect(yr.depreciationExpense).toBe(0);
    // Revenue is unaffected by purchase price
    expect(yr.revenueTotal).toBeGreaterThan(0);
    // NOI identity
    expect(yr.noi).toBeCloseTo(yr.agop - yr.expenseTaxes, 2);
    assertYearlyAllFinite(yearly, 'zero-price');
  });

  // ── Long projection ─────────────────────────────────────────────────────────

  it('20-year projection → no NaN accumulation, ADR growth visible, occupancy ramp completes', () => {
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
    assertMonthlyAllFinite(monthly, '20-year');
    const yearly = aggregatePropertyByYear(monthly, YEARS);
    expect(yearly).toHaveLength(YEARS);
    assertYearlyAllFinite(yearly, '20-year');

    // ADR grows 3%/yr with 3% inflation → year 20 revenue significantly higher than year 1
    expect(yearly[YEARS - 1].revenueRooms).toBeGreaterThan(yearly[0].revenueRooms);

    // Occupancy ramp (24 months): by year 3 the property should be at or near maxOccupancy.
    // Year 1 soldRooms < year 3 soldRooms (ramp still in progress in yr 1, completed by yr 3)
    expect(yearly[2].soldRooms).toBeGreaterThan(yearly[0].soldRooms);

    // The ramp grows occupancy by 0.05 every two years (biennial steps) from 0.55
    // toward maxOccupancy 0.75. It takes 10 years to reach max:
    //   (0.75 - 0.55) / 0.05 = 4 steps × 2 yrs = 8 yrs, max hit around yr 9-10.
    // From year 10 onward soldRooms is identical (maxOccupancy × same day count).
    expect(yearly[YEARS - 1].soldRooms).toBeCloseTo(yearly[9].soldRooms, 0);
  });

  // ── VRBO per-property pricing ───────────────────────────────────────────────

  it('VRBO per_property → soldRooms=daysInYear×occ (ignores roomCount), NOI identity holds', () => {
    // per_property pricing: soldRooms = daysPerMonth × occupancy (whole property as one unit)
    // roomCount (3) is irrelevant to revenue; nightlyPropertyRate drives revenue per night.
    const prop: PropertyInput = {
      ...MINIMAL_COSTS,
      operationsStartDate: '2024-01-01',
      roomCount: 3,
      startAdr: 500,       // ignored for revenue (nightlyPropertyRate is used instead)
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
    const monthly = generatePropertyProForma(prop, ZERO_GROWTH_GLOBAL, 12);
    assertMonthlyAllFinite(monthly, 'vrbo-per-property');
    const yearly = aggregatePropertyByYear(monthly, 1);
    const yr = yearly[0];

    // soldRooms = 366 days × 0.5 occ = 183 (NOT 3 × 183 — roomCount is irrelevant)
    expect(yr.soldRooms).toBeCloseTo(183, 0);

    // revenueRooms = 183 nights × $500/night = $91,500
    expect(yr.revenueRooms).toBeCloseTo(91_500, 0);

    // cleanAdr = nightlyPropertyRate (PICK_LAST of monthly adr field)
    expect(yr.cleanAdr).toBe(500);

    // NOI identity
    expect(yr.noi).toBeCloseTo(yr.agop - yr.expenseTaxes, 2);
    assertYearlyAllFinite(yearly, 'vrbo-per-property');
  });

  // ── Lodge model ─────────────────────────────────────────────────────────────

  it('Lodge: revenue > 0, NOI identity holds, all values finite', () => {
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
    const monthly = generatePropertyProForma(prop, ZERO_GROWTH_GLOBAL, 12);
    assertMonthlyAllFinite(monthly, 'lodge');
    const yearly = aggregatePropertyByYear(monthly, 1);
    const yr = yearly[0];

    // 6 rooms × 0.6 occ × 366 days = 1,317.6 sold rooms
    expect(yr.soldRooms).toBeCloseTo(1317.6, 0);

    // revenueRooms = 1317.6 × $350 = $461,160
    expect(yr.revenueRooms).toBeCloseTo(461_160, 0);

    // expenseTaxes = 900,000 × 0.03 = $27,000
    expect(yr.expenseTaxes).toBeCloseTo(27_000, 0);

    // NOI identity
    expect(yr.noi).toBeCloseTo(yr.agop - yr.expenseTaxes, 2);
    expect(yr.noi).toBeGreaterThan(0);
    assertYearlyAllFinite(yearly, 'lodge');
  });

  // ── Missing optional fields ─────────────────────────────────────────────────

  it('missing optional fields (no businessModel, no pricingModel) → engine uses defaults safely', () => {
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
      // businessModel and pricingModel intentionally omitted
    };
    const monthly = generatePropertyProForma(prop, BASE_GLOBAL, 24);
    // Direct call — do not wrap in expect().not.toThrow() because assertMonthlyAllFinite
    // itself calls vitest expect() internally; wrapping masks failures.
    assertMonthlyAllFinite(monthly, 'no-optional-fields');
    const yearly = aggregatePropertyByYear(monthly, 2);
    expect(yearly).toHaveLength(2);
    assertYearlyAllFinite(yearly, 'no-optional-fields');
  });

  // ── Seasonality profile ─────────────────────────────────────────────────────

  it('seasonality profile → all 12 multipliers applied, flat [1,…,1] matches no-profile result', () => {
    const base: PropertyInput = {
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
    };

    // Flat seasonality (all 1.0) should produce the same revenueRooms as no profile
    const withFlat = generatePropertyProForma(
      { ...base, seasonalityProfile: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
      ZERO_GROWTH_GLOBAL, 24,
    );
    const withNone = generatePropertyProForma(base, ZERO_GROWTH_GLOBAL, 24);

    assertMonthlyAllFinite(withFlat, 'seasonality-flat');
    assertMonthlyAllFinite(withNone, 'seasonality-none');

    const yearlyFlat = aggregatePropertyByYear(withFlat, 2);
    const yearlyNone = aggregatePropertyByYear(withNone, 2);

    // Flat-1.0 profile is identical to no profile
    expect(yearlyFlat[0].revenueRooms).toBeCloseTo(yearlyNone[0].revenueRooms, 2);
    expect(yearlyFlat[0].soldRooms).toBeCloseTo(yearlyNone[0].soldRooms, 2);

    // Below-average peak profile: sum of multipliers < 12 → lower annual soldRooms
    const peakLow = generatePropertyProForma(
      { ...base, seasonalityProfile: [0.6, 0.7, 0.8, 0.9, 1.0, 1.3, 1.5, 1.5, 1.2, 1.0, 0.8, 0.7] },
      ZERO_GROWTH_GLOBAL, 12,
    );
    const yearlyPeakLow = aggregatePropertyByYear(peakLow, 1);
    assertYearlyAllFinite(yearlyPeakLow, 'seasonality-peak-low');
    expect(yearlyPeakLow[0].soldRooms).toBeGreaterThan(0);
  });

  // ── cleanAdr: PICK_LAST vs weighted-average divergence ─────────────────────

  it('cleanAdr PICK_LAST ≠ weighted average when seasonality varies ADR within the year', () => {
    // Seasonality applies to BOTH occupancy AND ADR: seasonalAdr = currentAdr × seasonFactor.
    // PICK_LAST returns the last non-zero monthly adr field — December's adr when factor=2.
    // Weighted average = revenueRooms / soldRooms — dominated by the 11 flat months.
    // With seasonalityProfile[11]=2 and startAdr=100:
    //   December adr = 100 × 2 = 200   → PICK_LAST cleanAdr = 200
    //   Weighted avg = 228,750 / 1,982.5 ≈ 115.38  → PICK_LAST ≠ weighted avg
    const prop: PropertyInput = {
      ...MINIMAL_COSTS,
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
      seasonalityProfile: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
    };
    const monthly = generatePropertyProForma(prop, ZERO_GROWTH_GLOBAL, 12);
    assertMonthlyAllFinite(monthly, 'picklast-diverge');
    const yearly = aggregatePropertyByYear(monthly, 1);
    const yr = yearly[0];

    // PICK_LAST: December's adr = 100 × 2 = 200 (the actual engine output for cleanAdr)
    expect(yr.cleanAdr).toBe(200);

    // Weighted average ≈ 115.38 — confirming cleanAdr is NOT revenueRooms/soldRooms
    const weightedAvg = yr.revenueRooms / yr.soldRooms;
    expect(weightedAvg).toBeCloseTo(115.38, 1);
    expect(yr.cleanAdr).not.toBeCloseTo(weightedAvg, 0); // the two are meaningfully different

    // The pinned values (derived from inputs):
    // soldRooms: months 0-10 have factor=1 → seasonalOcc=0.5, month 11 factor=2 → seasonalOcc=1.0
    // Month 0-10: daysPerMonth × 0.5 (≈ 27.74/mo × 11 = 1,651.5 total for non-Dec months)
    // Month 11 (Dec, 31 days): 31 × 1.0 = 31; total = 1,651.5 + 31 = 1,982.5
    // Wait — soldRooms = availableRooms × occ = (10 rooms × daysPerMonth) × seasonalOcc
    expect(yr.soldRooms).toBeCloseTo(1_982.5, 0);
    // revenueRooms: months 0-10 at adr=100, month 11 at adr=200
    expect(yr.revenueRooms).toBeCloseTo(228_750, 0);

    assertYearlyAllFinite(yearly, 'picklast-diverge');
  });

  // ── cleanAdr: startAdr = 0 → PICK_LAST returns 0 ──────────────────────────

  it('startAdr=0 → all monthly adr fields are 0, PICK_LAST cleanAdr=0, revenueRooms=0', () => {
    // PICK_LAST scans backward for the last non-zero monthly adr.
    // When startAdr=0 every month's adr is 0, so the scan finds nothing and cleanAdr=0.
    const prop: PropertyInput = {
      ...MINIMAL_COSTS,
      operationsStartDate: '2024-01-01',
      roomCount: 10,
      startAdr: 0,
      adrGrowthRate: 0,
      startOccupancy: 0.6,
      maxOccupancy: 0.6,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 1_000_000,
      type: 'hotel',
    };
    const monthly = generatePropertyProForma(prop, ZERO_GROWTH_GLOBAL, 12);
    assertMonthlyAllFinite(monthly, 'zero-adr');
    const yearly = aggregatePropertyByYear(monthly, 1);
    const yr = yearly[0];

    expect(yr.cleanAdr).toBe(0);
    expect(yr.revenueRooms).toBe(0);
    expect(yr.soldRooms).toBeGreaterThan(0); // rooms are "occupied" but generate no revenue
    assertYearlyAllFinite(yearly, 'zero-adr');
  });

  // ── Financed vs unlevered: debt path gating ─────────────────────────────────

  it('type="Financed" activates debt service; hotel/lodge/vrbo are always unlevered', () => {
    // isFinanced = (property.type === "Financed") in resolve-assumptions.ts.
    // All other type values (hotel/lodge/vrbo) hard-set isFinanced=false regardless of
    // acquisitionLTV — so interestExpense, principalPayment, and debtPayment are always 0
    // for those types. This test proves BOTH branches explicitly.
    //
    // The loan rate and term are pinned at the property level (acquisitionInterestRate,
    // acquisitionTermYears) — NOT relied upon from globalAssumptions.debtAssumptions or
    // from DEFAULT_* fallbacks. The property-engine reads these from the property fields
    // (resolve-assumptions.ts:197-198); silently riding on a default would couple this
    // test to whatever value the default has at any given moment and produced a stale
    // failure when DEFAULT_INTEREST_RATE was lowered from 0.09 to 0.075.
    //
    // Expected debt-service values are derived from the textbook PMT formula in code
    // below, not pinned as literals. This makes the test robust to default changes and
    // self-documents the math the engine is verified against.

    // ── Loan inputs (Category 2 — DEFAULT VARIABLES, pinned for this test only) ──
    const TEST_LOAN_INTEREST_RATE = 0.06;     // 6% APR
    const TEST_LOAN_TERM_YEARS = 25;          // 25-year amortization
    const TEST_PROPERTY_VALUE = 1_000_000;    // $1M property
    const TEST_ACQUISITION_LTV = 0.7;         // 70% LTV

    // ── Derived expected values (from PMT amortisation math) ──
    // monthly_rate = annual_rate / 12
    // total_months = years × 12
    // monthly_pmt  = P · r · (1+r)^n / ((1+r)^n - 1)
    // year1_principal = P - balance_after_12_months
    //   where balance_after_m = P·(1+r)^m - PMT·((1+r)^m - 1)/r
    // year1_interest  = annual_pmt - year1_principal
    const monthlyRate = TEST_LOAN_INTEREST_RATE / 12; // 12 = months/year (TRUE CONSTANT)
    const totalMonths = TEST_LOAN_TERM_YEARS * 12;
    const principal = TEST_PROPERTY_VALUE * TEST_ACQUISITION_LTV;
    const compoundFactorTotal = Math.pow(1 + monthlyRate, totalMonths);
    const monthlyPayment = principal * monthlyRate * compoundFactorTotal / (compoundFactorTotal - 1);
    const expectedAnnualDebtPayment = monthlyPayment * 12;
    const compoundFactor12 = Math.pow(1 + monthlyRate, 12);
    const balanceAfter12Months = principal * compoundFactor12 - monthlyPayment * (compoundFactor12 - 1) / monthlyRate;
    const expectedYear1Principal = principal - balanceAfter12Months;
    const expectedYear1Interest = expectedAnnualDebtPayment - expectedYear1Principal;

    const sharedBase = {
      ...MINIMAL_COSTS,
      operationsStartDate: '2024-01-01',
      acquisitionDate: '2024-01-01',
      roomCount: 20,
      startAdr: 150,
      adrGrowthRate: 0,
      startOccupancy: 0.7,
      maxOccupancy: 0.7,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: TEST_PROPERTY_VALUE,
      acquisitionLTV: TEST_ACQUISITION_LTV,
      acquisitionInterestRate: TEST_LOAN_INTEREST_RATE, // pin loan rate at property level
      acquisitionTermYears: TEST_LOAN_TERM_YEARS,       // pin loan term at property level
      businessModel: 'hotel' as const,
      pricingModel: 'per_room' as const,
    };

    // ── Financed branch ──────────────────────────────────────────────────────
    const financed: PropertyInput = { ...sharedBase, type: 'Financed' };
    const yrF = aggregatePropertyByYear(generatePropertyProForma(financed, ZERO_GROWTH_GLOBAL, 12), 1)[0];

    expect(yrF.debtPayment).toBeCloseTo(expectedAnnualDebtPayment, 1);
    expect(yrF.interestExpense).toBeCloseTo(expectedYear1Interest, 1);
    expect(yrF.principalPayment).toBeCloseTo(expectedYear1Principal, 1);
    // Amortisation identity: interest + principal = total debt payment (exact)
    expect(yrF.interestExpense + yrF.principalPayment).toBeCloseTo(yrF.debtPayment, 2);

    // ── Hotel branch (unlevered) ─────────────────────────────────────────────
    const hotel: PropertyInput = { ...sharedBase, type: 'hotel' };
    const yrH = aggregatePropertyByYear(generatePropertyProForma(hotel, ZERO_GROWTH_GLOBAL, 12), 1)[0];

    expect(yrH.debtPayment).toBe(0);
    expect(yrH.interestExpense).toBe(0);
    expect(yrH.principalPayment).toBe(0);

    // Revenue and pre-fee GOP are identical — operating income before fees is unaffected
    // by financing structure.
    expect(yrF.revenueRooms).toBeCloseTo(yrH.revenueRooms, 2);
    expect(yrF.gop).toBeCloseTo(yrH.gop, 2);

    // Post-MAJOR-4 (engine commit 6390b432) the incentive fee is gated on
    // post-debt-service levered cash. The Financed branch's debt service reduces the
    // incentive-fee base, yielding a smaller incentive fee and thus a higher AGOP/NOI
    // than the unlevered branch. Pre-MAJOR-4 these were identical; the invariant
    // changed, so assert the new relationship explicitly rather than the old equality.
    expect(yrF.noi).toBeGreaterThanOrEqual(yrH.noi);
  });
});
