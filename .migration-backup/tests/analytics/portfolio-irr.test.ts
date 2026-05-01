import { describe, it, expect } from "vitest";
import { computeIRR } from "../../analytics/returns/irr.js";
import { computeReturnMetrics } from "../../analytics/returns/metrics.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

function npv(cashFlows: number[], rate: number): number {
  let result = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    result += cashFlows[t] / Math.pow(1 + rate, t);
  }
  return result;
}

describe("Portfolio IRR — multi-property consolidated", () => {
  it("two properties acquired simultaneously", () => {
    const propA_flows = [-500_000, 40_000, 45_000, 50_000, 55_000, 60_000, 65_000, 70_000, 75_000, 80_000, 600_000];
    const propB_flows = [-300_000, 25_000, 28_000, 31_000, 34_000, 37_000, 40_000, 43_000, 46_000, 49_000, 400_000];

    const portfolio = propA_flows.map((v, i) => v + propB_flows[i]);

    const irrA = computeIRR(propA_flows);
    const irrB = computeIRR(propB_flows);
    const irrPortfolio = computeIRR(portfolio);

    expect(irrA.converged).toBe(true);
    expect(irrB.converged).toBe(true);
    expect(irrPortfolio.converged).toBe(true);

    const npvPortfolio = npv(portfolio, irrPortfolio.irr_periodic!);
    expect(Math.abs(npvPortfolio)).toBeLessThan(0.01);
  });

  it("staggered acquisitions — property B acquired in Year 2", () => {
    const years = 10;
    const portfolio = new Array(years + 1).fill(0);

    portfolio[0] = -500_000;
    for (let y = 1; y <= years; y++) portfolio[y] += 40_000 + (y - 1) * 5_000;
    portfolio[years] += 600_000;

    portfolio[2] += -300_000;
    for (let y = 3; y <= years; y++) portfolio[y] += 25_000 + (y - 3) * 3_000;
    portfolio[years] += 380_000;

    const result = computeIRR(portfolio);
    expect(result.converged).toBe(true);

    const nv = npv(portfolio, result.irr_periodic!);
    expect(Math.abs(nv)).toBeLessThan(1.0);
  });

  it("three properties with different acquisition years", () => {
    const years = 10;
    const portfolio = new Array(years + 1).fill(0);

    portfolio[0] += -1_000_000;
    for (let y = 1; y <= years; y++) portfolio[y] += 80_000;
    portfolio[years] += 1_200_000;

    portfolio[1] += -600_000;
    for (let y = 2; y <= years; y++) portfolio[y] += 50_000;
    portfolio[years] += 750_000;

    portfolio[3] += -400_000;
    for (let y = 4; y <= years; y++) portfolio[y] += 35_000;
    portfolio[years] += 500_000;

    const result = computeIRR(portfolio);
    expect(result.converged).toBe(true);

    const nv = npv(portfolio, result.irr_periodic!);
    expect(Math.abs(nv)).toBeLessThan(1.0);
  });

  it("portfolio MOIC = total distributions / total invested", () => {
    const propA = [-500_000, 50_000, 55_000, 60_000, 65_000, 700_000];
    const propB = [-300_000, 30_000, 35_000, 40_000, 45_000, 400_000];
    const portfolio = propA.map((v, i) => v + propB[i]);

    const metrics = computeReturnMetrics(portfolio, 1, rounding);

    expect(metrics.total_invested).toBe(800_000);

    const expectedDistributions = portfolio.filter(v => v > 0).reduce((a, b) => a + b, 0);
    expect(metrics.total_distributions).toBe(expectedDistributions);
    expect(metrics.moic).toBeCloseTo(expectedDistributions / 800_000, 2);
  });

  it("portfolio IRR is between individual property IRRs (diversification bound)", () => {
    const propA = [-500_000, 80_000, 85_000, 90_000, 95_000, 100_000, 105_000, 110_000, 115_000, 120_000, 800_000];
    const propB = [-500_000, 30_000, 32_000, 34_000, 36_000, 38_000, 40_000, 42_000, 44_000, 46_000, 600_000];

    const portfolio = propA.map((v, i) => v + propB[i]);

    const irrA = computeIRR(propA);
    const irrB = computeIRR(propB);
    const irrP = computeIRR(portfolio);

    expect(irrA.converged && irrB.converged && irrP.converged).toBe(true);

    const higher = Math.max(irrA.irr_periodic!, irrB.irr_periodic!);
    const lower = Math.min(irrA.irr_periodic!, irrB.irr_periodic!);

    expect(irrP.irr_periodic!).toBeGreaterThanOrEqual(lower - 0.001);
    expect(irrP.irr_periodic!).toBeLessThanOrEqual(higher + 0.001);
  });
});

describe("Portfolio IRR — equity multiple consistency", () => {
  it("net profit = total distributions - total invested", () => {
    const flows = [-1_000_000, 100_000, 120_000, 140_000, 160_000, 180_000, 200_000, 220_000, 240_000, 260_000, 2_000_000];
    const metrics = computeReturnMetrics(flows, 1, rounding);

    expect(metrics.net_profit).toBeCloseTo(metrics.total_distributions - metrics.total_invested, 2);
  });

  it("DPI equals MOIC for fully realized investment", () => {
    const flows = [-800_000, 60_000, 70_000, 80_000, 90_000, 1_000_000];
    const metrics = computeReturnMetrics(flows, 1, rounding);

    expect(metrics.dpi).toBe(metrics.moic);
  });
});
