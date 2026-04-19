# OT-A.3 Path 3 — Verdict-parity gate respec

**Generated:** 2026-04-19
**Phase:** OT-A.3 Path 3 (Option 1 + Option 3 from BLOCKED-ota3-path3.md)
**Status:** Approved by user; gate evaluation runs offline against v4 raw data.
**Source:** `docs/operational-tooling/OT-A-3-ab-raw.json` (v4, 800 shared field-cases over 20 markets, 41 canonical fields)

## Why this respec

The original Path 3 gate (severity ≥95% / action ≥95% / range overlap
≥50%) measured the wrong thing for this transition. The two A/B
paths emit **fundamentally different evidence shapes by design**:
legacy emits point estimates for 85% of fields, new emits explicit
ranges for 100% of fields. No verdict adapter that maps width-to-
severity can produce parity here without making the test trivial
or fictional. See `BLOCKED-ota3-path3.md` for the full diagnosis
of mechanism bug #3 (representational mismatch).

The respec swaps shape-aware metrics (severity / action / overlap)
for **value-aware metrics** (bucket-match + midpoint agreement).
This asks the question OT-A.4 actually cares about: when the legacy
path emits "9%" and the new path emits "8-12% mid 10%", are users
seeing similar values? If yes, swapping legacy out for new doesn't
materially change downstream cash-flow models or user actions.

## Tier assignment

See `OT-A-3-field-tiering.md` for the full 41-field classification
and rationale. Approved by user 2026-04-19.

Final tiers:

  - **Tier 1 (8 fields):** `adr`, `occupancy`, `capRate`, `ltv`,
    `incentiveFee`, `adrGrowth`, `inflationRate`, `interestRate`
  - **Tier 2 (17 fields):** `startOccupancy`, `occupancyStep`,
    `rampMonths`, `catering`, `revShareFB`, `landValue`,
    `saleCommission`, `costHousekeeping`, `costFB`, `costAdmin`,
    `costMarketing`, `costPropertyOps`, `costUtilities`, `costFFE`,
    `costPropertyTaxes`, `preOpeningCosts`, `incomeTax`
  - **Tier 3 (16 fields):** `revShareEvents`, `revShareOther`,
    `costIT`, `costOther`, `costSeg5yrPct`, `costSeg7yrPct`,
    `costSeg15yrPct`, `svcFeeMarketing`, `svcFeeTechRes`,
    `svcFeeAccounting`, `svcFeeRevMgmt`, `svcFeeGeneralMgmt`,
    `svcFeeProcurement`, `arDays`, `apDays`, `platformFee`

## Gates

All gates are evaluated **per field** (each field clears its tier's
gate independently). Aggregate-only would let weak fields hide
behind strong ones.

### Tier 1 gate
For each Tier 1 field:
  - **Bucket-match ≥ 55%** of cases (each path's range mutually
    contains the other's midpoint, per the existing v4 metric).
  - **AND midpoint within ±10% of legacy point ≥ 90% of cases**.

### Tier 2 gate
For each Tier 2 field:
  - **Midpoint within ±20% of legacy point ≥ 85% of cases**.

### Tier 3 gate
For each Tier 3 field:
  - **Legacy point within new range ≥ 80% of cases** (i.e. the
    legacy midpoint falls in `[new.low, new.high]`). For fields
    where new also has only a midpoint, this degenerates to
    midpoint exact-match — vanishingly rare in v4 (newRange null
    rate = 0%), so the inclusion test is the binding criterion.

### Mode-collapse gate (all fields)
  - **Per-field unique-range count ≥ 3 across the 20 markets.**
  - The single known exception is `incentiveFee` (1 unique range
    in v4 — confirmed real industry standardization, operator-brand
    contract-driven). It is documented in
    `OT-A-3-ab-results.md` v4 section and is treated as expected
    behaviour rather than a regression. The harness will report
    `incentiveFee` separately so the count gate doesn't flag it.

### Categorical gate (already passed in v4)
  - Schema validity 100% ✓
  - Voice violations 0/0 ✓
  - Unit / denominator / scope errors 0 ✓
  - Latency ≤ 2× ✓ (1.7× measured in v4)

## Tolerance arithmetic

For **midpoint within ±X%** the per-case test is:

```
let delta = new.mid − legacy.mid

if |legacy.mid| >= 0.5:
    relative = |delta| / |legacy.mid|
    pass = relative <= X / 100

else:
    # Absolute-fallback: avoid division blow-up on near-zero legacy
    # values (e.g. 0% inflationRate in a downturn scenario, ~0%
    # adrGrowth in a flat-rate market). Tolerance is in the field's
    # native units (percentage points for %, days for days, etc.).
    abs_tol = T1 -> 1.0 pp   # ±1pp absolute for T1
              T2 -> 2.0 pp   # ±2pp absolute for T2
              T3 -> 3.0 pp   # ±3pp absolute for T3
    pass = |delta| <= abs_tol
```

The 0.5 fallback threshold is conservative — most real legacy
midpoints are well above 0.5 in their native units (a 10% rate, a
$500 ADR, 25 AR days). It only kicks in for genuine near-zero
cases, where relative-to-legacy is mathematically meaningless.

## Direction-of-failure diagnostic

For every field that misses its tier's gate, the harness reports:

  - **Signed mean delta:** `mean( (new.mid − legacy.mid) / |legacy.mid| )`
    over the 20 cases. Positive = new is systematically higher than
    legacy; negative = new is systematically lower; ~0 = unbiased
    noise around the legacy value.
  - **Std dev of relative deltas:** scale of stochastic spread.
  - **Verdict tag:** `bias-up`, `bias-down`, or `unbiased-noise`
    based on whether |signed mean| > 0.5 × std dev.

This is critical because **systematic bias on a Tier 1 field is a
different problem than unbiased noise**. Bias would require a
field-level fix (definition tightening, prompt anchor) before
OT-A.4 can ship. Unbiased noise is just two stochastic Opus runs
disagreeing within a tolerance — acknowledged as the noise floor,
not blocking.

## Decision rule

  - **All four gates pass (T1, T2, T3, no-mode-collapse) →** OT-A.4
    unblocks; legacy extractor can be retired.
  - **Specific fields miss →** field-level remediation list
    (definition tightening / prompt re-anchoring / explicit
    benchmark injection). OT-A.4 still ships if the misses are
    Tier-3 or are Tier-1/2 with `unbiased-noise` direction.
    Systematic bias on T1/T2 stays blocking.
  - **Cascade misses across many fields →** structural problem,
    file `BLOCKED-ota3-path3-revisited.md`.

## Cost
  - Respec build: trivial.
  - Offline gate evaluation: $0.
  - All work in this round: free.
