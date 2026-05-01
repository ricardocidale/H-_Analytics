/**
 * G3 tests for `runCompensationSpecialist` — N+1 pipeline + Prompt Engineer
 * pre-stage + bounded regress loop. Mirror of the Revenue G2 IB bench,
 * adapted to Compensation's 5 dimensions (USD partner-comp / staff-salary +
 * count partner-headcount / Tier-3 FTE).
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
 *   - cognitiveRunId / promptEngineerRunId prefixes match compensation-g3 convention
 *   - meta.vendorsUsed contains ≥2 distinct vendors on happy + honest-fail
 *   - non-ok numeric dimension carries range + ≥3 evidence + ≥1 Comp comp entry
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
  runCompensationSpecialist,
  Tier1UnavailableError,
} from "../../../server/ai/specialists/mgmt-co-compensation-runner";
import type { CompensationSpecialistOutput } from "../../../server/ai/specialists/mgmt-co-compensation-output-schema";
import type { QuantPanelOutput } from "../../../server/ai/specialists/mgmt-co-compensation-quant-panel-schema";
import type { MarketPanelOutput } from "../../../server/ai/specialists/mgmt-co-compensation-market-panel-schema";
import type { CompensationPromptInputContext } from "../../../server/ai/specialists/mgmt-co-compensation-prompt-input-builder";
import { getCannedCompensationComparables } from "../../../server/ai/specialists/mgmt-co-compensation-orchestrator-adapter";
import { validateSynthesisOutput } from "../../../server/ai/specialists/mgmt-co-compensation-synthesis-validator";
import {
  COMPENSATION_DIMENSION_KEYS,
  type CompensationDimensionKey,
} from "../../../server/ai/specialists/mgmt-co-compensation-prompt-input-builder";
import { DEFAULT_COMPENSATION_BENCHMARKS } from "@shared/constants-compensation-benchmarks";

// ────────────────────────────────────────────────────────────────────────────
// Fixtures

const FIXED_NOW = new Date("2026-04-30T15:00:00Z");

const COMPARABLES = getCannedCompensationComparables();

/**
 * Default values chosen to land within DEFAULT_COMPENSATION_BENCHMARKS bands
 * so the happy-path verdict has no advisory dimensions; specific tests
 * override individual values to drive severity transitions.
 */
const DEFAULT_INPUTS: Record<CompensationDimensionKey, number> = {
  partnerCompYear1: 540_000,
  partnerCompYear10: 900_000,
  partnerCountYear1: 3,
  staffSalary: 75_000,
  staffTier3Fte: 7,
};

const CTX: CompensationPromptInputContext = {
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
      "Boutique-luxury Highline-stage operator at 6 properties — widen Year 1 partner comp range to capture both lean-founder restraint and standard Highline draws.",
    marketAddendum:
      "Concept-fit flags should address founder-stage discipline expectations vs. Year 10 trajectory at institutional scale.",
    rationale: "Standard Highline-stage operator — modest addenda needed.",
  };
}

/**
 * Quant panel output. Ranges align with DEFAULT_COMPENSATION_BENCHMARKS
 * bands. Pass `conviction` to drive convergence-vs-honest-fail behavior.
 */
function buildQuantOutput(conviction: "high" | "moderate" | "developing"): QuantPanelOutput {
  const bands: Record<CompensationDimensionKey, { low: number; mid: number; high: number }> = {
    partnerCompYear1:  { low: 300_000, mid: 540_000, high: 900_000 },
    partnerCompYear10: { low: 700_000, mid: 900_000, high: 1_500_000 },
    partnerCountYear1: { low: 2,       mid: 3,       high: 5 },
    staffSalary:       { low: 50_000,  mid: 75_000,  high: 120_000 },
    staffTier3Fte:     { low: 5,       mid: 7,       high: 12 },
  };
  return {
    dimensions: COMPENSATION_DIMENSION_KEYS.map((key) => ({
      key,
      ...bands[key],
      conviction,
      reasoning: `Quant panel: ${key} grounded in ManCo comp comparable set.`,
      evidenceRefs: [0],
    })),
  };
}

function buildMarketOutput(): MarketPanelOutput {
  return {
    dimensions: COMPENSATION_DIMENSION_KEYS.map((key) => ({
      key,
      marketSentiment: "neutral" as const,
      lpRiskFlags: [],
      proposedBias: "hold" as const,
      reasoning: `Market panel: ${key} — LP-perception sentiment neutral.`,
    })),
    overallMarketContext: "Founder-stage discipline is consistent for this operator profile.",
  };
}

