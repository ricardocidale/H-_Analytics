---
title: "refactor: Financial Engine — Correctness Audit + Server-Side Migration"
type: refactor
status: active
date: 2026-05-10
depth: deep
---

# Financial Engine — Correctness Audit + Server-Side Migration

## Summary

Two-phase plan. Phase 1 audits and fixes the correctness of the financial engine — IRR vector construction, financial statement identities, portfolio rollup aggregation rules, and DSCR/loan sizing — against documented accounting standards and test fixtures. Phase 2 moves financial projections from browser-side execution to fully server-computed API payloads, honoring the ADR-007 principle: calc/engine code must not cross into the frontend. The frontend's `lib/financial/` today is entirely thin re-exports of `lib/engine/src/` and `lib/calc/src/` via the `@engine/*` and `@calc/*` path aliases — meaning the full engine bundle ships to every browser. The target state is: server computes, API returns precomputed projections, browser only formats and displays.

---

## Problem Frame

The financial engine (`lib/engine/src/`) runs in the browser via the `@engine/*` alias. Frontend components import `lib/financial/property-engine.ts`, `lib/financial/yearlyAggregator.ts`, etc. — every one of these files is a direct re-export from `lib/engine/src/` or `lib/calc/src/`. The engine bundle is large (monthly pro-forma generator, IRR solver, cash flow sections, consolidation, funding predictor, company engine) and executes in the browser rather than on the server where it belongs. Separately, a documented audit finding (MINOR-6 in `docs/solutions/logic-errors/financial-engine-audit-findings-2026-05-04.md`) notes a nonstandard FCFE definition and multiple statement identity questions that were deferred rather than fixed.

---

## Requirements

- R1. Financial statement identities hold: NOI = Revenue − Operating Expenses; FCFE = NOI − Debt Service + Refi Proceeds; Exit IRR vector includes exit proceeds in final year.
- R2. Portfolio rollup aggregation rules are correct and documented: SUM for flow items, PICK_LAST for stocks, WEIGHTED for per-unit metrics (ADR, occupancy).
- R3. DSCR calculation uses stabilized NOI (not pre-stabilization ramp months); max loan sizing is consistent with the DSCR floor.
- R4. IRR Newton-Raphson solver handles edge cases: single sign change, no exit proceeds, refi-only, degenerate inputs.
- R5. All projection computations execute server-side. Frontend receives precomputed `ProjectionPayload` from the API; `lib/financial/` re-exports are removed.
- R6. No regression in currently-passing proof tests (`src/tests/proof/`).
- R7. Existing API consumers (property detail, dashboard, slide factory, executive summary) receive identical numeric values after migration.
- R8. Portfolio-level consolidated financials (IRR, NOI, DSCR, cash flow) are computed server-side and returned in a single `/api/properties/:id/projection` response.

---

## Scope Boundaries

- R5 (server migration) is Phase 2 — a separate PR from Phase 1 (correctness). Phase 1 can ship standalone.
- The FCFE nonstandard definition (MINOR-6) is documented and accepted by the project; Phase 1 adds a prominent code comment but does not change the formula unless correctness testing reveals it breaks statement identities.
- Drizzle schema changes: none. Projections are computed at request time, not persisted.
- The slide factory pipeline (`artifacts/api-server/src/slides/`) already calls `buildGlobalInput()` → engine server-side and is excluded from Phase 2 migration.
- React Query cache keys and hook signatures are not changed in Phase 2 — the migration is transparent to callers.

### Deferred to Follow-Up Work

- Persisting projection snapshots for scenario comparison (separate PR)
- Adding projection caching layer beyond the existing `artifacts/api-server/src/finance/cache.ts`
- Migrating the 40+ `lib/calc/src/` dispatch tools to server-only (lower priority — these are on-demand analysis tools, not continuous projection code)

---

## Context & Research

### Relevant Code and Patterns

- `lib/engine/src/property/property-engine.ts` — 8-step monthly pro-forma (core engine)
- `lib/engine/src/aggregation/yearlyAggregator.ts` — SUM/PICK_LAST/WEIGHTED aggregation rules
- `lib/engine/src/aggregation/consolidation.ts` — portfolio consolidation
- `lib/engine/src/aggregation/cashFlowSections.ts` — FCFE definition (MINOR-6 site)
- `lib/calc/src/returns/irr-vector.ts` — IRR cash flow vector builder
- `lib/calc/src/financing/dscr-calculator.ts` — DSCR / max loan sizing
- `artifacts/api-server/src/finance/service.ts` — server compute entry point (Davide)
- `artifacts/api-server/src/finance/recompute.ts` — DB-aware wrapper
- `artifacts/api-server/src/tests/proof/engine-integrity-fixes.test.ts` — existing regression suite
- `artifacts/hospitality-business-portal/src/lib/financial/` — all thin re-exports from `@engine/*`; target for removal in Phase 2
- `artifacts/hospitality-business-portal/src/components/dashboard/overviewExportData.ts` — calls `computeIRR` client-side; Phase 2 migration target

