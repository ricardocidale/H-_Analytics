/**
 * G2 tests for `runRevenueSpecialist` — N+1 pipeline + Prompt Engineer
 * pre-stage + bounded regress loop. Mirror of the Funding G6-P3a + G6-P3b
 * + G6-P4 Intelligence Bar bench, adapted to Revenue's 5 dimensions and
 * decimal-fraction outputs.
 *
 * Coverage (IB bar — req #1, #6, #7, #8, #9 are statically assertable):
 *   - PE always runs: 3 generateObject + 1 streamObject on happy path
 *   - First-pass success: regressCount === 0
 *   - One regress: regressCount === 1 + 6 generateObject + 2 streamObject
 *   - Two regresses exhausted → honest-fail with regressCount === 2
 *   - Convergence-fail (all-developing quant) → honest-fail, streamObject never called
 *   - PE failure throws Tier1UnavailableError without panels/synthesis
 *   - Regress-phase failure throws Tier1UnavailableError
 *   - validateSynthesisOutput unit: collapsed range, zero refs, missing key, short reasoning
 *   - cognitiveRunId / promptEngineerRunId prefixes match revenue-g2 convention
 *   - meta.vendorsUsed contains ≥2 distinct vendors on happy + honest-fail
 *   - non-ok numeric dimension carries range + ≥3 evidence + ≥1 Rev comp entry
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamObject: vi.fn(),
    generateObject: vi.fn(),
  };
});

vi.mock("../../../server/storage/reference-range", () => ({
  lookupReferenceRange: vi.fn().mockResolvedValue(null),
}));

import { streamObject, generateObject } from "ai";
import {
  runRevenueSpecialist,
  Tier1UnavailableError,
} from "../../../server/ai/specialists/mgmt-co-revenue-runner";
import type { RevenueSpecialistOutput } from "../../../server/ai/specialists/mgmt-co-revenue-output-schema";
import type { QuantPanelOutput } from "../../../server/ai/specialists/mgmt-co-revenue-quant-panel-schema";
import type { MarketPanelOutput } from "../../../server/ai/specialists/mgmt-co-revenue-market-panel-schema";
import type { RevenuePromptInputContext } from "../../../server/ai/specialists/mgmt-co-revenue-prompt-input-builder";
import { getCannedRevenueComparables } from "../../../server/ai/specialists/mgmt-co-revenue-orchestrator-adapter";
import { validateSynthesisOutput } from "../../../server/ai/specialists/mgmt-co-revenue-synthesis-validator";
import {
  REVENUE_DIMENSION_KEYS,
  type RevenueDimensionKey,
} from "../../../server/ai/specialists/mgmt-co-revenue-prompt-input-builder";
import { DEFAULT_REVENUE_BENCHMARKS } from "@shared/constants-revenue-benchmarks";

// ────────────────────────────────────────────────────────────────────────────
// Fixtures

const FIXED_NOW = new Date("2026-04-30T12:00:00Z");

const COMPARABLES = getCannedRevenueComparables();

/**
 * Default per-dimension fractions chosen to land within DEFAULT_REVENUE_BENCHMARKS
 * bands so the happy-path verdict has no advisory dimensions; specific tests
 * override individual values to drive severity transitions.
 */
const DEFAULT_INPUTS: Record<RevenueDimensionKey, number> = {
  marketingRate: 0.06,
  fbRevenueShare: 0.32,
  eventsRevenueShare: 0.15,
  otherRevenueShare: 0.03,
  cateringBoostPct: 0.05,
};

const CTX: RevenuePromptInputContext = {
  inputs: DEFAULT_INPUTS,
  portfolio: { propertyCount: 4, avgOccupancyRate: 0.72, avgAdr: 380 },
  persona: { verticalSlug: "boutique-luxury", marketTier: "L+B", locale: "US" },
  priorVerdicts: [],
};

// ── Stub model instances ────────────────────────────────────────────────────

const STUB_ANTHROPIC_MODEL = { specificationVersion: "v1" } as ReturnType<
  ReturnType<typeof import("@ai-sdk/anthropic").createAnthropic>
>;
const STUB_GOOGLE_MODEL = { specificationVersion: "v1", modelId: "gemini-2.5-flash" } as ReturnType<
  ReturnType<typeof import("@ai-sdk/google").createGoogleGenerativeAI>
