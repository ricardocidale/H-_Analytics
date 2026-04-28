/**
 * G6-P3b tests for `runFundingSpecialist` — quality checker + bounded regress loop.
 *
 * Coverage:
 *   - First-pass success: regressCount === 0, 3 generateObject + 1 streamObject
 *   - One regress: regressCount === 1, 6 generateObject + 2 streamObject
 *   - Two regresses exhausted → honest-fail: regressCount === 2, 9 generateObject + 3 streamObject
 *   - Regress PE/panel phase failure → Tier1UnavailableError
 *   - Synthesis failure mid-regress → Tier1UnavailableError
 *   - validateSynthesisOutput unit: collapsed range, zero refs, missing key, short reasoning
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
  runFundingSpecialist,
  Tier1UnavailableError,
} from "../../../server/ai/specialists/mgmt-co-funding-runner";
import type { FundingSpecialistOutput } from "../../../server/ai/specialists/mgmt-co-funding-output-schema";
import type { QuantPanelOutput } from "../../../server/ai/specialists/mgmt-co-funding-quant-panel-schema";
import type { MarketPanelOutput } from "../../../server/ai/specialists/mgmt-co-funding-market-panel-schema";
import type { FundingPromptInputContext } from "../../../server/ai/specialists/mgmt-co-funding-prompt-input-builder";
import { getCannedLpComparables } from "../../../server/ai/specialists/mgmt-co-funding-orchestrator-adapter";
import { validateSynthesisOutput } from "../../../server/ai/specialists/mgmt-co-funding-synthesis-validator";
import type { AnalystWatchdogBenchmarks } from "@shared/schema";
import { FUNDING_DIMENSION_KEYS } from "../../../server/ai/specialists/mgmt-co-funding-prompt-input-builder";

// ────────────────────────────────────────────────────────────────────────────
// Fixtures

const FIXED_NOW = new Date("2026-04-28T12:00:00Z");

const BENCHMARKS: AnalystWatchdogBenchmarks = {
  id: 1,
  userId: 1,
  runwayBufferMonthsLow: 12,
  runwayBufferMonthsMid: 16,
  runwayBufferMonthsHigh: 20,
  sizingOvershootPctLow: 0.10,
  sizingOvershootPctMid: 0.20,
  sizingOvershootPctHigh: 0.30,
  trancheGapMonthsLow: 6,
  trancheGapMonthsMid: 9,
  trancheGapMonthsHigh: 12,
  revenueRampDelayMonthsLow: 6,
  revenueRampDelayMonthsMid: 9,
  revenueRampDelayMonthsHigh: 12,
  burnFlexDownPctLow: 0.10,
  burnFlexDownPctMid: 0.20,
  burnFlexDownPctHigh: 0.30,
  lastRefreshedAt: new Date("2026-04-01T00:00:00Z"),
  refreshedBy: "test-fixture",
  sourceCount: 3,
  tokensUsed: 1234,
  nPlusOneEvidence: null,
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
};

const COMPARABLES = getCannedLpComparables();

const CTX: FundingPromptInputContext = {
  inputs: {
    runwayBufferMonths: 16,
    sizingOvershootPct: 0.20,
    trancheGapMonths: 9,
    revenueRampDelayMonths: 9,
    burnFlexDownPct: 0.20,
  },
  portfolio: { propertyCount: 4, totalRaiseNeedUsd: 20_000_000, runwayNeedMonths: 18 },
  persona: { verticalSlug: "boutique-luxury", marketTier: "L+B", locale: "US" },
  priorVerdicts: [],
};

// ── Stub model instances ──────────────────────────────────────────────────────

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

// ── Output builders ───────────────────────────────────────────────────────────

function buildPeOutput() {
  return {
    quantAddendum: "Focus on boutique-luxury comp-set; widen runway range for staged raises.",
    marketAddendum: "LP risk flags should address staged capital availability risk.",
    rationale: "Standard boutique-luxury operator — modest addenda needed.",
  };
}

function buildQuantOutput(conviction: "high" | "moderate" | "developing"): QuantPanelOutput {
  return {
    dimensions: FUNDING_DIMENSION_KEYS.map((key) => ({
      key,
      low: 12,
      mid: 16,
      high: 20,
      conviction,
      reasoning: `Quant panel: ${key} grounded in comparable set.`,
      evidenceRefs: [0],
    })),
  };
}

function buildMarketOutput(): MarketPanelOutput {
  return {
    dimensions: FUNDING_DIMENSION_KEYS.map((key) => ({
      key,
      marketSentiment: "neutral" as const,
      lpRiskFlags: [],
      proposedBias: "hold" as const,
      reasoning: `Market panel: ${key} — LP sentiment neutral.`,
    })),
    overallMarketContext: "Market conditions are stable.",
  };
}

/** Passes all 4 quality checks. */
function buildValidSynthesisOutput(): FundingSpecialistOutput {
  return {
    dimensions: [
      { key: "runwayBufferMonths", low: 14, mid: 16, high: 18, conviction: "high",
        reasoning: "Comparables converge on 14–18 months for boutique-luxury raises.", evidenceRefs: [0, 1] },
      { key: "sizingOvershootPct", low: 0.15, mid: 0.20, high: 0.25, conviction: "moderate",
        reasoning: "Sizing overshoot of 15–25% supported by comparable set.", evidenceRefs: [0] },
      { key: "trancheGapMonths", low: 6, mid: 9, high: 12, conviction: "moderate",
        reasoning: "Tranche gap consistent with comparable staged raises.", evidenceRefs: [1] },
      { key: "revenueRampDelayMonths", low: 6, mid: 9, high: 12, conviction: "moderate",
        reasoning: "Revenue ramp grounded in comparable operator opening cadences.", evidenceRefs: [0] },
      { key: "burnFlexDownPct", low: 0.15, mid: 0.20, high: 0.25, conviction: "high",
        reasoning: "Burn flex-down supported by comparable management-co structures.", evidenceRefs: [0, 1] },
    ],
    overallNarrative: "Raise appears adequate for the current pipeline.",
  };
}

