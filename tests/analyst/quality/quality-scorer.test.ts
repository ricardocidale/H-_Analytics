import { describe, expect, it } from "vitest";
import {
  createQualityScorer,
  QUALITY_COMPONENT_CAPS,
  CONVICTION_FLOOR,
  MIN_SOURCES_FOR_ADVICE,
} from "@engine/analyst/quality/quality-scorer";
import {
  CONVICTION_FLOOR as _CF_SHARED,
  MIN_SOURCES_FOR_ADVICE as _MS_SHARED,
} from "@shared/analyst-conviction";
import type { Evidence, PersonaContext, VerdictRange } from "@engine/analyst/contracts/verdict";

const PERSONA: PersonaContext = { segment: "L+B", tier: "luxury", market: "US" };
const NOW = new Date("2026-04-19T00:00:00.000Z");

function ev(overrides: Partial<Evidence> = {}): Evidence {
  return {
    source: "HVS 2024",
    tier: "db_table",
    asOf: "2026-04-19",
    personaFit: 1,
    ...overrides,
  };
}

const PERFECT_RANGE: VerdictRange = { low: 0.035, mid: 0.04, high: 0.045, unit: "%" };

describe("re-exports from shared/analyst-conviction", () => {
  it("re-exports point to the same constants", () => {
    expect(CONVICTION_FLOOR).toBe(_CF_SHARED);
    expect(MIN_SOURCES_FOR_ADVICE).toBe(_MS_SHARED);
  });
});

describe("Quality Scorer — component caps", () => {
  it("caps sum to 100", () => {
    const total =
      QUALITY_COMPONENT_CAPS.sourceCount +
      QUALITY_COMPONENT_CAPS.sourceMix +
      QUALITY_COMPONENT_CAPS.dataAge +
      QUALITY_COMPONENT_CAPS.rangeSpread +
      QUALITY_COMPONENT_CAPS.consensus +
      QUALITY_COMPONENT_CAPS.personaFit;
    expect(total).toBe(100);
  });
});

describe("Quality Scorer — components stay within declared ranges", () => {
  const scorer = createQualityScorer();

  it("each component contributes 0..cap", () => {
    const r = scorer.score({
      evidence: [ev(), ev({ tier: "estimated", personaFit: 0 }), ev({ tier: "web", personaFit: 0.5 })],
      range: PERFECT_RANGE,
      persona: PERSONA,
      now: NOW,
    });
    for (const [key, cap] of Object.entries(QUALITY_COMPONENT_CAPS)) {
      const v = r.components[key as keyof typeof QUALITY_COMPONENT_CAPS];
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(cap + 1e-6);
    }
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.total).toBeLessThanOrEqual(100);
  });

  it("property test: total is in [0,100] for 50 random inputs", () => {
    // Seeded pseudo-random (Mulberry32-ish; tiny, fine for tests).
    let s = 42;
    const rnd = () => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 50; i++) {
      const count = Math.floor(rnd() * 8) + 1;
      const evidence: Evidence[] = Array.from({ length: count }, () => ({
        source: "s",
        tier: (["db_table", "api", "web", "estimated"] as const)[Math.floor(rnd() * 4)],
        asOf: `2026-0${Math.max(1, Math.floor(rnd() * 9))}-01`,
        personaFit: rnd(),
      }));
      const r = scorer.score({
        evidence,
        range: { low: 0.01 + rnd() * 0.04, mid: 0.05 + rnd() * 0.05, high: 0.1 + rnd() * 0.1, unit: "%" } as VerdictRange,
        cognitiveConsensusRatio: rnd(),
        persona: PERSONA,
        now: NOW,
      });
      expect(r.total).toBeGreaterThanOrEqual(0);
      expect(r.total).toBeLessThanOrEqual(100);
    }
  });
});

describe("Quality Scorer — calibration anchors", () => {
  const scorer = createQualityScorer();

  it("perfect input scores >= 95", () => {
    const evidence: Evidence[] = [
      ev({ source: "A" }),
      ev({ source: "B" }),
      ev({ source: "C" }),
    ];
    const r = scorer.score({
      evidence,
      range: PERFECT_RANGE,
      benchmarkVariance: 0.3,
      cognitiveConsensusRatio: 1,
      persona: PERSONA,
      now: NOW,
    });
    expect(r.total).toBeGreaterThanOrEqual(95);
  });

  it("estimated-only, old, wide-range input falls below CONVICTION_FLOOR", () => {
    const evidence: Evidence[] = [
      { source: "x", tier: "estimated", asOf: "2025-04-19", personaFit: 0.3 },
    ];
    const r = scorer.score({
      evidence,
      range: { low: 0.01, mid: 0.05, high: 0.2, unit: "%" },
      benchmarkVariance: 0.1,
      cognitiveConsensusRatio: 0.2,
      persona: PERSONA,
      now: NOW,
    });
    expect(r.total).toBeLessThan(CONVICTION_FLOOR);
  });

  it("consensusRatio default when omitted", () => {
    const evidence = [ev(), ev({ source: "B" })];
    const withDefault = scorer.score({
      evidence,
      range: PERFECT_RANGE,
      benchmarkVariance: 0.3,
      persona: PERSONA,
      now: NOW,
    });
    const explicitHalf = scorer.score({
      evidence,
      range: PERFECT_RANGE,
      benchmarkVariance: 0.3,
      cognitiveConsensusRatio: 0.5,
      persona: PERSONA,
      now: NOW,
    });
    expect(withDefault.components.consensus).toBeCloseTo(explicitHalf.components.consensus, 6);
  });

  it("data-age: fresh evidence scores max, 1-year-old scores 0", () => {
    const fresh = scorer.score({
      evidence: [ev({ asOf: "2026-04-19" })],
      range: PERFECT_RANGE,
      persona: PERSONA,
      now: NOW,
    });
    const old = scorer.score({
      evidence: [ev({ asOf: "2025-04-19" })],
      range: PERFECT_RANGE,
      persona: PERSONA,
      now: NOW,
    });
    expect(fresh.components.dataAge).toBeGreaterThan(old.components.dataAge);
    expect(old.components.dataAge).toBeLessThan(1);
  });
});

describe("Quality Scorer — purity", () => {
  const scorer = createQualityScorer();
  it("same inputs → same output over 20 calls", () => {
    const evidence = [ev(), ev({ source: "B" })];
    const first = scorer.score({
      evidence,
      range: PERFECT_RANGE,
      cognitiveConsensusRatio: 0.7,
      persona: PERSONA,
      now: NOW,
    });
    for (let i = 0; i < 20; i++) {
      const next = scorer.score({
        evidence,
        range: PERFECT_RANGE,
        cognitiveConsensusRatio: 0.7,
        persona: PERSONA,
        now: NOW,
      });
      expect(next).toEqual(first);
    }
  });
});
