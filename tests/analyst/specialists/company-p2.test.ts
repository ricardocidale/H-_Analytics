/**
 * Phase 2 tests for `runCompanySpecialist` — N+1 pipeline + Prompt Engineer
 * pre-stage + bounded regress loop. Mirror of the Overhead P7-B IB bench,
 * adapted to Company's 4 fraction dimensions (baseManagementFee,
 * incentiveManagementFee, companyTaxRate, costOfEquity — all % as fractions).
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
 *   - cognitiveRunId / promptEngineerRunId prefixes match company-p2 convention
 *   - meta.vendorsUsed contains ≥2 distinct vendors on happy + honest-fail
 *   - non-ok numeric dimension carries range + ≥3 evidence + ≥1 Company comp entry
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
  runCompanySpecialist,
  Tier1UnavailableError,
} from "../../../server/ai/specialists/mgmt-co-company-runner";
import type { CompanySpecialistOutput } from "../../../server/ai/specialists/mgmt-co-company-output-schema";
import type { QuantPanelOutput } from "../../../server/ai/specialists/mgmt-co-company-quant-panel-schema";
import type { MarketPanelOutput } from "../../../server/ai/specialists/mgmt-co-company-market-panel-schema";
import type { CompanyPromptInputContext } from "../../../server/ai/specialists/mgmt-co-company-prompt-input-builder";
import { getCannedCompanyComparables } from "../../../server/ai/specialists/mgmt-co-company-orchestrator-adapter";
import { validateSynthesisOutput } from "../../../server/ai/specialists/mgmt-co-company-synthesis-validator";
import {
  COMPANY_DIMENSION_KEYS,
  type CompanyDimensionKey,
} from "../../../server/ai/specialists/mgmt-co-company-prompt-input-builder";
import { DEFAULT_COMPANY_BENCHMARKS } from "@shared/constants-company-benchmarks";

// ────────────────────────────────────────────────────────────────────────────
// Fixtures

const FIXED_NOW = new Date("2026-04-30T15:00:00Z");

const COMPARABLES = getCannedCompanyComparables();

/**
 * Default values chosen to land within DEFAULT_COMPANY_BENCHMARKS bands so
 * the happy-path verdict has no advisory dimensions. All values are fractions.
 */
const DEFAULT_INPUTS: Record<CompanyDimensionKey, number> = {
  baseManagementFee: 0.08,
  incentiveManagementFee: 0.10,
  companyTaxRate: 0.26,
  costOfEquity: 0.18,
};

const CTX: CompanyPromptInputContext = {
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
      "Boutique-luxury Highline-stage operator at 6 properties — calibrate fee ranges to reflect both founder-restraint and institutional premium postures.",
    marketAddendum:
      "LP scrutiny flags should address base-fee premium vs. branded alternatives and incentive-fee alignment signals.",
    rationale: "Standard Highline-stage operator — modest addenda needed.",
  };
}

/**
 * Quant panel output. Ranges align with DEFAULT_COMPANY_BENCHMARKS bands.
 * All values are fractions (0.06 = 6%). Pass `conviction` to drive
 * convergence-vs-honest-fail behavior.
 */
function buildQuantOutput(conviction: "high" | "moderate" | "developing"): QuantPanelOutput {
  const bands: Record<CompanyDimensionKey, { low: number; mid: number; high: number }> = {
    baseManagementFee:      { low: 0.06, mid: 0.08, high: 0.10 },
    incentiveManagementFee: { low: 0.08, mid: 0.10, high: 0.12 },
    companyTaxRate:         { low: 0.21, mid: 0.26, high: 0.30 },
    costOfEquity:           { low: 0.15, mid: 0.18, high: 0.22 },
  };
  return {
    dimensions: COMPANY_DIMENSION_KEYS.map((key) => ({
      key,
      ...bands[key],
      conviction,
      reasoning: `Quant panel: ${key} grounded in ManCo financial comparable set.`,
      evidenceRefs: [0],
    })),
  };
}

function buildMarketOutput(): MarketPanelOutput {
  return {
    dimensions: COMPANY_DIMENSION_KEYS.map((key) => ({
      key,
      marketSentiment: "neutral" as const,
      lpRiskFlags: [],
      proposedBias: "hold" as const,
      reasoning: `Market panel: ${key} — LP-perception sentiment neutral for this operator profile.`,
    })),
    overallMarketContext:
      "Fee structure and financial defaults posture is consistent for this boutique-luxury operator stage.",
  };
}

