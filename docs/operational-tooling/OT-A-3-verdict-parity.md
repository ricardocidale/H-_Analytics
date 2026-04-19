# OT-A.3 Path 3 — Verdict-layer Parity

**Generated:** 2026-04-19T15:42:38.700Z
**Source:** `docs/operational-tooling/OT-A-3-ab-raw.json` (v4, 800 shared field-cases across 20 markets)
**Method:** Offline deterministic transform — no Opus rerun required. See script header for adapter rules.

## Verdict — FAIL

| Pass | Gate | Observed |
|---|---|---|
| ✗ | Severity exact-match ≥ 95% | 13.6% |
| ✗ | Action.kind exact-match ≥ 95% | 13.6% |
| ✗ | Range overlap ≥ 50% average | 6.0% |

**Diagnostic (non-gating):** Bucket-match aggregate 40.8% (target ≥ 55.0%) ✗

## Why these gates and not others

The Phase-4 property/ICP specialists are 9-line placeholders. Without
a real specialist that consumes `ResearchValues` and produces
`RawVerdictDimension[]`, "verdict-layer parity" can't mean
"specialists output identical AnalystVerdicts" because the specialists
don't exist yet. So the harness defines a deterministic adapter
(severity from range-width, action.kind from severity + range
presence) and asks: would A and B's ranges, fed through the same
adapter, produce the same severity tier and the same action.kind?

This is the right question for OT-A.4 (deleting the legacy extractor):
if A and B agree at the verdict tier under any reasonable adapter,
then swapping A out for B doesn't change what users see.

The bucket-match diagnostic is preserved as a sanity check on the
underlying ranges, but the gates that matter for OT-A.4 unblock are
severity, action, and overlap.

## Per-field parity (sorted by severity match, worst first)

| Field | n | Severity match | Action match | Avg overlap | Bucket match |
|---|---|---|---|---|---|
| `adrGrowth` | 20 | 0.0% | 0.0% | 0.0% | 45.0% |
| `apDays` | 20 | 0.0% | 0.0% | 0.0% | 35.0% |
| `arDays` | 20 | 0.0% | 0.0% | 0.0% | 35.0% |
| `catering` | 20 | 0.0% | 0.0% | 0.0% | 20.0% |
| `costAdmin` | 20 | 0.0% | 0.0% | 0.0% | 15.0% |
| `costFB` | 20 | 0.0% | 0.0% | 0.0% | 30.0% |
| `costHousekeeping` | 20 | 0.0% | 0.0% | 0.0% | 0.0% |
| `costIT` | 20 | 0.0% | 0.0% | 0.0% | 65.0% |
| `costMarketing` | 20 | 0.0% | 0.0% | 0.0% | 0.0% |
| `costOther` | 20 | 0.0% | 0.0% | 0.0% | 30.0% |
| `costPropertyOps` | 20 | 0.0% | 0.0% | 0.0% | 35.0% |
| `costSeg15yrPct` | 20 | 0.0% | 0.0% | 0.0% | 0.0% |
| `costSeg5yrPct` | 20 | 0.0% | 0.0% | 0.0% | 40.0% |
| `costSeg7yrPct` | 20 | 0.0% | 0.0% | 0.0% | 65.0% |
| `costUtilities` | 20 | 0.0% | 0.0% | 0.0% | 50.0% |
| `incentiveFee` | 20 | 0.0% | 0.0% | 0.0% | 75.0% |
| `inflationRate` | 20 | 0.0% | 0.0% | 0.0% | 25.0% |
| `interestRate` | 20 | 0.0% | 0.0% | 0.0% | 85.0% |
| `landValue` | 20 | 0.0% | 0.0% | 0.0% | 10.0% |
| `occupancyStep` | 20 | 0.0% | 0.0% | 0.0% | 20.0% |
| `revShareEvents` | 20 | 0.0% | 0.0% | 0.0% | 15.0% |
| `revShareFB` | 20 | 0.0% | 0.0% | 0.0% | 40.0% |
| `revShareOther` | 20 | 0.0% | 0.0% | 0.0% | 15.0% |
| `saleCommission` | 20 | 0.0% | 0.0% | 0.0% | 10.0% |
| `startOccupancy` | 20 | 0.0% | 0.0% | 0.0% | 0.0% |
| `svcFeeAccounting` | 20 | 0.0% | 0.0% | 0.0% | 0.0% |
| `svcFeeGeneralMgmt` | 20 | 0.0% | 0.0% | 0.0% | 45.0% |
| `svcFeeMarketing` | 20 | 0.0% | 0.0% | 0.0% | 95.0% |
| `svcFeeProcurement` | 20 | 0.0% | 0.0% | 0.0% | 100.0% |
| `svcFeeRevMgmt` | 20 | 0.0% | 0.0% | 0.0% | 20.0% |
| `svcFeeTechRes` | 20 | 0.0% | 0.0% | 0.0% | 35.0% |
| `costFFE` | 20 | 5.0% | 5.0% | 0.0% | 85.0% |
| `costPropertyTaxes` | 20 | 5.0% | 5.0% | 0.0% | 45.0% |
| `capRate` | 20 | 10.0% | 10.0% | 50.4% | 100.0% |
| `incomeTax` | 20 | 50.0% | 50.0% | 0.0% | 55.0% |
| `adr` | 20 | 90.0% | 90.0% | 73.4% | 100.0% |
| `ltv` | 20 | 90.0% | 90.0% | 0.0% | 20.0% |
| `occupancy` | 20 | 95.0% | 95.0% | 47.7% | 70.0% |
| `preOpeningCosts` | 20 | 100.0% | 100.0% | 22.2% | 25.0% |
| `rampMonths` | 20 | 100.0% | 100.0% | 46.7% | 75.0% |

