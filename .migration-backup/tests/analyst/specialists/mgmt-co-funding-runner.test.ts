/**
 * Unit tests for `runFundingSpecialist` (G6-P2 N+1 pipeline).
 *
 * Coverage:
 *   - Happy path: quant + market panels pass, Opus synthesis succeeds →
 *     AnalystVerdict shape, meta.vendorsUsed = ["anthropic", "google"]
 *   - Three personas: large-managementco / startup-boutique / expansion-stage
 *   - Schema rejection: synthesis returns non-conforming object → Tier1UnavailableError
 *   - LLM error: panel throws → Tier1UnavailableError (no synthesis called)
 *   - Conviction range: qualityScore aligns with conviction enum
 *   - Severity derivation: in-range → ok, outside-range → advisory, missing → ok
 *   - Vendor breadth: meta.vendorsUsed === ["anthropic", "google"] in G6-P2
 *   - Cache state: meta.cacheState === "miss" in G6-P2
 *
 * Both `streamObject` (Opus synthesis) and `generateObject` (panels) are
 * mocked at the module level.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock both AI SDK call sites BEFORE importing the runner.
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
import { FUNDING_DIMENSION_KEYS } from "../../../server/ai/specialists/mgmt-co-funding-prompt-input-builder";
import { getCannedLpComparables } from "../../../server/ai/specialists/mgmt-co-funding-orchestrator-adapter";
import type { AnalystWatchdogBenchmarks } from "@shared/schema";

// ────────────────────────────────────────────────────────────────────────────
// Fixtures

const FIXED_NOW = new Date("2026-04-27T12:00:00Z");

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

const PERSONA_LARGE_MANAGEMENTCO: FundingPromptInputContext["persona"] = {
  verticalSlug: "boutique-luxury",
  marketTier: "L+B",
  locale: "US",
};
const PERSONA_STARTUP_BOUTIQUE: FundingPromptInputContext["persona"] = {
  verticalSlug: "wellness",
  marketTier: "lifestyle",
  locale: "US",
};
const PERSONA_EXPANSION: FundingPromptInputContext["persona"] = {
  verticalSlug: "lifestyle-luxury",
  marketTier: "luxury",
  locale: "US",
};

const CTX_LARGE: FundingPromptInputContext = {
  inputs: {
    runwayBufferMonths: 16, // in-range
    sizingOvershootPct: 0.20, // in-range
    trancheGapMonths: 9, // in-range
    revenueRampDelayMonths: 9, // in-range
    burnFlexDownPct: 0.20, // in-range
  },
  portfolio: { propertyCount: 8, totalRaiseNeedUsd: 80_000_000, runwayNeedMonths: 18 },
  persona: PERSONA_LARGE_MANAGEMENTCO,
  priorVerdicts: [],
};

const CTX_STARTUP: FundingPromptInputContext = {
  inputs: {
    runwayBufferMonths: 6, // BELOW range — advisory expected
    sizingOvershootPct: 0.05, // BELOW range
    trancheGapMonths: null, // missing
    revenueRampDelayMonths: 9,
    burnFlexDownPct: 0.20,
  },
  portfolio: { propertyCount: 2, totalRaiseNeedUsd: 5_000_000, runwayNeedMonths: 12 },
  persona: PERSONA_STARTUP_BOUTIQUE,
  priorVerdicts: [],
};

const CTX_EXPANSION: FundingPromptInputContext = {
  inputs: {
    runwayBufferMonths: 25, // ABOVE range
    sizingOvershootPct: 0.20,
    trancheGapMonths: 9,
    revenueRampDelayMonths: 9,
    burnFlexDownPct: 0.20,
  },
  portfolio: { propertyCount: 4, totalRaiseNeedUsd: 30_000_000, runwayNeedMonths: 15 },
  persona: PERSONA_EXPANSION,
  priorVerdicts: [],
};

// ── Output builders ───────────────────────────────────────────────────────────

function buildValidSynthesisOutput(): FundingSpecialistOutput {
  return {
    dimensions: [
      {
        key: "runwayBufferMonths",
        low: 14,
        mid: 16,
        high: 18,
        conviction: "high",
        reasoning: "Comparables converge on 14–18 month buffers for boutique-luxury raises at this size; your input sits in the band.",
        evidenceRefs: [0, 1],
      },
      {
        key: "sizingOvershootPct",
        low: 0.15,
        mid: 0.20,
        high: 0.25,
        conviction: "moderate",
        reasoning: "Sizing overshoot of 15–25% is typical for staged hospitality raises; the user's number is in the band.",
        evidenceRefs: [0],
      },
      {
        key: "trancheGapMonths",
        low: 6,
        mid: 9,
        high: 12,
        conviction: "moderate",
        reasoning: "Tranche gap of 6–12 months is supported by the comparable set; the user's saved number aligns.",
        evidenceRefs: [1],
      },
      {
        key: "revenueRampDelayMonths",
        low: 6,
        mid: 9,
        high: 12,
        conviction: "developing",
        reasoning: "Ramp delay is sensitive to property pipeline cadence; comparables provide weak signal here.",
        evidenceRefs: [2],
      },
      {
        key: "burnFlexDownPct",
        low: 0.15,
        mid: 0.20,
        high: 0.25,
        conviction: "moderate",
        reasoning: "Burn flex of 15–25% sits in the comp-set range; persona suggests cushion is adequate for this stage.",
        evidenceRefs: [0, 1, 2],
      },
    ],
    overallNarrative: "Funding plan sits in the central comp band across all 5 dimensions; conviction is moderate-to-high overall.",
  };
}

function buildValidQuantOutput(conviction: "high" | "moderate" | "developing" = "high"): QuantPanelOutput {
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

function buildValidMarketOutput(): MarketPanelOutput {
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

// ── Mock helpers ──────────────────────────────────────────────────────────────

function buildValidPeOutput() {
  return {
    quantAddendum: "Focus on multi-property scale; widen runway range for staged raises.",
    marketAddendum: "LP risk flags should address staged capital availability risk.",
    rationale: "Operator scale is above the comp-set median — addenda reflect that.",
  };
}

/** Set up generateObject to return PE + quant + market outputs (three calls in order). */
function mockPanelCalls(
  quantOutput: QuantPanelOutput = buildValidQuantOutput(),
  marketOutput: MarketPanelOutput = buildValidMarketOutput(),
  peOutput = buildValidPeOutput(),
): void {
  let callCount = 0;
  vi.mocked(generateObject).mockImplementation(async () => {
    callCount++;
    if (callCount === 1) return { object: peOutput, finishReason: "stop" } as never;
    if (callCount === 2) return { object: quantOutput, finishReason: "stop" } as never;
    return { object: marketOutput, finishReason: "stop" } as never;
  });
}