### Institutional Learnings

- `docs/solutions/logic-errors/financial-engine-audit-findings-2026-05-04.md` — MINOR-6 (nonstandard FCFE), prior audit findings
- `docs/solutions/architecture-patterns/slide-factory-financial-data-fork-diagnostic-vs-packaging-2026-05-06.md` — ADR-007: engine is pure; route/service layer resolves DB values
- ADR-007 §1 (`CLAUDE.md` §4): `lib/engine/src/` and `lib/calc/src/` must not import storage, DB, or logger

### External References

- GAAP ASC 230 (indirect method cash flow statement) — basis for CFO/CFI/CFF sections
- Descartes' rule of signs — basis for multiple-IRR warning in `irr-vector.ts`
- CBRE Hospitality Cap Rate Survey Q1-2026 — exit cap rate benchmarks (used in Phase 1 / seed defaults cross-reference)

---

## Key Technical Decisions

- **Phase 1 ships standalone.** Correctness fixes do not require the server-migration. Merging them together would create an enormous diff with mixed risk profiles.
- **Phase 2 migration is transparent to callers.** React Query hooks (`useServerFinancials`, `usePortfolioFinancials`) switch from running the engine in the browser to fetching a precomputed `ProjectionPayload`. Callers see the same data shape; only the computation site moves.
- **FCFE definition preserved.** The nonstandard FCFE (NOI-based, not NI-based) is an intentional product decision for the boutique-hotel context. Phase 1 adds a clarifying comment and adds it to the test fixture but does not change the formula.
- **`lib/financial/` re-exports removed in Phase 2, not Phase 1.** Removing them before the API payloads are wired in Phase 2 would break the frontend. The removal is the final step of Phase 2.
- **Single projection endpoint.** Phase 2 introduces `GET /api/properties/:id/projection` returning `ProjectionPayload` (monthly + yearly property data, company data, portfolio consolidation if requested). Existing fragmented endpoints (`/financials`, `/company-financials`) remain as thin wrappers that delegate to the new endpoint for backwards compatibility.

---

## Open Questions

### Resolved During Planning

- *Are frontend `lib/financial/` files truly re-exports or independent implementations?* — All 18 files are direct `export * from '@engine/*'` or `export * from '@calc/*'`. No independent implementation. Confirmed by reading each file's first line.
- *Does the slide factory already run server-side?* — Yes. It calls `buildGlobalInput()` → engine in the route handler. Excluded from Phase 2 scope.

### Deferred to Implementation

- *What is the exact `ProjectionPayload` shape?* — Define during U4. It must cover all data currently computed by frontend `lib/financial/` consumers. Inventory consumer components in U4.
- *Does removing `@engine/*` from the Vite bundle break the frontend build?* — Verify during U5. The alias is defined in `artifacts/hospitality-business-portal/vite.config.ts`; removing it after the re-exports are deleted should be safe, but confirm no deep imports escape the `lib/financial/` boundary.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

**Phase 1 — Correctness (one PR):**

```
proof tests  →  engine  →  statement identities verified
                         →  aggregation rules documented + tested
                         →  IRR edge cases covered
                         →  DSCR formula validated
```

**Phase 2 — Server migration (second PR):**

```
Before:
  Browser → lib/financial/* (re-exports) → @engine/* → runs full engine in browser

After:
  Browser → useServerFinancials() → GET /api/properties/:id/projection
                                   → finance/service.ts (server) → engine → ProjectionPayload
  Browser → displays precomputed values only
```

Migration path per component:
1. Add `GET /api/properties/:id/projection` route
2. Replace `lib/financial/*` imports in each component with API hook
3. Delete `lib/financial/` re-exports once all consumers migrated
4. Remove `@engine/*` and `@calc/*` from Vite optimizeDeps and alias config

---

## Implementation Units

### Phase 1 — Correctness Audit

- U1. **Financial statement identity test suite**

**Goal:** Write a proof test file that asserts the core accounting identities hold for all 6 seed properties at their stabilized year.

**Requirements:** R1, R6

**Dependencies:** None

**Files:**
- Create: `artifacts/api-server/src/tests/proof/financial-statement-identities.test.ts`
- Read: `lib/engine/src/property/property-engine.ts` (identity sources)
- Read: `lib/engine/src/aggregation/cashFlowSections.ts` (FCFE definition)

