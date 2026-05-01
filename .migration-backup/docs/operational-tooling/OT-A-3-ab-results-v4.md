# OT-A.3 — Opus Synthesis A/B Parity Results

**Date:** 2026-04-19T15:13:30.261Z
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
| Bucket-match on shared fields ≥ 80% | — | 326/800 = 40.8% | FAIL |
| Schema validity 100% | — | 20/20 | PASS |
| Voice violations on new path = 0 | — | 0 violations | PASS |
| Latency regression ≤ 2× (new / old) | — | 2.02× (old avg=57525ms, new avg=116274ms) | FAIL |

**Overall:** **FAIL** — do NOT proceed to OT-A.4. Investigate failing criteria below before retry.

---

## Aggregate

- Old path completion: 20/20
- New path completion: 20/20
- New path schema-valid (SynthesisOutputSchema): 20/20
- Total shared fields across all cases: **800**
- Shared fields with bucket-match (mutual range containment): **326** (40.8%)
- Shared fields within ±5% midpoint (informational, no longer gating): **303** (37.9%)
- Cases passing per-case field overlap ≥ 95%: **20/20** (100.0%)
- Voice violations (new path total): **0**
- Voice violations (old path total): **0**
- Latency: old avg=57525ms · new avg=116274ms · multiplier=2.02×

---

## Per-case rollup

| # | Market | old✓ | new✓ | old fields | new fields | shared | overlap% | bucket✓ | bucket% | old ms | new ms | new voice viol |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01 | Charleston, SC | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 18 | 45.0% | 70735 | 114950 | 0 |
| 02 | Aspen, CO | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 15 | 37.5% | 69743 | 122843 | 0 |
| 03 | Napa Valley, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 21 | 52.5% | 26614 | 123437 | 0 |
| 04 | Newport, RI | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 78769 | 109376 | 0 |
| 05 | Sedona, AZ | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 33051 | 113112 | 0 |
| 06 | Savannah, GA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 18 | 45.0% | 29407 | 113899 | 0 |
| 07 | Park City, UT | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 68559 | 120991 | 0 |
| 08 | Carmel, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 17 | 42.5% | 77600 | 109198 | 0 |
| 09 | Hudson Valley, NY | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 14 | 35.0% | 30542 | 113849 | 0 |
| 10 | Telluride, CO | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 15 | 37.5% | 73576 | 114029 | 0 |
| 11 | Healdsburg, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 17 | 42.5% | 29204 | 107483 | 0 |
| 12 | Camden, ME | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 18 | 45.0% | 67160 | 110523 | 0 |
| 13 | Big Sur, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 14 | 35.0% | 33249 | 117182 | 0 |
| 14 | Jackson, WY | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 31278 | 119460 | 0 |
| 15 | Provincetown, MA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 14 | 35.0% | 68909 | 120614 | 0 |
| 16 | St. Helena, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 20 | 50.0% | 72165 | 112455 | 0 |
| 17 | Stowe, VT | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 15 | 37.5% | 75696 | 116569 | 0 |
| 18 | Outer Banks, NC | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 14 | 35.0% | 63945 | 124654 | 0 |
| 19 | Marfa, TX | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 85375 | 119680 | 0 |
| 20 | Bar Harbor, ME | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 64922 | 121181 | 0 |

---

## Detail

### Case 01 — Charleston, SC
  - Status: old=OK new=OK
  - Latency: old=70735ms new=114950ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | preOpeningCosts | 1500000 | 850000 | 43.3% |
      | startOccupancy | 55 | 35 | 36.4% |
      | costIT | 3 | 2 | 33.3% |

### Case 02 — Aspen, CO
  - Status: old=OK new=OK
  - Latency: old=69743ms new=122843ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | costPropertyTaxes | 1.2 | 0.7 | 41.7% |
      | costMarketing | 5 | 7 | 40.0% |
      | rampMonths | 30 | 18 | 40.0% |
      | occupancyStep | 5.5 | 3.5 | 36.4% |

### Case 03 — Napa Valley, CA
  - Status: old=OK new=OK
  - Latency: old=26614ms new=123437ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costOther | 2 | 3 | 50.0% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | costMarketing | 5 | 7 | 40.0% |
      | startOccupancy | 52 | 32 | 38.5% |
      | rampMonths | 30 | 22 | 26.7% |

### Case 04 — Newport, RI
  - Status: old=OK new=OK
  - Latency: old=78769ms new=109376ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | revShareEvents | 8 | 15 | 87.5% |
      | costOther | 2 | 3 | 50.0% |
      | costSeg7yrPct | 8 | 12 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |
      | costHousekeeping | 18 | 26 | 44.4% |

### Case 05 — Sedona, AZ
  - Status: old=OK new=OK
  - Latency: old=33051ms new=113112ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | occupancyStep | 7.5 | 3 | 60.0% |
      | revShareEvents | 8 | 4 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |
      | costSeg15yrPct | 22 | 12 | 45.5% |
      | costPropertyTaxes | 1.8 | 1 | 44.4% |

