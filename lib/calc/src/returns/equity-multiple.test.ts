import { describe, it, expect } from "vitest";
import { computeEquityMultiple } from "./equity-multiple.js";

const RP = { precision: 2, bankers_rounding: false };

describe("computeEquityMultiple()", () => {
  it("returns 2.5x for $1M in / $2.5M out", () => {
    const out = computeEquityMultiple({
      cash_flows: [-1_000_000, 200_000, 200_000, 200_000, 1_900_000],
      rounding_policy: RP,
    });
    expect(out.total_invested).toBeCloseTo(1_000_000, 2);
    expect(out.total_returned).toBeCloseTo(2_500_000, 2);
    expect(out.equity_multiple).toBeCloseTo(2.5, 4);
    expect(out.net_profit).toBeCloseTo(1_500_000, 2);
    expect(out.profit_margin).toBeCloseTo(1.5, 4);
  });

  it("returns 1.0x when distributions exactly equal investment", () => {
    const out = computeEquityMultiple({
      cash_flows: [-500_000, 250_000, 250_000],
      rounding_policy: RP,
    });
    expect(out.equity_multiple).toBeCloseTo(1.0, 4);
    expect(out.net_profit).toBeCloseTo(0, 2);
    expect(out.profit_margin).toBeCloseTo(0, 4);
  });

  it("returns multiple < 1 for capital loss", () => {
    const out = computeEquityMultiple({
      cash_flows: [-1_000_000, 100_000, 400_000],
      rounding_policy: RP,
    });
    expect(out.equity_multiple).toBeCloseTo(0.5, 4);
    expect(out.net_profit).toBeCloseTo(-500_000, 2);
  });

  it("returns 0 when no capital was invested (avoids divide-by-zero)", () => {
    const out = computeEquityMultiple({
      cash_flows: [100_000, 200_000],
      rounding_policy: RP,
    });
    expect(out.total_invested).toBe(0);
    expect(out.equity_multiple).toBe(0);
    expect(out.profit_margin).toBe(0);
  });

  it("aggregates multiple capital calls and multiple distributions", () => {
    const out = computeEquityMultiple({
      cash_flows: [-500_000, -300_000, 100_000, 100_000, 1_400_000],
      rounding_policy: RP,
    });
    expect(out.total_invested).toBeCloseTo(800_000, 2);
    expect(out.total_returned).toBeCloseTo(1_600_000, 2);
    expect(out.equity_multiple).toBeCloseTo(2.0, 4);
  });

  it("propagates the optional label", () => {
    const out = computeEquityMultiple({
      cash_flows: [-100, 200],
      label: "base case",
      rounding_policy: RP,
    });
    expect(out.label).toBe("base case");
  });
});
