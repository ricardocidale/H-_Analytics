/**
 * Phase 2 tests for `runOverheadSpecialist` — N+1 pipeline + Prompt Engineer
 * pre-stage + bounded regress loop. Mirror of the Compensation G3 IB bench,
 * adapted to Overhead's 6 USD dimensions (4 fixed-line annual + 2 per-property
 * variable).
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
 *   - cognitiveRunId / promptEngineerRunId prefixes match overhead-p2 convention
 *   - meta.vendorsUsed contains ≥2 distinct vendors on happy + honest-fail
 *   - non-ok numeric dimension carries range + ≥3 evidence + ≥1 Overhead comp entry
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
  runOverheadSpecialist,
  Tier1UnavailableError,
} from "../../../server/ai/specialists/mgmt-co-overhead-runner";
import type { OverheadSpecialistOutput } from "../../../server/ai/specialists/mgmt-co-overhead-output-schema";
import type { QuantPanelOutput } from "../../../server/ai/specialists/mgmt-co-overhead-quant-panel-schema";
import type { MarketPanelOutput } from "../../../server/ai/specialists/mgmt-co-overhead-market-panel-schema";
import type { OverheadPromptInputContext } from "../../../server/ai/specialists/mgmt-co-overhead-prompt-input-builder";
import { getCannedOverheadComparables } from "../../../server/ai/specialists/mgmt-co-overhead-orchestrator-adapter";
import { validateSynthesisOutput } from "../../../server/ai/specialists/mgmt-co-overhead-synthesis-validator";
import {
  OVERHEAD_DIMENSION_KEYS,
  type OverheadDimensionKey,
} from "../../../server/ai/specialists/mgmt-co-overhead-prompt-input-builder";
import { DEFAULT_OVERHEAD_BENCHMARKS } from "@shared/constants-overhead-benchmarks";

// ────────────────────────────────────────────────────────────────────────────
// Fixtures

const FIXED_NOW = new Date("2026-04-30T15:00:00Z");

const COMPARABLES = getCannedOverheadComparables();

/**
 * Default values chosen to land within DEFAULT_OVERHEAD_BENCHMARKS bands so
 * the happy-path verdict has no advisory dimensions; specific tests override
 * individual values to drive severity transitions.
 */
const DEFAULT_INPUTS: Record<OverheadDimensionKey, number> = {
  officeLeaseStart: 36_000,
  professionalServicesStart: 27_000,
  techInfraStart: 18_000,
  businessInsuranceStart: 11_500,
  travelCostPerClient: 13_000,
  itLicensePerClient: 3_500,
};

const CTX: OverheadPromptInputContext = {
  inputs: DEFAULT_INPUTS,
  portfolio: { propertyCount: 6, totalManagementCoRevenueUsd: 575_000, monthlyBurnUsd: 65_000 },
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
      "Boutique-luxury Highline-stage operator at 6 properties — widen office lease range to capture both founder-restraint and full anchor-office postures.",
    marketAddendum:
      "Concept-fit flags should address audit-readiness expectations vs. insurance-adequacy at the operator's stage.",
    rationale: "Standard Highline-stage operator — modest addenda needed.",
  };
}

/**
 * Quant panel output. Ranges align with DEFAULT_OVERHEAD_BENCHMARKS bands.
 * Pass `conviction` to drive convergence-vs-honest-fail behavior.
 */
function buildQuantOutput(conviction: "high" | "moderate" | "developing"): QuantPanelOutput {
  const bands: Record<OverheadDimensionKey, { low: number; mid: number; high: number }> = {
    officeLeaseStart:          { low: 24_000, mid: 36_000, high: 48_000 },
    professionalServicesStart: { low: 18_000, mid: 27_000, high: 36_000 },
    techInfraStart:            { low: 12_000, mid: 18_000, high: 24_000 },
    businessInsuranceStart:    { low:  8_000, mid: 11_500, high: 15_000 },
    travelCostPerClient:       { low:  8_000, mid: 13_000, high: 18_000 },
    itLicensePerClient:        { low:  2_000, mid:  3_500, high:  5_000 },
  };
  return {
    dimensions: OVERHEAD_DIMENSION_KEYS.map((key) => ({
      key,
      ...bands[key],
      conviction,
      reasoning: `Quant panel: ${key} grounded in ManCo overhead comparable set.`,
      evidenceRefs: [0],
    })),
  };
}

