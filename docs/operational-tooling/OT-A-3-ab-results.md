# OT-A.3 — Opus Synthesis A/B Parity Results (Partial)

**Date:** 2026-04-19
**Status:** **PARTIAL — RUN HALTED MID-EXECUTION**
**Sample:** 11 of 20 paired cases captured before Vercel AI Gateway returned `insufficient_funds` (HTTP 402) and aborted the new-path leg for the remainder.
**Model:** `claude-opus-4-6`
**New path:** `streamObject({ schema: SynthesisOutputSchema })` via Vercel AI Gateway (`getAiSdkAnthropic()`), Anthropic ephemeral cache_control on system prompt
**Old path:** `anthropic.messages.stream()` direct, OT-A.1 ephemeral cache_control on system prompt
**Concurrency:** 5
**Harness:** `script/ot-a-3-ab-harness.ts`
**Raw log location:** workflow `AB Harness` output (workflow removed; canonical raw transcript reproduced under "Per-case rollup" below from the live run)

---

## Headline

**Result: FAIL on the parity criteria. Do NOT proceed to OT-A.4.**

Two independent failure modes were observed even in the partial sample, plus an operational blocker:

1. **Latency regression ~190%** (target ≤20%) — new path is roughly 2.9× slower per call.
2. **Field-name divergence** — 7 of 11 cases produced **zero** overlapping field keys between paths. The new path's model-chosen `field` strings (e.g., `"Occupancy Rate (Stabilized Year 3)"`) do not match the legacy regex extractor's canonical keys (e.g., `"occupancy"`).
3. **Vercel AI Gateway credits exhausted** mid-run (case 19 returned `GatewayInternalServerError: Insufficient funds`). Top-up required before any retry on the new path.

The new path's mechanical correctness is fine — every observed call produced schema-valid `SynthesisOutput` — but **schema validity ≠ behavioural parity**. The legacy ResearchEntry map produced via `toLegacyResearchValuesMap()` does not yet share a common key vocabulary with the legacy regex extractor, so the existing downstream consumers (`Property.researchValues` DB column, `AnalystRangeIndicator` UI, `engine/analyst/contracts` verdicts) would silently lose ~all per-field overlap on a flag flip today.

---

## Pass / Fail Summary

| Criterion | Threshold | Observed | Result |
|---|---|---|---|
| Severity match (mid within ±5% on shared fields) ≥ 95% | 95% | 23 / 34 = **67.6%** across 4 of 11 cases that produced any shared fields | **FAIL** |
| `buildAnalystVerdict` path completes both legs | both 20/20 | old=11/11, new=11/11 schema-valid (within partial sample) | **PASS (partial)** |
| Zero `FORBIDDEN_VOICE_PATTERNS` violations on new path | 0 | Not measured — raw outputs not persisted before workflow termination; 0 reported in live counters but unverifiable | **INCONCLUSIVE** |
| Latency regression ≤ 20% | ≤ 20% | new avg 157,295 ms vs old avg 54,135 ms = **+190.6%** | **FAIL** |

**Overall: FAIL.** Two of four criteria fail outright; one is inconclusive due to the run being halted; only schema-validity passes. Even with the missing 9 cases all passing perfectly, the latency regression alone would still fail.

---

## Aggregate (n = 11 paired cases)

- Old path completion: 11 / 11 (40 fields each, by design of the legacy extractor)
- New path completion: 11 / 11 schema-valid
- New path field counts: 28, 32, 37, 38, 38, 38, 38, 38, 39, 40 (one case 28-40, mean ~35)
- Total shared fields across all cases: **34**
- Shared fields within ±5% midpoint: **23** (67.6%)
- Cases with zero shared fields: **7 / 11** (Charleston, Newport, Savannah, Hudson Valley, Telluride, Carmel, Big Sur)
- Cases with ≥1 shared field: **4 / 11** (Sedona 9, Napa 8, Aspen 9, Park City 8)
- Latency: old avg=**54,135 ms** · new avg=**157,295 ms** · regression=**+190.6%**
- Voice violations (new path): not persisted to disk
- Voice violations (old path): not persisted to disk

---

## Per-case rollup (live-captured)