/** Set up streamObject (Opus synthesis) to return a canned output object. */
function mockSynthesisCall(output: FundingSpecialistOutput = buildValidSynthesisOutput()): void {
  vi.mocked(streamObject).mockImplementationOnce(
    (() => ({
      partialObjectStream: (async function* () { yield {}; })(),
      object: Promise.resolve(output),
    })) as unknown as typeof streamObject,
  );
}

/** Stub model factory — never hits the real API since streamObject/generateObject are mocked. */
const STUB_ANTHROPIC_MODEL = {} as ReturnType<ReturnType<typeof import("@ai-sdk/anthropic").createAnthropic>>;
const STUB_GOOGLE_MODEL = {} as ReturnType<ReturnType<typeof import("@ai-sdk/google").createGoogleGenerativeAI>>;

const STUB_DEPS = {
  getAnthropicModel: (_: string) => STUB_ANTHROPIC_MODEL,
  getGoogleModel: (_: string) => STUB_GOOGLE_MODEL,
  now: FIXED_NOW,
};

beforeEach(() => {
  vi.mocked(streamObject).mockReset();
  vi.mocked(generateObject).mockReset();
});

// ────────────────────────────────────────────────────────────────────────────
// Tests

describe("runFundingSpecialist — happy path", () => {
  it("returns a complete AnalystVerdict for the large-managementco persona", async () => {
    mockPanelCalls();
    mockSynthesisCall();

    const verdict = await runFundingSpecialist(CTX_LARGE, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.specialistId).toBe("mgmt-co.funding");
    expect(verdict.dimensions.length).toBe(5);
    expect(verdict.meta.tier).toBe(1);
    expect(verdict.meta.vendorsUsed).toEqual(["anthropic", "google"]);
    expect(verdict.meta.cacheState).toBe("miss");
    expect(verdict.meta.cognitiveRunId).toBeTruthy();
    expect(verdict.generatedAt).toBe(FIXED_NOW.toISOString());
  });

  it("preserves per-dimension reasoning from the LLM in voice.detail", async () => {
    mockPanelCalls();
    mockSynthesisCall();

    const verdict = await runFundingSpecialist(CTX_LARGE, BENCHMARKS, COMPARABLES, STUB_DEPS);

    for (const dim of verdict.dimensions) {
      expect(dim.voice.detail).toBeDefined();
    }
  });

  it("emits dimensions in canonical FUNDING_DIMENSION_KEYS order", async () => {
    mockPanelCalls();
    mockSynthesisCall();

    const verdict = await runFundingSpecialist(CTX_LARGE, BENCHMARKS, COMPARABLES, STUB_DEPS);

    const fields = verdict.dimensions.map((d) => d.field);
    expect(fields).toEqual([
      "capitalRaise1Amount", // runwayBufferMonths
      "capitalRaise2Amount", // sizingOvershootPct
      "capitalRaise2Date",   // trancheGapMonths
      "revenueRampDelayMonths",
      "burnFlexDownPct",
    ]);
  });

  it("attaches evidence rows from comparables[evidenceRefs[i]]", async () => {
    mockPanelCalls();
    mockSynthesisCall();

    const verdict = await runFundingSpecialist(CTX_LARGE, BENCHMARKS, COMPARABLES, STUB_DEPS);

    for (const dim of verdict.dimensions) {
      expect(dim.evidence.length).toBeGreaterThanOrEqual(1);
      expect(dim.evidence[0].source).toMatch(/LP comp:/);
    }
  });
});