function buildMarketOutput(): MarketPanelOutput {
  return {
    dimensions: OVERHEAD_DIMENSION_KEYS.map((key) => ({
      key,
      marketSentiment: "neutral" as const,
      lpRiskFlags: [],
      proposedBias: "hold" as const,
      reasoning: `Market panel: ${key} — LP-perception sentiment neutral.`,
    })),
    overallMarketContext: "Audit-readiness and insurance-adequacy posture is consistent for this operator profile.",
  };
}

/** Passes all 4 quality checks in validateSynthesisOutput. */
function buildValidSynthesisOutput(): OverheadSpecialistOutput {
  return {
    dimensions: [
      {
        key: "officeLeaseStart",
        low: 26_000,
        mid: 36_000,
        high: 46_000,
        conviction: "high",
        reasoning:
          "Office lease 26–46K supported by founder-stage to expansion-stage boutique-luxury comparables.",
        evidenceRefs: [0, 3],
      },
      {
        key: "professionalServicesStart",
        low: 22_000,
        mid: 28_000,
        high: 36_000,
        conviction: "moderate",
        reasoning: "Professional services 22–36K consistent with comparable platform-scale operators.",
        evidenceRefs: [0, 7],
      },
      {
        key: "techInfraStart",
        low: 13_000,
        mid: 18_000,
        high: 24_000,
        conviction: "moderate",
        reasoning: "Tech infrastructure 13–24K reflects standard corporate IT for boutique-luxury.",
        evidenceRefs: [0, 7],
      },
      {
        key: "businessInsuranceStart",
        low: 9_000,
        mid: 11_500,
        high: 14_500,
        conviction: "moderate",
        reasoning: "Business insurance 9–14.5K supported by D&O/E&O hospitality comparables.",
        evidenceRefs: [3, 4],
      },
      {
        key: "travelCostPerClient",
        low: 9_000,
        mid: 13_000,
        high: 16_000,
        conviction: "high",
        reasoning: "Travel/client 9–16K reflects per-property cadence for Highline operators.",
        evidenceRefs: [3, 7],
      },
      {
        key: "itLicensePerClient",
        low: 2_400,
        mid: 3_500,
        high: 4_800,
        conviction: "moderate",
        reasoning: "IT/client licensing 2.4–4.8K supported by HFTP per-property tech-stack survey.",
        evidenceRefs: [4, 7],
      },
    ],
    overallNarrative:
      "Overhead plan is defensible for the operator's founder-to-expansion stage trajectory.",
  };
}

/**
 * Synthesis output where one dimension's range is BELOW the user's input,
 * driving severity to "advisory" so we can assert IB#3/#4/#6 in production.
 * CTX.inputs.officeLeaseStart = 36_000; this synthesis drives officeLeaseStart
 * range high=30K (below user value) → "advisory" with intent "above-range".
 * evidenceRefs [0,1,2,3] covers ≥3 distinct comparable indices → IB#3 + IB#4.
 */
