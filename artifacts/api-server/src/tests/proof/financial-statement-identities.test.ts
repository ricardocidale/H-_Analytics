/**
 * T010 — Financial Statement Identity Proofs
 *
 * Pins the algebraic invariants that hold across the income statement and
 * cash flow statement. A regression here means a line item drifted out of
 * its accounting relationship — not a rounding error or a product decision.
 *
 * Identities tested:
 *   IS-1  anoi = revenueTotal − totalExpenses   (income-statement completeness)
 *   IS-2  noi  = anoi + expenseFFE              (NOI excludes FF&E, ANOI includes it)
 *   IS-3  noi  = agop − expenseTaxes            (property-level waterfall)
 *   IS-4  revenueTotal = revenueRooms + revenueEvents + revenueFB + revenueOther
 *   CF-1  fcfe[y] = fcf[y] − principalPayment[y]           (FCFE = FCF − debt service)
 *   CF-2  fcf[acqYear] = cfo[acqYear] − equityInvested      (FCF in acquisition year)
 *   CF-3  fcf[y] = cfo[y]  for y ≠ acquisitionYear          (FCF = CFO post-acquisition)
 *
 * Note on IS-1: interestExpense and incomeTax are BELOW the ANOI line and are NOT
 * included in totalExpenses. The identity holds for both levered and unlevered runs.
 *
 * Note on FCFE (CF-1–CF-3): this is the boutique-hotel FCFE definition (MINOR-6).
 * It differs from standard FCFE (which uses netIncome + depreciation − capex − ΔWC −
 * principalPayment). Do not compare to external models without accounting for the delta.
 */
import { describe, it, expect } from 'vitest';
import { generatePropertyProForma } from '@server/finance/core/property-pipeline';
import { aggregatePropertyByYear, aggregateUnifiedByYear } from '@engine/aggregation/yearlyAggregator';
import { computeCashFlowSections } from '@engine/aggregation/cashFlowSections';
import type { PropertyInput, GlobalInput } from '@engine/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ZERO_DEBT_GLOBAL: GlobalInput = {
  modelStartDate: '2024-01-01',
  inflationRate: 0.0,
  marketingRate: 0.0,
  miscOpsRate: 0.0,
  debtAssumptions: { interestRate: 0.0, amortizationYears: 25, acqLTV: 0.0 },
};

const LEVERED_GLOBAL: GlobalInput = {
  modelStartDate: '2024-01-01',
  inflationRate: 0.0,
  marketingRate: 0.0,
  miscOpsRate: 0.0,
  debtAssumptions: { interestRate: 0.065, amortizationYears: 25, acqLTV: 0.65 },
};

