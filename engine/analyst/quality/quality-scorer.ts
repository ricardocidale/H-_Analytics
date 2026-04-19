/**
 * Quality Scorer — produces the unified 0-100 qualityScore every AnalystVerdict
 * dimension carries.
 *
 * Spec:  docs/architecture/analyst/quality-scoring.md
 * Skill: .claude/skills/analyst/quality-scoring.md
 *
 * The Scorer folds together six weighted components (total 100):
 *   15% Source count vs MIN_SOURCES_FOR_ADVICE / N+1 (Tier-1 minimum = 3)
 *   20% Source mix tier (db_table > api > web > estimated)
 *   15% Data age (linear decay over 365 days since evidence.asOf)
 *   15% Range spread vs benchmark variance
 *   20% Cross-source convergence (cognitiveConsensusRatio, default 0.5)
 *   15% Persona fit (mean of evidence.personaFit)
 *
 * The scorer is PURE. Same inputs → same output. It produces the number
 * only; conviction labels live in Voice Renderer, conviction-floor decisions
 * live in Surface Router.
 */

import { assertFinite } from "@calc/shared/decimal.js";
import {
  CONVICTION_FLOOR,
  MAX_QUALITY_SCORE,
  MIN_QUALITY_SCORE,
  MIN_SOURCES_FOR_ADVICE,
  TIER_1_MIN_TOTAL_EVIDENCE,
  meetsConvictionFloor,
} from "@shared/analyst-conviction";
import type { Evidence, EvidenceTier, PersonaContext, VerdictRange } from "../contracts/verdict";

// Re-export primitives so callers have one import target.
export {
  CONVICTION_FLOOR,
  MAX_QUALITY_SCORE,
  MIN_QUALITY_SCORE,
  MIN_SOURCES_FOR_ADVICE,
  TIER_1_MIN_TOTAL_EVIDENCE,
  meetsConvictionFloor,
};

// ────────────────────────────────────────────────────────────────────────────
// Component caps (declared alongside the weight table in the spec)
// ────────────────────────────────────────────────────────────────────────────

export const QUALITY_COMPONENT_CAPS = {
  sourceCount: 15,
  sourceMix: 20,
  dataAge: 15,
  rangeSpread: 15,
  consensus: 20,
  personaFit: 15,
} as const;

// Tier weights for source mix. Averaged over evidence, scaled by the sourceMix cap.
const TIER_WEIGHT: Record<EvidenceTier, number> = {
  db_table: 1.0,
  api: 0.85,
  web: 0.6,
  estimated: 0.2,
};

const DAY_MS = 86_400_000;
const MAX_DATA_AGE_DAYS = 365;
const DEFAULT_CONSENSUS_RATIO = 0.5;
const DEFAULT_BENCHMARK_SPREAD_RATIO = 0.3;

/**
 * Half-credit fallback for the range-spread component when the range mid is
 * zero (division-by-zero guard) or when benchmark variance is unavailable.
 * Calibration constant; not a domain default.
 */
const RANGE_SPREAD_FALLBACK_CREDIT = 0.5;

/**
 * "2x benchmark spread = zero credit" tolerance multiplier in scoreRangeSpread.
 * A dimension whose spread equals the benchmark spread earns half credit; a
 * dimension whose spread is double the benchmark earns zero. Calibrated.
 */
const BENCHMARK_SPREAD_TOLERANCE_MULTIPLIER = 2;

// ────────────────────────────────────────────────────────────────────────────
// Public contract
// ────────────────────────────────────────────────────────────────────────────

export interface QualityInputs {
  evidence: Evidence[];
  range: VerdictRange | null;
  /**
   * Benchmark's own range spread (expressed as ratio: (high-low)/mid). When
   * present, range-spread component compares the dimension's range against it.
   * Defaults to 0.3 if omitted.
   */
  benchmarkVariance?: number;
  /**
   * Cross-source convergence from the Cognitive Engine's API validation
   * (0..1). When omitted, treated as 0.5 and the missing signal is logged.
   */
  cognitiveConsensusRatio?: number;
  persona: PersonaContext;
  /** Reference time for data-age calc; tests pass a fixed Date for determinism. */
  now?: Date;
}

export interface QualityBreakdown {
  total: number;
  components: {
    sourceCount: number;
    sourceMix: number;
    dataAge: number;
    rangeSpread: number;
    consensus: number;
    personaFit: number;
  };
}

export interface QualityScorer {
  score(inputs: QualityInputs): QualityBreakdown;
}

// ────────────────────────────────────────────────────────────────────────────
// Component scoring functions
// ────────────────────────────────────────────────────────────────────────────

