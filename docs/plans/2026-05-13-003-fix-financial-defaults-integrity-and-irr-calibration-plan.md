---
title: "Fix Financial Defaults Integrity and IRR Calibration"
type: fix + refactor
status: active
date: 2026-05-13
owner: CC
priority: high
---

# Fix Financial Defaults Integrity and IRR Calibration

## Problem Frame

Three compounding gaps cause IRR to display 50%+ for the existing portfolio and violate the product's
stated rule — _"no hardcoded numbers for financial calculations in code; the only exception is seeding
an empty DB, which may happen exactly once."_

**Gap 1 — New property creation bypasses `model_defaults`.**
When a property is created, `buildPropertyDefaultsFromRegistry(global_assumptions)` maps the
company's global-assumptions row onto the property, and `computePropertyDefaults()` reads hardcoded
`countryDefaults.ts` TS constants. The `model_defaults` DB table (the admin-editable source of truth)
is never consulted for core underwriting fields (`acquisitionLTV`, `refinanceLTV`, `exitCapRate`,
`maxOccupancy`). Admin changes to Model Defaults therefore have no effect on new properties.

**Gap 2 — Engine uses TS `DEFAULT_*` constants as runtime fallbacks.**
The pure financial engine (`loanCalculations.ts`, `default-resolver.ts`) uses `DEFAULT_REFI_LTV`,
`DEFAULT_EXIT_CAP_RATE`, `DEFAULT_LTV`, `DEFAULT_MAX_OCCUPANCY` as `?? fallback` literals inside
calculation paths. These are not just DB-seeding helpers — they silently override missing DB values
at compute time. The rule says: _TS constants may appear only in seed scripts when the DB is empty._

**Gap 3 — Seed calibration errors causing IRR 50%+.**
- `SEED_EXIT_CAP_RATE_LUXURY = 0.062` (6.2%) seeds the company's global `exitCapRate`. US luxury
  boutique hotel market is 7.5–9.5%; at 6.2% the stabilised value is inflated 20–30%.
- Full Equity properties carry `refinanceLTV: 0.75` but have no `refiMaxLtvToOriginal` cap.
  At Year-3 refinance against inflated stabilised value, refi proceeds can exceed original equity,
  producing mechanically correct but misleading 80–150%+ IRR.
- The `refiMaxLtvToOriginal` DB column (designed to cap this) exists in the schema but the engine
  never reads it. (U3 TODO.)
- `refinanceLtv` (lowercase `v`) casing bug on Hudson Estate, Eden Summit, and Austin Hillside:
  the Drizzle field name is `refinanceLTV` (uppercase `V`), so these three records have `null`
  for refinance LTV in the DB and silently fall back to the TS constant (Gap 2).
- Multiple inline financial literals in `property-data.ts` not extracted to named `SEED_*` constants:
  `acquisitionLTV: 0.65`, `refinanceLTV: 0.75`, `acquisitionLTV: 0.60 / acquisitionInterestRate: 0.09`
  on Blue Ridge Manor, and `revShareOther: 0.08 / 0.07 / 0.06 / 0.05`.

---

## Target Architecture (stated product rule)

```
Admin edits Model Defaults → model_defaults table (single source of truth)
Analyst button regenerates → model_defaults rows (only trigger, no other path)

New property created →
  1. server resolveDefault(key, {country, businessType}) for each underwriting field
  2. override with global_assumptions if admin set them explicitly
  3. store on property record (non-null)

Engine compute call →
  server boundary layer guarantees non-null for all financial inputs
  engine asserts preconditions; no ?? TS fallbacks for business values

DB empty (first deploy) →
  seed script inserts model_defaults rows once (insert-or-skip, never upsert)
```

---

## Scope Boundaries

**In scope:**
- `artifacts/api-server/src/seeds/**` — seed calibration and constant extraction
- `artifacts/api-server/src/routes/properties.ts` — property creation default hydration
- `artifacts/api-server/src/defaults.ts` — boundary hydration function
- `lib/engine/src/debt/loanCalculations.ts` — wire `refiMaxLtvToOriginal`; remove runtime `DEFAULT_*` fallbacks
- `lib/engine/src/helpers/default-resolver.ts` — remove `DEFAULT_MAX_OCCUPANCY` unconditional hardcode
- `lib/shared/src/constants.ts` — `SEED_EXIT_CAP_RATE_LUXURY` recalibration to 0.085

**Not in scope:**
- Financial engine math correctness (other than the refi cap and removing fallbacks)
- Admin UI for Model Defaults page (it already works)
- Scenario snapshots (deferred — see Risk section)
- `DebtSection.tsx` UI field for `refiMaxLtvToOriginal` (U3 UI wiring — separate task)

---

## Sequencing (architect-validated order — do not reorder)

