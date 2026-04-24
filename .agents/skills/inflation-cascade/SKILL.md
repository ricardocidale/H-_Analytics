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

1. **Engine cascade (do not change):** `property.inflationRate ?? mcAssumptions.inflationRate ?? marketMacroFallback`.
2. **MC Assumptions = source of truth.** Property = override. Defaults Market & Macro = seed + last-resort fallback.
3. **Constants table holds inflation as authority-sourced reference.** Rows are written exclusively by AI Intelligence specialists from a monetary-authority publication. Admin and users **cannot edit** Constants rows.
4. **Admin's only Constants action = "Refresh research" button** per row → triggers the specialist to re-fetch the authority and update the row. No typing, no Apply form, no value entry by admin.
5. **`source = "manual"` is deprecated** for inflation (and any other authority-derived Constant). Only `source = "analyst"` (specialist verdict) is legitimate.
6. **Never a TS literal.** No `const INFLATION_RATE = 0.03` in `calc/`, `engine/`, `server/`, `client/`, or routes.
7. **Overlay extension (`COUNTRY_KEYS_OVERLAID_ON_GLOBAL`)** requires specialist-sourced canonical rows + production-deviation backfill + the behavior-preservation guard. Without all three, do not add `inflationRate` to the set.

## Self-check before merging

- [ ] No new hard-coded inflation literals in business logic.
- [ ] If `inflationRate` is being added to the overlay set: specialist-sourced canonical rows exist (`source = "analyst"`, verdict id, full provenance), production-deviation backfill is documented, and a test exercises the behavior-preservation guard for inflation specifically.
- [ ] No new editable input for any inflation Constant row in the Constants tab — read-only display + Refresh button only.
- [ ] No new `manual`-source row for `inflationRate`; reject with a server-side guard if needed.
- [ ] Inflation field on Company Assumptions remains user-editable (not "read-only computed from Constants").
- [ ] Market & Macro inflation fallback still present and reachable.

## Common mistakes this skill prevents

- Treating inflation like depreciation and overlaying a single seeded canonical row onto every tenant's `globalAssumptions.inflationRate` — silently overwrites every user's market judgment.
- Demoting the Company Assumptions inflation field to read-only "sourced from Constants" — breaks the cascade contract that says MC assumptions are the source of truth for the engine.
- Removing the Market & Macro fallback after introducing a Constants row — the fallback chain is independent of the canonical surface.
- Letting an admin hand-type a Constants row for inflation — produces an unattributed value that looks authoritative but isn't. Constants are read-only to admin; only specialist refresh is allowed.
- Building an editable PctField/Input/NumberInput against a Constant value in the Admin UI. Constants surfaces are display-only.
- Accepting "inflation should never be a Constant" too literally — authority-sourced rows produced by specialists are valid Constants; the prohibition is on TS literals and on admin-editable Constants surfaces, not on the existence of Constant rows for inflation.

## Authoritative reference

`.claude/rules/inflation-cascade.md` — read it in full before any inflation-touching change.