/** Fails the collapsed-range check (low === high on first dimension). */
function buildCollapsedRangeSynthesisOutput(): FundingSpecialistOutput {
  return {
    dimensions: [
      { key: "runwayBufferMonths", low: 16, mid: 16, high: 16, conviction: "high",
        reasoning: "Collapsed point estimate — not a range.", evidenceRefs: [0] },
      { key: "sizingOvershootPct", low: 0.15, mid: 0.20, high: 0.25, conviction: "moderate",
        reasoning: "Sizing overshoot supported by comparables.", evidenceRefs: [0] },
      { key: "trancheGapMonths", low: 6, mid: 9, high: 12, conviction: "moderate",
        reasoning: "Tranche gap consistent.", evidenceRefs: [1] },
      { key: "revenueRampDelayMonths", low: 6, mid: 9, high: 12, conviction: "moderate",
        reasoning: "Revenue ramp grounded in openings.", evidenceRefs: [0] },
      { key: "burnFlexDownPct", low: 0.15, mid: 0.20, high: 0.25, conviction: "high",
        reasoning: "Burn flex supported by management-co structures.", evidenceRefs: [0, 1] },
    ],
    overallNarrative: "Invalid synthesis — collapsed range.",
  };
}

// ── Mock helpers ──────────────────────────────────────────────────────────────

/**
 * Sets up generateObject to return `responses` in order.
 * Ordering for N attempts: [pe0, quant0, market0, pe1, quant1, market1, ...]
 */
function mockGenerateObjectSequence(...responses: object[]): void {
  let idx = 0;
  vi.mocked(generateObject).mockImplementation(async () => {
    const resp = responses[idx++];
    return { object: resp, finishReason: "stop" } as never;
  });
}

/**
 * Sets up streamObject to return `outputs` in order across synthesis attempts.
 */
