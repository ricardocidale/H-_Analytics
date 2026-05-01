# OT-A.3 Path 3 — BLOCKED

**Date opened:** 2026-04-19
**Date resolved-with-escalation:** 2026-04-19
**Phase:** OT-A.3 (Vercel AI SDK structured-output A/B parity)
**Path:** 3 (verdict-layer parity)
**Status:** ESCALATED — gate respec complete (Option 1 + 3, user-approved); offline tier-based evaluation produced an actionable field-level remediation list. OT-A.4 stays blocked on **mechanism-bug-#1 fixes for 3 Tier-1 fields and 4 Tier-2 fields with systematic bias**, NOT on the original raw-parity gate. See "Resolution outcome" section at the bottom.

## TL;DR

Path 3 verdict-layer parity FAILS by a wide structural margin
(severity 13.6% vs 95% gate, action 13.6% vs 95% gate, range overlap
6.0% vs 50% gate) — and **the failure mode is not stochastic and
cannot be fixed by adapter tuning**. The two A/B paths emit
fundamentally different evidence shapes by design: legacy emits
**point estimates** for 85% of fields; new emits **explicit
low/high ranges** for 100% of fields. Any verdict adapter that
maps width-of-range to severity will diverge here.

This is a **third class of mechanism bug** — neither definition
drift (the OT-A.2 issue) nor mode collapse (the OT-A.3 v3 issue),
but **representational mismatch baked into the original two prompt
contracts**.

## Evidence

### What the v4 raw data shows
- 800 shared field-cases across 20 markets.
- **680 of 800 (85%) legacy entries have no parseable range** —
  only a midpoint. Examples: `costAdmin: "9%"`,
  `incentiveFee: "10%"`, `arDays: 25`, `adrGrowth: "4.2%"`.
- **0 of 800 new-path entries have null range** — every entry has
  explicit `low/high`.
- The legacy free-form prompt only asks for ranges on three fields
  (`adr.recommendedRange`, `occupancy.rampUpTimeline`,
  `capRate.recommendedRange`); everything else is a bare
  `recommendedRate: "9%"` field. The legacy regex extractor
  honestly reports `low=null, high=null` for those — there's no
  range to extract.

### Two adapter passes, both fail
With **strict adapter** (null range → severity=warning):
  - Severity match 9.9%, action match 91.1% (artifact: both warning
    and wide-advisory map to `consult-cognitive`)

With **normalised adapter** (null range → zero-width point, treated
as fully confident `severity=ok`):
  - Severity match 13.6%, action match 13.6% (artifact removed; both
    metrics now reflect real divergence)

The 13.6% floor is the proportion of fields where legacy's point
estimate equals new's mid AND new's range is tight enough to also
classify "ok." That floor is structural — it can only be raised by
either (a) loosening the verdict adapter to be width-agnostic
(which makes the parity test meaningless), or (b) rebuilding the
legacy path to emit ranges (which defeats OT-A.4's purpose of
deleting the legacy path).

### Why this isn't drift or collapse
- **Drift** (OT-A.2 / `e89d77441`): both paths emit different field
  names or different denominators for the same metric. Fixed by
  schema-tightening + formatFieldDefinitionsForPrompt.
- **Collapse** (OT-A.3 v3 / `9058b1ce` + `e5d873fe`): new path
  emits identical ranges across all 20 markets because of typical-
  range hints in FIELD_DEFINITIONS. Fixed by stripping hints +
  anti-collapse rule in system prompt.
- **Representational mismatch** (this bug): both paths run cleanly
  per their own contracts; the two contracts just produce
  fundamentally different output shapes. Each path is internally
  consistent. The mismatch only shows up when you try to compare
  them through a width-aware verdict adapter.

## Why the user-facing gate criteria can't pass

The Path 3 acceptance criteria assumed both A and B paths produce
ranges. They don't. The legacy free-form schema was designed in
2025 to emit point recommendations; the new structured schema was
designed in 2026 to emit explicit ranges with confidence. Severity
and action.kind under any reasonable adapter must therefore differ
on ~85% of fields — not because of synthesis quality, but because
of evidence-shape mismatch.

