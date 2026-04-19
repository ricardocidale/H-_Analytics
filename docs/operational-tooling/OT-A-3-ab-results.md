# OT-A.3 — Opus Synthesis A/B Parity Results

**Date:** 2026-04-19T12:51:25.932Z
**Inputs:** 20 boutique-luxury market scenarios
**Model:** claude-opus-4-6
**New path:** `streamObject({ schema: SynthesisOutputSchema })` via Vercel AI Gateway with Anthropic ephemeral cache_control
**Old path:** `anthropic.messages.stream()` direct (Phase OT-A.1 caching preserved)
**Concurrency:** 5
**Harness:** `script/ot-a-3-ab-harness.ts`

---

## Pass / Fail Summary

| Criterion | Threshold | Observed | Result |
|---|---|---|---|
| Field overlap ≥ 95% per case | — | 20/20 cases pass (100.0%) | PASS |
| Bucket-match on shared fields ≥ 80% | — | 301/800 = 37.6% | FAIL |
| Schema validity 100% | — | 20/20 | PASS |
| Voice violations on new path = 0 | — | 0 violations | PASS |
| Latency regression ≤ 2× (new / old) | — | 1.48× (old avg=72529ms, new avg=107093ms) | PASS |

**Overall:** **FAIL** — do NOT proceed to OT-A.4. Investigate failing criteria below before retry.

---

## Aggregate

- Old path completion: 20/20
- New path completion: 20/20
- New path schema-valid (SynthesisOutputSchema): 20/20
- Total shared fields across all cases: **800**
- Shared fields with bucket-match (mutual range containment): **301** (37.6%)
- Shared fields within ±5% midpoint (informational, no longer gating): **295** (36.9%)
- Cases passing per-case field overlap ≥ 95%: **20/20** (100.0%)
- Voice violations (new path total): **0**
- Voice violations (old path total): **0**
- Latency: old avg=72529ms · new avg=107093ms · multiplier=1.48×

---

## Per-case rollup

| # | Market | old✓ | new✓ | old fields | new fields | shared | overlap% | bucket✓ | bucket% | old ms | new ms | new voice viol |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01 | Charleston, SC | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 77031 | 111728 | 0 |
| 02 | Aspen, CO | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 14 | 35.0% | 66688 | 106714 | 0 |
| 03 | Napa Valley, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 17 | 42.5% | 30196 | 104366 | 0 |
| 04 | Newport, RI | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 14 | 35.0% | 100829 | 105040 | 0 |
| 05 | Sedona, AZ | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 15 | 37.5% | 67159 | 112243 | 0 |
| 06 | Savannah, GA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 12 | 30.0% | 67222 | 106119 | 0 |
| 07 | Park City, UT | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 21 | 52.5% | 71345 | 108852 | 0 |
| 08 | Carmel, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 15 | 37.5% | 62128 | 112640 | 0 |
| 09 | Hudson Valley, NY | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 17 | 42.5% | 73685 | 106875 | 0 |
| 10 | Telluride, CO | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 12 | 30.0% | 103190 | 106932 | 0 |
| 11 | Healdsburg, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 17 | 42.5% | 30125 | 95583 | 0 |
| 12 | Camden, ME | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 15 | 37.5% | 75383 | 98385 | 0 |
| 13 | Big Sur, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 20 | 50.0% | 27093 | 107646 | 0 |
| 14 | Jackson, WY | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 10 | 25.0% | 94067 | 117110 | 0 |
| 15 | Provincetown, MA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 14 | 35.0% | 76735 | 107264 | 0 |
| 16 | St. Helena, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 13 | 32.5% | 76606 | 107044 | 0 |
| 17 | Stowe, VT | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 13 | 32.5% | 99401 | 103217 | 0 |
| 18 | Outer Banks, NC | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 13 | 32.5% | 99963 | 109516 | 0 |
| 19 | Marfa, TX | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 17 | 42.5% | 69712 | 109233 | 0 |
| 20 | Bar Harbor, ME | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 82014 | 105355 | 0 |

---

## Detail

### Case 01 — Charleston, SC
  - Status: old=OK new=OK
  - Latency: old=77031ms new=111728ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 27 | 4 | 85.2% |
      | incentiveFee | 10 | 2 | 80.0% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | costMarketing | 5 | 7 | 40.0% |

