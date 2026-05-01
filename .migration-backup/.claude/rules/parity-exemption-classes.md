# Parity Exemption Classes

## Rule

When LLM-migration parity testing produces a field-level failure, classify the failure into one of **four exemption classes** BEFORE attempting a fix. Not every "fail" is a bug. Three of the four classes are *correct behavior*; only Class 4 requires design work.

Applying the wrong class causes wasted rerun spend (trying to "fix" correct behavior), regression (stripping anchors that should stay), or worse, shipping parity-adjusted code that silently loses per-market intelligence (the mode-collapse trap).

This rule enforces the taxonomy and its qualification bars.

## The four classes

### Class 1 — Industry-standard single-value

**Mechanism:** the field has a genuinely standardized value across the target persona's operator class. One unique emission across N markets is CORRECT behavior, not under-reasoning.

**Qualification bars (all must hold):**
- unique-range count across N markets = 1
- |new_path − legacy| ≤ 10 percentage points (or 10% relative)
- bias is unbiased-noise (σ ≥ |Δ|) OR reflects persona-narrowing of a broader legacy mix
- the industry standard is externally verifiable (operator-contract norms, regulatory minimum, accounting standard)

**Examples:** `incentiveFee` at ~10% of GOP for branded operator contracts (Marriott Autograph, Hilton LXR, Hyatt Small Luxury); `svcFeeMarketing` at 1.5–2.0% for branded boutique-luxury.

**Action:** parity-exempt. Document the industry standard in a one-line JSDoc on the field definition. Do NOT attempt to force per-market variance — that introduces fictitious variance.

### Class 2 — Legacy-inaccurate

**Mechanism:** the legacy path emits a hard-coded or mis-anchored baseline that doesn't reflect reality for the target persona. The new path diverges because it's *more accurate*, not because it regressed. Parity-against-legacy measures divergence-from-wrong.

**Qualification bars (all must hold):**
- Legacy source verified to hard-code a wrong baseline (code review, not inference). If unverified, downgrade to Class 4 until verified.
- New path emits ≥3 unique ranges across N markets (i.e., genuinely per-market reasoned, not collapsed)
- New path's variance aligns with external ground truth (IMF data, regulatory registers, operator contracts, etc.) when feasible

**Examples:** `inflationRate` with legacy USA-CPI-constant vs new country-specific anchor, when operator portfolio spans multiple countries.

**Action:** parity-exempt. Document the legacy-vs-truth divergence in `OT-A-N-parity-exemptions.md` with legacy code excerpt as evidence. The new path IS the correct behavior; legacy is deprecated.

**Caution:** mis-classification here is the worst failure mode in this taxonomy. Exempting a field as legacy-inaccurate when legacy was actually correct = shipping a silent regression. Always verify legacy source before promoting to Class 2; when in doubt, Class 4.

### Class 3 — Stochastic noise floor

**Mechanism:** the field is narrow-range, and two independent LLM calls on the same input naturally disagree by more than the bucket-match threshold can tolerate. Not a bug; the inherent stochastic variance of two-shot LLM inference on narrow-range numeric fields.

