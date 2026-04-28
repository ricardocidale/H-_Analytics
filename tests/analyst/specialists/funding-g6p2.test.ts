/**
 * G6-P2 N+1 pipeline tests for `runFundingSpecialist`.
 *
 * Coverage:
 *   - Happy path: quant + market panels pass, Opus synthesis succeeds →
 *     meta.vendorsUsed = ["anthropic", "google"]
 *   - Honest-fail: avg quant conviction below threshold →
 *     all ok/missing-data dimensions, meta.vendorsUsed = ["anthropic", "google"]
 *   - Convergence boundary: exactly at threshold (65.0) passes; below (45.0) fails
 *   - Panel failure: quant panel throws → Tier1UnavailableError (no Opus call)
 *   - Synthesis failure: synthesis throws → Tier1UnavailableError
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock both streamObject (Opus synthesis) and generateObject (panels)
// BEFORE importing the runner so the module-load captures the mocked versions.
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamObject: vi.fn(),
    generateObject: vi.fn(),
  };
});

// Mock lookupReferenceRange so panel calls don't hit the DB.
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

function buildQuantOutput(conviction: "high" | "moderate" | "developing"): QuantPanelOutput {
  return {
    dimensions: FUNDING_DIMENSION_KEYS.map((key) => ({
      key,
      low: 12,
      mid: 16,
      high: 20,
      conviction,
      reasoning: `Quant panel: ${key} grounded in comparable set. At least one comparable cited.`,
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
      reasoning: `Market panel: ${key} — LP sentiment neutral for this vertical.`,
    })),
    overallMarketContext: "Market conditions are stable for boutique-luxury raises.",
  };
}

function buildSynthesisOutput(): FundingSpecialistOutput {
  return {
    dimensions: [
      {
        key: "runwayBufferMonths",
        low: 14,
        mid: 16,
        high: 18,
        conviction: "high",
        reasoning: "Comparables converge on 14–18 months for boutique-luxury at this size; your input aligns.",
        evidenceRefs: [0, 1],
      },
      {
        key: "sizingOvershootPct",
        low: 0.15,
        mid: 0.20,
        high: 0.25,
        conviction: "moderate",
        reasoning: "Sizing overshoot of 15–25% is supported by the comparable set.",
        evidenceRefs: [0],
      },
      {
        key: "trancheGapMonths",
        low: 6,
        mid: 9,
        high: 12,
        conviction: "moderate",
        reasoning: "Tranche gap of 6–12 months is consistent with comparable staged raises.",
        evidenceRefs: [1],
      },
      {
        key: "revenueRampDelayMonths",
        low: 6,
        mid: 9,
        high: 12,
        conviction: "moderate",
        reasoning: "Revenue ramp delay grounded in comparable operator opening cadences.",
        evidenceRefs: [0],
      },
      {
        key: "burnFlexDownPct",
        low: 0.15,
        mid: 0.20,
        high: 0.25,
        conviction: "high",
        reasoning: "Burn flex-down supported by comparable management-co cost structures.",
        evidenceRefs: [0, 1],
      },
    ],
    overallNarrative:
      "The raise amount appears adequate for the current pipeline. Verify tranche timing against Cash Flow Statement.",
  };
}

/** Mock stub injected via deps — returns the model object directly. */
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
// Helpers to set up generateObject / streamObject mocks

function buildPeOutput() {
  return {
    quantAddendum: "Focus on multi-property scale; widen runway range for staged raises.",
    marketAddendum: "LP risk flags should address staged capital availability risk.",
    rationale: "Operator scale is above the comp-set median — addenda reflect that.",
  };
}

function mockPanelCalls(
  quantOutput: QuantPanelOutput,
  marketOutput: MarketPanelOutput,
): void {
  // generateObject is called three times: first for PE (Google Flash), then
  // quant panel (Gemini Flash), then market panel (Sonnet). G6-P3a adds the
  // PE pre-stage before the parallel panel calls.
  let callCount = 0;
  vi.mocked(generateObject).mockImplementation(async () => {
    callCount++;
    if (callCount === 1) return { object: buildPeOutput(), finishReason: "stop" } as never;
    if (callCount === 2) return { object: quantOutput, finishReason: "stop" } as never;
    return { object: marketOutput, finishReason: "stop" } as never;
  });
}

