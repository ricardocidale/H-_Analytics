/**
 * T012 — Regression Snapshots
 *
 * Pins engine output against stable baseline values so that any change to the
 * core computation pipeline surfaces as a deliberate test failure rather than
 * silent drift.
 *
 * Strategy:
 *   - Three canonical scenarios (Hotel, Lodge, VRBO) with fully fixed inputs.
 *   - inflationRate: 0.0, adrGrowthRate: 0.0 — zero-growth for maximum
 *     determinism (avoids accumulated float drift across 60 months).
 *   - projectionYears: 5 to cover occupancy ramp and stable operating period.
 *
 * Pin provenance:
 *   Year-1 soldRooms, revenueRooms, and expenseTaxes are derived analytically from
 *   the raw inputs (see derivation comments next to each assertion) and are NOT copied
 *   from engine output. Stability assertions across years 2–5 are regression guards —
 *   they detect drift but rely on the year-1 pin to anchor the value. If an engine
 *   change alters a pinned value, update the constant AND the derivation comment.
 *
 * How to update: run `pnpm exec vitest run src/tests/proof/regression-snapshots.test.ts`
 * after intentional engine changes, inspect new values, update EXPECTED_* constants,
 * and add a comment explaining the change and the PR that introduced it.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { generatePropertyProForma } from '@server/finance/core/property-pipeline';
import { aggregatePropertyByYear } from '@server/finance/core/yearly-aggregator';
import { stableHash } from '@server/scenarios/stable-json';
import { dRound } from '@calc/shared/decimal';
import type { PropertyInput, GlobalInput } from '@engine/types';

const ZERO_GROWTH_GLOBAL: GlobalInput = {
  modelStartDate: '2024-01-01',
  inflationRate: 0.0,
  marketingRate: 0.0,
  miscOpsRate: 0.0,
  debtAssumptions: {
    interestRate: 0.0,
    amortizationYears: 25,
  },
};

const PROJ_YEARS = 5;
const PROJ_MONTHS = PROJ_YEARS * 12;

const SHARED_COSTS = {
  costRateRooms: 0.25,
  costRateFB: 0.30,
  costRateAdmin: 0.08,
  costRateMarketing: 0.04,
  costRatePropertyOps: 0.04,
  costRateUtilities: 0.04,
  costRateTaxes: 0.04,
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

// ── Canonical scenario inputs ─────────────────────────────────────────────────

const HOTEL_CANONICAL: PropertyInput = {
  ...SHARED_COSTS,
  name: 'Regression Hotel',
  operationsStartDate: '2024-01-01',
  acquisitionDate: '2024-01-01',
  roomCount: 20,
  startAdr: 150,
  adrGrowthRate: 0.0,
  startOccupancy: 0.65,
  maxOccupancy: 0.65,
  occupancyRampMonths: 0,
  occupancyGrowthStep: 0,
  purchasePrice: 2_000_000,
  type: 'hotel',
  businessModel: 'hotel',
  pricingModel: 'per_room',
};

const LODGE_CANONICAL: PropertyInput = {
  ...SHARED_COSTS,
  name: 'Regression Lodge',
  operationsStartDate: '2024-01-01',
  acquisitionDate: '2024-01-01',
  roomCount: 8,
  startAdr: 300,
  adrGrowthRate: 0.0,
  startOccupancy: 0.60,
  maxOccupancy: 0.60,
  occupancyRampMonths: 0,
  occupancyGrowthStep: 0,
  purchasePrice: 1_200_000,
  type: 'lodge',
  businessModel: 'lodge',
  pricingModel: 'per_room',
};

const VRBO_CANONICAL: PropertyInput = {
  ...SHARED_COSTS,
  name: 'Regression VRBO',
  operationsStartDate: '2024-01-01',
  acquisitionDate: '2024-01-01',
  roomCount: 5,
  startAdr: 400,
  adrGrowthRate: 0.0,
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

describe('Regression Snapshots (T012)', () => {
  describe('Hotel canonical scenario', () => {
    let yearly: ReturnType<typeof aggregatePropertyByYear>;

    beforeAll(() => {
      const monthly = generatePropertyProForma(HOTEL_CANONICAL, ZERO_GROWTH_GLOBAL, PROJ_MONTHS);
      yearly = aggregatePropertyByYear(monthly, PROJ_YEARS);
    });

    it('produces the expected number of projection years', () => {
      expect(yearly).toHaveLength(PROJ_YEARS);
    });

    it('year 1 soldRooms is stable (zero-growth baseline — 2024 leap year)', () => {
      // 20 rooms × 0.65 occ × 366 days = 4758 sold rooms in leap year 2024
      expect(yearly[0].soldRooms).toBe(4758);
    });

    it('year 1 revenueRooms is stable', () => {
      // 4758 × $150 ADR = $713,700
      expect(dRound(yearly[0].revenueRooms, 2)).toBe(713_700);
    });

    it('NOI identity holds every year: noi = agop - expenseTaxes', () => {
      for (let y = 0; y < PROJ_YEARS; y++) {
        expect(yearly[y].noi).toBeCloseTo(yearly[y].agop - yearly[y].expenseTaxes, 2);
      }
    });

    it('revenueTotal ≥ revenueRooms every year', () => {
      for (const yr of yearly) {
        expect(yr.revenueTotal).toBeGreaterThanOrEqual(yr.revenueRooms - 0.01);
      }
    });

    it('year-over-year soldRooms is stable (zero-growth: same every year after year 1)', () => {
      for (let y = 1; y < PROJ_YEARS; y++) {
        expect(yearly[y].soldRooms).toBe(yearly[0].soldRooms);
      }
    });

    it('all yearly values are finite', () => {
      for (const yr of yearly) {
        for (const [key, val] of Object.entries(yr)) {
          if (typeof val === 'number' && key !== 'year') {
            expect(Number.isFinite(val), `hotel yearly.${key}`).toBe(true);
          }
        }
      }
    });

    it('inputHash is stable — same inputs always hash identically', () => {
      const h1 = stableHash(HOTEL_CANONICAL);
      const h2 = stableHash(HOTEL_CANONICAL);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Lodge canonical scenario', () => {
    let yearly: ReturnType<typeof aggregatePropertyByYear>;

    beforeAll(() => {
      const monthly = generatePropertyProForma(LODGE_CANONICAL, ZERO_GROWTH_GLOBAL, PROJ_MONTHS);
      yearly = aggregatePropertyByYear(monthly, PROJ_YEARS);
    });

    it('produces the expected number of projection years', () => {
      expect(yearly).toHaveLength(PROJ_YEARS);
    });

    it('year 1 soldRooms is stable (zero-growth baseline)', () => {
      // 8 rooms × 0.60 occ × 366 days (engine uses 30.5 days/month fixed) = 1,756.8
      expect(yearly[0].soldRooms).toBeCloseTo(1_756.8, 1);
    });

    it('year 1 revenueRooms is stable', () => {
      // 1,756.8 sold rooms × $300 ADR = $527,040
      expect(dRound(yearly[0].revenueRooms, 2)).toBe(527_040);
    });

    it('year 1 expenseTaxes is stable', () => {
      // purchasePrice $1,200,000 × costRateTaxes 0.04 = $48,000
      expect(dRound(yearly[0].expenseTaxes, 2)).toBe(48_000);
    });

    it('NOI identity holds every year', () => {
      for (let y = 0; y < PROJ_YEARS; y++) {
        expect(yearly[y].noi).toBeCloseTo(yearly[y].agop - yearly[y].expenseTaxes, 2);
      }
    });

    it('year-over-year soldRooms is stable (zero-growth)', () => {
      for (let y = 1; y < PROJ_YEARS; y++) {
        expect(yearly[y].soldRooms).toBe(yearly[0].soldRooms);
      }
    });

    it('all yearly values are finite', () => {
      for (const yr of yearly) {
        for (const [key, val] of Object.entries(yr)) {
          if (typeof val === 'number' && key !== 'year') {
            expect(Number.isFinite(val), `lodge yearly.${key}`).toBe(true);
          }
        }
      }
    });
  });

  describe('VRBO canonical scenario', () => {
    let yearly: ReturnType<typeof aggregatePropertyByYear>;

    beforeAll(() => {
      const monthly = generatePropertyProForma(VRBO_CANONICAL, ZERO_GROWTH_GLOBAL, PROJ_MONTHS);
      yearly = aggregatePropertyByYear(monthly, PROJ_YEARS);
    });

    it('produces the expected number of projection years', () => {
      expect(yearly).toHaveLength(PROJ_YEARS);
    });

    it('year 1 soldRooms is stable (per-property pricing — roomCount irrelevant)', () => {
      // per_property: soldRooms = daysPerYear × occupancy (whole unit, not per room)
      // 366 days × 0.55 occ = 201.3 nights
      expect(yearly[0].soldRooms).toBeCloseTo(201.3, 1);
    });

    it('year 1 revenueRooms is stable', () => {
      // 201.3 nights × $400 nightlyPropertyRate = $80,520
      expect(dRound(yearly[0].revenueRooms, 2)).toBe(80_520);
    });

    it('year 1 expenseTaxes is stable', () => {
      // purchasePrice $800,000 × costRateTaxes 0.04 = $32,000
      expect(dRound(yearly[0].expenseTaxes, 2)).toBe(32_000);
    });

    it('NOI identity holds every year', () => {
      for (let y = 0; y < PROJ_YEARS; y++) {
        expect(yearly[y].noi).toBeCloseTo(yearly[y].agop - yearly[y].expenseTaxes, 2);
      }
    });

    it('year-over-year soldRooms is stable (zero-growth)', () => {
      for (let y = 1; y < PROJ_YEARS; y++) {
        expect(yearly[y].soldRooms).toBe(yearly[0].soldRooms);
      }
    });

    it('all yearly values are finite', () => {
      for (const yr of yearly) {
        for (const [key, val] of Object.entries(yr)) {
          if (typeof val === 'number' && key !== 'year') {
            expect(Number.isFinite(val), `vrbo yearly.${key}`).toBe(true);
          }
        }
      }
    });
  });

  describe('Cross-scenario invariants', () => {
    it('three canonical inputs produce three distinct outputHashes', () => {
      const hHotel = stableHash(HOTEL_CANONICAL);
      const hLodge = stableHash(LODGE_CANONICAL);
      const hVrbo = stableHash(VRBO_CANONICAL);
      expect(hHotel).not.toBe(hLodge);
      expect(hLodge).not.toBe(hVrbo);
      expect(hHotel).not.toBe(hVrbo);
    });

    it('modifying one field changes the hash (regression guard)', () => {
      const modified = { ...HOTEL_CANONICAL, startAdr: 151 };
      expect(stableHash(HOTEL_CANONICAL)).not.toBe(stableHash(modified));
    });
  });
});
