import { describe, it, expect } from "vitest";
import { computeIRR } from "../../analytics/returns/irr.js";

/**
 * Utility NPV function for cross-checking IRR results.
 * NPV = Σ CF_t / (1+r)^t
 */
function calculateNPV(cashFlows: number[], rate: number): number {
  return cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
}

describe("IRR Golden Edge Cases", () => {
  // 1. Single large exit ([-1M, 0, 0, 0, 0, 2M]) — expected IRR ≈ 14.87% ((2)^(1/5)-1)
  it("Scenario 1: Single large exit after 5 years", () => {
    const cashFlows = [-1000000, 0, 0, 0, 0, 2000000];
    const result = computeIRR(cashFlows);
    
    // Hand-calculated: (2,000,000 / 1,000,000)^(1/5) - 1 = 2^(0.2) - 1 ≈ 0.14869835
    const expectedIRR = Math.pow(2, 1/5) - 1;
    
    expect(result.converged).toBe(true);
    expect(result.irr_periodic).toBeCloseTo(expectedIRR, 6);
    expect(calculateNPV(cashFlows, result.irr_periodic!)).toBeCloseTo(0, 2);
  });

  // 2. Monthly cash flows annualized ([-1200, 10, 10, ...(×24), 1300]) — monthly IRR annualized
  it("Scenario 2: Monthly cash flows with exit at month 25", () => {
    const cashFlows = [-1200, ...Array(24).fill(10), 1300];
    const periodsPerYear = 12;
    const result = computeIRR(cashFlows, periodsPerYear);
    
    expect(result.converged).toBe(true);
    expect(result.irr_periodic).not.toBeNull();
    
    // Cross-check with NPV
    expect(calculateNPV(cashFlows, result.irr_periodic!)).toBeCloseTo(0, 2);
    
    // Annualized check: (1 + r_periodic)^12 - 1
    const expectedAnnualized = Math.pow(1 + result.irr_periodic!, 12) - 1;
    expect(result.irr_annualized).toBeCloseTo(expectedAnnualized, 6);
  });

  // 3. Near-zero return ([-1000, 1001]) — IRR ≈ 0.1%
  it("Scenario 3: Near-zero positive return", () => {
    const cashFlows = [-1000, 1001];
    const result = computeIRR(cashFlows);
    
    // Hand-calculated: 1001/1000 - 1 = 0.001 (0.1%)
    const expectedIRR = 0.001;
    
    expect(result.converged).toBe(true);
    expect(result.irr_periodic).toBeCloseTo(expectedIRR, 6);
    expect(calculateNPV(cashFlows, result.irr_periodic!)).toBeCloseTo(0, 2);
  });

  // 4. Very high return ([-100, 500]) — IRR = 400%
  it("Scenario 4: Very high return", () => {
    const cashFlows = [-100, 500];
    const result = computeIRR(cashFlows);
    
    // Hand-calculated: 500/100 - 1 = 4.0 (400%)
    const expectedIRR = 4.0;
    
    expect(result.converged).toBe(true);
    expect(result.irr_periodic).toBeCloseTo(expectedIRR, 6);
    expect(calculateNPV(cashFlows, result.irr_periodic!)).toBeCloseTo(0, 2);
  });

  // 5. Large negative return ([-1000, 100]) — IRR = -90%
  it("Scenario 5: Large negative return", () => {
    const cashFlows = [-1000, 100];
    const result = computeIRR(cashFlows);
    
    // Hand-calculated: 100/1000 - 1 = -0.9 (-90%)
    const expectedIRR = -0.9;
    
    expect(result.converged).toBe(true);
    expect(result.irr_periodic).toBeCloseTo(expectedIRR, 6);
    expect(calculateNPV(cashFlows, result.irr_periodic!)).toBeCloseTo(0, 2);
  });

  // 6. Alternating signs ([-500, 300, -200, 600]) — verify convergence
  it("Scenario 6: Alternating signs", () => {
    const cashFlows = [-500, 300, -200, 600];
    const result = computeIRR(cashFlows);
    
    expect(result.converged).toBe(true);
    expect(result.irr_periodic).not.toBeNull();
    expect(calculateNPV(cashFlows, result.irr_periodic!)).toBeCloseTo(0, 2);
  });

  // 7. Long hold period 30 years ([-1M, 80k×29, 1.2M]) — verify convergence
  it("Scenario 7: Long hold period (30 years)", () => {
    const cashFlows = [-1000000, ...Array(29).fill(80000), 1200000];
    const result = computeIRR(cashFlows);
    
    expect(result.converged).toBe(true);
    expect(result.irr_periodic).not.toBeNull();
    expect(calculateNPV(cashFlows, result.irr_periodic!)).toBeCloseTo(0, 0); // Tolerance higher for long period
  });

  // 8. All cash flows equal magnitude ([-100, 20, 20, 20, 20, 20]) — IRR = 0% (break-even)
  it("Scenario 8: Break-even cash flows", () => {
    const cashFlows = [-100, 20, 20, 20, 20, 20];
    const result = computeIRR(cashFlows);
    
    // Hand-calculated: -100 + 20*5 = 0. At 0% discount rate, NPV = 0.
    const expectedIRR = 0;
    
    expect(result.converged).toBe(true);
    expect(result.irr_periodic).toBeCloseTo(expectedIRR, 6);
    expect(calculateNPV(cashFlows, result.irr_periodic!)).toBeCloseTo(0, 2);
  });

  // 9. NPV cross-check for every scenario - integrated into tests above
});
