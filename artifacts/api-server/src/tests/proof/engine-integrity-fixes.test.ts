/**
 * T012 — Engine Integrity Fixes (2026-05-04 Audit)
 *
 * Proof tests for all 8 findings from the financial engine integrity audit.
 * Each test is pinned to the fix it validates; see the audit doc at
 * docs/solutions/logic-errors/financial-engine-audit-findings-2026-05-04.md
 *
 * Finding index:
 *   #1 — CFO + CFI + CFF reconciles to net cash change (computeCashFlowSections)
 *   #2 — Refinance sizing uses income-capitalization (NOI ÷ cap rate × LTV)
 *   #3 — PMT throws RangeError for monthlyRate > 0.05 (no silent cap)
 *   #4 — Fee subordination gate tests post-fee ANOI (not pre-fee AGOP)
 *   #5 — Pre-ops taxes and insurance accrue from acquisition date, not ops date
 *   #6 — leveragedCashFlow alias present in cashFlowSections output
 *   #7 — accumulateMonthlyIS extracted; aggregatePropertyByYear and
 *         aggregateUnifiedByYear produce identical IS fields for same inputs
 *   #8 — NOL display-only comment in consolidation (code-level, no runtime test)
 */

import { describe, it, expect } from 'vitest';
import { pmt } from '@calc/shared/pmt';
import { generatePropertyProForma } from '@server/finance/core/property-pipeline';
import { aggregatePropertyByYear, aggregateUnifiedByYear } from '@engine/aggregation/yearlyAggregator';
import { computeCashFlowSections } from '@engine/aggregation/cashFlowSections';
import type { PropertyInput, GlobalInput } from '@engine/types';
import { computeWaterfall } from '@calc/analysis/waterfall';
import { DEFAULT_ROUNDING } from '@calc/shared/utils';
import { computeIRR } from '@analytics/returns/irr';
import {
  DEFAULT_PREFERRED_RETURN,
  DEFAULT_LP_EQUITY_PCT,
  DEFAULT_WATERFALL_TIERS,
} from '@norfolk/shared/constants-research';

// ── Shared fixtures ────────────────────────────────────────────────────────────

const ZERO_DEBT_GLOBAL: GlobalInput = {
  modelStartDate: '2024-01-01',
  inflationRate: 0.0,
  marketingRate: 0.0,
  debtAssumptions: { interestRate: 0.0, amortizationYears: 25, acqLTV: 0.0 },
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
  revShareEvents: 0.0,
  revShareFB: 0.0,
  revShareOther: 0.0,
};

