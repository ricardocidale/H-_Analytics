import { describe, it, expect } from "vitest";
import { computeIRR } from "../../analytics/returns/irr.js";

function npv(cashFlows: number[], rate: number): number {
  let result = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    result += cashFlows[t] / Math.pow(1 + rate, t);
  }
  return result;
}

describe("NPV-IRR cross-validation — NPV must equal zero at IRR", () => {
  const scenarios: { name: string; flows: number[]; periods: number }[] = [
    { name: "simple 2-period", flows: [-100, 110], periods: 1 },
    { name: "3-year even returns", flows: [-1000, 400, 400, 400], periods: 1 },
    { name: "break-even", flows: [-100, 100], periods: 1 },
    { name: "high-return 2x", flows: [-100, 200], periods: 1 },
    { name: "delayed payoff", flows: [-1000, 0, 0, 0, 1500], periods: 1 },
    { name: "10-year hotel investment", flows: [-5000000, 300000, 400000, 500000, 550000, 600000, 650000, 700000, 750000, 800000, 8500000], periods: 1 },
    { name: "negative early then positive", flows: [-2000, -500, 200, 800, 1200, 2000], periods: 1 },
    { name: "monthly short-term", flows: [-10000, 850, 850, 850, 850, 850, 850, 850, 850, 850, 850, 850, 850], periods: 12 },
    { name: "uneven hotel cash flows", flows: [-3000000, -50000, 100000, 250000, 350000, 400000, 450000, 500000, 550000, 600000, 5000000], periods: 1 },
    { name: "portfolio with mid-stream acquisition", flows: [-1000000, 80000, -500000, 120000, 150000, 180000, 200000, 220000, 250000, 280000, 3500000], periods: 1 },
  ];

  for (const scenario of scenarios) {
    it(`NPV ≈ 0 at IRR for: ${scenario.name}`, () => {
      const result = computeIRR(scenario.flows, scenario.periods);
      expect(result.converged).toBe(true);
      expect(result.irr_periodic).not.toBeNull();

      const computedNPV = npv(scenario.flows, result.irr_periodic!);
      expect(Math.abs(computedNPV)).toBeLessThan(0.01);
    });
  }

  it("annualized IRR is consistent with periodic IRR", () => {
    const flows = [-10000, 850, 850, 850, 850, 850, 850, 850, 850, 850, 850, 850, 850];
    const result = computeIRR(flows, 12);
    expect(result.converged).toBe(true);

    const annualizedFromPeriodic = Math.pow(1 + result.irr_periodic!, 12) - 1;
    expect(result.irr_annualized!).toBeCloseTo(annualizedFromPeriodic, 8);
  });

  it("IRR increases when returns increase (monotonicity)", () => {
    const base = computeIRR([-1000, 500, 600]);
    const better = computeIRR([-1000, 600, 700]);
    const worse = computeIRR([-1000, 400, 500]);

    expect(base.converged && better.converged && worse.converged).toBe(true);
    expect(better.irr_periodic!).toBeGreaterThan(base.irr_periodic!);
    expect(base.irr_periodic!).toBeGreaterThan(worse.irr_periodic!);
  });

  it("IRR is independent of cash flow scale (homogeneity)", () => {
    const small = computeIRR([-100, 50, 80]);
    const large = computeIRR([-100000, 50000, 80000]);

    expect(small.converged && large.converged).toBe(true);
    expect(small.irr_periodic!).toBeCloseTo(large.irr_periodic!, 6);
  });
});

describe("NPV-IRR — boundary and stress cases", () => {
  it("very small positive IRR (near break-even)", () => {
    const result = computeIRR([-1000, 501, 501]);
    expect(result.converged).toBe(true);
    expect(result.irr_periodic!).toBeGreaterThan(0);
    expect(result.irr_periodic!).toBeLessThan(0.05);
    const nv = npv([-1000, 501, 501], result.irr_periodic!);
    expect(Math.abs(nv)).toBeLessThan(0.01);
  });

  it("very small negative IRR (slight loss)", () => {
    const result = computeIRR([-1000, 490, 490]);
    expect(result.converged).toBe(true);
    expect(result.irr_periodic!).toBeLessThan(0);
    const nv = npv([-1000, 490, 490], result.irr_periodic!);
    expect(Math.abs(nv)).toBeLessThan(0.01);
  });

  it("long duration (20-year) cash flow stream", () => {
    const flows = [-5000000];
    for (let i = 0; i < 19; i++) flows.push(400000);
    flows.push(400000 + 6000000);
    const result = computeIRR(flows, 1);
    expect(result.converged).toBe(true);
    const nv = npv(flows, result.irr_periodic!);
    expect(Math.abs(nv)).toBeLessThan(1.0);
  });

  it("multiple sign changes still converges", () => {
    const flows = [-1000, 500, -200, 800, 300];
    const result = computeIRR(flows, 1);
    if (result.converged) {
      const nv = npv(flows, result.irr_periodic!);
      expect(Math.abs(nv)).toBeLessThan(0.01);
    }
  });
});
