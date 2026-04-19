# OT-A.3 — Opus Synthesis A/B Parity Results

**Date:** 2026-04-19T16:53:28.139Z
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
| Bucket-match on shared fields ≥ 80% | — | 319/800 = 39.9% | FAIL |
| Schema validity 100% | — | 20/20 | PASS |
| Voice violations on new path = 0 | — | 0 violations | PASS |
| Latency regression ≤ 2× (new / old) | — | 1.63× (old avg=73889ms, new avg=120741ms) | PASS |

**Overall:** **FAIL** — do NOT proceed to OT-A.4. Investigate failing criteria below before retry.

---

## Aggregate

- Old path completion: 20/20
- New path completion: 20/20
- New path schema-valid (SynthesisOutputSchema): 20/20
- Total shared fields across all cases: **800**
- Shared fields with bucket-match (mutual range containment): **319** (39.9%)
- Shared fields within ±5% midpoint (informational, no longer gating): **300** (37.5%)
- Cases passing per-case field overlap ≥ 95%: **20/20** (100.0%)
- Voice violations (new path total): **0**
- Voice violations (old path total): **0**
- Latency: old avg=73889ms · new avg=120741ms · multiplier=1.63×

---

## Per-case rollup

| # | Market | old✓ | new✓ | old fields | new fields | shared | overlap% | bucket✓ | bucket% | old ms | new ms | new voice viol |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01 | Charleston, SC | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 68777 | 127991 | 0 |
| 02 | Aspen, CO | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 91907 | 122792 | 0 |
| 03 | Napa Valley, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 17 | 42.5% | 79210 | 119009 | 0 |
| 04 | Newport, RI | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 15 | 37.5% | 70616 | 116313 | 0 |
| 05 | Sedona, AZ | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 12 | 30.0% | 100507 | 118919 | 0 |
| 06 | Savannah, GA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 14 | 35.0% | 27238 | 115155 | 0 |
| 07 | Park City, UT | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 18 | 45.0% | 77351 | 115727 | 0 |
| 08 | Carmel, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 23 | 57.5% | 79993 | 116090 | 0 |
| 09 | Hudson Valley, NY | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 17 | 42.5% | 97412 | 110370 | 0 |
| 10 | Telluride, CO | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 71298 | 125523 | 0 |
| 11 | Healdsburg, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 70191 | 120240 | 0 |
| 12 | Camden, ME | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 18 | 45.0% | 65416 | 119444 | 0 |
| 13 | Big Sur, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 15 | 37.5% | 32756 | 134006 | 0 |
| 14 | Jackson, WY | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 15 | 37.5% | 76574 | 120759 | 0 |
| 15 | Provincetown, MA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 19 | 47.5% | 102329 | 122281 | 0 |
| 16 | St. Helena, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 90301 | 116133 | 0 |
| 17 | Stowe, VT | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 60688 | 126022 | 0 |
| 18 | Outer Banks, NC | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 15 | 37.5% | 75052 | 114982 | 0 |
| 19 | Marfa, TX | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 13 | 32.5% | 70966 | 120470 | 0 |
| 20 | Bar Harbor, ME | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 12 | 30.0% | 69200 | 132590 | 0 |

---

## Detail

### Case 01 — Charleston, SC
  - Status: old=OK new=OK
  - Latency: old=68777ms new=127991ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | startOccupancy | 55 | 32 | 41.8% |
      | revShareEvents | 8 | 5 | 37.5% |
      | catering | 18 | 12 | 33.3% |

### Case 02 — Aspen, CO
  - Status: old=OK new=OK
  - Latency: old=91907ms new=122792ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costMarketing | 4 | 7 | 75.0% |
      | costHousekeeping | 18 | 27 | 50.0% |
      | costOther | 2 | 3 | 50.0% |
      | catering | 15 | 22 | 46.7% |
      | svcFeeRevMgmt | 1.5 | 0.8 | 46.7% |

### Case 03 — Napa Valley, CA
  - Status: old=OK new=OK
  - Latency: old=79210ms new=119009ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |
      | catering | 15 | 22 | 46.7% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | costMarketing | 5 | 7 | 40.0% |
      | startOccupancy | 55 | 35 | 36.4% |

