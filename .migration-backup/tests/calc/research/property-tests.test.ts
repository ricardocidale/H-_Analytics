/**
 * Property-based tests for calc/research/ deterministic tools.
 *
 * Uses fast-check to generate many inputs and assert invariants that must
 * hold across ALL valid inputs, not just hand-picked ones. Complements the
 * example-based tests in `tests/calc/research-tools.test.ts`, which check
 * specific numeric results.
 *
 * Scope (initial round):
 *   - computeCapRateValuation
 *   - computePropertyMetrics
 *   - computeADRProjection
 *
 * Covered tools: 3 of 10. The remaining 7 (cost-benchmarks, debt-capacity,
 * depreciation-basis, make-vs-buy, markup-waterfall, occupancy-ramp,
 * service-fee) should follow the same pattern in a subsequent commit.
 *
 * Why property tests here: research tools are pure functions called by the
 * LLM during Cognitive Engine runs. Any NaN/Infinity/negative-at-boundary
 * bug produces bad verdicts silently. Property tests catch entire CLASSES
 * of bugs example tests cannot.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeCapRateValuation } from "../../../calc/research/cap-rate-valuation";
import { computePropertyMetrics } from "../../../calc/research/property-metrics";
import { computeADRProjection } from "../../../calc/research/adr-projection";

// ────────────────────────────────────────────────────────────────────────────
// Arbitraries — bounded generators that stay inside domain reality.
// ────────────────────────────────────────────────────────────────────────────

/** Realistic NOI in dollars: $50k to $50M annual. */
const arbNOI = fc.double({ noNaN: true, noDefaultInfinity: true, min: 50_000, max: 50_000_000 });

/** Cap rate as a decimal, 0.03–0.20 (3%–20%). */
const arbCapRate = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0.03, max: 0.20 });

/** Room count: 5 to 500. */
const arbRoomCount = fc.integer({ min: 5, max: 500 });

/** ADR: $80–$2,000. */
const arbADR = fc.double({ noNaN: true, noDefaultInfinity: true, min: 80, max: 2000 });

/** Occupancy: 0.2–1.0 (tool allows up to 1, but below 0.2 is unrealistic). */
const arbOccupancy = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0.2, max: 1.0 });

/** Annual growth rate: 0–15%. */
const arbGrowthRate = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 0.15 });

/** Inflation rate: 0–12%. */
const arbInflationRate = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 0.12 });

/** Projection years: 1–15 (realistic hold periods). */
const arbProjectionYears = fc.integer({ min: 1, max: 15 });

const FAST_CHECK_RUNS = 200;

// ────────────────────────────────────────────────────────────────────────────
// computeCapRateValuation
// ────────────────────────────────────────────────────────────────────────────

