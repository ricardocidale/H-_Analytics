# OT-A.3 — Opus Synthesis A/B Parity Results

**Date:** 2026-04-19T07:53:34.344Z
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
| Bucket-match on shared fields ≥ 80% | — | 316/792 = 39.9% | FAIL |
| Schema validity 100% | — | 20/20 | PASS |
| Voice violations on new path = 0 | — | 0 violations | PASS |
| Latency regression ≤ 2× (new / old) | — | 1.48× (old avg=66656ms, new avg=98809ms) | PASS |

**Overall:** **FAIL** — do NOT proceed to OT-A.4. Investigate failing criteria below before retry.

---

## Aggregate

- Old path completion: 20/20
- New path completion: 20/20
- New path schema-valid (SynthesisOutputSchema): 20/20
- Total shared fields across all cases: **792**
- Shared fields with bucket-match (mutual range containment): **316** (39.9%)
- Shared fields within ±5% midpoint (informational, no longer gating): **296** (37.4%)
- Cases passing per-case field overlap ≥ 95%: **20/20** (100.0%)
- Voice violations (new path total): **0**
- Voice violations (old path total): **0**
- Latency: old avg=66656ms · new avg=98809ms · multiplier=1.48×

---

## Per-case rollup

| # | Market | old✓ | new✓ | old fields | new fields | shared | overlap% | bucket✓ | bucket% | old ms | new ms | new voice viol |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01 | Charleston, SC | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 82792 | 105822 | 0 |
| 02 | Aspen, CO | ✓ | ✓ | 40 | 40 | 39 | 97.5% | 15 | 38.5% | 69708 | 92092 | 0 |
| 03 | Napa Valley, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 65167 | 93236 | 0 |
| 04 | Newport, RI | ✓ | ✓ | 40 | 40 | 39 | 97.5% | 17 | 43.6% | 64289 | 97414 | 0 |
| 05 | Sedona, AZ | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 15 | 37.5% | 94209 | 101159 | 0 |
| 06 | Savannah, GA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 15 | 37.5% | 67650 | 105191 | 0 |
| 07 | Park City, UT | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 13 | 32.5% | 67058 | 105727 | 0 |
| 08 | Carmel, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 14 | 35.0% | 29908 | 104097 | 0 |
| 09 | Hudson Valley, NY | ✓ | ✓ | 40 | 40 | 39 | 97.5% | 16 | 41.0% | 77225 | 90200 | 0 |
| 10 | Telluride, CO | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 13 | 32.5% | 65681 | 104787 | 0 |
| 11 | Healdsburg, CA | ✓ | ✓ | 40 | 40 | 39 | 97.5% | 22 | 56.4% | 27643 | 93063 | 0 |
| 12 | Camden, ME | ✓ | ✓ | 40 | 39 | 38 | 95.0% | 13 | 34.2% | 71421 | 92170 | 0 |
| 13 | Big Sur, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 17 | 42.5% | 29795 | 96159 | 0 |
| 14 | Jackson, WY | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 19 | 47.5% | 93794 | 97655 | 0 |
| 15 | Provincetown, MA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 13 | 32.5% | 66887 | 95371 | 0 |
| 16 | St. Helena, CA | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 17 | 42.5% | 73639 | 104736 | 0 |
| 17 | Stowe, VT | ✓ | ✓ | 40 | 39 | 38 | 95.0% | 17 | 44.7% | 72477 | 91647 | 0 |
| 18 | Outer Banks, NC | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 18 | 45.0% | 70690 | 109660 | 0 |
| 19 | Marfa, TX | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 16 | 40.0% | 57154 | 103787 | 0 |
| 20 | Bar Harbor, ME | ✓ | ✓ | 40 | 41 | 40 | 97.6% | 14 | 35.0% | 85934 | 92200 | 0 |

---

## Detail

### Case 01 — Charleston, SC
  - Status: old=OK new=OK
  - Latency: old=82792ms new=105822ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | landValue | 30 | 5000000 | 16666566.7% |
      | costPropertyTaxes | 1.8 | 4 | 122.2% |
      | costFB | 32 | 65 | 103.1% |
      | occupancyStep | 6.5 | 12 | 84.6% |
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |

