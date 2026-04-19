import { describe, expect, it } from "vitest";
import {
  AnalystVerdictSchema,
  buildAnalystVerdict,
  computeOverallQuality,
  fromLegacySeverity,
  InvalidVerdictError,
  severityMax,
  severityMaxOf,
  SEVERITY_VALUES,
  VerdictRangeSchema,
  __castVoiceRendered,
  type AnalystVerdict,
  type VerdictDimension,
  type VoiceBlock,
  type Evidence,
  type VerdictRange,
} from "@engine/analyst/contracts/verdict";
import { CONVICTION_FLOOR } from "@shared/analyst-conviction";

const evidenceStrong: Evidence[] = [
  { source: "HVS 2024", tier: "db_table", asOf: "2025-06-01", url: "https://example.com/hvs", personaFit: 1 },
  { source: "STR 2024", tier: "api", asOf: "2025-06-01", personaFit: 0.9 },
  { source: "BLLA Outlook", tier: "web", asOf: "2025-06-01", personaFit: 0.7 },
];

const voice: VoiceBlock = {
  headline: __castVoiceRendered("test headline"),
  detail: __castVoiceRendered("test detail"),
};

function rangeOk(): VerdictRange {
  return { low: 0.03, mid: 0.04, high: 0.05, unit: "%" };
}

function dim(overrides: Partial<VerdictDimension> = {}): VerdictDimension {
  return {
    field: "marketing_cost_rate",
    isNumericField: true,
    severity: "ok",
    range: rangeOk(),
    qualityScore: 75,
    evidence: evidenceStrong,
    voice,
    actions: [],
    ...overrides,
  };
}

describe("severity helpers", () => {
  it("severityMax picks the higher rank", () => {
    expect(severityMax("ok", "advisory")).toBe("advisory");
    expect(severityMax("warning", "advisory")).toBe("warning");
    expect(severityMax("block", "warning")).toBe("block");
    expect(severityMax("ok", "ok")).toBe("ok");
  });

  it("severityMaxOf handles all 16 ordered pairs consistently", () => {
    for (const a of SEVERITY_VALUES) {
      for (const b of SEVERITY_VALUES) {
        const m1 = severityMax(a, b);
        const m2 = severityMax(b, a);
        expect(m1).toBe(m2); // commutative
      }
    }
  });

  it("severityMaxOf with empty array defaults to ok", () => {
    expect(severityMaxOf([])).toBe("ok");
  });

  it("fromLegacySeverity maps the 3-tier watchdog severity", () => {
    expect(fromLegacySeverity("ok")).toBe("ok");
    expect(fromLegacySeverity("warn")).toBe("advisory");
    expect(fromLegacySeverity("alert")).toBe("warning");
  });
});

describe("VerdictRange schema", () => {
  it("accepts ordered ranges", () => {
    expect(VerdictRangeSchema.safeParse(rangeOk()).success).toBe(true);
    expect(VerdictRangeSchema.safeParse({ low: 10, mid: 10, high: 10, unit: "%" }).success).toBe(true);
  });

  it("rejects low > mid", () => {
    const r = VerdictRangeSchema.safeParse({ low: 0.5, mid: 0.4, high: 0.6, unit: "%" });
    expect(r.success).toBe(false);
  });

  it("rejects mid > high", () => {
    const r = VerdictRangeSchema.safeParse({ low: 0.3, mid: 0.6, high: 0.5, unit: "%" });
    expect(r.success).toBe(false);
  });

  it("rejects non-finite numbers", () => {
    expect(VerdictRangeSchema.safeParse({ low: 0.3, mid: Number.NaN, high: 0.5, unit: "%" }).success).toBe(false);
  });
});

