import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine";
import { pmt } from "../../calc/shared/pmt";
import { makePropertyInput as makeProperty, makeGlobalInput as makeGlobal } from "../fixtures/factories";
import {
  DAYS_PER_MONTH,
  DEPRECIATION_YEARS,
  NOL_UTILIZATION_CAP,
  DEFAULT_PROPERTY_TAX_RATE,
  DEFAULT_PROPERTY_INFLATION_RATE,
} from "../../shared/constants";

/**
 * NOL Carryforward Golden Test — High-Cost Property with Early Losses
 *
 * This golden test validates the Net Operating Loss (NOL) carryforward mechanism
 * in the property engine. A high-cost, low-revenue property is constructed so that
 * depreciation + interest expense exceed ANOI in early months, producing negative
 * pre-tax income and accumulating NOL. As interest declines via amortization, pre-tax
 * income eventually turns positive, at which point the engine applies the 80%
 * utilization cap (NOL_UTILIZATION_CAP = 0.80) per IRC Section 382 / TCJA rules.
 *
 * Scenario:
 *   5 rooms | $150 ADR | 70% occupancy (steady) | 0% growth | 0% inflation
 *   $1,100,000 purchase | 75% LTV ($825,000 loan) | 9% interest | 20yr term
 *   Land: 25% of purchase | Tax rate: 25%
 *   Projection: 120 months (10 years) starting 2026-04-01
 *
 * Why this triggers NOL:
 *   With the total-revenue model (rooms ≈ 49% of total), monthly ANOI is moderate
 *   while combined interest + depreciation exceed it in early months. Pre-tax
 *   income is negative for ~50 months, accumulating ~$15K of NOL. As interest
 *   expense declines through amortization, pre-tax income turns positive and
 *   the NOL is fully consumed by month 120 via the 80% utilization cap.
 */
