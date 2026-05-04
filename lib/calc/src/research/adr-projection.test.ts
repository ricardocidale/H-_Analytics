import { describe, it, expect } from "vitest";
import { computeADRProjection } from "./adr-projection.js";

describe("computeADRProjection()", () => {
  it("returns zero ADR and 0% growth for all years when start_adr is zero", () => {
    const out = computeADRProjection({
      start_adr: 0,
      growth_rate: 0.10,
      projection_years: 3,
    });
    expect(out.start_adr).toBe(0);
    expect(out.end_adr).toBe(0);
    expect(out.total_growth_pct).toBe("0%");
    for (const proj of out.projections) {
      expect(proj.adr).toBe(0);
      expect(proj.adr_growth_from_start).toBe("0%");
      // No Infinity or NaN from the zero division
      expect(Number.isFinite(proj.adr)).toBe(true);
    }
  });

  it("projects ADR correctly over multiple years (golden values)", () => {
    // start_adr=100, growth=5%, no inflation, 3 years
    // Year 1: 100 * 1.05^1 = 105.00
    // Year 2: 100 * 1.05^2 = 110.25
    // Year 3: 100 * 1.05^3 ≈ 115.76 (rounded to cents)
    const out = computeADRProjection({
      start_adr: 100,
      growth_rate: 0.05,
      projection_years: 3,
    });
    expect(out.projections).toHaveLength(3);
    expect(out.projections[0].adr).toBe(105);
    expect(out.projections[1].adr).toBe(110.25);
    expect(out.projections[2].adr).toBe(115.76);
    expect(out.cagr).toBe("5%");
  });

  it("computes RevPAR when occupancy is provided", () => {
    // start_adr=200, growth=0 (static), occupancy=0.80
    // Year 1 adr = 200; revpar = 200 * 0.80 = 160
    const out = computeADRProjection({
      start_adr: 200,
      growth_rate: 0,
      projection_years: 1,
      occupancy: 0.80,
    });
    expect(out.projections[0].revpar).toBe(160);
  });

  it("omits revpar when occupancy is not provided", () => {
    const out = computeADRProjection({
      start_adr: 150,
      growth_rate: 0.03,
      projection_years: 1,
    });
    expect(out.projections[0].revpar).toBeUndefined();
  });

  it("applies inflation_rate additively to growth_rate", () => {
    // Combined effective rate = (1+0.05)*(1+0.02) - 1 ≈ 7.1%
    // Year 1 adr: 100 * 1.05 * 1.02 = 107.10
    const out = computeADRProjection({
      start_adr: 100,
      growth_rate: 0.05,
      inflation_rate: 0.02,
      projection_years: 1,
    });
    expect(out.projections[0].adr).toBeCloseTo(107.10, 1);
    expect(out.cagr).toBe("7.1%");
  });

  it("returns correct total_growth_pct across the full projection window", () => {
    // start_adr=100, growth=10%, 2 years
    // Year 2 adr = 100 * 1.10^2 = 121.00
    // total_growth = (121 - 100) / 100 * 100 = 21% → "21%"
    const out = computeADRProjection({
      start_adr: 100,
      growth_rate: 0.10,
      projection_years: 2,
    });
    expect(out.end_adr).toBe(121);
    expect(out.total_growth_pct).toBe("21%");
  });
});
