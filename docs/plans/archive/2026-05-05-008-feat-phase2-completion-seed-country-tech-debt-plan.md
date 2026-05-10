---
title: "feat: Phase 2 completion — seed calibration, engine country-awareness, NAI-23"
type: feat
status: completed
date: 2026-05-05
origin: docs/plans/2026-05-05-007-master-priority-plan.md
---

# Phase 2 Completion — Seed Calibration, Engine Country-Awareness, NAI-23

## Summary

Picks up the five remaining open items from the master roadmap (plan-007) after U7 (transfer
tax migration) lands. Three groups: seed calibration that was blocked until engine fixes
shipped (L2-U5, L2-U6, L2-U7), country field propagation that completes the U6 known
limitation in `LoanParams` and `PropertyInput`, and the NAI-23 CTE refactor revived from
Linear. Linear workspace scan: all 10 issues Canceled; NAI-23 is the only one
worth reviving (already tracked in plan-007 as L4-U10). No new scope from Linear.

---

## Problem Frame

Three items survive plan-007's execution:

1. **Seed calibration still pending** — refi interest rates are still at bridge pricing (9%),
   company overhead was not audited, and the dev DB has never been reseeded with corrected
   engine output. These were deferred until MAJOR-2/4 engine fixes landed.

2. **Country-aware tax resolution incomplete** — U6 wired `getFactoryNumber('taxRate', country)`
   into the engine but both `LoanParams` and `PropertyInput` lack the `country` field, so
   every call falls back to the US baseline regardless of property jurisdiction. Adding
   `country?: string | null` to both interfaces closes the loop with no breaking changes
   (field is optional; existing call sites continue to work).

3. **NAI-23 tech debt** — `tryReserveAnalystCooldown` issues an UPSERT and then a second
   SELECT to derive `retryAfterMs`. A concurrent request between the two statements can make
   the hint stale. Admission safety is preserved; only the cooldown estimate is wrong.

---

## Requirements

- R1. Seed refi interest rates reflect post-stabilization market pricing, not bridge pricing.
- R2. Company overhead is audited; `marketingRate` is corrected if audit reveals the 5% rate
      produces unrealistic company-level margins.
- R3. Dev DB reseeded on corrected engine; ≥ 4/6 active properties show positive stabilized NOI;
      at least one property shows levered IRR ≥ 15%.
- R4. `LoanParams` and `PropertyInput` carry `country?: string | null`; the `getFactoryNumber`
      calls in `loanCalculations.ts` and `resolve-assumptions.ts` pass `country` when present.
- R5. `tryReserveAnalystCooldown` derives both the lock decision and `retryAfterMs` from a
      single atomic database statement.

---

## Scope Boundaries

- ADR-010 horizon items (LP-net IRR, European waterfall, Specialist Q/R) — not in scope here.
- Verdict cache wiring for portfolio-raise specialist — separate PR.
- `startOccupancy ?? 0.70` in `ai/executive-summary/finance-helpers.ts` — awaiting admin
  confirmation on whether 0.70 means stabilized occupancy or ramp-start; keep deferred.
- `country` on `GlobalLoanParams` — not needed; company-level tax already uses `companyTaxRate`.
- Full rewrite of the property engine to be purely functional — out of scope.

### Deferred to Follow-Up Work

- `startOccupancy ?? 0.70` → `DEFAULT_START_OCCUPANCY` decision: taxonomy Q4 — separate PR once
  admin confirms intent.
- NAI-34 EU Eurostat HICP inflation: parsing complexity deferred to ADR-010 work.

---

## Context & Research

### Relevant Code and Patterns

- `artifacts/api-server/src/seeds/property-data.ts` — all seed property rows; `refinanceInterestRate`
  field per property
- `artifacts/api-server/src/seeds/properties.ts` — `seedGlobalAssumptions`; `marketingRate` lives here
- `lib/engine/src/debt/loanCalculations.ts` lines 22–43 — `LoanParams` interface; tax rate call
  at lines 151–157 with `// For full country-awareness, add country to LoanParams` comment
- `lib/engine/src/types.ts` lines 37–100 — `PropertyInput` interface; same comment pattern in
  `resolve-assumptions.ts` lines 198–203
- `lib/engine/src/property/resolve-assumptions.ts` — `getFactoryNumber('taxRate')` call that
  needs `input.country` passed through
