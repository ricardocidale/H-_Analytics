---
name: inflation-cascade
description: Apply the H+ Analytics inflation-rate cascade rule. Use when adding, moving, or overlaying any inflation-rate value across Company Assumptions, Property Edit, Macro & Market defaults, or the Constants/Source-of-Truth tab. Also use when extending `COUNTRY_KEYS_OVERLAID_ON_GLOBAL` in `server/finance/apply-model-constants.ts`, or when a specialist in the AI Intelligence realm produces an inflation recommendation. Replaces the "treat inflation like depreciation" reflex with the correct cascade-and-specialist-sourced model.
---

# Inflation Cascade

Authoritative rule: `.claude/rules/inflation-cascade.md`. Read it before making any change to an inflation-rate surface.

## When this skill applies

- Adding, removing, or moving an inflation-rate field on any page (Company Assumptions, Property Edit, Defaults Admin Market & Macro, Constants tab).
- Extending `COUNTRY_KEYS_OVERLAID_ON_GLOBAL` in `server/finance/apply-model-constants.ts`.
- Writing a specialist (in the AI Intelligence realm) that produces inflation values.
- Reviewing a Constants Admin canonical row for `inflationRate`.
- Reviewing an audit doc that proposes "inflation as a Constant" (e.g. Task #379 follow-ups).

## The rule in 60 seconds

1. **Engine cascade (do not change):** `property.inflationRate ?? mcAssumptions.inflationRate ?? macroMarketFallback`.
2. **MC Assumptions = source of truth.** Property = override. Defaults Market & Macro = seed + last-resort fallback.
3. **Constants table for inflation is allowed** — but only when the row carries a citable monetary authority **and** was written by an AI Intelligence specialist, never by freehand admin typing.
4. **Specialists are the writer.** Humans are passive consumers of suggestions in the cascade. Specialists live in the AI Intelligence realm, not in Admin.
5. **Never a TS literal.** No `const INFLATION_RATE = 0.03` in `calc/`, `engine/`, `server/`, `client/`, or routes.
6. **Overlay extension (`COUNTRY_KEYS_OVERLAID_ON_GLOBAL`)** requires specialist-sourced canonical rows + production-deviation backfill + the behavior-preservation guard. Without all three, do not add `inflationRate` to the set.

## Self-check before merging

- [ ] No new hard-coded inflation literals in business logic.
- [ ] If `inflationRate` is being added to the overlay set: specialist-sourced canonical rows exist, production-deviation backfill is documented, and a test exercises the behavior-preservation guard for inflation specifically.
- [ ] No new admin-typed `model_canonical` row for `inflationRate` without `authoritySource`/`authorityRef`/`asOfDate` and a specialist verdict id.
- [ ] Inflation field on Company Assumptions remains user-editable (not "read-only computed from Constants").
- [ ] Macro & Market inflation fallback still present and reachable.

## Common mistakes this skill prevents

- Treating inflation like depreciation and overlaying a single seeded canonical row onto every tenant's `globalAssumptions.inflationRate` — silently overwrites every user's market judgment.
- Demoting the Company Assumptions inflation field to read-only "sourced from Constants" — breaks the cascade contract that says MC assumptions are the source of truth for the engine.
- Removing the Macro & Market fallback after introducing a Constants row — the fallback chain is independent of the canonical surface.
- Letting an admin hand-type a Constants row for inflation without specialist provenance — produces an unattributed value that looks authoritative but isn't.
- Accepting "inflation should never be a Constant" too literally — authority-sourced rows produced by specialists are valid Constants; the prohibition is on TS literals and unattributed admin entries.

## Authoritative reference

`.claude/rules/inflation-cascade.md` — read it in full before any inflation-touching change.
