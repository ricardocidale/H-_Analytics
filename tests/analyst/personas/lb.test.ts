import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSurfaceRouter } from "@engine/analyst/router/surface-router";
import { createVoiceRenderer } from "@engine/analyst/voice/voice-renderer";
import { createQualityScorer } from "@engine/analyst/quality/quality-scorer";
import type {
  Evidence,
  PersonaContext,
  RawVerdictDimension,
} from "@engine/analyst/contracts/verdict";
import type { SpecialistFn } from "@engine/analyst/router/surface-router";

/**
 * L+B persona-keyed golden bench.
 *
 * Phase 3a uses stub Specialists. Phase 3b will backfill the funding +
 * revenue evaluators as real Specialists and these stubs become real.
 */

const PERSONA: PersonaContext = { segment: "L+B", tier: "luxury", market: "US" };
const NOW = new Date("2026-04-19T00:00:00.000Z");

const deps = {
  voiceRenderer: createVoiceRenderer(),
  qualityScorer: createQualityScorer(),
};

const strongEvidence: Evidence[] = [
  { source: "HVS 2024", tier: "db_table", asOf: "2026-03-01", personaFit: 1 },
  { source: "STR 2024", tier: "api", asOf: "2026-03-01", personaFit: 0.9 },
  { source: "BLLA Outlook", tier: "web", asOf: "2026-03-01", personaFit: 0.8 },
];

describe("L+B persona — funding Specialist (stub, well-sized)", () => {
  const originalEnv = process.env.NODE_ENV;
  beforeEach(() => { process.env.NODE_ENV = "test"; });
  afterEach(() => { process.env.NODE_ENV = originalEnv; });

  const fundingOk: SpecialistFn = () => {
    const dims: RawVerdictDimension[] = [
      {
        field: "runway_buffer_months",
        isNumericField: true,
        severity: "ok",
        range: { low: 6, mid: 9, high: 12, unit: "mo" },
        qualityScore: 75,
        evidence: strongEvidence,
        intent: "within-range",
        actions: [{ kind: "dismiss", label: "Got it" }],
      },
    ];
    return { dimensions: dims, tier: 0, durationMs: 5 };
  };

  it("returns an AnalystVerdict with ok severity and a rendered headline", async () => {
    const router = createSurfaceRouter(deps);
    router.register("mgmt-co.funding", fundingOk);
    const verdict = await router.dispatch({
      specialistId: "mgmt-co.funding",
      payload: {},
      persona: PERSONA,
      now: NOW,
    });
    expect(verdict.overallSeverity).toBe("ok");
    expect(verdict.dimensions).toHaveLength(1);
    expect(verdict.dimensions[0].voice.headline).toMatch(/Runway Buffer Months/);
    expect(verdict.dimensions[0].voice.headline).toMatch(/The Analyst/);
    expect(verdict.overallQualityScore).toBeGreaterThanOrEqual(50);
  });
});

describe("L+B persona — revenue Specialist (stub, marketing under-invested)", () => {
  const originalEnv = process.env.NODE_ENV;
  beforeEach(() => { process.env.NODE_ENV = "test"; });
  afterEach(() => { process.env.NODE_ENV = originalEnv; });

  const revenueUnder: SpecialistFn = () => {
    const dims: RawVerdictDimension[] = [
      {
        field: "marketing_cost_rate",
        isNumericField: true,
        severity: "warning",
        range: { low: 0.03, mid: 0.04, high: 0.05, unit: "%" },
        qualityScore: 70,
        evidence: strongEvidence,
        intent: "below-range",
        actions: [
          { kind: "set-value", label: "Set to 4.0%", payload: { field: "marketing_cost_rate", value: 0.04 } },
          { kind: "dismiss", label: "Got it" },
        ],
      },
    ];
    return { dimensions: dims, tier: 0, durationMs: 7, benchmarkVariancePerField: { marketing_cost_rate: 0.3 } };
  };

  it("produces below-range voice referencing L+B luxury", async () => {
    const router = createSurfaceRouter(deps);
    router.register("mgmt-co.revenue", revenueUnder);
    const verdict = await router.dispatch({
      specialistId: "mgmt-co.revenue",
      payload: {},
      persona: PERSONA,
      now: NOW,
    });
    expect(verdict.overallSeverity).toBe("warning");
    const headline = verdict.dimensions[0].voice.headline;
    expect(headline).toMatch(/L\+B/);
    expect(headline).toMatch(/luxury/);
    expect(headline).toMatch(/3\.0%/);
    // Voice is singular; no plural analyst.
    expect(headline).not.toMatch(/analysts/i);
  });
});

describe("L+B persona — compensation Specialist (stub, missing data → conviction-floor downgrade)", () => {
  const originalEnv = process.env.NODE_ENV;
  beforeEach(() => { process.env.NODE_ENV = "test"; });
  afterEach(() => { process.env.NODE_ENV = originalEnv; });

  const compLowConviction: SpecialistFn = () => {
    const dims: RawVerdictDimension[] = [
      {
        field: "benefits_load_rate",
        isNumericField: true,
        severity: "warning",
        range: { low: 0.2, mid: 0.3, high: 0.4, unit: "%" },
        // qualityScore below CONVICTION_FLOOR; Router must downgrade.
        qualityScore: 28,
        evidence: [{ source: "x", tier: "estimated", asOf: "2025-01-01", personaFit: 0.2 }],
        intent: "above-range",
        actions: [],
      },
    ];
    // Steer the scorer toward returning a below-floor number deterministically.
    return {
      dimensions: dims,
      tier: 0,
      durationMs: 3,
      benchmarkVariancePerField: { benefits_load_rate: 0.05 },
      consensusPerField: { benefits_load_rate: 0.05 },
    };
  };

  it("Router downgrades to ok + developing-data voice + no range emitted", async () => {
    const router = createSurfaceRouter(deps);
    router.register("mgmt-co.compensation", compLowConviction);
    const verdict = await router.dispatch({
      specialistId: "mgmt-co.compensation",
      payload: {},
      persona: PERSONA,
      now: NOW,
    });
    expect(verdict.overallSeverity).toBe("ok");
    const headline = verdict.dimensions[0].voice.headline;
    expect(headline).toMatch(/developing data/i);
    // No range in the headline (25%/30%/40% should NOT appear).
    expect(headline).not.toMatch(/\d+\.\d+%/);
    expect(verdict.dimensions[0].range).toBeNull();
  });
});