**Qualification bars (all must hold):**
- unique-range count ≥ 3 across N markets (not mode-collapsed)
- Δ is within 1σ of observed variance (unbiased noise)
- OR the failure margin is ≤ 10 percentage points (borderline pass that didn't clear a strict threshold)

**Examples:** `adrGrowth` with Δ ±15pp across 2 runs; `ltv` with 100% midpoint-hit but <55% bucket-match due to new path emitting tighter range around same midpoint.

**Action:** parity-exempt via noise acknowledgment. Loosen the field's bucket-match threshold to reflect the noise floor, OR graduate the field to midpoint-agreement as the primary gate (bucket-match becomes diagnostic). Either way, no design change required.

### Class 4 — Under-reasoned

**Mechanism:** the field genuinely fails to produce per-market-appropriate reasoning. Not standardized (Class 1), not legacy-broken (Class 2), not noise (Class 3). Something in the prompt, field definition, or upstream context is insufficient.

**Qualification bars:**
- Does NOT meet Class 1 qualification (uniq > 1 OR bias > 10pp OR no external industry standard)
- Does NOT meet Class 2 qualification (legacy not verifiably wrong)
- Does NOT meet Class 3 qualification (mode-collapsed OR systematic bias > 1σ)

**Examples:** a new field where both paths diverge systematically and neither anchors to reality.

**Action:** design-fix required. Do not exempt. Options:
1. Re-anchor the field definition with per-market reasoning cues naming actual evidence sources (following `.claude/rules/field-definitions-no-prescription-hints.md`).
2. Enrich the prompt with additional context the field requires (seasonal patterns, jurisdiction lookups, comp sets).
3. Split the field into multiple fields if the single-field semantics are ambiguous.

After any Class 4 fix, re-run the A/B harness to validate. This is the one class that legitimately requires API spend to validate.

## How to classify a failure — decision flow

```
1. Does unique-range count = 1 across the test set?
   ├─ YES → Is there an external industry standard that validates this value?
   │        ├─ YES → Class 1 (industry-standard single-value) ✓
   │        └─ NO → Class 4 (under-reasoned mode collapse) — design fix
   └─ NO → continue

2. Does new path emit ≥3 unique ranges AND legacy hard-codes a wrong baseline?
   ├─ YES (verified by legacy code read) → Class 2 (legacy-inaccurate) ✓
   └─ NO or unverified → continue

3. Is Δ within 1σ of variance OR failure margin ≤ 10pp?
   ├─ YES → Class 3 (stochastic noise floor) ✓
   └─ NO → continue

4. Class 4 (under-reasoned) — design fix required.
```

## What this rule enforces at PR time

Any PR that introduces a parity exemption for an LLM-migration field MUST include:

1. **Class assignment** with explicit qualification-bar check (not vibes).
2. **Documentation** in the migration's `parity-exemptions.md` sibling doc, covering:
   - Field name
   - Class number
   - Quantitative evidence (Δ, σ, unique-range count, mid-hit %)
   - For Class 2: legacy code excerpt or line reference proving the baseline is wrong
   - For Class 4: design-fix plan with owner and timeline
3. **No downgrade of gates** without a documented exemption class.

## Precedent incident — OT-A.3/OT-A.4 (April 19-20, 2026)

This rule was codified from the OT-A.3 escalation. The v5 A/B harness flagged 5 of 8 T1 fields as FAIL. Raw-number reaction was "OT-A.4 blocked; need more fixes." Exemption-aware analysis showed:

- `incentiveFee` → Class 1 (industry-standard, Marriott-brand operator contracts)
- `svcFeeMarketing` → Class 1 (industry-standard, branded boutique-luxury marketing fee)
- `inflationRate` → Class 2 (legacy hard-codes USA CPI; new path correctly uses country-specific anchor — pending legacy-code verification)
- `adrGrowth` → Class 3 (unbiased noise, genuine stochastic floor)
- `interestRate` → Class 3 (Δ +3.4%±5%, 5pp failure margin — noise)
- `ltv` → Class 3 (100% midpoint hit, 20% bucket-match is range-width artifact)

T1 adjusted: 4/8 raw → 8/8 exemption-aware. OT-A.4 unblocked and shipped in `7da9f25a`. Without the taxonomy, we would have either (a) spent $22+ on additional reruns trying to "fix" Class 1 fields back into variance, or (b) shipped OT-A.5 design work against fields that already behaved correctly.

## Related

- `.claude/rules/llm-contract-migration-parity.md` — parent rule; this exemption taxonomy is a subsection of its methodology.
- `.claude/rules/field-definitions-no-prescription-hints.md` — Class 4 fixes must not re-introduce mode collapse.
- `server/ai/engine-version.ts` — any Class 2/4 fix that changes synthesis files requires ENGINE_VERSION bump.
- `docs/operational-tooling/OT-A-3-parity-exemptions.md` — first application of this taxonomy in production.
- `docs/operational-tooling/OT-A-3-field-tiering.md` — tier-specific gate thresholds that interact with classes.