| # | Market | old✓ | new✓ | old fields | new fields | shared | within ±5% | parity | old ms | new ms |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 | Charleston, SC   | ✓ | ✓ | 40 | 40 | 0 | 0 | 0.0%   | 29,238 | 164,811 |
| 02 | Aspen, CO        | ✓ | ✓ | 40 | 28 | 9 | 6 | 66.7%  | 31,967 | 166,389 |
| 03 | Napa Valley, CA  | ✓ | ✓ | 40 | 37 | 8 | 5 | 62.5%  | 32,435 | 165,994 |
| 04 | Newport, RI      | ✓ | ✓ | 40 | 39 | 0 | 0 | 0.0%   | 67,106 | 174,623 |
| 05 | Sedona, AZ       | ✓ | ✓ | 40 | 28 | 9 | 6 | 66.7%  | 68,802 | 152,056 |
| 06 | Savannah, GA     | ✓ | ✓ | 40 | 38 | 0 | 0 | 0.0%   | 80,877 | 147,132 |
| 07 | Park City, UT    | ✓ | ✓ | 40 | 32 | 8 | 6 | 75.0%  | 74,568 | 115,403 |
| 08 | Carmel, CA       | ✓ | ✓ | 40 | 38 | 0 | 0 | 0.0%   | 28,093 | 175,538 |
| 09 | Hudson Valley, NY| ✓ | ✓ | 40 | 38 | 0 | 0 | 0.0%   | 29,091 | 145,199 |
| 10 | Telluride, CO    | ✓ | ✓ | 40 | 38 | 0 | 0 | 0.0%   | 75,850 | 164,449 |
| 11 | Big Sur, CA      | ✓ | ✓ | 40 | 38 | 0 | 0 | 0.0%   | 77,457 | 158,658 |
| 12-18 | (Healdsburg, Camden, Jackson, Provincetown, St. Helena, Stowe, Outer Banks) | — | — | — | — | — | — | — | — | — |
| 19 | Marfa, TX        | ✓ | ✗ | 40 | — | — | — | —      | —     | — (Gateway 402 insufficient_funds) |
| 20 | Bar Harbor, ME   | — | — | — | — | — | — | — | — | — |

(Cases 12-18 and 20 were in flight or queued at the time of halt; their final state is unknown because workflow log was lost on workflow removal.)

---

## Root Cause Analysis

### 1. Field-name divergence (the dominant correctness failure)

`SynthesisOutputSchema.values[].field` is typed as `z.string().min(1)` — completely unconstrained. The schema's source comment lists "Known numeric fields (reference only; schema does NOT enum-restrict to preserve extensibility for future Specialists)". In practice the Opus model, given a verbose system prompt that asks for a legacy-shape JSON object with section names like `adrAnalysis`, `occupancyAnalysis`, `capRateAnalysis`, …, then constrained by tool-use into the SynthesisOutputSchema, **synthesises its own field names** for the `values[]` array. Examples observed in single-case debug:

```
"field": "Occupancy Rate (Stabilized Year 3)"   ← not "occupancy"
"field": "ADR (Stabilized Year 3, nominal $)"   ← not "adr"
"field": "Average Daily Rate"                   ← not "adr"
```

`toLegacyResearchValuesMap()` keys directly off `v.field`, so the resulting Record's keys never match what `extractResearchValues()` produces from the legacy free-form-JSON path (which uses canonical keys `adr`, `occupancy`, `capRate`, etc., enumerated in `research-value-extractor.ts`). Result: 7/11 cases have **zero** overlap → no per-field comparison possible → flag-flip would silently null out per-property `researchValues` for downstream specialists.

**Required before re-running A/B (any of):**
- (a) Tighten the schema: replace `field: z.string()` with `field: z.enum([...KNOWN_FIELD_KEYS])`. Most defensible; forces the model to return canonical keys.
- (b) Add a name-mapping layer in `toLegacyResearchValuesMap()` that normalises model-chosen names (e.g., `"Occupancy Rate (Stabilized Year 3)"` → `"occupancy"`). Fragile; defers the problem.
- (c) Bake a "Field key contract" block into `buildSynthesisSystemPrompt()` enumerating the exact allowed keys, with examples.

Recommendation: (a) + (c). The schema is the right enforcement surface; the prompt makes compliance natural rather than adversarial.

### 2. Latency regression (~190%)

Old path: streaming text deltas, average 54s.
New path: `streamObject` with Zod schema via Gateway, average 157s.