>;
const STUB_DEPS = {
  getAnthropicModel: (_: string) => STUB_ANTHROPIC_MODEL,
  getGoogleModel: (_: string) => STUB_GOOGLE_MODEL,
  now: FIXED_NOW,
};

// ── Output builders ─────────────────────────────────────────────────────────

function buildPeOutput() {
  return {
    quantAddendum:
      "Boutique-luxury operator at scale 4 — widen marketing range for non-flag distribution.",
    marketAddendum:
      "Concept-fit flags should address F&B-forward positioning vs. comparable boutique-luxury operators.",
    rationale: "Standard boutique-luxury operator — modest addenda needed.",
  };
}

/**
 * Quant panel output. All ranges are decimal fractions matching the benchmark
 * bands. Pass `conviction` to drive convergence-vs-honest-fail behavior.
 */
function buildQuantOutput(conviction: "high" | "moderate" | "developing"): QuantPanelOutput {
  const bands: Record<RevenueDimensionKey, { low: number; mid: number; high: number }> = {
    marketingRate: { low: 0.04, mid: 0.06, high: 0.08 },
    fbRevenueShare: { low: 0.25, mid: 0.32, high: 0.40 },
    eventsRevenueShare: { low: 0.08, mid: 0.15, high: 0.22 },
    otherRevenueShare: { low: 0.01, mid: 0.03, high: 0.05 },
    cateringBoostPct: { low: 0.02, mid: 0.05, high: 0.10 },
  };
  return {
    dimensions: REVENUE_DIMENSION_KEYS.map((key) => ({
      key,
      ...bands[key],
      conviction,
      reasoning: `Quant panel: ${key} grounded in revenue comparable set.`,
      evidenceRefs: [0],
    })),
  };
}

function buildMarketOutput(): MarketPanelOutput {
  return {
    dimensions: REVENUE_DIMENSION_KEYS.map((key) => ({
      key,
      marketSentiment: "neutral" as const,
      conceptRiskFlags: [],
      proposedBias: "hold" as const,
      reasoning: `Market panel: ${key} — concept-fit sentiment neutral.`,
    })),
    overallMarketContext: "Concept-fit dynamics are stable for this operator profile.",
  };
}

/** Passes all 4 quality checks in validateSynthesisOutput. */
function buildValidSynthesisOutput(): RevenueSpecialistOutput {
  return {
    dimensions: [
      {
        key: "marketingRate",
        low: 0.05,
        mid: 0.07,
        high: 0.09,
        conviction: "high",
        reasoning:
          "Marketing rate 5–9% supported by boutique-luxury direct-booking comparable set.",
        evidenceRefs: [0, 1],
      },
      {
        key: "fbRevenueShare",
        low: 0.26,
        mid: 0.32,
        high: 0.38,
        conviction: "moderate",
        reasoning: "F&B share 26–38% consistent with boutique-luxury full-service comparables.",
        evidenceRefs: [0, 5],
      },
      {
        key: "eventsRevenueShare",
        low: 0.08,
        mid: 0.12,
        high: 0.18,
        conviction: "moderate",
        reasoning: "Events share 8–18% reflects mid-scale event-space comparables.",
        evidenceRefs: [5, 6],
      },
      {
        key: "otherRevenueShare",
        low: 0.02,
        mid: 0.04,
        high: 0.08,
        conviction: "moderate",
        reasoning: "Other ancillary share 2–8% reflects mid-scale spa/retail comparables.",
        evidenceRefs: [2, 3],
      },
      {
        key: "cateringBoostPct",
        low: 0.03,
        mid: 0.05,
        high: 0.08,
        conviction: "high",
        reasoning: "Catering boost 3–8% supported by comparable operator banquet capture.",
        evidenceRefs: [5, 11],
      },
    ],
    overallNarrative:
      "Ancillary mix appears appropriate for the property vertical and tier.",
  };
}

/**
 * Synthesis output where one dimension's range is BELOW the user's input,
 * driving severity to "advisory" so we can assert IB#3/#4/#6 in production.
 * CTX.inputs.marketingRate = 0.06; this synthesis drives marketingRate
 * range low=0.08 (above user value) → "advisory" with intent "below-range".
 * evidenceRefs [0, 1, 2, 3] covers ≥3 distinct comparable indices → IB#3 + IB#4.
 */