const BASE_COSTS = {
  costRateRooms: 0.20,
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

/** Unlevered hotel — same as MINIMAL_HOTEL in engine-integrity-fixes.test.ts */
const HOTEL_UNLEVERED: PropertyInput = {
  ...BASE_COSTS,
  operationsStartDate: '2024-01-01',
  roomCount: 10,
  startAdr: 150,
  adrGrowthRate: 0,
  startOccupancy: 0.6,
  maxOccupancy: 0.6,
  occupancyRampMonths: 0,
  occupancyGrowthStep: 0,
  purchasePrice: 2_000_000,
  type: 'hotel',
};

/** Levered hotel — same shape but acquisition financing is active */
const HOTEL_LEVERED: PropertyInput = {
  ...BASE_COSTS,
  operationsStartDate: '2024-01-01',
  acquisitionDate: '2024-01-01',
  roomCount: 10,
  startAdr: 150,
  adrGrowthRate: 0,
  startOccupancy: 0.6,
  maxOccupancy: 0.6,
  occupancyRampMonths: 0,
  occupancyGrowthStep: 0,
  purchasePrice: 2_000_000,
  acquisitionLTV: 0.65,
  acquisitionInterestRate: 0.065,
  acquisitionTermYears: 25,
  type: 'hotel',
};

const PROJ_YEARS = 5;
const PROJ_MONTHS = PROJ_YEARS * 12;

// ── IS-1: anoi = revenueTotal − totalExpenses ─────────────────────────────────

describe('IS-1 — anoi = revenueTotal − totalExpenses (T010)', () => {
  it('identity holds for every year in a 5-year unlevered projection', () => {
    const monthly = generatePropertyProForma(HOTEL_UNLEVERED, ZERO_DEBT_GLOBAL, PROJ_MONTHS);
    const yearly = aggregatePropertyByYear(monthly, PROJ_YEARS);

    for (let y = 0; y < PROJ_YEARS; y++) {
      const yr = yearly[y];
      expect(yr.anoi, `year ${y}: anoi = revenueTotal − totalExpenses`).toBeCloseTo(
        yr.revenueTotal - yr.totalExpenses, 4,
      );
    }
  });

  it('identity holds for every year in a 5-year levered projection (interest is below ANOI line)', () => {
    // Interest expense is NOT included in totalExpenses — it appears in CFO as a
    // separate deduction. If interest ever leaks into totalExpenses this test fails.
    const monthly = generatePropertyProForma(HOTEL_LEVERED, LEVERED_GLOBAL, PROJ_MONTHS);
    const yearly = aggregatePropertyByYear(monthly, PROJ_YEARS);

    for (let y = 0; y < PROJ_YEARS; y++) {
      const yr = yearly[y];
      expect(yr.anoi, `year ${y}: anoi = revenueTotal − totalExpenses (levered)`).toBeCloseTo(
        yr.revenueTotal - yr.totalExpenses, 4,
      );
    }
  });
});

// ── IS-2: noi = anoi + expenseFFE ─────────────────────────────────────────────

describe('IS-2 — noi = anoi + expenseFFE (T010)', () => {
  it('identity holds for every year (unlevered)', () => {
    const monthly = generatePropertyProForma(HOTEL_UNLEVERED, ZERO_DEBT_GLOBAL, PROJ_MONTHS);
    const yearly = aggregatePropertyByYear(monthly, PROJ_YEARS);

    for (let y = 0; y < PROJ_YEARS; y++) {
      const yr = yearly[y];
      expect(yr.noi, `year ${y}: noi = anoi + expenseFFE`).toBeCloseTo(
        yr.anoi + yr.expenseFFE, 4,
      );
    }
  });
});

// ── IS-3: noi = agop − expenseTaxes ──────────────────────────────────────────

describe('IS-3 — noi = agop − expenseTaxes per property (T010)', () => {
  it('identity holds for every year (unlevered)', () => {
    const monthly = generatePropertyProForma(HOTEL_UNLEVERED, ZERO_DEBT_GLOBAL, PROJ_MONTHS);
    const yearly = aggregatePropertyByYear(monthly, PROJ_YEARS);

    for (let y = 0; y < PROJ_YEARS; y++) {
      const yr = yearly[y];
      expect(yr.noi, `year ${y}: noi = agop − expenseTaxes`).toBeCloseTo(
        yr.agop - yr.expenseTaxes, 4,
      );
    }
  });

  it('identity holds for every year (levered)', () => {
    const monthly = generatePropertyProForma(HOTEL_LEVERED, LEVERED_GLOBAL, PROJ_MONTHS);
    const yearly = aggregatePropertyByYear(monthly, PROJ_YEARS);

    for (let y = 0; y < PROJ_YEARS; y++) {
      const yr = yearly[y];
      expect(yr.noi, `year ${y}: noi = agop − expenseTaxes (levered)`).toBeCloseTo(
        yr.agop - yr.expenseTaxes, 4,
      );
    }
  });
});

// ── IS-4: revenueTotal = sum of revenue lines ─────────────────────────────────

describe('IS-4 — revenueTotal = revenueRooms + revenueEvents + revenueFB + revenueOther (T010)', () => {
  it('identity holds for every year (mixed revenue streams)', () => {
    const monthly = generatePropertyProForma(HOTEL_UNLEVERED, ZERO_DEBT_GLOBAL, PROJ_MONTHS);
    const yearly = aggregatePropertyByYear(monthly, PROJ_YEARS);

    for (let y = 0; y < PROJ_YEARS; y++) {
      const yr = yearly[y];
      const revenueSum = yr.revenueRooms + yr.revenueEvents + yr.revenueFB + yr.revenueOther;
      expect(yr.revenueTotal, `year ${y}: revenueTotal = sum of components`).toBeCloseTo(
        revenueSum, 4,
      );
    }
  });
});

// ── CF-1, CF-2, CF-3: FCFE identity via computeCashFlowSections ───────────────

describe('CF-1/2/3 — FCFE = FCF − principalPayment (boutique-hotel definition, MINOR-6) (T010)', () => {
  it('CF-1: fcfe[y] = fcf[y] − principalPayment[y] for all years', () => {
    // The boutique-hotel FCFE definition:
    //   FCFE = CFO − acquisitionYearEquity − principalPayment
    // i.e., FCF = CFO − acquisitionYearEquity; FCFE = FCF − principalPayment
    const { yearlyIS, yearlyCF } = aggregateUnifiedByYear(
      generatePropertyProForma(HOTEL_LEVERED, LEVERED_GLOBAL, PROJ_MONTHS),
      HOTEL_LEVERED as Parameters<typeof aggregateUnifiedByYear>[1],
      LEVERED_GLOBAL as Parameters<typeof aggregateUnifiedByYear>[2],
      PROJ_YEARS,
    );

    // equityInvested is capitalExpenditures in the acquisition year (year 0)
    const equityInvested = yearlyCF[0].capitalExpenditures;
    const loanAmount = HOTEL_LEVERED.purchasePrice * (HOTEL_LEVERED.acquisitionLTV ?? 0);

    const sections = computeCashFlowSections(
      yearlyIS,
      yearlyCF,
      { equityInvested, loanAmount },
      0,               // acquisitionYear = year 0 (acquisitionDate = modelStartDate)
      HOTEL_LEVERED.purchasePrice,
      PROJ_YEARS,
    );

    for (let y = 0; y < PROJ_YEARS; y++) {
      expect(sections.fcfe[y], `year ${y}: fcfe = fcf − principalPayment`).toBeCloseTo(
        sections.fcf[y] - yearlyCF[y].principalPayment, 4,
      );
    }
  });

  it('CF-2: fcf in acquisition year = cfo − equityInvested', () => {
    const { yearlyIS, yearlyCF } = aggregateUnifiedByYear(
      generatePropertyProForma(HOTEL_LEVERED, LEVERED_GLOBAL, PROJ_MONTHS),
      HOTEL_LEVERED as Parameters<typeof aggregateUnifiedByYear>[1],
      LEVERED_GLOBAL as Parameters<typeof aggregateUnifiedByYear>[2],
      PROJ_YEARS,
    );

    const equityInvested = yearlyCF[0].capitalExpenditures;
    const loanAmount = HOTEL_LEVERED.purchasePrice * (HOTEL_LEVERED.acquisitionLTV ?? 0);

    const sections = computeCashFlowSections(
      yearlyIS, yearlyCF,
      { equityInvested, loanAmount },
      0,
      HOTEL_LEVERED.purchasePrice,
      PROJ_YEARS,
    );

    // In the acquisition year (y=0), FCF = CFO − equityInvested (equity is a capex outflow)
    expect(sections.fcf[0], 'fcf[0] = cfo[0] − equityInvested').toBeCloseTo(
      sections.cashFromOperations[0] - equityInvested, 4,
    );
  });

  it('CF-3: fcf[y] = cfo[y] for all non-acquisition years', () => {
    const { yearlyIS, yearlyCF } = aggregateUnifiedByYear(
      generatePropertyProForma(HOTEL_LEVERED, LEVERED_GLOBAL, PROJ_MONTHS),
      HOTEL_LEVERED as Parameters<typeof aggregateUnifiedByYear>[1],
      LEVERED_GLOBAL as Parameters<typeof aggregateUnifiedByYear>[2],
      PROJ_YEARS,
    );

    const equityInvested = yearlyCF[0].capitalExpenditures;
    const loanAmount = HOTEL_LEVERED.purchasePrice * (HOTEL_LEVERED.acquisitionLTV ?? 0);

    const sections = computeCashFlowSections(
      yearlyIS, yearlyCF,
      { equityInvested, loanAmount },
      0,
      HOTEL_LEVERED.purchasePrice,
      PROJ_YEARS,
    );

    for (let y = 1; y < PROJ_YEARS; y++) {
      expect(sections.fcf[y], `year ${y}: fcf = cfo (no equity outflow outside acquisition year)`).toBeCloseTo(
        sections.cashFromOperations[y], 4,
      );
    }
  });

  it('CF-1 unlevered: fcfe[y] = fcf[y] when principalPayment = 0', () => {
    // With zero debt, FCFE = FCF (no principal to subtract)
    const { yearlyIS, yearlyCF } = aggregateUnifiedByYear(
      generatePropertyProForma(HOTEL_UNLEVERED, ZERO_DEBT_GLOBAL, PROJ_MONTHS),
      HOTEL_UNLEVERED as Parameters<typeof aggregateUnifiedByYear>[1],
      ZERO_DEBT_GLOBAL as Parameters<typeof aggregateUnifiedByYear>[2],
      PROJ_YEARS,
    );

    const sections = computeCashFlowSections(
      yearlyIS, yearlyCF,
      { equityInvested: HOTEL_UNLEVERED.purchasePrice, loanAmount: 0 },
      0,
      HOTEL_UNLEVERED.purchasePrice,
      PROJ_YEARS,
    );

    for (let y = 0; y < PROJ_YEARS; y++) {
      expect(sections.fcfe[y], `year ${y}: fcfe = fcf when no debt`).toBeCloseTo(
        sections.fcf[y], 4,
      );
    }
  });
});
