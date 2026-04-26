/**
 * Tests for the Funding Specialist's Tier-1 cognitive path (S2 + S5 of G1).
 *
 * Coverage map (≥10 cases per S2 acceptance + 2 added by S5):
 *   - Tier-0 backward compat: deps undefined → existing Phase-3b behavior
 *   - Tier-1 cache HIT path: reconstructed dims + cognitiveRunId surface
 *   - Tier-1 cache MISS happy path: orchestrator runs, comparables fetched,
 *     merged dims returned with tier: 1
 *   - Bounded regress: convergence below threshold triggers regress; passes
 *     after regress 1
 *   - Bounded regress exhaustion: 3 failed attempts → honest-fail
 *     (severity: "ok", intent: "missing-data", range: null)
 *   - Comparables fetcher throw: continues without comparables (best-effort)
 *   - Orchestrator throw: catch → Tier-0 fallback (tier: 0)
 *   - Cache lookup throw: catch → Tier-0 fallback
 *   - Context resolver throw: catch → Tier-0 fallback
 *   - Comparables threading: each comparable becomes one Evidence row per dim
 *   - Quality check: non-ok dim with <3 evidence → regress
 *   - Quality check: non-ok dim with sub-floor qualityScore → regress
 *   - S5: superseded cache row → MISS path → orchestrator invoked normally
 *   - S5: explicit fallback test (orchestrator throws → Tier-0 with stable dims)
 */
import { describe, expect, it } from "vitest";
import { CONVICTION_FLOOR } from "@shared/analyst-conviction";
import {
  createFundingSpecialist,
  type FundingSpecialistDeps,
} from "../../../engine/analyst/surface/mgmt-co/funding-specialist";
import type { CapitalRaiseInputs } from "../../../engine/watchdog/capitalRaiseEvaluator";
import type { AnalystWatchdogBenchmarks } from "../../../shared/schema";
import type {
  ComparablesFetcher,
  ComparableRow,
  FundingOrchestratorAdapter,
  FundingOrchestratorResult,
  OrchestratorRunOptions,
} from "../../../server/ai/specialists/mgmt-co-funding-orchestrator-adapter";
import { getCannedLpComparables } from "../../../server/ai/specialists/mgmt-co-funding-orchestrator-adapter";
import type { EngineClientDeps, ResearchRunSlim, GuidanceSlim } from "../../../engine/analyst/cognitive/engine-client";
import type { RawVerdictDimension } from "../../../engine/analyst/contracts/verdict";
import type { SpecialistContext } from "../../../engine/analyst/router/surface-router";

// ────────────────────────────────────────────────────────────────────────────
// Fixtures

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

const HEALTHY_INPUTS: CapitalRaiseInputs = {
  runwayBufferMonths: 12,
  sizingOvershootPct: 0.2,
  trancheGapMonths: 9,
  revenueRampDelayMonths: 6,
  burnFlexDownPct: 0.25,
};

const STRESSED_INPUTS: CapitalRaiseInputs = {
  runwayBufferMonths: 3, // below low → "below-range"
  sizingOvershootPct: 0.05, // below low
  trancheGapMonths: 24, // above high → would alert
  revenueRampDelayMonths: 6,
  burnFlexDownPct: 0.25,
};

const PERSONA = {
  verticalSlug: "wellness",
  marketTier: "L+B",
  locale: "US",
};

const CONTEXT: SpecialistContext = {
  persona: { segment: "L+B", tier: "luxury", market: "US" },
  now: new Date("2026-04-26T00:00:00Z"),
};

const EVIDENCE_AS_OF = "2026-04-26";

// ────────────────────────────────────────────────────────────────────────────
// Stub builders

function makeDimension(field: string, severity: "ok" | "advisory" | "warning"): RawVerdictDimension {
  return {
    field,
    isNumericField: true,
    severity,
    range: severity === "ok" ? null : { low: 6, mid: 12, high: 18, unit: "mo" },
    qualityScore: severity === "ok" ? 70 : 78,
    evidence: [
      { source: "synth-1", tier: "web", asOf: EVIDENCE_AS_OF, personaFit: 0.8 },
      { source: "synth-2", tier: "web", asOf: EVIDENCE_AS_OF, personaFit: 0.8 },
      { source: "synth-3", tier: "web", asOf: EVIDENCE_AS_OF, personaFit: 0.8 },
    ],
    intent: severity === "ok" ? "within-range" : "below-range",
    actions: [],
  };
}

const PASSING_RESULT: FundingOrchestratorResult = {
  cognitiveRunId: "run-123",
  promptEngineerRunId: "pe-456",
  dimensions: [
    makeDimension("capitalRaise1Amount", "warning"),
    makeDimension("capitalRaise2Amount", "advisory"),
    makeDimension("capitalRaise2Date", "ok"),
    makeDimension("revenueRampDelayMonths", "ok"),
    makeDimension("burnFlexDownPct", "ok"),
  ],
  vendorsUsed: ["anthropic", "google"],
  convergenceScore: 0.82,
};