function buildSynthesisWithAdvisory(): RevenueSpecialistOutput {
  return {
    dimensions: [
      {
        key: "marketingRate",
        low: 0.08,
        mid: 0.10,
        high: 0.12,
        conviction: "high",
        reasoning:
          "Boutique-luxury independents in this comp set run marketing at 8–12% to defend non-flag direct-booking.",
        evidenceRefs: [0, 1, 2, 3],
      },
      {
        key: "fbRevenueShare",
        low: 0.26,
        mid: 0.32,
        high: 0.38,
        conviction: "high",
        reasoning: "F&B share 26–38% consistent with full-service boutique-luxury comparables.",
        evidenceRefs: [0],
      },
      {
        key: "eventsRevenueShare",
        low: 0.08,
        mid: 0.12,
        high: 0.18,
        conviction: "moderate",
        reasoning: "Events share 8–18% reflects mid-scale event-space comparables.",
        evidenceRefs: [5],
      },
      {
        key: "otherRevenueShare",
        low: 0.02,
        mid: 0.04,
        high: 0.08,
        conviction: "moderate",
        reasoning: "Other ancillary share 2–8% reflects mid-scale spa/retail comparables.",
        evidenceRefs: [2],
      },
      {
        key: "cateringBoostPct",
        low: 0.03,
        mid: 0.05,
        high: 0.08,
        conviction: "high",
        reasoning: "Catering boost 3–8% supported by comparable operator banquet capture.",
        evidenceRefs: [11],
      },
    ],
    overallNarrative:
      "Marketing rate is below the comparable boutique-luxury direct-booking spend; LP review expected.",
  };
}

/** Fails the collapsed-range check (low === high on first dimension). */
function buildCollapsedRangeSynthesisOutput(): RevenueSpecialistOutput {
  return {
    dimensions: [
      {
        key: "marketingRate",
        low: 0.06,
        mid: 0.06,
        high: 0.06,
        conviction: "high",
        reasoning: "Collapsed point estimate — not a range.",
        evidenceRefs: [0],
      },
      {
        key: "fbRevenueShare",
        low: 0.26,
        mid: 0.32,
        high: 0.38,
        conviction: "moderate",
        reasoning: "F&B share supported by comparables.",
        evidenceRefs: [0],
      },
      {
        key: "eventsRevenueShare",
        low: 0.08,
        mid: 0.12,
        high: 0.18,
        conviction: "moderate",
        reasoning: "Events share consistent.",
        evidenceRefs: [5],
      },
      {
        key: "otherRevenueShare",
        low: 0.02,
        mid: 0.04,
        high: 0.08,
        conviction: "moderate",
        reasoning: "Other ancillary share reflects comparables.",
        evidenceRefs: [2],
      },
      {
        key: "cateringBoostPct",
        low: 0.03,
        mid: 0.05,
        high: 0.08,
        conviction: "high",
        reasoning: "Catering boost supported by comparable operator banquet capture.",
        evidenceRefs: [11],
      },
    ],
    overallNarrative: "Invalid synthesis — collapsed range.",
  };
}

// ── Mock helpers ────────────────────────────────────────────────────────────

function mockGenerateObjectSequence(...responses: object[]): void {
  let idx = 0;
  vi.mocked(generateObject).mockImplementation(async () => {
    const resp = responses[idx++];
    return { object: resp, finishReason: "stop" } as never;
  });
}

function mockStreamObjectSequence(...outputs: RevenueSpecialistOutput[]): void {
  let idx = 0;
  vi.mocked(streamObject).mockImplementation(() => {
    const output = outputs[idx++];
    return {
      partialObjectStream: (async function* () {
        yield {};
      })(),
      object: Promise.resolve(output),
    } as never;
  });
}

function mockAllCalls(
  quantOutput: QuantPanelOutput,
  marketOutput: MarketPanelOutput,
  synthesisOutput: RevenueSpecialistOutput,
): void {
  mockGenerateObjectSequence(buildPeOutput(), quantOutput, marketOutput);
  mockStreamObjectSequence(synthesisOutput);
}

function mockAllCallsHonestFail(
  quantOutput: QuantPanelOutput,
  marketOutput: MarketPanelOutput,
): void {
  mockGenerateObjectSequence(buildPeOutput(), quantOutput, marketOutput);
}

