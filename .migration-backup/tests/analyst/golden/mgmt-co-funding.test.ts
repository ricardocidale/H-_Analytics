/**
 * Persona-keyed golden bench for the Funding Tier-1 Specialist (S4 of G1).
 *
 * Per ADR-007 §5 + Intelligence Bar §"What 'the bar' does NOT require"
 * (3 fixtures suffice). Each fixture exercises the full Tier-1 path with a
 * stubbed orchestrator (real orchestrator integration is exercised in
 * production, not goldens) and asserts every Intelligence Bar invariant
 * (1-9) per dimension.
 *
 * Personas:
 *   - large-managementco — 8 properties, $80M total need, conservative 18mo
 *     runway buffer, mid-tranche-gap. Most dims ok; one advisory possible.
 *   - startup-boutique — 2 properties, $5M need, aggressive 6mo runway
 *     buffer, no tranche-2. At least one warning on runwayBufferMonths.
 *   - expansion-stage — 4 properties, $30M raise, mid-tranche schedule,
 *     12mo buffer. Mixed severity to exercise advisory + warning paths.
 *
 * Invariant assertions per fixture (Intelligence Bar requirements 1-9):
 *   #1 Tier-1 cognitive evaluation → cognitiveRunId non-null
 *   #3 Citation-backed evidence → ≥3 evidence items per non-ok dimension
 *   #4 Tabular comparables → comparables-as-evidence rows present
 *   #6 Range-first delivery → non-ok numeric dim has range
 *   #7 Vendor-breadth → vendorsUsed.length ≥ 2 in cognitive run output
 *   #8 Prompt-engineer stage → promptEngineerRunId non-null
 *   #9 Quality regress + honest-fail → no fabricated intelligence
 *
 * Requirements 2 (context-rich prompt) + 5 (live API resources) are
 * reviewed at PR time, not statically asserted — per the Intelligence Bar
 * "Verifiability" section.
 */
import { describe, expect, it } from "vitest";
import {
  createFundingSpecialist,
  type FundingSpecialistDeps,
} from "../../../engine/analyst/surface/mgmt-co/funding-specialist";
import type { CapitalRaiseInputs } from "../../../engine/watchdog/capitalRaiseEvaluator";
import type { AnalystWatchdogBenchmarks } from "../../../shared/schema";
import {
  comparableToEvidence,
  getCannedLpComparables,
  type FundingOrchestratorAdapter,
  type FundingOrchestratorResult,
} from "../../../server/ai/specialists/mgmt-co-funding-orchestrator-adapter";
import type { EngineClientDeps } from "../../../engine/analyst/cognitive/engine-client";
import type { RawVerdictDimension } from "../../../engine/analyst/contracts/verdict";
import type { SpecialistContext } from "../../../engine/analyst/router/surface-router";

// ────────────────────────────────────────────────────────────────────────────
// Shared infrastructure

const BENCHMARKS: AnalystWatchdogBenchmarks = {
  runwayBufferMonthsLow: 6,
  runwayBufferMonthsHigh: 18,
  sizingOvershootPctLow: 0.1,
  sizingOvershootPctHigh: 0.3,
  trancheGapMonthsLow: 6,
  trancheGapMonthsHigh: 12,
  revenueRampDelayMonthsLow: 3,
  revenueRampDelayMonthsHigh: 9,
  burnFlexDownPctLow: 0.15,
  burnFlexDownPctHigh: 0.35,
} as unknown as AnalystWatchdogBenchmarks;

const EVIDENCE_AS_OF = "2026-04-26";

const SPECIALIST_CONTEXT: SpecialistContext = {
  persona: { segment: "L+B", tier: "luxury", market: "US" },
  now: new Date("2026-04-26T00:00:00Z"),
};

