# OT-A.5 Section A — Q1 re-verification cross-check (Claude Code)

**Date filed:** 2026-04-19
**Purpose:** Independent verification of Replit's upcoming Section A conclusion. Run the Q1 re-verification protocol from `OT-A-5-design.md` §A against `OT-A-3-ab-raw.json` v5 data. Cross-check before the $22 v6 authorization.
**Spend:** $0 (offline read of existing raw data).
**Authority:** This doc is a pre-authorization cross-check. Replit's formal Section A conclusion lives in `OT-A-3-parity-exemptions.md` when they complete their own Q1 re-verification. If our conclusions diverge, reconcile before the v6 commit.

---

## Finding — the design doc's verification protocol assumes something that isn't true

**The v5 test set has zero country diversity. All 20 markets are US states.** The Q1 re-verification protocol as written in `OT-A-5-design.md` §A cannot distinguish STAYS vs. PROMOTED branches because both collapse to the same observation when every test market is in the same country.

### Raw data extraction

Per-case legacy (`oldMid`) and new-path (`newMid`) inflationRate, pulled directly from `OT-A-3-ab-raw.json`:

| # | Market | Legacy `oldMid` | New `newMid` | Δ (abs pp) |
|---|---|---:|---:|---:|
| 01 | Charleston, SC | 2.8 | 2.5 | -0.3 |
| 02 | Aspen, CO | 3.2 | 2.5 | -0.7 |
| 03 | Napa Valley, CA | 3.2 | 2.8 | -0.4 |
| 04 | Newport, RI | 3.2 | 2.5 | -0.7 |
| 05 | Sedona, AZ | 3.2 | 2.5 | -0.7 |
| 06 | Savannah, GA | 2.8 | 2.5 | -0.3 |
| 07 | Park City, UT | 3.2 | 2.5 | -0.7 |
| 08 | Carmel, CA | 3.2 | 2.8 | -0.4 |
| 09 | Hudson Valley, NY | 2.8 | 2.5 | -0.3 |
| 10 | Telluride, CO | 2.8 | 2.8 |  0.0 |
| 11 | Healdsburg, CA | 3.2 | 2.8 | -0.4 |
| 12 | Camden, ME | 2.8 | 2.5 | -0.3 |
| 13 | Big Sur, CA | 3.2 | 2.8 | -0.4 |
| 14 | Jackson, WY | 3.2 | 2.8 | -0.4 |
| 15 | Provincetown, MA | 3.2 | 2.8 | -0.4 |
| 16 | St. Helena, CA | 3.2 | 3.0 | -0.2 |
| 17 | Stowe, VT | 2.8 | 2.5 | -0.3 |
| 18 | Outer Banks, NC | 3.2 | 2.5 | -0.7 |
| 19 | Marfa, TX | 2.8 | 2.5 | -0.3 |
| 20 | Bar Harbor, ME | 2.8 | 2.5 | -0.3 |

### Histograms

| Path | Unique values | Count by value |
|---|---:|---|
| Legacy (`oldMid`) | 2 | `3.2` ×12, `2.8` ×8 |
| New (`newMid`) | 3 | `2.5` ×12, `2.8` ×7, `3.0` ×1 |

### Summary stats

- Mean legacy: **3.04%**
- Mean new: **2.63%**
- Mean absolute Δ: **−0.41 percentage points**
- Relative Δ: **−13%** (the "bias-down 13%" figure in OT-A.3 matches this)

## Interpretation vs. the design doc decision rule

`OT-A-5-design.md` §A specifies three branches:

> - **STAYS Class 4** — if ≥ 15/20 cases have country-matching CPI (e.g., MX → 4.5%, BR → 4.2%, US → 2.5%) → legacy LEA is country-aware.
> - **PROMOTED Class 2** — if ≥ 15/20 cases collapse to a single value → LEA itself is country-CPI-ignorant.
> - **DEFER** — mixed 5–14/20 country-matching → insufficient evidence.

**Applying the rule to this data:**

- PROMOTED requires uniq = 1 across 20 cases. Observed legacy uniq = 2. **PROMOTED ruled out.**
- STAYS requires ≥ 15/20 cases with country-matching CPI. All 20 markets are US, so the decision criterion reduces to "≥ 15/20 cases emit a defensible US CPI reading." Both `2.8` and `3.2` are within the BLS US CPI range for recent years (2023 was ~3.4%, 2024 was ~2.9%). So 20/20 emit defensible US values → STAYS passes this narrow reading.
- But STAYS was intended to prove *country-awareness*, not *US-plausibility*. The rule collapses when the test set has no country variation.

