/**
 * T010 — Business Model Golden Scenarios
 *
 * Zero-growth baselines for Hotel, Lodge, and VRBO. Every pinned value is derived
 * analytically from the inputs so the comment next to each assertion explains the
 * arithmetic. A future change to any engine constant that shifts a value here must
 * update the comment explaining the new derivation.
 *
 * Global setup for all scenarios:
 *   - modelStartDate: 2024-01-01 (2024 is a leap year: 366 days)
 *   - inflationRate: 0.0  → no ADR growth, no cost escalation
 *   - debtAssumptions: interestRate 0.0, acqLTV 0.0  → no debt, no debt service
 *   - revShareFB/Events/Other: 0.0  → revenueTotal = revenueRooms only
 *
 * Engine waterfall (monthly → summed to yearly):
 *   GOP   = revenueTotal - totalOperatingExpenses
 *           where totalOperatingExpenses includes: rooms, FB, events, other, otherCosts,
 *           insurance, marketing, propertyOps, utilitiesVar, utilitiesFixed, admin, IT,
 *           platformFees, AND expensePreOpening
 *   AGOP  = GOP - feeBase - feeIncentive
 *   NOI   = AGOP - expenseTaxes
 *   ANOI  = NOI  - expenseFFE
 *   totalExpenses = totalOperatingExpenses + feeBase + feeIncentive + expenseTaxes + expenseFFE
 *
 * VRBO per_property note:
 *   soldRooms = daysInYear × occupancy (whole property as one unit — roomCount is irrelevant)
 *   revenue   = soldRooms × nightlyPropertyRate
 *   This means a 5-unit VRBO with nightlyPropertyRate=$400 earns $400/night total,
 *   not $400 × 5/night. Fixed costs (taxes based on purchasePrice) can exceed revenue,
 *   making NOI negative — that is the expected result for this low-rate configuration.
 */
import { describe, it, expect } from 'vitest';
import { generatePropertyProForma } from '@server/finance/core/property-pipeline';
import { aggregatePropertyByYear } from '@server/finance/core/yearly-aggregator';
import type { PropertyInput, GlobalInput } from '@engine/types';

const ZERO_GROWTH_GLOBAL: GlobalInput = {
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
  landValuePercent: 0.25,
  exitCapRate: 0.085,
  dispositionCommission: 0.05,
};

// ── Shared helper ─────────────────────────────────────────────────────────────

function assertAllFinite(yr: Record<string, unknown>, label: string): void {
  Object.entries(yr).forEach(([key, val]) => {
    if (typeof val === 'number') {
      expect(Number.isFinite(val), `${label}: ${key} should be finite`).toBe(true);
    }
  });
}

// ── Hotel ─────────────────────────────────────────────────────────────────────