function mockStreamObjectSequence(...outputs: FundingSpecialistOutput[]): void {
  let idx = 0;
  vi.mocked(streamObject).mockImplementation(() => {
    const output = outputs[idx++];
    return {
      partialObjectStream: (async function* () { yield {}; })(),
      object: Promise.resolve(output),
    } as never;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// validateSynthesisOutput — unit tests

describe("validateSynthesisOutput", () => {
  it("passes a valid synthesis output", () => {
    const result = validateSynthesisOutput(buildValidSynthesisOutput(), COMPARABLES);
    expect(result.pass).toBe(true);
  });

  it("fails when a dimension key is missing", () => {
    const output = buildValidSynthesisOutput();
    output.dimensions = output.dimensions.filter((d) => d.key !== "burnFlexDownPct");
    const result = validateSynthesisOutput(output, COMPARABLES);
    expect(result.pass).toBe(false);
    expect(result.regressReason).toMatch(/burnFlexDownPct/);
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
// runFundingSpecialist G6-P3b — regress loop

describe("runFundingSpecialist G6-P3b — quality checker + bounded regress loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── First-pass success ────────────────────────────────────────────────────

  it("first-pass success: 3 generateObject + 1 streamObject calls", async () => {
    mockGenerateObjectSequence(
      buildPeOutput(),          // PE
      buildQuantOutput("high"), // quant panel
      buildMarketOutput(),      // market panel
    );
    mockStreamObjectSequence(buildValidSynthesisOutput());

    await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(streamObject)).toHaveBeenCalledTimes(1);
  });

  it("first-pass success: meta.regressCount === 0", async () => {
    mockGenerateObjectSequence(buildPeOutput(), buildQuantOutput("high"), buildMarketOutput());
    mockStreamObjectSequence(buildValidSynthesisOutput());

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBe(0);
  });

  it("first-pass success: meta.promptEngineerRunId still set", async () => {
    mockGenerateObjectSequence(buildPeOutput(), buildQuantOutput("high"), buildMarketOutput());
    mockStreamObjectSequence(buildValidSynthesisOutput());

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
  });

  // ── One regress ───────────────────────────────────────────────────────────

  it("one regress: 6 generateObject + 2 streamObject calls", async () => {
    mockGenerateObjectSequence(
      buildPeOutput(),          // attempt 0: PE
      buildQuantOutput("high"), // attempt 0: quant
      buildMarketOutput(),      // attempt 0: market
      buildPeOutput(),          // regress 1: PE
      buildQuantOutput("high"), // regress 1: quant
      buildMarketOutput(),      // regress 1: market
    );
    mockStreamObjectSequence(
      buildCollapsedRangeSynthesisOutput(), // attempt 0: fail quality
      buildValidSynthesisOutput(),          // attempt 1: pass quality
    );

    await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBe(1);
  });

  it("one regress: verdict dimensions are populated (synthesis passed after regress)", async () => {
    mockGenerateObjectSequence(
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(),
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(),
    );
    mockStreamObjectSequence(
      buildCollapsedRangeSynthesisOutput(),
      buildValidSynthesisOutput(),
    );

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.dimensions).toHaveLength(FUNDING_DIMENSION_KEYS.length);
    expect(verdict.meta.tier).toBe(1);
  });

  // ── Two regresses exhausted → honest-fail ────────────────────────────────

  it("two regresses exhausted: 9 generateObject + 3 streamObject calls", async () => {
    mockGenerateObjectSequence(
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(), // attempt 0
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(), // regress 1
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(), // regress 2
    );
    mockStreamObjectSequence(
      buildCollapsedRangeSynthesisOutput(), // attempt 0: fail
      buildCollapsedRangeSynthesisOutput(), // attempt 1: fail
      buildCollapsedRangeSynthesisOutput(), // attempt 2: fail → honest-fail
    );

    await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(9);
    expect(vi.mocked(streamObject)).toHaveBeenCalledTimes(3);
  });

  it("two regresses exhausted: meta.regressCount === 2 in honest-fail verdict", async () => {
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

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBe(2);
  });

  it("two regresses exhausted: honest-fail verdict has ok/null dimensions", async () => {
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

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    for (const dim of verdict.dimensions) {
      expect(dim.severity).toBe("ok");
      expect(dim.range).toBeNull();
    }
  });

  it("two regresses exhausted: meta.promptEngineerRunId still present", async () => {
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

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
  });

  // ── Failure paths during regress ──────────────────────────────────────────

  it("regress PE failure → Tier1UnavailableError", async () => {
    // Initial attempt succeeds generateObject calls, synthesis fails quality
    // Then regress PE call throws
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
      runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);
  });

  it("synthesis throws on regress attempt → Tier1UnavailableError", async () => {
    // First synthesis fails quality; second synthesis throws
    mockGenerateObjectSequence(
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(),
      buildPeOutput(), buildQuantOutput("high"), buildMarketOutput(),
    );

    let synthCount = 0;
    vi.mocked(streamObject).mockImplementation(() => {
      synthCount++;
      if (synthCount === 1) {
        return {
          partialObjectStream: (async function* () { yield {}; })(),
          object: Promise.resolve(buildCollapsedRangeSynthesisOutput()),
        } as never;
      }
      return {
        partialObjectStream: (async function* () { yield {}; })(),
        object: Promise.reject(new Error("Opus synthesis error on regress")),
      } as never;
    });

    await expect(
      runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);
  });

  // ── Convergence-fail path stays single-pass (regressCount=0) ─────────────

  it("convergence-fail (all-developing quant): streamObject never called, regressCount=0", async () => {
    mockGenerateObjectSequence(
      buildPeOutput(),
      buildQuantOutput("developing"),
      buildMarketOutput(),
    );

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
    expect(verdict.meta.regressCount).toBe(0);
    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
  });
});
