/**
 * G6-P3a tests for `runFundingSpecialist` — Prompt Engineer pre-stage.
 *
 * Coverage:
 *   - PE always runs: generateObject called 3 times (PE + quant + market)
 *   - meta.promptEngineerRunId is set and non-empty on happy path
 *   - meta.regressCount === 0 on happy path
 *   - meta.promptEngineerRunId is set on honest-fail path (PE ran before convergence check)
 *   - PE failure throws Tier1UnavailableError without calling panels or synthesis
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

// ── Stub output builders ──────────────────────────────────────────────────────

function buildPeOutput() {
  return {
    quantAddendum: "Focus on boutique-luxury comp-set for this $20M raise; widen runway range.",
    marketAddendum: "LP risk flags should address bridge financing and staged tranche risk.",
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

function buildSynthesisOutput(): FundingSpecialistOutput {
  return {
    dimensions: [
      { key: "runwayBufferMonths", low: 14, mid: 16, high: 18, conviction: "high", reasoning: "Runway buffer in range.", evidenceRefs: [0, 1] },
      { key: "sizingOvershootPct", low: 0.15, mid: 0.20, high: 0.25, conviction: "moderate", reasoning: "Overshoot is within range.", evidenceRefs: [0] },
      { key: "trancheGapMonths", low: 6, mid: 9, high: 12, conviction: "moderate", reasoning: "Tranche gap consistent.", evidenceRefs: [1] },
      { key: "revenueRampDelayMonths", low: 6, mid: 9, high: 12, conviction: "moderate", reasoning: "Revenue ramp grounded.", evidenceRefs: [0] },
      { key: "burnFlexDownPct", low: 0.15, mid: 0.20, high: 0.25, conviction: "high", reasoning: "Burn flex supported.", evidenceRefs: [0, 1] },
    ],
    overallNarrative: "Raise appears adequate for current pipeline.",
  };
}

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

// ────────────────────────────────────────────────────────────────────────────
// Mock setup helpers

function mockAllCalls(
  quantOutput: QuantPanelOutput,
  marketOutput: MarketPanelOutput,
  synthesisOutput: FundingSpecialistOutput,
): void {
  let callCount = 0;
  vi.mocked(generateObject).mockImplementation(async () => {
    callCount++;
    if (callCount === 1) return { object: buildPeOutput(), finishReason: "stop" } as never;
    if (callCount === 2) return { object: quantOutput, finishReason: "stop" } as never;
    return { object: marketOutput, finishReason: "stop" } as never;
  });
  vi.mocked(streamObject).mockReturnValue({
    partialObjectStream: (async function* () { yield {}; })(),
    object: Promise.resolve(synthesisOutput),
  } as never);
}

function mockAllCallsHonestFail(
  quantOutput: QuantPanelOutput,
  marketOutput: MarketPanelOutput,
): void {
  let callCount = 0;
  vi.mocked(generateObject).mockImplementation(async () => {
    callCount++;
    if (callCount === 1) return { object: buildPeOutput(), finishReason: "stop" } as never;
    if (callCount === 2) return { object: quantOutput, finishReason: "stop" } as never;
    return { object: marketOutput, finishReason: "stop" } as never;
  });
}

// ────────────────────────────────────────────────────────────────────────────

describe("runFundingSpecialist G6-P3a — Prompt Engineer pre-stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls generateObject 3 times (PE + quant + market) on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildSynthesisOutput());

    await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(streamObject)).toHaveBeenCalledTimes(1);
  });

  it("happy path: meta.promptEngineerRunId is set and non-empty", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildSynthesisOutput());

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
    expect(verdict.meta.promptEngineerRunId).toMatch(/^pe-funding-g6p3a-/);
  });

  it("happy path: meta.regressCount === 0 (no regress loop in G6-P3a)", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildSynthesisOutput());

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBe(0);
  });

  it("honest-fail: meta.promptEngineerRunId is set even when panels converge below threshold", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
    expect(verdict.meta.promptEngineerRunId).toMatch(/^pe-funding-g6p3a-/);
  });

  it("honest-fail: meta.regressCount === 0 on honest-fail path", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBe(0);
  });

  it("PE failure throws Tier1UnavailableError without calling panels or synthesis", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("Gemini Flash quota exceeded"));

    await expect(
      runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);

    // generateObject threw on call 1 (PE), so panels were never called
    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
  });

  it("PE failure error message mentions prompt engineer", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("rate limited"));

    const err = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS).catch((e) => e);

    expect(err).toBeInstanceOf(Tier1UnavailableError);
    expect(err.message).toMatch(/prompt engineer/i);
  });

  it("cognitiveRunId uses g6p3a prefix on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildSynthesisOutput());

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.cognitiveRunId).toMatch(/^funding-g6p3a-/);
  });

  it("cognitiveRunId uses g6p3a-hf prefix on honest-fail path", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.cognitiveRunId).toMatch(/^funding-g6p3a-hf-/);
  });
});