function buildSynthesisWithAdvisory(): OverheadSpecialistOutput {
  return {
    dimensions: [
      {
        key: "officeLeaseStart",
        low: 22_000,
        mid: 26_000,
        high: 30_000,
        conviction: "high",
        reasoning:
          "Founder-stage boutique-luxury operators in this comp set hold corporate office at 22–30K to preserve LP-trust before fee revenue ramps.",
        evidenceRefs: [0, 1, 2, 3],
      },
      {
        key: "professionalServicesStart",
        low: 22_000,
        mid: 28_000,
        high: 36_000,
        conviction: "high",
        reasoning: "Professional services 22–36K consistent with comparable platform operators.",
        evidenceRefs: [0],
      },
      {
        key: "techInfraStart",
        low: 13_000,
        mid: 18_000,
        high: 24_000,
        conviction: "moderate",
        reasoning: "Tech infrastructure 13–24K reflects standard corporate IT.",
        evidenceRefs: [3],
      },
      {
        key: "businessInsuranceStart",
        low: 9_000,
        mid: 11_500,
        high: 14_500,
        conviction: "moderate",
        reasoning: "Business insurance 9–14.5K supported by hospitality D&O comparables.",
        evidenceRefs: [4],
      },
      {
        key: "travelCostPerClient",
        low: 9_000,
        mid: 13_000,
        high: 16_000,
        conviction: "high",
        reasoning: "Travel/client 9–16K reflects per-property cadence for Highline operators.",
        evidenceRefs: [7],
      },
      {
        key: "itLicensePerClient",
        low: 2_400,
        mid: 3_500,
        high: 4_800,
        conviction: "moderate",
        reasoning: "IT/client 2.4–4.8K reflects HFTP per-property tech-stack survey.",
        evidenceRefs: [7],
      },
    ],
    overallNarrative:
      "Office lease runs ahead of comparable founder-stage discipline; LP review expected.",
  };
}