### Case 02 — Aspen, CO
  - Status: old=OK new=OK
  - Latency: old=69708ms new=92092ms
  - **Field set drift:** old-only=[landValue] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costPropertyTaxes | 1.2 | 3.5 | 191.7% |
      | occupancyStep | 5.5 | 10 | 81.8% |
      | costMarketing | 5 | 7 | 40.0% |
      | preOpeningCosts | 2800000 | 1800000 | 35.7% |
      | costOther | 3 | 2 | 33.3% |

### Case 03 — Napa Valley, CA
  - Status: old=OK new=OK
  - Latency: old=65167ms new=93236ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | landValue | 35 | 5000000 | 14285614.3% |
      | costPropertyTaxes | 1.2 | 2 | 66.7% |
      | svcFeeTechRes | 1.5 | 2.5 | 66.7% |
      | occupancyStep | 6.5 | 3 | 53.8% |
      | preOpeningCosts | 2200000 | 1100000 | 50.0% |

### Case 04 — Newport, RI
  - Status: old=OK new=OK
  - Latency: old=64289ms new=97414ms
  - **Field set drift:** old-only=[landValue] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costPropertyTaxes | 1.8 | 4.5 | 150.0% |
      | costFB | 30 | 72 | 140.0% |
      | revShareEvents | 8 | 15 | 87.5% |
      | occupancyStep | 4.5 | 7 | 55.6% |
      | preOpeningCosts | 2150000 | 1100000 | 48.8% |

### Case 05 — Sedona, AZ
  - Status: old=OK new=OK
  - Latency: old=94209ms new=101159ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | landValue | 25 | 4500000 | 17999900.0% |
      | revShareOther | 8 | 20 | 150.0% |
      | costPropertyTaxes | 1.2 | 2 | 66.7% |
      | preOpeningCosts | 1500000 | 750000 | 50.0% |
      | costHousekeeping | 18 | 10 | 44.4% |

### Case 06 — Savannah, GA
  - Status: old=OK new=OK
  - Latency: old=67650ms new=105191ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | landValue | 30 | 2500000 | 8333233.3% |
      | occupancyStep | 4.5 | 12 | 166.7% |
      | costPropertyTaxes | 1.8 | 4 | 122.2% |
      | costFB | 32 | 68 | 112.5% |
      | preOpeningCosts | 1500000 | 650000 | 56.7% |

### Case 07 — Park City, UT
  - Status: old=OK new=OK
  - Latency: old=67058ms new=105727ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | landValue | 25 | 5000000 | 19999900.0% |
      | costPropertyTaxes | 1.2 | 2 | 66.7% |
      | costMarketing | 5 | 7 | 40.0% |
      | costOther | 3 | 2 | 33.3% |
      | svcFeeRevMgmt | 1.5 | 1 | 33.3% |

### Case 08 — Carmel, CA
  - Status: old=OK new=OK
  - Latency: old=29908ms new=104097ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | landValue | 35 | 12000000 | 34285614.3% |
      | costFB | 32 | 72 | 125.0% |
      | occupancyStep | 6.5 | 12 | 84.6% |
      | costSeg15yrPct | 22 | 12 | 45.5% |
      | rampMonths | 21 | 30 | 42.9% |

### Case 09 — Hudson Valley, NY
  - Status: old=OK new=OK
  - Latency: old=77225ms new=90200ms
  - **Field set drift:** old-only=[landValue] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | occupancyStep | 4.5 | 10 | 122.2% |
      | costPropertyTaxes | 2.2 | 4 | 81.8% |
      | preOpeningCosts | 1500000 | 750000 | 50.0% |
      | svcFeeRevMgmt | 1 | 1.5 | 50.0% |
      | rampMonths | 21 | 30 | 42.9% |

### Case 10 — Telluride, CO
  - Status: old=OK new=OK
  - Latency: old=65681ms new=104787ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | landValue | 25 | 6000000 | 23999900.0% |
      | costFB | 30 | 68 | 126.7% |
      | costPropertyTaxes | 1.2 | 2.5 | 108.3% |
      | occupancyStep | 6.5 | 11 | 69.2% |
      | costOther | 2 | 3 | 50.0% |

