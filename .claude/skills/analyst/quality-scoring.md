# Skill: Quality Scorer

**Status:** Primitives exist (`shared/analyst-conviction.ts`); unified scorer lands in Phase 3 at `engine/analyst/quality/quality-scorer.ts`.
**Descriptive companion:** `docs/architecture/analyst/quality-scoring.md`.
**Parent skill:** `_index.md`.

---

## What this skill covers

Directive guidance for implementing and evolving the Quality Scorer — the component that produces the 0-100 `qualityScore` every `AnalystVerdict` dimension carries. Quality scoring is what keeps conviction levels comparable across all ~12 Specialists.

---

## Why it matters

The persona rule is non-negotiable: "NEVER show a range without a conviction level." Without a unified scorer, each Specialist invents its own confidence heuristic and badges become incomparable ("High" from the Funding Specialist would mean something different from "High" on the Revenue Specialist). That's product-breaking. One scorer, one formula, one consistent meaning.

---

## Today's primitives

- **`shared/analyst-conviction.ts`** — `CONVICTION_FLOOR = 40`, `MIN_SOURCES_FOR_ADVICE = 1`, `meetsConvictionFloor(score)`, `insufficientDataMessage(score)`. Used by field-alert paths.
- **`server/ai/confidence-scorer.ts`** — produces conviction tiers (High / Moderate / Developing) from raw evidence signals. Used inside the Cognitive Engine.

**The gap:** these two don't share inputs and don't produce comparable scores. Tab Specialists (`capitalRaiseEvaluator`, `revenueEvaluator`) use neither. Phase 3 unifies them into a single `scoreQuality()`.

---

## The 6-component weighted formula

```ts
export interface QualityInputs {
  evidence: Evidence[];              // from the verdict
  range: VerdictRange | null;        // from the verdict
  benchmarkVariance?: number;        // benchmark's own range spread when known
  cognitiveConsensusRatio?: number;  // from research-orchestrator Phase 2 output
  persona: { segment: string; tier: string; market: string };
}

export function scoreQuality(inputs: QualityInputs): number; // 0-100
```

| Component | Weight | Source |
|---|---|---|
| Source count vs minimum | 15% | existing `MIN_SOURCES_FOR_ADVICE` / N+1 rule |
| Source mix tier (`db_table > api > web > estimated`) | 20% | evidence tier field |
| Data age (days since `evidence.asOf`) | 15% | existing staleness-detector semantics |
| Range spread vs benchmark variance | 15% | narrower range relative to benchmark = higher score |
| Cross-source convergence (`consensusRatio`) | 20% | from `research-orchestrator.ts` Phase 2 output |
| Persona fit | 15% | averaged `evidence.personaFit` (0-1 per source) |

Weights are subject to calibration in Phase 3 against the persona-keyed test bench. Changes to weights require an ADR.

---

## Hard rules

### 1. Score every dimension that carries a range

If `range` is non-null on a `VerdictDimension`, `qualityScore` MUST be computed — no shortcuts, no `null`, no `0` placeholder. A verdict with a range and no qualityScore is incomplete (blocked by the Voice Renderer which refuses to render).

### 2. Conviction-floor enforcement lives in the Router, not here

The Quality Scorer produces the number. The **Surface Router** decides what to do with below-floor scores (downgrade severity, emit "developing data" voice, etc.). The Scorer itself does NOT make advise/withhold decisions.

If your PR adds a conditional like `if (score < 40) return null` inside `quality-scorer.ts`, that's a violation. Return the number; let the Router decide.

### 3. The badge-label map lives in the Voice Renderer, not here

```
80-100 → "high conviction"
60-79  → "moderate conviction"
40-59  → "developing conviction"
< 40   → verdict downgraded, voice notes "developing data"
```

This table lives in `voice.md`. The Scorer produces the number only. Invented label categories in the Scorer are a violation.

### 4. Weights are ADR-gated

