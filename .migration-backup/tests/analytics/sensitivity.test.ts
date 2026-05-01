import { describe, it, expect } from "vitest";
import { runSensitivity } from "../../analytics/returns/sensitivity.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

describe("runSensitivity", () => {
  it("computes metrics for multiple scenarios", () => {
    const scenarios = [
      { label: "Base", cashFlows: [-1000, 500, 600] },
      { label: "Upside", cashFlows: [-1000, 600, 800] },
      { label: "Downside", cashFlows: [-1000, 300, 400] },
    ];

    const results = runSensitivity(scenarios, 1, rounding);
    expect(results).toHaveLength(3);

    // Upside should have higher MOIC than base
    const base = results.find((r) => r.label === "Base")!;
    const upside = results.find((r) => r.label === "Upside")!;
    const downside = results.find((r) => r.label === "Downside")!;

    expect(upside.metrics.moic).toBeGreaterThan(base.metrics.moic);
    expect(base.metrics.moic).toBeGreaterThan(downside.metrics.moic);
  });

  it("upside has higher IRR than downside", () => {
    const scenarios = [
      { label: "Upside", cashFlows: [-1000, 1500] },
      { label: "Downside", cashFlows: [-1000, 800] },
    ];

    const results = runSensitivity(scenarios, 1, rounding);
    const upside = results.find((r) => r.label === "Upside")!;
    const downside = results.find((r) => r.label === "Downside")!;

    expect(upside.metrics.irr.irr_periodic!).toBeGreaterThan(
      downside.metrics.irr.irr_periodic!,
    );
  });

  it("handles empty scenarios array", () => {
    const results = runSensitivity([], 1, rounding);
    expect(results).toHaveLength(0);
  });

  it("preserves labels", () => {
    const scenarios = [
      { label: "Cap Rate 7%", cashFlows: [-1000, 1200] },
      { label: "Cap Rate 9%", cashFlows: [-1000, 900] },
    ];
    const results = runSensitivity(scenarios, 1, rounding);
    expect(results[0].label).toBe("Cap Rate 7%");
    expect(results[1].label).toBe("Cap Rate 9%");
  });
});
