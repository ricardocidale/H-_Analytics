# OT-A.3 Path 3 — Verdict-layer Parity (respec evaluation)

**Generated:** 2026-04-19T16:56:55.130Z
**Source:** `docs/operational-tooling/OT-A-3-ab-raw.json` (v4, offline transform — no Opus rerun)
**Spec:** `docs/operational-tooling/OT-A-3-path3-respec.md`

## Verdict — FAIL — see misses below

| Gate | Pass | Detail |
|---|---|---|
| Tier 1 (8 fields, per-field) | ✗ | 3/8 fields pass |
| Tier 2 (17 fields, per-field) | ✗ | 8/17 fields pass |
| Tier 3 (16 fields, per-field) | ✗ | 9/15 fields pass |
| Mode-collapse (unique ≥ 3, exempt incentiveFee) | ✗ | — |

## Tier 1 — foundational

Gate: bucket-match ≥ 55% AND midpoint within ±10% of legacy ≥ 90%
(absolute fallback ±1pp when |legacy| < 0.5).

| Field | n | Bucket | ±10% mid | Unique | Signed Δ ± σ | Bias | Verdict |
|---|---|---|---|---|---|---|---|
| `adrGrowth` | 20 | 75% | 80% | 5 | -1.8% ± 6% | unbiased-noise | ✗ ±10% mid-hit 80% < 90% |
| `incentiveFee` | 20 | 80% | 80% | 1 | +5.0% ± 10% | unbiased-noise | ✗ ±10% mid-hit 80% < 90% |
| `inflationRate` | 20 | 5% | 10% | 6 | -13.3% ± 6% | bias-down | ✗ bucket 5% < 55%; ±10% mid-hit 10% < 90% |
| `interestRate` | 20 | 70% | 85% | 5 | +3.4% ± 5% | bias-up | ✗ ±10% mid-hit 85% < 90% |
| `ltv` | 20 | 45% | 100% | 3 | +5.2% ± 4% | bias-up | ✗ bucket 45% < 55% |
| `adr` | 20 | 100% | 100% | 16 | -3.0% ± 1% | bias-down | ✓ |
| `capRate` | 20 | 100% | 100% | 5 | +1.9% ± 3% | unbiased-noise | ✓ |
| `occupancy` | 20 | 75% | 100% | 7 | -4.2% ± 2% | bias-down | ✓ |

## Tier 2 — structural

Gate: midpoint within ±20% of legacy ≥ 85% (absolute fallback ±2pp).

| Field | n | ±20% mid | Unique | Signed Δ ± σ | Bias | Verdict |
|---|---|---|---|---|---|---|
| `catering` | 20 | 45% | 8 | +19.9% ± 31% | bias-up | ✗ ±20% mid-hit 45% < 85% |
| `costFB` | 20 | 100% | 2 | +4.3% ± 3% | bias-up | ✗ unique ranges 2 < 3 (mode collapse) |
| `costHousekeeping` | 20 | 0% | 5 | +46.9% ± 8% | bias-up | ✗ ±20% mid-hit 0% < 85% |
| `costMarketing` | 20 | 45% | 4 | +31.8% ± 17% | bias-up | ✗ ±20% mid-hit 45% < 85% |
| `costPropertyTaxes` | 20 | 60% | 14 | -16.4% ± 18% | bias-down | ✗ ±20% mid-hit 60% < 85% |
| `occupancyStep` | 20 | 45% | 8 | -12.1% ± 29% | unbiased-noise | ✗ ±20% mid-hit 45% < 85% |
| `preOpeningCosts` | 20 | 0% | 12 | -41.7% ± 12% | bias-down | ✗ ±20% mid-hit 0% < 85% |
| `rampMonths` | 20 | 70% | 6 | -9.6% ± 21% | unbiased-noise | ✗ ±20% mid-hit 70% < 85% |
| `startOccupancy` | 20 | 0% | 7 | -38.4% ± 4% | bias-down | ✗ ±20% mid-hit 0% < 85% |
| `costAdmin` | 20 | 85% | 5 | +11.6% ± 8% | bias-up | ✓ |
| `costFFE` | 20 | 95% | 3 | +1.9% ± 6% | unbiased-noise | ✓ |
| `costPropertyOps` | 20 | 100% | 6 | +2.7% ± 7% | unbiased-noise | ✓ |
| `costUtilities` | 20 | 95% | 6 | +4.6% ± 9% | bias-up | ✓ |
| `incomeTax` | 20 | 95% | 13 | -5.7% ± 8% | bias-down | ✓ |
| `landValue` | 20 | 85% | 10 | -15.6% ± 7% | bias-down | ✓ |
| `revShareFB` | 20 | 90% | 7 | +0.9% ± 11% | unbiased-noise | ✓ |
| `saleCommission` | 20 | 100% | 3 | -18.0% ± 9% | bias-down | ✓ |

