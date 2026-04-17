import { describe, it, expect } from "vitest";
import {
  evaluateCapitalRaise,
  evaluateStub,
  type CapitalRaiseInputs,
} from "../../engine/watchdog/capitalRaiseEvaluator";
import { DEFAULT_CAPITAL_RAISE_BENCHMARKS } from "../../shared/constants-funding";
import type { CapitalRaiseBenchmarks } from "../../shared/schema";

const BENCH: CapitalRaiseBenchmarks = {
  id: 1,
  userId: 1,
  ...DEFAULT_CAPITAL_RAISE_BENCHMARKS,
  lastRefreshedAt: null,
  refreshedBy: "stub",
  sourceCount: 0,
  tokensUsed: 0,
  nPlusOneEvidence: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as CapitalRaiseBenchmarks;

describe("capitalRaiseEvaluator", () => {
  it("returns ok with no inputs", () => {
    const r = evaluateCapitalRaise({}, BENCH);
    expect(r.severity).toBe("ok");
    expect(r.reasoning).toEqual([]);
    expect(r.suggestedActions).toEqual([]);
  });

  it("returns ok when every dimension lies inside the benchmark band", () => {
    const inputs: CapitalRaiseInputs = {
      runwayBufferMonths: 9,
      sizingOvershootPct: 0.20,
      trancheGapMonths: 10,
      revenueRampDelayMonths: 6,
      burnFlexDownPct: 0.20,
    };
    expect(evaluateCapitalRaise(inputs, BENCH).severity).toBe("ok");
  });

  it("alerts when runway buffer is below the floor", () => {
    const r = evaluateCapitalRaise({ runwayBufferMonths: 2 }, BENCH);
    expect(r.severity).toBe("alert");
    expect(r.reasoning[0]).toMatch(/Runway buffer/);
    expect(r.suggestedActions.find((a) => a.kind === "adjust")?.targetField).toBe(
      "safeTranche1Amount",
    );
    // Preset actions only — no free text path.
    expect(r.suggestedActions.map((a) => a.kind).sort()).toEqual(["ack", "adjust", "save_anyway"]);
  });

  it("warns (not alerts) when runway buffer is above the ceiling", () => {
    const r = evaluateCapitalRaise({ runwayBufferMonths: 24 }, BENCH);
    expect(r.severity).toBe("warn");
  });

  it("alerts when tranche gap exceeds the ceiling", () => {
    const r = evaluateCapitalRaise({ trancheGapMonths: 18 }, BENCH);
    expect(r.severity).toBe("alert");
    expect(r.suggestedActions.find((a) => a.kind === "adjust")?.label).toMatch(/Capital Raise 2/);
  });

  it("warns when sizing overshoot is below the floor", () => {
    const r = evaluateCapitalRaise({ sizingOvershootPct: 0.05 }, BENCH);
    expect(r.severity).toBe("warn");
    expect(r.reasoning[0]).toMatch(/Sizing overshoot/);
  });

  it("alerts when revenue ramp delay exceeds the ceiling", () => {
    const r = evaluateCapitalRaise({ revenueRampDelayMonths: 12 }, BENCH);
    expect(r.severity).toBe("alert");
    expect(r.reasoning[0]).toMatch(/Revenue ramp delay/);
  });

  it("warns when revenue ramp delay is below the floor", () => {
    const r = evaluateCapitalRaise({ revenueRampDelayMonths: 1 }, BENCH);
    expect(r.severity).toBe("warn");
    expect(r.reasoning[0]).toMatch(/Revenue ramp delay/);
  });

  it("alerts when burn flex-down headroom is below the floor", () => {
    const r = evaluateCapitalRaise({ burnFlexDownPct: 0.02 }, BENCH);
    expect(r.severity).toBe("alert");
    expect(r.reasoning[0]).toMatch(/Burn flex-down/);
  });

  it("warns when burn flex-down headroom is above the ceiling", () => {
    const r = evaluateCapitalRaise({ burnFlexDownPct: 0.5 }, BENCH);
    expect(r.severity).toBe("warn");
    expect(r.reasoning[0]).toMatch(/Burn flex-down/);
  });

  it("escalates to alert when at least one dimension is alert-level", () => {
    const r = evaluateCapitalRaise(
      { sizingOvershootPct: 0.05, burnFlexDownPct: 0.02 },
      BENCH,
    );
    expect(r.severity).toBe("alert");
    expect(r.reasoning.length).toBeGreaterThanOrEqual(2);
  });

  it("caps reasoning at 4 bullets", () => {
    const r = evaluateCapitalRaise(
      {
        runwayBufferMonths: 2,
        sizingOvershootPct: 0.5,
        trancheGapMonths: 18,
        revenueRampDelayMonths: 12,
        burnFlexDownPct: 0.02,
      },
      BENCH,
    );
    expect(r.severity).toBe("alert");
    expect(r.reasoning.length).toBeLessThanOrEqual(4);
  });

  it("never produces free-text input affordances", () => {
    const r = evaluateCapitalRaise({ runwayBufferMonths: 2 }, BENCH);
    for (const a of r.suggestedActions) {
      expect(["adjust", "ack", "save_anyway"]).toContain(a.kind);
    }
  });
});

describe("evaluateStub", () => {
  it("always returns ok with no actions", () => {
    const r = evaluateStub();
    expect(r.severity).toBe("ok");
    expect(r.suggestedActions).toEqual([]);
  });
});