function makeOrchestrator(
  results: readonly FundingOrchestratorResult[] | (() => Promise<FundingOrchestratorResult>),
): FundingOrchestratorAdapter {
  if (typeof results === "function") {
    return { run: results } as FundingOrchestratorAdapter;
  }
  let i = 0;
  return {
    run: async (_input, _opts: OrchestratorRunOptions) => {
      const r = results[Math.min(i, results.length - 1)];
      i++;
      return r;
    },
  };
}

function makeComparablesFetcher(
  rows: readonly ComparableRow[] | (() => Promise<readonly ComparableRow[]>),
): ComparablesFetcher {
  if (typeof rows === "function") {
    return { fetch: rows };
  }
  return { fetch: async () => rows };
}

function makeEngineClientDeps(opts: {
  hit?: boolean;
  superseded?: boolean;
  throwOnLookup?: boolean;
}): EngineClientDeps {
  return {
    findRunByCacheKey: async () => {
      if (opts.throwOnLookup) throw new Error("db down");
      if (opts.hit) {
        return {
          id: 99,
          cacheKey: "abc",
          cacheInputsHash: null,
          status: "complete",
          completedAt: new Date("2026-04-25T12:00:00Z"),
          modelPrimary: "claude-opus-4-7",
          tier: 1,
        } satisfies ResearchRunSlim;
      }
      return null;
    },
    findGuidanceByRunId: async () => {
      if (opts.superseded) {
        return [
          {
            assumptionKey: "runwayBufferMonths",
            valueLow: 6,
            valueMid: 12,
            valueHigh: 18,
            confidence: "high",
            sourceName: "comp-set",
            sourceDate: EVIDENCE_AS_OF,
            reasoning: "comp set says 12mo",
            supersededAt: new Date("2026-04-26T00:00:00Z"),
          } satisfies GuidanceSlim,
        ];
      }
      // Fresh guidance for cache HIT path
      return [
        {
          assumptionKey: "runwayBufferMonths",
          valueLow: 6,
          valueMid: 12,
          valueHigh: 18,
          confidence: "high",
          sourceName: "comp-set",
          sourceDate: EVIDENCE_AS_OF,
          reasoning: "comp set says 12mo",
          supersededAt: null,
        } satisfies GuidanceSlim,
      ];
    },
    now: () => new Date("2026-04-26T00:00:00Z"),
  };
}

function makeDeps(overrides: Partial<FundingSpecialistDeps> = {}): FundingSpecialistDeps {
  return {
    orchestrator: makeOrchestrator([PASSING_RESULT]),
    comparablesFetcher: makeComparablesFetcher(getCannedLpComparables()),
    engineClientDeps: makeEngineClientDeps({}),
    cacheKeyArgsBuilder: (_inputs) => ({
      specialistId: "mgmt-co.funding",
      persona: PERSONA,
      companyInputs: { numProperties: 4, country: "US" },
      scenarioId: null,
      entityId: 1,
      engineVersion: "v2",
    }),
    contextResolver: (_inputs) => ({
      portfolio: {
        propertyCount: 4,
        totalRaiseNeedUsd: 25_000_000,
        runwayNeedMonths: 18,
      },
      persona: PERSONA,
      priorVerdicts: [],
    }),
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Tests

describe("createFundingSpecialist — Tier-0 backward compat", () => {
  it("deps undefined → returns Tier-0 SpecialistOutput (Phase-3b behavior)", async () => {
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF });
    const out = await specialist(HEALTHY_INPUTS, CONTEXT);
    expect(out.tier).toBe(0);
    expect(out.cognitiveRunId).toBeUndefined();
    expect(out.dimensions).toHaveLength(5);
    // ADR-008: Tier-0 fallback emits canonical reason
    expect(out.meta?.fallbackReason).toBe("tier1_unavailable");
  });

  it("deps undefined → produces non-ok dimensions on stressed inputs", async () => {
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF });
    const out = await specialist(STRESSED_INPUTS, CONTEXT);
    expect(out.tier).toBe(0);
    const nonOkCount = out.dimensions.filter((d) => d.severity !== "ok").length;
    expect(nonOkCount).toBeGreaterThan(0);
    // ADR-008: Tier-0 fallback emits canonical reason
    expect(out.meta?.fallbackReason).toBe("tier1_unavailable");
  });
});