describe("computeOverallQuality", () => {
  it("zero dimensions → 0", () => {
    expect(computeOverallQuality([])).toBe(0);
  });

  it("single ok dimension returns its score", () => {
    expect(computeOverallQuality([dim({ qualityScore: 80 })])).toBe(80);
  });

  it("severity-weighted: warning pulls harder than ok", () => {
    const justOk = computeOverallQuality([
      dim({ severity: "ok", qualityScore: 80 }),
      dim({ severity: "ok", qualityScore: 60 }),
    ]);
    const okPlusWarning = computeOverallQuality([
      dim({ severity: "ok", qualityScore: 80 }),
      dim({ severity: "warning", qualityScore: 60, range: null, isNumericField: false }),
    ]);
    // Warning dim is weighted 1.5x → pulls the average toward 60.
    expect(okPlusWarning).toBeLessThan(justOk);
  });
});

describe("buildAnalystVerdict invariants", () => {
  it("builds a valid verdict round-trips through Zod", () => {
    const verdict = buildAnalystVerdict({
      specialistId: "mgmt-co.funding",
      dimensions: [dim()],
      surfaceVoice: voice,
      meta: { tier: 0, durationMs: 10 },
      generatedAt: "2026-04-19T00:00:00.000Z",
    });
    const parsed = AnalystVerdictSchema.safeParse(verdict);
    expect(parsed.success).toBe(true);
    expect(verdict.overallSeverity).toBe("ok");
    expect(verdict.overallQualityScore).toBe(75);
  });

  it("rejects non-ok numeric dimension without a range", () => {
    expect(() =>
      buildAnalystVerdict({
        specialistId: "t",
        dimensions: [dim({ severity: "warning", range: null, isNumericField: true })],
        surfaceVoice: voice,
        meta: { tier: 0, durationMs: 1 },
      }),
    ).toThrow(InvalidVerdictError);
  });

  it("rejects non-ok ranged dimension with qualityScore below CONVICTION_FLOOR", () => {
    expect(() =>
      buildAnalystVerdict({
        specialistId: "t",
        dimensions: [dim({ severity: "warning", qualityScore: CONVICTION_FLOOR - 1 })],
        surfaceVoice: voice,
        meta: { tier: 0, durationMs: 1 },
      }),
    ).toThrow(InvalidVerdictError);
  });

  it("rejects dimension with zero evidence entries", () => {
    expect(() =>
      buildAnalystVerdict({
        specialistId: "t",
        dimensions: [dim({ evidence: [] })],
        surfaceVoice: voice,
        meta: { tier: 0, durationMs: 1 },
      }),
    ).toThrow(InvalidVerdictError);
  });

  it("rejects Tier-1 verdict without cognitiveRunId", () => {
    expect(() =>
      buildAnalystVerdict({
        specialistId: "t",
        dimensions: [dim({ severity: "ok" })],
        surfaceVoice: voice,
        meta: { tier: 1, durationMs: 1 },
      }),
    ).toThrow(InvalidVerdictError);
  });

  it("rejects Tier-1 verdict with fewer than 3 total evidence entries", () => {
    expect(() =>
      buildAnalystVerdict({
        specialistId: "t",
        dimensions: [dim({ evidence: [evidenceStrong[0]] })],
        surfaceVoice: voice,
        meta: { tier: 1, durationMs: 1, cognitiveRunId: "run-1" },
      }),
    ).toThrow(InvalidVerdictError);
  });

  it("builds a valid Tier-1 verdict with 3 total evidence entries and runId", () => {
    const verdict = buildAnalystVerdict({
      specialistId: "t",
      dimensions: [dim({ evidence: evidenceStrong })],
      surfaceVoice: voice,
      meta: { tier: 1, durationMs: 1, cognitiveRunId: "run-1" },
    });
    expect(verdict.meta.tier).toBe(1);
    expect(verdict.meta.cognitiveRunId).toBe("run-1");
  });

  it("overallSeverity equals max across dimensions", () => {
    const verdict = buildAnalystVerdict({
      specialistId: "t",
      dimensions: [
        dim({ severity: "ok" }),
        dim({ severity: "warning", qualityScore: 75 }),
        dim({ severity: "advisory", qualityScore: 60 }),
      ],
      surfaceVoice: voice,
      meta: { tier: 0, durationMs: 1 },
    });
    expect(verdict.overallSeverity).toBe("warning");
  });
});

/* Type-only import keeps noUnusedLocals quiet for future growth. */
type _V = AnalystVerdict;