/** Fails the collapsed-range check (low === high on first dimension). */
function buildCollapsedRangeSynthesisOutput(): OverheadSpecialistOutput {
  return {
    dimensions: [
      {
        key: "officeLeaseStart",
        low: 36_000,
        mid: 36_000,
        high: 36_000,
        conviction: "high",
        reasoning: "Collapsed point estimate — not a range.",
        evidenceRefs: [0],
      },
      {
        key: "professionalServicesStart",
        low: 22_000,
        mid: 28_000,
        high: 36_000,
        conviction: "moderate",
        reasoning: "Professional services consistent with comparables.",
        evidenceRefs: [0],
      },
      {
        key: "techInfraStart",
        low: 13_000,
        mid: 18_000,
        high: 24_000,
        conviction: "moderate",
        reasoning: "Tech infrastructure reflects corporate IT standard.",
        evidenceRefs: [3],
      },
      {
        key: "businessInsuranceStart",
        low: 9_000,
        mid: 11_500,
        high: 14_500,
        conviction: "moderate",
        reasoning: "Business insurance supported by comparables.",
        evidenceRefs: [4],
      },
      {
        key: "travelCostPerClient",
        low: 9_000,
        mid: 13_000,
        high: 16_000,
        conviction: "high",
        reasoning: "Travel/client reflects per-property cadence.",
        evidenceRefs: [7],
      },
      {
        key: "itLicensePerClient",
        low: 2_400,
        mid: 3_500,
        high: 4_800,
        conviction: "moderate",
        reasoning: "IT/client supported by HFTP survey.",
        evidenceRefs: [7],
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

function mockStreamObjectSequence(...outputs: OverheadSpecialistOutput[]): void {
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
  synthesisOutput: OverheadSpecialistOutput,
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

describe("validateSynthesisOutput (overhead)", () => {
  it("passes a valid synthesis output", () => {
    const result = validateSynthesisOutput(buildValidSynthesisOutput(), COMPARABLES);
    expect(result.pass).toBe(true);
  });

  it("fails when a dimension key is missing", () => {
    const output = buildValidSynthesisOutput();
    output.dimensions = output.dimensions.filter((d) => d.key !== "itLicensePerClient");
    const result = validateSynthesisOutput(output, COMPARABLES);
    expect(result.pass).toBe(false);
    expect(result.regressReason).toMatch(/itLicensePerClient/);
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
// runOverheadSpecialist Phase 2 — Prompt Engineer pre-stage + happy path

describe("runOverheadSpecialist Phase 2 — Prompt Engineer pre-stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls generateObject 3 times (PE + quant + market) on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    await runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(streamObject)).toHaveBeenCalledTimes(1);
  });

  it("happy path: meta.promptEngineerRunId is set with overhead-p2 prefix", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
    expect(verdict.meta.promptEngineerRunId).toMatch(/^pe-overhead-p2-/);
  });

  it("happy path: meta.regressCount === 0", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBe(0);
  });

  it("happy path: cognitiveRunId uses overhead-p2 prefix", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.cognitiveRunId).toMatch(/^overhead-p2-/);
    expect(verdict.meta.cognitiveRunId).not.toMatch(/^overhead-p2-hf-/);
  });

  it("PE failure throws Tier1UnavailableError without calling panels or synthesis", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("Gemini Flash quota exceeded"));

    await expect(
      runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
  });

  it("PE failure error message mentions prompt engineer", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("rate limited"));

    const err = await runOverheadSpecialist(
      CTX,
      DEFAULT_OVERHEAD_BENCHMARKS,
      COMPARABLES,
      STUB_DEPS,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(Tier1UnavailableError);
    expect(err.message).toMatch(/prompt engineer/i);
  });

  it("convergence-fail (all-developing quant): streamObject never called, regressCount=0", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
    expect(verdict.meta.regressCount).toBe(0);
    expect(verdict.meta.promptEngineerRunId).toMatch(/^pe-overhead-p2-/);
    expect(verdict.meta.cognitiveRunId).toMatch(/^overhead-p2-hf-/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runOverheadSpecialist Phase 2 — quality checker + bounded regress loop

describe("runOverheadSpecialist Phase 2 — quality checker + bounded regress loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("first-pass success: 3 generateObject + 1 streamObject calls", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    await runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    await runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    const verdict = await runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    await runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    const verdict = await runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS);

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
      runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runOverheadSpecialist Phase 2 — Intelligence Bar invariants
//
// Covers IB#1 (cognitiveRunId), IB#3 (≥3 evidence per non-ok), IB#4 (tabular
// comp evidence), IB#6 (range on non-ok numeric), IB#7 (vendor breadth ≥2),
// IB#8 (promptEngineerRunId), IB#9 (regressCount tracked).
// IB#2 and IB#5 are confirmed at PR-review time (not statically assertable).

describe("runOverheadSpecialist Phase 2 — Intelligence Bar invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("IB#1: meta.cognitiveRunId is non-null on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.cognitiveRunId).toBeTruthy();
  });

  it("IB#7: meta.vendorsUsed contains ≥ 2 distinct vendors on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.vendorsUsed).toBeDefined();
    expect(verdict.meta.vendorsUsed!.length).toBeGreaterThanOrEqual(2);
  });

  it("IB#7: honest-fail path still sets vendorsUsed ≥ 2", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.vendorsUsed).toBeDefined();
    expect(verdict.meta.vendorsUsed!.length).toBeGreaterThanOrEqual(2);
  });

  it("IB#6 + IB#3 + IB#4: advisory dimension carries range, ≥3 evidence, and ≥1 Overhead comp entry", async () => {
    // CTX.inputs.officeLeaseStart=36K, synthesis range high=30K → above range → advisory
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildSynthesisWithAdvisory());

    const verdict = await runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS);

    const advisoryDim = verdict.dimensions.find((d) => d.severity === "advisory");
    expect(advisoryDim).toBeDefined();

    // IB#6 — non-ok numeric dimension carries a non-null range
    expect(advisoryDim!.range).not.toBeNull();

    // IB#3 — ≥3 evidence entries per non-ok dimension
    expect(advisoryDim!.evidence.length).toBeGreaterThanOrEqual(3);

    // IB#4 — tabular Overhead comp evidence present (source prefixed "Overhead:")
    const compEvidence = advisoryDim!.evidence.filter((e) => e.source.startsWith("Overhead:"));
    expect(compEvidence.length).toBeGreaterThanOrEqual(1);
  });

  it("IB#8: meta.promptEngineerRunId is set on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
  });

  it("IB#9: meta.regressCount is tracked (=0 on first-pass success)", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runOverheadSpecialist(CTX, DEFAULT_OVERHEAD_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBeDefined();
    expect(verdict.meta.regressCount).toBe(0);
  });
});