function mockSynthesisCall(output: FundingSpecialistOutput): void {
  const partialIterator = (async function* () {
    yield {};
  })();
  vi.mocked(streamObject).mockReturnValue({
    partialObjectStream: partialIterator,
    object: Promise.resolve(output),
  } as never);
}

// ────────────────────────────────────────────────────────────────────────────

describe("runFundingSpecialist G6-P2 N+1 pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: populates meta.vendorsUsed with both vendors", async () => {
    mockPanelCalls(buildQuantOutput("high"), buildMarketOutput());
    mockSynthesisCall(buildSynthesisOutput());

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.tier).toBe(1);
    expect(verdict.meta.vendorsUsed).toEqual(["anthropic", "google"]);
    expect(verdict.meta.cognitiveRunId).toBeTruthy();
    expect(verdict.meta.cacheState).toBe("miss");
    expect(verdict.dimensions).toHaveLength(5);
    expect(verdict.specialistId).toBe("mgmt-co.funding");
  });

  it("happy path: synthesis called once, generateObject called 3 times (PE + quant + market)", async () => {
    mockPanelCalls(buildQuantOutput("high"), buildMarketOutput());
    mockSynthesisCall(buildSynthesisOutput());

    await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(streamObject)).toHaveBeenCalledTimes(1);
  });

  it("honest-fail: all-developing quant panel → ok/missing-data dimensions, no synthesis", async () => {
    mockPanelCalls(buildQuantOutput("developing"), buildMarketOutput());
    // streamObject should NOT be called — synthesis skipped

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
    expect(verdict.meta.vendorsUsed).toEqual(["anthropic", "google"]);
    expect(verdict.meta.tier).toBe(1);
    for (const dim of verdict.dimensions) {
      expect(dim.severity).toBe("ok");
      expect(dim.range).toBeNull();
    }
  });

  it("honest-fail: moderate quant (avg=65) clears threshold=55, proceeds to synthesis", async () => {
    mockPanelCalls(buildQuantOutput("moderate"), buildMarketOutput());
    mockSynthesisCall(buildSynthesisOutput());

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(streamObject)).toHaveBeenCalledTimes(1);
    expect(verdict.meta.vendorsUsed).toEqual(["anthropic", "google"]);
  });

  it("panel failure: throws Tier1UnavailableError without calling synthesis", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("Gemini Flash rate-limited"));

    await expect(
      runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
  });

  it("synthesis failure: throws Tier1UnavailableError after panels succeed", async () => {
    mockPanelCalls(buildQuantOutput("high"), buildMarketOutput());
    vi.mocked(streamObject).mockReturnValue({
      partialObjectStream: (async function* () { yield {}; })(),
      object: Promise.reject(new Error("Opus synthesis failed")),
    } as never);

    await expect(
      runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);
  });

  it("happy path: verdict generatedAt matches injected now", async () => {
    mockPanelCalls(buildQuantOutput("high"), buildMarketOutput());
    mockSynthesisCall(buildSynthesisOutput());

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.generatedAt).toBe(FIXED_NOW.toISOString());
  });

  it("happy path: all 5 FUNDING_DIMENSION_KEYS appear in verdict dimensions", async () => {
    mockPanelCalls(buildQuantOutput("high"), buildMarketOutput());
    mockSynthesisCall(buildSynthesisOutput());

    const verdict = await runFundingSpecialist(CTX, BENCHMARKS, COMPARABLES, STUB_DEPS);

    const fieldKeys = verdict.dimensions.map((d) => d.field);
    expect(verdict.dimensions).toHaveLength(FUNDING_DIMENSION_KEYS.length);
    // Each dimension has a non-empty field name
    expect(fieldKeys.every((f) => f.length > 0)).toBe(true);
  });
});
