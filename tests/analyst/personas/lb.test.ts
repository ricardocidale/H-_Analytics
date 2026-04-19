import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSurfaceRouter } from "@engine/analyst/router/surface-router";
import { createVoiceRenderer } from "@engine/analyst/voice/voice-renderer";
import { createQualityScorer } from "@engine/analyst/quality/quality-scorer";
import {
  createFundingSpecialist,
  createRevenueSpecialist,
  MGMT_CO_FUNDING_ID,
  MGMT_CO_REVENUE_ID,
} from "@engine/analyst/surface/mgmt-co";
import type {
  Evidence,
  PersonaContext,
  RawVerdictDimension,
} from "@engine/analyst/contracts/verdict";
import type { SpecialistFn } from "@engine/analyst/router/surface-router";
import type { AnalystWatchdogBenchmarks } from "@shared/schema";
import type { RevenueBenchmarks } from "@shared/constants-revenue-benchmarks";

/**
 * L+B persona-keyed golden bench.
 *
 * Phase 3b: funding + revenue cases now exercise the real Specialists
 * (createFundingSpecialist / createRevenueSpecialist) end-to-end through
 * the Surface Router + Voice Renderer + Quality Scorer. The compensation
 * case stays a stub — Phase 4 ships that Specialist.
 */

const PERSONA: PersonaContext = { segment: "L+B", tier: "luxury", market: "US" };
const NOW = new Date("2026-04-19T00:00:00.000Z");
const EVIDENCE_AS_OF = "2026-04-01";

const deps = {
  voiceRenderer: createVoiceRenderer(),
  qualityScorer: createQualityScorer(),
};

// ────────────────────────────────────────────────────────────────────────
// Fixture benchmarks (subset of the full table, sufficient for the
// dimensions exercised below).
// ────────────────────────────────────────────────────────────────────────

const FUNDING_BENCH = {
  id: 1, userId: 1,
  runwayBufferMonthsLow: 6, runwayBufferMonthsMid: 9, runwayBufferMonthsHigh: 12,
  sizingOvershootPctLow: 0.10, sizingOvershootPctMid: 0.20, sizingOvershootPctHigh: 0.30,
  trancheGapMonthsLow: 9, trancheGapMonthsMid: 12, trancheGapMonthsHigh: 18,
  revenueRampDelayMonthsLow: 6, revenueRampDelayMonthsMid: 9, revenueRampDelayMonthsHigh: 12,
  burnFlexDownPctLow: 0.10, burnFlexDownPctMid: 0.20, burnFlexDownPctHigh: 0.30,
  effectiveAsOf: "2026-01-01",
} as unknown as AnalystWatchdogBenchmarks;

const REVENUE_BENCH: RevenueBenchmarks = {
  marketingRate:      { low: 0.03, high: 0.05 },
  fbRevenueShare:     { low: 0.20, high: 0.40 },
  eventsRevenueShare: { low: 0.05, high: 0.15 },
  otherRevenueShare:  { low: 0.00, high: 0.10 },
  cateringBoostPct:   { low: 0.00, high: 0.20 },
};

// ────────────────────────────────────────────────────────────────────────
// Funding — well-sized inputs (no findings, all dims ok)
// ────────────────────────────────────────────────────────────────────────