- `artifacts/api-server/src/routes/analyst-admin.ts` — `tryReserveAnalystCooldown`
- `artifacts/api-server/src/storage/intelligence/constants/watchdog.ts` — cooldown constants

### Institutional Learnings

- Seed changes must use `SEED_*` named constants; no raw literals; run `check:magic-numbers` after.
- Seed inserts use `onConflictDoNothing()` — per `docs/solutions/database-issues/seed-insert-no-conflict-financial-assumptions-lost-2026-05-02.md`.
- ADR-007: no DB imports in calc/engine libraries; all resolution in route layer.
- Engine type additions: `country` is optional so no existing call sites break — construction
  sites that omit it implicitly pass `undefined`, which triggers the existing US-baseline fallback.

### External References

- CBRE Hotel Investor Sentiment Survey Q1-2026: stabilized full-service/luxury cap rates 6.5–7.5%
  range (already reflected in seed exit caps from L2-U3)
- Post-stabilization hotel refi spreads: 10yr Treasury (4.3–4.8%) + 200–225bp = ~6.5–7.0%
  (US properties); Colombia LIBOR/IBR equivalent + 250bp ≈ 8.0–9.0% (still above current US)

---

## Key Technical Decisions

- **Refi interest rate values**: US properties → `0.07` (7.0%); Colombia properties → `0.085`
  (8.5%). These are property-level seed values (`SEED_*` constants), not DEFAULT_* constants —
  they differ per property and the same exact decimal does not appear in ≥ 3 files with
  identical semantics.
- **Company overhead audit approach**: Check `seedGlobalAssumptions.marketingRate` against the
  engine output before changing anything — only lower if the current value produces unrealistic
  company margins. Audit via an ad-hoc calculation or seed inspection, not a new command.
- **Country field propagation**: Add `country?: string | null` as an optional field to both
  `LoanParams` and `PropertyInput`. The `as unknown as` type cast in the route layer
  (`stamped as unknown as Parameters<typeof calculateLoanParams>[0]`) means the DB property
  row's `country` field automatically flows through once the interface declares it — no
  per-call-site changes needed in the route layer.
- **NAI-23 fix pattern**: Single CTE (`WITH reservation AS (INSERT ... ON CONFLICT DO UPDATE ...
  RETURNING reserved_at, granted)`) so both the lock decision and the timestamp come from the
  same statement. The Drizzle ORM may require a raw SQL string for the CTE — check whether
  Drizzle's `.with()` builder supports `RETURNING` with `ON CONFLICT` before writing.

---

## Open Questions

### Resolved During Planning

- **Is 7% refi rate consistent with plan-007 target?** Yes — plan-007 L2-U5 specifies 0.07 US /
  0.085 Colombia explicitly.
- **Does country propagation break any existing tests?** No — `country` is `?`, so all existing
  construction sites continue to compile; only tests that pass `country` explicitly are affected.
- **Is Drizzle CTE syntax available?** Unknown at planning time — implementer must check at U5
  implementation. Raw SQL fallback is acceptable.

### Deferred to Implementation

- **marketingRate audit result**: Whether to change from 0.05 → 0.03 depends on the audit
  output, not planning. The unit is conditional.
- **Drizzle vs raw SQL for NAI-23 CTE**: Resolve by reading Drizzle changelog at implementation
  time; raw SQL is always a valid fallback.

---

## Execution Routing

Four of the five units are unblocked right now and have no file overlaps — they can be
dispatched simultaneously across Claude Code and a Replit Agent.

### Batch 1 — Parallel (all unblocked, no shared files)

| Unit | Agent | Files touched | Why here |
|---|---|---|---|
| U1 · Seed refi rates | **Replit** | `seeds/property-data.ts` | Simple seed constants; no architecture sensitivity |
| U2 · Overhead audit | **Replit** | `seeds/properties.ts` | Conditional, audit-then-change; browser not needed |
| U4 · Country field | **CC** | `lib/engine/src/…` (3 files) | Engine types need taxonomy review; `?` field addition |
| U5 · NAI-23 CTE | **CC** | `routes/analyst-admin.ts`, `watchdog.ts` | SQL atomicity; Drizzle/raw SQL judgment call |

CC can dispatch U4 and U5 as parallel sub-agents (no file overlap, worktree-isolated).
Replit runs U1 and U2 in parallel independently.

### Batch 2 — After Batch 1 Replit merges

