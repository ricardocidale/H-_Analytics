import { describe, it, expect } from "vitest";
import { computeReturnMetrics } from "../../analytics/returns/metrics.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

describe("computeReturnMetrics — basic", () => {
  it("computes MOIC for 2x return", () => {
    // Invest $100, get $200 back
    const metrics = computeReturnMetrics([-100, 200], 1, rounding);
    expect(metrics.moic).toBe(2);
    expect(metrics.total_invested).toBe(100);
    expect(metrics.total_distributions).toBe(200);
    expect(metrics.net_profit).toBe(100);
  });

  it("computes MOIC for partial loss", () => {
    // Invest $100, get $50 back
    const metrics = computeReturnMetrics([-100, 50], 1, rounding);
    expect(metrics.moic).toBe(0.5);
    expect(metrics.net_profit).toBe(-50);
  });

  it("computes DPI same as MOIC for fully realized", () => {
    const metrics = computeReturnMetrics([-1000, 500, 800], 1, rounding);
    expect(metrics.dpi).toBe(metrics.moic);
  });

  it("computes cash-on-cash yield", () => {
    // Invest $1000, get $100/yr for 3 years, then $1000
    const cashFlows = [-1000, 100, 100, 100, 1000];
    const metrics = computeReturnMetrics(cashFlows, 1, rounding);
    // Total: -1000 + 100 + 100 + 100 + 1000 = 300 over 5 periods (5 years)
    // Avg annual: 300/5 = 60
    // CoC = 60/1000 = 0.06
    expect(metrics.cash_on_cash).toBeCloseTo(0.06, 2);
  });

  it("includes IRR in metrics", () => {
    const metrics = computeReturnMetrics([-100, 110], 1, rounding);
    expect(metrics.irr.converged).toBe(true);
    expect(metrics.irr.irr_periodic).toBeCloseTo(0.1, 4);
  });
});

describe("computeReturnMetrics — edge cases", () => {
  it("handles zero investment", () => {
    const metrics = computeReturnMetrics([0, 100], 1, rounding);
    expect(metrics.total_invested).toBe(0);
    expect(metrics.moic).toBe(0);
    expect(metrics.cash_on_cash).toBe(0);
  });

  it("handles no distributions", () => {
    const metrics = computeReturnMetrics([-100, 0, 0], 1, rounding);
    expect(metrics.total_distributions).toBe(0);
    expect(metrics.moic).toBe(0);
    expect(metrics.net_profit).toBe(-100);
  });

  it("handles monthly periods for annualized IRR", () => {
    // Monthly invest/return
    const metrics = computeReturnMetrics([-1000, 1010], 12, rounding);
    expect(metrics.irr.irr_annualized).not.toBeNull();
    expect(metrics.irr.irr_annualized!).toBeGreaterThan(metrics.irr.irr_periodic!);
  });
});