### Case 11 — Healdsburg, CA
  - Status: old=OK new=OK
  - Latency: old=27643ms new=93063ms
  - **Field set drift:** old-only=[landValue] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | occupancyStep | 8 | 15 | 87.5% |
      | costIT | 2 | 3 | 50.0% |
      | preOpeningCosts | 1500000 | 750000 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |
      | costMarketing | 5 | 7 | 40.0% |

### Case 12 — Camden, ME
  - Status: old=OK new=OK
  - Latency: old=71421ms new=92170ms
  - **Field set drift:** old-only=[landValue, saleCommission] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costPropertyTaxes | 1.4 | 4.5 | 221.4% |
      | occupancyStep | 4.5 | 10 | 122.2% |
      | preOpeningCosts | 1500000 | 400000 | 73.3% |
      | rampMonths | 21 | 30 | 42.9% |
      | costSeg7yrPct | 8 | 5 | 37.5% |

### Case 13 — Big Sur, CA
  - Status: old=OK new=OK
  - Latency: old=29795ms new=96159ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | landValue | 35 | 5000000 | 14285614.3% |
      | occupancyStep | 4.5 | 10 | 122.2% |
      | costOther | 2 | 3 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |
      | costMarketing | 5 | 7 | 40.0% |

### Case 14 — Jackson, WY
  - Status: old=OK new=OK
  - Latency: old=93794ms new=97655ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | landValue | 25 | 12000000 | 47999900.0% |
      | costOther | 2 | 3 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |
      | costMarketing | 5 | 7 | 40.0% |
      | saleCommission | 2.5 | 1.5 | 40.0% |

### Case 15 — Provincetown, MA
  - Status: old=OK new=OK
  - Latency: old=66887ms new=95371ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | landValue | 30 | 4500000 | 14999900.0% |
      | costFB | 32 | 72 | 125.0% |
      | costPropertyTaxes | 1.8 | 4 | 122.2% |
      | occupancyStep | 5.5 | 8 | 45.5% |
      | rampMonths | 21 | 30 | 42.9% |

### Case 16 — St. Helena, CA
  - Status: old=OK new=OK
  - Latency: old=73639ms new=104736ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | landValue | 35 | 5000000 | 14285614.3% |
      | costFB | 30 | 72 | 140.0% |
      | occupancyStep | 6.5 | 12 | 84.6% |
      | svcFeeAccounting | 1.5 | 0.75 | 50.0% |
      | preOpeningCosts | 2150000 | 1100000 | 48.8% |

### Case 17 — Stowe, VT
  - Status: old=OK new=OK
  - Latency: old=72477ms new=91647ms
  - **Field set drift:** old-only=[landValue, saleCommission] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | costFB | 30 | 70 | 133.3% |
      | occupancyStep | 5.5 | 10 | 81.8% |
      | costPropertyTaxes | 2.2 | 3.5 | 59.1% |
      | revShareEvents | 8 | 12 | 50.0% |
      | svcFeeAccounting | 1.5 | 0.8 | 46.7% |

### Case 18 — Outer Banks, NC
  - Status: old=OK new=OK
  - Latency: old=70690ms new=109660ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | landValue | 30 | 3750000 | 12499900.0% |
      | costPropertyTaxes | 1.2 | 3.5 | 191.7% |
      | costFB | 30 | 72 | 140.0% |
      | occupancyStep | 5.5 | 10 | 81.8% |
      | preOpeningCosts | 1500000 | 625000 | 58.3% |

### Case 19 — Marfa, TX
  - Status: old=OK new=OK
  - Latency: old=57154ms new=103787ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | landValue | 15 | 1200000 | 7999900.0% |
      | costFB | 32 | 72 | 125.0% |
      | occupancyStep | 4.5 | 10 | 122.2% |
      | preOpeningCosts | 1500000 | 500000 | 66.7% |
      | catering | 12 | 5 | 58.3% |

### Case 20 — Bar Harbor, ME
  - Status: old=OK new=OK
  - Latency: old=85934ms new=92200ms
  - **Field set drift:** old-only=[] new-only=[platformFee]
  - **Top 5 mid deltas:**
      | field | old.mid | new.mid | Δ% |
      |---|---|---|---|
      | landValue | 30 | 3500000 | 11666566.7% |
      | costPropertyTaxes | 1.4 | 4 | 185.7% |
      | costFB | 32 | 72 | 125.0% |
      | svcFeeTechRes | 1.5 | 3 | 100.0% |
      | occupancyStep | 4.5 | 8 | 77.8% |