| Unit | Agent | Dependency |
|---|---|---|
| U3 · Reseed + verify | **Replit** | After U1 + U2 land; requires browser for visual check |

CC's U4 and U5 are independent of U3 — they can land before or after reseed without conflict.

### Prompt for Replit

> **Batch 1 — run U1 and U2 in parallel, then U3.**
>
> **U1 (property-data.ts):** Add named constants `SEED_REFI_INTEREST_RATE_US = 0.07` and
> `SEED_REFI_INTEREST_RATE_COLOMBIA = 0.085` at the top of the `SEED_*` block. Replace every
> `refinanceInterestRate: 0.09` with the appropriate constant (Colombia properties get Colombia
> rate, all others get US rate). Run `pnpm --filter @workspace/scripts run check:magic-numbers`
> after — must PASS.
>
> **U2 (properties.ts):** Read `seedGlobalAssumptions.marketingRate`. If it is `0.05`, change
> it to `SEED_MARKETING_RATE = 0.03` — a 5% company-level marketing rate is above market for a
> sub-10-property portfolio in Y1. If the value is already ≤ 0.04, leave it and document why.
> Run `check:magic-numbers` after.
>
> **U3 (reseed + verify — after U1+U2 merge):** Run `pnpm --filter @workspace/api-server exec
> tsx src/seed.ts`. Open the H+ Analytics dashboard. Verify: ≥ 4/6 active properties show
> positive stabilized NOI; Company Funding shows break-even by Y3–Y4; at least one property
> shows levered IRR ≥ 15%. Report what you see — do not paper over engine bugs with seed tweaks.

---

## Implementation Units

- U1. **Seed refinance interest rate correction**

**Goal:** Update all per-property `refinanceInterestRate` seed values from bridge pricing (0.09)
to stabilized post-stabilization market rates (0.07 US / 0.085 Colombia).

**Requirements:** R1

**Dependencies:** None (U7 is completing in parallel; both touch `property-data.ts` but in
different fields — sequence after U7 merges to avoid conflict)

**Files:**
- Modify: `artifacts/api-server/src/seeds/property-data.ts`

**Approach:**
- Define named constants `SEED_REFI_INTEREST_RATE_US` and `SEED_REFI_INTEREST_RATE_COLOMBIA`
  at the top of the seed file alongside the existing `SEED_*` block
- Replace each `refinanceInterestRate: 0.09` with the appropriate named constant per property country
- US properties: Jano Grande Ranch is Colombia; Loch Sheldrake, Belleayre, Scott's House,
  Lakeview Haven are US; San Diego/Cartagena is Colombia — verify by reading existing seed rows

**Patterns to follow:**
- Existing `SEED_EXIT_CAP_*` constant pattern in `property-data.ts` (from L2-U3)

**Test scenarios:**
- Test expectation: none — pure seed data change with no behavioral logic. Verification
  is visual (reseed + dashboard check in U3).

**Verification:**
- `check:magic-numbers` PASS — no raw `0.09`, `0.07`, `0.085` literals for refi rates
- Seed file imports `SEED_REFI_INTEREST_RATE_US` and `SEED_REFI_INTEREST_RATE_COLOMBIA`
- All 6 property `refinanceInterestRate` fields reference named constants

---

- U2. **Company overhead audit and calibration**

**Goal:** Audit `seedGlobalAssumptions.marketingRate` against expected company-level margins;
lower from 0.05 → 0.03 if audit confirms the current rate is unrealistic.

**Requirements:** R2

**Dependencies:** None (can run in parallel with U1)

**Files:**
- Modify: `artifacts/api-server/src/seeds/properties.ts` (conditional — only if audit shows change is needed)

**Approach:**
- Read current `seedGlobalAssumptions` in `properties.ts`; compute what 5% marketing rate means
  as a percentage of Y1 company revenue across seed properties
- If the figure is materially above a realistic boutique hospitality management company's S&M
  spend (benchmark: 2–4% for sub-10-property portfolios), lower to `0.03`
- If audit shows 5% is defensible, leave unchanged and document the decision
- If a change is made: define `SEED_MARKETING_RATE` named constant; replace literal

**Patterns to follow:**
- Existing `DEFAULT_MARKETING_RATE` in `constants-funding.ts` for the naming convention

**Test scenarios:**
- Test expectation: none — conditional seed data change; verification is via reseed in U3.