function scoreSourceCount(evidence: Evidence[]): number {
  const n = evidence.length;
  if (n <= 0) return 0;
  // Linear ramp: 0 at n=0, full credit at n >= TIER_1_MIN_TOTAL_EVIDENCE.
  const ratio = Math.min(n / TIER_1_MIN_TOTAL_EVIDENCE, 1);
  return assertFinite(ratio * QUALITY_COMPONENT_CAPS.sourceCount, "quality.sourceCount");
}

function scoreSourceMix(evidence: Evidence[]): number {
  if (evidence.length === 0) return 0;
  const avg = evidence.reduce((acc, e) => acc + TIER_WEIGHT[e.tier], 0) / evidence.length;
  return assertFinite(avg * QUALITY_COMPONENT_CAPS.sourceMix, "quality.sourceMix");
}

function scoreDataAge(evidence: Evidence[], now: Date): number {
  if (evidence.length === 0) return 0;
  const nowMs = now.getTime();
  let sum = 0;
  let valid = 0;
  for (const e of evidence) {
    const t = Date.parse(e.asOf);
    if (!Number.isFinite(t)) continue;
    const ageDays = Math.max(0, (nowMs - t) / DAY_MS);
    // Linear decay: 0 days → 1.0, >= 365 days → 0.0
    const fresh = Math.max(0, 1 - ageDays / MAX_DATA_AGE_DAYS);
    sum += fresh;
    valid++;
  }
  if (valid === 0) return 0;
  const avg = sum / valid;
  return assertFinite(avg * QUALITY_COMPONENT_CAPS.dataAge, "quality.dataAge");
}

function scoreRangeSpread(range: VerdictRange | null, benchmarkVariance: number | undefined): number {
  if (range === null) return QUALITY_COMPONENT_CAPS.rangeSpread; // non-numeric verdicts take full credit
  if (range.mid === 0) {
    // Avoid division-by-zero; fall back to half credit.
    return QUALITY_COMPONENT_CAPS.rangeSpread * RANGE_SPREAD_FALLBACK_CREDIT;
  }
  const spreadRatio = (range.high - range.low) / Math.abs(range.mid);
  const benchmarkSpreadRatio = benchmarkVariance ?? DEFAULT_BENCHMARK_SPREAD_RATIO;
  if (benchmarkSpreadRatio <= 0) {
    return QUALITY_COMPONENT_CAPS.rangeSpread * RANGE_SPREAD_FALLBACK_CREDIT;
  }
  // Narrower range vs benchmark → higher score. Clamp to [0,1].
  const raw = 1 - spreadRatio / (BENCHMARK_SPREAD_TOLERANCE_MULTIPLIER * benchmarkSpreadRatio);
  const clamped = Math.min(1, Math.max(0, raw));
  return assertFinite(clamped * QUALITY_COMPONENT_CAPS.rangeSpread, "quality.rangeSpread");
}

function scoreConsensus(consensusRatio: number | undefined): number {
  const r = consensusRatio ?? DEFAULT_CONSENSUS_RATIO;
  if (!Number.isFinite(r)) return DEFAULT_CONSENSUS_RATIO * QUALITY_COMPONENT_CAPS.consensus;
  const clamped = Math.min(1, Math.max(0, r));
  return assertFinite(clamped * QUALITY_COMPONENT_CAPS.consensus, "quality.consensus");
}

function scorePersonaFit(evidence: Evidence[]): number {
  if (evidence.length === 0) return 0;
  const avg = evidence.reduce((acc, e) => acc + e.personaFit, 0) / evidence.length;
  return assertFinite(avg * QUALITY_COMPONENT_CAPS.personaFit, "quality.personaFit");
}

// ────────────────────────────────────────────────────────────────────────────
// Factory
// ────────────────────────────────────────────────────────────────────────────

export function createQualityScorer(): QualityScorer {
  return {
    score(inputs: QualityInputs): QualityBreakdown {
      const now = inputs.now ?? new Date();
      const components = {
        sourceCount: scoreSourceCount(inputs.evidence),
        sourceMix: scoreSourceMix(inputs.evidence),
        dataAge: scoreDataAge(inputs.evidence, now),
        rangeSpread: scoreRangeSpread(inputs.range, inputs.benchmarkVariance),
        consensus: scoreConsensus(inputs.cognitiveConsensusRatio),
        personaFit: scorePersonaFit(inputs.evidence),
      };
      const total =
        components.sourceCount +
        components.sourceMix +
        components.dataAge +
        components.rangeSpread +
        components.consensus +
        components.personaFit;
      return {
        total: Math.round(Math.min(MAX_QUALITY_SCORE, Math.max(MIN_QUALITY_SCORE, total))),
        components,
      };
    },
  };
}