/** Passes all 4 quality checks in validateSynthesisOutput. */
function buildValidSynthesisOutput(): CompensationSpecialistOutput {
  return {
    dimensions: [
      {
        key: "partnerCompYear1",
        low: 320_000,
        mid: 540_000,
        high: 880_000,
        conviction: "high",
        reasoning:
          "Year 1 mgmt comp 320–880K supported by founder-stage to expansion-stage boutique-luxury comparables.",
        evidenceRefs: [0, 3],
      },
      {
        key: "partnerCompYear10",
        low: 720_000,
        mid: 950_000,
        high: 1_400_000,
        conviction: "moderate",
        reasoning: "Year 10 trajectory 720K–1.4M consistent with comparable platform scale operators.",
        evidenceRefs: [0, 7],
      },
      {
        key: "partnerCountYear1",
        low: 2,
        mid: 3,
        high: 5,
        conviction: "moderate",
        reasoning: "Year 1 partner count 2–5 reflects standard founding team size for boutique-luxury.",
        evidenceRefs: [0, 7],
      },
      {
        key: "staffSalary",
        low: 56_000,
        mid: 78_000,
        high: 95_000,
        conviction: "moderate",
        reasoning: "Staff salary 56–95K supported by hospitality mid-level operations comparables.",
        evidenceRefs: [3, 4],
      },
      {
        key: "staffTier3Fte",
        low: 6,
        mid: 8,
        high: 11,
        conviction: "high",
        reasoning: "Tier-3 FTE 6–11 reflects scale-stage staffing for institutional platforms.",
        evidenceRefs: [3, 7],
      },
    ],
    overallNarrative:
      "Compensation plan is defensible for the operator's founder-to-expansion stage trajectory.",
  };
}

/**
 * Synthesis output where one dimension's range is BELOW the user's input,
 * driving severity to "advisory" so we can assert IB#3/#4/#6 in production.
 * CTX.inputs.partnerCompYear1 = 540_000; this synthesis drives
 * partnerCompYear1 range high=520K (below user value) → "advisory" with
 * intent "above-range". evidenceRefs [0,1,2,3] covers ≥3 distinct
 * comparable indices → IB#3 + IB#4.
 */
function buildSynthesisWithAdvisory(): CompensationSpecialistOutput {
  return {
    dimensions: [
      {
        key: "partnerCompYear1",
        low: 280_000,
        mid: 400_000,
        high: 520_000,
        conviction: "high",
        reasoning:
          "Founder-stage boutique-luxury operators in this comp set hold Year 1 management comp at 280–520K to preserve LP-trust before fee revenue ramps.",
        evidenceRefs: [0, 1, 2, 3],
      },
      {
        key: "partnerCompYear10",
        low: 720_000,
        mid: 900_000,
        high: 1_300_000,
        conviction: "high",
        reasoning: "Year 10 trajectory 720K–1.3M consistent with comparable platform scale operators.",
        evidenceRefs: [0],
      },
      {
        key: "partnerCountYear1",
        low: 2,
        mid: 3,
        high: 5,
        conviction: "moderate",
        reasoning: "Year 1 partner count 2–5 reflects standard founding team size.",
        evidenceRefs: [3],
      },
      {
        key: "staffSalary",
        low: 56_000,
        mid: 78_000,
        high: 95_000,
        conviction: "moderate",
        reasoning: "Staff salary 56–95K supported by hospitality operations comparables.",
        evidenceRefs: [4],
      },
      {
        key: "staffTier3Fte",
        low: 6,
        mid: 8,
        high: 11,
        conviction: "high",
        reasoning: "Tier-3 FTE 6–11 reflects scale-stage staffing for platforms.",
        evidenceRefs: [7],
      },
    ],
    overallNarrative:
      "Year 1 partner comp runs ahead of comparable founder-stage discipline; LP review expected.",
  };
}