**Approach:**
- Run the engine against each `SEED_INITIAL_PROPERTY` using the current seed defaults
- Assert: NOI = totalRevenue − operatingExpenses (within $1 rounding)
- Assert: FCFE = NOI − annualDebtService + refinancingProceeds (per cashFlowSections.ts definition, not standard FCFE)
- Assert: cashFromOperations + cashFromInvesting + cashFromFinancing = netCashChange (indirect method identity)
- Assert: endingCash = beginningCash + netCashChange for each year
- Add a comment at the FCFE assertion: `// MINOR-6: nonstandard definition — NOI-based, not NI-based. See engine audit 2026-05-04.`

**Patterns to follow:**
- `artifacts/api-server/src/tests/proof/engine-integrity-fixes.test.ts` — existing proof test structure

**Test scenarios:**
- Happy path: all 6 seed properties pass identity checks at stabilized year (Year 3 or Year 4)
- Edge case: property with no F&B revenue (rooms-only) — identities still hold
- Edge case: property with refinance event in projection period — FCFE includes refi proceeds
- Edge case: property with no debt (full equity) — FCFE = NOI, debt service = 0
- Error path: degenerate input (NaN revenue) — engine returns finite values (existing edge-case test covers this)

**Verification:**
- `pnpm --filter @workspace/api-server run test -- src/tests/proof/financial-statement-identities.test.ts` passes
- All 6 properties pass all identity assertions

---

- U2. **Portfolio rollup aggregation rules audit and test**

**Goal:** Audit and test the SUM/PICK_LAST/WEIGHTED aggregation rules in `consolidation.ts`. Fix any incorrect rules and document the decision for each field.

**Requirements:** R2, R6

**Dependencies:** U1 (establishes test infrastructure)

**Files:**
- Modify: `lib/engine/src/aggregation/consolidation.ts` (fix rules if needed)
- Create: `artifacts/api-server/src/tests/proof/portfolio-consolidation.test.ts`

**Approach:**
- Read `consolidation.ts` completely; for each field identify the current aggregation rule
- Correct rule expectations:
  - Flow items (NOI, revenue, operating expenses, debt service, capex): **SUM** across properties
  - Stock items (ending cash, total debt outstanding, asset value): **SUM** (additive stocks)
  - Per-unit metrics (ADR, occupancy rate, RevPAR): **WEIGHTED** by room-night capacity
  - Rates (tax rate, cap rate): **DO NOT AGGREGATE** — these are property-specific; portfolio level should omit or show as range
- Document each field's rule in a comment block at the top of `consolidation.ts`
- Write tests with 2-property portfolios where the correct aggregated value is known by hand

**Test scenarios:**
- Happy path: 2-property portfolio; portfolio NOI = sum of both properties' NOI
- Happy path: 2-property portfolio; portfolio ADR = weighted by room count × nights
- Edge case: 1-property portfolio — portfolio equals property
- Edge case: property with zero revenue in Year 1 — does not distort weighted ADR
- Integration: portfolio IRR computed from consolidated cash flows matches manual calculation

**Verification:**
- Portfolio rollup rules comment block present in `consolidation.ts`
- Consolidation tests pass

---

- U3. **IRR vector and solver edge cases**

**Goal:** Audit and test IRR vector construction and solver convergence for the documented edge cases.

**Requirements:** R4, R6

**Dependencies:** None (standalone calc layer)

**Files:**
- Modify: `lib/calc/src/returns/irr-vector.ts` (add guards if missing)
- Create: `lib/calc/src/returns/irr-vector.test.ts` (extend existing or create if absent)

**Approach:**
- Verify sign-change counting follows Descartes' rule — warn when > 1 sign change (multiple IRR solutions possible)
- Verify exit proceeds are included in the final year cash flow when `include_exit: true`
- Verify `include_exit: false` path returns operating-only IRR (useful for yield-on-cost)
- Verify refi proceeds are added in the correct year index (not shifted by one)
- Verify degenerate inputs (all positive flows, no initial investment) return an error/NaN cleanly rather than diverging
- Verify Newton-Raphson halts with `null` rather than throws when it does not converge within iteration limit

**Test scenarios:**
- Happy path: 10-year hold, initial equity outflow, FCFE years 1–9, FCFE + exit year 10 → finite positive IRR
- Happy path: refi in year 3 — vector shows positive bump in year 3, IRR increases vs no-refi case
- Edge case: `include_exit: false` — IRR is lower (operating-only); no exit proceeds in final year
- Edge case: all cash flows negative (pre-stabilization) — IRR returns null or NaN, no throw
- Edge case: single sign change — no multiple-IRR warning emitted
- Edge case: two sign changes (refi + exit both positive) — warning emitted
- Error path: zero initial investment — function returns error/null cleanly