Changing the 6-component weighting requires an ADR at `docs/architecture/decisions/ADR-NNN-quality-weights-<reason>.md`. Ad-hoc weight tweaks in a feature PR are a violation — every Specialist depends on stable weightings.

### 5. Persona-fit is the Specialist's responsibility

`evidence.personaFit` (0-1 per source) is set BY the Specialist when constructing evidence, not computed BY the Scorer. The Specialist knows its persona; the Scorer does not. If a Specialist submits evidence without `personaFit`, that's a bug in the Specialist, not the Scorer.

---

## Persona-fit detail

Examples for an L+B-segment evaluation:

| Source | personaFit |
|---|---|
| HVS Boutique-Luxury report | 1.0 |
| HVS Select-Service report | 0.4 |
| AHLA full-industry report | 0.6 |
| Local newspaper article | 0.2 |
| Country-wide hospitality benchmark | 0.5 |

The Specialist scores this. Cognitive Engine output pre-tags sources so Engine-driven evidence has personaFit populated automatically; constants-backed evidence is scored by the Specialist.

---

## Range-spread component detail

For a numeric verdict, range tightness signals confidence:

```ts
const spreadRatio = (range.high - range.low) / range.mid;
const benchmarkSpreadRatio = benchmarkVariance ?? 0.3; // fallback
const rangeComponent = clamp(1 - spreadRatio / (2 * benchmarkSpreadRatio), 0, 1) * 100;
```

A narrower range than the benchmark → higher component score. A range wider than the benchmark → lower component score. The formula is documented explicitly so adjustments are auditable.

---

## Cross-source convergence

`cognitiveConsensusRatio` comes from `research-orchestrator.ts` Phase 2 API validation (`validation.consensusRatio` — fraction of metrics where both Cognitive Panels agreed). For Tier-0 verdicts (no Cognitive Engine call), pass `undefined` and the Scorer weights the remaining components up.

---

## What the Scorer does NOT do

- It does NOT classify staleness (that's the Staleness Specialist's job).
- It does NOT produce user-facing conviction labels (that's the Voice Renderer).
- It does NOT enforce the conviction floor (that's the Surface Router).
- It does NOT decide which sources to cite (that's the Specialist).
- It does NOT invoke the Cognitive Engine (it receives `consensusRatio` as input when applicable).

The Scorer's only job is producing a consistent number.

---

## Testing (Phase 3)

`tests/analyst/quality/quality-scorer.test.ts` asserts:

1. Identical inputs produce identical outputs (purity).
2. Each of the 6 components is tested in isolation (vary one, hold others).
3. Boundary tests at 0, 39, 40, 59, 60, 79, 80, 100.
4. The persona-keyed L+B fixtures in `lb.test.ts` produce the expected conviction tiers.

A weight change PR must update all four test layers and the ADR.

---

## Migration from today's primitives

- `shared/analyst-conviction.ts` stays. Its `CONVICTION_FLOOR` and `MIN_SOURCES_FOR_ADVICE` become inputs to `scoreQuality()`.
- `server/ai/confidence-scorer.ts` becomes an internal helper of the Cognitive Engine. Its outputs feed `cognitiveConsensusRatio` into `scoreQuality()`.
- `engine/analyst/quality/quality-scorer.ts` becomes the single public entry point.

No existing file is renamed in Phase 2; Phase 3 introduces the new file and backfills the two evaluators to use it.

---

## References

- `docs/architecture/analyst/quality-scoring.md` — descriptive spec
- `docs/architecture/ANALYST.md` — architecture spine
- `shared/analyst-conviction.ts` — today's floor/minimum primitives
- `server/ai/confidence-scorer.ts` — today's conviction tier producer
- `.claude/skills/analyst/voice.md` — badge-label map
- `.claude/skills/analyst/orchestrator.md` — conviction-floor decision point
- `.claude/skills/analyst/steward.md` — change-control gate for weight changes
- `.claude/rules/research-precision.md` — N+1 rule
