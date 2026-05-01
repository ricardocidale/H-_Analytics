# LLM contract migration — parity rule

**Status:** Active rule (informs all future LLM-prompt / output-schema migrations)
**Date filed:** 2026-04-19
**Origin:** OT-A.3 Path 3 — see `docs/operational-tooling/BLOCKED-ota3-path3.md` and `docs/operational-tooling/OT-A-3-path3-respec.md`

## Pattern

> **Migrations between LLM output contracts cannot be validated by
> raw-output parity. They must be validated by downstream-effect
> parity.**

## Why

When you replace one LLM contract (prompt + output schema A) with
another (prompt + schema B), the new contract is almost always a
**deliberate product-intent change** — that's why you're writing it.
Common changes:
  - Point estimates → low/mid/high ranges
  - Free-form prose → structured fields
  - Implicit reasoning → explicit `reasoning` field
  - Single hypothesis → multiple alternatives with weights

Any of these changes a single attribute of the output makes raw
shape-by-shape comparison meaningless. A "severity" or "verdict"
adapter that maps one shape to the other will diverge on most cases
not because either path is wrong, but because **the two paths were
never designed to emit the same evidence shape**.

Trying to pass a raw-parity gate in this situation forces you into
one of three bad places:
  1. **Loosen the adapter until it's trivial** — passes nothing real.
  2. **Tighten the new path to mimic the old** — defeats the migration.
  3. **Indefinitely block the migration** — ships nothing.

## Three classes of LLM-migration mechanism bug

For future migrations, classify suspected regressions by mechanism
before chasing them:

| Class | Mechanism | Detection | Fix |
|---|---|---|---|
| **#1 Definition drift** | A and B disagree on what a field means (different units, denominators, scopes) | Per-field bucket-match wildly varies AND new path has high internal consistency | Inject explicit unit/denominator/scope contracts into the new prompt (see `synthesis-schema.ts` `FIELD_DEFINITIONS`) |
| **#2 Mode collapse** | New path emits identical values across diverse inputs because the prompt over-specifies typical ranges | Per-field unique-range count = 1 across N markets | Strip prescriptive hints from definitions; add an explicit anti-collapse rule in the system prompt; enforce per-market reasoning citations |
| **#3 Representational mismatch** | A and B emit fundamentally different evidence shapes by design (e.g. point vs range) | The two contracts each pass their own internal validation, but any width-aware adapter shows wide divergence | **Do not fix at the contract level — re-spec the parity gate.** Switch from raw-parity to value-parity (midpoint agreement, range inclusion) per tiered field criticality. |

## Required guardrails for any LLM-contract migration

  1. **State up front whether the new contract is shape-compatible
     with the old.** If it's not, declare the migration as a
     product-intent change in the planning doc and use value-parity
     gates from the start, not raw-parity.
  2. **Tier the output fields by NPV-material impact** before writing
     the parity gate. A 30% miss on a Tier 3 (technical) field is not
     the same problem as a 30% miss on a Tier 1 (foundational) field.
     See `docs/operational-tooling/OT-A-3-field-tiering.md` for the
     template.
  3. **Always report direction-of-failure on misses** — signed mean
     delta plus std dev. Systematic bias (e.g. mean +20% with σ 5%)
     is a different problem than unbiased noise (mean 0% with σ 30%).
     Bias requires a field-level fix; unbiased noise is the
     stochastic floor and is acknowledged, not fixed.
  4. **Use absolute-fallback for relative tolerances.** Relative-to-
     legacy tolerances (e.g. ±10%) blow up on near-zero legacy
     values (rates that round to 0%, downturn-scenario growth at 0%).
     Standard fallback: when |legacy| < 0.5 in the field's native
     units, switch to absolute tolerance (±1pp Tier 1, ±2pp Tier 2,
     ±3pp Tier 3).
  5. **Compute parity offline whenever possible.** Per-field metrics
     are deterministic transforms of the raw A/B output — no rerun
     is needed to redefine a gate. Saves $$ on Anthropic / OpenAI
     billing and lets you iterate quickly.

## How OT-A.3 hit this rule

OT-A.3 Path 3 had:
  - Initial gate: severity ≥ 95%, action ≥ 95%, range overlap ≥ 50%
  - v4 result: 13.6% / 13.6% / 6.0% — wide miss
  - Investigation found 85% of legacy field-cases emit point
    estimates only (no range), while 100% of new-path emit explicit
    ranges. Any width-aware adapter must diverge here.
  - Resolution: re-spec the gate around midpoint agreement +
    range-inclusion per tier, evaluate offline against existing v4
    raw, and decouple OT-A.4 from raw-parity entirely.

## When NOT to apply this rule

  - If the new contract is **structurally identical** to the old
    (same field names, same units, same shape — only the model or
    prompt wording changed), then raw-parity IS the right gate.
    Mechanism bug #1 (definition drift) is the relevant class, and
    bucket-match aggregates are the right metric.

## Cross-references
  - `BLOCKED-ota3-path3.md` — full diagnosis of mechanism bug #3
  - `OT-A-3-field-tiering.md` — example tiering template
  - `OT-A-3-path3-respec.md` — example value-parity gate spec
  - `script/ot-a-3-verdict-parity.ts` — example offline tier-based harness
