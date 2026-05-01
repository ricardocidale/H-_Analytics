import { describe, it, expect } from "vitest";
import { buildIRRVector } from "../../calc/returns/irr-vector.js";
import type { IRRVectorInput } from "../../calc/returns/irr-vector.js";

function makeInput(overrides: Partial<IRRVectorInput> = {}): IRRVectorInput {
  return {
    equity_invested: 100_000,
    acquisition_year: 0,
    yearly_fcfe: [10_000, 20_000, 30_000],
    exit_proceeds: 150_000,
    projection_years: 3,
    ...overrides,
  };
}

describe("buildIRRVector — basic vector construction", () => {
  it("places negative equity at acquisition year and adds FCFE + exit", () => {
    const result = buildIRRVector(makeInput());
    expect(result.cash_flow_vector).toHaveLength(3);
    expect(result.cash_flow_vector[0]).toBe(-100_000 + 10_000);
    expect(result.cash_flow_vector[1]).toBe(20_000);
    expect(result.cash_flow_vector[2]).toBe(30_000 + 150_000);
  });

  it("validation flags are correct for standard investment", () => {
    const result = buildIRRVector(makeInput());
    expect(result.validation.has_negative).toBe(true);
    expect(result.validation.has_positive).toBe(true);
    expect(result.validation.has_exit).toBe(true);
    expect(result.validation.is_valid).toBe(true);
    expect(result.validation.sign_changes).toBe(1);
  });

  it("no warnings for well-formed vector", () => {
    const result = buildIRRVector(makeInput());
    expect(result.warnings).toHaveLength(0);
  });
});

describe("buildIRRVector — acquisition year placement", () => {
  it("places equity at specified year", () => {
    const result = buildIRRVector(makeInput({
      acquisition_year: 1,
      yearly_fcfe: [5_000, 10_000, 20_000],
      projection_years: 3,
    }));
    expect(result.cash_flow_vector[0]).toBe(5_000);
    expect(result.cash_flow_vector[1]).toBe(-100_000 + 10_000);
    expect(result.cash_flow_vector[2]).toBe(20_000 + 150_000);
  });

  it("warns when acquisition year is out of range", () => {
    const result = buildIRRVector(makeInput({ acquisition_year: 5 }));
    expect(result.warnings.some(w => w.includes("outside projection range"))).toBe(true);
    expect(result.validation.has_negative).toBe(false);
  });
});

describe("buildIRRVector — exit proceeds", () => {
  it("adds exit proceeds to last year", () => {
    const result = buildIRRVector(makeInput());
    const lastYear = result.cash_flow_vector[2];
    expect(lastYear).toBe(30_000 + 150_000);
  });

  it("warns when include_exit is false", () => {
    const result = buildIRRVector(makeInput({ include_exit: false }));
    expect(result.warnings.some(w => w.includes("No exit proceeds"))).toBe(true);
    expect(result.validation.has_exit).toBe(false);
    expect(result.cash_flow_vector[2]).toBe(30_000);
  });

  it("warns when exit_proceeds is zero", () => {
    const result = buildIRRVector(makeInput({ exit_proceeds: 0 }));
    expect(result.warnings.some(w => w.includes("No exit proceeds"))).toBe(true);
  });
});

describe("buildIRRVector — refinancing proceeds", () => {
  it("adds refinancing proceeds to correct years", () => {
    const result = buildIRRVector(makeInput({
      refinancing_proceeds: [0, 200_000, 0],
    }));
    expect(result.cash_flow_vector[1]).toBe(20_000 + 200_000);
  });
});

describe("buildIRRVector — sign change detection", () => {
  it("detects single sign change for standard investment", () => {
    const result = buildIRRVector(makeInput());
    expect(result.validation.sign_changes).toBe(1);
  });

  it("detects multiple sign changes", () => {
    const result = buildIRRVector(makeInput({
      equity_invested: 100_000,
      acquisition_year: 0,
      yearly_fcfe: [200_000, -150_000, 50_000],
      exit_proceeds: 0,
      projection_years: 3,
      include_exit: false,
    }));
    expect(result.validation.sign_changes).toBeGreaterThan(1);
    expect(result.warnings.some(w => w.includes("Multiple sign changes"))).toBe(true);
  });
});

describe("buildIRRVector — validation warnings", () => {
  it("warns when no negative cash flows", () => {
    const result = buildIRRVector(makeInput({
      equity_invested: 0,
      yearly_fcfe: [10_000, 20_000, 30_000],
    }));
    expect(result.warnings.some(w => w.includes("No negative cash flows"))).toBe(true);
    expect(result.validation.is_valid).toBe(false);
  });

  it("warns when no positive cash flows", () => {
    const result = buildIRRVector(makeInput({
      yearly_fcfe: [0, 0, 0],
      exit_proceeds: 0,
    }));
    expect(result.warnings.some(w => w.includes("No positive cash flows"))).toBe(true);
    expect(result.validation.is_valid).toBe(false);
  });
});

describe("buildIRRVector — rounding", () => {
  it("rounds cash flow values to cents", () => {
    const result = buildIRRVector(makeInput({
      equity_invested: 100_000.555,
      yearly_fcfe: [10_000.333, 20_000.777, 30_000.111],
    }));
    for (const cf of result.cash_flow_vector) {
      expect(cf * 100).toBe(Math.round(cf * 100));
    }
  });
});