### Phase 1 — Lock default ownership (seed behavior + startup guard)

**Why first:** Removing engine fallbacks before guaranteeing non-null DB rows will break existing
records. The seed ownership lock makes subsequent phases safe.

**Work:**
1. In `artifacts/api-server/src/seeds/properties.ts` (and any other seed that writes `model_defaults`):
   change all `upsert` / `onConflictDoUpdate` calls to **insert-or-skip** (`onConflictDoNothing`).
   Once an admin edits a Model Default the seed must never overwrite it.
2. Add a startup guard (e.g., in `artifacts/api-server/src/server.ts` or a dedicated `check-defaults.ts`
   called at boot): assert the required underwriting keys are present in `model_defaults` with numeric
   values within plausible bounds. If a required key is missing **and** the table is otherwise non-empty,
   fail boot loudly with an actionable error message (which key, what was expected). If the table is
   completely empty, proceed to seeding.
3. Required keys to assert/seed (universal scope, no country/businessType filter):
   - `mc.funding.ltv` → `acquisitionLTV` (0.65 for the L+B portfolio context)
   - `mc.funding.refiLtv` → `refinanceLTV` (0.65 — see calibration note below)
   - `mc.tax_exit.exitCapRate` → (0.085 — see calibration note below)
   - `mc.property_defaults.maxOccupancy` → (0.82)
   - `mc.funding.refiMaxLtvToOriginal` → (1.00 — see calibration note below)

**Files:** `artifacts/api-server/src/seeds/properties.ts`, `artifacts/api-server/src/server.ts`
or equivalent startup path, `lib/shared/src/constants.ts` (constant values).

**Acceptance:** Restarting the API server after manually deleting a required `model_defaults` row
prints a clear error and refuses to serve. Restarting with an intact table succeeds silently.

---

### Phase 2 — Server boundary hydration layer

**Why second:** The engine can only have fallbacks removed (Phase 4) once every call site guarantees
non-null values. Build and wire the hydration function first.

**Work:**
1. In `artifacts/api-server/src/defaults.ts`, add a new function:
   ```ts
   hydratePropertyFinancials(property: PartialProperty, scope: DefaultScope): Promise<HydratedFinancials>
   ```
   This function calls `resolveDefault` for each of the five underwriting fields, then overlays any
   non-null value already stored on the property record (property-specific values win over the default).
   Returns a fully-typed object with guaranteed non-null numeric values for:
   `acquisitionLTV`, `refinanceLTV`, `exitCapRate`, `maxOccupancy`, `refiMaxLtvToOriginal`.

2. Wire this hydration call in every server-side path that invokes the engine:
   - `artifacts/api-server/src/routes/properties.ts` — property creation (`buildPropertyDefaultsFromRegistry`)
     and any `PUT/PATCH` update paths that trigger recompute
   - `artifacts/api-server/src/finance/**` — all report/scenario/sensitivity entrypoints that call
     `computePropertyDefaults` or pass a property object into the engine
   - The hydrated values must be passed into the engine as explicit fields; the engine must not
     perform its own DB lookup (it is pure).

3. `scope` for the hydration call is derived from `{ country: property.country, businessType: property.type }`.

**Files:** `artifacts/api-server/src/defaults.ts`, `artifacts/api-server/src/routes/properties.ts`,
`artifacts/api-server/src/finance/**` (all engine call sites).

**Acceptance:** Creating a new property with a blank `refinanceLTV` field results in a DB record
where `refinanceLTV` equals the value in `model_defaults`, not `DEFAULT_REFI_LTV` from TS.

---

### Phase 3 — Seed calibration + magic-number cleanup

**Why third:** Fix the bad data so Phase 4's fallback removal does not expose nulls in existing records.

**Work in `lib/shared/src/constants.ts`:**
- `SEED_EXIT_CAP_RATE_LUXURY`: `0.062` → `0.085`
  Rationale: US luxury boutique hotel cap rate consensus (CBRE, JLL 2025 survey) is 7.5–9.5%.
  6.2% was overly aggressive; 8.5% is the market midpoint and matches `DEFAULT_EXIT_CAP_RATE`.
  (The comment block documenting the rationale should be updated accordingly.)

**Work in `artifacts/api-server/src/seeds/property-data.ts`:**

Casing fix (silent null bug):
- Lines 545, 546, 547: `refinanceLtv` → `refinanceLTV` on Hudson Estate, Eden Summit, Austin Hillside.