describe("NOL Carryforward — High-Cost Property with Early Losses", () => {
  // ── Scenario inputs ──────────────────────────────────────────────────────
  const property = makeProperty({
    purchasePrice: 1_100_000,
    roomCount: 5,
    startAdr: 150,
    startOccupancy: 0.70,
    maxOccupancy: 0.70,
    occupancyGrowthStep: 0,
    adrGrowthRate: 0.0,
    type: "Financed",
    acquisitionLTV: 0.75,
    acquisitionInterestRate: 0.09,
    acquisitionTermYears: 20,
    landValuePercent: 0.25,
    buildingImprovements: 0,
    taxRate: DEFAULT_PROPERTY_TAX_RATE, // 0.25
    operatingReserve: 0,
  });

  const global = makeGlobal({
    modelStartDate: "2026-04-01",
    inflationRate: 0.0,
    fixedCostEscalationRate: 0.0,
  });

  const MONTHS = 120;
  const result = generatePropertyProForma(property, global, MONTHS);
  const PENNY = 2; // toBeCloseTo precision (within $0.01)

  // ── Hand-calculated constants ──────────────────────────────────────────
  const purchasePrice = 1_100_000;
  const loanAmount = purchasePrice * 0.75; // $825,000
  const monthlyRate = 0.09 / 12;
  const totalPayments = 20 * 12; // 240
  const monthlyPayment = pmt(loanAmount, monthlyRate, totalPayments);

  const buildingValue = purchasePrice * 0.75; // $1,875,000
  const monthlyDepreciation = buildingValue / DEPRECIATION_YEARS / 12;

  const interestMonth1 = loanAmount * monthlyRate;

  // Helper: compute pre-tax income for a given month
  function preTaxIncome(i: number): number {
    const mo = result[i];
    return mo.anoi - mo.interestExpense - mo.depreciationExpense;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TESTS
  // ══════════════════════════════════════════════════════════════════════════

  it("Pre-tax income is negative in early operational months (NOL accumulates)", () => {
    // Month 1 should have negative pre-tax income
    expect(preTaxIncome(0)).toBeLessThan(0);

    // Several early months should have negative PTI
    for (let i = 0; i < 6; i++) {
      expect(preTaxIncome(i)).toBeLessThan(0);
    }
  });

  it("Income tax is zero when pre-tax income is negative", () => {
    // Collect all months with negative pre-tax income
    const negativePTIMonths = result.filter(
      (mo) => mo.anoi - mo.interestExpense - mo.depreciationExpense < 0,
    );
    expect(negativePTIMonths.length).toBeGreaterThan(0);

    for (const mo of negativePTIMonths) {
      expect(mo.incomeTax).toBe(0);
    }
  });

  it("NOL balance grows when pre-tax income is negative", () => {
    // Month 1: NOL should equal |preTaxIncome|
    const m0 = result[0];
    const pti0 = preTaxIncome(0);
    expect(pti0).toBeLessThan(0);
    expect(m0.nolBalance).toBeCloseTo(Math.abs(pti0), PENNY);

    // NOL balance must increase strictly each month while PTI stays negative
    let prevNOL = 0;
    for (let i = 0; i < result.length; i++) {
      const pti = preTaxIncome(i);
      if (pti < 0) {
        expect(result[i].nolBalance).toBeGreaterThan(prevNOL);
      }
      prevNOL = result[i].nolBalance;
    }
  });

  it("When pre-tax income turns positive, NOL offsets up to 80% of income", () => {
    // Find the first month where PTI is positive AND prior month had NOL > 0
    let firstPositiveWithNOL = -1;
    for (let i = 1; i < result.length; i++) {
      if (preTaxIncome(i) > 0 && result[i - 1].nolBalance > 0) {
        firstPositiveWithNOL = i;
        break;
      }
    }

    // This scenario must have at least one such month
    expect(firstPositiveWithNOL).toBeGreaterThan(0);

    const mo = result[firstPositiveWithNOL];
    const pti = preTaxIncome(firstPositiveWithNOL);
    const priorNOL = result[firstPositiveWithNOL - 1].nolBalance;

    // Max NOL that can be used = 80% of pre-tax income
    const maxUtilization = pti * NOL_UTILIZATION_CAP;
    const nolUsed = Math.min(priorNOL, maxUtilization);
    const adjustedIncome = pti - nolUsed;

    // Income tax = adjustedIncome * taxRate
    const expectedTax = adjustedIncome > 0 ? adjustedIncome * DEFAULT_PROPERTY_TAX_RATE : 0;
    expect(mo.incomeTax).toBeCloseTo(expectedTax, PENNY);

    // NOL balance should have decreased by nolUsed
    expect(mo.nolBalance).toBeCloseTo(priorNOL - nolUsed, PENNY);

    // The accumulated NOL should exceed the 80% offset, so the cap is binding
    expect(priorNOL).toBeGreaterThan(maxUtilization);
    // Therefore only 80% is offset, leaving 20% taxable
    expect(adjustedIncome).toBeCloseTo(pti * (1 - NOL_UTILIZATION_CAP), PENNY);
  });

  it("Income tax formula: incomeTax = (preTaxIncome - nolUsed) * taxRate during NOL utilization", () => {
    // Replay the NOL logic month by month and verify the engine matches
    let prevNOL = 0;
    for (let i = 0; i < result.length; i++) {
      const mo = result[i];
      const pti = preTaxIncome(i);

      if (pti > 0 && prevNOL > 0) {
        // NOL utilization month
        const maxUtil = pti * NOL_UTILIZATION_CAP;
        const nolUsed = Math.min(prevNOL, maxUtil);
        const adjustedIncome = pti - nolUsed;
        const expectedTax = adjustedIncome > 0 ? adjustedIncome * DEFAULT_PROPERTY_TAX_RATE : 0;
        expect(mo.incomeTax).toBeCloseTo(expectedTax, PENNY);
      } else if (pti < 0) {
        // NOL accumulation month — tax must be zero
        expect(mo.incomeTax).toBe(0);
      } else if (pti > 0 && prevNOL === 0) {
        // Normal taxation — no NOL remaining
        const expectedTax = pti * DEFAULT_PROPERTY_TAX_RATE;
        expect(mo.incomeTax).toBeCloseTo(expectedTax, PENNY);
      }

      prevNOL = mo.nolBalance;
    }
  });

  it("NOL balance decreases as it is used", () => {
    // Find the peak NOL balance (transition from accumulation to utilization)
    let peakNOL = 0;
    let peakIndex = 0;
    for (let i = 0; i < result.length; i++) {
      if (result[i].nolBalance > peakNOL) {
        peakNOL = result[i].nolBalance;
        peakIndex = i;
      }
    }

    expect(peakNOL).toBeGreaterThan(0);

    // After peak, NOL should be monotonically non-increasing
    for (let i = peakIndex + 1; i < result.length; i++) {
      expect(result[i].nolBalance).toBeLessThanOrEqual(result[i - 1].nolBalance + 0.01);
    }

    // By end of projection, NOL should be strictly less than peak (some was consumed)
    expect(result[MONTHS - 1].nolBalance).toBeLessThan(peakNOL);
  });

  it("Total cumulative tax paid is less than it would be without NOL", () => {
    // Actual total tax from the engine (with NOL carryforward)
    const actualTotalTax = result.reduce((sum, mo) => sum + mo.incomeTax, 0);

    // Hypothetical tax WITHOUT NOL: each month taxed independently on positive PTI
    let hypotheticalTotalTax = 0;
    for (let i = 0; i < result.length; i++) {
      const pti = preTaxIncome(i);
      if (pti > 0) {
        hypotheticalTotalTax += pti * DEFAULT_PROPERTY_TAX_RATE;
      }
    }

    // With NOL, accumulated losses offset later positive income → lower total tax
    expect(actualTotalTax).toBeLessThan(hypotheticalTotalTax);

    // The savings should be material
    const savings = hypotheticalTotalTax - actualTotalTax;
    expect(savings).toBeGreaterThan(100);
  });

  it("Cross-check: netIncome = ANOI - interestExpense - depreciationExpense - incomeTax", () => {
    for (let i = 0; i < MONTHS; i++) {
      const mo = result[i];
      const expected = mo.anoi - mo.interestExpense - mo.depreciationExpense - mo.incomeTax;
      expect(mo.netIncome).toBeCloseTo(expected, PENNY);
    }
  });

  // ── Structural invariants ──────────────────────────────────────────────

  it("Month 1 hand-calculated depreciation and interest", () => {
    const m0 = result[0];
    expect(m0.depreciationExpense).toBeCloseTo(monthlyDepreciation, PENNY);
    expect(m0.interestExpense).toBeCloseTo(interestMonth1, PENNY);
  });

  it("NOL balance is never negative", () => {
    for (let i = 0; i < MONTHS; i++) {
      expect(result[i].nolBalance).toBeGreaterThanOrEqual(0);
    }
  });

  it("Income tax is never negative", () => {
    for (let i = 0; i < MONTHS; i++) {
      expect(result[i].incomeTax).toBeGreaterThanOrEqual(0);
    }
  });

  it("NOL utilization cap is exactly 0.80", () => {
    expect(NOL_UTILIZATION_CAP).toBe(0.80);
  });
});