describe("L+B persona — mgmt-co.funding (well-sized)", () => {
  const originalEnv = process.env.NODE_ENV;
  beforeEach(() => { process.env.NODE_ENV = "test"; });
  afterEach(() => { process.env.NODE_ENV = originalEnv; });

  it("returns an ok verdict with one dimension per Funding metric", async () => {
    const router = createSurfaceRouter(deps);
    router.register(
      MGMT_CO_FUNDING_ID,
      createFundingSpecialist(FUNDING_BENCH, { evidenceAsOf: EVIDENCE_AS_OF }),
    );
    const verdict = await router.dispatch({
      specialistId: MGMT_CO_FUNDING_ID,
      payload: {
        runwayBufferMonths: 9,
        sizingOvershootPct: 0.20,
        trancheGapMonths: 12,
        revenueRampDelayMonths: 9,
        burnFlexDownPct: 0.20,
      },
      persona: PERSONA,
      now: NOW,
    });
    expect(verdict.overallSeverity).toBe("ok");
    expect(verdict.dimensions).toHaveLength(5);
    expect(verdict.dimensions.every((d) => d.severity === "ok")).toBe(true);
    // Surface voice always opens with "The Analyst".
    expect(verdict.voice.headline).toMatch(/^The Analyst /);
    expect(verdict.voice.headline).not.toMatch(/analysts/i);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Funding — under-runway (1 dim flagged)
// ────────────────────────────────────────────────────────────────────────

describe("L+B persona — mgmt-co.funding (under-runway)", () => {
  const originalEnv = process.env.NODE_ENV;
  beforeEach(() => { process.env.NODE_ENV = "test"; });
  afterEach(() => { process.env.NODE_ENV = originalEnv; });

  it("flags the runway dimension with L+B luxury voice + a consult-cognitive action", async () => {
    const router = createSurfaceRouter(deps);
    router.register(
      MGMT_CO_FUNDING_ID,
      createFundingSpecialist(FUNDING_BENCH, { evidenceAsOf: EVIDENCE_AS_OF }),
    );
    const verdict = await router.dispatch({
      specialistId: MGMT_CO_FUNDING_ID,
      payload: {
        runwayBufferMonths: 3, // below 6 → "alert" → "warning"
        sizingOvershootPct: 0.20,
        trancheGapMonths: 12,
        revenueRampDelayMonths: 9,
        burnFlexDownPct: 0.20,
      },
      persona: PERSONA,
      now: NOW,
    });
    expect(verdict.overallSeverity).toBe("warning");
    const flagged = verdict.dimensions.find((d) => d.field === "capitalRaise1Amount");
    expect(flagged).toBeDefined();
    expect(flagged!.severity).toBe("warning");
    expect(flagged!.voice.headline).toMatch(/L\+B/);
    expect(flagged!.voice.headline).toMatch(/luxury/);
    expect(flagged!.actions[0].kind).toBe("consult-cognitive");
    if (flagged!.actions[0].kind === "consult-cognitive") {
      expect(flagged!.actions[0].payload.field).toBe("capitalRaise1Amount");
    }
  });
});

// ────────────────────────────────────────────────────────────────────────
// Revenue — marketing under-invested (1 dim flagged)
// ────────────────────────────────────────────────────────────────────────

describe("L+B persona — mgmt-co.revenue (marketing under-invested)", () => {
  const originalEnv = process.env.NODE_ENV;
  beforeEach(() => { process.env.NODE_ENV = "test"; });
  afterEach(() => { process.env.NODE_ENV = originalEnv; });

  it("produces below-range voice referencing L+B luxury", async () => {
    const router = createSurfaceRouter(deps);
    router.register(
      MGMT_CO_REVENUE_ID,
      createRevenueSpecialist(REVENUE_BENCH, { evidenceAsOf: EVIDENCE_AS_OF }),
    );
    const verdict = await router.dispatch({
      specialistId: MGMT_CO_REVENUE_ID,
      payload: {
        marketingRate: 0.02, // below 0.03 → "alert" → "warning"
        fbRevenueShare: null,
        eventsRevenueShare: null,
        otherRevenueShare: null,
        cateringBoostPct: null,
      },
      persona: PERSONA,
      now: NOW,
    });
    expect(verdict.overallSeverity).toBe("warning");
    const flagged = verdict.dimensions.find((d) => d.field === "defaultCostRateMarketing");
    expect(flagged).toBeDefined();
    const headline = flagged!.voice.headline;
    expect(headline).toMatch(/L\+B/);
    expect(headline).toMatch(/luxury/);
    expect(headline).toMatch(/3\.0%/);
    expect(headline).not.toMatch(/analysts/i);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Compensation — stub Specialist (Phase 4 backfill territory)
// ────────────────────────────────────────────────────────────────────────

const strongEvidence: Evidence[] = [
  { source: "HVS 2024", tier: "db_table", asOf: "2026-03-01", personaFit: 1 },
  { source: "STR 2024", tier: "api", asOf: "2026-03-01", personaFit: 0.9 },
  { source: "BLLA Outlook", tier: "web", asOf: "2026-03-01", personaFit: 0.8 },
];

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
    expect(headline).not.toMatch(/\d+\.\d+%/);
    expect(verdict.dimensions[0].range).toBeNull();
  });
  // Silence unused-import warning when the strongEvidence fixture is used
  // by Phase 4 backfill but not in the live stub above.
  void strongEvidence;
});
