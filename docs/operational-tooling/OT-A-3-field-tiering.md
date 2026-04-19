# OT-A.3 — 41-field tiering for verdict-parity gate

**Generated:** 2026-04-19
**Phase:** OT-A.3 Path 3 respec (offline, no spend)
**Approval gate:** Awaiting user redirect before writing
`OT-A-3-path3-respec.md` and running offline computation.

## Tiering principle

Tier assignment ranks fields by **NPV-material impact on the model's
top-line outputs** (10-year DCF / exit value / cash-on-cash). The
tighter the tolerance, the more the field's noise propagates to
user-visible model results.

  - **Tier 1 — foundational:** error here moves model outputs
    materially. Bucket-match is the right metric and tolerance is
    tight. Either path getting these wrong is a real regression.
  - **Tier 2 — structural:** per-market correctness matters for
    line-item credibility, but ±20% drift on a single line item
    has bounded effect on the bottom line.
  - **Tier 3 — technical:** narrow industry-typical ranges, small
    NPV impact, or operator-brand-driven (not market-driven). Just
    needs the categorical gate (correct unit/denominator/scope) plus
    "legacy point falls inside new range."

## Tier 1 — foundational (8 fields)

Gate: **bucket-match ≥ 55% AND midpoint within ±10% of legacy point ≥ 90% of cases**

| Field | Why Tier 1 |
|---|---|
| `adr` | Drives ~70% of revenue; compounds with occupancy. Top revenue lever. |
| `adrGrowth` | Compounds over 10-year hold; sensitivity ~5× nominal rate at exit. |
| `occupancy` | The other side of revenue with ADR. Direct revenue multiplier. |
| `capRate` | Drives exit value linearly. Single biggest valuation lever. |
| `ltv` | Drives debt service AND levered IRR; affects every cash-on-cash. |
| `incentiveFee` | Large slice of GOP; materially affects NOI distribution. Per your seed. |
| `inflationRate` | Applied to ALL cost lines; compounds over hold. Macro foundation. |
| `interestRate` | Drives all debt service over the hold. Macro foundation. |

Note on `incentiveFee`: v4 collapsed to 1 unique range — this reflects
real industry standardization (operator brand contracts), not a
prompt failure. Bucket-match was 75% on v4. Should pass Tier 1 gates
trivially. If it doesn't, that *is* a real regression worth flagging.

## Tier 2 — structural (17 fields)

Gate: **midpoint within ±20% of legacy point ≥ 85% of cases**

| Field | Why Tier 2 |
|---|---|
| `startOccupancy` | Early-year cash flow; bounded by occupancyStep + rampMonths. |
| `occupancyStep` | Ramp shape; less material than rampMonths total. |
| `rampMonths` | Timing of stabilization. Per your seed. |
| `catering` | F&B uplift multiplier; material to F&B mix. |
| `revShareFB` | Major revenue line outside rooms. Per your seed. |
| `landValue` | Affects depreciable basis (tax shield); structural. |
| `saleCommission` | Narrow range but affects exit proceeds materially. |
| `costHousekeeping` | Largest direct departmental cost. |
| `costFB` | Material cost driver. Per your seed. |
| `costAdmin` | Largest USALI undistributed; per-market labor varies. |
| `costMarketing` | Material % of total revenue. |
| `costPropertyOps` | Per-market R&M intensity varies. |
| `costUtilities` | Per-market climate / energy cost varies materially. |
| `costFFE` | Material reserve line. Per your seed. |
| `costPropertyTaxes` | Large fixed cost; per-market mill rates vary widely. Per your seed. |
| `preOpeningCosts` | Affects pre-opening capital need. Dollar-units, large absolute spread. |
| `incomeTax` | Statutory; low variance but material in dollar terms. ±20% covers state add-on variance. |

## Tier 3 — technical (16 fields)

Gate: **legacy point within new range ≥ 80% of cases** (no tight midpoint requirement)

| Field | Why Tier 3 |
|---|---|
| `revShareEvents` | Small revenue line; ranges narrow. |
| `revShareOther` | Small revenue line; ancillary mix narrow. |
| `costIT` | Small cost line, narrow industry-standard ranges. |
| `costOther` | Small residual cost line. |
| `costSeg5yrPct` | Narrow MACRS-class ranges; depreciation timing not present-value-material. Per your seed. |
| `costSeg7yrPct` | Same as above. Per your seed. |
| `costSeg15yrPct` | Same as above. Per your seed. |
| `svcFeeMarketing` | Small fee, operator-brand-driven, narrow range. Per your seed. |
| `svcFeeTechRes` | Same as above. Per your seed. |
| `svcFeeAccounting` | Same as above. Per your seed. |
| `svcFeeRevMgmt` | Same as above. Per your seed. |
| `svcFeeGeneralMgmt` | Same as above. Per your seed. |
| `svcFeeProcurement` | Same as above. Per your seed. |
| `arDays` | Working-capital timing; small NPV impact. Per your seed. |
| `apDays` | Working-capital timing; small NPV impact. Per your seed. |
| `platformFee` | Industry-standard rate (Booking/Expedia/etc.); narrow. |

## Field count check

- Tier 1: 8 fields
- Tier 2: 17 fields
- Tier 3: 16 fields
- **Total: 41 ✓** (matches `CANONICAL_RESEARCH_FIELDS` length)

## Deviations from your seed

  - **Added to Tier 1 beyond your seed:** `adrGrowth`, `inflationRate`,
    `interestRate`. Reasoning: all three compound over the 10-year
    hold and have leverage on exit value comparable to or greater
    than `incentiveFee`. If you want to keep T1 to your original 5,
    push these three down to Tier 2 — say the word.
  - **`startOccupancy` placed in Tier 2** rather than Tier 1: it's
    over-constrained by `occupancyStep + rampMonths` once those are
    pinned, so independent agreement matters less. Could move to
    Tier 1 if you want.
  - **`incomeTax` placed in Tier 2** rather than Tier 1: usually
    a statutory rate (US federal 21% + state add-on), so per-market
    variance is real but bounded. ±20% covers the federal-only vs
    federal+CA spread. Could move to Tier 1 if you want exact-match.
  - **`landValue` placed in Tier 2** rather than Tier 1: affects
    depreciable basis (so tax shield NPV) but not top-line revenue
    or exit value directly. Could go to Tier 1 if depreciation tax
    shield is treated as primary.

## Open questions before respec

1. Are the three Tier 1 additions (adrGrowth, inflationRate,
   interestRate) acceptable, or do you want the original 5 only?
2. The Tier 1 "bucket-match ≥ 55%" criterion in the seed: is that
   per-field (each Tier 1 field individually ≥ 55%) or aggregate
   over Tier 1 (mean across the 8 fields)? Per-field is stricter
   and more diagnostic; aggregate is more forgiving and matches
   how the v4 results are reported. I'll default to **per-field**
   unless you say otherwise.
3. The "midpoint within ±X%" tolerance: should the comparison use
   `(new.mid − legacy.mid) / legacy.mid` (relative to legacy) or
   `(new.mid − legacy.mid) / max(|legacy.mid|, |new.mid|)` (symmetric)?
   The first is more legible ("how far did new drift from legacy")
   but penalises new for being more conservative. I'll default to
   **relative-to-legacy** unless you say otherwise.
