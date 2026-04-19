# Quality Scoring

**Status:** Primitives exist (`shared/analyst-conviction.ts`); unified scorer lands in Phase 3.
**Future home:** `engine/analyst/quality/quality-scorer.ts`
**Parent:** `docs/architecture/ANALYST.md`

---

## Why scoring matters

The persona rule is non-negotiable: **never show a range without a conviction level**. The Quality Scorer is what produces that conviction level, consistently, for every Specialist. Without a unified scorer, each Specialist invents its own confidence heuristic and the badges become incomparable.

---

## Today's primitives

`shared/analyst-conviction.ts` (39 lines) defines:

- `CONVICTION_FLOOR = 40`
- `MIN_SOURCES_FOR_ADVICE = 1`
- `meetsConvictionFloor(score)`
- `insufficientDataMessage(score)`

`server/ai/confidence-scorer.ts` produces conviction tiers (High / Moderate / Developing) from raw evidence signals. It is currently used inside the Cognitive Engine.

The gap: tab Specialists don't use `confidence-scorer.ts`. Field-alert paths use only `analyst-conviction.ts`. The two don't share inputs and don't produce comparable scores.

---

## The unified `qualityScore` (0-100)

Phase 3 introduces a single function:

```ts
export interface QualityInputs {
  evidence: Evidence[];           // from the verdict
  range: VerdictRange | null;     // from the verdict
  benchmarkVariance?: number;     // when known, the benchmark's own range spread
  cognitiveConsensusRatio?: number; // from research-orchestrator's API validation
  persona: { segment: string; tier: string; market: string };
}

export function scoreQuality(inputs: QualityInputs): number; // 0-100
```

It folds the existing primitives and three additions:

| Component | Weight | Source |
|---|---|---|
| Source count vs minimum | 15% | existing `MIN_SOURCES_FOR_ADVICE` / N+1 rule |
| Source mix tier (db_table > api > web > estimated) | 20% | existing in evidence; not previously folded into score |
| Data age (days since `evidence.asOf`) | 15% | existing `staleness-detector` semantics; not folded |
| Range spread vs benchmark variance | 15% | new — narrower range relative to benchmark = higher score |
| Cross-source convergence (`consensusRatio`) | 20% | from `research-orchestrator` Phase 2 output |
| Persona fit (does the source apply to L+B segment?) | 15% | new — `evidence.personaFit` averaged |

Weights subject to calibration in Phase 3 against the persona-keyed test bench.

---

## How the score is consumed

- **`< 40`** (below `CONVICTION_FLOOR`) → Specialist downgrades the dimension to `severity: "ok"` with voice `"Developing data — The Analyst will refine this as more sources land."`
- **40-59** ("Developing" badge) → render with caveat
- **60-79** ("Moderate" badge) → render normally
- **80-100** ("High" badge) → render with full conviction

The badge labels match what `confidence-scorer.ts` produces today, so the migration is internal.

---

## Persona-fit detail

`evidence.personaFit` is a 0-1 score answering: "How relevant is this source to the persona evaluating?" Examples for an L+B-segment evaluation:

- HVS Boutique-Luxury report → 1.0
- HVS Select-Service report → 0.4
- AHLA full-industry report → 0.6
- Local newspaper article → 0.2

The score is set by the Specialist when it constructs evidence (the Specialist knows its persona). Cognitive Engine output sets `personaFit` based on the source-tagging it already does.

---

## Range-spread component detail

For a numeric verdict, range tightness signals confidence: if every comparable source agrees the ADR is in [$280, $290], the score should be higher than if sources span [$200, $400]. Computed as:

```ts
const spreadRatio = (range.high - range.low) / range.mid;
const benchmarkSpreadRatio = benchmarkVariance ?? 0.3; // fallback default
const score = clamp(1 - spreadRatio / (2 * benchmarkSpreadRatio), 0, 1) * 100;
```

The Quality Scorer documents the formula explicitly so adjustments are auditable.

---

## What the scorer does NOT do

- It does not classify staleness (that's the Staleness Specialist).
- It does not compute conviction tiers in user-facing language (the badge label mapping is in `voice-renderer.ts`).
- It does not enforce the conviction floor (that's the Surface Router's decision based on the score).

The scorer's only job is producing a consistent number.
