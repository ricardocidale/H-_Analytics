import { describe, it, expect } from "vitest";
import { compareScenarios } from "../../calc/analysis/scenario-compare.js";
import type { ScenarioCompareInput, ScenarioMetrics } from "../../calc/analysis/scenario-compare.js";

function makeMetrics(overrides: Partial<ScenarioMetrics> = {}): ScenarioMetrics {
  return {
    noi: [100_000, 110_000],
    irr: 0.12,
    ...overrides,
  };
}

function makeInput(overrides: Partial<ScenarioCompareInput> = {}): ScenarioCompareInput {
  return {
    baseline_label: "Base",
    alternative_label: "Alt",
    baseline_metrics: makeMetrics(),
    alternative_metrics: makeMetrics({ noi: [110_000, 120_000], irr: 0.14 }),
    ...overrides,
  };
}

describe("compareScenarios — IRR direction", () => {
  it("improved when alt IRR > baseline IRR by > 1 bps", () => {
    const result = compareScenarios(makeInput());
    expect(result.summary.irr_delta).toBe(200);
    expect(result.summary.irr_direction).toBe("improved");
  });

  it("worsened when alt IRR < baseline IRR", () => {
    const result = compareScenarios(makeInput({
      alternative_metrics: makeMetrics({ noi: [90_000, 95_000], irr: 0.09 }),
    }));
    expect(result.summary.irr_delta).toBe(-300);
    expect(result.summary.irr_direction).toBe("worsened");
  });

  it("unchanged when delta < 1 bps", () => {
    const result = compareScenarios(makeInput({
      alternative_metrics: makeMetrics({ irr: 0.120004 }),
    }));
    expect(result.summary.irr_direction).toBe("unchanged");
  });
});

describe("compareScenarios — cumulative NOI", () => {
  it("computes cumulative NOI delta and pct change", () => {
    const result = compareScenarios(makeInput());
    expect(result.summary.cumulative_noi_delta).toBe(20_000);
    expect(result.summary.cumulative_noi_pct_change).toBeGreaterThan(0);
  });
});

describe("compareScenarios — yearly deltas", () => {
  it("produces yearly delta for each year", () => {
    const result = compareScenarios(makeInput({
      baseline_metrics: makeMetrics({
        total_revenue: [200_000, 220_000],
        noi: [100_000, 110_000],
        net_income: [80_000, 90_000],
        ending_cash: [50_000, 60_000],
      }),
      alternative_metrics: makeMetrics({
        total_revenue: [210_000, 230_000],
        noi: [110_000, 120_000],
        net_income: [90_000, 100_000],
        ending_cash: [55_000, 65_000],
        irr: 0.14,
      }),
    }));

    expect(result.yearly_deltas).toHaveLength(2);
    expect(result.yearly_deltas[0].year).toBe(1);
    expect(result.yearly_deltas[0].revenue_delta).toBe(10_000);
    expect(result.yearly_deltas[0].noi_delta).toBe(10_000);
    expect(result.yearly_deltas[1].year).toBe(2);
  });
});

describe("compareScenarios — risk flags", () => {
  it("flags negative cash in alternative when baseline is positive", () => {
    const result = compareScenarios(makeInput({
      baseline_metrics: makeMetrics({ ending_cash: [10_000, 10_000] }),
      alternative_metrics: makeMetrics({
        ending_cash: [10_000, -5_000],
        irr: 0.10,
      }),
    }));
    expect(result.risk_flags.some(f => f.includes("negative cash"))).toBe(true);
  });

  it("flags large IRR decrease (> 200 bps)", () => {
    const result = compareScenarios(makeInput({
      alternative_metrics: makeMetrics({ irr: 0.08 }),
    }));
    expect(result.risk_flags.some(f => f.includes("IRR decreased"))).toBe(true);
  });

  it("flags negative NOI in alternative when baseline positive", () => {
    const result = compareScenarios(makeInput({
      baseline_metrics: makeMetrics({ noi: [100_000] }),
      alternative_metrics: makeMetrics({ noi: [-50_000], irr: 0.05 }),
    }));
    expect(result.risk_flags.some(f => f.includes("negative NOI"))).toBe(true);
  });

  it("no risk flags for mild improvement", () => {
    const result = compareScenarios(makeInput());
    expect(result.risk_flags).toHaveLength(0);
  });
});

describe("compareScenarios — equity multiple and exit value", () => {
  it("computes equity multiple delta", () => {
    const result = compareScenarios(makeInput({
      baseline_metrics: makeMetrics({ equity_multiple: 2.0 }),
      alternative_metrics: makeMetrics({ equity_multiple: 2.3, irr: 0.14 }),
    }));
    expect(result.summary.equity_multiple_delta).toBeCloseTo(0.3, 4);
  });

  it("computes exit value delta", () => {
    const result = compareScenarios(makeInput({
      baseline_metrics: makeMetrics({ exit_value: 5_000_000 }),
      alternative_metrics: makeMetrics({ exit_value: 5_500_000, irr: 0.14 }),
    }));
    expect(result.summary.exit_value_delta).toBe(500_000);
  });
});

describe("compareScenarios — sensitivity ranking", () => {
  it("distributes IRR impact evenly across assumption changes", () => {
    const result = compareScenarios(makeInput({
      assumption_changes: [
        { field: "ADR", baseline_value: "$300", alternative_value: "$330" },
        { field: "Occupancy", baseline_value: "70%", alternative_value: "75%" },
      ],
    }));
    expect(result.sensitivity_ranking).toHaveLength(2);
    expect(result.sensitivity_ranking[0].impact_on_irr_bps).toBe(100);
    expect(result.sensitivity_ranking[1].impact_on_irr_bps).toBe(100);
  });

  it("empty when no assumption changes", () => {
    const result = compareScenarios(makeInput());
    expect(result.sensitivity_ranking).toHaveLength(0);
  });
});
