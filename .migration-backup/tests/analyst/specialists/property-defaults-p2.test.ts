/**
 * Phase 2 tests for `runPropertyDefaultsSpecialist` — N+1 pipeline + Prompt
 * Engineer pre-stage + bounded regress loop. Mirror of `company-p2.test.ts`
 * adapted to the Property-Defaults Specialist's 4 fraction dimensions
 * (eventExpenseRate, otherExpenseRate, utilitiesVariableSplit,
 * salesCommissionRate — all fractions, 0.65 = 65%).
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
 *   - cognitiveRunId / promptEngineerRunId prefixes match property-defaults-p2 convention
 *   - meta.vendorsUsed contains ≥2 distinct vendors on happy + honest-fail
 *   - non-ok numeric dimension carries range + ≥3 evidence + ≥1 PropertyDefaults comp entry
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
  runPropertyDefaultsSpecialist,
  Tier1UnavailableError,
} from "../../../server/ai/specialists/mgmt-co-property-defaults-runner";
import type { PropertyDefaultsSpecialistOutput } from "../../../server/ai/specialists/mgmt-co-property-defaults-output-schema";
import type { QuantPanelOutput } from "../../../server/ai/specialists/mgmt-co-property-defaults-quant-panel-schema";
import type { MarketPanelOutput } from "../../../server/ai/specialists/mgmt-co-property-defaults-market-panel-schema";
import type { PropertyDefaultsPromptInputContext } from "../../../server/ai/specialists/mgmt-co-property-defaults-prompt-input-builder";
import { getCannedPropertyDefaultsComparables } from "../../../server/ai/specialists/mgmt-co-property-defaults-orchestrator-adapter";
import { validateSynthesisOutput } from "../../../server/ai/specialists/mgmt-co-property-defaults-synthesis-validator";
import {
  PROPERTY_DEFAULTS_DIMENSION_KEYS,
  type PropertyDefaultsDimensionKey,
} from "../../../server/ai/specialists/mgmt-co-property-defaults-prompt-input-builder";
import { DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS } from "@shared/constants-property-defaults-benchmarks";

// ────────────────────────────────────────────────────────────────────────────
// Fixtures

const FIXED_NOW = new Date("2026-04-30T15:00:00Z");

const COMPARABLES = getCannedPropertyDefaultsComparables();

/**
 * Default values chosen to land within DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS bands
 * so the happy-path verdict has no advisory dimensions. All values are fractions.
 *
 * eventExpenseRate:       0.65 (mid of 0.55–0.75)
 * otherExpenseRate:       0.60 (mid of 0.50–0.72)
 * utilitiesVariableSplit: 0.55 (between 0.40 and 0.70)
 * salesCommissionRate:    0.07 (mid of 0.03–0.12)
 */
const DEFAULT_INPUTS: Record<PropertyDefaultsDimensionKey, number> = {
  eventExpenseRate:       0.65,
  otherExpenseRate:       0.60,
  utilitiesVariableSplit: 0.55,
  salesCommissionRate:    0.07,
};

const CTX: PropertyDefaultsPromptInputContext = {
  inputs: DEFAULT_INPUTS,
  portfolio: { propertyCount: 5, totalManagementCoRevenueUsd: 480_000, monthlyBurnUsd: 55_000 },
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
      "Boutique-luxury portfolio at 5 properties — calibrate ranges to reflect smart-room HVAC profile and direct-booking channel mix.",
    marketAddendum:
      "LP scrutiny flags should address OTA commission exposure and utilities variability consistency against infrastructure profile.",
    rationale: "Standard boutique-luxury operator — event cost and OTA commission are the key LP scrutiny axes.",
  };
}

/**
 * Quant panel output. Ranges align with DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS bands.
 * All values are fractions (0.65 = 65%). Pass `conviction` to drive
 * convergence-vs-honest-fail behavior.
 */
function buildQuantOutput(conviction: "high" | "moderate" | "developing"): QuantPanelOutput {
  const bands: Record<PropertyDefaultsDimensionKey, { low: number; mid: number; high: number }> = {
    eventExpenseRate:       { low: 0.58, mid: 0.65, high: 0.72 },
    otherExpenseRate:       { low: 0.52, mid: 0.60, high: 0.70 },
    utilitiesVariableSplit: { low: 0.42, mid: 0.58, high: 0.68 },
    salesCommissionRate:    { low: 0.04, mid: 0.07, high: 0.11 },
  };
  return {
    dimensions: PROPERTY_DEFAULTS_DIMENSION_KEYS.map((key) => ({
      key,
      ...bands[key],
      conviction,
      reasoning: `Quant panel: ${key} grounded in boutique-luxury property comparable set.`,
      evidenceRefs: [0],
    })),
  };
}

function buildMarketOutput(): MarketPanelOutput {
  return {
    dimensions: PROPERTY_DEFAULTS_DIMENSION_KEYS.map((key) => ({
      key,
      marketSentiment: "neutral" as const,
      lpRiskFlags: [],
      proposedBias: "hold" as const,
      reasoning: `Market panel: ${key} — LP-perception sentiment neutral for this operator profile.`,
    })),
    overallMarketContext:
      "Property underwriting defaults posture is consistent for this boutique-luxury portfolio stage.",
  };
}