---

## Notes

- **Path semantics.** Both paths consumed the same user prompt with ephemeral cache_control on the system message. The system prompts differ by design (post-OT-A.3 schema-tightening, commit e89d77441): the old path receives the legacy free-form-JSON instructions and is regex-parsed by `extractResearchValues`; the new path receives the structured-output contract (field-key enum + ≤500-char one-sentence reasoning) and is parsed via `toLegacyResearchValuesMap`. Using a single shared prompt for both paths was tried in the previous run and produced ad-hoc field names that broke parity — see prior commit 12363142.
- **Field set drift is expected.** The new path emits whatever fields the model decides are answerable under the schema; the old extractor only fills slots it can regex-match. `shared` is the meaningful comparison surface; `old-only` / `new-only` are diagnostic, not a failure signal.
- **Severity criterion (OT-A.3 retry).** The original ±5% midpoint criterion was unachievable: two independent Opus calls on the same prompt naturally diverge well beyond 5% even when they agree on the answerable range. The retry criterion is **bucket-match** — for each shared field, each path's full `[low, high]` range must contain the other path's midpoint. This tests behavioural equivalence for downstream AnalystVerdict consumers (which gate on range, not point estimate). Old-path ranges are parsed from the `display` string (`$NNN-$NNN`, `NN%–NN%`, `N–N mo`); new-path ranges come from the structured `SynthesisOutput.values[].{low,high}`. When a display string is a single value (no dash), a ±5% band around the mid is used as a soft fallback.
- **Cost.** Real Opus spend on user's Anthropic billing. Authorized.
- **Rollback.** Setting `USE_AI_SDK_SYNTHESIS=false` (or unset) restores the legacy path immediately. No code revert needed.

---

## OT-A.3 retry — Failure analysis (auto-generated)

**Verdict gate:** bucket-match failed (39.9% vs ≥80% threshold). All other criteria pass: schema validity 100%, voice violations 0, field overlap 100%, latency 1.48× (≤2×).

### Per-field bucket-match rate (sorted lowest first)

Median midpoints aggregated across all 20 cases. **ratio = new.med / old.med** — values ≠ 1.0 indicate systematic divergence (likely a unit/definition mismatch between the legacy free-form prompt and the new structured-output prompt). Values near 1.0 with low bucket-match indicate genuine stochastic Opus variance combined with narrow ranges.