describe("computeCapRateValuation — property tests", () => {
  it("implied_value × cap_rate ≈ annual_noi (roundtrip identity)", () => {
    fc.assert(
      fc.property(arbNOI, arbCapRate, (noi, rate) => {
        const result = computeCapRateValuation({ annual_noi: noi, cap_rate: rate });
        // Implied value is rounded to whole dollars, so allow tolerance of 2 × cap_rate dollars.
        const reconstructed = result.implied_value * rate;
        expect(Math.abs(reconstructed - noi)).toBeLessThan(Math.abs(rate) + 1);
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("returns finite, non-NaN implied_value for any valid inputs", () => {
    fc.assert(
      fc.property(arbNOI, arbCapRate, (noi, rate) => {
        const result = computeCapRateValuation({ annual_noi: noi, cap_rate: rate });
        expect(Number.isFinite(result.implied_value)).toBe(true);
        expect(result.implied_value).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("doubling NOI doubles implied_value (linearity)", () => {
    fc.assert(
      fc.property(arbNOI, arbCapRate, (noi, rate) => {
        const base = computeCapRateValuation({ annual_noi: noi, cap_rate: rate });
        const doubled = computeCapRateValuation({ annual_noi: noi * 2, cap_rate: rate });
        // Allow ±1 dollar for rounding (Math.round on each).
        expect(Math.abs(doubled.implied_value - base.implied_value * 2)).toBeLessThanOrEqual(1);
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("sensitivity table is monotonically decreasing in cap_rate", () => {
    fc.assert(
      fc.property(arbNOI, arbCapRate, (noi, rate) => {
        const result = computeCapRateValuation({ annual_noi: noi, cap_rate: rate });
        // As cap_rate goes up, implied_value goes down.
        for (let i = 0; i < result.sensitivity.length - 1; i++) {
          const row = result.sensitivity[i];
          const next = result.sensitivity[i + 1];
          expect(row.cap_rate).toBeLessThan(next.cap_rate);
          expect(row.implied_value).toBeGreaterThanOrEqual(next.implied_value);
        }
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("throws on zero or negative cap_rate", () => {
    expect(() => computeCapRateValuation({ annual_noi: 1_000_000, cap_rate: 0 })).toThrow();
    expect(() => computeCapRateValuation({ annual_noi: 1_000_000, cap_rate: -0.05 })).toThrow();
  });

  it("spread computed correctly when purchase_price provided", () => {
    fc.assert(
      fc.property(arbNOI, arbCapRate, fc.double({ noNaN: true, noDefaultInfinity: true, min: 100_000, max: 100_000_000 }), (noi, rate, price) => {
        const result = computeCapRateValuation({ annual_noi: noi, cap_rate: rate, purchase_price: price });
        expect(result.spread_to_purchase).toBe(result.implied_value - price);
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// computePropertyMetrics
// ────────────────────────────────────────────────────────────────────────────

describe("computePropertyMetrics — property tests", () => {
  it("revpar = adr × occupancy (allowing for rounding)", () => {
    fc.assert(
      fc.property(arbRoomCount, arbADR, arbOccupancy, (rooms, adr, occ) => {
        const result = computePropertyMetrics({ room_count: rooms, adr, occupancy: occ });
        // roundCents (centi-rounding). Expect within $0.01.
        expect(Math.abs(result.revpar - adr * occ)).toBeLessThan(0.02);
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("annual_room_revenue = monthly_room_revenue × 12 (exact)", () => {
    fc.assert(
      fc.property(arbRoomCount, arbADR, arbOccupancy, (rooms, adr, occ) => {
        const result = computePropertyMetrics({ room_count: rooms, adr, occupancy: occ });
        // Each is already roundCents'd; 12 × monthly should equal annual within 12 cents.
        expect(Math.abs(result.annual_room_revenue - result.monthly_room_revenue * 12)).toBeLessThanOrEqual(0.12);
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("annual_total_revenue = monthly_total_revenue × 12", () => {
    fc.assert(
      fc.property(arbRoomCount, arbADR, arbOccupancy, (rooms, adr, occ) => {
        const result = computePropertyMetrics({ room_count: rooms, adr, occupancy: occ });
        expect(Math.abs(result.annual_total_revenue - result.monthly_total_revenue * 12)).toBeLessThanOrEqual(0.12);
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("revenue_breakdown components sum to annual_total_revenue (within tolerance)", () => {
    fc.assert(
      fc.property(arbRoomCount, arbADR, arbOccupancy, (rooms, adr, occ) => {
        const result = computePropertyMetrics({ room_count: rooms, adr, occupancy: occ });
        const { rooms: r, events, fb, other } = result.revenue_breakdown;
        const sum = r + events + fb + other;
        // Each component is roundCents'd separately, so tolerate up to $1 per component × 4.
        expect(Math.abs(sum - result.annual_total_revenue)).toBeLessThanOrEqual(5);
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("annual_noi ≤ annual_gop (NOI can only be smaller after fees + undistributed)", () => {
    fc.assert(
      fc.property(arbRoomCount, arbADR, arbOccupancy, (rooms, adr, occ) => {
        const result = computePropertyMetrics({ room_count: rooms, adr, occupancy: occ });
        expect(result.annual_noi).toBeLessThanOrEqual(result.annual_gop + 1);
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("gop_margin_pct ≤ 100 (can be negative; upper-bounded by total revenue)", () => {
    fc.assert(
      fc.property(arbRoomCount, arbADR, arbOccupancy, (rooms, adr, occ) => {
        const result = computePropertyMetrics({ room_count: rooms, adr, occupancy: occ });
        expect(result.gop_margin_pct).toBeLessThanOrEqual(100);
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("higher occupancy ⇒ higher annual total revenue (monotonicity in occupancy)", () => {
    fc.assert(
      fc.property(arbRoomCount, arbADR, (rooms, adr) => {
        const lower = computePropertyMetrics({ room_count: rooms, adr, occupancy: 0.5 });
        const higher = computePropertyMetrics({ room_count: rooms, adr, occupancy: 0.75 });
        expect(higher.annual_total_revenue).toBeGreaterThanOrEqual(lower.annual_total_revenue);
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("all numeric outputs are finite (no NaN / Infinity)", () => {
    fc.assert(
      fc.property(arbRoomCount, arbADR, arbOccupancy, (rooms, adr, occ) => {
        const r = computePropertyMetrics({ room_count: rooms, adr, occupancy: occ });
        const fields: number[] = [
          r.revpar,
          r.monthly_room_revenue,
          r.annual_room_revenue,
          r.monthly_total_revenue,
          r.annual_total_revenue,
          r.annual_gop,
          r.gop_margin_pct,
          r.annual_noi,
          r.noi_margin_pct,
          r.revenue_per_room,
          r.cost_per_room,
          r.revenue_breakdown.rooms,
          r.revenue_breakdown.events,
          r.revenue_breakdown.fb,
          r.revenue_breakdown.other,
        ];
        for (const f of fields) {
          expect(Number.isFinite(f)).toBe(true);
        }
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("doubling room_count roughly doubles annual_total_revenue", () => {
    fc.assert(
      fc.property(arbADR, arbOccupancy, (adr, occ) => {
        const base = computePropertyMetrics({ room_count: 20, adr, occupancy: occ });
        const doubled = computePropertyMetrics({ room_count: 40, adr, occupancy: occ });
        // Revenue scales linearly with rooms; allow small rounding error.
        const ratio = doubled.annual_total_revenue / base.annual_total_revenue;
        expect(ratio).toBeGreaterThan(1.99);
        expect(ratio).toBeLessThan(2.01);
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// computeADRProjection
// ────────────────────────────────────────────────────────────────────────────

describe("computeADRProjection — property tests", () => {
  it("produces exactly projection_years entries", () => {
    fc.assert(
      fc.property(arbADR, arbGrowthRate, arbProjectionYears, (adr, growth, years) => {
        const result = computeADRProjection({ start_adr: adr, growth_rate: growth, projection_years: years });
        expect(result.projections).toHaveLength(years);
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("with positive growth + positive inflation, ADR strictly increases year-over-year", () => {
    fc.assert(
      fc.property(
        arbADR,
        fc.double({ noNaN: true, noDefaultInfinity: true, min: 0.001, max: 0.15 }),
        fc.double({ noNaN: true, noDefaultInfinity: true, min: 0.001, max: 0.10 }),
        arbProjectionYears,
        (adr, growth, inflation, years) => {
          const result = computeADRProjection({
            start_adr: adr,
            growth_rate: growth,
            inflation_rate: inflation,
            projection_years: years,
          });
          for (let i = 0; i < result.projections.length - 1; i++) {
            expect(result.projections[i + 1].adr).toBeGreaterThan(result.projections[i].adr);
          }
        },
      ),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("with zero growth and zero inflation, ADR stays ≈ start_adr every year", () => {
    fc.assert(
      fc.property(arbADR, arbProjectionYears, (adr, years) => {
        const result = computeADRProjection({
          start_adr: adr,
          growth_rate: 0,
          inflation_rate: 0,
          projection_years: years,
        });
        for (const p of result.projections) {
          // roundCents may shift by up to $0.01.
          expect(Math.abs(p.adr - adr)).toBeLessThanOrEqual(0.02);
        }
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("end_adr equals projections[last].adr", () => {
    fc.assert(
      fc.property(arbADR, arbGrowthRate, arbProjectionYears, (adr, growth, years) => {
        const result = computeADRProjection({ start_adr: adr, growth_rate: growth, projection_years: years });
        expect(result.end_adr).toBe(result.projections[result.projections.length - 1].adr);
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("RevPAR = ADR × occupancy at every year when occupancy provided", () => {
    fc.assert(
      fc.property(arbADR, arbGrowthRate, arbOccupancy, arbProjectionYears, (adr, growth, occ, years) => {
        const result = computeADRProjection({
          start_adr: adr,
          growth_rate: growth,
          projection_years: years,
          occupancy: occ,
        });
        for (const p of result.projections) {
          expect(p.revpar).toBeDefined();
          expect(Math.abs(p.revpar! - p.adr * occ)).toBeLessThan(0.02);
        }
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("all projection ADRs are finite (no NaN, no Infinity)", () => {
    fc.assert(
      fc.property(arbADR, arbGrowthRate, arbInflationRate, arbProjectionYears, (adr, growth, inflation, years) => {
        const result = computeADRProjection({
          start_adr: adr,
          growth_rate: growth,
          inflation_rate: inflation,
          projection_years: years,
        });
        for (const p of result.projections) {
          expect(Number.isFinite(p.adr)).toBe(true);
          expect(p.adr).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: FAST_CHECK_RUNS },
    );
  });

  it("start_adr === 0 produces 0% growth string without NaN", () => {
    const result = computeADRProjection({ start_adr: 0, growth_rate: 0.05, projection_years: 5 });
    expect(result.total_growth_pct).toBe("0%");
    for (const p of result.projections) {
      expect(p.adr_growth_from_start).toBe("0%");
    }
  });
});
