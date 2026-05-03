import { describe, it, expect } from "vitest";
import { computeStressTest, type StressScenario } from "./stress-test.js";
import {
  STRESS_SEVERITY_MODERATE_PCT,
  STRESS_SEVERITY_SEVERE_PCT,
  STRESS_SEVERITY_CRITICAL_PCT,
} from "@shared/constants";

const RP = { precision: 2, bankers_rounding: false };

function runWithImpact(targetImpactPct: number) {
  // Derive a revenue_shock_pct that produces targetImpactPct on NOI.
  // base_revenue 1000, base_noi 200 → opex 800 (held flat).
  // stressed_noi = 1000 * (1 + s/100) - 800
  // noi_impact_pct = (stressed_noi - 200)/200 * 100 = (1000 * s/100)/200 * 100 = 5s
  // → s = targetImpactPct / 5
  const s = targetImpactPct / 5;
  const scenario: StressScenario = {
    label: `t=${targetImpactPct}`,
    adr_shock_pct: 0,
    occupancy_shock_pct: 0,
    revenue_shock_pct: s,
  };
  const out = computeStressTest({
    base_adr: 100,
    base_occupancy: 0.7,
    base_noi: 200,
    room_count: 50,
    annual_revenue: 1000,
    exit_cap_rate: 0.08,
    hold_period_years: 5,
    scenarios: [scenario],
    rounding_policy: RP,
  });
  return out.scenarios[0];
}

describe("stress-test severity mapping", () => {
  // Convention from stress-test.ts:178-188 — noi_impact_pct is SIGNED
  // (negative for adverse), and thresholds are negative.
  //   > -5  → "low"      (impact less negative than -5%)
  //   > -15 → "moderate" (impact in (-15, -5])
  //   > -30 → "severe"   (impact in (-30, -15])
  //   else  → "critical" (impact <= -30)

  it("returns 'low' for mild adverse impact (-2%)", () => {
    expect(runWithImpact(-2).severity).toBe("low");
  });

  it("returns 'low' at the moderate threshold boundary (impact == -5)", () => {
    // noi_impact_pct === STRESS_SEVERITY_MODERATE_PCT → not strictly greater → falls through
    // Since strict `>`, -5 is NOT "low"; it becomes "moderate".
    expect(runWithImpact(STRESS_SEVERITY_MODERATE_PCT).severity).toBe("moderate");
  });

  it("returns 'moderate' between -5 and -15", () => {
    expect(runWithImpact(-10).severity).toBe("moderate");
  });

  it("returns 'severe' between -15 and -30", () => {
    expect(runWithImpact(-20).severity).toBe("severe");
  });

  it("returns 'severe' just above the critical threshold (-29)", () => {
    expect(runWithImpact(-29).severity).toBe("severe");
  });

  it("returns 'critical' at the critical threshold (-30)", () => {
    // noi_impact_pct === STRESS_SEVERITY_CRITICAL_PCT → not strictly greater → critical
    expect(runWithImpact(STRESS_SEVERITY_CRITICAL_PCT).severity).toBe("critical");
  });

  it("returns 'critical' for catastrophic impact (-50)", () => {
    expect(runWithImpact(-50).severity).toBe("critical");
  });

  it("returns 'low' for positive impact (no adverse stress)", () => {
    expect(runWithImpact(+10).severity).toBe("low");
  });

  it("uses signed-negative thresholds", () => {
    // Sanity check that the constants themselves stay negative.
    expect(STRESS_SEVERITY_MODERATE_PCT).toBeLessThan(0);
    expect(STRESS_SEVERITY_SEVERE_PCT).toBeLessThan(STRESS_SEVERITY_MODERATE_PCT);
    expect(STRESS_SEVERITY_CRITICAL_PCT).toBeLessThan(STRESS_SEVERITY_SEVERE_PCT);
  });
});