describe('Golden Values — Business Model Baselines', () => {
  it('Hotel: pinned soldRooms, revenueRooms, cleanAdr, NOI identity', () => {
    const input: PropertyInput = {
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

    const monthly = generatePropertyProForma(input, ZERO_GROWTH_GLOBAL);
    const yearly = aggregatePropertyByYear(monthly, 1);
    const yr = yearly[0];
    expect(yr).toBeDefined();

    // soldRooms: 20 rooms × 0.7 occ × 366 days (2024 leap year) = 5,124.0 (exact integer)
    expect(yr.soldRooms).toBe(5124);

    // availableRooms: 20 rooms × 366 days = 7,320
    expect(yr.availableRooms).toBe(7320);

    // cleanAdr uses PICK_LAST: the aggregator scans the 12 monthly adr fields backward and
    // returns the last non-zero value. With flat ADR (no ramp, no seasonality), all 12
    // months have adr=startAdr=$150, so PICK_LAST = $150.
    // NOTE: this is NOT revenueRooms/soldRooms (weighted average); see engine-edge-cases
    // "PICK_LAST vs weighted-average divergence" for a scenario that distinguishes them.
    expect(yr.cleanAdr).toBe(150);

    // revenueRooms: 5,124 × $150 = $768,600
    expect(yr.revenueRooms).toBeCloseTo(768_600, 0);

    // revenueTotal = revenueRooms because revShareFB=0, revShareEvents=0, revShareOther=0
    expect(yr.revenueTotal).toBeCloseTo(yr.revenueRooms, 2);

    // expenseTaxes: purchasePrice × costRateTaxes / 12 × 12 = 2,000,000 × 0.05 = $100,000
    expect(yr.expenseTaxes).toBeCloseTo(100_000, 0);

    // expenseFFE: revenueTotal × costRateFFE = 768,600 × 0.03 = $23,058
    expect(yr.expenseFFE).toBeCloseTo(23_058, 0);

    // NOI identity: noi = agop - expenseTaxes (from engine line: noi = agop - expenseTaxes)
    expect(yr.noi).toBeCloseTo(yr.agop - yr.expenseTaxes, 2);

    // ANOI identity: anoi = noi - expenseFFE
    expect(yr.anoi).toBeCloseTo(yr.noi - yr.expenseFFE, 2);

    // GOP is positive (revenue exceeds operating costs)
    expect(yr.gop).toBeGreaterThan(0);

    // All values finite
    assertAllFinite(yr as unknown as Record<string, unknown>, 'Hotel');
  });

  // ── Lodge ──────────────────────────────────────────────────────────────────

  it('Lodge: pinned soldRooms, revenueRooms, cleanAdr, NOI identity', () => {
    const input: PropertyInput = {
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

    const monthly = generatePropertyProForma(input, ZERO_GROWTH_GLOBAL);
    const yearly = aggregatePropertyByYear(monthly, 1);
    const yr = yearly[0];
    expect(yr).toBeDefined();

    // soldRooms: 8 rooms × 0.6 occ × 366 days = 1,756.8 (not integer: 0.6 × 366 = 219.6)
    expect(yr.soldRooms).toBeCloseTo(1_756.8, 1);

    // availableRooms: 8 × 366 = 2,928
    expect(yr.availableRooms).toBe(2928);

    // cleanAdr (PICK_LAST): all 12 months have adr=startAdr=$300 (flat — no ramp, no seasonality).
    // PICK_LAST returns the last non-zero monthly adr field = $300.
    expect(yr.cleanAdr).toBe(300);

    // revenueRooms: 1,756.8 × $300 = $527,040
    expect(yr.revenueRooms).toBeCloseTo(527_040, 0);

    // revenueTotal = revenueRooms (all revShares are 0)
    expect(yr.revenueTotal).toBeCloseTo(527_040, 0);

    // expenseTaxes: 1,200,000 × 0.05 = $60,000
    expect(yr.expenseTaxes).toBeCloseTo(60_000, 0);

    // expenseFFE: 527,040 × 0.03 = $15,811.20
    expect(yr.expenseFFE).toBeCloseTo(15_811.2, 0);

    // NOI identity
    expect(yr.noi).toBeCloseTo(yr.agop - yr.expenseTaxes, 2);

    // ANOI identity
    expect(yr.anoi).toBeCloseTo(yr.noi - yr.expenseFFE, 2);

    // noi is positive for Lodge at this rate/cost structure
    expect(yr.noi).toBeGreaterThan(0);

    // All values finite
    assertAllFinite(yr as unknown as Record<string, unknown>, 'Lodge');
  });

  // ── VRBO ───────────────────────────────────────────────────────────────────

  it('VRBO per_property: pinned soldRooms, revenueRooms, cleanAdr; NOI negative by design', () => {
    const input: PropertyInput = {
      ...BASE_COSTS,
      operationsStartDate: '2024-01-01',
      acquisitionDate: '2024-01-01',
      roomCount: 5,           // ignored for revenue in per_property mode
      startAdr: 400,          // ignored for revenue; nightlyPropertyRate is used instead
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

    const monthly = generatePropertyProForma(input, ZERO_GROWTH_GLOBAL);
    const yearly = aggregatePropertyByYear(monthly, 1);
    const yr = yearly[0];
    expect(yr).toBeDefined();

    // soldRooms for per_property: daysInYear × occupancy = 366 × 0.55 = 201.3
    // (roomCount is irrelevant — the whole property books as one unit per night)
    expect(yr.soldRooms).toBeCloseTo(201.3, 1);

    // cleanAdr (PICK_LAST): for per_property, monthly adr = nightlyPropertyRate × adrFactor × seasonFactor.
    // With no ramp and no seasonality, all 12 months have adr=$400. PICK_LAST = $400.
    // This is NOT revenueRooms/soldRooms (weighted average) — they happen to coincide here
    // because ADR is flat. See engine-edge-cases "PICK_LAST vs weighted-average divergence".
    expect(yr.cleanAdr).toBe(400);

    // revenueRooms: 201.3 × $400/night = $80,520
    expect(yr.revenueRooms).toBeCloseTo(80_520, 0);

    // revenueTotal = revenueRooms (all revShares are 0)
    expect(yr.revenueTotal).toBeCloseTo(80_520, 0);

    // expenseTaxes: 800,000 × 0.05 = $40,000 — this alone is ~50% of revenue
    expect(yr.expenseTaxes).toBeCloseTo(40_000, 0);

    // expenseFFE: 80,520 × 0.03 = $2,415.60
    expect(yr.expenseFFE).toBeCloseTo(2_415.6, 0);

    // NOI identity holds even when NOI is negative
    expect(yr.noi).toBeCloseTo(yr.agop - yr.expenseTaxes, 2);

    // ANOI identity
    expect(yr.anoi).toBeCloseTo(yr.noi - yr.expenseFFE, 2);

    // NOI is negative: high fixed costs (taxes + fees) exceed operating profit at this rate
    expect(yr.noi).toBeLessThan(0);

    // All values finite (negative NOI is expected, not NaN)
    assertAllFinite(yr as unknown as Record<string, unknown>, 'VRBO');
  });

  // ── Internal consistency identities (all 3 models) ─────────────────────────

  it('All models: GOP, NOI, and totalExpenses identities are exact', () => {
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

      const yr = aggregatePropertyByYear(generatePropertyProForma(input, ZERO_GROWTH_GLOBAL), 1)[0];

      // ── GOP identity ────────────────────────────────────────────────────────
      // Engine (property-engine.ts line 164-166):
      //   totalOperatingExpenses = expenseRooms + expenseFB + expenseEvents + expenseOther
      //     + expenseOtherCosts + expenseInsurance + expenseMarketing + expensePropertyOps
      //     + expenseUtilitiesVar + expenseUtilitiesFixed + expenseAdmin + expenseIT
      //     + expensePlatformFees + expensePreOpening   ← NOTE: preOpening is included
      //   gop = revenueTotal - totalOperatingExpenses
      const gopFromParts =
        yr.revenueTotal -
        (yr.expenseRooms + yr.expenseFB + yr.expenseEvents + yr.expenseOther +
         yr.expenseOtherCosts + yr.expenseInsurance + yr.expenseMarketing +
         yr.expensePropertyOps + yr.expenseUtilitiesVar + yr.expenseUtilitiesFixed +
         yr.expenseAdmin + yr.expenseIT + yr.expensePlatformFees + yr.expensePreOpening);
      expect(yr.gop).toBeCloseTo(gopFromParts, 2);

      // ── AGOP identity ───────────────────────────────────────────────────────
      expect(yr.agop).toBeCloseTo(yr.gop - yr.feeBase - yr.feeIncentive, 2);

      // ── NOI identity ────────────────────────────────────────────────────────
      expect(yr.noi).toBeCloseTo(yr.agop - yr.expenseTaxes, 2);

      // ── ANOI identity ───────────────────────────────────────────────────────
      expect(yr.anoi).toBeCloseTo(yr.noi - yr.expenseFFE, 2);

      // ── totalExpenses identity ──────────────────────────────────────────────
      // totalExpenses = totalOperatingExpenses + feeBase + feeIncentive + expenseTaxes + expenseFFE
      // Equivalently: NOI = revenueTotal - totalExpenses + expenseFFE
      expect(yr.noi).toBeCloseTo(yr.revenueTotal - yr.totalExpenses + yr.expenseFFE, 2);

      // ── All fields finite ───────────────────────────────────────────────────
      assertAllFinite(yr as unknown as Record<string, unknown>, `${model} consistency`);
    }
  });
});