**Verification:**
- All irr-vector tests pass
- Newton-Raphson non-convergence returns `null`, not throw

---

- U4. **DSCR formula and loan sizing audit**

**Goal:** Verify DSCR uses stabilized NOI (not ramp-year NOI) and that reverse PMT loan sizing is consistent with the DSCR floor.

**Requirements:** R3, R6

**Dependencies:** None

**Files:**
- Modify: `lib/calc/src/financing/dscr-calculator.ts` (fix if stabilized-year NOI not used)
- Extend: `lib/calc/src/financing/dscr-calculator.ts` tests (inline or separate test file)

**Approach:**
- Read `dscr-calculator.ts`; identify which NOI figure is used for max-loan sizing
- Correct: use Year 2 or Year 3 stabilized NOI (configurable), not Year 1 ramp NOI
- Verify: `max_loan = stabilizedNOI / (minDSCR × annualDebtServicePerDollar)` identity holds
- Verify: DSCR sensitivity matrix uses the same stabilized-NOI source
- Add a test with a known ramp profile confirming Year-1 NOI is NOT used for sizing

**Test scenarios:**
- Happy path: stabilized NOI $500K, DSCR floor 1.25×, rate 7% — max loan matches formula
- Edge case: ramp Year 1 NOI is 40% of stabilized — max loan does NOT use Year 1 figure
- Edge case: no-debt property — DSCR returns Infinity (or a sentinel), no divide-by-zero
- Error path: NOI < 0 — max loan = 0, no negative loan sizing

**Verification:**
- DSCR tests pass; stabilized-year NOI confirmed used for sizing

---

### Phase 2 — Server-Side Migration (separate PR)

- U5. **Inventory frontend engine consumers and define ProjectionPayload**

**Goal:** Enumerate every frontend component that imports from `lib/financial/`, document what data each needs, and define the `ProjectionPayload` type that the new API endpoint will return.

**Requirements:** R5, R7

**Dependencies:** Phase 1 complete (correctness established before migration)

**Files:**
- Create: `artifacts/api-server/src/finance/core/projection-payload.ts` (type definition)
- Read: all files in `artifacts/hospitality-business-portal/src/lib/financial/` and their importers

**Approach:**
- Run `grep -r "lib/financial" src/` to get the full consumer list
- For each consumer: note which computed fields it reads (yearlyData, monthlyData, portfolioConsolidation, companyData, etc.)
- Define `ProjectionPayload` as the union of all consumed fields — this becomes the API contract
- The payload shape must cover: monthly pro-forma array, yearly aggregated array, company monthly/yearly, portfolio consolidated yearly, IRR vector, equity multiple, exit valuation

**Test scenarios:**
- Test expectation: none — this is an inventory and type-definition unit, not a behavioral change

**Verification:**
- `ProjectionPayload` type defined and exported from `artifacts/api-server/src/finance/core/projection-payload.ts`
- Every field consumed by any `lib/financial/` importer is present in the type

---

- U6. **Add `GET /api/properties/:id/projection` endpoint**

**Goal:** Add the server-side projection computation endpoint that returns `ProjectionPayload` for a given property.

**Requirements:** R5, R7, R8

**Dependencies:** U5

**Files:**
- Create: `artifacts/api-server/src/routes/projection.ts`
- Modify: `artifacts/api-server/src/index.ts` (register route)
- Modify: `artifacts/api-server/src/finance/service.ts` (expose projection entry point if not already sufficient)

**Approach:**
- Route: `GET /api/properties/:id/projection?years=10&includeCompany=true&includePortfolio=false`
- Resolve property + global assumptions from DB (same pattern as existing finance routes)
- Call `finance/service.ts` compute function — already server-side
- Return `ProjectionPayload` JSON
- Wire through existing `finance/cache.ts` for performance
- Auth: requires authenticated session; returns 404 if property not accessible to user

**Patterns to follow:**
- `artifacts/api-server/src/routes/admin/intelligence.ts` — route structure
- `artifacts/api-server/src/finance/recompute.ts` — DB-aware compute wrapper pattern

**Test scenarios:**
- Happy path: authenticated GET for owned property returns 200 with projection data
- Happy path: `includeCompany=true` adds company-level data to payload
- Edge case: property in PIPELINE status (no operations yet) — returns valid projection with zero operating years
- Error path: unauthenticated request — 401
- Error path: property not owned by user — 404
- Error path: property with missing assumptions — 200 with fallback values applied (same as current engine behavior)
- Integration: returned yearly NOI matches what the engine computes directly for the same inputs