Extract inline literals to named `SEED_*` constants at the top of the file (alongside existing constants):
```ts
const SEED_US_ACQ_LTV = 0.65;             // standard US boutique hotel acquisition LTV
const SEED_US_FINANCED_REFI_LTV = 0.65;   // conservative refi LTV post-cap enforcement
const SEED_US_HIGH_YIELD_REFI_LTV = 0.75; // aggressive refi LTV (Full Equity, income-based sizing)
const SEED_US_HIGH_YIELD_ACQ_LTV = 0.60;  // lower LTV for higher-rate Financed markets (NC, Blue Ridge)
const SEED_US_HIGH_YIELD_INT_RATE = 0.09; // acquisition interest rate for higher-rate markets
const SEED_REV_SHARE_OTHER_HIGH = 0.08;   // standard other-revenue share
const SEED_REV_SHARE_OTHER_MID = 0.07;
const SEED_REV_SHARE_OTHER_LOW = 0.06;
const SEED_REV_SHARE_OTHER_MINIMAL = 0.05;
const SEED_REFI_MAX_LTV_TO_ORIGINAL = 1.00; // refi loan may not exceed original purchase price
```
Replace every inline `0.65`, `0.75`, `0.60`, `0.09`, `0.08`/`0.07`/`0.06`/`0.05` on debt/refi/revShare
lines with the appropriate named constant.

Add `refiMaxLtvToOriginal: SEED_REFI_MAX_LTV_TO_ORIGINAL` to every property object that has
`willRefinance: "Yes"`. This puts the cap in the DB; the engine will honour it after Phase 4.

For Colombia properties that already use `SEED_COLOMBIA_ACQ_LTV = 0.60`: no change needed —
that named constant already exists.

**Files:** `lib/shared/src/constants.ts`, `artifacts/api-server/src/seeds/property-data.ts`.

**Acceptance:** `check:magic-numbers` passes. All property seed objects with `willRefinance: "Yes"`
have a non-null `refiMaxLtvToOriginal`. The three casing-fix properties now write non-null
`refinanceLTV` into the DB on a fresh seed.

---

### Phase 4 — Remove engine runtime `DEFAULT_*` fallbacks; add precondition assertions

**Why fourth:** Only safe after Phase 2 (boundary hydration) and Phase 3 (null backfill) are done.

**Work in `lib/engine/src/debt/loanCalculations.ts`:**
- Remove `DEFAULT_REFI_LTV`, `DEFAULT_EXIT_CAP_RATE`, `DEFAULT_LTV` imports and `?? DEFAULT_*` usages
  in calculation paths.