## Per-case parity

| # | Market | n | Severity match | Action match | Avg overlap |
|---|---|---|---|---|---|
| 01 | Charleston, SC | 40 | 10.0% | 10.0% | 5.8% |
| 02 | Aspen, CO | 40 | 10.0% | 10.0% | 4.2% |
| 03 | Napa Valley, CA | 40 | 17.5% | 17.5% | 7.6% |
| 04 | Newport, RI | 40 | 12.5% | 12.5% | 6.0% |
| 05 | Sedona, AZ | 40 | 15.0% | 15.0% | 5.9% |
| 06 | Savannah, GA | 40 | 15.0% | 15.0% | 6.0% |
| 07 | Park City, UT | 40 | 12.5% | 12.5% | 5.3% |
| 08 | Carmel, CA | 40 | 10.0% | 10.0% | 5.7% |
| 09 | Hudson Valley, NY | 40 | 15.0% | 15.0% | 6.1% |
| 10 | Telluride, CO | 40 | 15.0% | 15.0% | 7.1% |
| 11 | Healdsburg, CA | 40 | 17.5% | 17.5% | 6.1% |
| 12 | Camden, ME | 40 | 15.0% | 15.0% | 5.7% |
| 13 | Big Sur, CA | 40 | 7.5% | 7.5% | 5.9% |
| 14 | Jackson, WY | 40 | 17.5% | 17.5% | 8.4% |
| 15 | Provincetown, MA | 40 | 12.5% | 12.5% | 4.0% |
| 16 | St. Helena, CA | 40 | 12.5% | 12.5% | 6.0% |
| 17 | Stowe, VT | 40 | 17.5% | 17.5% | 6.4% |
| 18 | Outer Banks, NC | 40 | 12.5% | 12.5% | 6.3% |
| 19 | Marfa, TX | 40 | 15.0% | 15.0% | 7.1% |
| 20 | Bar Harbor, ME | 40 | 12.5% | 12.5% | 4.5% |

---

## Adapter rules (reference)

```
severity:
  range null                          → warning
  width = (high-low)/|mid| > 0.40     → advisory   (very wide)
  width > 0.20                         → advisory   (moderate)
  else                                 → ok         (tight)

action.kind:
  range null                           → consult-cognitive
  width <= 0.20                        → accept-range
  width > 0.20                         → consult-cognitive
```

The thresholds (0.20 tight / 0.40 very wide) are calibrated against
boutique-luxury benchmarks: a ±10% band around mid (e.g. ADR
$675-$825 on $750 mid, width 0.20) is the L+B "actionable" band.
Anything wider is "needs human review."
