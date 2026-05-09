---
name: inflation-cascade
description: Apply the H+ Analytics inflation-rate policy. Use when adding, moving, or overlaying any inflation-rate value across Company Assumptions, Property Edit, Macro & Market defaults, the Constants/Source-of-Truth tab, or anywhere a country-level inflation table is read. Also use when extending `COUNTRY_KEYS_OVERLAID_ON_GLOBAL` in `server/finance/apply-model-constants.ts`, when a specialist in the Intelligence realm produces an inflation recommendation, or when adding a UI surface that needs to disclose the inflation rate being applied to calculations. Replaces the older country-by-country cascade model — see "Policy change history" at the bottom.
---

# Inflation Policy

> **This document supersedes any earlier guidance** (including the prior "country cascade" model and any commit-message references to per-country inflation flowing into the engine). If you find an older note that conflicts with the rule below, this document prevails. See "Policy change history" at the bottom for context.

## The rule in 30 seconds

H+ Analytics reports **all financials in USD**. Therefore:

1. **The inflation rate used in every calculation is the US inflation rate.** Always. For every property, in every country, in every scenario.
2. **The Company (MC) inflation rate = the US inflation rate** when the management company is US-based and reports in USD (which is the only configuration we currently support).
3. **Property-level inflation rates are not used in calculations** unless the property's reporting currency differs from USD — and today no property does, so the engine's effective inflation input is always the US rate.
4. **Country-level inflation tables stay populated with true local-currency inflation rates per country.** They are **display-only / informational** — surfaced in research views and country pages. They are **never read by `calc/` or `engine/`**.
5. **The app must disclose, on both the management page and each property page, the inflation rate being applied to the calculations.** A small "Inflation used in calculations: 3.1% (US, source: BLS CPI-U via [specialist])" line is the canonical pattern.
6. **User/admin can still edit the inflation rate in the assumptions pages.** The Company Assumptions inflation field stays user-editable, and the per-property override (if exposed) stays editable. Edits override the US default for that scope.
7. **Analyst-button table regeneration still applies to every inflation-bearing table** — Constants tab, country tables, market & macro defaults. Specialist refresh repopulates the underlying values; what *flows into the engine* is still gated by rules 1–3.

## Engine contract

The engine cascade itself does not change shape; only the source semantics change:

```
effectiveInflation =
    company.inflationRate           // user-edited override on Company Assumptions
 ?? property.inflationRate          // only meaningful if reporting currency != USD (none today)
 ?? getFactoryNumber('inflationRate', 'US')   // canonical US rate from Constants table
 ?? marketMacroFallback             // last-resort seed default
```

Notes:

- The country argument to `getFactoryNumber('inflationRate', country)` for engine use is **always `'US'`**. Do not pass `property.country` here. If you find a code path that does, that is a bug — file a fix that switches it to `'US'` (and add a regression test).
- Country-specific reads (`getFactoryNumber('inflationRate', 'CO')`, etc.) are allowed **only** for display surfaces (research panels, country admin pages, informational tooltips). Never for engine inputs.

## When this skill applies

- Adding, removing, or moving an inflation-rate field on any page (Company Assumptions, Property Edit, Defaults Admin Market & Macro, Constants tab, country/research pages).
- Extending `COUNTRY_KEYS_OVERLAID_ON_GLOBAL` in `server/finance/apply-model-constants.ts`.
- Writing a specialist (Intelligence realm) that produces inflation values.
- Reviewing a Constants Admin canonical row for `inflationRate`.
- Building or auditing the disclosure UI ("Inflation used in calculations: …") on management or property pages.
- Reviewing an audit doc that proposes "inflation as a Constant" (e.g. Task #379 follow-ups) or a per-country cascade.

## Self-check before merging

- [ ] Engine inputs read US inflation only. No `property.country` is passed to inflation lookups in `calc/`, `engine/`, or any route that feeds the engine.
- [ ] Country tables remain populated and visible on display surfaces, but are not imported into the engine path.
- [ ] No new hard-coded inflation literals anywhere (Rule #1, taxonomy Category 4).
- [ ] If `inflationRate` is being added to the overlay set: specialist-sourced canonical rows exist (`source = "analyst"`, verdict id, full provenance), production-deviation backfill is documented, and a test exercises behavior preservation specifically for inflation.
- [ ] Constants tab remains read-only for inflation rows — no editable input. Refresh-research button is the only admin action.
- [ ] Inflation field on Company Assumptions remains user-editable (NOT "read-only computed from Constants"). Property-level override (if exposed) remains user-editable.
- [ ] Disclosure line is present on Management page AND on each Property page, showing the value actually applied to the engine and its source.
- [ ] No `source = "manual"` rows for `inflationRate` (deprecated). Only `source = "analyst"`.
- [ ] Country-specific inflation values shown in research surfaces are clearly labelled "informational — not used in USD calculations".

## Common mistakes this skill prevents

- **Routing per-country inflation into the engine.** Reading `getFactoryNumber('inflationRate', property.country)` and feeding it to a calc function. The engine MUST use US inflation; per-country values are display-only.
- **Treating inflation like depreciation** — overlaying a single seeded canonical row onto every tenant's `globalAssumptions.inflationRate`. Silently overwrites every user's market judgment.
- **Demoting Company Assumptions inflation to read-only "sourced from Constants"** — breaks the user-override path that rules 6 and 7 explicitly preserve.
- **Removing the Market & Macro fallback** after introducing a Constants row — the fallback chain stays independent of the canonical surface.
- **Letting an admin hand-type a Constants row for inflation** — produces an unattributed value that looks authoritative but isn't. Constants rows are read-only to admin; only specialist refresh writes them.
- **Building an editable PctField/Input/NumberInput against a Constant value in the Admin UI.** Constants surfaces are display-only.
- **Hiding the disclosure line.** Users and partners must always be able to see, on the page where they're looking at numbers, what inflation rate produced those numbers. Tooltip-only disclosure is insufficient — keep it visible.
- **Accepting "inflation should never be a Constant" too literally** — authority-sourced rows produced by specialists ARE valid Constants. The prohibition is on TS literals and on admin-editable Constants surfaces.

## Pair this skill with

- `hplus-variable-taxonomy` — for the broader Category-4 (TABLE-SOURCED) rules.
- `analyst-research-buttons` — for the canonical "Refresh research" affordance on Constants rows and country-table refreshes.
- `analyst-intelligence-display` — for how the disclosure line should look (small, in-context, source-attributed).
- `constants-vs-defaults` — for the underlying authority-vs-default distinction.

## Policy change history

- **2026-05-09 — USD-base calculations rule established.** All engine inflation inputs are the US rate; per-country tables become display-only. User edit, admin Constants refresh, and Analyst regeneration all preserved. This document rewritten to reflect the new policy. Older "country cascade into engine" guidance is **superseded**.