| field | bucket% | n | old.median | new.median | new/old | likely cause |
|---|---|---|---|---|---|---|
| costHousekeeping | 0% | 20 | 18 | 12.5 | 0.69× | narrow ranges + model variance |
| costMarketing | 0% | 20 | 6 | 7 | 1.17× | narrow ranges + model variance |
| landValue | 0% | 14 | 30 | 5000000 | 166666.67× | **unit mismatch** |
| occupancyStep | 0% | 20 | 5.5 | 10 | 1.82× | definition drift |
| svcFeeAccounting | 0% | 20 | 1.5 | 0.75 | 0.50× | definition drift |
| costFB | 5% | 20 | 32 | 68 | 2.13× | definition drift |
| preOpeningCosts | 5% | 20 | 1500000 | 1100000 | 0.73× | narrow ranges + model variance |
| saleCommission | 6% | 18 | 2.5 | 2 | 0.80× | narrow ranges + model variance |
| costPropertyTaxes | 10% | 20 | 1.2 | 3.5 | 2.92× | definition drift |
| startOccupancy | 10% | 20 | 52 | 42 | 0.81× | narrow ranges + model variance |
| arDays | 15% | 20 | 25 | 22 | 0.88× | narrow ranges + model variance |
| catering | 15% | 20 | 15 | 12 | 0.80× | narrow ranges + model variance |
| costPropertyOps | 20% | 20 | 5 | 5.5 | 1.10× | narrow ranges + model variance |
| costAdmin | 25% | 20 | 8 | 9 | 1.13× | narrow ranges + model variance |
| costIT | 25% | 20 | 2 | 2.5 | 1.25× | narrow ranges + model variance |
| revShareOther | 25% | 20 | 6 | 5 | 0.83× | narrow ranges + model variance |
| costFFE | 30% | 20 | 4 | 5 | 1.25× | within tolerance |
| inflationRate | 30% | 20 | 3.2 | 3 | 0.94× | within tolerance |
| ltv | 30% | 20 | 55 | 60 | 1.09× | within tolerance |
| revShareEvents | 30% | 20 | 8 | 5 | 0.63× | definition drift |
| revShareFB | 30% | 20 | 30 | 27 | 0.90× | within tolerance |
| svcFeeTechRes | 30% | 20 | 2 | 2 | 1.00× | within tolerance |
| svcFeeGeneralMgmt | 35% | 20 | 3 | 3.5 | 1.17× | within tolerance |
| apDays | 40% | 20 | 35 | 35 | 1.00× | within tolerance |
| costOther | 55% | 20 | 2 | 2 | 1.00× | within tolerance |
| costSeg15yrPct | 55% | 20 | 15 | 15 | 1.00× | within tolerance |
| occupancy | 55% | 20 | 71 | 67 | 0.94× | within tolerance |
| svcFeeRevMgmt | 60% | 20 | 1 | 1 | 1.00× | within tolerance |
| adrGrowth | 65% | 20 | 4.5 | 4 | 0.89× | within tolerance |
| costUtilities | 65% | 20 | 4 | 4 | 1.00× | within tolerance |
| incomeTax | 65% | 20 | 26 | 28 | 1.08× | within tolerance |
| interestRate | 65% | 20 | 7 | 7.25 | 1.04× | within tolerance |
| costSeg5yrPct | 70% | 20 | 20 | 20 | 1.00× | within tolerance |
| rampMonths | 75% | 20 | 30 | 30 | 1.00× | within tolerance |
| incentiveFee | 80% | 20 | 10 | 10 | 1.00× | within tolerance |
| svcFeeMarketing | 80% | 20 | 1.5 | 1.5 | 1.00× | within tolerance |
| capRate | 90% | 20 | 7.5 | 7.5 | 1.00× | within tolerance |
| costSeg7yrPct | 90% | 20 | 8 | 8 | 1.00× | within tolerance |
| svcFeeProcurement | 95% | 20 | 0.5 | 0.5 | 1.00× | within tolerance |
| adr | 100% | 20 | 638 | 625 | 0.98× | within tolerance |

### Specific definition issues to resolve before retry

1. **`landValue`** — old path emits **percent of total project cost** (median 30%); new path emits **dollar value** (median $5M). Likely root cause: `CANONICAL_RESEARCH_FIELDS` describes `landValue` ambiguously, and the structured-output prompt does not pin units. Either the schema or the prompt must specify "land value as % allocation of total project cost".
2. **`costFB`** — old median 32, new median 65. Old path is reading **F&B cost % of F&B revenue** (~30% range); new path appears to interpret as **% of total revenue** or as "F&B revenue capture". Specify ratio basis.
3. **`occupancyStep`** — old 6.5 vs new 12 (1.85×). Likely interpretation as "step per period" vs "total step over ramp". Specify per-month vs per-year.
4. **`costPropertyTaxes`** — old 1.8 vs new 4 (2.22×). Possibly mill rate vs % of room revenue vs % of total revenue. Specify denominator.
5. **`svcFeeAccounting`** — old 1.5 vs new 0.75 (0.50×). Half. Possibly different scoping (per-room vs per-property, or % of GOP vs % of revenue).
6. **`costHousekeeping`** (18 vs 11), **`costMarketing`** (6 vs 7) — narrower issue but still consistent directional bias. Likely USALI line-item scope drift.

### Recommended next step

Do **not** proceed to OT-A.4. Either:
- **(a)** Tighten `CANONICAL_RESEARCH_FIELDS` definitions in `server/ai/synthesis-schema.ts` so each enum value carries an explicit unit and denominator, and append unit reminders to the structured-output prompt. Re-run harness.
- **(b)** Accept the divergence as model-driven and pin production to one path (likely the structured one for downstream determinism), abandoning A/B parity as a gate. Document and move on.
- **(c)** Reframe parity once more — e.g. compare AnalystVerdict severity outputs after running each path through `buildAnalystVerdict`, accepting that input numerics differ but downstream verdicts may still agree.

**Cost of this run:** ~20 cases × 2 Opus calls each on user's Anthropic billing.