describe("runFundingSpecialist — three personas", () => {
  it.each([
    ["large-managementco", CTX_LARGE],
    ["startup-boutique", CTX_STARTUP],
    ["expansion-stage", CTX_EXPANSION],
  ])("produces a valid verdict for persona %s", async (_name, ctx) => {
    mockPanelCalls();
    mockSynthesisCall();

    const verdict = await runFundingSpecialist(ctx, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.dimensions.length).toBe(5);
    expect(verdict.specialistId).toBe("mgmt-co.funding");
  });
});

describe("runFundingSpecialist — severity derivation", () => {
  it("classifies in-range user values as 'ok'", async () => {
    mockPanelCalls();
    mockSynthesisCall();

    const verdict = await runFundingSpecialist(CTX_LARGE, BENCHMARKS, COMPARABLES, STUB_DEPS);

    // CTX_LARGE.runwayBufferMonths === 16 falls within synthesis range 14–18
    const runway = verdict.dimensions.find((d) => d.field === "capitalRaise1Amount");
    expect(runway).toBeDefined();
    expect(runway!.severity).toBe("ok");
  });

  it("classifies below-range user values as 'advisory'", async () => {
    mockPanelCalls();
    mockSynthesisCall();

    const verdict = await runFundingSpecialist(CTX_STARTUP, BENCHMARKS, COMPARABLES, STUB_DEPS);

    // CTX_STARTUP.runwayBufferMonths === 6, synthesis range 14–18 — below-range
    const runway = verdict.dimensions.find((d) => d.field === "capitalRaise1Amount");
    expect(runway!.severity).toBe("advisory");
  });

  it("classifies above-range user values as 'advisory'", async () => {
    mockPanelCalls();
    mockSynthesisCall();

    const verdict = await runFundingSpecialist(CTX_EXPANSION, BENCHMARKS, COMPARABLES, STUB_DEPS);

    // CTX_EXPANSION.runwayBufferMonths === 25, synthesis range 14–18 — above-range
    const runway = verdict.dimensions.find((d) => d.field === "capitalRaise1Amount");
    expect(runway!.severity).toBe("advisory");
  });

  it("classifies missing user values as 'ok' with a non-null range from synthesis", async () => {
    mockPanelCalls();
    mockSynthesisCall();

    // CTX_STARTUP has trancheGapMonths === null
    const verdict = await runFundingSpecialist(CTX_STARTUP, BENCHMARKS, COMPARABLES, STUB_DEPS);

    const trancheGap = verdict.dimensions.find((d) => d.field === "capitalRaise2Date");
    expect(trancheGap!.severity).toBe("ok");
    expect(trancheGap!.range).toBeTruthy(); // synthesis still provides range
  });
});

describe("runFundingSpecialist — qualityScore from conviction", () => {
  it("maps conviction enum to qualityScore in [0, 100]", async () => {
    mockPanelCalls();
    mockSynthesisCall();

    const verdict = await runFundingSpecialist(CTX_LARGE, BENCHMARKS, COMPARABLES, STUB_DEPS);

    for (const dim of verdict.dimensions) {
      expect(dim.qualityScore).toBeGreaterThanOrEqual(0);
      expect(dim.qualityScore).toBeLessThanOrEqual(100);
    }
  });
});

describe("runFundingSpecialist — error paths", () => {
  it("throws Tier1UnavailableError when a panel throws", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("Gemini Flash rate limit"));

    await expect(
      runFundingSpecialist(CTX_LARGE, BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
  });

  it("throws Tier1UnavailableError when synthesis rejects", async () => {
    mockPanelCalls();
    vi.mocked(streamObject).mockReturnValue({
      partialObjectStream: (async function* () { yield {}; })(),
      object: Promise.reject(new Error("Schema validation failed")),
    } as never);

    await expect(
      runFundingSpecialist(CTX_LARGE, BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);
  });
});

describe("runFundingSpecialist — vendor + cache invariants (G6-P2)", () => {
  it("populates vendorsUsed with both anthropic and google", async () => {
    mockPanelCalls();
    mockSynthesisCall();

    const verdict = await runFundingSpecialist(CTX_LARGE, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.vendorsUsed).toEqual(["anthropic", "google"]);
  });

  it("always reports cacheState === 'miss' (cache not wired until G6-P3)", async () => {
    mockPanelCalls();
    mockSynthesisCall();

    const verdict = await runFundingSpecialist(CTX_LARGE, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.cacheState).toBe("miss");
  });

  it("emits a non-null cognitiveRunId so ADR-008 Tier-1 invariant holds", async () => {
    mockPanelCalls();
    mockSynthesisCall();

    const verdict = await runFundingSpecialist(CTX_LARGE, BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.cognitiveRunId).toBeTruthy();
    expect(typeof verdict.meta.cognitiveRunId).toBe("string");
  });
});
