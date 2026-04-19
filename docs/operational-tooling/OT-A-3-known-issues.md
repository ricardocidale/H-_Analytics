# OT-A.3 / OT-A.4 — Known issues + deferred remediation

**Date filed:** 2026-04-19
**Phase:** OT-A.3 closeout / OT-A.4 unblock
**Status:** Living doc — updated when fixes ship or new issues surface.
**Cross-refs:**
  - `OT-A-3-field-tiering.md` — approved 41-field tiering
  - `OT-A-3-path3-respec.md` — tier-based gate spec
  - `OT-A-3-verdict-parity.md` — auto-written gate evaluation
  - `BLOCKED-ota3-path3.md` — third-class mechanism bug + ESCALATED outcome
  - `.claude/rules/llm-contract-migration-parity.md` — rule documenting mechanism bug #3

## Purpose

After Path 3's tier-based respec ran offline against v4 raw, several
field-level misses were classified as **deferrable** rather than
**blocking** for OT-A.4. This doc tracks them so:
  - Future audits can see the conscious "ship despite this" decisions.
  - OT-A.5 (planned post-OT-A.4 batch) has a single source of truth
    for what still needs fixing.
  - Investors / auditors who ask "why is `costHousekeeping` 43% high?"
    get a documented answer rather than a rediscovery.

## Decision matrix

User-approved triage 2026-04-19 (D1–D5 in chat):

| Field | Tier | v4 metric | Decision | Reason |
|---|---|---|---|---|
| `incentiveFee` | T1 | mid±10% 75%, 1 unique | **ACCEPT** | Industry-standardized; 75% mid-hit is acceptable. (D1) |
| `ltv` | T1 | mid±10% 100%, bucket 20% | **ACCEPT** | 100% midpoint hit = value-parity OK; narrow-bucket is an artifact of new-path emitting tighter range around same midpoint. (D1) |
| `inflationRate` | T1 | mid±10% 35%, 2 unique, bias-down | **FIX (v5 pending)** | Country-CPI anchor edited in `ed42d8ac`; awaiting v5 validation. (D1, D5-watch) |
| `svcFeeMarketing` | T3 | inclusion 100%, 2 unique | **FIX (v5 pending)** | Per-market reasoning anchor edited in `ed42d8ac`; awaiting v5. Even though T3, mode-collapse-shipping is banned by `field-definitions-no-prescription-hints` rule. (D4) |
| `svcFeeTechRes` | T3 | inclusion 100%, 2 unique, bias-down | **FIX (v5 pending)** | Same as above. (D4) |

## Deferred to OT-A.5 — Tier-2 USALI cost-line biases (6 fields)

All 6 share the same mechanism: definition is correct
(USALI-standard denominator) but lacks a benchmark anchor that
points Opus at the right per-market evidence source. Unlike
mechanism bug #2 (mode collapse), these 6 fields **do** vary across
markets — they just vary in a systematically-biased band relative
to legacy.

Per D2: ship OT-A.4 first, fix all 6 in a single OT-A.5 batch
($22 v6 rerun). Operating-margin impact only; no headline NPV
impact.

| Field | v4 mid±20% | Signed Δ | σ | Bias | Hypothesis |
|---|---|---|---|---|---|
| `costHousekeeping` | 10% | +43% | 10% | bias-up | New path emits ~30% (% of room rev); legacy emits ~21%. Likely needs anchor to USALI 2024 boutique-luxury median (~21–25%). |
| `costMarketing` | 35% | +28% | 14% | bias-up | New emits ~6.5% of total rev; legacy ~5%. Anchor to STR 2024 marketing-spend benchmarks. |
| `costPropertyTaxes` | 70% | -13% | 16% | bias-down | New is mostly within tolerance; close to passing. May absorb without explicit fix if v5 ripple helps. |
| `preOpeningCosts` | 25% | -36% | 19% | bias-down | New emits ~$1.2M; legacy ~$1.9M for boutique-lux. Needs anchor to ISHC pre-opening cost per key. |
| `startOccupancy` | 0% | -37% | 4% | bias-down | New emits ~25%; legacy ~40%. Definition may need to clarify "month 1 of operations" vs "first quarter average." Bias is consistent across all markets — high-confidence fix. |
| `catering` | 45% | +16% | 30% | bias-up | High σ — borderline noise. May not need fix. Re-evaluate after v5 confirms other anchors don't ripple. |