**Verification:**
- Decision documented (either "changed to 0.03" or "kept at 0.05 — within range for Y1")
- If changed: `check:magic-numbers` PASS

---

- U3. **Dev DB reseed and visual verification**

**Goal:** Reseed the development database with all accumulated seed calibration fixes and verify
that key metrics pass the "does this look like a real deal?" bar.

**Requirements:** R3

**Dependencies:** U1, U2 (reseed after all seed changes land)

**Files:**
- No code changes — operational verification step

**Approach:**
1. Run `pnpm --filter @workspace/api-server exec tsx src/seed.ts`
2. Open H+ Analytics dashboard; navigate to each active property
3. Check: ≥ 4/6 active properties show positive stabilized NOI in the engine output panel
4. Check: Company Funding tab shows break-even trajectory by Y3–Y4
5. Check: At least one property with levered IRR ≥ 15% visible in returns metrics
6. If any metric looks wrong, identify whether it is a seed value issue or an engine issue;
   do not attempt to paper over engine bugs with seed tweaks

**Test scenarios:**
- Test expectation: none — manual visual verification. No automated UI test harness.

**Verification:**
- Dashboard shows ≥ 4/6 active properties with positive stabilized NOI
- Company Funding shows break-even by Y3–Y4
- At least one property with levered IRR ≥ 15%
- All check gates pass: `pnpm run typecheck`, `check:magic-numbers`, `check:lint`

---

- U4. **Add `country` field to `LoanParams` and `PropertyInput`**

**Goal:** Close the known limitation from U6 — the `getFactoryNumber('taxRate', country)` calls
in `loanCalculations.ts` and `resolve-assumptions.ts` currently receive no country because the
interfaces don't carry it; adding the optional field lets the existing route-layer type casts
propagate country automatically.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Modify: `lib/engine/src/debt/loanCalculations.ts` (add `country?: string | null` to `LoanParams`; update `getFactoryNumber` call)
- Modify: `lib/engine/src/types.ts` (add `country?: string | null` to `PropertyInput`)
- Modify: `lib/engine/src/property/resolve-assumptions.ts` (update `getFactoryNumber` call to pass `input.country`)

**Approach:**
- Add `country?: string | null` as an optional field to `LoanParams` (after `type: string`) and
  to `PropertyInput` (after `type: string`)
- In `loanCalculations.ts`, update the `getFactoryNumber('taxRate')` call to
  `getFactoryNumber('taxRate', params.country ?? undefined)`
- In `resolve-assumptions.ts`, update the analogous call to
  `getFactoryNumber('taxRate', input.country ?? undefined)`
- Remove or update the `// For full country-awareness, add country to LoanParams/PropertyInput`
  comments — they are now resolved
- No route-layer changes required: the existing `stamped as unknown as Parameters<typeof calculateLoanParams>[0]` cast already propagates the DB property row's `country` field; once `LoanParams` declares it, TypeScript will pick it up

**Patterns to follow:**
- `lib/engine/src/property/resolve-assumptions.ts` — existing `getFactoryNumber` import and call pattern

**Test scenarios:**
- Happy path: Colombia property (`country: "Colombia"`) — `taxRate` resolves to Colombia rate from registry, not US rate
- Fallback: property with `country: null` or `country: undefined` — US baseline applied (existing behavior unchanged)
- Edge case: property with unrecognized `country: "Narnia"` — registry returns US baseline; no error thrown
- Integration: run proof suite `engine-integrity-fixes.test.ts` — all existing tests still pass (no regressions)

**Verification:**
- `pnpm --filter @calc tsc --noEmit` — clean
- `pnpm --filter @engine tsc --noEmit` — clean
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- Existing proof suite passes without modification
- `grep -n "For full country-awareness" lib/engine/src/` returns zero results

---

- U5. **NAI-23: Atomic cooldown reservation via single CTE**

**Goal:** Collapse `tryReserveAnalystCooldown`'s two-statement UPSERT + SELECT into a single
CTE that returns both `granted` and `reserved_at` from the same database round-trip, eliminating
the stale `retryAfterMs` window.