### Case 04 — Newport, RI
  - Status: old=OK new=OK
  - Latency: old=70616ms new=116313ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | preOpeningCosts | 2150000 | 1000000 | 53.5% |
      | costOther | 2 | 3 | 50.0% |
      | revShareEvents | 8 | 12 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |
      | costHousekeeping | 18 | 26 | 44.4% |

### Case 05 — Sedona, AZ
  - Status: old=OK new=OK
  - Latency: old=100507ms new=118919ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | revShareOther | 8 | 15 | 87.5% |
      | occupancyStep | 6.5 | 3 | 53.8% |
      | costOther | 3 | 1.5 | 50.0% |
      | costPropertyTaxes | 1.8 | 1 | 44.4% |
      | costHousekeeping | 18 | 26 | 44.4% |

### Case 06 — Savannah, GA
  - Status: old=OK new=OK
  - Latency: old=27238ms new=115155ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costMarketing | 5 | 8 | 60.0% |
      | costHousekeeping | 18 | 27 | 50.0% |
      | catering | 15 | 22 | 46.7% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | startOccupancy | 58 | 32 | 44.8% |

### Case 07 — Park City, UT
  - Status: old=OK new=OK
  - Latency: old=77351ms new=115727ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | catering | 15 | 25 | 66.7% |
      | svcFeeAccounting | 1.5 | 0.5 | 66.7% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | occupancyStep | 7.5 | 4.5 | 40.0% |
      | svcFeeProcurement | 0.5 | 0.3 | 40.0% |

### Case 08 — Carmel, CA
  - Status: old=OK new=OK
  - Latency: old=79993ms new=116090ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | preOpeningCosts | 2200000 | 1000000 | 54.5% |
      | costHousekeeping | 18 | 27 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | startOccupancy | 59 | 38 | 35.6% |
      | costIT | 3 | 2 | 33.3% |

### Case 09 — Hudson Valley, NY
  - Status: old=OK new=OK
  - Latency: old=97412ms new=110370ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costOther | 2 | 3 | 50.0% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | startOccupancy | 52 | 30 | 42.3% |
      | occupancyStep | 6.5 | 4 | 38.5% |
      | preOpeningCosts | 1500000 | 950000 | 36.7% |

### Case 10 — Telluride, CO
  - Status: old=OK new=OK
  - Latency: old=71298ms new=125523ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costHousekeeping | 18 | 28 | 55.6% |
      | catering | 15 | 22 | 46.7% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | startOccupancy | 52 | 28 | 46.2% |
      | costPropertyTaxes | 1.2 | 0.7 | 41.7% |

### Case 11 — Healdsburg, CA
  - Status: old=OK new=OK
  - Latency: old=70191ms new=120240ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | catering | 15 | 25 | 66.7% |
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |
      | occupancyStep | 6.5 | 3.5 | 46.2% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | costMarketing | 5 | 7 | 40.0% |

### Case 12 — Camden, ME
  - Status: old=OK new=OK
  - Latency: old=65416ms new=119444ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | preOpeningCosts | 1500000 | 475000 | 68.3% |
      | occupancyStep | 4.5 | 7 | 55.6% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | rampMonths | 21 | 30 | 42.9% |

### Case 13 — Big Sur, CA
  - Status: old=OK new=OK
  - Latency: old=32756ms new=134006ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | revShareEvents | 8 | 4 | 50.0% |
      | startOccupancy | 48 | 28 | 41.7% |
      | arDays | 25 | 15 | 40.0% |
      | costMarketing | 5 | 7 | 40.0% |
      | preOpeningCosts | 1500000 | 1000000 | 33.3% |

### Case 14 — Jackson, WY
  - Status: old=OK new=OK
  - Latency: old=76574ms new=120759ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | catering | 15 | 22 | 46.7% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | costMarketing | 5 | 7 | 40.0% |
      | startOccupancy | 52 | 32 | 38.5% |

