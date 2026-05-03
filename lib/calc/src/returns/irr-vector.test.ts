import { describe, it, expect } from "vitest";
import { buildIRRVector } from "./irr-vector.js";

describe("buildIRRVector()", () => {
  it("places equity outflow at acquisition_year as a negative number", () => {
    const out = buildIRRVector({
      equity_invested: 1_000_000,
      acquisition_year: 0,
      yearly_fcfe: [0, 100_000, 100_000, 100_000, 100_000],
      projection_years: 5,
      exit_proceeds: 1_500_000,
    });
    expect(out.cash_flow_vector[0]).toBe(-1_000_000);
    expect(out.validation.has_negative).toBe(true);
    expect(out.validation.has_positive).toBe(true);
    expect(out.validation.has_exit).toBe(true);
    expect(out.validation.is_valid).toBe(true);
  });

  it("forces equity_invested to be treated as an outflow even if passed positive", () => {
    const out = buildIRRVector({
      equity_invested: 500_000, // positive on input
      acquisition_year: 0,
      yearly_fcfe: [0, 0, 0],
      projection_years: 3,
    });
    expect(out.cash_flow_vector[0]).toBeLessThan(0);
    expect(out.cash_flow_vector[0]).toBe(-500_000);
  });

  it("adds exit proceeds onto the final year's cash flow", () => {
    const out = buildIRRVector({
      equity_invested: 1_000_000,
      acquisition_year: 0,
      yearly_fcfe: [0, 50_000, 50_000, 50_000, 50_000],
      projection_years: 5,
      exit_proceeds: 1_200_000,
    });
    // Final year = yearly_fcfe[4] (50k) + exit_proceeds (1.2M).
    expect(out.cash_flow_vector[4]).toBeCloseTo(1_250_000, 2);
  });

  it("counts exactly one sign change for a textbook investment profile", () => {
    const out = buildIRRVector({
      equity_invested: 1_000_000,
      acquisition_year: 0,
      yearly_fcfe: [0, 100_000, 100_000, 100_000, 100_000],
      projection_years: 5,
      exit_proceeds: 1_500_000,
    });
    expect(out.validation.sign_changes).toBe(1);
    expect(out.warnings).not.toContain(
      "Multiple sign changes — IRR may have multiple solutions",
    );
  });

  it("warns about multiple sign changes when cash flows oscillate", () => {
    const out = buildIRRVector({
      equity_invested: 1_000_000,
      acquisition_year: 0,
      yearly_fcfe: [0, 500_000, -200_000, 500_000, 500_000],
      projection_years: 5,
      exit_proceeds: 1_000_000,
    });
    expect(out.validation.sign_changes).toBeGreaterThan(1);
    expect(out.warnings.some(w => w.includes("Multiple sign changes"))).toBe(true);
  });

  it("flags is_valid=false when there are no positive cash flows", () => {
    const out = buildIRRVector({
      equity_invested: 1_000_000,
      acquisition_year: 0,
      yearly_fcfe: [0, 0, 0, 0, 0],
      projection_years: 5,
      include_exit: false,
    });
    expect(out.validation.has_positive).toBe(false);
    expect(out.validation.is_valid).toBe(false);
  });

  it("excludes exit proceeds when include_exit=false", () => {
    const out = buildIRRVector({
      equity_invested: 100_000,
      acquisition_year: 0,
      yearly_fcfe: [0, 10_000, 10_000],
      projection_years: 3,
      exit_proceeds: 999_999,
      include_exit: false,
    });
    expect(out.validation.has_exit).toBe(false);
    expect(out.cash_flow_vector[2]).toBe(10_000); // exit not added
  });
});
