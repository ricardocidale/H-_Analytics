# LLM Contract Migration — Parity Testing Layer

## Rule

When migrating between LLM pipelines, or changing an LLM output contract (adding ranges, enums, new fields, or different shape), parity testing MUST happen at the downstream-effect layer (verdict, decision, action taken by the consumer), NOT at the raw-output layer.

If the output contract itself is changing between the two paths, raw-output parity testing is definitionally impossible and will return misleading floor values that look like fixable gaps but aren't.

## Why — the OT-A.3 Path 3 discovery

Between April 19–20, 2026, OT-A.3 migrated the Cognitive Engine synthesis path from custom JSON parsing to Vercel AI SDK structured output. Four rounds (v1–v4) ruled out two mechanism bugs (definition drift, mode collapse) and produced a clean categorical gate. Path 3 was built to prove verdict-layer parity would also hold.

**Path 3 failed by structural margin**, not by tunable noise:

- Severity exact-match: 13.6% (gate: 95%)
- Action kind exact-match: 13.6% (gate: 95%)
- Range overlap ≥ 50%: 6.0% (gate: 50%)

Root cause — **representational mismatch baked into the two prompt contracts:**

- 85% of legacy field-cases emit point estimates only (`"9%"`, `"30 days"`)
- 100% of new path emit explicit low/high ranges (`"8-12% mid 10%"`)

Any width-aware verdict adapter MUST diverge on ~85% of fields. The 13.6% floor is where legacy's point value happens to equal new's midpoint AND new's range happens to be tight. No adapter tweak bridges this gap. Testing both strict and normalised adapter variants produced the same structural floor.

**A $22 rerun would NOT have helped.** Running more stochastic samples against two deterministically-divergent contracts produces the same floor every time.

### The right test, in retrospect

What actually matters for OT-A.4 shipping: *does a user taking action on legacy's "9%" make the same decision as a user taking action on new's "8-12% mid 10%"?* That's downstream-effect parity:

- For point-vs-range comparisons: is legacy's point value within new's range? Is legacy's point close to new's midpoint within a tolerance?
- For verdict comparisons on shared-shape fields: do severity + action + range-overlap match?
- Per-field tiering by business importance, with tier-specific tolerance gates.

This is deterministic over existing data — no rerun required. Replit's offline analysis of v4 raw data validated the structural finding in ~1.5 hr for $0.

## The pattern

When you're about to parity-test an LLM migration, ask BEFORE writing the test:

1. **Are both paths emitting the SAME SHAPE of output?** (same fields, same value types, same cardinality — e.g., both emit ranges, both emit point estimates.)
    - **Yes** → raw-output parity testing is valid. Proceed.
    - **No** → raw-output parity is definitionally impossible. Test at the downstream-effect layer instead.

2. **If No: what does the consumer actually do with the output?** Whatever that is — compute a verdict, render a UI element, trigger a workflow — *that* is what must pass parity. Build an adapter that projects both paths to the consumer's shape, then compare consumer-facing outcomes.

3. **Define the tolerance per consumer decision.** A 1% vs 2% midpoint difference might be indistinguishable to the user (same action triggered); a 1% vs 20% difference isn't. Tolerance is domain-specific.

## What this rule binds

Any future PR that:

1. Migrates between LLM pipelines (e.g., swaps Opus for Sonnet, adds a new panel to the Cognitive Engine, replaces a Specialist's inference path).
2. Changes the output shape of an LLM pipeline (new fields in `SynthesisOutputSchema`, new enum values, point estimate → range).
3. Retires an old LLM pipeline in favor of a new one (like OT-A.4 does).

Must include:

- An explicit declaration in the PR description (or ADR) of **which layer parity is being tested at** (raw-output vs downstream-effect).
- If raw-output: a proof that the two paths share an output shape.
- If downstream-effect: the consumer decision the parity protects (e.g., "AnalystVerdict severity", "user-facing action kind", "midpoint agreement within ±X%"), and the tolerance.

## Related

- `docs/operational-tooling/BLOCKED-ota3-path3.md` — the full incident (to be filed by Replit on v4 respec).
- `docs/operational-tooling/OT-A-3-ab-results.md` — v1→v4 evidence trail.
- `.claude/rules/field-definitions-no-prescription-hints.md` — mechanism bug #2 rule.
- `docs/architecture/SYSTEM-MODEL.md` §9 — ranked roadmap tracking OT-A status.
- ADR candidate: promote this rule to an ADR when we have a second LLM migration to reference (e.g., OT-C / OT-D).

## Three-bug summary (the OT-A.3 pattern)

OT-A.3's retry sequence taught three distinct mechanism bugs. Future LLM migrations should defensively check for all three:

| Bug | Mechanism | Symptom | Diagnostic |
|---|---|---|---|
| **#1 Definition drift** | Fields have wrong units / denominators / scopes between paths | Bucket-match below 40% on specific fields with huge magnitude miss | Cross-reference FIELD_DEFINITIONS against legacy extractor's parsing |
| **#2 Mode collapse** | Numeric hints in prompt treated as prescriptions, not calibration | High bucket-match achieved by both paths emitting identical values across all inputs | Per-input unique-range count; if = 1 across a diverse set, collapse |
| **#3 Representational mismatch** | Two paths emit different output shapes (point vs range, scalar vs vector) | Parity test returns mathematical floor regardless of adapter | Inspect raw outputs for shape cardinality before authorizing parity test |

All three must be ruled out before shipping a migration. Rules #1 (partially) and #2 have existing enforcement via `tests/proof/field-definitions-no-hints.test.ts` and `tests/proof/engine-version-drift.test.ts`. Rule #3 is methodology-level and enforced by this rule plus PR review.