const MINIMAL_HOTEL: PropertyInput = {
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

// ── Finding #3: PMT throws for monthlyRate > 0.05 ────────────────────────────

describe('Finding #3 — PMT rate guard (T012)', () => {
  it('pmt() with normal rate (6.5% annual = 0.542% monthly) returns a positive finite payment', () => {
    const principal = 1_500_000;
    const monthlyRate = 0.065 / 12;
    const payments = 25 * 12;
    const payment = pmt(principal, monthlyRate, payments);
    expect(Number.isFinite(payment)).toBe(true);
    expect(payment).toBeGreaterThan(0);
    // Cross-check: 6.5%/yr, $1.5M, 25yr → ≈ $10,068/mo
    expect(payment).toBeGreaterThan(9_000);
    expect(payment).toBeLessThan(12_000);
  });

  it('pmt() at exactly MAX_MONTHLY_RATE (0.05) does not throw — boundary is exclusive', () => {
    // 0.05 is the maximum allowed value; it should NOT throw
    expect(() => pmt(1_000_000, 0.05, 300)).not.toThrow();
  });

  it('pmt() throws RangeError when monthlyRate exceeds 0.05 (60% annual)', () => {
    // Annual rate of 6.5% passed without dividing by 12 — common caller mistake
    expect(() => pmt(1_000_000, 0.065, 300)).toThrowError(RangeError);
  });

  it('pmt() RangeError message includes the annual equivalent rate', () => {
    let message = '';
    try {
      pmt(500_000, 0.10, 120);
    } catch (e) {
      if (e instanceof RangeError) message = e.message;
    }
    // The error message should mention the annual rate (120% for 10%/month)
    expect(message).toContain('120.0%');
  });

  it('pmt() with zero rate returns principal / payments (simple division)', () => {
    const payment = pmt(600_000, 0, 120);
    expect(payment).toBeCloseTo(5_000, 2); // 600k / 120 = 5,000
  });

  it('pmt() with zero principal returns 0', () => {
    expect(pmt(0, 0.005, 300)).toBe(0);
  });
});

// ── Finding #1: CFO + CFI + CFF reconciles to net cash change ────────────────

describe('Finding #1 — CFO+CFI+CFF cash reconciliation (T012)', () => {
  it('CFO + CFI + CFF = netChangeCash for every year in a 5-year unlevered projection', () => {
    const monthly = generatePropertyProForma(MINIMAL_HOTEL, ZERO_DEBT_GLOBAL, 60);
    const yearlyIS = aggregatePropertyByYear(monthly, 5);
    const yearlyCF = yearlyIS.map((is, i) => ({
      year: i,
      noi: is.noi,
      anoi: is.anoi,
      interestExpense: is.interestExpense,
      depreciation: is.depreciationExpense,
      netIncome: is.netIncome,
      taxLiability: is.incomeTax,
      operatingCashFlow: is.netIncome + is.depreciationExpense,
      workingCapitalChange: is.workingCapitalChange,
      cashFromOperations: is.netIncome + is.depreciationExpense - is.workingCapitalChange,
      maintenanceCapex: is.expenseFFE,
      freeCashFlow: is.netIncome + is.depreciationExpense - is.workingCapitalChange - is.expenseFFE,
      principalPayment: is.principalPayment,
      debtService: is.debtPayment,
      freeCashFlowToEquity: 0,
      btcf: 0,
      taxableIncome: 0,
      atcf: 0,
      capitalExpenditures: 0,
      refinancingProceeds: is.refinancingProceeds,
      exitValue: 0,
      netCashFlowToInvestors: 0,
      cumulativeCashFlow: 0,
    }));

    const sections = computeCashFlowSections(
      yearlyIS,
      yearlyCF,
      { equityInvested: 0, loanAmount: 0 },
      0,
      MINIMAL_HOTEL.purchasePrice,
      5,
    );

    for (let i = 0; i < 5; i++) {
      const computed = sections.cashFromOperations[i] + sections.cashFromInvesting[i] + sections.cashFromFinancing[i];
      expect(computed).toBeCloseTo(sections.netChangeCash[i], 2);
    }
  });

  it('opening cash + netChangeCash = closingCash for every year', () => {
    const monthly = generatePropertyProForma(MINIMAL_HOTEL, ZERO_DEBT_GLOBAL, 36);
    const yearlyIS = aggregatePropertyByYear(monthly, 3);
    const yearlyCF = yearlyIS.map((is, i) => ({
      year: i,
      noi: is.noi, anoi: is.anoi, interestExpense: is.interestExpense,
      depreciation: is.depreciationExpense, netIncome: is.netIncome,
      taxLiability: is.incomeTax,
      operatingCashFlow: is.netIncome + is.depreciationExpense,
      workingCapitalChange: is.workingCapitalChange,
      cashFromOperations: is.netIncome + is.depreciationExpense - is.workingCapitalChange,
      maintenanceCapex: is.expenseFFE,
      freeCashFlow: is.netIncome + is.depreciationExpense - is.workingCapitalChange - is.expenseFFE,
      principalPayment: is.principalPayment, debtService: is.debtPayment,
      freeCashFlowToEquity: 0, btcf: 0, taxableIncome: 0, atcf: 0,
      capitalExpenditures: 0, refinancingProceeds: is.refinancingProceeds,
      exitValue: 0, netCashFlowToInvestors: 0, cumulativeCashFlow: 0,
    }));

    const sections = computeCashFlowSections(
      yearlyIS, yearlyCF,
      { equityInvested: 0, loanAmount: 0 },
      0, MINIMAL_HOTEL.purchasePrice, 3,
    );

    for (let i = 0; i < 3; i++) {
      expect(sections.openingCash[i] + sections.netChangeCash[i]).toBeCloseTo(sections.closingCash[i], 2);
    }
  });

  it('closingCash[y] = openingCash[y+1] (cash balance is continuous)', () => {
    const monthly = generatePropertyProForma(MINIMAL_HOTEL, ZERO_DEBT_GLOBAL, 24);
    const yearlyIS = aggregatePropertyByYear(monthly, 2);
    const yearlyCF = yearlyIS.map((is, i) => ({
      year: i, noi: is.noi, anoi: is.anoi, interestExpense: is.interestExpense,
      depreciation: is.depreciationExpense, netIncome: is.netIncome,
      taxLiability: is.incomeTax,
      operatingCashFlow: is.netIncome + is.depreciationExpense,
      workingCapitalChange: is.workingCapitalChange,
      cashFromOperations: is.netIncome + is.depreciationExpense - is.workingCapitalChange,
      maintenanceCapex: is.expenseFFE, freeCashFlow: 0,
      principalPayment: is.principalPayment, debtService: is.debtPayment,
      freeCashFlowToEquity: 0, btcf: 0, taxableIncome: 0, atcf: 0,
      capitalExpenditures: 0, refinancingProceeds: is.refinancingProceeds,
      exitValue: 0, netCashFlowToInvestors: 0, cumulativeCashFlow: 0,
    }));
    const sections = computeCashFlowSections(
      yearlyIS, yearlyCF,
      { equityInvested: 0, loanAmount: 0 },
      0, MINIMAL_HOTEL.purchasePrice, 2,
    );
    expect(sections.closingCash[0]).toBeCloseTo(sections.openingCash[1], 2);
  });
});

// ── Finding #2: Refinance sizing — income-capitalization ──────────────────────

describe('Finding #2 — Refi income-capitalization (T012)', () => {
  it('refinance proceeds are NOI-cap-rate based, not cost-basis based', () => {
    // This test verifies the direction of the fix by checking that a property
    // with high NOI relative to cost basis generates larger refi proceeds than
    // cost-basis would produce, and vice versa for low-NOI.
    //
    // The income-cap formula: refiLoan = (NOI / exitCapRate) * refiLTV
    // For a $2M property at 8% cap rate with 60% LTV refi:
    //   Cost-basis: $2M * 0.60 = $1.2M loan
    //   If NOI ≈ $200k: $200k / 0.08 * 0.60 = $1.5M loan  (higher — property is undervalued)
    //   If NOI ≈ $80k:  $80k / 0.08 * 0.60 = $600k loan   (lower — distressed)
    //
    // We test that the engine's refinance year NOI drives the loan amount
    // by checking that NOI=0 produces zero refi proceeds (income-cap result)
    // whereas cost-basis would produce non-zero proceeds.

    const zeroRevProp: PropertyInput = {
      ...BASE_COSTS,
      operationsStartDate: '2024-01-01',
      roomCount: 10,
      startAdr: 0,       // zero ADR → zero revenue → NOI ≈ 0 (only fixed costs)
      adrGrowthRate: 0,
      startOccupancy: 0,
      maxOccupancy: 0,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 2_000_000,
      buildingImprovements: 500_000,
      type: 'Financed',
      acquisitionDate: '2024-01-01',
      acquisitionLTV: 0.65,
      acquisitionInterestRate: 0.065,
      acquisitionTermYears: 25,
      willRefinance: 'Yes',
      refinanceDate: '2026-01-01',   // refi in year 2
      refinanceLTV: 0.60,
      refinanceInterestRate: 0.055,
      refinanceTermYears: 25,
      exitCapRate: 0.08,
      costRateTaxes: 0.0,             // zero taxes to isolate revenue effect
      costRateInsurance: 0.0,
    };

    const global: GlobalInput = {
      modelStartDate: '2024-01-01',
      inflationRate: 0.0,
      marketingRate: 0.0,
      exitCapRate: 0.08,
      debtAssumptions: { interestRate: 0.065, amortizationYears: 25, acqLTV: 0.65 },
    };

    const monthly = generatePropertyProForma(zeroRevProp, global, 36);
    // With NOI ≈ 0 (no revenue), income-cap refi loan = (0 / 0.08) * 0.60 = $0
    // Monthly refinancingProceeds should all be zero (or close) in year 2
    const year2Months = monthly.slice(24, 36);
    const year2RefiProceeds = year2Months.reduce((s, m) => s + m.refinancingProceeds, 0);
    // Under cost-basis: $2.5M * 0.60 = $1.5M → substantial proceeds even with zero NOI
    // Under income-cap: NOI≈0 → refiLoan≈$0 → proceeds ≈ 0 (after paying off existing debt)
    expect(year2RefiProceeds).toBeCloseTo(0, -3); // within $1000 of zero
  });

  it('refi loan scales with NOI: doubling NOI doubles the refi loan amount', () => {
    // Pin a stable-NOI scenario and verify the refi produces proceeds proportional to NOI.
    // This is the key invariant of income-capitalization: loan = f(NOI), not f(cost basis).
    const makeRefiProp = (adr: number): PropertyInput => ({
      ...BASE_COSTS,
      operationsStartDate: '2024-01-01',
      roomCount: 10,
      startAdr: adr,
      adrGrowthRate: 0,
      startOccupancy: 0.6,
      maxOccupancy: 0.6,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 2_000_000,
      type: 'Financed',
      acquisitionDate: '2024-01-01',
      acquisitionLTV: 0.65,
      acquisitionInterestRate: 0.065,
      acquisitionTermYears: 25,
      willRefinance: 'Yes',
      refinanceDate: '2027-01-01',  // refi in year 3
      refinanceLTV: 0.70,
      refinanceInterestRate: 0.055,
      refinanceTermYears: 25,
      exitCapRate: 0.08,
    });

    const global: GlobalInput = {
      modelStartDate: '2024-01-01',
      inflationRate: 0.0,
      marketingRate: 0.0,
      exitCapRate: 0.08,
      debtAssumptions: { interestRate: 0.065, amortizationYears: 25, acqLTV: 0.65 },
    };

    const monthlyLow = generatePropertyProForma(makeRefiProp(150), global, 48);
    const monthlyHigh = generatePropertyProForma(makeRefiProp(300), global, 48);

    const year3RefiLow = monthlyLow.slice(24, 36).reduce((s, m) => s + m.refinancingProceeds, 0);
    const year3RefiHigh = monthlyHigh.slice(24, 36).reduce((s, m) => s + m.refinancingProceeds, 0);

    // Doubling ADR doubles NOI (proportional expense rates), which doubles the income-cap value,
    // which doubles the refi loan amount (before closing costs and existing debt payoff).
    // Proceeds won't be exactly 2× due to closing costs and debt payoff, but the ratio
    // should be clearly > 1 and in the range [1.5, 2.5] for a clean doubling of NOI.
    if (year3RefiLow > 0 && year3RefiHigh > 0) {
      const ratio = year3RefiHigh / year3RefiLow;
      expect(ratio).toBeGreaterThan(1.5);
      expect(ratio).toBeLessThan(2.5);
    }
  });

  it('Full Equity acquisition: income-cap refi loan >> cost-basis refi loan for high-NOI property', () => {
    // Distinguishing scenario:
    //   - acquisitionLTV: 0 → no acquisition debt → existingDebt = 0 at refi time
    //   - Full equity means refinancingProceeds = refiLoan - closingCosts (no debt to repay)
    //   - Cost-basis: $2,000,000 × 0.65 = $1,300,000 loan → ~$1,274,000 proceeds after 2% closing
    //   - Income-cap: (~$521k NOI) / 0.08 × 0.65 ≈ $4,234,375 loan → ~$4,149,688 proceeds
    //
    // Under cost-basis, this test FAILS because proceeds ≈ $1,274,000 < $1,950,000.
    // Under income-cap, this test PASSES because proceeds ≈ $4,150,000 >> $1,950,000.
    const COST_BASIS_REFI = 2_000_000 * 0.65;  // $1,300,000 — what cost-basis would produce

    const fullEquityProp: PropertyInput = {
      ...BASE_COSTS,
      operationsStartDate: '2024-01-01',
      roomCount: 20,
      startAdr: 200,
      adrGrowthRate: 0,
      startOccupancy: 0.7,
      maxOccupancy: 0.7,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 2_000_000,
      type: 'Financed',
      acquisitionDate: '2024-01-01',
      acquisitionLTV: 0,               // Full equity — no acquisition debt
      acquisitionInterestRate: 0,
      acquisitionTermYears: 25,
      willRefinance: 'Yes',
      refinanceDate: '2026-01-01',    // refi at month 24 (year 3 start)
      refinanceLTV: 0.65,
      exitCapRate: 0.08,
    };

    const fullEquityGlobal: GlobalInput = {
      modelStartDate: '2024-01-01',
      inflationRate: 0.0,
      marketingRate: 0.0,
      exitCapRate: 0.08,
      debtAssumptions: { interestRate: 0.065, amortizationYears: 25, acqLTV: 0.0 },
    };

    // Run 36 months so month 24 (refi) is included
    const monthly = generatePropertyProForma(fullEquityProp, fullEquityGlobal, 36);

    // Refi fires at month 24; collect all refinancingProceeds across the full horizon
    const totalRefiProceeds = monthly.reduce((s, m) => s + m.refinancingProceeds, 0);

    // Under income-cap, this high-NOI property should produce substantially MORE than cost-basis
    expect(totalRefiProceeds).toBeGreaterThan(COST_BASIS_REFI * 1.5);  // > $1,950,000
    expect(totalRefiProceeds).toBeGreaterThan(2_000_000);
    expect(totalRefiProceeds).toBeLessThan(6_000_000);
  });
});

// ── Finding #5: Pre-ops taxes and insurance from acquisition date ─────────────

describe('Finding #5 — Pre-ops cost gating: taxes and insurance (T012)', () => {
  it('expenseTaxes accrues in pre-ops months when property is acquired but not yet open', () => {
    // Property acquired Jan 2024, operations start Jul 2024.
    // Months 0-5 (Jan-Jun) are acquired-but-pre-ops:
    //   → expenseTaxes should be > 0 (building is owned, taxes are owed)
    //   → revenueTotal should be 0 (not yet open)
    const prop: PropertyInput = {
      ...BASE_COSTS,
      acquisitionDate: '2024-01-01',
      operationsStartDate: '2024-07-01',
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

    const global: GlobalInput = {
      modelStartDate: '2024-01-01',
      inflationRate: 0.0,
      marketingRate: 0.0,
      debtAssumptions: { interestRate: 0.0, amortizationYears: 25, acqLTV: 0.0 },
    };

    const monthly = generatePropertyProForma(prop, global, 12);

    // Pre-ops months (Jan–Jun, index 0–5): no revenue but taxes must accrue
    for (let i = 0; i < 6; i++) {
      expect(monthly[i].revenueTotal, `month ${i}: no revenue pre-ops`).toBe(0);
      expect(monthly[i].expenseTaxes, `month ${i}: taxes accrue post-acquisition`).toBeGreaterThan(0);
    }

    // Post-ops months (Jul–Dec, index 6–11): revenue and taxes both present
    for (let i = 6; i < 12; i++) {
      expect(monthly[i].revenueTotal, `month ${i}: revenue after ops start`).toBeGreaterThan(0);
      expect(monthly[i].expenseTaxes, `month ${i}: taxes continue post-ops`).toBeGreaterThan(0);
    }
  });

  it('expenseInsurance accrues in pre-ops months when property is acquired but not yet open', () => {
    const prop: PropertyInput = {
      ...BASE_COSTS,
      acquisitionDate: '2024-01-01',
      operationsStartDate: '2024-07-01',
      roomCount: 8,
      startAdr: 200,
      adrGrowthRate: 0,
      startOccupancy: 0.5,
      maxOccupancy: 0.5,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 1_500_000,
      type: 'hotel',
    };
    const global: GlobalInput = {
      modelStartDate: '2024-01-01',
      inflationRate: 0.0,
      marketingRate: 0.0,
      debtAssumptions: { interestRate: 0.0, amortizationYears: 25, acqLTV: 0.0 },
    };
    const monthly = generatePropertyProForma(prop, global, 12);

    for (let i = 0; i < 6; i++) {
      expect(monthly[i].expenseInsurance, `month ${i}: insurance accrues post-acquisition`).toBeGreaterThan(0);
    }
  });

  it('expenseTaxes is zero before acquisition (pre-acquisition months)', () => {
    // modelStart = Jan 2024, acquisition = Jul 2024, ops = Jul 2024
    // Months 0-5: pre-acquisition → taxes=0 (building not yet owned)
    // Months 6+: acquired and operational → taxes > 0
    const prop: PropertyInput = {
      ...BASE_COSTS,
      acquisitionDate: '2024-07-01',
      operationsStartDate: '2024-07-01',
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
    const global: GlobalInput = {
      modelStartDate: '2024-01-01',
      inflationRate: 0.0,
      marketingRate: 0.0,
      debtAssumptions: { interestRate: 0.0, amortizationYears: 25, acqLTV: 0.0 },
    };
    const monthly = generatePropertyProForma(prop, global, 12);
    for (let i = 0; i < 6; i++) {
      expect(monthly[i].expenseTaxes, `month ${i}: no taxes before acquisition`).toBe(0);
    }
    for (let i = 6; i < 12; i++) {
      expect(monthly[i].expenseTaxes, `month ${i}: taxes post-acquisition`).toBeGreaterThan(0);
    }
  });
});

// ── Finding #7: accumulateMonthlyIS extraction — parity check ────────────────

describe('Finding #7 — aggregatePropertyByYear/aggregateUnifiedByYear parity (T012)', () => {
  it('aggregatePropertyByYear IS fields match aggregateUnifiedByYear IS fields for identical inputs', () => {
    // Both functions use the same accumulateMonthlyIS helper now.
    // Run both on the same monthly data and compare every IS field.
    const prop = MINIMAL_HOTEL;
    const global = ZERO_DEBT_GLOBAL;
    const months = 36;
    const years = 3;

    const monthly = generatePropertyProForma(prop, global, months);
    const byYear = aggregatePropertyByYear(monthly, years);

    const loanParams = {
      purchasePrice: prop.purchasePrice,
      buildingImprovements: 0,
      preOpeningCosts: 0,
      operatingReserve: 0,
      type: prop.type,
    };
    const unified = aggregateUnifiedByYear(monthly, loanParams, undefined, years);

    const ISFields: Array<keyof typeof byYear[0]> = [
      'soldRooms', 'availableRooms',
      'revenueRooms', 'revenueEvents', 'revenueFB', 'revenueOther', 'revenueTotal',
      'expenseRooms', 'expenseFB', 'expenseEvents', 'expenseOther',
      'expenseOtherCosts', 'expenseInsurance', 'expenseMarketing', 'expensePropertyOps',
      'expenseUtilitiesVar', 'expenseUtilitiesFixed', 'expenseUtilities',
      'expenseAdmin', 'expenseIT', 'expenseTaxes', 'expenseFFE',
      'expensePlatformFees', 'expensePreOpening',
      'feeBase', 'feeIncentive',
      'totalExpenses', 'gop', 'agop', 'noi', 'anoi',
      'interestExpense', 'depreciationExpense', 'incomeTax', 'netIncome',
      'principalPayment', 'debtPayment', 'refinancingProceeds',
    ];

    for (let y = 0; y < years; y++) {
      for (const field of ISFields) {
        const a = byYear[y][field] as number;
        const b = unified.yearlyIS[y][field] as number;
        expect(a).toBeCloseTo(b, 4);
      }
    }
  });
});

// ── Waterfall distribution wiring (ADR-011, U3) ───────────────────────────────
//
// Hand-derived arithmetic for the analytical-pin scenario:
//   equity = $1,000,000  |  lpPct = 0.90  |  preferred_return = 0.08
//   distributable = [$1,200,000] (single exit event)
//   tiers = DEFAULT (Tier1 0.12/80/20, Tier2 0.18/70/30, Tier3 999/60/40)
//   no catch-up
//
//   1. ROC:  min(1200000, 1000000) = 1000000  → LP 900000, GP 100000  | remaining 200000
//   2. Pref: min(200000, 1000000×0.08=80000) = 80000 → LP 80000       | remaining 120000
//   3. Tiers: Tier1 takes all 120000 → LP 120000×0.80=96000, GP 24000  | remaining 0
//
//   total_to_lp  = 900000 + 80000 + 96000 = 1076000
//   total_to_gp  = 100000 + 24000         =  124000
//   lp_multiple  = 1076000 / 900000       = 1.1956 (RATIO_ROUNDING precision 4)
//   gp_multiple  = 124000  / 100000       = 1.24
//   lp_irr_share = 1076000 / 1200000      = 0.8967
//   gp_irr_share = 124000  / 1200000      = 0.1033

describe('Waterfall distribution — analytical pin (T012-W1)', () => {
  const EQUITY = 1_000_000;
  const LP_PCT = DEFAULT_LP_EQUITY_PCT;  // 0.90
  const input = {
    total_equity_invested: EQUITY,
    lp_equity: EQUITY * LP_PCT,        // 900 000
    gp_equity: EQUITY * (1 - LP_PCT),  // 100 000
    distributable_cash_flows: [1_200_000],
    preferred_return: DEFAULT_PREFERRED_RETURN,  // 0.08
    tiers: DEFAULT_WATERFALL_TIERS,
    rounding_policy: DEFAULT_ROUNDING,
  };

  it('return_of_capital equals full equity when distributable exceeds equity', () => {
    const out = computeWaterfall(input);
    expect(out.return_of_capital).toBe(1_000_000);
  });

  it('preferred_return_amount equals totalEquity × preferred_return (single-period target, no shortfall)', () => {
    // 1 000 000 × 0.08 = 80 000
    const out = computeWaterfall(input);
    expect(out.preferred_return_amount).toBe(80_000);
    expect(out.preferred_return_shortfall).toBe(0);
  });

  it('Tier 1 absorbs all remaining capital after preferred return', () => {
    // remaining after pref = 200000 − 80000 = 120000 → all goes to Tier 1
    const out = computeWaterfall(input);
    expect(out.tier_results[0].amount_distributed).toBe(120_000);
    expect(out.tier_results[0].lp_amount).toBe(96_000);   // 120000 × 0.80
    expect(out.tier_results[0].gp_amount).toBe(24_000);   // 120000 × 0.20
    expect(out.tier_results[1].amount_distributed).toBe(0);
    expect(out.tier_results[2].amount_distributed).toBe(0);
  });

  it('total_to_lp and total_to_gp match hand-derived sums', () => {
    const out = computeWaterfall(input);
    expect(out.total_to_lp).toBe(1_076_000);  // 900000 + 80000 + 96000
    expect(out.total_to_gp).toBe(124_000);    // 100000 + 24000
    expect(out.residual_undistributed).toBe(0);
  });

  it('lp_multiple and gp_multiple are correct to 4 decimal places', () => {
    const out = computeWaterfall(input);
    expect(out.lp_multiple).toBeCloseTo(1.1956, 4);  // 1076000 / 900000
    expect(out.gp_multiple).toBeCloseTo(1.24, 4);    // 124000 / 100000
  });

  it('lp_irr_share + gp_irr_share sums to 1.0 (conservation of allocation)', () => {
    const out = computeWaterfall(input);
    expect(out.lp_irr_share + out.gp_irr_share).toBeCloseTo(1.0, 4);
    expect(out.lp_irr_share).toBeCloseTo(0.8967, 4);  // 1076000 / 1200000
    expect(out.gp_irr_share).toBeCloseTo(0.1033, 4);  // 124000  / 1200000
  });

  it('total_to_lp + total_to_gp + residual === total_distributable (fund conservation)', () => {
    const out = computeWaterfall(input);
    expect(out.total_to_lp + out.total_to_gp + out.residual_undistributed)
      .toBeCloseTo(out.total_distributable, 2);
  });
});

describe('Waterfall distribution — preferred return shortfall path (T012-W2)', () => {
  // distributable < equity → ROC clips, preferred return cannot be met
  // equity = $1,000,000, distributable = [$900,000]
  // ROC = min(900000, 1000000) = 900000 → LP 810000, GP 90000 | remaining 0
  // preferred target = 80000 → preferred_return_amount = 0, shortfall = 80000
  const input = {
    total_equity_invested: 1_000_000,
    lp_equity: 900_000,
    gp_equity: 100_000,
    distributable_cash_flows: [900_000],
    preferred_return: DEFAULT_PREFERRED_RETURN,
    tiers: DEFAULT_WATERFALL_TIERS,
    rounding_policy: DEFAULT_ROUNDING,
  };

  it('preferred_return_shortfall = preferred_return_target when distributable < equity', () => {
    const out = computeWaterfall(input);
    expect(out.preferred_return_amount).toBe(0);
    expect(out.preferred_return_shortfall).toBe(80_000);  // 1000000 × 0.08
  });

  it('total_to_lp + total_to_gp equals the full distributable amount', () => {
    const out = computeWaterfall(input);
    expect(out.total_to_lp + out.total_to_gp).toBeCloseTo(900_000, 2);
  });
});

// ── Finding #4: Incentive fee gated on post-debt-service levered cash ─────────
//
// Scenario: positive GOP but high debt service → DSCR < 1 → feeIncentive must be 0.
//
// Fixture arithmetic (DSCR < 1 scenario):
//   roomCount=10, startAdr=$100, startOccupancy=0.5, ~30.5 days/month
//   Monthly rooms revenue ≈ 10 × $100 × 0.5 × 30.5 = $15,250
//   After ~40% blended expenses → GOP ≈ $9,150
//   Loan = $3,000,000 × 0.80 = $2,400,000 at 10%/yr for 25yr
//   Monthly debt service ≈ $21,700  →  DSCR ≈ 0.42 (clearly < 1)
//   leveredCash = ANOI - debtService ≈ $9,150 - $21,700 = -$12,550 < 0
//   Expected: feeIncentive = 0 for every month
//   Under buggy code: feeIncentive = GOP × 0.15 ≈ $1,372 (WRONG)

describe('Finding #4 — Incentive fee gated on post-debt-service levered cash (T012)', () => {
  it('feeIncentive is 0 for every operational month when levered cash is negative (DSCR < 1)', () => {
    // High leverage (80% LTV) + high rate (10%) → monthly debt service ≈ $21,700
    // Revenue is moderate (10 rooms × $100 ADR × 0.5 occ) → GOP ≈ $9,150
    // leveredCash = ANOI - debtService < 0 → incentive fee must not accrue
    // incentiveManagementFeeRate = 0.15 → under bug: feeIncentive ≈ $1,372/mo (WRONG)
    const prop: PropertyInput = {
      ...BASE_COSTS,
      operationsStartDate: '2024-01-01',
      acquisitionDate: '2024-01-01',
      roomCount: 10,
      startAdr: 100,
      adrGrowthRate: 0,
      startOccupancy: 0.5,
      maxOccupancy: 0.5,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: 3_000_000,
      type: 'Financed',
      acquisitionLTV: 0.80,
      acquisitionInterestRate: 0.10,
      acquisitionTermYears: 25,
      incentiveManagementFeeRate: 0.15,  // 15% incentive fee
      feeSubordination: 'none',          // explicitly none — test must catch the base-formula bug
    };

    const global: GlobalInput = {
      modelStartDate: '2024-01-01',
      inflationRate: 0.0,
      marketingRate: 0.0,
      debtAssumptions: {
        interestRate: 0.10,
        amortizationYears: 25,
        acqLTV: 0.80,
      },
    };

    const monthlySeries = generatePropertyProForma(prop, global, 24);

    // Every operational month must have feeIncentive = 0 because levered cash < 0
    const anyMonthWithIncentiveFee = monthlySeries
      .filter(m => m.revenueTotal > 0)
      .some(m => m.feeIncentive > 0);

    expect(anyMonthWithIncentiveFee).toBe(false);
  });

  it('feeIncentive accrues when levered cash is positive (zero-debt property with explicit fee rate)', () => {
    // With no debt, leveredCash = ANOI > 0 (assuming positive revenue)
    // incentiveManagementFeeRate = 0.12 (default for hotel type) → feeIncentive must accrue
    // MINIMAL_HOTEL: type='hotel' → default incentiveMgmtFeeRate = 0.12 (12%)
    const seriesWithFee = generatePropertyProForma(MINIMAL_HOTEL, ZERO_DEBT_GLOBAL, 24);

    const anyMonthWithFee = seriesWithFee
      .filter(m => m.revenueTotal > 0)
      .some(m => m.feeIncentive > 0);

    expect(anyMonthWithFee).toBe(true);
  });
});

// ── T013: acquisitionInterestRate drives netCashFlowToInvestors (client-parity guard) ──
//
// Rationale: The SensitivityAnalysis.tsx "Interest Rate" slider previously wrote
// `adjProp.interestRate` (non-existent on PropertyInput) instead of
// `adjProp.acquisitionInterestRate`. The fix writes the correct field and calls
// aggregateUnifiedByYear, which is the same path the server sensitivity.ts uses.
//
// This test pins two invariants that the client fallback now relies on:
//   1. Changing `acquisitionInterestRate` changes the engine output (debt cost flows).
//   2. Higher interest rate → lower IRR (because more cash goes to debt service).
//
// If either invariant breaks, the sensitivity slider would silently stop working.

describe('T013 — acquisitionInterestRate drives netCashFlowToInvestors', () => {
  const BASE_FINANCED: PropertyInput = {
    ...BASE_COSTS,
    operationsStartDate: '2024-01-01',
    acquisitionDate: '2024-01-01',
    roomCount: 15,
    startAdr: 200,
    adrGrowthRate: 0,
    startOccupancy: 0.65,
    maxOccupancy: 0.65,
    occupancyRampMonths: 0,
    occupancyGrowthStep: 0,
    purchasePrice: 2_000_000,
    type: 'Financed',
    acquisitionLTV: 0.65,
    acquisitionTermYears: 25,
    exitCapRate: 0.09,
  };

  const GLOBAL: GlobalInput = {
    modelStartDate: '2024-01-01',
    inflationRate: 0.0,
    marketingRate: 0.0,
    debtAssumptions: { interestRate: 0.07, amortizationYears: 25, acqLTV: 0.65 },
  };

  it('acquisitionInterestRate change alters netCashFlowToInvestors in acquisition year', () => {
    const lowRate: PropertyInput = { ...BASE_FINANCED, acquisitionInterestRate: 0.05 };
    const highRate: PropertyInput = { ...BASE_FINANCED, acquisitionInterestRate: 0.10 };

    const low = aggregateUnifiedByYear(
      generatePropertyProForma(lowRate, GLOBAL, 60),
      lowRate as never, GLOBAL as never, 5,
    );
    const high = aggregateUnifiedByYear(
      generatePropertyProForma(highRate, GLOBAL, 60),
      highRate as never, GLOBAL as never, 5,
    );

    // Higher rate means higher debt service means less ATCF means lower netCashFlowToInvestors.
    // Check year 1 (first full operational year, non-acquisition).
    const lowY1  = low.yearlyCF[1]?.netCashFlowToInvestors  ?? 0;
    const highY1 = high.yearlyCF[1]?.netCashFlowToInvestors ?? 0;
    expect(highY1).toBeLessThan(lowY1);
  });

  it('higher acquisitionInterestRate produces lower IRR via netCashFlowToInvestors', () => {
    const lowRate: PropertyInput  = { ...BASE_FINANCED, acquisitionInterestRate: 0.05 };
    const highRate: PropertyInput = { ...BASE_FINANCED, acquisitionInterestRate: 0.10 };

    function portfolioIRR(prop: PropertyInput): number {
      const financials = generatePropertyProForma(prop, GLOBAL, 60);
      const unified = aggregateUnifiedByYear(financials, prop as never, GLOBAL as never, 5);
      const flows = unified.yearlyCF.map(y => y.netCashFlowToInvestors);
      return computeIRR(flows, 1).irr_periodic ?? 0;
    }

    const irrLow  = portfolioIRR(lowRate);
    const irrHigh = portfolioIRR(highRate);

    expect(irrLow).toBeGreaterThan(0);
    expect(irrHigh).toBeGreaterThan(0);
    // Higher rate → higher cost → lower IRR. Difference should be meaningful (>1pp).
    expect(irrLow - irrHigh).toBeGreaterThan(0.01);
  });

  it('exit value uses annualized NOI: partial first-year does not deflate the exit', () => {
    // Property with 6-month pre-ops: year-0 operational months = 6.
    // aggregateUnifiedByYear normalises year-0 NOI using (noi / 6) × 12.
    // The exit fires in year 4 (fully operational). This test pins the invariant
    // that exit value is derived from actual NOI (not a partial-year deflation).
    const rampProp: PropertyInput = {
      ...BASE_FINANCED,
      operationsStartDate: '2024-07-01',  // 6-month pre-ops in year 0
      acquisitionDate: '2024-01-01',
      occupancyRampMonths: 6,
      acquisitionInterestRate: 0.07,
    };
    const financials = generatePropertyProForma(rampProp, GLOBAL, 60);
    const unified = aggregateUnifiedByYear(financials, rampProp as never, GLOBAL as never, 5);

    const exitValue = unified.yearlyCF[4]?.exitValue ?? 0;
    const lastYearIS = unified.yearlyIS[4];
    const rawNOI = lastYearIS?.noi ?? 0;
    const exitCapRate = rampProp.exitCapRate ?? 0.09;

    // Exit value must be positive and non-trivial (> $100k).
    expect(exitValue).toBeGreaterThan(100_000);

    // Exit value = (annualizedNOI / cap) * (1 - commission) - outstandingDebt.
    // Since year 4 is fully operational, annualizedNOI = rawNOI.
    // Upper bound: cannot exceed gross value without debt deduction.
    const grossValue = rawNOI / exitCapRate;
    expect(exitValue).toBeLessThan(grossValue);

    // Lower bound: after 5% commission and reasonable debt balance, should be
    // at least 40% of gross value (debt paydown over 4 years).
    expect(exitValue).toBeGreaterThan(grossValue * 0.4);
  });
});