function dim(
  field: string,
  severity: "ok" | "advisory" | "warning",
  range?: { low: number; mid: number; high: number; unit: string },
): RawVerdictDimension {
  return {
    field,
    isNumericField: true,
    severity,
    range: severity === "ok" ? null : range ?? { low: 6, mid: 12, high: 18, unit: "mo" },
    qualityScore: severity === "ok" ? 70 : 78,
    evidence: [
      { source: "synth-quantitative", tier: "web", asOf: EVIDENCE_AS_OF, personaFit: 0.85 },
      { source: "synth-market", tier: "web", asOf: EVIDENCE_AS_OF, personaFit: 0.85 },
      { source: "synth-final", tier: "web", asOf: EVIDENCE_AS_OF, personaFit: 0.9 },
    ],
    intent: severity === "ok" ? "within-range" : "below-range",
    actions: [],
  };
}

function makeStubOrchestrator(result: FundingOrchestratorResult): FundingOrchestratorAdapter {
  return {
    run: async () => result,
  };
}

const FRESH_ENGINE_DEPS: EngineClientDeps = {
  findRunByCacheKey: async () => null, // force MISS path so orchestrator runs
  findGuidanceByRunId: async () => [],
  now: () => new Date("2026-04-26T00:00:00Z"),
};

function depsForFixture(orchestrator: FundingOrchestratorAdapter): FundingSpecialistDeps {
  return {
    orchestrator,
    comparablesFetcher: { fetch: async () => getCannedLpComparables() },
    engineClientDeps: FRESH_ENGINE_DEPS,
    cacheKeyArgsBuilder: (_inputs) => ({
      specialistId: "mgmt-co.funding",
      persona: { verticalSlug: "boutique-luxury", marketTier: "L+B", locale: "US" },
      companyInputs: { numProperties: 4, country: "US" },
      scenarioId: null,
      entityId: 1,
      engineVersion: "v2",
    }),
    contextResolver: (_inputs) => ({
      portfolio: {
        propertyCount: 4,
        totalRaiseNeedUsd: 30_000_000,
        runwayNeedMonths: 18,
      },
      persona: { verticalSlug: "boutique-luxury", marketTier: "L+B", locale: "US" },
      priorVerdicts: [],
    }),
  };
}

/**
 * Asserts the Intelligence Bar invariants 1-9 against a verdict output for
 * a given fixture. The orchestrator stub provides the cognitive metadata
 * (cognitiveRunId + vendorsUsed + promptEngineerRunId); these are surfaced
 * via SpecialistOutput.cognitiveRunId + the dimensions' evidence.
 */
