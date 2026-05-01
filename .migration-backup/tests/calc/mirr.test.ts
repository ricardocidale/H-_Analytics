import { describe, it, expect } from "vitest";
import { computeMIRR } from "../../calc/returns/mirr";

describe("computeMIRR", () => {
  it("computes MIRR for a standard investment", () => {
    const result = computeMIRR({
      cash_flow_vector: [-1000000, 300000, 400000, 500000, 600000],
      finance_rate: 0.10,
      reinvestment_rate: 0.12,
    });
    expect(result.is_valid).toBe(true);
    expect(result.mirr).toBeGreaterThan(0);
    expect(result.mirr).toBeLessThan(1);
    expect(result.warnings).toHaveLength(0);
  });

  it("returns invalid for fewer than 2 periods", () => {
    const result = computeMIRR({
      cash_flow_vector: [-100000],
      finance_rate: 0.10,
      reinvestment_rate: 0.12,
    });
    expect(result.is_valid).toBe(false);
    expect(result.mirr).toBeNull();
    expect(result.warnings[0]).toContain("at least 2 periods");
  });

  it("returns invalid when no negative cash flows", () => {
    const result = computeMIRR({
      cash_flow_vector: [100000, 200000, 300000],
      finance_rate: 0.10,
      reinvestment_rate: 0.12,
    });
    expect(result.is_valid).toBe(false);
    expect(result.warnings[0]).toContain("No negative cash flows");
  });

  it("returns invalid when no positive cash flows", () => {
    const result = computeMIRR({
      cash_flow_vector: [-100000, -50000, -25000],
      finance_rate: 0.10,
      reinvestment_rate: 0.12,
    });
    expect(result.is_valid).toBe(false);
    expect(result.warnings[0]).toContain("No positive cash flows");
  });

  it("handles equal finance and reinvestment rates", () => {
    const result = computeMIRR({
      cash_flow_vector: [-500000, 200000, 200000, 200000],
      finance_rate: 0.08,
      reinvestment_rate: 0.08,
    });
    expect(result.is_valid).toBe(true);
    expect(result.mirr).toBeGreaterThan(0);
  });

  it("handles a single-period positive return", () => {
    const result = computeMIRR({
      cash_flow_vector: [-100000, 150000],
      finance_rate: 0.05,
      reinvestment_rate: 0.05,
    });
    expect(result.is_valid).toBe(true);
    expect(result.mirr).toBeCloseTo(0.50, 2);
  });

  it("handles mixed positive and negative flows", () => {
    const result = computeMIRR({
      cash_flow_vector: [-1000000, 500000, -200000, 800000, 600000],
      finance_rate: 0.10,
      reinvestment_rate: 0.12,
    });
    expect(result.is_valid).toBe(true);
    expect(result.mirr).toBeGreaterThan(0);
  });

  it("returns null for non-finite MIRR result", () => {
    const result = computeMIRR({
      cash_flow_vector: [-1e-300, 1e300, 1e300, 1e300, 1e300],
      finance_rate: 0.10,
      reinvestment_rate: 1e200,
    });
    expect(result.is_valid).toBe(false);
    expect(result.mirr).toBeNull();
  });

  it("golden: hand-calculated 3-period MIRR", () => {
    const result = computeMIRR({
      cash_flow_vector: [-1000, 600, 800],
      finance_rate: 0.08,
      reinvestment_rate: 0.06,
    });
    expect(result.is_valid).toBe(true);
    expect(result.mirr).toBeCloseTo(0.1983, 3);
  });
});