/** Passes all 4 quality checks in validateSynthesisOutput. */
function buildValidSynthesisOutput(): PropertyDefaultsSpecialistOutput {
  return {
    dimensions: [
      {
        key: "eventExpenseRate",
        low: 0.58,
        mid: 0.65,
        high: 0.72,
        conviction: "high",
        reasoning:
          "Event expense rate 58–72% consistent with boutique-luxury USALI F&B benchmarks; your 65% lands at midpoint of full-service boutique range.",
        evidenceRefs: [0, 3],
      },
      {
        key: "otherExpenseRate",
        low: 0.52,
        mid: 0.60,
        high: 0.70,
        conviction: "moderate",
        reasoning:
          "Other expense rate 52–70% reflects USALI undistributed ancillary benchmark; ancillary revenue complexity supports mid-range cost structure.",
        evidenceRefs: [0, 7],
      },
      {
        key: "utilitiesVariableSplit",
        low: 0.42,
        mid: 0.55,
        high: 0.68,
        conviction: "moderate",
        reasoning:
          "Utilities variable split 42–68% per Cornell Hotel Sustainability Handbook; boutique smart-room installs pull the split higher than mid-tier.",
        evidenceRefs: [0, 5],
      },
      {
        key: "salesCommissionRate",
        low: 0.04,
        mid: 0.07,
        high: 0.10,
        conviction: "moderate",
        reasoning:
          "Blended OTA commission 4–10% per Kalibri Labs Direct Booking Study; direct-booking-optimized portfolio can sit below mid-range.",
        evidenceRefs: [3, 9],
      },
    ],
    overallNarrative:
      "Property underwriting defaults are defensible for the operator's boutique-luxury portfolio profile.",
  };
}

/**
 * Synthesis where eventExpenseRate range high=0.62 (below user's 0.65)
 * → user value above range → "advisory" severity + "above-range" intent.
 * evidenceRefs [0,1,2,3] covers ≥3 distinct comparable indices → IB#3 + IB#4.
 */
function buildSynthesisWithAdvisory(): PropertyDefaultsSpecialistOutput {
  return {
    dimensions: [
      {
        key: "eventExpenseRate",
        low: 0.50,
        mid: 0.57,
        high: 0.62,
        conviction: "high",
        reasoning:
          "Mountain-resort boutique comps show event expense at 50–62% with full catering in-house; your 65% is above-range and may signal above-benchmark F&B labor cost or below-market event pricing that LPs will flag.",
        evidenceRefs: [0, 1, 2, 3],
      },
      {
        key: "otherExpenseRate",
        low: 0.52,
        mid: 0.60,
        high: 0.70,
        conviction: "high",
        reasoning: "Other expense rate 52–70% consistent with boutique-luxury ancillary cost structure.",
        evidenceRefs: [0],
      },
      {
        key: "utilitiesVariableSplit",
        low: 0.42,
        mid: 0.55,
        high: 0.68,
        conviction: "moderate",
        reasoning: "Utilities variable split 42–68% per Cornell benchmarks for boutique class.",
        evidenceRefs: [3],
      },
      {
        key: "salesCommissionRate",
        low: 0.04,
        mid: 0.07,
        high: 0.10,
        conviction: "moderate",
        reasoning: "Blended OTA commission 4–10% per Kalibri Labs direct-booking data.",
        evidenceRefs: [4],
      },
    ],
    overallNarrative:
      "Event expense rate runs above comparable boutique-luxury F&B discipline; LP review expected on event cost justification.",
  };
}

