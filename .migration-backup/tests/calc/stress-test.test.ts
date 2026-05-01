import { describe, it, expect } from "vitest";
import { computeStressTest, STANDARD_STRESS_SCENARIOS } from "../../calc/analysis/stress-test.js";
import type { StressTestInput } from "../../calc/analysis/stress-test.js";

const rounding = { precision: 2, bankers_rounding: false };

function makeInput(overrides: Partial<StressTestInput> = {}): StressTestInput {
  return {
    base_adr: 350,
    base_occupancy: 0.75,
    base_noi: 800000,
    room_count: 30,
    annual_revenue: 2000000,
    annual_debt_service: 400000,
    exit_cap_rate: 0.085,
    hold_period_years: 7,
    scenarios: STANDARD_STRESS_SCENARIOS,
    rounding_policy: rounding,
    ...overrides,
  };
}

describe("Stress Test Calculator", () => {
  it("computes base case metrics", () => {
    const result = computeStressTest(makeInput());
    expect(result.base_revpar).toBe(262.5);
    expect(result.base_exit_value).toBeGreaterThan(0);
    expect(result.base_dscr).toBe(2);
  });

  it("runs all standard stress scenarios", () => {
    const result = computeStressTest(makeInput());
    expect(result.scenarios.length).toBe(6);
  });

  it("stress scenarios reduce NOI", () => {
    const result = computeStressTest(makeInput());
    const recession = result.scenarios.find(s => s.label === "Severe Recession");
    expect(recession).toBeDefined();
    expect(recession!.noi_impact_pct).toBeLessThan(0);
  });

  it("pandemic shock is most severe", () => {
    const result = computeStressTest(makeInput());
    const pandemic = result.scenarios.find(s => s.label === "Pandemic Shock");
    expect(pandemic).toBeDefined();
    expect(pandemic!.severity).toBe("critical");
  });

  it("cap rate shock reduces exit value", () => {
    const result = computeStressTest(makeInput());
    const moderate = result.scenarios.find(s => s.label === "Moderate Downturn");
    expect(moderate).toBeDefined();
    expect(moderate!.stressed_exit_cap).toBeGreaterThan(0.085);
    expect(moderate!.exit_value_impact_pct).toBeLessThan(0);
  });

  it("tracks worst case across scenarios", () => {
    const result = computeStressTest(makeInput());
    expect(result.worst_case_noi).toBeLessThanOrEqual(result.base_revpar * 30 * 365);
    expect(result.worst_case_exit_value).toBeLessThanOrEqual(result.base_exit_value);
  });

  it("computes DSCR for each scenario", () => {
    const result = computeStressTest(makeInput());
    for (const scenario of result.scenarios) {
      expect(scenario.dscr).not.toBeNull();
      expect(typeof scenario.dscr).toBe("number");
    }
  });

  it("counts scenarios below DSCR threshold", () => {
    const result = computeStressTest(makeInput());
    expect(result.scenarios_below_dscr_threshold).toBeGreaterThanOrEqual(0);
    expect(result.scenarios_below_dscr_threshold).toBeLessThanOrEqual(result.scenarios.length);
  });

  it("computes portfolio risk score", () => {
    const result = computeStressTest(makeInput());
    expect(result.portfolio_risk_score).toBeGreaterThanOrEqual(0);
  });

  it("handles no debt service", () => {
    const result = computeStressTest(makeInput({ annual_debt_service: undefined }));
    expect(result.base_dscr).toBeNull();
    for (const scenario of result.scenarios) {
      expect(scenario.dscr).toBeNull();
      expect(scenario.dscr_passes).toBe(true);
    }
  });

  it("occupancy is capped at 100%", () => {
    const result = computeStressTest(makeInput({
      scenarios: [{ label: "Boom", adr_shock_pct: 20, occupancy_shock_pct: 50 }],
    }));
    expect(result.scenarios[0].stressed_occupancy).toBeLessThanOrEqual(1.0);
  });

  it("inflationary scenario shows expense pressure", () => {
    const result = computeStressTest(makeInput());
    const inflation = result.scenarios.find(s => s.label === "Inflationary Pressure");
    expect(inflation).toBeDefined();
    expect(inflation!.stressed_adr).toBeGreaterThan(350);
  });

  it("assigns severity levels correctly", () => {
    const result = computeStressTest(makeInput());
    const severities = result.scenarios.map(s => s.severity);
    expect(severities).toContain("critical");
    const validSeverities = ["low", "moderate", "severe", "critical"];
    for (const s of severities) {
      expect(validSeverities).toContain(s);
    }
  });
});