**Verification:**
- Route registered and reachable at `/api/properties/:id/projection`
- `pnpm run typecheck` clean
- Integration test confirms payload values match direct engine computation

---

- U7. **Migrate frontend consumers from lib/financial to API hook**

**Goal:** Replace all `lib/financial/` imports in frontend components with calls to a new `useProjection(propertyId)` React Query hook that fetches from U6.

**Requirements:** R5, R7

**Dependencies:** U6

**Files:**
- Create: `artifacts/api-server/lib/api-spec/openapi.yaml` update (add projection endpoint)
- Create: `artifacts/hospitality-business-portal/src/hooks/useProjection.ts` (React Query hook)
- Modify: all files currently importing from `lib/financial/` (inventory from U5)
- Delete: `artifacts/hospitality-business-portal/src/lib/financial/` (all 18 files) once all consumers migrated

**Approach:**
- Add `useProjection(propertyId: number)` hook returning `{ data: ProjectionPayload, isLoading, error }` via `apiRequest`
- Migrate consumers file-by-file: replace `import { ... } from '@/lib/financial/...'` with destructuring from `useProjection()`
- After each file migrated, run `pnpm run typecheck` to catch mismatches early
- Final step: delete `lib/financial/` directory and remove `@engine/*`/`@calc/*` from Vite `optimizeDeps` and aliases

**Execution note:** Migrate file-by-file, typechecking after each. Do not batch-delete `lib/financial/` until all imports are resolved.

**Test scenarios:**
- Happy path: dashboard IRR gauge shows same value before and after migration
- Happy path: property detail yearly income statement shows same NOI before and after
- Edge case: offline / API error — displays cached data or loading state (existing React Query behavior)
- Integration: end-to-end: change a property assumption → projection API recomputes → UI updates via React Query invalidation

**Verification:**
- `pnpm run typecheck` clean after all migrations
- `lib/financial/` directory deleted
- Bundle size reduced (engine code no longer in browser bundle)
- Existing proof tests still pass

---

## System-Wide Impact

- **Interaction graph:** Phase 2 touches every frontend component that displays financial data. `useServerFinancials`, `usePortfolioFinancials`, `InvestmentAnalysis`, `PropertyIRRTable`, `YearlyIncomeStatement`, `YearlyCashFlowStatement`, `ConsolidatedBalanceSheet`, `OverviewPerformanceSection`, `overviewExportData.ts`.
- **Error propagation:** After Phase 2, financial computation errors surface as API errors (React Query error state) rather than runtime JS exceptions in the browser. Components must handle `isLoading` and `error` states.
- **State lifecycle risks:** React Query cache invalidation must be triggered on assumption saves. Existing `dataChanged` SSE events from Rebecca tools already invalidate property queries — verify they also invalidate the new projection query key.
- **API surface parity:** Slide factory (`/api/properties/:id/deck.pdf`) and executive summary export already compute server-side. After Phase 2, projection data is uniformly server-originated across all surfaces.
- **Integration coverage:** The critical integration to prove: save an assumption → projection query invalidates → UI shows updated numbers. Unit tests alone will not prove this.
- **Unchanged invariants:** ADR-007 §1 is strengthened, not changed. `lib/engine/src/` and `lib/calc/src/` remain pure (no storage/DB imports).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Phase 2 migration introduces numeric drift (floating-point differences between browser and server computation) | Phase 1 establishes identity test fixtures as the correctness baseline; Phase 2 integration tests verify values match pre-migration |
| React Query cache invalidation gap — projection data stale after assumption save | Add projection query key to the same invalidation path as property queries in RebeccaPanel.tsx and assumption save handlers |
| Engine bundle removal breaks a non-obvious consumer not caught by TypeScript | Run full test suite + manual smoke test after `lib/financial/` deletion before merging Phase 2 |
| Phase 2 is a large diff touching many files — CC branch hygiene risk (Replit Agent commits contaminating the branch) | Follow CLAUDE.md § CC branch hygiene: check `git log --format="%h %ae %s"` before merging; cherry-pick CC-only commits if contaminated |

---

## Sources & References

- Related code: `lib/engine/src/`, `lib/calc/src/`, `artifacts/api-server/src/finance/`
- Institutional learning: `docs/solutions/logic-errors/financial-engine-audit-findings-2026-05-04.md`
- ADR-007 (DI discipline): `CLAUDE.md` §4
- Branch hygiene: `docs/solutions/workflow-issues/cc-replit-branch-hygiene-2026-05-10.md`