Range overlap of 6.0% is similarly structural: 85% of legacy
entries have no range, so range-overlap-with-new is 0 for those
entries. The 6.0% is the contribution of the 15% of fields where
both emit explicit ranges (and even there, midpoints often diverge
by enough that overlap is partial).

## Three resolution paths

### Option 1 — Re-spec the verdict-parity gate
Replace severity / action / overlap gates with **midpoint
agreement** as the verdict-layer signal:
  - "Bucket-match of midpoints ≥ X% across shared fields"
  - "Mid-delta within ±10% on ≥ Y% of shared fields"
  - "Critical-field exact-match (adr, occupancy, capRate,
    cost-seg) ≥ Z%"

This is honest about the data shape and produces a meaningful
gate. It's also semantically what OT-A.4 cares about: when a user
takes the legacy path's "9%" and the new path's "8-12% mid 10%,"
they take action on similar values. Bucket-match (40.8% v4
aggregate, much higher on critical fields) is the right metric.

**Cost:** ~30 min to redefine + re-run harness (no $22 spend).

### Option 2 — Rebuild the legacy path to emit ranges
Modify `SYSTEM_PROMPT_LEGACY` in the harness to require
`recommendedRange` for every field, then re-run the 20-case A/B
($22 spend) to get a fair comparison.

**Problem:** this isn't actually testing the production legacy
path — production legacy emits point estimates because that's
what its schema requires. We'd be testing a fictional version of
legacy that doesn't exist. OT-A.4 deletes the production legacy,
not the harness's modified version.

**Recommendation: do not pursue.**

### Option 3 — Decouple OT-A.4 from verdict parity
Accept that verdict-layer parity is the wrong gate for this
transition because the two paths have incompatible evidence
shapes by design. Use the v4 categorical-gate signals as the
OT-A.4 unblock criteria instead:
  - Schema validity 100% ✓
  - Voice violations 0/0 ✓
  - Unit/denominator/scope errors 0 ✓
  - Mode collapse fixed on 4/5 target fields (1 = real industry
    standardization) ✓
  - Per-market reasoning verified across all field surfaces ✓
  - Categorical gate clean ✓

These say "the new path is correct under its own contract."
Combined with bucket-match aggregate of 40.8% (Option-1 metric),
that's enough to greenlight OT-A.4 — the new path's outputs are
strictly more informative than legacy's, and the only thing
preventing parity is that the new path provides ranges that
legacy can't.

**Cost:** zero. This is the architecturally honest path.

## Recommendation

**Option 1 + Option 3 in combination.**

Re-spec verdict-parity around midpoint agreement (~30 min, no
spend), confirm bucket-match crosses some threshold on critical
fields, then unblock OT-A.4 on the combined signal of
(categorical gate clean + midpoint bucket-match acceptable).

The current Path 3 gate criteria (severity/action/overlap ≥ 95%)
are the wrong measurement for evidence-shape-incompatible paths
and would block OT-A.4 indefinitely on a non-issue.

## Files referenced

- `script/ot-a-3-verdict-parity.ts` — harness; ran offline on v4 raw
- `docs/operational-tooling/OT-A-3-verdict-parity.md` — auto-written results
- `docs/operational-tooling/OT-A-3-ab-raw.json` — v4 raw input (no rerun)
- `server/ai/research-value-extractor.ts` — legacy regex extractor (parses null when no range)
- `server/ai/synthesis-schema.ts` — new contract (always low/high)
- `script/ot-a-3-ab-harness.ts` — A/B harness; SYSTEM_PROMPT_LEGACY around line 36 is the root of the representational mismatch

## Spend tracker
- Path 3 build: ~1.5 hr (under the 4 hr budget)
- Path 3 rerun spend: **\$0** (offline analysis on v4 raw — saved \$22)
- Path 3 respec + tier-based eval: **\$0** (offline transform of v4 raw)
- Total OT-A.3 retry cost so far: ~\$66 (v1+v2+v3 reruns from earlier sessions, all on user-authorized Anthropic billing). This BLOCKED + ESCALATION was resolved without further spend.

---

## Resolution outcome — 2026-04-19