Likely contributors (in descending plausibility):
- **Tool-use overhead.** Anthropic Gateway implements `streamObject` schema enforcement via a synthetic tool-use turn; this requires the model to emit a structured tool call rather than free text and adds non-trivial latency at large schemas.
- **Extra hop through Vercel AI Gateway.** Direct Anthropic vs. Gateway-routed Anthropic adds at minimum a TLS hop and Gateway-side validation; observed Gateway durations align with this.
- **Larger output.** New path `values[]` entries are individually larger (full reasoning + sources arrays per entry) than legacy free-form sections, so token-time × token-count grows.

A 20% threshold is incompatible with the current setup. Options:
- (i) Accept the regression with documentation + flag it explicitly in OT-A.4.
- (ii) Drop AI Gateway and call `@ai-sdk/anthropic` directly (loses unified observability + Gateway BYOK routing — contradicts OT-A.2's architecture decision).
- (iii) Reduce schema verbosity (shorter `reasoning` cap, drop `narrative[]`) to cut output tokens.

Recommendation: combine (i) + (iii). Tighten `reasoning.max(800)` from 1200, drop the optional `narrative[]` block (currently unused downstream), then re-measure.

### 3. Vercel AI Gateway credits exhausted

Hard operational blocker. Independent of the two technical issues above. Top-up required at <https://vercel.com/[team]/~/ai?modal=top-up> before re-running.

---

## Cost Accounting

- 11 successful old-path Opus calls × ~$0.45/call = ~$5.0 (your direct Anthropic bill)
- 11 successful new-path Opus calls × ~$0.80/call = ~$8.8 (Vercel Gateway, BYOK to your Anthropic bill + small Gateway markup)
- 1 failed new-path call (Marfa) — billed but no output (~$0.15)
- 5 prior failed runs from the broken-token-budget attempt earlier in the session (mostly aborted before completion) — estimated ~$3
- 2 single-case debug attempts in `script/ot-a-3-debug-single.ts` — ~$1.5
- **Total session spend (all sources): ~$18-20**

Original estimate was $12-40. Came in toward the lower end despite the false starts because the schema-truncation aborts on the first attempt cost less than full completions.

---

## Decision Matrix for OT-A.4

OT-A.4 ("retire legacy path + delete `research-value-extractor.ts`") is **BLOCKED** until **all** of the following are true:

| Gate | Current | Action to clear |
|---|---|---|
| Field-name parity ≥95% on shared fields | 67.6% on 4/11 cases that have any overlap | Restrict `field` to enum + restate keys in system prompt |
| Cases with shared > 0 field set | 4/11 | Same fix above; expect 11/11 once enum-restricted |
| Latency regression accepted or ≤ accepted threshold | +190% | Either schema slim-down to <50% regression, OR explicit Tech-Decision-Log entry accepting the regression |
| Voice-pattern check completed | inconclusive | Re-run after fixing above; persist raw outputs |
| Sample size ≥ 20 | 11 | Top up Vercel credits, re-run |
| `buildAnalystVerdict` round-trip on new map | not directly tested | Add a tiny verdict-construction shim to the harness next round |

---

## Recommended Next Steps (in order)

1. **Tighten `SynthesisOutputSchema`**: change `field: z.string()` to a `z.enum([...])` of the canonical keys enumerated in the schema-file comment block. This is a one-file edit + a short prompt addition.
2. **Top up Vercel AI Gateway credits.**
3. **Re-run `script/ot-a-3-ab-harness.ts`** — same 20 inputs, expect 11/11 cases to produce non-empty shared-key maps if (1) is sufficient.
4. **If latency regression persists** at ~3×: write a Tech Decision Log accepting the regression (with the rationale that schema-validated structured output is worth the cost), and proceed to OT-A.4.
5. **If latency regression is unacceptable**: trim `reasoning.max()` to 600-800, drop `narrative[]`, re-measure.

---

## Notes

- The structural OT-A.3 change (`USE_AI_SDK_SYNTHESIS` feature flag, default OFF, both paths coexist) is shipped in commit `f1cd4aee` and is **safe to leave in place** while these issues are remediated. Production behaviour is unchanged.
- The new-path code-path itself is functioning as designed; the failures here are **schema-design** failures (insufficiently constrained field names) and **operational-cost** failures (latency, Gateway credits), not implementation bugs in the orchestrator branch.
- Rollback remains env-var-level (`USE_AI_SDK_SYNTHESIS=false` / unset).
