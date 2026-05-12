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

  it("emits 'No exit proceeds' warning when include_exit=false", () => {
    const out = buildIRRVector({
      equity_invested: 100_000,
      acquisition_year: 0,
      yearly_fcfe: [0, 10_000, 10_000],
      projection_years: 3,
      exit_proceeds: 999_999,
      include_exit: false,
    });
    expect(out.warnings.some(w => w.includes("No exit proceeds in final year"))).toBe(true);
  });

  it("emits 'No exit proceeds' warning when exit_proceeds is 0", () => {
    // exit_proceeds=0 is treated the same as no exit proceeds (no terminal value)
    const out = buildIRRVector({
      equity_invested: 100_000,
      acquisition_year: 0,
      yearly_fcfe: [0, 10_000, 10_000],
      projection_years: 3,
      exit_proceeds: 0,
    });
    expect(out.warnings.some(w => w.includes("No exit proceeds in final year"))).toBe(true);
    expect(out.validation.has_exit).toBe(false);
  });

  it("adds refinancing proceeds into the correct year index, not the final year", () => {
    // refi at year 2 of a 5-year projection must land in vector[2], not vector[4]
    const refiProceeds = [0, 0, 50_000, 0, 0];
    const out = buildIRRVector({
      equity_invested: 500_000,
      acquisition_year: 0,
      yearly_fcfe: [0, 20_000, 20_000, 20_000, 20_000],
      refinancing_proceeds: refiProceeds,
      projection_years: 5,
      exit_proceeds: 800_000,
    });
    // year 2 = fcfe[2] + refi[2] = 20,000 + 50,000 = 70,000
    expect(out.cash_flow_vector[2]).toBeCloseTo(70_000, 2);
    // year 4 (final) = fcfe[4] + exit only (no refi)
    expect(out.cash_flow_vector[4]).toBeCloseTo(20_000 + 800_000, 2);
  });

  it("degenerate: all-positive flows — has_negative=false, is_valid=false, warning issued", () => {
    // No equity outflow means IRR is undefined; validator must reject it
    const out = buildIRRVector({
      equity_invested: 0,
      acquisition_year: 0,
      yearly_fcfe: [10_000, 10_000, 10_000],
      projection_years: 3,
      exit_proceeds: 50_000,
    });
    expect(out.validation.has_negative).toBe(false);
    expect(out.validation.is_valid).toBe(false);
    expect(out.warnings.some(w => w.includes("No negative cash flows"))).toBe(true);
  });

  it("acquisition_year out of range emits a warning and leaves vector[0] as zero", () => {
    const out = buildIRRVector({
      equity_invested: 1_000_000,
      acquisition_year: 10,   // outside projection_years=5
      yearly_fcfe: [0, 50_000, 50_000, 50_000, 50_000],
      projection_years: 5,
      exit_proceeds: 1_000_000,
    });
    expect(out.warnings.some(w => w.includes("outside projection range"))).toBe(true);
    // equity was NOT placed — vector[0] is the FCFE value, not -equity
    expect(out.cash_flow_vector[0]).toBe(0); // fcfe[0] = 0, no equity subtracted
  });
});