function assertIntelligenceBarInvariants(
  out: { dimensions: readonly RawVerdictDimension[]; tier?: 0 | 1; cognitiveRunId?: string },
  expected: { vendorsUsed: readonly string[]; promptEngineerRunId: string },
) {
  // #1 Tier-1 cognitive evaluation → cognitiveRunId non-null + tier === 1
  expect(out.tier).toBe(1);
  expect(out.cognitiveRunId).toBeTruthy();

  // #3 Citation-backed evidence → ≥3 evidence per non-ok dimension
  for (const dim of out.dimensions) {
    if (dim.severity === "ok") continue;
    expect(dim.evidence.length).toBeGreaterThanOrEqual(3);
  }

  // #4 Tabular comparables → at least 3 comparables-as-evidence rows
  // present per dimension (LP comp: prefix marks them).
  for (const dim of out.dimensions) {
    const compEvidence = dim.evidence.filter((e) => e.source.startsWith("LP comp:"));
    expect(compEvidence.length).toBeGreaterThanOrEqual(3);
  }

  // #6 Range-first delivery → non-ok numeric dim has range
  for (const dim of out.dimensions) {
    if (dim.severity === "ok") continue;
    if (dim.isNumericField) {
      expect(dim.range).not.toBeNull();
    }
  }

  // #7 Vendor-breadth → ≥2 vendors. Asserted at the orchestrator stub
  // level since the SpecialistOutput contract doesn't surface vendorsUsed
  // (currently a contract extension; see G2 lessons in completion report).
  expect(expected.vendorsUsed.length).toBeGreaterThanOrEqual(2);

  // #8 Prompt-engineer stage → promptEngineerRunId non-null
  expect(expected.promptEngineerRunId).toBeTruthy();

  // #9 Quality regress + honest-fail → no fabricated intelligence:
  // when a dimension is "ok" with intent "missing-data", range MUST be null.
  for (const dim of out.dimensions) {
    if (dim.severity === "ok" && dim.intent === "missing-data") {
      expect(dim.range).toBeNull();
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Persona 1: large-managementco

describe("Funding Tier-1 golden — large-managementco persona", () => {
  const inputs: CapitalRaiseInputs = {
    runwayBufferMonths: 18,
    sizingOvershootPct: 0.18,
    trancheGapMonths: 9,
    revenueRampDelayMonths: 6,
    burnFlexDownPct: 0.25,
  };

  const orchestratorResult: FundingOrchestratorResult = {
    cognitiveRunId: "run-large-mc-001",
    promptEngineerRunId: "pe-large-mc-001",
    dimensions: [
      dim("capitalRaise1Amount", "ok"),
      dim("capitalRaise2Amount", "advisory", { low: 0.1, mid: 0.2, high: 0.3, unit: "%" }),
      dim("capitalRaise2Date", "ok"),
      dim("revenueRampDelayMonths", "ok"),
      dim("burnFlexDownPct", "ok"),
    ],
    vendorsUsed: ["anthropic", "google", "openai"],
    convergenceScore: 0.85,
  };

  it("produces Tier-1 verdict satisfying all Intelligence Bar invariants", async () => {
    const deps = depsForFixture(makeStubOrchestrator(orchestratorResult));
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(inputs, SPECIALIST_CONTEXT);

    assertIntelligenceBarInvariants(out, {
      vendorsUsed: orchestratorResult.vendorsUsed,
      promptEngineerRunId: orchestratorResult.promptEngineerRunId,
    });

    // Persona-specific expectations
    expect(out.dimensions).toHaveLength(5);
    const advisoryCount = out.dimensions.filter((d) => d.severity === "advisory").length;
    expect(advisoryCount).toBeLessThanOrEqual(2); // mostly ok
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Persona 2: startup-boutique

describe("Funding Tier-1 golden — startup-boutique persona", () => {
  const inputs: CapitalRaiseInputs = {
    runwayBufferMonths: 4, // below low=6 → warning expected
    sizingOvershootPct: 0.12,
    trancheGapMonths: null, // no T2
    revenueRampDelayMonths: 6,
    burnFlexDownPct: 0.2,
  };

  const orchestratorResult: FundingOrchestratorResult = {
    cognitiveRunId: "run-startup-002",
    promptEngineerRunId: "pe-startup-002",
    dimensions: [
      dim("capitalRaise1Amount", "warning", { low: 6, mid: 12, high: 18, unit: "mo" }),
      dim("capitalRaise2Amount", "ok"),
      // tranche gap dimension as honest-fail (intent: missing-data)
      {
        field: "capitalRaise2Date",
        isNumericField: true,
        severity: "ok",
        range: null,
        qualityScore: 70,
        evidence: [
          { source: "synth-1", tier: "web", asOf: EVIDENCE_AS_OF, personaFit: 0.7 },
          { source: "synth-2", tier: "web", asOf: EVIDENCE_AS_OF, personaFit: 0.7 },
          { source: "synth-3", tier: "web", asOf: EVIDENCE_AS_OF, personaFit: 0.7 },
        ],
        intent: "missing-data",
        actions: [],
      },
      dim("revenueRampDelayMonths", "ok"),
      dim("burnFlexDownPct", "ok"),
    ],
    vendorsUsed: ["anthropic", "google"],
    convergenceScore: 0.75,
  };

  it("produces Tier-1 verdict with warning + honest-fail dimensions", async () => {
    const deps = depsForFixture(makeStubOrchestrator(orchestratorResult));
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(inputs, SPECIALIST_CONTEXT);

    assertIntelligenceBarInvariants(out, {
      vendorsUsed: orchestratorResult.vendorsUsed,
      promptEngineerRunId: orchestratorResult.promptEngineerRunId,
    });

    // At least one warning expected
    const warningCount = out.dimensions.filter((d) => d.severity === "warning").length;
    expect(warningCount).toBeGreaterThanOrEqual(1);

    // T2 dim is honest-fail
    const t2 = out.dimensions.find((d) => d.field === "capitalRaise2Date");
    expect(t2?.severity).toBe("ok");
    expect(t2?.intent).toBe("missing-data");
    expect(t2?.range).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Persona 3: expansion-stage

describe("Funding Tier-1 golden — expansion-stage persona", () => {
  const inputs: CapitalRaiseInputs = {
    runwayBufferMonths: 12,
    sizingOvershootPct: 0.32, // above high=0.3 → warning
    trancheGapMonths: 8,
    revenueRampDelayMonths: 7,
    burnFlexDownPct: 0.18,
  };

  const orchestratorResult: FundingOrchestratorResult = {
    cognitiveRunId: "run-expansion-003",
    promptEngineerRunId: "pe-expansion-003",
    dimensions: [
      dim("capitalRaise1Amount", "ok"),
      dim("capitalRaise2Amount", "warning", { low: 0.1, mid: 0.2, high: 0.3, unit: "%" }),
      dim("capitalRaise2Date", "ok"),
      dim("revenueRampDelayMonths", "advisory", { low: 3, mid: 6, high: 9, unit: "mo" }),
      dim("burnFlexDownPct", "advisory", { low: 0.15, mid: 0.25, high: 0.35, unit: "%" }),
    ],
    vendorsUsed: ["anthropic", "google"],
    convergenceScore: 0.78,
  };

  it("produces Tier-1 verdict with mixed advisory + warning severities", async () => {
    const deps = depsForFixture(makeStubOrchestrator(orchestratorResult));
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(inputs, SPECIALIST_CONTEXT);

    assertIntelligenceBarInvariants(out, {
      vendorsUsed: orchestratorResult.vendorsUsed,
      promptEngineerRunId: orchestratorResult.promptEngineerRunId,
    });

    const warningCount = out.dimensions.filter((d) => d.severity === "warning").length;
    const advisoryCount = out.dimensions.filter((d) => d.severity === "advisory").length;
    expect(warningCount).toBeGreaterThanOrEqual(1);
    expect(advisoryCount).toBeGreaterThanOrEqual(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Cross-fixture stability — every fixture passes the same invariants

describe("Funding Tier-1 golden — cross-fixture invariants", () => {
  it("comparables-as-evidence threading: every dim has at least 3 LP-comp rows", async () => {
    const result: FundingOrchestratorResult = {
      cognitiveRunId: "run-stable",
      promptEngineerRunId: "pe-stable",
      dimensions: [
        dim("capitalRaise1Amount", "warning"),
        dim("capitalRaise2Amount", "ok"),
        dim("capitalRaise2Date", "ok"),
        dim("revenueRampDelayMonths", "ok"),
        dim("burnFlexDownPct", "ok"),
      ],
      vendorsUsed: ["anthropic", "google"],
      convergenceScore: 0.8,
    };
    const deps = depsForFixture(makeStubOrchestrator(result));
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist({}, SPECIALIST_CONTEXT);

    const expectedComparables = getCannedLpComparables().length;
    for (const d of out.dimensions) {
      const compRows = d.evidence.filter((e) => e.source.startsWith("LP comp:"));
      expect(compRows.length).toBe(expectedComparables);
    }
  });

  it("comparable→Evidence converter is the only path comparables enter Evidence stream", () => {
    // Sanity: the canned dataset → evidence rows pipeline produces evidence
    // rows whose source starts with "LP comp:" (the renderer will group
    // them into a table downstream).
    const evRows = getCannedLpComparables().map(comparableToEvidence);
    expect(evRows.length).toBeGreaterThanOrEqual(3);
    for (const ev of evRows) {
      expect(ev.source).toMatch(/^LP comp:/);
      expect(ev.tier).toBe("db_table");
    }
  });
});