/** Passes all 4 quality checks in validateSynthesisOutput. */
function buildValidSynthesisOutput(): CompanySpecialistOutput {
  return {
    dimensions: [
      {
        key: "baseManagementFee",
        low: 0.065,
        mid: 0.08,
        high: 0.095,
        conviction: "high",
        reasoning:
          "Base fee 6.5–9.5% supported by boutique-luxury ManCo comparables; your 8.0% lands at midpoint of founder-to-expansion range.",
        evidenceRefs: [0, 3],
      },
      {
        key: "incentiveManagementFee",
        low: 0.09,
        mid: 0.10,
        high: 0.115,
        conviction: "moderate",
        reasoning:
          "Incentive fee 9–11.5% consistent with boutique-luxury operator alignment standards and GOP-sharing norms.",
        evidenceRefs: [0, 7],
      },
      {
        key: "companyTaxRate",
        low: 0.22,
        mid: 0.26,
        high: 0.29,
        conviction: "moderate",
        reasoning:
          "Effective tax rate 22–29% reflects combined federal + state for US boutique-luxury operators; midpoint at 26%.",
        evidenceRefs: [0, 7],
      },
      {
        key: "costOfEquity",
        low: 0.15,
        mid: 0.18,
        high: 0.20,
        conviction: "moderate",
        reasoning:
          "Cost of equity 15–20% reflects WACC Re benchmarks for boutique-luxury operators per KPMG WACC monitor.",
        evidenceRefs: [3, 4],
      },
    ],
    overallNarrative:
      "Fee structure and financial defaults are defensible for the operator's stage and vertical.",
  };
}

/**
 * Synthesis output where baseManagementFee range high=0.065 (below user's
 * 0.08) → user value above range → "advisory" severity + "above-range" intent.
 * evidenceRefs [0,1,2,3] covers ≥3 distinct comparable indices → IB#3 + IB#4.
 */
function buildSynthesisWithAdvisory(): CompanySpecialistOutput {
  return {
    dimensions: [
      {
        key: "baseManagementFee",
        low: 0.04,
        mid: 0.055,
        high: 0.065,
        conviction: "high",
        reasoning:
          "Founder-stage boutique-luxury operators in this comp set hold base fee at 4–6.5%; your 8% is above range and requires a branded-alternative value-proposition justification for LP review.",
        evidenceRefs: [0, 1, 2, 3],
      },
      {
        key: "incentiveManagementFee",
        low: 0.09,
        mid: 0.10,
        high: 0.115,
        conviction: "high",
        reasoning: "Incentive fee 9–11.5% consistent with boutique-luxury operator comparables.",
        evidenceRefs: [0],
      },
      {
        key: "companyTaxRate",
        low: 0.22,
        mid: 0.26,
        high: 0.29,
        conviction: "moderate",
        reasoning: "Tax rate 22–29% reflects US combined federal + state benchmarks.",
        evidenceRefs: [3],
      },
      {
        key: "costOfEquity",
        low: 0.15,
        mid: 0.18,
        high: 0.20,
        conviction: "moderate",
        reasoning: "Cost of equity 15–20% per KPMG WACC monitor for boutique-luxury operators.",
        evidenceRefs: [4],
      },
    ],
    overallNarrative:
      "Base fee runs above comparable founder-stage discipline; LP review expected on value-proposition justification.",
  };
}