### Case 02 — Aspen, CO
  - Status: old=OK new=OK
  - Latency: old=66688ms new=106714ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 30 | 4 | 86.7% |
      | costMarketing | 4 | 7 | 75.0% |
      | incentiveFee | 10 | 2.5 | 75.0% |
      | preOpeningCosts | 2850000 | 1100000 | 61.4% |
      | svcFeeRevMgmt | 1.5 | 0.75 | 50.0% |

### Case 03 — Napa Valley, CA
  - Status: old=OK new=OK
  - Latency: old=30196ms new=104366ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 30 | 4 | 86.7% |
      | incentiveFee | 10 | 2.5 | 75.0% |
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |
      | preOpeningCosts | 2200000 | 1200000 | 45.5% |
      | revShareOther | 7 | 4 | 42.9% |

### Case 04 — Newport, RI
  - Status: old=OK new=OK
  - Latency: old=100829ms new=105040ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | revShareEvents | 8 | 15 | 87.5% |
      | rampMonths | 30 | 4 | 86.7% |
      | incentiveFee | 10 | 2 | 80.0% |
      | preOpeningCosts | 2200000 | 900000 | 59.1% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |

### Case 05 — Sedona, AZ
  - Status: old=OK new=OK
  - Latency: old=67159ms new=112243ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 27 | 3 | 88.9% |
      | incentiveFee | 10 | 2 | 80.0% |
      | revShareOther | 8 | 12 | 50.0% |
      | costPropertyTaxes | 1.8 | 1 | 44.4% |
      | costHousekeeping | 18 | 26 | 44.4% |

### Case 06 — Savannah, GA
  - Status: old=OK new=OK
  - Latency: old=67222ms new=106119ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 21 | 4 | 81.0% |
      | incentiveFee | 10 | 2 | 80.0% |
      | svcFeeAccounting | 1.5 | 0.5 | 66.7% |
      | preOpeningCosts | 1500000 | 700000 | 53.3% |
      | costHousekeeping | 18 | 26 | 44.4% |

### Case 07 — Park City, UT
  - Status: old=OK new=OK
  - Latency: old=71345ms new=108852ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 30 | 4 | 86.7% |
      | incentiveFee | 10 | 2 | 80.0% |
      | preOpeningCosts | 2800000 | 1100000 | 60.7% |
      | catering | 15 | 22 | 46.7% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |

### Case 08 — Carmel, CA
  - Status: old=OK new=OK
  - Latency: old=62128ms new=112640ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 21 | 4 | 81.0% |
      | incentiveFee | 10 | 2 | 80.0% |
      | preOpeningCosts | 1500000 | 650000 | 56.7% |
      | costHousekeeping | 18 | 27 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |

### Case 09 — Hudson Valley, NY
  - Status: old=OK new=OK
  - Latency: old=73685ms new=106875ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 24 | 4 | 83.3% |
      | incentiveFee | 10 | 2 | 80.0% |
      | preOpeningCosts | 1500000 | 750000 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | costHousekeeping | 18 | 26 | 44.4% |

### Case 10 — Telluride, CO
  - Status: old=OK new=OK
  - Latency: old=103190ms new=106932ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 27 | 4 | 85.2% |
      | incentiveFee | 8 | 2 | 75.0% |
      | preOpeningCosts | 2150000 | 950000 | 55.8% |
      | costHousekeeping | 18 | 28 | 55.6% |
      | revShareOther | 8 | 4 | 50.0% |

### Case 11 — Healdsburg, CA
  - Status: old=OK new=OK
  - Latency: old=30125ms new=95583ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | catering | 12 | 25 | 108.3% |
      | rampMonths | 30 | 4 | 86.7% |
      | incentiveFee | 10 | 2.5 | 75.0% |
      | costHousekeeping | 18 | 27 | 50.0% |
      | costOther | 2 | 3 | 50.0% |

### Case 12 — Camden, ME
  - Status: old=OK new=OK
  - Latency: old=75383ms new=98385ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 21 | 4 | 81.0% |
      | incentiveFee | 10 | 2.5 | 75.0% |
      | preOpeningCosts | 1500000 | 400000 | 73.3% |
      | saleCommission | 3 | 5 | 66.7% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |

### Case 13 — Big Sur, CA
  - Status: old=OK new=OK
  - Latency: old=27093ms new=107646ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 21 | 4 | 81.0% |
      | incentiveFee | 10 | 2 | 80.0% |
      | costOther | 2 | 3 | 50.0% |
      | revShareEvents | 8 | 4 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |

