# OT-A.3 — RESOLVED

**Date opened:** 2026-04-19
**Date resolved:** 2026-04-19 (same session)
**Phase:** OT-A.3 (Vercel AI SDK structured-output A/B parity)

## Original block
Post-hoc inspection of v3 (`0a1f4357`) revealed that the new SDK
structured-output path was mode-collapsing on every field whose
`FIELD_DEFINITIONS` entry carried a "Typical X–Y%" hint. The high
bucket-match scores on `rampMonths` and `incentiveFee` were
prescription artifacts, not per-market reasoning.

## Resolution
Two commits landed the fix and a defensive audit:

1. **`9058b1ce`** — anti-collapse rule injected into the
   structured-output system prompt; cost-seg field definitions
   rewritten without typical ranges.
2. **`e5d873fe`** — defensive audit pass over remaining
   `FIELD_DEFINITIONS`. Stripped typical-range hints from
   `occupancyStep`, `rampMonths`, `landValue`, `costPropertyTaxes`,
   `incentiveFee`, `preOpeningCosts`. Hard-contract clauses
   (denominators, units, "NOT a dollar amount", "NOT cumulative",
   "% of GOP NOT % of total revenue") preserved verbatim.

## v4 verification (this session)
Re-ran the 20-case A/B harness. Per-field uniqueness across 20
markets recovered substantially on every previously-collapsed field
except `incentiveFee` — and the `incentiveFee` collapse turned out
to reflect real industry standardization (operator brand contracts,
not market geography), not a prompt failure.

Full per-field table appended to `OT-A-3-ab-results.md` under
the v4 heading.

## Status
**Resolved.** Proceed to Path 3 (verdict-layer parity harness) per
the original retry plan.

## Files referenced
- `server/ai/synthesis-schema.ts` — `FIELD_DEFINITIONS` table
- `server/ai/research-orchestrator.ts` — `buildSynthesisSystemPrompt`
- `script/ot-a-3-ab-harness.ts` — A/B harness
- `docs/operational-tooling/OT-A-3-ab-results.md` — v4 results
- `docs/operational-tooling/OT-A-3-ab-raw.json` — v4 raw comparisons