// ────────────────────────────────────────────────────────────────────────────
// validateSynthesisOutput — unit tests

describe("validateSynthesisOutput (revenue)", () => {
  it("passes a valid synthesis output", () => {
    const result = validateSynthesisOutput(buildValidSynthesisOutput(), COMPARABLES);
    expect(result.pass).toBe(true);
  });

  it("fails when a dimension key is missing", () => {
    const output = buildValidSynthesisOutput();
    output.dimensions = output.dimensions.filter((d) => d.key !== "cateringBoostPct");
    const result = validateSynthesisOutput(output, COMPARABLES);
    expect(result.pass).toBe(false);
    expect(result.regressReason).toMatch(/cateringBoostPct/);
  });

  it("fails when evidenceRefs is empty", () => {
    const output = buildValidSynthesisOutput();
    output.dimensions[0].evidenceRefs = [];
    const result = validateSynthesisOutput(output, COMPARABLES);
    expect(result.pass).toBe(false);
    expect(result.regressReason).toMatch(/zero evidenceRefs/);
  });

  it("fails when all evidenceRefs are out-of-bounds", () => {
    const output = buildValidSynthesisOutput();
    output.dimensions[0].evidenceRefs = [999];
    const result = validateSynthesisOutput(output, COMPARABLES);
    expect(result.pass).toBe(false);
    expect(result.regressReason).toMatch(/out-of-bounds/);
  });

  it("fails when range is collapsed (low === high)", () => {
    const result = validateSynthesisOutput(buildCollapsedRangeSynthesisOutput(), COMPARABLES);
    expect(result.pass).toBe(false);
    expect(result.regressReason).toMatch(/collapsed range/);
  });

  it("fails when reasoning is too short (< 20 chars)", () => {
    const output = buildValidSynthesisOutput();
    output.dimensions[0].reasoning = "Too short.";
    const result = validateSynthesisOutput(output, COMPARABLES);
    expect(result.pass).toBe(false);
    expect(result.regressReason).toMatch(/reasoning is too short/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runRevenueSpecialist G2 — Prompt Engineer pre-stage + happy path

describe("runRevenueSpecialist G2 — Prompt Engineer pre-stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls generateObject 3 times (PE + quant + market) on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(streamObject)).toHaveBeenCalledTimes(1);
  });

  it("happy path: meta.promptEngineerRunId is set with revenue-g2 prefix", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
    expect(verdict.meta.promptEngineerRunId).toMatch(/^pe-revenue-g2-/);
  });

  it("happy path: meta.regressCount === 0", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBe(0);
  });

  it("happy path: cognitiveRunId uses revenue-g2 prefix", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.cognitiveRunId).toMatch(/^revenue-g2-/);
    expect(verdict.meta.cognitiveRunId).not.toMatch(/^revenue-g2-hf-/);
  });

  it("PE failure throws Tier1UnavailableError without calling panels or synthesis", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("Gemini Flash quota exceeded"));

    await expect(
      runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
  });

  it("PE failure error message mentions prompt engineer", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("rate limited"));

    const err = await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(Tier1UnavailableError);
    expect(err.message).toMatch(/prompt engineer/i);
  });

  it("convergence-fail (all-developing quant): streamObject never called, regressCount=0", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
    expect(verdict.meta.regressCount).toBe(0);
    expect(verdict.meta.promptEngineerRunId).toMatch(/^pe-revenue-g2-/);
    expect(verdict.meta.cognitiveRunId).toMatch(/^revenue-g2-hf-/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runRevenueSpecialist G2 — quality checker + bounded regress loop

describe("runRevenueSpecialist G2 — quality checker + bounded regress loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("first-pass success: 3 generateObject + 1 streamObject calls", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(streamObject)).toHaveBeenCalledTimes(1);
  });

  it("one regress: 6 generateObject + 2 streamObject calls", async () => {
    mockGenerateObjectSequence(
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(),
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(),
    );
    mockStreamObjectSequence(
      buildCollapsedRangeSynthesisOutput(),
      buildValidSynthesisOutput(),
    );

    await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(6);
    expect(vi.mocked(streamObject)).toHaveBeenCalledTimes(2);
  });

  it("one regress: meta.regressCount === 1", async () => {
    mockGenerateObjectSequence(
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(),
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(),
    );
    mockStreamObjectSequence(
      buildCollapsedRangeSynthesisOutput(),
      buildValidSynthesisOutput(),
    );

    const verdict = await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBe(1);
  });

  it("two regresses exhausted: 9 generateObject + 3 streamObject calls", async () => {
    mockGenerateObjectSequence(
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(),
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(),
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(),
    );
    mockStreamObjectSequence(
      buildCollapsedRangeSynthesisOutput(),
      buildCollapsedRangeSynthesisOutput(),
      buildCollapsedRangeSynthesisOutput(),
    );

    await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(9);
    expect(vi.mocked(streamObject)).toHaveBeenCalledTimes(3);
  });

  it("two regresses exhausted: honest-fail verdict has ok/null dimensions and regressCount === 2", async () => {
    mockGenerateObjectSequence(
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(),
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(),
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(),
    );
    mockStreamObjectSequence(
      buildCollapsedRangeSynthesisOutput(),
      buildCollapsedRangeSynthesisOutput(),
      buildCollapsedRangeSynthesisOutput(),
    );

    const verdict = await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBe(2);
    for (const dim of verdict.dimensions) {
      expect(dim.severity).toBe("ok");
      expect(dim.range).toBeNull();
    }
  });

  it("regress PE failure → Tier1UnavailableError", async () => {
    let callCount = 0;
    vi.mocked(generateObject).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return { object: buildPeOutput(), finishReason: "stop" } as never;
      if (callCount === 2) return { object: buildQuantOutput("high"), finishReason: "stop" } as never;
      if (callCount === 3) return { object: buildMarketOutput(), finishReason: "stop" } as never;
      throw new Error("Gemini Flash regress quota exceeded");
    });
    mockStreamObjectSequence(buildCollapsedRangeSynthesisOutput());

    await expect(
      runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runRevenueSpecialist G2 — Intelligence Bar invariants (production runner)
//
// Covers IB#1 (cognitiveRunId), IB#3 (≥3 evidence per non-ok), IB#4 (tabular
// comp evidence), IB#6 (range on non-ok numeric), IB#7 (vendor breadth ≥2),
// IB#8 (promptEngineerRunId), IB#9 (regressCount tracked).
// IB#2 and IB#5 are confirmed at PR-review time (not statically assertable).

describe("runRevenueSpecialist G2 — Intelligence Bar invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("IB#1: meta.cognitiveRunId is non-null on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.cognitiveRunId).toBeTruthy();
  });

  it("IB#7: meta.vendorsUsed contains ≥ 2 distinct vendors on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.vendorsUsed).toBeDefined();
    expect(verdict.meta.vendorsUsed!.length).toBeGreaterThanOrEqual(2);
  });

  it("IB#7: honest-fail path still sets vendorsUsed ≥ 2", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.vendorsUsed).toBeDefined();
    expect(verdict.meta.vendorsUsed!.length).toBeGreaterThanOrEqual(2);
  });

  it("IB#6 + IB#3 + IB#4: advisory dimension carries range, ≥3 evidence, and ≥1 Rev comp entry", async () => {
    // CTX.inputs.marketingRate=0.06, synthesis range low=0.08 → below range → advisory
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildSynthesisWithAdvisory());

    const verdict = await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS);

    const advisoryDim = verdict.dimensions.find((d) => d.severity === "advisory");
    expect(advisoryDim).toBeDefined();

    // IB#6 — non-ok numeric dimension carries a non-null range
    expect(advisoryDim!.range).not.toBeNull();

    // IB#3 — ≥3 evidence entries per non-ok dimension
    expect(advisoryDim!.evidence.length).toBeGreaterThanOrEqual(3);

    // IB#4 — tabular Rev comp evidence present (source prefixed "Rev comp:")
    const revCompEvidence = advisoryDim!.evidence.filter((e) => e.source.startsWith("Rev comp:"));
    expect(revCompEvidence.length).toBeGreaterThanOrEqual(1);
  });

  it("IB#8: meta.promptEngineerRunId is set on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
  });

  it("IB#9: meta.regressCount is tracked (=0 on first-pass success)", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runRevenueSpecialist(CTX, DEFAULT_REVENUE_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBeDefined();
    expect(verdict.meta.regressCount).toBe(0);
  });
});