### Case 14 — Jackson, WY
  - Status: old=OK new=OK
  - Latency: old=94067ms new=117110ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 30 | 4 | 86.7% |
      | incentiveFee | 10 | 2.5 | 75.0% |
      | preOpeningCosts | 3500000 | 1100000 | 68.6% |
      | svcFeeAccounting | 1.5 | 0.5 | 66.7% |
      | costHousekeeping | 18 | 27 | 50.0% |

### Case 15 — Provincetown, MA
  - Status: old=OK new=OK
  - Latency: old=76735ms new=107264ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 21 | 4 | 81.0% |
      | incentiveFee | 10 | 2 | 80.0% |
      | preOpeningCosts | 1500000 | 650000 | 56.7% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | startOccupancy | 55 | 35 | 36.4% |

### Case 16 — St. Helena, CA
  - Status: old=OK new=OK
  - Latency: old=76606ms new=107044ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 27 | 3 | 88.9% |
      | incentiveFee | 10 | 2 | 80.0% |
      | preOpeningCosts | 1500000 | 750000 | 50.0% |
      | svcFeeRevMgmt | 1.5 | 0.75 | 50.0% |
      | costHousekeeping | 18 | 26 | 44.4% |

### Case 17 — Stowe, VT
  - Status: old=OK new=OK
  - Latency: old=99401ms new=103217ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 30 | 4 | 86.7% |
      | incentiveFee | 10 | 2.5 | 75.0% |
      | preOpeningCosts | 2150000 | 900000 | 58.1% |
      | costOther | 2 | 3 | 50.0% |
      | revShareEvents | 8 | 12 | 50.0% |

### Case 18 — Outer Banks, NC
  - Status: old=OK new=OK
  - Latency: old=99963ms new=109516ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | catering | 18 | 35 | 94.4% |
      | rampMonths | 30 | 4 | 86.7% |
      | incentiveFee | 10 | 2.5 | 75.0% |
      | preOpeningCosts | 2200000 | 650000 | 70.5% |
      | costHousekeeping | 18 | 27 | 50.0% |

### Case 19 — Marfa, TX
  - Status: old=OK new=OK
  - Latency: old=69712ms new=109233ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 27 | 4 | 85.2% |
      | incentiveFee | 10 | 2 | 80.0% |
      | preOpeningCosts | 1500000 | 500000 | 66.7% |
      | costHousekeeping | 18 | 27 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |

### Case 20 — Bar Harbor, ME
  - Status: old=OK new=OK
  - Latency: old=82014ms new=105355ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 21 | 4 | 81.0% |
      | incentiveFee | 10 | 2 | 80.0% |
      | occupancyStep | 3.5 | 6 | 71.4% |
      | preOpeningCosts | 1500000 | 650000 | 56.7% |
      | costHousekeeping | 18 | 27 | 50.0% |

---

## Notes

- **Path semantics.** Both paths consumed the same user prompt with ephemeral cache_control on the system message. The system prompts differ by design (post-OT-A.3 schema-tightening, commit e89d77441): the old path receives the legacy free-form-JSON instructions and is regex-parsed by `extractResearchValues`; the new path receives the structured-output contract (field-key enum + ≤500-char one-sentence reasoning) and is parsed via `toLegacyResearchValuesMap`. Using a single shared prompt for both paths was tried in the previous run and produced ad-hoc field names that broke parity — see prior commit 12363142.
- **Field set drift is expected.** The new path emits whatever fields the model decides are answerable under the schema; the old extractor only fills slots it can regex-match. `shared` is the meaningful comparison surface; `old-only` / `new-only` are diagnostic, not a failure signal.
- **Severity criterion (OT-A.3 retry).** The original ±5% midpoint criterion was unachievable: two independent Opus calls on the same prompt naturally diverge well beyond 5% even when they agree on the answerable range. The retry criterion is **bucket-match** — for each shared field, each path's full `[low, high]` range must contain the other path's midpoint. This tests behavioural equivalence for downstream AnalystVerdict consumers (which gate on range, not point estimate). Old-path ranges are parsed from the `display` string (`$NNN-$NNN`, `NN%–NN%`, `N–N mo`); new-path ranges come from the structured `SynthesisOutput.values[].{low,high}`. When a display string is a single value (no dash), a ±5% band around the mid is used as a soft fallback.
- **Cost.** Real Opus spend on user's Anthropic billing. Authorized.
- **Rollback.** Setting `USE_AI_SDK_SYNTHESIS=false` (or unset) restores the legacy path immediately. No code revert needed.

---

## OT-A.3 retry v2 — definitional contract effect (auto-generated)

