/**
 * G3 tests for `runPropertyRiskIntelligenceSpecialist` — N+1 pipeline.
 *
 * Coverage:
 *   G3-P3a (PE pre-stage):
 *   - generateObject called 3 times (PE + quant + market) on happy path
 *   - meta.promptEngineerRunId set and non-empty (IB#8)
 *   - meta.regressCount === 0 on happy path
 *   - meta.promptEngineerRunId set on honest-fail path (PE ran before convergence check)
 *   - PE failure throws Tier1UnavailableError without calling panels or synthesis
 *   - cognitiveRunId uses g3 prefix on happy path
 *   - cognitiveRunId uses g3-hf prefix on honest-fail path
 *
 *   G3-P4 (Intelligence Bar invariants):
 *   - IB#7: meta.vendorsUsed ≥ 2 distinct vendors on happy path
 *   - IB#7: meta.vendorsUsed ≥ 2 on honest-fail path (both panels ran)
 *   - IB#6 + IB#3 + IB#4: advisory dimension carries range, ≥3 evidence, ≥1 Market comp entry
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
  runPropertyRiskIntelligenceSpecialist,
  Tier1UnavailableError,
} from "../../../server/ai/specialists/property-risk-intelligence-runner";
import type { PropertyRiskIntelligenceOutput } from "../../../server/ai/specialists/property-risk-intelligence-output-schema";
import type { RiskQuantPanelOutput } from "../../../server/ai/specialists/property-risk-quant-panel-schema";
import type { RiskMarketPanelOutput } from "../../../server/ai/specialists/property-risk-market-panel-schema";
import type { PropertyRiskIntelligencePromptInputContext } from "../../../server/ai/specialists/property-risk-intelligence-prompt";
import { getCannedInflationComparables } from "../../../server/ai/specialists/property-risk-orchestrator-adapter";

// ────────────────────────────────────────────────────────────────────────────
// Fixtures

const FIXED_NOW = new Date("2026-04-28T12:00:00Z");

const COMPARABLES = getCannedInflationComparables();

const CTX: PropertyRiskIntelligencePromptInputContext = {
  persona: { verticalSlug: "boutique-luxury", marketTier: "L+B", locale: "US" },
  inputs: {
    propertyInflationRate: 0.025, // 2.5% — falls below the advisory synthesis range (low=0.03)
    country: "US",
    city: "Miami",
  },
  countryInflationOutlook: {
    source: "US Federal Reserve long-run inflation target",
    low: 0.020,
    mid: 0.025,
    high: 0.030,
    asOf: "2024-12-31",
  },
};

// ── Stub output builders ───────────────────────────────────────────────────

function buildPeOutput() {
  return {
    quantAddendum: "Boutique-luxury US operator with F&B exposure; widen range for import risk.",
    marketAddendum: "LP risk flags should address CPI pass-through in tourist-economy markets.",
    rationale: "Standard boutique-luxury US operator — modest addenda for F&B inflation risk.",
  };
}

function buildQuantOutput(conviction: "high" | "moderate" | "developing"): RiskQuantPanelOutput {
  return {
    dimensions: [
      {
        key: "propertyInflationRate",
        low: 0.020,
        mid: 0.028,
        high: 0.038,
        conviction,
        reasoning: "US lodging CPI and Fed target anchor this range for boutique-luxury operators.",
        evidenceRefs: [0, 1, 2],
      },
    ],
  };
}

function buildMarketOutput(): RiskMarketPanelOutput {
  return {
    dimensions: [
      {
        key: "propertyInflationRate",
        propertyDeviation: "in-line",
        lpRiskFlags: [],
        proposedBias: "hold",
        reasoning: "Property inflation exposure aligned with country outlook for this vertical.",
      },
    ],
    overallInflationContext: "Inflation exposure is stable for this boutique-luxury asset.",
  };
}

function buildSynthesisOutput(): PropertyRiskIntelligenceOutput {
  return {
    dimensions: [
      {
        key: "propertyInflationRate",
        low: 0.022,
        mid: 0.028,
        high: 0.035,
        conviction: "high",
        reasoning: "Fed long-run target anchors the mid; BLS lodging CPI, Eurostat HICP, and IMF EM data all support the range.",
        evidenceRefs: [0, 1, 2],
      },
    ],
    overallNarrative: "Property inflation exposure is well-anchored by US authority sources.",
  };
}

// CTX.inputs.propertyInflationRate=0.025 falls below synthesis low=0.03 → advisory.
// evidenceRefs [0,1,2] covers all 3 canned inflation comparables → satisfies IB#3 + IB#4.
function buildSynthesisWithAdvisory(): PropertyRiskIntelligenceOutput {
  return {
    dimensions: [
      {
        key: "propertyInflationRate",
        low: 0.030,
        mid: 0.038,
        high: 0.050,
        conviction: "high",
        reasoning: "F&B import exposure and tourist-economy CPI dynamics push this property above the Fed target band; BLS, Eurostat, and IMF EM data all support the upper range.",
        evidenceRefs: [0, 1, 2],
      },
    ],
    overallNarrative: "Property inflation is above the Fed target band due to import-driven F&B cost exposure.",
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
  quantOutput: RiskQuantPanelOutput,
  marketOutput: RiskMarketPanelOutput,
  synthesisOutput: PropertyRiskIntelligenceOutput,
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
  quantOutput: RiskQuantPanelOutput,
  marketOutput: RiskMarketPanelOutput,
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

describe("runPropertyRiskIntelligenceSpecialist G3-P3a — Prompt Engineer pre-stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls generateObject 3 times (PE + quant + market) on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildSynthesisOutput());

    await runPropertyRiskIntelligenceSpecialist(CTX, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(streamObject)).toHaveBeenCalledTimes(1);
  });

  it("happy path: meta.promptEngineerRunId is set and non-empty (IB#8)", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildSynthesisOutput());

    const verdict = await runPropertyRiskIntelligenceSpecialist(CTX, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
    expect(verdict.meta.promptEngineerRunId).toMatch(/^pe-risk-g3-/);
  });

  it("happy path: meta.regressCount === 0 (no regress loop on first-pass success)", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildSynthesisOutput());

    const verdict = await runPropertyRiskIntelligenceSpecialist(CTX, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBe(0);
  });

  it("honest-fail: meta.promptEngineerRunId is set even when quant conviction is developing", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runPropertyRiskIntelligenceSpecialist(CTX, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
    expect(verdict.meta.promptEngineerRunId).toMatch(/^pe-risk-g3-/);
  });

  it("honest-fail: meta.regressCount === 0 on honest-fail path", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runPropertyRiskIntelligenceSpecialist(CTX, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBe(0);
  });

  it("PE failure throws Tier1UnavailableError without calling panels or synthesis", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("Gemini Flash quota exceeded"));

    await expect(
      runPropertyRiskIntelligenceSpecialist(CTX, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
  });

  it("PE failure error message mentions prompt engineer", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("rate limited"));

    const err = await runPropertyRiskIntelligenceSpecialist(CTX, COMPARABLES, STUB_DEPS).catch((e) => e);

    expect(err).toBeInstanceOf(Tier1UnavailableError);
    expect(err.message).toMatch(/prompt engineer/i);
  });

  it("cognitiveRunId uses risk-g3 prefix on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildSynthesisOutput());

    const verdict = await runPropertyRiskIntelligenceSpecialist(CTX, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.cognitiveRunId).toMatch(/^risk-g3-/);
  });

  it("cognitiveRunId uses risk-g3-hf prefix on honest-fail path", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runPropertyRiskIntelligenceSpecialist(CTX, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.cognitiveRunId).toMatch(/^risk-g3-hf-/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// G3-P4 — Intelligence Bar invariant assertions

describe("runPropertyRiskIntelligenceSpecialist G3-P4 — Intelligence Bar invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("IB#7: meta.vendorsUsed contains ≥ 2 distinct vendors on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildSynthesisOutput());

    const verdict = await runPropertyRiskIntelligenceSpecialist(CTX, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.vendorsUsed).toBeDefined();
    expect(verdict.meta.vendorsUsed!.length).toBeGreaterThanOrEqual(2);
  });

  it("IB#7: honest-fail path still sets vendorsUsed ≥ 2 (both panels ran before convergence check)", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runPropertyRiskIntelligenceSpecialist(CTX, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.vendorsUsed).toBeDefined();
    expect(verdict.meta.vendorsUsed!.length).toBeGreaterThanOrEqual(2);
  });

  it("IB#6 + IB#3 + IB#4: advisory dimension carries range, ≥3 evidence, and ≥1 Market comp entry", async () => {
    // CTX.inputs.propertyInflationRate=0.025, synthesis range low=0.03 → below range → "advisory"
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildSynthesisWithAdvisory());

    const verdict = await runPropertyRiskIntelligenceSpecialist(CTX, COMPARABLES, STUB_DEPS);

    const advisoryDim = verdict.dimensions.find((d) => d.severity === "advisory");
    expect(advisoryDim).toBeDefined();

    // IB#6 — non-ok numeric dimension carries a non-null range
    expect(advisoryDim!.range).not.toBeNull();

    // IB#3 — ≥3 evidence entries per non-ok dimension
    expect(advisoryDim!.evidence.length).toBeGreaterThanOrEqual(3);

    // IB#4 — tabular Market comp evidence present (source prefixed "Market comp:")
    const marketCompEvidence = advisoryDim!.evidence.filter((e) => e.source.startsWith("Market comp:"));
    expect(marketCompEvidence.length).toBeGreaterThanOrEqual(1);
  });
});