**Requirements:** R5

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/routes/analyst-admin.ts`
- Modify or Read: `artifacts/api-server/src/storage/intelligence/constants/watchdog.ts`

**Approach:**
- Read the current implementation of `tryReserveAnalystCooldown` in `analyst-admin.ts` to
  understand the exact UPSERT + SELECT sequence
- Replace with a CTE of the form:
  ```sql
  WITH reservation AS (
    INSERT INTO analyst_cooldowns (property_id, reserved_at)
    VALUES ($1, now())
    ON CONFLICT (property_id) DO UPDATE SET
      reserved_at = CASE
        WHEN analyst_cooldowns.reserved_at < now() - interval '$cooldown seconds'
        THEN now()
        ELSE analyst_cooldowns.reserved_at
      END
    RETURNING reserved_at,
      (reserved_at = now()) AS granted
  )
  SELECT granted, reserved_at FROM reservation
  ```
- Check whether Drizzle's `.with()` builder supports `ON CONFLICT DO UPDATE ... RETURNING` at
  implementation time; use `db.execute(sql`...`)` with a tagged SQL template as fallback
- Derive `retryAfterMs` from the returned `reserved_at`: `cooldownMs - (now - reserved_at_ms)`

**Patterns to follow:**
- Other raw SQL patterns in `analyst-admin.ts` or the storage layer for the SQL template approach

**Test scenarios:**
- Happy path: first request within cooldown window — `granted: true`, `retryAfterMs` reflects
  the actual reservation timestamp
- Cooldown active: second request within window — `granted: false`, `retryAfterMs` ≤ remaining
  cooldown (within ±1s of the reservation time, not stale)
- Concurrent requests: two simultaneous requests at the cooldown boundary — exactly one is
  granted; the rejected request's `retryAfterMs` reflects the winning reservation's timestamp
- Edge: cooldown fully expired — next request granted, timer resets from current timestamp
- Integration: no second SELECT issued (verify by reading the final implementation — no
  additional `db.select()` call after the CTE)

**Verification:**
- `pnpm --filter @api-server tsc --noEmit` — clean
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- No second `SELECT` after the `INSERT ... ON CONFLICT` in `tryReserveAnalystCooldown`
- Concurrent-access test scenario documented in proof (or integration test if harness permits)

---

## System-Wide Impact

- **Interaction graph:** U4's `country` addition to `PropertyInput` touches every caller of the
  property engine — but since the field is optional, existing callers are not required to supply
  it. The effect is additive: Colombia/Mexico/EU properties gain country-aware tax rates; US
  properties with `country: "United States"` continue on the US baseline.
- **Error propagation:** U5's CTE fix is inside a single DB transaction; failure modes are the
  same as before (DB error → 500 to caller). No new error surfaces.
- **State lifecycle risks:** U3 reseed uses `onConflictDoNothing()` — no data destruction;
  only rows for new properties or null-valued fields are updated.
- **Unchanged invariants:** Engine math (NOI, DSCR, IRR, refi proceeds) is unchanged by U1–U3
  and U5. U4 may change the numeric value of `taxRate` for non-US properties — this is the
  intended correction, not a regression.
- **API surface parity:** No API schema changes in any unit. `LoanParams` and `PropertyInput`
  are internal engine types; the change is not visible to API consumers.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| U7 and U1 both touch `property-data.ts` | Sequence U1 after U7 merges; review the diff before opening PR |
| Drizzle CTE syntax may not support `ON CONFLICT DO UPDATE ... RETURNING` | Check Drizzle docs at implementation; raw SQL fallback is always safe |
| U4 country propagation changes tax rate for Colombia properties | Intended; verify proof suite still passes and that Colombia's computed taxRate is reasonable (registry value, not random) |
| Dev DB reseed (U3) may expose a lurking seed bug not visible without a fresh run | If metrics fail the visual bar, diagnose root cause before tweaking seed values |

---

## Sources & References

- **Origin document:** [docs/plans/2026-05-05-007-master-priority-plan.md](docs/plans/2026-05-05-007-master-priority-plan.md) — L2-U5, L2-U6, L2-U7, L4-U10
- **Taxonomy context:** [docs/plans/number-taxonomy-and-assumption-lifecycle.md](docs/plans/number-taxonomy-and-assumption-lifecycle.md) — taxonomy Q4 (startOccupancy deferred)
- **Seed pattern:** [docs/solutions/database-issues/seed-insert-no-conflict-financial-assumptions-lost-2026-05-02.md](docs/solutions/database-issues/seed-insert-no-conflict-financial-assumptions-lost-2026-05-02.md)
- **Live comparables pattern:** [docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md](docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md)
- Linear: all 10 issues Canceled; NAI-23 revived as U5 above
