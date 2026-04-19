# FIELD_DEFINITIONS — No Prescription Hints

## Rule

`FIELD_DEFINITIONS` entries in `server/ai/synthesis-schema.ts` **MUST NOT** embed numeric typical-range hints (e.g. "typical 8-15%", "e.g., 24-36 months", "typical $200K-$2M"). Definitions must describe **unit + denominator + scope** only, plus optional per-market reasoning cues that name the *evidence sources* Opus should consult — never the expected output range.

This rule is enforced by `tests/proof/field-definitions-no-hints.test.ts` and blocks `verify:summary`.

## Why — the OT-A.3 mode-collapse finding

Between April 19–20, 2026, OT-A.3 (Vercel AI SDK structured-output migration) shipped four FIELD_DEFINITIONS iterations to improve Opus grounding. v3 added "typical X–Y%" hints to improve bucket-match on drift-prone fields. Bucket-match improved dramatically:

- `rampMonths` 0% → 65% match
- `incentiveFee` 0% → 90% match
- `costSeg7yrPct` — → 75% match

But the gains were **prescription, not reasoning**. Per-field variance analysis (see `docs/operational-tooling/OT-A-3-ab-results.md`) found:

| Field | unique ranges, 20 markets | |
|---|---|---|
| rampMonths | 1 (verbatim 24-30-36 on every market) | ← mode collapse |
| incentiveFee | 1 (verbatim 8-10-12 on every market) | ← mode collapse |
| costSeg5yrPct | 1 (verbatim 18-22-25) | ← mode collapse |
| costSeg15yrPct | 1 (verbatim 10-14-18) | ← mode collapse |
| occupancy | 7 (per-market reasoned) | ← preserved |

**Aspen and Outer Banks received identical ramp curves.** Opus treated the typical-range hint as a strict prescription, not a calibration aid. Bucket-match passed by lucky range coverage; per-market intelligence was silently lost.

**Without this rule, Path 3 (verdict-layer parity harness) would have mechanically PASSED** on mode-collapsed fields — both A/B paths emit the same numbers, so they reach the same verdict. We would have shipped OT-A.4 with a measurably degraded Analyst product, all gates green.

### Remediation (commits `9058b1ce`, `e5d873fe`, `bffcf63c`)

All typical-range hints were stripped from FIELD_DEFINITIONS across 10 fields (5 cost-seg + rampMonths + incentiveFee + occupancyStep + landValue + costPropertyTaxes + preOpeningCosts). Each was replaced with a per-market reasoning prompt naming the actual evidence sources (jurisdiction millage, equipment profile, brand strength, etc.) plus an explicit "do NOT emit a generic textbook X" anti-prescription phrase.

v4 rerun confirmed per-field unique-range count rose from 1 → 3–6 on the previously-collapsed fields while keeping the categorical gate clean (0 unit/denominator/scope/voice errors).

## What's banned (patterns the test enforces)

A FIELD_DEFINITIONS entry's `denominator` or `description` string must not contain:

1. `/typical\s+\$?[\d,.]+\s*[–\-]\s*\$?[\d,.]+/i` — e.g. "Typical 8-15%", "typical $200K-$2M"
2. `/e\.g\.,?\s+\$?[\d,.]+\s*[–\-]\s*\$?[\d,.]+/i` — e.g. "e.g., 24-36 months"
3. `/typical\s+\d/i` — any "typical " followed by a digit

## What's allowed

1. **Unit + denominator + scope** (mandatory). Example: `"annual NOI ÷ property value (exit cap rate)"`.
2. **Per-market reasoning cues that name evidence sources** (recommended). Example: `"Reason per-market from local land scarcity, zoning premium, and assessor allocations on comp parcels"`.
3. **Anti-prescription phrases** (recommended for rate-sensitive fields). Example: `"do NOT emit a generic textbook share"`.
4. **Industry-standard terminology** (allowed). Example: `"USALI undistributed"`, `"hospitality-standard food cost ratio"`.

### Edge case — genuinely standardized fields

Some fields legitimately collapse to a narrow industry-standard value (e.g. `incentiveFee` at ~10% of GOP for Marriott Autograph–style brand contracts; v4 confirmed 1 unique range here even with explicit anti-collapse instruction). **This is correct behavior and does not require a hint** — Opus will emit the industry standard naturally when the field is genuinely standardized. Do not add a hint to "help" these fields.

## When the test fails

The failure message names the offending field key and the matched pattern. Remediation:

1. Remove the numeric range from the definition string.
2. Replace with a per-market reasoning cue naming the actual evidence sources (benchmarks, comp sets, regulatory lookups — whatever the legacy extractor's upstream data would have used).
3. Optionally add "do NOT emit a generic textbook X" for rate-sensitive fields.
4. Re-run the test.

## Related

- `docs/operational-tooling/BLOCKED-ota3.md` — the finding + resolution trail.
- `docs/operational-tooling/OT-A-3-ab-results.md` — v1→v4 harness results, per-field variance analysis.
- `.claude/skills/analyst/contracts.md` — FIELD_DEFINITIONS spec.
- `server/ai/engine-version.ts` + `tests/proof/engine-version-drift.test.ts` — sibling guard for synthesis drift generally.
- ADR candidate: lift this rule into a formal ADR if we add a second Cognitive Engine or a different synthesis surface.