## Acknowledged-as-noise (do not fix)

These misses are **unbiased-noise** under the direction-of-failure
diagnostic — two stochastic Opus runs disagreeing within their
natural spread. Documented for honesty, not blocking.

### Tier 1 (1 field)
| Field | v4 metric | Signed Δ ± σ |
|---|---|---|
| `adrGrowth` | bucket 45%, mid±10% 65% | small mean Δ, σ similar magnitude → noise |

`adrGrowth` is a borderline case — close to 90% threshold but the
direction tag is `unbiased-noise`. Re-evaluate post-v5 in case the
inflationRate anchor ripples (both are macro rates).

### Tier 2 (3 fields)
| Field | v4 mid±20% | Signed Δ ± σ |
|---|---|---|
| `landValue` | 65% | -7.3% ± 17% — noise |
| `occupancyStep` | 65% | -6.1% ± 23% — noise |
| `rampMonths` | 75% | -8.3% ± 22% — noise |

### Tier 3 (3 fields)
| Field | v4 inclusion | Signed Δ ± σ |
|---|---|---|
| `costSeg5yrPct` | 70% | -12.0% ± 13% — borderline; could shift to noise on rerun |
| `costSeg15yrPct` | 70% | -24.7% ± 8% — possibly bias-down. **Re-evaluate after v5.** |
| `svcFeeAccounting` | 15% | -44.4% ± 8% — bias-down. **Open question for OT-A.5.** |

`svcFeeAccounting` and `costSeg15yrPct` are technically T3, so the
gate criterion is "legacy point within new range" — the bias is
real but the user-facing impact is small (T3 = small NPV). Decision:
ship OT-A.4 with these on the watchlist; fix in OT-A.5 if the
fixes for the bigger T2 biases naturally extend.

## Pending validation — v5 A/B (Apr 19, ~$22)

Three field anchors edited in `ed42d8ac`, fingerprint bumped in
`d3c25e86`:

  - `inflationRate` — country-CPI anchor (NEW pattern, not the
    validated strip-hints pattern). Watch: must produce ≥3 unique
    ranges across the 20 markets and pass mid±10% on ≥90% of cases.
  - `svcFeeMarketing` — strip-hints + per-market reasoning
    (validated pattern). Watch: ≥3 unique ranges.
  - `svcFeeTechRes` — strip-hints + per-market reasoning
    (validated pattern). Watch: ≥3 unique ranges.

**Success criteria for unblocking OT-A.4 (per user, this round):**
  - T1 ≥ 7/8 fields pass (or 8/8 minus `adrGrowth` documented as
    noise above)
  - 0 mode-collapsed fields except the documented `incentiveFee`
    exemption

**If v5 fails on `inflationRate`:** the country-CPI anchor design
itself may still be too prescriptive. Iteration plan in
`BLOCKED-ota3-path3.md` "next steps."

**If v5 fails on the svcFee* fields:** the strip-hints pattern is
more robust than the country-anchor; a re-fail here would be
surprising and warrants a deeper look at whether the legacy svcFee*
extractor is itself emitting collapsed values (in which case the
"fix" target should be the legacy baseline, not the new path).

## Out-of-scope for OT-A.5 (parking)

  - Bimodal language for `incentiveFee` (D5): "8-12% branded
    operator, 5-10% independent" to produce 2 unique ranges.
    Skip unless v5 results suggest the 1-unique-range exemption
    is masking a real bias. Re-evaluate post-OT-A.5.
  - The 6 T2 USALI anchors above. Bundle with v5 outcome into a
    single OT-A.5 design pass once v5 confirms which anchor pattern
    works for which mechanism.
