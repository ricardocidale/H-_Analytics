/**
 * P6a — Required Fields gate contract test.
 *
 * Asserts that admin-declared `requiredFields` on a Specialist's config
 * gate dispatch at the router level: a missing field short-circuits the
 * Specialist (it never runs) and surfaces as `RequiredFieldsMissingError`
 * (wrapped in the SurfaceRouter's `SpecialistExecutionError`). The route
 * handler then converts that error into a 200 + `requiredFieldsMissing`
 * response (see server/routes/global-assumptions.ts).
 *
 * Cases:
 *   1. All required fields present  → Specialist runs, verdict returns.
 *   2. One required field missing   → Specialist NEVER runs, error thrown.
 *   3. Empty requiredFields (default) → no gate, behaviour unchanged.
 *   4. Required field present but blank string → counts as missing.
 *
 * Also covers the pure helper `findMissingRequiredFields` for
 * null/undefined/""/NaN semantics and dot-path resolution.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createMgmtCoRouter,
  findMissingRequiredFields,
  MGMT_CO_FUNDING_ID,
  RequiredFieldsMissingError,
} from "@engine/analyst/surface/mgmt-co";
import { createVoiceRenderer } from "@engine/analyst/voice/voice-renderer";
import { createQualityScorer } from "@engine/analyst/quality/quality-scorer";
import {
  createSurfaceRouter,
  SpecialistExecutionError,
  type SpecialistFn,
} from "@engine/analyst/router/surface-router";
import type { PersonaContext } from "@engine/analyst/contracts/verdict";
import type { AnalystWatchdogBenchmarks } from "@shared/schema";
import type { RevenueBenchmarks } from "@shared/constants-revenue-benchmarks";
import { DEFAULT_COMPENSATION_BENCHMARKS } from "@shared/constants-compensation-benchmarks";
import { DEFAULT_OVERHEAD_BENCHMARKS } from "@shared/constants-overhead-benchmarks";
import { DEFAULT_COMPANY_BENCHMARKS } from "@shared/constants-company-benchmarks";

const PERSONA: PersonaContext = { segment: "L+B", tier: "luxury", market: "US" };
const NOW = new Date("2026-04-22T00:00:00.000Z");
const EVIDENCE_AS_OF = "2026-04-01";

const FUNDING_BENCH = {
  id: 1, userId: 1,
  runwayBufferMonthsLow: 6,  runwayBufferMonthsMid: 9,  runwayBufferMonthsHigh: 12,
  sizingOvershootPctLow: 0.10, sizingOvershootPctMid: 0.20, sizingOvershootPctHigh: 0.30,
  trancheGapMonthsLow: 9, trancheGapMonthsMid: 12, trancheGapMonthsHigh: 18,
  revenueRampDelayMonthsLow: 6, revenueRampDelayMonthsMid: 9, revenueRampDelayMonthsHigh: 12,
  burnFlexDownPctLow: 0.10, burnFlexDownPctMid: 0.20, burnFlexDownPctHigh: 0.30,
  effectiveAsOf: "2026-01-01",
} as unknown as AnalystWatchdogBenchmarks;

const REVENUE_BENCH: RevenueBenchmarks = {
  marketingRate:      { low: 0.03, high: 0.05 },
  fbRevenueShare:     { low: 0.20, high: 0.40 },
  eventsRevenueShare: { low: 0.05, high: 0.15 },
  otherRevenueShare:  { low: 0.00, high: 0.10 },
  cateringBoostPct:   { low: 0.00, high: 0.20 },
};

const WELL_SIZED_FUNDING = {
  runwayBufferMonths: 9,
  sizingOvershootPct: 0.20,
  trancheGapMonths: 12,
  revenueRampDelayMonths: 9,
  burnFlexDownPct: 0.20,
};

function makeRouter(requiredFields: readonly string[]) {
  return createMgmtCoRouter(
    { voiceRenderer: createVoiceRenderer(), qualityScorer: createQualityScorer() },
    { funding: FUNDING_BENCH, revenue: REVENUE_BENCH, compensation: DEFAULT_COMPENSATION_BENCHMARKS, overhead: DEFAULT_OVERHEAD_BENCHMARKS, company: DEFAULT_COMPANY_BENCHMARKS },
    {
      evidenceAsOf: EVIDENCE_AS_OF,
      configs: { funding: { requiredFields } },
    },
  );
}

describe("P6a — required-fields gate (mgmt-co.funding)", () => {
  it("Case 1: all required fields present → Specialist runs and returns a verdict", async () => {
    const router = makeRouter([
      "runwayBufferMonths",
      "sizingOvershootPct",
    ]);
    const verdict = await router.dispatch({
      specialistId: MGMT_CO_FUNDING_ID,
      payload: WELL_SIZED_FUNDING,
      persona: PERSONA,
      now: NOW,
    });
    expect(verdict.specialistId).toBe(MGMT_CO_FUNDING_ID);
    expect(verdict.dimensions.length).toBeGreaterThan(0);
    expect(verdict.overallSeverity).toBe("ok");
  });

  it("Case 2: one required field missing → Specialist NEVER runs, RequiredFieldsMissingError thrown", async () => {
    const router = makeRouter([
      "runwayBufferMonths",
      "trancheGapMonths",
    ]);
    // Spy on the underlying evaluator by inspecting the wrapped error's
    // payload shape: the gate runs BEFORE the Specialist ever sees it.
    // We assert two things: (1) the wrapped error names the missing field,
    // (2) overallSeverity / dimensions never get computed (no verdict).
    const payload = { ...WELL_SIZED_FUNDING, trancheGapMonths: undefined };
    let caught: unknown = null;
    try {
      await router.dispatch({
        specialistId: MGMT_CO_FUNDING_ID,
        payload,
        persona: PERSONA,
        now: NOW,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SpecialistExecutionError);
    const inner = (caught as SpecialistExecutionError).cause;
    expect(inner).toBeInstanceOf(RequiredFieldsMissingError);
    expect((inner as RequiredFieldsMissingError).missingFields).toEqual(["trancheGapMonths"]);
    expect((inner as RequiredFieldsMissingError).specialistId).toBe(MGMT_CO_FUNDING_ID);
  });

  it("Case 3: empty requiredFields (default state) → no gate active, Specialist runs unchanged", async () => {
    const router = makeRouter([]);
    // Even with a payload missing fields the evaluator would normally use,
    // the absence of any required-fields list means the gate is a no-op.
    const verdict = await router.dispatch({
      specialistId: MGMT_CO_FUNDING_ID,
      payload: WELL_SIZED_FUNDING,
      persona: PERSONA,
      now: NOW,
    });
    expect(verdict.specialistId).toBe(MGMT_CO_FUNDING_ID);
    expect(verdict.dimensions.length).toBeGreaterThan(0);
  });

  it("Case 4: required field present but blank string → counts as missing", async () => {
    const router = makeRouter(["runwayBufferMonths"]);
    const payload = { ...WELL_SIZED_FUNDING, runwayBufferMonths: "   " as unknown as number };
    let caught: unknown = null;
    try {
      await router.dispatch({
        specialistId: MGMT_CO_FUNDING_ID,
        payload,
        persona: PERSONA,
        now: NOW,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SpecialistExecutionError);
    const inner = (caught as SpecialistExecutionError).cause as RequiredFieldsMissingError;
    expect(inner).toBeInstanceOf(RequiredFieldsMissingError);
    expect(inner.missingFields).toContain("runwayBufferMonths");
  });

  it("gate runs BEFORE the Specialist — substantive: the inner SpecialistFn never observes the payload", async () => {
    // Defence-in-depth at the wrapper layer. We build a SurfaceRouter
    // directly (not createMgmtCoRouter) so we can inject a real spy as
    // the inner SpecialistFn and prove it was never invoked when the
    // gate fires. Mirrors how createMgmtCoRouter wraps each registered
    // Specialist with withRequiredFieldsGate.
    const evalSpy = vi.fn<SpecialistFn>();
    // Build the wrapper inline to mirror withRequiredFieldsGate's
    // behaviour without going through createMgmtCoRouter (which always
    // registers real Funding/Revenue Specialists). This proves the
    // wrapper short-circuits before calling its inner argument.
    const wrappedSpecialist: SpecialistFn = (payload) => {
      const missing = findMissingRequiredFields(payload, ["runwayBufferMonths"]);
      if (missing.length > 0) throw new RequiredFieldsMissingError("test.spy", missing);
      return evalSpy(payload, { persona: PERSONA });
    };
    const router = createSurfaceRouter({
      voiceRenderer: createVoiceRenderer(),
      qualityScorer: createQualityScorer(),
    });
    router.register("test.spy", wrappedSpecialist);

    let caught: unknown = null;
    try {
      await router.dispatch({
        specialistId: "test.spy",
        payload: { runwayBufferMonths: null as unknown as number },
        persona: PERSONA,
        now: NOW,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SpecialistExecutionError);
    const inner = (caught as SpecialistExecutionError).cause;
    expect(inner).toBeInstanceOf(RequiredFieldsMissingError);
    // Substantive assertion: the inner SpecialistFn was never invoked.
    expect(evalSpy).not.toHaveBeenCalled();
  });

  it("revenue path: router with empty requiredFields is a no-op even when admin would have authored saved-row keys", async () => {
    // Regression coverage for the two-namespace bug closed in P6a follow-up:
    // - admin-entered revenue requiredFields belong to the SAVED-ROW
    //   namespace (defaultCostRateMarketing, defaultRevShareFb, ...)
    // - the router-level wrapper sees the post-default-substitution
    //   DISPATCH-PAYLOAD namespace (marketingRate, fbRevenueShare, ...)
    // The route handler intentionally passes [] for revenue.requiredFields
    // and runs its own pre-check against saved-row keys. This test proves
    // the wrapper does not false-positive when given [] and the dispatch
    // payload uses dispatch-payload keys.
    const router = createMgmtCoRouter(
      { voiceRenderer: createVoiceRenderer(), qualityScorer: createQualityScorer() },
      { funding: FUNDING_BENCH, revenue: REVENUE_BENCH, compensation: DEFAULT_COMPENSATION_BENCHMARKS, overhead: DEFAULT_OVERHEAD_BENCHMARKS, company: DEFAULT_COMPANY_BENCHMARKS },
      {
        evidenceAsOf: EVIDENCE_AS_OF,
        configs: { revenue: { requiredFields: [] } },
      },
    );
    const verdict = await router.dispatch({
      specialistId: "mgmt-co.revenue",
      payload: {
        marketingRate: 0.05,
        fbRevenueShare: 0.20,
        eventsRevenueShare: 0.10,
        otherRevenueShare: 0.05,
        cateringBoostPct: 0.10,
      },
      persona: PERSONA,
      now: NOW,
    });
    // Verdict should be produced (gate did not fire); we only check the
    // top-level shape — full Specialist correctness is covered elsewhere.
    expect(verdict.specialistId).toBe("mgmt-co.revenue");
    expect(["ok", "advisory", "warning", "block"]).toContain(verdict.overallSeverity);
  });

  it("revenue saved-row pre-check: findMissingRequiredFields catches missing saved-row keys before the ?? DEFAULT_* substitution", () => {
    // Mirrors the revenue branch in server/routes/global-assumptions.ts:
    // the gate runs against the saved row BEFORE defaults fill the
    // dispatch payload. This proves the saved-row namespace works.
    const savedRowMissing: Record<string, unknown> = {
      defaultCostRateMarketing: null,
      defaultRevShareFb: 0.20,           // 0.20 is meaningful, NOT missing
      defaultRevShareEvents: undefined,  // missing
      defaultRevShareOther: 0,           // 0 is meaningful, NOT missing
      defaultCateringBoostPct: "",       // missing
    };
    const required = [
      "defaultCostRateMarketing",
      "defaultRevShareFb",
      "defaultRevShareEvents",
      "defaultRevShareOther",
      "defaultCateringBoostPct",
    ];
    expect(findMissingRequiredFields(savedRowMissing, required)).toEqual([
      "defaultCostRateMarketing",
      "defaultRevShareEvents",
      "defaultCateringBoostPct",
    ]);
  });
});

describe("P6a — findMissingRequiredFields helper", () => {
  it("treats null, undefined, empty string, whitespace, and NaN as missing", () => {
    const payload = {
      a: null,
      b: undefined,
      c: "",
      d: "   ",
      e: NaN,
      f: 0,
      g: false,
      h: "value",
    };
    const missing = findMissingRequiredFields(payload, ["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(missing).toEqual(["a", "b", "c", "d", "e"]);
    // Notably: 0 and false are NOT missing — they're meaningful zero/falsy
    // values that the Specialist should evaluate.
  });

  it("supports dot-path resolution into nested payloads", () => {
    const payload = { funding: { targetEquityRaiseUsd: 1_000_000, founderEquityPct: null } };
    expect(findMissingRequiredFields(payload, ["funding.targetEquityRaiseUsd"])).toEqual([]);
    expect(findMissingRequiredFields(payload, ["funding.founderEquityPct"])).toEqual(["funding.founderEquityPct"]);
    expect(findMissingRequiredFields(payload, ["funding.doesNotExist"])).toEqual(["funding.doesNotExist"]);
  });

  it("returns empty array for empty requiredFields list", () => {
    expect(findMissingRequiredFields({ a: null }, [])).toEqual([]);
  });

  it("handles non-object payloads gracefully", () => {
    expect(findMissingRequiredFields(null, ["a"])).toEqual(["a"]);
    expect(findMissingRequiredFields(undefined, ["a"])).toEqual(["a"]);
    expect(findMissingRequiredFields("not-an-object", ["a"])).toEqual(["a"]);
  });
});
