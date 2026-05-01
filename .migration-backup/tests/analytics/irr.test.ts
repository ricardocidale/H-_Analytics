import { describe, it, expect } from "vitest";
import { computeIRR } from "../../analytics/returns/irr.js";

describe("computeIRR — known cases", () => {
  it("solves simple two-cashflow case", () => {
    // Invest $100, receive $110 next period → IRR = 10%
    const result = computeIRR([-100, 110]);
    expect(result.converged).toBe(true);
    expect(result.irr_periodic).toBeCloseTo(0.1, 6);
  });

  it("solves classic investment case", () => {
    // Invest $1000, get $400/yr for 3 years → IRR ≈ 9.70%
    const result = computeIRR([-1000, 400, 400, 400]);
    expect(result.converged).toBe(true);
    expect(result.irr_periodic!).toBeCloseTo(0.0970, 3);
  });

  it("solves break-even case", () => {
    // Invest $100, get $100 back → IRR = 0%
    const result = computeIRR([-100, 100]);
    expect(result.converged).toBe(true);
    expect(result.irr_periodic!).toBeCloseTo(0, 6);
  });

  it("handles high-return case", () => {
    // Invest $100, get $200 next period → IRR = 100%
    const result = computeIRR([-100, 200]);
    expect(result.converged).toBe(true);
    expect(result.irr_periodic!).toBeCloseTo(1.0, 4);
  });

  it("handles negative return (loss)", () => {
    // Invest $100, get $50 back → IRR = -50%
    const result = computeIRR([-100, 50]);
    expect(result.converged).toBe(true);
    expect(result.irr_periodic!).toBeCloseTo(-0.5, 4);
  });

  it("handles multi-period with delayed returns", () => {
    // Invest $1000, nothing for 4 periods, then $1500
    const result = computeIRR([-1000, 0, 0, 0, 1500]);
    expect(result.converged).toBe(true);
    expect(result.irr_periodic!).toBeGreaterThan(0);
    // Verify: 1000 * (1 + r)^4 = 1500 → r ≈ 10.67%
    expect(result.irr_periodic!).toBeCloseTo(0.1067, 3);
  });
});

describe("computeIRR — annualization", () => {
  it("annualizes monthly IRR", () => {
    // Monthly: invest $1000, get $1010 next month → 1% monthly
    const result = computeIRR([-1000, 1010], 12);
    expect(result.converged).toBe(true);
    expect(result.irr_periodic!).toBeCloseTo(0.01, 4);
    // Annualized: (1.01)^12 - 1 ≈ 12.68%
    expect(result.irr_annualized!).toBeCloseTo(0.1268, 3);
  });

  it("annual periods: periodic equals annualized", () => {
    const result = computeIRR([-100, 120], 1);
    expect(result.irr_periodic).toBeCloseTo(0.2, 6);
    expect(result.irr_annualized).toBeCloseTo(0.2, 6);
  });
});

describe("computeIRR — edge cases", () => {
  it("returns null for all-negative cash flows", () => {
    const result = computeIRR([-100, -50, -25]);
    expect(result.converged).toBe(false);
    expect(result.irr_periodic).toBeNull();
  });

  it("returns null for all-positive cash flows", () => {
    const result = computeIRR([100, 50, 25]);
    expect(result.converged).toBe(false);
    expect(result.irr_periodic).toBeNull();
  });

  it("returns null for single cash flow", () => {
    const result = computeIRR([-100]);
    expect(result.converged).toBe(false);
    expect(result.irr_periodic).toBeNull();
  });

  it("returns null for empty array", () => {
    const result = computeIRR([]);
    expect(result.converged).toBe(false);
    expect(result.irr_periodic).toBeNull();
  });

  it("handles all-zero cash flows except endpoints", () => {
    const result = computeIRR([-1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1500]);
    expect(result.converged).toBe(true);
    expect(result.irr_periodic!).toBeGreaterThan(0);
  });
});