/** Fails the collapsed-range check (low === high on first dimension). */
function buildCollapsedRangeSynthesisOutput(): PropertyDefaultsSpecialistOutput {
  return {
    dimensions: [
      {
        key: "eventExpenseRate",
        low: 0.65,
        mid: 0.65,
        high: 0.65,
        conviction: "high",
        reasoning: "Collapsed point estimate — not a range.",
        evidenceRefs: [0],
      },
      {
        key: "otherExpenseRate",
        low: 0.52,
        mid: 0.60,
        high: 0.70,
        conviction: "moderate",
        reasoning: "Other expense rate consistent with boutique-luxury comparables.",
        evidenceRefs: [0],
      },
      {
        key: "utilitiesVariableSplit",
        low: 0.42,
        mid: 0.55,
        high: 0.68,
        conviction: "moderate",
        reasoning: "Utilities variable split reflects Cornell Hotel Sustainability benchmarks.",
        evidenceRefs: [3],
      },
      {
        key: "salesCommissionRate",
        low: 0.04,
        mid: 0.07,
        high: 0.10,
        conviction: "moderate",
        reasoning: "Blended commission per Kalibri Labs direct-booking study.",
        evidenceRefs: [4],
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

function mockStreamObjectSequence(...outputs: PropertyDefaultsSpecialistOutput[]): void {
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
  synthesisOutput: PropertyDefaultsSpecialistOutput,
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

describe("validateSynthesisOutput (property-defaults)", () => {
  it("passes a valid synthesis output", () => {
    const result = validateSynthesisOutput(buildValidSynthesisOutput(), COMPARABLES);
    expect(result.pass).toBe(true);
  });

  it("fails when a dimension key is missing", () => {
    const output = buildValidSynthesisOutput();
    output.dimensions = output.dimensions.filter((d) => d.key !== "salesCommissionRate");
    const result = validateSynthesisOutput(output, COMPARABLES);
    expect(result.pass).toBe(false);
    expect(result.regressReason).toMatch(/salesCommissionRate/);
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
// runPropertyDefaultsSpecialist Phase 2 — Prompt Engineer pre-stage + happy path

describe("runPropertyDefaultsSpecialist Phase 2 — Prompt Engineer pre-stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls generateObject 3 times (PE + quant + market) on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    await runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(streamObject)).toHaveBeenCalledTimes(1);
  });

  it("happy path: meta.promptEngineerRunId is set with property-defaults-p2 prefix", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
    expect(verdict.meta.promptEngineerRunId).toMatch(/^pe-property-defaults-p2-/);
  });

  it("happy path: meta.regressCount === 0", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBe(0);
  });

  it("happy path: cognitiveRunId uses property-defaults-p2 prefix (not hf)", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.cognitiveRunId).toMatch(/^property-defaults-p2-/);
    expect(verdict.meta.cognitiveRunId).not.toMatch(/^property-defaults-p2-hf-/);
  });

  it("PE failure throws Tier1UnavailableError without calling panels or synthesis", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("Gemini Flash quota exceeded"));

    await expect(
      runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
  });

  it("PE failure error message mentions prompt engineer", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("rate limited"));

    const err = await runPropertyDefaultsSpecialist(
      CTX,
      DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS,
      COMPARABLES,
      STUB_DEPS,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(Tier1UnavailableError);
    expect(err.message).toMatch(/prompt engineer/i);
  });

  it("convergence-fail (all-developing quant): streamObject never called, regressCount=0", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
    expect(verdict.meta.regressCount).toBe(0);
    expect(verdict.meta.promptEngineerRunId).toMatch(/^pe-property-defaults-p2-/);
    expect(verdict.meta.cognitiveRunId).toMatch(/^property-defaults-p2-hf-/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runPropertyDefaultsSpecialist Phase 2 — quality checker + bounded regress loop

describe("runPropertyDefaultsSpecialist Phase 2 — quality checker + bounded regress loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("first-pass success: 3 generateObject + 1 streamObject calls", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    await runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    await runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    const verdict = await runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    await runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    const verdict = await runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS);

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
      runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runPropertyDefaultsSpecialist Phase 2 — Intelligence Bar invariants
//
// Covers IB#1 (cognitiveRunId), IB#3 (≥3 evidence per non-ok), IB#4 (tabular
// comp evidence), IB#6 (range on non-ok numeric), IB#7 (vendor breadth ≥2),
// IB#8 (promptEngineerRunId), IB#9 (regressCount tracked).
// IB#2 and IB#5 are confirmed at PR-review time (not statically assertable).

describe("runPropertyDefaultsSpecialist Phase 2 — Intelligence Bar invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("IB#1: meta.cognitiveRunId is non-null on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.cognitiveRunId).toBeTruthy();
  });

  it("IB#7: meta.vendorsUsed contains ≥ 2 distinct vendors on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.vendorsUsed).toBeDefined();
    expect(verdict.meta.vendorsUsed!.length).toBeGreaterThanOrEqual(2);
  });

  it("IB#7: honest-fail path still sets vendorsUsed ≥ 2", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.vendorsUsed).toBeDefined();
    expect(verdict.meta.vendorsUsed!.length).toBeGreaterThanOrEqual(2);
  });

  it("IB#6 + IB#3 + IB#4: advisory dimension carries range, ≥3 evidence, and ≥1 PropertyDefaults comp entry", async () => {
    // CTX.inputs.eventExpenseRate=0.65; synthesis range high=0.62 → user above range → advisory
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildSynthesisWithAdvisory());

    const verdict = await runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS);

    const advisoryDim = verdict.dimensions.find((d) => d.severity === "advisory");
    expect(advisoryDim).toBeDefined();

    // IB#6 — non-ok numeric dimension carries a non-null range
    expect(advisoryDim!.range).not.toBeNull();

    // IB#3 — ≥3 evidence entries per non-ok dimension
    expect(advisoryDim!.evidence.length).toBeGreaterThanOrEqual(3);

    // IB#4 — tabular PropertyDefaults comp evidence present (source prefixed "PropertyDefaults:")
    const compEvidence = advisoryDim!.evidence.filter((e) => e.source.startsWith("PropertyDefaults:"));
    expect(compEvidence.length).toBeGreaterThanOrEqual(1);
  });

  it("IB#8: meta.promptEngineerRunId is set on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
  });

  it("IB#9: meta.regressCount is tracked (=0 on first-pass success)", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runPropertyDefaultsSpecialist(CTX, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBeDefined();
    expect(verdict.meta.regressCount).toBe(0);
  });
});