/** Fails the collapsed-range check (low === high on first dimension). */
function buildCollapsedRangeSynthesisOutput(): CompanySpecialistOutput {
  return {
    dimensions: [
      {
        key: "baseManagementFee",
        low: 0.08,
        mid: 0.08,
        high: 0.08,
        conviction: "high",
        reasoning: "Collapsed point estimate — not a range.",
        evidenceRefs: [0],
      },
      {
        key: "incentiveManagementFee",
        low: 0.09,
        mid: 0.10,
        high: 0.115,
        conviction: "moderate",
        reasoning: "Incentive fee consistent with comparables.",
        evidenceRefs: [0],
      },
      {
        key: "companyTaxRate",
        low: 0.22,
        mid: 0.26,
        high: 0.29,
        conviction: "moderate",
        reasoning: "Tax rate reflects US combined federal + state benchmarks.",
        evidenceRefs: [3],
      },
      {
        key: "costOfEquity",
        low: 0.15,
        mid: 0.18,
        high: 0.20,
        conviction: "moderate",
        reasoning: "Cost of equity per KPMG WACC monitor.",
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

function mockStreamObjectSequence(...outputs: CompanySpecialistOutput[]): void {
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
  synthesisOutput: CompanySpecialistOutput,
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

describe("validateSynthesisOutput (company)", () => {
  it("passes a valid synthesis output", () => {
    const result = validateSynthesisOutput(buildValidSynthesisOutput(), COMPARABLES);
    expect(result.pass).toBe(true);
  });

  it("fails when a dimension key is missing", () => {
    const output = buildValidSynthesisOutput();
    output.dimensions = output.dimensions.filter((d) => d.key !== "costOfEquity");
    const result = validateSynthesisOutput(output, COMPARABLES);
    expect(result.pass).toBe(false);
    expect(result.regressReason).toMatch(/costOfEquity/);
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
// runCompanySpecialist Phase 2 — Prompt Engineer pre-stage + happy path

describe("runCompanySpecialist Phase 2 — Prompt Engineer pre-stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls generateObject 3 times (PE + quant + market) on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    await runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(streamObject)).toHaveBeenCalledTimes(1);
  });

  it("happy path: meta.promptEngineerRunId is set with company-p2 prefix", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
    expect(verdict.meta.promptEngineerRunId).toMatch(/^pe-company-p2-/);
  });

  it("happy path: meta.regressCount === 0", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBe(0);
  });

  it("happy path: cognitiveRunId uses company-p2 prefix", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.cognitiveRunId).toMatch(/^company-p2-/);
    expect(verdict.meta.cognitiveRunId).not.toMatch(/^company-p2-hf-/);
  });

  it("PE failure throws Tier1UnavailableError without calling panels or synthesis", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("Gemini Flash quota exceeded"));

    await expect(
      runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
  });

  it("PE failure error message mentions prompt engineer", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("rate limited"));

    const err = await runCompanySpecialist(
      CTX,
      DEFAULT_COMPANY_BENCHMARKS,
      COMPARABLES,
      STUB_DEPS,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(Tier1UnavailableError);
    expect(err.message).toMatch(/prompt engineer/i);
  });

  it("convergence-fail (all-developing quant): streamObject never called, regressCount=0", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(vi.mocked(streamObject)).not.toHaveBeenCalled();
    expect(verdict.meta.regressCount).toBe(0);
    expect(verdict.meta.promptEngineerRunId).toMatch(/^pe-company-p2-/);
    expect(verdict.meta.cognitiveRunId).toMatch(/^company-p2-hf-/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runCompanySpecialist Phase 2 — quality checker + bounded regress loop

describe("runCompanySpecialist Phase 2 — quality checker + bounded regress loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("first-pass success: 3 generateObject + 1 streamObject calls", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    await runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    await runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    const verdict = await runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    await runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS);

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

    const verdict = await runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS);

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
      runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS),
    ).rejects.toBeInstanceOf(Tier1UnavailableError);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runCompanySpecialist Phase 2 — Intelligence Bar invariants
//
// Covers IB#1 (cognitiveRunId), IB#3 (≥3 evidence per non-ok), IB#4 (tabular
// comp evidence), IB#6 (range on non-ok numeric), IB#7 (vendor breadth ≥2),
// IB#8 (promptEngineerRunId), IB#9 (regressCount tracked).
// IB#2 and IB#5 are confirmed at PR-review time (not statically assertable).

describe("runCompanySpecialist Phase 2 — Intelligence Bar invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("IB#1: meta.cognitiveRunId is non-null on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.cognitiveRunId).toBeTruthy();
  });

  it("IB#7: meta.vendorsUsed contains ≥ 2 distinct vendors on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.vendorsUsed).toBeDefined();
    expect(verdict.meta.vendorsUsed!.length).toBeGreaterThanOrEqual(2);
  });

  it("IB#7: honest-fail path still sets vendorsUsed ≥ 2", async () => {
    mockAllCallsHonestFail(buildQuantOutput("developing"), buildMarketOutput());

    const verdict = await runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.vendorsUsed).toBeDefined();
    expect(verdict.meta.vendorsUsed!.length).toBeGreaterThanOrEqual(2);
  });

  it("IB#6 + IB#3 + IB#4: advisory dimension carries range, ≥3 evidence, and ≥1 Company comp entry", async () => {
    // CTX.inputs.baseManagementFee=0.08; synthesis range high=0.065 → user above range → advisory
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildSynthesisWithAdvisory());

    const verdict = await runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS);

    const advisoryDim = verdict.dimensions.find((d) => d.severity === "advisory");
    expect(advisoryDim).toBeDefined();

    // IB#6 — non-ok numeric dimension carries a non-null range
    expect(advisoryDim!.range).not.toBeNull();

    // IB#3 — ≥3 evidence entries per non-ok dimension
    expect(advisoryDim!.evidence.length).toBeGreaterThanOrEqual(3);

    // IB#4 — tabular Company comp evidence present (source prefixed "Company:")
    const compEvidence = advisoryDim!.evidence.filter((e) => e.source.startsWith("Company:"));
    expect(compEvidence.length).toBeGreaterThanOrEqual(1);
  });

  it("IB#8: meta.promptEngineerRunId is set on happy path", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.promptEngineerRunId).toBeTruthy();
  });

  it("IB#9: meta.regressCount is tracked (=0 on first-pass success)", async () => {
    mockAllCalls(buildQuantOutput("high"), buildMarketOutput(), buildValidSynthesisOutput());

    const verdict = await runCompanySpecialist(CTX, DEFAULT_COMPANY_BENCHMARKS, COMPARABLES, STUB_DEPS);

    expect(verdict.meta.regressCount).toBeDefined();
    expect(verdict.meta.regressCount).toBe(0);
  });
});