- Replace with explicit precondition assertions at the top of each exported function:
  ```ts
  invariant(property.refinanceLTV != null, "refinanceLTV must be hydrated before engine call");
  invariant(property.exitCapRate != null, "exitCapRate must be hydrated before engine call");
  ```
  (Use the project's existing `invariant` or `assert` helper; do not introduce a new dependency.)
- Line 399 (`const capRate = exitCapRate ?? DEFAULT_EXIT_CAP_RATE`): require caller to pass non-null
  `exitCapRate`; remove the fallback.

**Work in `lib/engine/src/helpers/default-resolver.ts`:**
- Line 189 (`const maxOccupancy = DEFAULT_MAX_OCCUPANCY`): replace with a required parameter sourced
  from the hydrated property object. If the calling path does not yet hydrate `maxOccupancy`, wire
  it through Phase 2's boundary layer.

**Calibration safety for Full Equity:**
- The assertion for `acquisitionLTV` must no-op gracefully when `property.type !== "Financed"`.
  The hydration layer (Phase 2) should still resolve and store `acquisitionLTV` for Full Equity
  properties (the engine already ignores it for non-Financed types), so a null assertion is fine.

**Files:** `lib/engine/src/debt/loanCalculations.ts`, `lib/engine/src/helpers/default-resolver.ts`.

**Acceptance:** Calling any engine function with a property that has `refinanceLTV = null` throws
an explicit invariant error rather than silently using 0.65. Existing properties (post Phase 3
backfill) all pass.

---

### Phase 5 — Wire `refiMaxLtvToOriginal` into refi sizing logic (U3)

**Why last:** Depends on Phase 4 (engine is clean) and Phase 3 (seed data has the value).

**Work in `lib/engine/src/debt/loanCalculations.ts`:**
After line 264 (`const refiLoanAmount = incomeCapValue * refiLTV`), add:
```ts
// Cap refi loan at refiMaxLtvToOriginal × purchasePrice when the constraint is set.
// Prevents equity strips on Full Equity properties where income-cap value exceeds cost basis.
if (property.refiMaxLtvToOriginal != null && property.purchasePrice != null) {
  const loanCap = property.refiMaxLtvToOriginal * property.purchasePrice;
  refiLoanAmount = Math.min(refiLoanAmount, loanCap);
}
```
The variable name `refiLoanAmount` must be `let` (not `const`) for this mutation.

Edge-case guards (must be tested):
- `willRefinance !== "Yes"` or no `refinanceDate` → existing early-return path already no-ops; cap
  is irrelevant.
- `refiMaxLtvToOriginal = null` → cap disabled (legacy records before Phase 3 backfill, or
  admin explicitly cleared the field). Engine behaviour is unchanged from today.
- `refiLoanAmount` after cap drops below closing costs + existing debt → `refiProceeds` correctly
  becomes 0 (the existing `Math.max(0, ...)` guard handles this).

**Files:** `lib/engine/src/debt/loanCalculations.ts`.

**Acceptance:** For a Full Equity property with purchase price $3.8M and `refiMaxLtvToOriginal = 1.00`,
the refi loan is capped at $3.8M even if income-cap value × 0.75 LTV would produce $5M. IRR for the
seeded portfolio drops into the 18–32% range. Add a unit test in `tests/engine/` for this cap logic.

---

## Calibration Notes (architect-reviewed)

| Value | Old | Proposed | Rationale |
|---|---|---|---|
| `SEED_EXIT_CAP_RATE_LUXURY` | 0.062 | **0.085** | Market consensus 7.5–9.5%; 8.5% is midpoint and equals `DEFAULT_EXIT_CAP_RATE` — one consistent reference |
| `refiMaxLtvToOriginal` seed default | (none) | **1.00** | Refi loan ≤ original purchase price. Stricter ratios (0.70–0.90) make many normal-year refis infeasible; 1.00 is the conservative but workable floor |
| `acquisitionLTV` model_defaults seed | (TS constant 0.75) | **0.65** | US boutique hotel typical LTV; 0.75 is available as an aggressive-tier override |
| `refinanceLTV` model_defaults seed | (TS constant 0.65) | **0.65** | Stays; 0.75 is explicitly seeded per-property for Full Equity assets where income-cap value sizing is intended |

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Removing engine fallbacks breaks existing properties with null financial fields | Phase 3 backfill must run before Phase 4; Phase 2 hydration layer fills nulls at compute time even before backfill is complete |
| `model_defaults` rows missing for a required key causes 500 on property creation | Phase 1 startup guard fails boot loudly; Phase 3 seeds required keys before Phase 4 reaches production |
| Scenario snapshots / import paths bypass `buildPropertyDefaultsFromRegistry` and call engine directly | CC must audit all engine call sites in Phase 2; mark any bypassed paths as deferred with a TODO if complex |
| Seed upsert in CI/test resets admin-edited defaults | Phase 1 insert-or-skip change fixes this |
| `refiMaxLtvToOriginal` cap at 1.00 still allows IRR > 30% for very high-ADR properties | Acceptable — 30% IRR is within realistic range for luxury boutique. Further calibration via admin Model Defaults (no code change needed) |

---

## Files Summary

| File | Phase | Change type |
|---|---|---|
| `lib/shared/src/constants.ts` | 3 | Recalibrate `SEED_EXIT_CAP_RATE_LUXURY` 0.062 → 0.085 |
| `artifacts/api-server/src/seeds/properties.ts` | 1 | Insert-or-skip for model_defaults; add required key seed rows |
| `artifacts/api-server/src/seeds/property-data.ts` | 3 | Fix `refinanceLtv` casing (3 properties); extract inline literals to SEED_* constants; add `refiMaxLtvToOriginal` per refi property |
| `artifacts/api-server/src/server.ts` (or startup path) | 1 | Startup guard: assert required model_defaults keys present |
| `artifacts/api-server/src/defaults.ts` | 2 | New `hydratePropertyFinancials()` function |
| `artifacts/api-server/src/routes/properties.ts` | 2 | Call hydration on property create/update |
| `artifacts/api-server/src/finance/**` | 2 | Wire hydration on all engine call sites |
| `lib/engine/src/debt/loanCalculations.ts` | 4, 5 | Remove DEFAULT_* fallbacks; add invariant assertions; wire refiMaxLtvToOriginal cap |
| `lib/engine/src/helpers/default-resolver.ts` | 4 | Remove DEFAULT_MAX_OCCUPANCY unconditional hardcode |
| `tests/engine/` | 5 | Unit test for refiMaxLtvToOriginal cap logic |

---

## Definition of Done

- [ ] Phase 1: `seedModelDefaults` is insert-or-skip; startup guard asserts required keys.
- [ ] Phase 2: New property creation reads LTV/exitCapRate/refiLTV/maxOccupancy from `model_defaults`.
- [ ] Phase 3: `check:magic-numbers` passes; casing bug fixed; all refi properties have `refiMaxLtvToOriginal` in DB.
- [ ] Phase 4: No `DEFAULT_*` financial constant remains in engine debt/equity paths; invariant assertions present.
- [ ] Phase 5: Refi loan cap honoured; seeded portfolio IRR in 18–32% range; unit test passes.
- [ ] All CI checks pass: `check:typecheck`, `check:lint`, `check:magic-numbers`, `check:schema-drift`, `test:calc`.
