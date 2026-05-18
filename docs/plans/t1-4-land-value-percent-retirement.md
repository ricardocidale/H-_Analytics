# T1-4 — `DEFAULT_LAND_VALUE_PERCENT` Retirement Plan

**Status:** Deferred — plan required before execution
**Created:** 2026-05-18
**Owner:** CC only (calc + engine + client-side audits)
**Effort:** 1–2 days (not "1–3 hours per constant" — cross-cutting refactor)

---

## Why this is not a simple T1-4 increment

Constant value: `0.25`. Used as the "land share of property cost" — the
non-depreciable portion. Per masterplan T1-4 phase 1 notes (2026-05-16), the
schema already no longer imports `DEFAULT_LAND_VALUE_PERCENT` and
`PropertyInput.landValuePercent` was promoted to required `number`. Despite
that, **30+ live `??` fallback chains remain** in client + calc.

30+ call sites across **five subsystems**:

| Subsystem | Sites | Pattern |
|---|---|---|
| Client-side audits | 3 files | `property.landValuePercent ?? DEFAULT_LAND_VALUE_PERCENT` (auditDepreciation, auditBalanceSheet, crossCalculatorValidation × 2) |
| Client-side display | 2 files | PPECostBasisSchedule, CapitalStructureSection × 4 fallback chains |
| Verification harness | 2 files | known-value-runner × 2, test-cases.ts |
| Calc engine | 1 file | `lib/calc/src/analysis/hold-vs-sell.ts:137` — `input.land_value_pct ?? DEFAULT_LAND_VALUE_PERCENT` |
| Engine | 1 file | `lib/engine/src/debt/loanCalculations.ts` (2 mentions — likely comments) |
| Field registry | 2 files | `lib/shared/src/field-registry.ts:388`, `lib/db/src/field-registry.ts:388` |
| Admin UI | 1 file | `PropertyUnderwritingTab.tsx:743` `fallback={DEFAULT_*}` |
| Schema / config | 1 file | `lib/db/src/schema/config.ts:36` import (likely dead — schema phase already removed direct usage) |
| Seed | 2 files | seed-model-defaults.ts SPECS, property-data.ts inline |
| Definitions | 2 files | `lib/shared/src/constants.ts:126`, `lib/db/src/constants.ts:173` |

## What "done" requires

The prior schema-phase tightening (PropertyInput.landValuePercent: number)
should have made the `??` chains dead code at the type level. They survived
because:

1. Client-side `Property` types may still allow null (separate from server-side `PropertyInput`)
2. The chain pattern is idiomatic JS even when redundant
3. No one swept the dead fallbacks during phase 1

To retire cleanly:

1. **Verify type tightening reached the client.** Check that the client-side
   `Property` type used by audits/display also has `landValuePercent: number`
   (not nullable). If yes → the `??` chains are dead code; just delete them
   (no replacement needed). If no → tighten the client type first.

2. **Calc layer (`hold-vs-sell.ts`)**: `input.land_value_pct ?? DEFAULT_*` —
   the function input type controls this. Either tighten the input type and
   remove the `??`, or inline `0.25` per §2 (less clean — land value is a
   Category-3 ASSUMPTION VARIABLE that varies by property).

3. **Verification harness + audits + display (10 files)**: bulk-replace the
   `??` chains. If type-tightening reaches them, the `??` becomes dead code
   the compiler will flag.

4. **Field registry**: `fallback: DEFAULT_*` → `fallback: 0.25` literal.

5. **Schema + seed + admin UI**: inline `0.25` per §2 SQL-bootstrap pattern.

6. **Delete the TS constant** from both canonical files.

## Recommended approach

This is mostly a "dead fallback sweep" if phase 1's type tightening reached
all consumers. Suggested order:

- U1: audit whether client-side `Property` type has `landValuePercent: number`
- U2: if yes, bulk-delete all 10 `??` fallback chains (one PR or one CC session)
- U3: if no, tighten the client type first, then U2
- U4: calc/engine — same treatment, depending on input type
- U5: schema + seed + field registry + admin UI → inline `0.25`
- U6: delete the TS constant

## Open questions for the owner

- Is the client-side `Property` type `landValuePercent: number | null` or
  `landValuePercent: number`? This determines whether U2 is a typecheck-driven
  sweep (easy) or a type-tightening cascade (harder).
- Is `hold-vs-sell.ts:137` called from a code path where `input.land_value_pct`
  is sourced from a DB property (always set) or from an ad-hoc payload
  (potentially null)?

---

## Reference: full call-site inventory

See `git grep -n "DEFAULT_LAND_VALUE_PERCENT"` for the live list. Audit data
was gathered 2026-05-18 during session 17. Re-grep before starting work — the
codebase may have moved on.
