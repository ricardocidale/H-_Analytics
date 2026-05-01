/**
 * Property-based tests for calc/research/ — Round 2.
 *
 * Covers the remaining 7 of 10 research tools after
 * `property-tests.test.ts` (round 1) covered cap-rate, property-metrics,
 * and ADR-projection.
 *
 * This round:
 *   - computeCostBenchmarks
 *   - computeDebtCapacity
 *   - computeDepreciationBasis
 *   - computeMakeVsBuy
 *   - computeMarkupWaterfall
 *   - computeOccupancyRamp
 *   - computeServiceFee
 *
 * After this file, all 10 deterministic research tools have invariant
 * coverage against NaN propagation, rounding drift, monotonicity
 * violations, linearity regressions, and boundary edge cases.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeCostBenchmarks } from "../../../calc/research/cost-benchmarks";
import { computeDebtCapacity } from "../../../calc/research/debt-capacity";
import { computeDepreciationBasis } from "../../../calc/research/depreciation-basis";
import { computeMakeVsBuy } from "../../../calc/research/make-vs-buy";
import { computeMarkupWaterfall } from "../../../calc/research/markup-waterfall";
import { computeOccupancyRamp } from "../../../calc/research/occupancy-ramp";
import { computeServiceFee } from "../../../calc/research/service-fee";

const RUNS = 200;

// ────────────────────────────────────────────────────────────────────────────
// Shared arbitraries
// ────────────────────────────────────────────────────────────────────────────

const arbRevenue = fc.double({ noNaN: true, noDefaultInfinity: true, min: 100_000, max: 100_000_000 });
const arbPrice = fc.double({ noNaN: true, noDefaultInfinity: true, min: 500_000, max: 500_000_000 });
const arbCostRate = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 0.5 });
const arbRate = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 0.3 });
const arbNOI = fc.double({ noNaN: true, noDefaultInfinity: true, min: 50_000, max: 50_000_000 });
const arbOccupancy = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0.2, max: 1.0 });
const arbADR = fc.double({ noNaN: true, noDefaultInfinity: true, min: 80, max: 2000 });

// ────────────────────────────────────────────────────────────────────────────
// computeCostBenchmarks
// ────────────────────────────────────────────────────────────────────────────

describe("computeCostBenchmarks — property tests", () => {
  const baseInput = (rev: number, roomRev: number, price: number) => ({
    annual_room_revenue: roomRev,
    annual_total_revenue: rev,
    purchase_price: price,
  });

  it("produces exactly 2 department, 7 undistributed, 2 property-value cost lines", () => {
    fc.assert(
      fc.property(arbRevenue, arbPrice, (rev, price) => {
        const result = computeCostBenchmarks(baseInput(rev, rev * 0.6, price));
        expect(result.department_costs).toHaveLength(2);
        expect(result.undistributed_costs).toHaveLength(7);
        expect(result.property_value_costs).toHaveLength(2);
      }),
      { numRuns: RUNS },
    );
  });

  it("total_operating_costs equals sum of three category totals (within rounding)", () => {
    fc.assert(
      fc.property(arbRevenue, arbPrice, (rev, price) => {
        const result = computeCostBenchmarks(baseInput(rev, rev * 0.6, price));
        const sum = result.total_department + result.total_undistributed + result.total_property_value;
        expect(Math.abs(result.total_operating_costs - sum)).toBeLessThanOrEqual(0.02);
      }),
      { numRuns: RUNS },
    );
  });

  it("doubling revenue roughly doubles undistributed costs (linearity)", () => {
    fc.assert(
      fc.property(arbRevenue, (rev) => {
        const base = computeCostBenchmarks({ annual_room_revenue: rev * 0.6, annual_total_revenue: rev });
        const doubled = computeCostBenchmarks({ annual_room_revenue: rev * 1.2, annual_total_revenue: rev * 2 });
        if (base.total_undistributed === 0) return;
        const ratio = doubled.total_undistributed / base.total_undistributed;
        expect(ratio).toBeGreaterThan(1.99);
        expect(ratio).toBeLessThan(2.01);
      }),
      { numRuns: RUNS },
    );
  });

  it("zero revenue + zero property value → zero total costs", () => {
    const result = computeCostBenchmarks({ annual_room_revenue: 0, annual_total_revenue: 0, purchase_price: 0 });
    expect(result.total_operating_costs).toBe(0);
  });

  it("each cost line's annual_amount equals base × rate when rate is explicit", () => {
    // Pass explicit rates so we can validate the math without interacting with
    // rounding-on-display in line.rate (which is rounded to 2 decimal places
    // of the percentage form, while annual_amount uses the unrounded rate).
    fc.assert(
      fc.property(arbRevenue, arbCostRate, (rev, rate) => {
        const result = computeCostBenchmarks({
          annual_room_revenue: rev * 0.6,
          annual_total_revenue: rev,
          cost_rate_admin: rate,
        });
        const adminLine = result.undistributed_costs.find((l) => l.category === "Admin & General")!;
        expect(Math.abs(adminLine.annual_amount - rev * rate)).toBeLessThanOrEqual(0.02);
      }),
      { numRuns: RUNS },
    );
  });

  it("all numeric outputs finite", () => {
    fc.assert(
      fc.property(arbRevenue, arbPrice, (rev, price) => {
        const result = computeCostBenchmarks(baseInput(rev, rev * 0.6, price));
        const fields = [
          result.total_department,
          result.total_undistributed,
          result.total_property_value,
          result.total_operating_costs,
          ...result.department_costs.map((l) => l.annual_amount),
          ...result.undistributed_costs.map((l) => l.annual_amount),
          ...result.property_value_costs.map((l) => l.annual_amount),
        ];
        for (const f of fields) expect(Number.isFinite(f)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// computeDebtCapacity
// ────────────────────────────────────────────────────────────────────────────

describe("computeDebtCapacity — property tests", () => {
  const arbDSCR = fc.double({ noNaN: true, noDefaultInfinity: true, min: 1.0, max: 2.0 });
  const arbInterestRate = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0.03, max: 0.12 });
  const arbTerm = fc.integer({ min: 10, max: 30 });

  it("max_annual_debt_service = annual_noi / dscr_target (within rounding)", () => {
    fc.assert(
      fc.property(arbNOI, arbDSCR, arbInterestRate, arbTerm, (noi, dscr, rate, term) => {
        const result = computeDebtCapacity({
          annual_noi: noi,
          dscr_target: dscr,
          interest_rate: rate,
          term_years: term,
        });
        const expected = noi / dscr;
        expect(Math.abs(result.max_annual_debt_service - expected)).toBeLessThanOrEqual(0.02);
      }),
      { numRuns: RUNS },
    );
  });

  it("max_monthly_payment = max_annual_debt_service / 12 (within rounding)", () => {
    fc.assert(
      fc.property(arbNOI, arbDSCR, arbInterestRate, arbTerm, (noi, dscr, rate, term) => {
        const result = computeDebtCapacity({
          annual_noi: noi,
          dscr_target: dscr,
          interest_rate: rate,
          term_years: term,
        });
        expect(Math.abs(result.max_monthly_payment - result.max_annual_debt_service / 12)).toBeLessThanOrEqual(0.02);
      }),
      { numRuns: RUNS },
    );
  });

  it("higher DSCR target → lower max loan amount (monotonic)", () => {
    fc.assert(
      fc.property(arbNOI, arbInterestRate, arbTerm, (noi, rate, term) => {
        const loose = computeDebtCapacity({ annual_noi: noi, dscr_target: 1.1, interest_rate: rate, term_years: term });
        const tight = computeDebtCapacity({ annual_noi: noi, dscr_target: 1.5, interest_rate: rate, term_years: term });
        expect(tight.max_loan_amount).toBeLessThanOrEqual(loose.max_loan_amount);
      }),
      { numRuns: RUNS },
    );
  });

  it("longer term → higher max loan amount (monotonic, ceteris paribus)", () => {
    fc.assert(
      fc.property(arbNOI, arbDSCR, arbInterestRate, (noi, dscr, rate) => {
        const short = computeDebtCapacity({ annual_noi: noi, dscr_target: dscr, interest_rate: rate, term_years: 10 });
        const long = computeDebtCapacity({ annual_noi: noi, dscr_target: dscr, interest_rate: rate, term_years: 30 });
        expect(long.max_loan_amount).toBeGreaterThanOrEqual(short.max_loan_amount);
      }),
      { numRuns: RUNS },
    );
  });

  it("implied_ltv_pct is null when property_value absent", () => {
    fc.assert(
      fc.property(arbNOI, arbDSCR, arbInterestRate, arbTerm, (noi, dscr, rate, term) => {
        const result = computeDebtCapacity({
          annual_noi: noi,
          dscr_target: dscr,
          interest_rate: rate,
          term_years: term,
        });
        expect(result.implied_ltv_pct).toBeNull();
      }),
      { numRuns: RUNS },
    );
  });

  it("implied_ltv_pct computed when property_value provided (and is positive ratio)", () => {
    fc.assert(
      fc.property(arbNOI, arbDSCR, arbInterestRate, arbTerm, arbPrice, (noi, dscr, rate, term, price) => {
        const result = computeDebtCapacity({
          annual_noi: noi,
          dscr_target: dscr,
          interest_rate: rate,
          term_years: term,
          property_value: price,
        });
        expect(result.implied_ltv_pct).not.toBeNull();
        expect(result.implied_ltv_pct!).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: RUNS },
    );
  });

  it("all outputs finite", () => {
    fc.assert(
      fc.property(arbNOI, arbDSCR, arbInterestRate, arbTerm, (noi, dscr, rate, term) => {
        const r = computeDebtCapacity({ annual_noi: noi, dscr_target: dscr, interest_rate: rate, term_years: term });
        expect(Number.isFinite(r.max_annual_debt_service)).toBe(true);
        expect(Number.isFinite(r.max_monthly_payment)).toBe(true);
        expect(Number.isFinite(r.max_loan_amount)).toBe(true);
        expect(Number.isFinite(r.monthly_rate)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// computeDepreciationBasis
// ────────────────────────────────────────────────────────────────────────────

describe("computeDepreciationBasis — property tests", () => {
  const arbLandPct = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1 });
  const arbImprovements = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 10_000_000 });

  it("land_value + building_value = purchase_price (within rounding)", () => {
    fc.assert(
      fc.property(arbPrice, arbLandPct, (price, pct) => {
        const r = computeDepreciationBasis({ purchase_price: price, land_value_pct: pct });
        expect(Math.abs(r.land_value_dollars + r.building_value - price)).toBeLessThanOrEqual(0.02);
      }),
      { numRuns: RUNS },
    );
  });

  it("depreciable_basis = building_value + building_improvements (within rounding)", () => {
    fc.assert(
      fc.property(arbPrice, arbLandPct, arbImprovements, (price, pct, imp) => {
        const r = computeDepreciationBasis({
          purchase_price: price,
          land_value_pct: pct,
          building_improvements: imp,
        });
        expect(Math.abs(r.depreciable_basis - (r.building_value + r.building_improvements))).toBeLessThanOrEqual(0.02);
      }),
      { numRuns: RUNS },
    );
  });

  it("monthly_depreciation = annual_depreciation / 12 (within rounding)", () => {
    fc.assert(
      fc.property(arbPrice, arbLandPct, (price, pct) => {
        const r = computeDepreciationBasis({ purchase_price: price, land_value_pct: pct });
        // Both are roundCents'd separately; tolerate 12 cents.
        expect(Math.abs(r.annual_depreciation - r.monthly_depreciation * 12)).toBeLessThanOrEqual(0.12);
      }),
      { numRuns: RUNS },
    );
  });

  it("land_value_pct=0 → land is 0, all purchase_price into building", () => {
    fc.assert(
      fc.property(arbPrice, (price) => {
        const r = computeDepreciationBasis({ purchase_price: price, land_value_pct: 0 });
        expect(r.land_value_dollars).toBeLessThanOrEqual(0.01);
        expect(Math.abs(r.building_value - price)).toBeLessThanOrEqual(0.02);
      }),
      { numRuns: RUNS },
    );
  });

  it("land_value_pct=1 → land = purchase_price, no depreciable basis (apart from improvements)", () => {
    fc.assert(
      fc.property(arbPrice, (price) => {
        const r = computeDepreciationBasis({ purchase_price: price, land_value_pct: 1 });
        expect(Math.abs(r.land_value_dollars - price)).toBeLessThanOrEqual(0.02);
        expect(r.building_value).toBeLessThanOrEqual(0.01);
      }),
      { numRuns: RUNS },
    );
  });

  it("tax_shield_at_25pct ≈ annual_depreciation * 0.25", () => {
    fc.assert(
      fc.property(arbPrice, arbLandPct, (price, pct) => {
        const r = computeDepreciationBasis({ purchase_price: price, land_value_pct: pct });
        expect(Math.abs(r.tax_shield_at_25pct - r.annual_depreciation * 0.25)).toBeLessThanOrEqual(0.02);
      }),
      { numRuns: RUNS },
    );
  });

  it("all outputs finite", () => {
    fc.assert(
      fc.property(arbPrice, arbLandPct, arbImprovements, (price, pct, imp) => {
        const r = computeDepreciationBasis({
          purchase_price: price,
          land_value_pct: pct,
          building_improvements: imp,
        });
        const fields = [
          r.land_value_dollars,
          r.building_value,
          r.depreciable_basis,
          r.annual_depreciation,
          r.monthly_depreciation,
          r.tax_shield_at_25pct,
          r.tax_shield_at_30pct,
          r.effective_cost_reduction_pct,
        ];
        for (const f of fields) expect(Number.isFinite(f)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// computeMakeVsBuy
// ────────────────────────────────────────────────────────────────────────────

describe("computeMakeVsBuy — property tests", () => {
  const arbCost = fc.double({ noNaN: true, noDefaultInfinity: true, min: 10_000, max: 1_000_000 });
  const arbSmallRate = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 0.4 });

  const makeInput = (overrides: Record<string, number> = {}) => ({
    serviceName: "Marketing",
    inHouseLabor: 120_000,
    benefitsRate: 0.25,
    trainingAnnual: 10_000,
    suppliesAnnual: 5_000,
    allocatedOverhead: 30_000,
    vendorContractPrice: 100_000,
    internalOversightHours: 4,
    managerHourlyRate: 75,
    unitCount: 1,
    ...overrides,
  });

  it("totalInHouseCost = labor(1+benefits) + training + supplies + overhead", () => {
    fc.assert(
      fc.property(arbCost, arbSmallRate, (labor, benefits) => {
        const r = computeMakeVsBuy(makeInput({ inHouseLabor: labor, benefitsRate: benefits }));
        const expected = labor * (1 + benefits) + 10_000 + 5_000 + 30_000;
        expect(Math.abs(r.totalInHouseCost - expected)).toBeLessThan(1);
      }),
      { numRuns: RUNS },
    );
  });

  it("totalVendorCost = contractPrice + oversightHours*52*managerHourlyRate", () => {
    fc.assert(
      fc.property(arbCost, (price) => {
        const r = computeMakeVsBuy(makeInput({ vendorContractPrice: price }));
        const expected = price + 4 * 52 * 75;
        expect(Math.abs(r.totalVendorCost - expected)).toBeLessThan(1);
      }),
      { numRuns: RUNS },
    );
  });

  it("annualSavings = totalInHouseCost - totalVendorCost", () => {
    fc.assert(
      fc.property(arbCost, arbCost, (labor, vendor) => {
        const r = computeMakeVsBuy(makeInput({ inHouseLabor: labor, vendorContractPrice: vendor }));
        expect(Math.abs(r.annualSavings - (r.totalInHouseCost - r.totalVendorCost))).toBeLessThan(0.01);
      }),
      { numRuns: RUNS },
    );
  });

  it("recommendation is one of the three allowed values", () => {
    fc.assert(
      fc.property(arbCost, arbCost, (labor, vendor) => {
        const r = computeMakeVsBuy(makeInput({ inHouseLabor: labor, vendorContractPrice: vendor }));
        expect(["In-House", "Outsource", "Marginal"]).toContain(r.recommendation);
      }),
      { numRuns: RUNS },
    );
  });

  it("all outputs finite", () => {
    fc.assert(
      fc.property(arbCost, arbCost, arbSmallRate, (labor, vendor, benefits) => {
        const r = computeMakeVsBuy(makeInput({ inHouseLabor: labor, vendorContractPrice: vendor, benefitsRate: benefits }));
        const fields = [r.totalInHouseCost, r.totalVendorCost, r.annualSavings, r.savingsPercent, r.costPerUnitInHouse, r.costPerUnitVendor, r.npv_inhouse, r.npv_vendor, r.npv_savings];
        for (const f of fields) expect(Number.isFinite(f)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// computeMarkupWaterfall
// ────────────────────────────────────────────────────────────────────────────

describe("computeMarkupWaterfall — property tests", () => {
  const arbVendorCost = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1_000_000 });
  const arbMarkup = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1 });

  it("feeCharged = vendorCost * (1 + markupPct) (within 2 decimals)", () => {
    fc.assert(
      fc.property(arbVendorCost, arbMarkup, (cost, markup) => {
        const r = computeMarkupWaterfall({ vendorCost: cost, markupPct: markup });
        expect(Math.abs(r.feeCharged - cost * (1 + markup))).toBeLessThan(0.01);
      }),
      { numRuns: RUNS },
    );
  });

  it("grossProfit = feeCharged - vendorCost", () => {
    fc.assert(
      fc.property(arbVendorCost, arbMarkup, (cost, markup) => {
        const r = computeMarkupWaterfall({ vendorCost: cost, markupPct: markup });
        expect(Math.abs(r.grossProfit - (r.feeCharged - r.vendorCost))).toBeLessThan(0.01);
      }),
      { numRuns: RUNS },
    );
  });

  it("effectiveMargin ≈ grossProfit / feeCharged when feeCharged > 0", () => {
    // Tool rounds effectiveMargin to 4 decimals internally. The divisors
    // (grossProfit, feeCharged) are themselves 2-decimal-rounded. At small
    // vendorCost, the ratio computed from rounded operands can drift up to a
    // few bps from the tool's internal (unrounded) ratio. Use vendorCost >= 100
    // to keep rounding noise bounded and allow up to 0.002 drift.
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true, min: 100, max: 1_000_000 }),
        arbMarkup,
        (cost, markup) => {
          const r = computeMarkupWaterfall({ vendorCost: cost, markupPct: markup });
          const expected = r.grossProfit / r.feeCharged;
          expect(Math.abs(r.effectiveMargin - expected)).toBeLessThanOrEqual(0.002);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("zero vendorCost → zero fee, profit, margin", () => {
    const r = computeMarkupWaterfall({ vendorCost: 0, markupPct: 0.3 });
    expect(r.feeCharged).toBe(0);
    expect(r.grossProfit).toBe(0);
    expect(r.effectiveMargin).toBe(0);
  });

  it("known service types return industry range, unknown returns null", () => {
    const known = computeMarkupWaterfall({ vendorCost: 100, markupPct: 0.2, serviceType: "marketing" });
    expect(known.industryMarkupRange).not.toBeNull();
    const unknown = computeMarkupWaterfall({ vendorCost: 100, markupPct: 0.2, serviceType: "nonexistent_service" });
    expect(unknown.industryMarkupRange).toBeNull();
  });

  it("legacy 'it' alias maps to technology_reservations range", () => {
    const r = computeMarkupWaterfall({ vendorCost: 100, markupPct: 0.2, serviceType: "it" });
    expect(r.industryMarkupRange).not.toBeNull();
    // The tech range is { low: 0.10, mid: 0.20, high: 0.30 }
    expect(r.industryMarkupRange!.mid).toBeCloseTo(0.20);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// computeOccupancyRamp
// ────────────────────────────────────────────────────────────────────────────

describe("computeOccupancyRamp — property tests", () => {
  const arbStart = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0.1, max: 0.5 });
  const arbMax = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0.6, max: 0.9 });
  const arbRampMonths = fc.integer({ min: 1, max: 12 });
  const arbGrowthStep = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0.01, max: 0.15 });
  const arbStabMonths = fc.integer({ min: 6, max: 60 });

  it("stages are monotonically non-decreasing in occupancy", () => {
    fc.assert(
      fc.property(arbStart, arbMax, arbRampMonths, arbGrowthStep, arbStabMonths, (start, max, ramp, step, stab) => {
        const r = computeOccupancyRamp({
          start_occupancy: start,
          max_occupancy: max,
          ramp_months: ramp,
          growth_step: step,
          stabilization_months: stab,
        });
        for (let i = 0; i < r.stages.length - 1; i++) {
          expect(r.stages[i + 1].occupancy).toBeGreaterThanOrEqual(r.stages[i].occupancy);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("all occupancies stay in [start_occupancy - ε, max_occupancy + ε]", () => {
    fc.assert(
      fc.property(arbStart, arbMax, arbRampMonths, arbGrowthStep, arbStabMonths, (start, max, ramp, step, stab) => {
        const r = computeOccupancyRamp({
          start_occupancy: start,
          max_occupancy: max,
          ramp_months: ramp,
          growth_step: step,
          stabilization_months: stab,
        });
        for (const s of r.stages) {
          expect(s.occupancy).toBeGreaterThanOrEqual(Math.round(start * 100) / 100 - 0.01);
          expect(s.occupancy).toBeLessThanOrEqual(max + 0.01);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("stabilized_occupancy equals max_occupancy exactly", () => {
    fc.assert(
      fc.property(arbStart, arbMax, arbRampMonths, arbGrowthStep, arbStabMonths, (start, max, ramp, step, stab) => {
        const r = computeOccupancyRamp({
          start_occupancy: start,
          max_occupancy: max,
          ramp_months: ramp,
          growth_step: step,
          stabilization_months: stab,
        });
        expect(r.stabilized_occupancy).toBe(max);
      }),
      { numRuns: RUNS },
    );
  });

  it("revpar ≈ adr × occupancy when adr provided (tolerance scales with adr)", () => {
    fc.assert(
      fc.property(arbStart, arbMax, arbADR, (start, max, adr) => {
        const r = computeOccupancyRamp({
          start_occupancy: start,
          max_occupancy: max,
          ramp_months: 3,
          growth_step: 0.05,
          stabilization_months: 12,
          adr,
        });
        for (const s of r.stages) {
          expect(s.revpar).toBeDefined();
          // Occupancy is rounded to 2 decimals on display; revpar uses the
          // unrounded occupancy. Tolerance scales with adr: half-cent of
          // occupancy rounding × adr + small buffer for revpar's own rounding.
          const tol = adr * 0.006 + 0.05;
          expect(Math.abs(s.revpar! - adr * s.occupancy)).toBeLessThan(tol);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("stage months are sequential starting at 1", () => {
    fc.assert(
      fc.property(arbStart, arbMax, arbRampMonths, arbGrowthStep, arbStabMonths, (start, max, ramp, step, stab) => {
        const r = computeOccupancyRamp({
          start_occupancy: start,
          max_occupancy: max,
          ramp_months: ramp,
          growth_step: step,
          stabilization_months: stab,
        });
        for (let i = 0; i < r.stages.length; i++) {
          expect(r.stages[i].month).toBe(i + 1);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("all occupancies finite", () => {
    fc.assert(
      fc.property(arbStart, arbMax, arbRampMonths, arbGrowthStep, arbStabMonths, (start, max, ramp, step, stab) => {
        const r = computeOccupancyRamp({
          start_occupancy: start,
          max_occupancy: max,
          ramp_months: ramp,
          growth_step: step,
          stabilization_months: stab,
        });
        for (const s of r.stages) {
          expect(Number.isFinite(s.occupancy)).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// computeServiceFee
// ────────────────────────────────────────────────────────────────────────────

describe("computeServiceFee — property tests", () => {
  const knownServices = ["marketing", "technology_reservations", "accounting", "revenue_management", "procurement", "hr", "design", "general_management"];

  it("lowRate ≤ midRate ≤ highRate for all service types", () => {
    fc.assert(
      fc.property(
        fc.oneof(...knownServices.map((s) => fc.constant(s))),
        arbRevenue,
        (service, rev) => {
          const r = computeServiceFee({ propertyRevenue: rev, serviceType: service });
          expect(r.lowRate).toBeLessThanOrEqual(r.midRate);
          expect(r.midRate).toBeLessThanOrEqual(r.highRate);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("lowFee ≤ midFee ≤ highFee when revenue > 0", () => {
    fc.assert(
      fc.property(
        fc.oneof(...knownServices.map((s) => fc.constant(s))),
        arbRevenue,
        (service, rev) => {
          const r = computeServiceFee({ propertyRevenue: rev, serviceType: service });
          expect(r.lowFee).toBeLessThanOrEqual(r.midFee);
          expect(r.midFee).toBeLessThanOrEqual(r.highFee);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("midFee ≈ propertyRevenue × midRate (within rounding)", () => {
    fc.assert(
      fc.property(
        fc.oneof(...knownServices.map((s) => fc.constant(s))),
        arbRevenue,
        (service, rev) => {
          const r = computeServiceFee({ propertyRevenue: rev, serviceType: service });
          expect(Math.abs(r.midFee - rev * r.midRate)).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("zero revenue → all fees zero", () => {
    for (const service of knownServices) {
      const r = computeServiceFee({ propertyRevenue: 0, serviceType: service });
      expect(r.lowFee).toBe(0);
      expect(r.midFee).toBe(0);
      expect(r.highFee).toBe(0);
    }
  });

  it("unknown service type falls back to 1-3% range", () => {
    const r = computeServiceFee({ propertyRevenue: 1_000_000, serviceType: "totally_made_up_service" });
    expect(r.lowRate).toBe(0.01);
    expect(r.midRate).toBe(0.02);
    expect(r.highRate).toBe(0.03);
  });

  it("legacy 'it' alias maps to technology_reservations benchmarks", () => {
    const r = computeServiceFee({ propertyRevenue: 1_000_000, serviceType: "it" });
    // tech range is { low: 0.02, mid: 0.03, high: 0.04 }
    expect(r.midRate).toBeCloseTo(0.03);
  });

  it("all outputs finite", () => {
    fc.assert(
      fc.property(
        fc.oneof(...knownServices.map((s) => fc.constant(s))),
        arbRevenue,
        (service, rev) => {
          const r = computeServiceFee({ propertyRevenue: rev, serviceType: service });
          for (const f of [r.lowRate, r.midRate, r.highRate, r.lowFee, r.midFee, r.highFee]) {
            expect(Number.isFinite(f)).toBe(true);
          }
        },
      ),
      { numRuns: RUNS },
    );
  });
});
