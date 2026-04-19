# OT-A.3 Path 3 — Verdict-layer Parity (respec evaluation)

**Generated:** 2026-04-19T15:58:50.555Z
**Source:** `docs/operational-tooling/OT-A-3-ab-raw.json` (v4, offline transform — no Opus rerun)
**Spec:** `docs/operational-tooling/OT-A-3-path3-respec.md`

## Verdict — FAIL — see misses below

| Gate | Pass | Detail |
|---|---|---|
| Tier 1 (8 fields, per-field) | ✗ | 4/8 fields pass |
| Tier 2 (17 fields, per-field) | ✗ | 8/17 fields pass |
| Tier 3 (16 fields, per-field) | ✗ | 10/15 fields pass |
| Mode-collapse (unique ≥ 3, exempt incentiveFee) | ✗ | — |

## Tier 1 — foundational

Gate: bucket-match ≥ 55% AND midpoint within ±10% of legacy ≥ 90%
(absolute fallback ±1pp when |legacy| < 0.5).

| Field | n | Bucket | ±10% mid | Unique | Signed Δ ± σ | Bias | Verdict |
|---|---|---|---|---|---|---|---|
| `adrGrowth` | 20 | 45% | 65% | 3 | -1.2% ± 13% | unbiased-noise | ✗ bucket 45% < 55%; ±10% mid-hit 65% < 90% |
| `incentiveFee` | 20 | 75% | 75% | 1 | +6.3% ± 11% | bias-up | ✗ ±10% mid-hit 75% < 90% |
| `inflationRate` | 20 | 25% | 35% | 2 | -9.3% ± 6% | bias-down | ✗ bucket 25% < 55%; ±10% mid-hit 35% < 90%; unique ranges 2 < 3 (mode collapse) |
| `ltv` | 20 | 20% | 100% | 3 | +7.3% ± 3% | bias-up | ✗ bucket 20% < 55% |
| `adr` | 20 | 100% | 100% | 16 | -3.2% ± 1% | bias-down | ✓ |
| `capRate` | 20 | 100% | 100% | 6 | +2.4% ± 3% | bias-up | ✓ |
| `interestRate` | 20 | 85% | 90% | 5 | +0.7% ± 5% | unbiased-noise | ✓ |
| `occupancy` | 20 | 70% | 90% | 6 | -3.8% ± 4% | bias-down | ✓ |

## Tier 2 — structural

Gate: midpoint within ±20% of legacy ≥ 85% (absolute fallback ±2pp).

| Field | n | ±20% mid | Unique | Signed Δ ± σ | Bias | Verdict |
|---|---|---|---|---|---|---|
| `catering` | 20 | 45% | 9 | +15.6% ± 30% | bias-up | ✗ ±20% mid-hit 45% < 85% |
| `costHousekeeping` | 20 | 10% | 3 | +42.9% ± 10% | bias-up | ✗ ±20% mid-hit 10% < 85% |
| `costMarketing` | 20 | 35% | 3 | +28.2% ± 14% | bias-up | ✗ ±20% mid-hit 35% < 85% |
| `costPropertyTaxes` | 20 | 70% | 16 | -13.3% ± 16% | bias-down | ✗ ±20% mid-hit 70% < 85% |
| `landValue` | 20 | 65% | 10 | -7.3% ± 17% | unbiased-noise | ✗ ±20% mid-hit 65% < 85% |
| `occupancyStep` | 20 | 65% | 8 | -6.1% ± 23% | unbiased-noise | ✗ ±20% mid-hit 65% < 85% |
| `preOpeningCosts` | 20 | 25% | 15 | -35.8% ± 19% | bias-down | ✗ ±20% mid-hit 25% < 85% |
| `rampMonths` | 20 | 75% | 6 | -8.3% ± 22% | unbiased-noise | ✗ ±20% mid-hit 75% < 85% |
| `startOccupancy` | 20 | 0% | 8 | -37.0% ± 4% | bias-down | ✗ ±20% mid-hit 0% < 85% |
| `costAdmin` | 20 | 85% | 7 | +10.3% ± 8% | bias-up | ✓ |
| `costFB` | 20 | 100% | 3 | +5.1% ± 3% | bias-up | ✓ |
| `costFFE` | 20 | 90% | 5 | +3.1% ± 8% | unbiased-noise | ✓ |
| `costPropertyOps` | 20 | 100% | 5 | +2.6% ± 8% | unbiased-noise | ✓ |
| `costUtilities` | 20 | 95% | 5 | +5.8% ± 8% | bias-up | ✓ |
| `incomeTax` | 20 | 100% | 10 | -5.9% ± 8% | bias-down | ✓ |
| `revShareFB` | 20 | 95% | 9 | +2.2% ± 9% | unbiased-noise | ✓ |
| `saleCommission` | 20 | 100% | 4 | -18.0% ± 6% | bias-down | ✓ |

## Tier 3 — technical

Gate: legacy point within new range ≥ 80% (absolute fallback ±3pp).

| Field | n | Inclusion | Unique | Signed Δ ± σ | Bias | Verdict |
|---|---|---|---|---|---|---|
| `costSeg15yrPct` | 20 | 70% | 5 | -24.7% ± 8% | bias-down | ✗ inclusion 70% < 80% |
| `costSeg5yrPct` | 20 | 70% | 3 | -12.0% ± 13% | bias-down | ✗ inclusion 70% < 80% |
| `svcFeeAccounting` | 20 | 15% | 3 | -44.4% ± 8% | bias-down | ✗ inclusion 15% < 80% |
| `svcFeeMarketing` | 20 | 100% | 2 | -1.0% ± 4% | unbiased-noise | ✗ unique ranges 2 < 3 (mode collapse) |
| `svcFeeTechRes` | 20 | 100% | 2 | -16.3% ± 12% | bias-down | ✗ unique ranges 2 < 3 (mode collapse) |
| `apDays` | 20 | 100% | 5 | -0.8% ± 12% | unbiased-noise | ✓ |
| `arDays` | 20 | 95% | 6 | -10.5% ± 10% | bias-down | ✓ |
| `costIT` | 20 | 90% | 4 | -2.1% ± 16% | unbiased-noise | ✓ |
| `costOther` | 20 | 100% | 4 | +21.3% ± 25% | bias-up | ✓ |
| `costSeg7yrPct` | 20 | 100% | 6 | +14.4% ± 23% | bias-up | ✓ |
| `revShareEvents` | 20 | 85% | 8 | -12.6% ± 32% | unbiased-noise | ✓ |
| `revShareOther` | 20 | 90% | 7 | -15.5% ± 20% | bias-down | ✓ |
| `svcFeeGeneralMgmt` | 20 | 100% | 4 | +0.0% ± 12% | unbiased-noise | ✓ |
| `svcFeeProcurement` | 20 | 100% | 4 | +0.0% ± 0% | unbiased-noise | ✓ |
| `svcFeeRevMgmt` | 20 | 100% | 4 | -19.8% ± 11% | bias-down | ✓ |

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