describe("createFundingSpecialist — Tier-1 cache HIT path", () => {
  it("cache HIT → returns reconstructed dims + cognitiveRunId, tier: 1", async () => {
    const deps = makeDeps({ engineClientDeps: makeEngineClientDeps({ hit: true }) });
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(HEALTHY_INPUTS, CONTEXT);
    expect(out.tier).toBe(1);
    expect(out.cognitiveRunId).toBe("99"); // String(runId) per consultCognitive
    expect(out.dimensions.length).toBeGreaterThan(0);
  });

  it("cache HIT → comparables still merged into evidence", async () => {
    const deps = makeDeps({ engineClientDeps: makeEngineClientDeps({ hit: true }) });
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(HEALTHY_INPUTS, CONTEXT);
    // Each dimension should have synthesis evidence (1 from reconstructor) +
    // 3 comparables = 4 evidence rows.
    for (const dim of out.dimensions) {
      expect(dim.evidence.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("createFundingSpecialist — Tier-1 cache MISS happy path", () => {
  it("cache MISS → orchestrator runs, comparables fetched, tier: 1", async () => {
    const deps = makeDeps();
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(HEALTHY_INPUTS, CONTEXT);
    expect(out.tier).toBe(1);
    expect(out.cognitiveRunId).toBe("run-123");
    expect(out.dimensions).toHaveLength(5);
  });

  it("cache MISS → each non-ok dimension carries ≥3 synthesis evidence + 3 comparables", async () => {
    const deps = makeDeps();
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(HEALTHY_INPUTS, CONTEXT);
    for (const dim of out.dimensions) {
      // 3 synthesis + 3 comparables = 6 evidence rows minimum
      expect(dim.evidence.length).toBeGreaterThanOrEqual(6);
    }
  });
});

describe("createFundingSpecialist — bounded regress", () => {
  it("convergence below threshold → regress; passes after regress 1", async () => {
    const lowConvergence: FundingOrchestratorResult = {
      ...PASSING_RESULT,
      convergenceScore: 0.4, // below CONVERGENCE_THRESHOLD (0.6)
      cognitiveRunId: "run-fail-1",
    };
    const deps = makeDeps({
      orchestrator: makeOrchestrator([lowConvergence, PASSING_RESULT]),
    });
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(HEALTHY_INPUTS, CONTEXT);
    expect(out.tier).toBe(1);
    expect(out.cognitiveRunId).toBe("run-123"); // The passing one
  });

  it("regress count is passed through to orchestrator", async () => {
    const seenRegressCounts: number[] = [];
    const lowConvergence: FundingOrchestratorResult = {
      ...PASSING_RESULT,
      convergenceScore: 0.4,
    };
    const deps = makeDeps({
      orchestrator: {
        run: async (_input, opts: OrchestratorRunOptions) => {
          seenRegressCounts.push(opts.regressCount);
          // Pass on attempt 2 (regress 2)
          if (opts.regressCount >= 2) return PASSING_RESULT;
          return lowConvergence;
        },
      },
    });
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(HEALTHY_INPUTS, CONTEXT);
    expect(seenRegressCounts).toEqual([0, 1, 2]);
    expect(out.tier).toBe(1);
  });

  it("3 failed attempts → honest-fail (severity: ok, intent: missing-data, range: null)", async () => {
    const lowConvergence: FundingOrchestratorResult = {
      ...PASSING_RESULT,
      convergenceScore: 0.4,
    };
    const deps = makeDeps({
      orchestrator: makeOrchestrator([lowConvergence, lowConvergence, lowConvergence, lowConvergence]),
    });
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(HEALTHY_INPUTS, CONTEXT);
    expect(out.tier).toBe(1);
    expect(out.cognitiveRunId).toBe("honest-fail");
    expect(out.dimensions).toHaveLength(5);
    for (const dim of out.dimensions) {
      expect(dim.severity).toBe("ok");
      expect(dim.intent).toBe("missing-data");
      expect(dim.range).toBeNull();
    }
  });
});

describe("createFundingSpecialist — quality-check triggers", () => {
  it("non-ok dim with <3 evidence → regress (and pass on retry)", async () => {
    const sparseEvidence: FundingOrchestratorResult = {
      ...PASSING_RESULT,
      cognitiveRunId: "run-sparse",
      dimensions: [
        {
          ...makeDimension("capitalRaise1Amount", "warning"),
          evidence: [
            { source: "only-one", tier: "web", asOf: EVIDENCE_AS_OF, personaFit: 0.8 },
          ],
        },
        ...PASSING_RESULT.dimensions.slice(1),
      ],
    };
    const deps = makeDeps({
      orchestrator: makeOrchestrator([sparseEvidence, PASSING_RESULT]),
    });
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(HEALTHY_INPUTS, CONTEXT);
    expect(out.cognitiveRunId).toBe("run-123"); // Passing run
  });

  it("non-ok numeric dim with sub-CONVICTION_FLOOR qualityScore + range → regress", async () => {
    const lowConfidence: FundingOrchestratorResult = {
      ...PASSING_RESULT,
      cognitiveRunId: "run-low-conviction",
      dimensions: [
        {
          ...makeDimension("capitalRaise1Amount", "warning"),
          qualityScore: CONVICTION_FLOOR - 1,
          range: { low: 6, mid: 12, high: 18, unit: "mo" },
        },
        ...PASSING_RESULT.dimensions.slice(1),
      ],
    };
    const deps = makeDeps({
      orchestrator: makeOrchestrator([lowConfidence, PASSING_RESULT]),
    });
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(HEALTHY_INPUTS, CONTEXT);
    expect(out.cognitiveRunId).toBe("run-123");
  });
});

describe("createFundingSpecialist — comparables threading", () => {
  it("comparables fetcher throws → continues without comparables (best-effort)", async () => {
    const deps = makeDeps({
      comparablesFetcher: makeComparablesFetcher(async () => {
        throw new Error("api down");
      }),
    });
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(HEALTHY_INPUTS, CONTEXT);
    expect(out.tier).toBe(1);
    // Each dim still has synthesis evidence (3 rows) but no comparables added.
    for (const dim of out.dimensions) {
      expect(dim.evidence.length).toBe(3);
    }
  });

  it("each comparable becomes one Evidence row per dimension", async () => {
    const deps = makeDeps();
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(HEALTHY_INPUTS, CONTEXT);
    const cannedCount = getCannedLpComparables().length; // 3
    for (const dim of out.dimensions) {
      const compEvidence = dim.evidence.filter((e) => e.source.startsWith("LP comp:"));
      expect(compEvidence.length).toBe(cannedCount);
      for (const ev of compEvidence) {
        expect(ev.tier).toBe("db_table");
      }
    }
  });
});

describe("createFundingSpecialist — fallback paths (S5)", () => {
  it("orchestrator throws → catches → Tier-0 fallback (tier: 0)", async () => {
    const deps = makeDeps({
      orchestrator: {
        run: async () => {
          throw new Error("rate limit exceeded");
        },
      },
    });
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(HEALTHY_INPUTS, CONTEXT);
    expect(out.tier).toBe(0);
    expect(out.cognitiveRunId).toBeUndefined();
    expect(out.dimensions).toHaveLength(5);
  });

  it("cache lookup throws → catches → Tier-0 fallback", async () => {
    const deps = makeDeps({
      engineClientDeps: makeEngineClientDeps({ throwOnLookup: true }),
    });
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(HEALTHY_INPUTS, CONTEXT);
    expect(out.tier).toBe(0);
  });

  it("context resolver throws → catches → Tier-0 fallback", async () => {
    const deps = makeDeps({
      contextResolver: () => {
        throw new Error("session not found");
      },
    });
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(HEALTHY_INPUTS, CONTEXT);
    expect(out.tier).toBe(0);
  });

  it("S5: superseded cache row → MISS path → orchestrator invoked normally", async () => {
    let orchestratorCalled = false;
    const deps = makeDeps({
      engineClientDeps: makeEngineClientDeps({ hit: true, superseded: true }),
      orchestrator: {
        run: async () => {
          orchestratorCalled = true;
          return PASSING_RESULT;
        },
      },
    });
    const specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF }, deps);
    const out = await specialist(HEALTHY_INPUTS, CONTEXT);
    expect(orchestratorCalled).toBe(true);
    expect(out.tier).toBe(1);
    expect(out.cognitiveRunId).toBe("run-123");
  });

  it("S5: explicit fallback test — Tier-0 dims match shape Tier-0 default produces", async () => {
    // Compare the fallback (Tier-1 throws) output against the deps-undefined
    // Tier-0 output to prove they're the same shape.
    const tier0Specialist = createFundingSpecialist(BENCHMARKS, { evidenceAsOf: EVIDENCE_AS_OF });
    const tier0Out = await tier0Specialist(HEALTHY_INPUTS, CONTEXT);

    const fallbackDeps = makeDeps({
      orchestrator: {
        run: async () => {
          throw new Error("network error");
        },
      },
    });
    const fallbackSpecialist = createFundingSpecialist(
      BENCHMARKS,
      { evidenceAsOf: EVIDENCE_AS_OF },
      fallbackDeps,
    );
    const fallbackOut = await fallbackSpecialist(HEALTHY_INPUTS, CONTEXT);

    expect(fallbackOut.tier).toBe(tier0Out.tier);
    expect(fallbackOut.dimensions.length).toBe(tier0Out.dimensions.length);
    expect(fallbackOut.dimensions.map((d) => d.field)).toEqual(tier0Out.dimensions.map((d) => d.field));
    expect(fallbackOut.dimensions.map((d) => d.severity)).toEqual(tier0Out.dimensions.map((d) => d.severity));
  });
});