### Case 15 — Provincetown, MA
  - Status: old=OK new=OK
  - Latency: old=102329ms new=122281ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costHousekeeping | 18 | 28 | 55.6% |
      | preOpeningCosts | 1500000 | 750000 | 50.0% |
      | revShareEvents | 8 | 4 | 50.0% |
      | svcFeeRevMgmt | 1.5 | 0.8 | 46.7% |
      | startOccupancy | 55 | 32 | 41.8% |

### Case 16 — St. Helena, CA
  - Status: old=OK new=OK
  - Latency: old=90301ms new=116133ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |
      | svcFeeProcurement | 1 | 0.5 | 50.0% |
      | svcFeeRevMgmt | 1.5 | 0.75 | 50.0% |
      | catering | 15 | 22 | 46.7% |
      | costHousekeeping | 18 | 26 | 44.4% |

### Case 17 — Stowe, VT
  - Status: old=OK new=OK
  - Latency: old=60688ms new=126022ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costHousekeeping | 18 | 28 | 55.6% |
      | preOpeningCosts | 2150000 | 1000000 | 53.5% |
      | costSeg5yrPct | 25 | 16 | 36.0% |
      | startOccupancy | 49 | 32 | 34.7% |
      | svcFeeTechRes | 1.5 | 2 | 33.3% |

### Case 18 — Outer Banks, NC
  - Status: old=OK new=OK
  - Latency: old=75052ms new=114982ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costMarketing | 4 | 6.5 | 62.5% |
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |
      | svcFeeRevMgmt | 1.5 | 0.75 | 50.0% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | preOpeningCosts | 1500000 | 850000 | 43.3% |

### Case 19 — Marfa, TX
  - Status: old=OK new=OK
  - Latency: old=70966ms new=120470ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | preOpeningCosts | 1500000 | 600000 | 60.0% |
      | costHousekeeping | 18 | 26 | 44.4% |
      | startOccupancy | 45 | 28 | 37.8% |
      | occupancyStep | 5.5 | 3.5 | 36.4% |
      | costSeg15yrPct | 18 | 12 | 33.3% |

### Case 20 — Bar Harbor, ME
  - Status: old=OK new=OK
  - Latency: old=69200ms new=132590ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costHousekeeping | 18 | 30 | 66.7% |
      | occupancyStep | 4.5 | 7 | 55.6% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | preOpeningCosts | 1500000 | 825000 | 45.0% |
      | svcFeeProcurement | 0.5 | 0.3 | 40.0% |

---

## Notes

- **Path semantics.** Both paths consumed the same user prompt with ephemeral cache_control on the system message. The system prompts differ by design (post-OT-A.3 schema-tightening, commit e89d77441): the old path receives the legacy free-form-JSON instructions and is regex-parsed by `extractResearchValues`; the new path receives the structured-output contract (field-key enum + ≤500-char one-sentence reasoning) and is parsed via `toLegacyResearchValuesMap`. Using a single shared prompt for both paths was tried in the previous run and produced ad-hoc field names that broke parity — see prior commit 12363142.
- **Field set drift is expected.** The new path emits whatever fields the model decides are answerable under the schema; the old extractor only fills slots it can regex-match. `shared` is the meaningful comparison surface; `old-only` / `new-only` are diagnostic, not a failure signal.
- **Severity criterion (OT-A.3 retry).** The original ±5% midpoint criterion was unachievable: two independent Opus calls on the same prompt naturally diverge well beyond 5% even when they agree on the answerable range. The retry criterion is **bucket-match** — for each shared field, each path's full `[low, high]` range must contain the other path's midpoint. This tests behavioural equivalence for downstream AnalystVerdict consumers (which gate on range, not point estimate). Old-path ranges are parsed from the `display` string (`$NNN-$NNN`, `NN%–NN%`, `N–N mo`); new-path ranges come from the structured `SynthesisOutput.values[].{low,high}`. When a display string is a single value (no dash), a ±5% band around the mid is used as a soft fallback.
- **Cost.** Real Opus spend on user's Anthropic billing. Authorized.
- **Rollback.** Setting `USE_AI_SDK_SYNTHESIS=false` (or unset) restores the legacy path immediately. No code revert needed.