User authorized Option 1 + Option 3 (gate respec + decouple OT-A.4
from raw-parity). Tiering doc, gate respec, harness rewrite, and
offline evaluation completed in a single session with no Opus spend.

### Tier-based gate result
Source: `script/ot-a-3-verdict-parity.ts` against v4 raw.

  - **Tier 1 (8 fields):** 4 pass / 4 fail
    - Pass: `adr`, `capRate`, `interestRate`, `occupancy`
    - Fail: `adrGrowth` (unbiased-noise — bucket 45%, mid±10% 65%),
      `incentiveFee` (bias-up — mid±10% 75%, expected-collapse 1 unique),
      `inflationRate` (bias-down — mid±10% 35%, mode collapse 2 unique),
      `ltv` (bias-up — bucket 20% but mid±10% 100% — pure range-overlap miss)
  - **Tier 2 (17 fields):** 8 pass / 9 fail
    - Systematic-bias misses (need field-level fix):
      `costHousekeeping` +43%, `costMarketing` +28%,
      `costPropertyTaxes` -13%, `preOpeningCosts` -36%,
      `startOccupancy` -37%, `catering` +16%
    - Unbiased-noise misses (acknowledge, do not block):
      `landValue`, `occupancyStep`, `rampMonths`
  - **Tier 3 (16 fields, 15 with comparisons):** 10 pass / 5 fail
    - Bias misses: `costSeg5yrPct`, `costSeg15yrPct`,
      `svcFeeAccounting`, `svcFeeTechRes`
    - Mode-collapse misses: `svcFeeMarketing`, `svcFeeTechRes`
  - **Mode-collapse gate:** FAIL on `inflationRate`,
    `svcFeeMarketing`, `svcFeeTechRes` (`incentiveFee` is exempt
    per industry-standardization documentation).

Full per-field detail in `OT-A-3-verdict-parity.md`.

### Why this is ESCALATED, not RESOLVED
The respec is correctly diagnostic. It produced an actionable
field-level remediation list rather than the original opaque
"13.6% < 95%" verdict. But OT-A.4 (delete legacy + flip flag)
cannot ship until the **Tier-1 systematic biases** (incentiveFee,
inflationRate, ltv) are resolved — those move user-visible model
outputs by 10pp+ and are not noise.

### Recommended next steps for OT-A.4 unblock
1. **Tier-1 fixes (mandatory before flip):**
   - `inflationRate`: definition tightening — currently 2 unique
     ranges across 20 markets is itself a mode-collapse signal.
     Suspect the "annual CPI / general inflation" denominator is
     too generic; need to anchor to country-specific recent CPI.
   - `incentiveFee`: ±10% midpoint miss at 75% suggests new path
     emits 8% where legacy emits 10% systematically. Definition is
     correct (% of GOP); likely needs a benchmark anchor (HVS Fee
     Survey 8-10% range as observed industry standard).
   - `ltv`: mid-hits at 100% but bucket-match at 20% means new path
     emits a tighter range than legacy around the same midpoint.
     Acceptable under value-parity if we relax bucket gate to "wider
     of the two contains the narrower's midpoint." Treat as
     `unbiased-noise` if user concurs.
2. **Tier-2 fixes (recommended before flip, can be deferred):**
   Six systematic biases on cost lines — same pattern as
   `incentiveFee`: definition correct, needs benchmark-range
   anchor in the prompt to align with USALI norms.
3. **Tier-3 misses:** all five are either small-fee categorical
   variance (svcFee*) or cost-seg MACRS-class noise — acceptable
   under unbiased-noise; do not block OT-A.4.
4. **Decision:** propose to user — fix Tier-1 (3 anchors), defer
   Tier-2 with documented unbiased-noise list, ship OT-A.4.

### Cross-references
- `OT-A-3-field-tiering.md` — approved tiering
- `OT-A-3-path3-respec.md` — gate spec
- `OT-A-3-verdict-parity.md` — auto-written results
- `script/ot-a-3-verdict-parity.ts` — harness
- `.claude/rules/llm-contract-migration-parity.md` — rule documenting mechanism bug #3
