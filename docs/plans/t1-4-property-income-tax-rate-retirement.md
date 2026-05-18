# T1-4 — `DEFAULT_PROPERTY_INCOME_TAX_RATE` Retirement Plan

**Status:** Deferred — plan required before execution
**Created:** 2026-05-18
**Owner:** CC only (engine + calc + client-side audits)
**Effort:** 1–2 days (not "1–3 hours per constant" — cross-cutting refactor)

---

## Why this is not a simple T1-4 increment

Constant value: `0.25`. Marked `@deprecated` since Audit #319 R4. Canonical
replacement: `getFactoryNumber('taxRate', country, state)` from the
model-constants registry.

20+ call sites across **four subsystems**:

| Subsystem | Sites | Pattern |
|---|---|---|
| Client-side audits | 5 files | `property.taxRate ?? DEFAULT_PROPERTY_INCOME_TAX_RATE` |
| Client-side display | 5 files | Same `??` chain (DCFAnalysis, PropertyIRRTable, FCFAnalysisTable, OtherAssumptionsSection, investment.ts) |
| Verification harness | 2 files | `tc.property.taxRate ?? DEFAULT_*` in test-case scaffolding |
| Calc engine | 1 file | `roundCents(annualDepreciation * DEFAULT_PROPERTY_INCOME_TAX_RATE)` — **direct multiplication, no `??`** |
| Engine | 1 file | `lib/engine/src/debt/loanCalculations.ts` (2 mentions — appear to be comments referencing prior pattern; needs verification) |
| Schema / config | 1 file | `lib/db/src/schema/config.ts` import (likely dead) |
| Seeds | 2 files | Inline use in seed property data |
| Field registry | 2 files | `fallback: DEFAULT_*` metadata |
| Admin UI | 1 file | `PropertyUnderwritingTab.tsx` `fallback={DEFAULT_*}` |
| Definitions | 2 files | `lib/shared/src/constants.ts`, `lib/db/src/constants.ts` |

## What "done" requires

This is genuinely a refactor, not a constant rename. To retire cleanly:

1. **Calc layer (`depreciation-basis.ts:164`)**: replace `* DEFAULT_PROPERTY_INCOME_TAX_RATE` with a parameter passed in by the caller. The deprecation comment says route through `getFactoryNumber('taxRate', country)`. Caller signature needs a `country` argument. Per CLAUDE.md §4 (ADR-007), calc functions must remain pure — the route/service layer resolves the rate and passes it in.

2. **Engine (`loanCalculations.ts`)**: confirm whether the 2 mentions are live code or comments. If live, same treatment as calc.

3. **Client-side display + audits + verification (12 files)**: each `?? DEFAULT_*` chain needs a decision:
   - Use `useGlobalAssumptions().companyTaxRate` (already wired)?
   - Use a per-property `property.taxRate` field that's now guaranteed non-null via the three-layer resolver?
   - Hard-code inline `0.25` and accept the ratchet cost (NOT recommended — taxRate varies by country, this is a Category-3 ASSUMPTION VARIABLE per §2 and shouldn't be hard-coded anywhere)?

4. **Field registry + admin UI**: replace `fallback: DEFAULT_*` with `fallback: 0.25` literal OR remove the fallback entirely if the value is always populated.

5. **Schema + seed**: replace constant refs with inline `0.25` per the canonical SQL-bootstrap pattern.

## Recommended approach

Spawn a focused session with a dedicated `Plan` agent to produce a unit-by-unit
breakdown. Treat each subsystem as its own implementation unit:

- U1: calc/engine — thread `taxRate` as a parameter; route resolves via registry
- U2: client-side audits + verification — switch to `globalAssumptions.companyTaxRate` from the React Query hook
- U3: display components — same as U2
- U4: schema + seeds + field registry — inline `0.25` literals
- U5: delete the TS constant from both canonical files

U5 is the actual T1-4 deletion; U1–U4 are the preparatory refactors.

## Open questions for the owner

- Should the per-property `taxRate` column be the source of truth (Category 3), or should the engine always read from the registry (Category 4)? The current dual-source approach (`property.taxRate ?? DEFAULT_*`) is what created the legacy debt.
- Is there a country/state available at every call site in `depreciation-basis.ts`? If not, the U1 refactor needs an extra parameter plumb-through.

---

## Reference: full call-site inventory

See `git grep -n "DEFAULT_PROPERTY_INCOME_TAX_RATE"` for the live list. Audit
data was gathered 2026-05-18 during session 17. Re-grep before starting work —
the codebase may have moved on.