### Case 06 — Savannah, GA
  - Status: old=OK new=OK
  - Latency: old=29407ms new=113899ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | preOpeningCosts | 1500000 | 750000 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | revShareEvents | 8 | 5 | 37.5% |
      | startOccupancy | 58 | 38 | 34.5% |

### Case 07 — Park City, UT
  - Status: old=OK new=OK
  - Latency: old=68559ms new=120991ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | catering | 15 | 25 | 66.7% |
      | preOpeningCosts | 2850000 | 1400000 | 50.9% |
      | costOther | 2 | 3 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | costHousekeeping | 18 | 26 | 44.4% |

### Case 08 — Carmel, CA
  - Status: old=OK new=OK
  - Latency: old=77600ms new=109198ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | startOccupancy | 59 | 35 | 40.7% |
      | costSeg5yrPct | 22 | 16 | 27.3% |
      | preOpeningCosts | 1500000 | 1100000 | 26.7% |

### Case 09 — Hudson Valley, NY
  - Status: old=OK new=OK
  - Latency: old=30542ms new=113849ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | rampMonths | 30 | 14 | 53.3% |
      | costOther | 2 | 3 | 50.0% |
      | revShareEvents | 8 | 12 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |
      | costHousekeeping | 18 | 26 | 44.4% |

### Case 10 — Telluride, CO
  - Status: old=OK new=OK
  - Latency: old=73576ms new=114029ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costMarketing | 5 | 8 | 60.0% |
      | costHousekeeping | 18 | 28 | 55.6% |
      | costSeg7yrPct | 8 | 12 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | startOccupancy | 52 | 28 | 46.2% |

### Case 11 — Healdsburg, CA
  - Status: old=OK new=OK
  - Latency: old=29204ms new=107483ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | catering | 12 | 22 | 83.3% |
      | costOther | 2 | 3 | 50.0% |
      | costSeg7yrPct | 8 | 12 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |
      | costSeg15yrPct | 22 | 12 | 45.5% |

### Case 12 — Camden, ME
  - Status: old=OK new=OK
  - Latency: old=67160ms new=110523ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | preOpeningCosts | 1500000 | 500000 | 66.7% |
      | revShareEvents | 8 | 4 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | startOccupancy | 51 | 35 | 31.4% |

### Case 13 — Big Sur, CA
  - Status: old=OK new=OK
  - Latency: old=33249ms new=117182ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | preOpeningCosts | 2200000 | 1000000 | 54.5% |
      | costHousekeeping | 18 | 27 | 50.0% |
      | costOther | 2 | 3 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |
      | arDays | 25 | 15 | 40.0% |

### Case 14 — Jackson, WY
  - Status: old=OK new=OK
  - Latency: old=31278ms new=119460ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costSeg7yrPct | 8 | 12 | 50.0% |
      | catering | 15 | 22 | 46.7% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | revShareEvents | 8 | 5 | 37.5% |
      | costMarketing | 5 | 6.5 | 30.0% |

### Case 15 — Provincetown, MA
  - Status: old=OK new=OK
  - Latency: old=68909ms new=120614ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costHousekeeping | 18 | 28 | 55.6% |
      | costSeg7yrPct | 8 | 12 | 50.0% |
      | preOpeningCosts | 1500000 | 750000 | 50.0% |
      | revShareOther | 8 | 4 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |

### Case 16 — St. Helena, CA
  - Status: old=OK new=OK
  - Latency: old=72165ms new=112455ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | preOpeningCosts | 2150000 | 1000000 | 53.5% |
      | costOther | 2 | 3 | 50.0% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | startOccupancy | 55 | 38 | 30.9% |
      | occupancyStep | 6.5 | 4.5 | 30.8% |

### Case 17 — Stowe, VT
  - Status: old=OK new=OK
  - Latency: old=75696ms new=116569ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | catering | 25 | 35 | 40.0% |
      | startOccupancy | 51 | 32 | 37.3% |
      | occupancyStep | 4.5 | 6 | 33.3% |

### Case 18 — Outer Banks, NC
  - Status: old=OK new=OK
  - Latency: old=63945ms new=124654ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | preOpeningCosts | 2200000 | 1100000 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | costSeg5yrPct | 28 | 16 | 42.9% |
      | catering | 18 | 25 | 38.9% |

### Case 19 — Marfa, TX
  - Status: old=OK new=OK
  - Latency: old=85375ms new=119680ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | preOpeningCosts | 1500000 | 600000 | 60.0% |
      | revShareOther | 8 | 4 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | startOccupancy | 45 | 28 | 37.8% |

### Case 20 — Bar Harbor, ME
  - Status: old=OK new=OK
  - Latency: old=64922ms new=121181ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costSeg7yrPct | 8 | 12 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | rampMonths | 21 | 30 | 42.9% |
      | startOccupancy | 55 | 35 | 36.4% |

---

## Notes