## Tier 3 — technical

Gate: legacy point within new range ≥ 80% (absolute fallback ±3pp).

| Field | n | Inclusion | Unique | Signed Δ ± σ | Bias | Verdict |
|---|---|---|---|---|---|---|
| `costSeg15yrPct` | 20 | 65% | 5 | -25.0% ± 7% | bias-down | ✗ inclusion 65% < 80% |
| `costSeg5yrPct` | 20 | 35% | 2 | -26.7% ± 7% | bias-down | ✗ inclusion 35% < 80%; unique ranges 2 < 3 (mode collapse) |
| `svcFeeAccounting` | 20 | 35% | 3 | -39.4% ± 14% | bias-down | ✗ inclusion 35% < 80% |
| `svcFeeGeneralMgmt` | 20 | 100% | 2 | +3.6% ± 10% | unbiased-noise | ✗ unique ranges 2 < 3 (mode collapse) |
| `svcFeeMarketing` | 20 | 100% | 1 | -2.5% ± 8% | unbiased-noise | ✗ unique ranges 1 < 3 (mode collapse) |
| `svcFeeTechRes` | 20 | 100% | 2 | +5.8% ± 17% | unbiased-noise | ✗ unique ranges 2 < 3 (mode collapse) |
| `apDays` | 20 | 100% | 6 | -5.9% ± 11% | bias-down | ✓ |
| `arDays` | 20 | 95% | 8 | -8.1% ± 11% | bias-down | ✓ |
| `costIT` | 20 | 95% | 4 | +0.4% ± 14% | unbiased-noise | ✓ |
| `costOther` | 20 | 95% | 5 | +9.2% ± 26% | unbiased-noise | ✓ |
| `costSeg7yrPct` | 20 | 100% | 6 | -3.1% ± 5% | bias-down | ✓ |
| `revShareEvents` | 20 | 90% | 6 | -15.0% ± 22% | bias-down | ✓ |
| `revShareOther` | 20 | 85% | 6 | -9.4% ± 27% | unbiased-noise | ✓ |
| `svcFeeProcurement` | 20 | 95% | 6 | -9.5% ± 17% | bias-down | ✓ |
| `svcFeeRevMgmt` | 20 | 80% | 3 | -26.7% ± 11% | bias-down | ✓ |

## Direction-of-failure summary

For any failing field, **bias** column distinguishes:
  - **bias-up / bias-down** — new path is systematically higher / lower
    than legacy. Field-level fix likely required (definition tighten,
    prompt anchor, benchmark injection).
  - **unbiased-noise** — new path drifts symmetrically around legacy.
    This is two stochastic Opus runs disagreeing within their natural
    spread; not blocking under the noise-floor argument.

`signed Δ ± σ` is mean ± std dev of `(new.mid − legacy.mid) / max(|legacy.mid|, 0.5)`
across the 20 cases.

## Adapter rules
None — this revision drops the verdict adapter entirely. The respec
measures value-agreement (midpoint + range inclusion), not
representation-agreement (severity + action). See respec doc for
the full rationale.