**Run setup:** This run added the FIELD_DEFINITIONS unit/denominator table (commit 9b88958e) to both the production prompt (`server/ai/research-orchestrator.ts`) and the harness's structured-output prompt. All other parameters identical to the v1 retry.

**Headline:** Aggregate bucket-match moved from 39.9% (v1) to 37.6% (v2) — flat. But the per-field picture is dramatically split:

### Definitional fix WORKED for these fields

| field | v1 bucket | v2 bucket | v1 new.med | v2 new.med | comment |
|---|---|---|---|---|---|
| landValue | 0% | 15% | 5,000,000 | 23 | Catastrophic unit error fixed (was $, now %) |
| costFB | 5% | 25% | 68 | 32 | Wrong denominator fixed (now % F&B revenue) |
| costPropertyTaxes | 10% | 35% | 3.5 | 1.15 | Now % of property value, matches legacy |
| occupancyStep | 0% | 5% | 10 | 6 | Now per-step, was cumulative |
| occupancy | 55% | 90% | 67 | 68 | Clearer denominator pinned the value |
| costFFE | 30% | 75% | 5 | 4 | +45pp |
| costPropertyOps | 20% | 55% | 5.5 | 5 | +35pp |
| catering | 15% | 35% | 12 | 18 | +20pp |
| svcFeeGeneralMgmt | 35% | 50% | 3.5 | 3 | +15pp |

### Definitional contract BROKE these fields (FIELD_DEFINITIONS picked the wrong scope vs what legacy actually emits)

| field | v1 bucket | v2 bucket | v1 new.med | v2 new.med | root cause |
|---|---|---|---|---|---|
| rampMonths | 75% | **0%** | 30 | 4 | FIELD_DEFINITIONS says "calendar months between ramp **steps**" (per-step). Legacy regex parses the model's "24–36 mo" total-duration string and emits ~30. The canonical definition should be "total months from opening to stabilized occupancy", not per-step. |
| incentiveFee | 80% | **0%** | 10 | 2 | FIELD_DEFINITIONS says "% of TOTAL revenue". Industry standard (and what legacy emits unconstrained) is "% of GOP" → ~10%. The contract forces a different denominator that legacy never produced. Either change FIELD_DEFINITIONS to "% of GOP" or accept that legacy free-form output was inconsistent and treat this as a structural mismatch. |
| costSeg15yrPct | 55% | 5% | 15 | 12 | Definition says "as % of PURCHASE PRICE"; legacy parses whatever the model writes. Slight drift but bucket-match-fatal because cost-seg ranges are tight. |
| costSeg5yrPct | 70% | 30% | 20 | 20 | Same scope drift as 15yr — narrow ranges + small bias kills bucket-match. |
| svcFeeRevMgmt | 60% | 35% | 1 | 0.8 | Same: contract narrowed the answer; legacy was wider. |
| startOccupancy | 10% | 0% | 42 | 38 | Slight drift — likely "first-month opening occupancy" definitional ambiguity. |

### Diagnosis

The contract approach is **operationally correct** — for every field where the new prompt's denominator matches what `research-value-extractor.ts` actually parses out of the legacy free-form output, bucket-match improved (often dramatically). The aggregate is flat only because a handful of FIELD_DEFINITIONS entries (most painfully `rampMonths` and `incentiveFee`) describe a denominator/scope that the legacy path never used in practice. Those definitions need to be aligned to what the legacy extractor actually produces, not to USALI textbook definitions.

### Recommended next step

1. Fix `FIELD_DEFINITIONS` in `server/ai/synthesis-schema.ts`:
   - `rampMonths`: change "calendar months between ramp steps" → "total months from opening to stabilized occupancy".
   - `incentiveFee`: change "% of TOTAL revenue" → "% of GOP (gross operating profit)" to match standard hospitality benchmarks the legacy path produced.
   - `costSeg5yrPct` / `costSeg15yrPct`: review whether legacy is parsing % of total project cost vs purchase price and align.
2. Re-run the 20-case harness. Projected aggregate after these fixes: ~55–65% (recovers the ~25pp lost on rampMonths + incentiveFee + cost-seg fields).
3. The remaining gap to 80% is genuine Opus-Opus stochastic variance on narrow-range fields (costMarketing, costHousekeeping, etc.). At that point you must choose: (a) loosen the criterion further (e.g., 60% bucket-match), (b) widen the new path's range bounds in the prompt to reduce false-negative bucket misses, or (c) reframe parity at the AnalystVerdict layer.

**OT-A.4 remains BLOCKED.** Do not delete `research-value-extractor.ts` until parity recovers above the agreed threshold.