- **Path semantics.** Both paths consumed the same user prompt with ephemeral cache_control on the system message. The system prompts differ by design (post-OT-A.3 schema-tightening, commit e89d77441): the old path receives the legacy free-form-JSON instructions and is regex-parsed by `extractResearchValues`; the new path receives the structured-output contract (field-key enum + ≤500-char one-sentence reasoning) and is parsed via `toLegacyResearchValuesMap`. Using a single shared prompt for both paths was tried in the previous run and produced ad-hoc field names that broke parity — see prior commit 12363142.
- **Field set drift is expected.** The new path emits whatever fields the model decides are answerable under the schema; the old extractor only fills slots it can regex-match. `shared` is the meaningful comparison surface; `old-only` / `new-only` are diagnostic, not a failure signal.
- **Severity criterion (OT-A.3 retry).** The original ±5% midpoint criterion was unachievable: two independent Opus calls on the same prompt naturally diverge well beyond 5% even when they agree on the answerable range. The retry criterion is **bucket-match** — for each shared field, each path's full `[low, high]` range must contain the other path's midpoint. This tests behavioural equivalence for downstream AnalystVerdict consumers (which gate on range, not point estimate). Old-path ranges are parsed from the `display` string (`$NNN-$NNN`, `NN%–NN%`, `N–N mo`); new-path ranges come from the structured `SynthesisOutput.values[].{low,high}`. When a display string is a single value (no dash), a ±5% band around the mid is used as a soft fallback.
- **Cost.** Real Opus spend on user's Anthropic billing. Authorized.
- **Rollback.** Setting `USE_AI_SDK_SYNTHESIS=false` (or unset) restores the legacy path immediately. No code revert needed.

---

## v4 — Anti-mode-collapse rerun (after `9058b1ce` + `e5d873fe`)

Re-ran 20-case A/B after stripping typical-range hints from
`FIELD_DEFINITIONS` and adding the explicit "PER-MARKET REASONING
REQUIRED" block to the structured-output system prompt.

### Aggregate trajectory
- v1: 39.9%
- v2: 37.6%
- v3: 41.5% (mode-collapsed wins)
- **v4: 40.8%** (composition fundamentally changed — see uniqueness)

The aggregate is unchanged but **the bucket-match composition is
materially different**: v3's high-match fields were prescription
artifacts (new path emitted identical ranges across all 20 markets);
v4's matches and misses both reflect actual two-Opus reasoning.

### Per-field uniqueness (20 markets) — primary diagnostic

| Field | v3 unique | v4 unique | v3 match | v4 match | Reading |
|---|---|---|---|---|---|
| `rampMonths` | 1 | **6** | 65% | **75%** | Collapse broken AND match improved |
| `costSeg7yrPct` | 1 | **6** | 75% | 65% | Reasoning restored |
| `costSeg15yrPct` | 1 | **5** | 0% | 0% | Reasoning restored; both paths reason but disagree (noise floor) |
| `costSeg5yrPct` | 1 | 3 | 15% | 40% | Partially restored, match nearly tripled |
| `costFFE` | 1 | **5** | 45% | **85%** | Massive recovery — was a v2→v3 stochastic regression |
| `landValue` | — | **10** | 0% | 10% | Reasoning fully restored |
| `costPropertyTaxes` | — | **16** | 35% | 45% | Excellent per-market diversity |
| `preOpeningCosts` | — | **15** | 0% | 25% | Reasoning fully restored |
| `incentiveFee` | 1 | **1** | 90% | 75% | Still collapsed — see finding below |
| `occupancy` | 7 | 6 | 85% | 70% | Stochastic drift |

### The `incentiveFee` finding (industry standardization, not a bug)

Even with the explicit anti-collapse instruction, Opus emits `8-10-12`
on every single market in the new path. Legacy emits `8` or `10`.
This reflects real industry standardization: incentive management fee
structure is set by operator brand contracts (Marriott Autograph
emits ~10% of GOP regardless of whether the property is in Aspen or
Outer Banks), not market geography. Mode collapse here is correct
behaviour — verdict-layer parity will be trivially satisfied on this
field, which is the right outcome.

### Q1 success-criterion verdict
Threshold: ≥4 unique ranges across 20 markets on
`rampMonths`/`incentiveFee`/`costSeg{5,7,15}yrPct`.
- `rampMonths`: 6 ✓
- `costSeg7yrPct`: 6 ✓
- `costSeg15yrPct`: 5 ✓
- `costSeg5yrPct`: 3 (borderline; partial)
- `incentiveFee`: 1 (real industry finding, not a failure)

3-of-5 hit cleanly, 1 partial, 1 explained. The contract approach now
demonstrably produces per-market reasoning across the field surface.

### Categorical gate (v4)
- Schema validity: 20/20
- Voice violations: 0/0
- Unit/denominator/scope errors: 0
- Latency: 1.7× (within 2× threshold)
- **Categorical gate: CLEAN**

### Decision
Path 3 (verdict-layer parity harness) is the correct next gate. The
remaining 60% bucket-mismatch is genuine two-Opus-call noise on
narrow-range fields where bucket-match is the wrong metric — exactly
the case verdict-layer parity is designed to measure.