/** Fails the collapsed-range check (low === high on first dimension). */
function buildCollapsedRangeSynthesisOutput(): CompensationSpecialistOutput {
  return {
    dimensions: [
      {
        key: "partnerCompYear1",
        low: 540_000,
        mid: 540_000,
        high: 540_000,
        conviction: "high",
        reasoning: "Collapsed point estimate — not a range.",
        evidenceRefs: [0],
      },
      {
        key: "partnerCompYear10",
        low: 720_000,
        mid: 900_000,
        high: 1_300_000,
        conviction: "moderate",
        reasoning: "Year 10 trajectory consistent with comparables.",
        evidenceRefs: [0],
      },
      {
        key: "partnerCountYear1",
        low: 2,
        mid: 3,
        high: 5,
        conviction: "moderate",
        reasoning: "Partner count standard for founding teams.",
        evidenceRefs: [3],
      },
      {
        key: "staffSalary",
        low: 56_000,
        mid: 78_000,
        high: 95_000,
        conviction: "moderate",
        reasoning: "Staff salary supported by comparables.",
        evidenceRefs: [4],
      },
      {
        key: "staffTier3Fte",
        low: 6,
        mid: 8,
        high: 11,
        conviction: "high",
        reasoning: "Tier-3 FTE reflects scale-stage staffing for platforms.",
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

function mockStreamObjectSequence(...outputs: CompensationSpecialistOutput[]): void {
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
  synthesisOutput: CompensationSpecialistOutput,
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

describe("validateSynthesisOutput (compensation)", () => {
  it("passes a valid synthesis output", () => {
    const result = validateSynthesisOutput(buildValidSynthesisOutput(), COMPARABLES);
    expect(result.pass).toBe(true);
  });

  it("fails when a dimension key is missing", () => {
    const output = buildValidSynthesisOutput();
    output.dimensions = output.dimensions.filter((d) => d.key !== "staffTier3Fte");
    const result = validateSynthesisOutput(output, COMPARABLES);
    expect(result.pass).toBe(false);
    expect(result.regressReason).toMatch(/staffTier3Fte/);
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
// runCompensationSpecialist G3 — Prompt Engineer pre-stage + happy path

describe("runCompensationSpecialist G3 — Prompt Engineer pre-stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls generateObject 3 times (PE + quant + market) on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    await runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(streamObject)).toHaveBeenCalledTimes(1);
  });

  it("happy path: meta.promptEngineerRunId is set with compensation-g3 prefix", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
    expect(verdict.meta.promptEngineerRunId).toMatch(/^pe-compensation-g3-/);
  });

  it("happy path: meta.regressCount === 0", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBe(0);
  });

  it("happy path: cognitiveRunId uses compensation-g3 prefix", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.cognitiveRunId).toMatch(/^compensation-g3-/);
    expect(verdict.meta.cognitiveRunId).not.toMatch(/^compensation-g3-hf-/);
  });

  it("PE failure throws Tier1UnavailableError without calling panels or synthesis", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("Gemini Flash quota exceeded"));

    await expect(
      runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
  });

  it("PE failure error message mentions prompt engineer", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("rate limited"));

    const err = await runCompensationSpecialist(
      CTX,
      DEFAULT_COMPENSATION_BENCHMARKS,
      COMPARABLES,
      STUB_DEPS,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(Tier1UnavailableError);
    expect(err.message).toMatch(/prompt engineer/i);
  });

  it("convergence-fail (all-developing quant): streamObject never called, regressCount=0", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
    expect(verdict.meta.regressCount).toBe(0);
    expect(verdict.meta.promptEngineerRunId).toMatch(/^pe-compensation-g3-/);
    expect(verdict.meta.cognitiveRunId).toMatch(/^compensation-g3-hf-/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runCompensationSpecialist G3 — quality checker + bounded regress loop

describe("runCompensationSpecialist G3 — quality checker + bounded regress loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("first-pass success: 3 generateObject + 1 streamObject calls", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    await runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    await runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    const verdict = await runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    await runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    const verdict = await runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS);

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
      runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runCompensationSpecialist G3 — Intelligence Bar invariants
//
// Covers IB#1 (cognitiveRunId), IB#3 (≥3 evidence per non-ok), IB#4 (tabular
// comp evidence), IB#6 (range on non-ok numeric), IB#7 (vendor breadth ≥2),
// IB#8 (promptEngineerRunId), IB#9 (regressCount tracked).
// IB#2 and IB#5 are confirmed at PR-review time (not statically assertable).

describe("runCompensationSpecialist G3 — Intelligence Bar invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("IB#1: meta.cognitiveRunId is non-null on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.cognitiveRunId).toBeTruthy();
  });

  it("IB#7: meta.vendorsUsed contains ≥ 2 distinct vendors on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.vendorsUsed).toBeDefined();
    expect(verdict.meta.vendorsUsed!.length).toBeGreaterThanOrEqual(2);
  });

  it("IB#7: honest-fail path still sets vendorsUsed ≥ 2", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.vendorsUsed).toBeDefined();
    expect(verdict.meta.vendorsUsed!.length).toBeGreaterThanOrEqual(2);
  });

  it("IB#6 + IB#3 + IB#4: advisory dimension carries range, ≥3 evidence, and ≥1 Comp comp entry", async () => {
    // CTX.inputs.partnerCompYear1=540K, synthesis range high=520K → above range → advisory
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildSynthesisWithAdvisory());

    const verdict = await runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS);

    const advisoryDim = verdict.dimensions.find((d) => d.severity === "advisory");
    expect(advisoryDim).toBeDefined();

    // IB#6 — non-ok numeric dimension carries a non-null range
    expect(advisoryDim!.range).not.toBeNull();

    // IB#3 — ≥3 evidence entries per non-ok dimension
    expect(advisoryDim!.evidence.length).toBeGreaterThanOrEqual(3);

    // IB#4 — tabular Comp comp evidence present (source prefixed "Comp:")
    const compEvidence = advisoryDim!.evidence.filter((e) => e.source.startsWith("Comp:"));
    expect(compEvidence.length).toBeGreaterThanOrEqual(1);
  });

  it("IB#8: meta.promptEngineerRunId is set on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
  });

  it("IB#9: meta.regressCount is tracked (=0 on first-pass success)", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runCompensationSpecialist(CTX, DEFAULT_COMPENSATION_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBeDefined();
    expect(verdict.meta.regressCount).toBe(0);
  });
});