**The decision rule doesn't cleanly apply.** The Q1 re-verification protocol as written assumes the test set would include non-US markets. It doesn't.

## Recommended reclassification — Class 3, not Class 4

Without the country-awareness question resolvable, the correct classification follows from the empirical distribution:

**inflationRate → Class 3 (stochastic noise floor)**, per `.claude/rules/parity-exemption-classes.md`:

> Qualification bars (all must hold):
> - unique-range count ≥ 3 across N markets (not mode-collapsed) ✓ new uniq=3
> - Δ is within 1σ of observed variance (unbiased noise) — Δ̄ = -0.41pp, σ of absolute deltas ≈ 0.2pp. |Δ̄| > 1σ, so strictly fails the "unbiased" bar.
> - OR the failure margin is ≤ 10 percentage points ✓ |Δabs| = 0.41pp, far within 10pp tolerance.

The "OR" clause is the qualifier. Absolute Δ of 0.41pp is small in real terms — the -13% relative figure is magnification of a small denominator (dividing -0.41 by ~3.0). Both paths emit plausible US CPI readings drawn from the same real-world range; legacy picks from {2.8, 3.2} and new picks from {2.5, 2.8, 3.0}. Neither is wrong.

### What this means for OT-A.5 v6 batch

**Drop Section A anchor from v6.** No country-CPI anchor needed. No new-path prompt change on inflationRate. The "legacy-inaccurate" framing was wrong; the "under-reasoned" framing was wrong; the correct framing is "noise floor magnified by small denominator."

This:
1. Saves ~20 LOC of v6 prompt changes.
2. Removes one risk from v6 batch (risk of re-collapse if the country-CPI anchor is too prescriptive — R2 from Replit's risk register).
3. Tightens the v6 scope to just Section B (6 USALI anchors) + Section C.2 (cost-seg strengthen). Cleaner test.

### What this does NOT change

- The T+72h authorization gate stays. The NaN-coercion detection (OT-A.5 gate clause 2) is orthogonal.
- The Class 3 reclassification affects `OT-A-3-parity-exemptions.md` only; no engine-version bump required (prompt files unchanged).
- `inflationRate` in exemption-adjusted T1 scoring stays PASS. Raw T1 stays FAIL. The 7/8 exemption-adjusted OT-A.4 baseline preserves.

## Future work — multi-country test set

For any future LLM-migration A/B harness that includes jurisdiction-sensitive fields (`inflationRate`, `incomeTax`, `costPropertyTaxes`, regulatory rates), the test set MUST include at least one non-primary-jurisdiction case. Without it, legacy's country-awareness cannot be verified and claims of legacy-inaccurate can't be grounded.

Candidate future test set additions (if the business portfolio expands): México (MX), Colombia (CO), Panamá (PA), Portugal (PT), Italy (IT) — these are boutique-luxury-plausible jurisdictions with published CPI readings that differ meaningfully from US CPI.

This is an OT-B or future-harness design item, not a v6 blocker.

## Reconciliation with Replit

If Replit's Section A conclusion comes back **STAYS Class 4 + country-CPI anchor in v6**: disagree, flag this doc, reconcile before the $22 spend. Adding an anchor that Section A's protocol can't actually justify (because the test set is single-country) would be scope creep.

If Replit's Section A conclusion comes back **PROMOTED Class 2**: disagree, flag this doc. Legacy uniq = 2 rules out the single-constant hard-code assumption.

If Replit's Section A conclusion comes back **DEFER**: partial agreement. DEFER is defensible ("insufficient evidence from this test set"). Upgrading to **Class 3 reclassification** is a stronger conclusion because the noise-floor qualifier cleanly applies to the data we do have. Either outcome results in "no v6 anchor needed" — zero spend difference.

My recommendation is Class 3; DEFER is the acceptable fallback if Replit prefers to wait for a multi-country test set before committing to a classification.

---

## Conclusion

- Legacy is not hard-coded (uniq = 2, not 1) → Class 2 ruled out.
- Test set has no country diversity → Class 4 country-awareness unverifiable.
- New path emits uniq = 3 with |Δabs| = 0.41pp → Class 3 qualifier applies.
- **Recommend Class 3 reclassification. Drop Section A anchor from v6 batch.**

## Related

- `docs/operational-tooling/OT-A-5-design.md` §A — Q1 re-verification protocol
- `docs/operational-tooling/OT-A-3-parity-exemptions.md` — current exemption table (Class 4 entry for inflationRate to be updated)
- `docs/operational-tooling/OT-A-3-ab-raw.json` — source data
- `.claude/rules/parity-exemption-classes.md` — taxonomy + qualification bars
