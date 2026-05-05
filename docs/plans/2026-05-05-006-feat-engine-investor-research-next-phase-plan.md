---
title: "feat: Engine accuracy, investor UI, and research completeness — next phase"
type: feat
status: active
date: 2026-05-05
origin: docs/plans/2026-05-05-005-three-track-next-steps.md
---

# Engine Accuracy, Investor UI, and Research Completeness — Next Phase

## Summary

Picks up the remaining open items from the three-track plan (005) after B1, partial B3,
MAJOR-1/3/5/MINOR-6/7, and the authority-rate rework were all shipped. Seven units remain,
ordered so correctness gates demo-readiness: both engine fixes land first (MAJOR-2 refi
income-cap, MAJOR-4 fee subordination), then seed tuning against the corrected model, then
the investor UI, portfolio live comparables, and finally the two taxonomy debt items
(property income tax, transfer taxes) which touch DB schema.

---

## Problem Frame

Three categories of residual correctness and completeness debt survive the sprint:

1. **Two unfixed engine findings** — MAJOR-2 (refinance sizing still uses cost basis despite
   a proof test) and MAJOR-4 (fee subordination has no proof test and the engine still gates
   on pre-debt-service GOP). LP-facing IRR, DSCR, and refi proceeds are potentially
   misleading until both are resolved.

2. **Investor workflow gaps** — the waterfall result is computed and returned by the API but
   has no frontend surface; seed exit cap rates and Colombia ADRs have not been tuned to the
   updated engine; the portfolio raise specialist has no live data path.

3. **Two taxonomy debt items** — `DEFAULT_PROPERTY_INCOME_TAX_RATE` ignores country and must
   route through `getFactoryNumber`; seven transfer-tax country constants in `exit-scenarios.ts`
   belong in the admin `market_rates` table.

---

## Requirements

- R1. Refinance proceeds are income-cap based (NOI / exitCapRate × LTV), not cost-basis based; zero-NOI properties produce zero-or-negative proceeds.
- R2. Incentive fee accrues only when levered cash (post-debt-service) is positive; it is zero when GOP is positive but DSCR < 1.
- R3. A proof test exists and passes for each of R1 and R2 that cannot be satisfied by the existing (wrong) implementation — i.e., the test must actually distinguish the two behaviors.
- R4. Seed properties show credible deal metrics after engine fixes; exit cap rates and ADR values are in market range.
- R5. Properties with `lpEquityPct` configured show a waterfall summary panel; properties without it show a clean empty state.
- R6. `getPortfolioRaiseComparables()` is async; a live SEC EDGAR row appears when the API is reachable; canned fallback activates cleanly below the minimum-row threshold.
- R7. `property.taxRate` reads via `getFactoryNumber('taxRate', country)` not a flat default constant; `DEFAULT_PROPERTY_INCOME_TAX_RATE` is retired.
- R8. The seven transfer-tax country rates are removed from `exit-scenarios.ts`; they are seeded into `market_rates` and read via `storage.getMarketRate`.

---

## Scope Boundaries

- European waterfall variant (ADR-010), LP-net IRR, per-property SPV structure — deferred.
- Verdict cache wiring for portfolio specialist — separate packet.
- Specialist Q (Quitéria) and Specialist R (Rafaela) from ADR-010 roadmap — out of scope.
- EU Eurostat HICP in inflation comparables — parsing complexity deferred.
- Seed reseed automation (`--force` flag) — manual admin action, not automated here.

### Deferred to Follow-Up Work

- `startOccupancy ?? 0.70` in POST stress-test handler (taxonomy Q4 from number-taxonomy-and-assumption-lifecycle.md) — needs admin confirmation before fix; separate PR.
- Verdict cache wiring for the portfolio-raise specialist — already noted in 005, separate PR.

---

## Context & Research

### Relevant Code and Patterns

- `lib/engine/src/property/refinance-pass.ts` line 80 — `valuation: { method: "direct", property_value_at_refi: costBasisValue }` is the cost-basis path that needs to become income-cap
- `lib/engine/src/property/property-engine.ts` lines 173–184 — current `feeIncentive = Math.max(0, gop * ctx.incentiveFeeRate)` without debt-service gate
- `artifacts/api-server/src/tests/proof/engine-integrity-fixes.test.ts` — existing T012 proof suite; Finding #2 test passes for the wrong reason; Finding #4 test is absent
- `lib/engine/src/property/refinance-pass.ts` lines 62–68 — yearly NOI already computed in `yearlyNOI[]`; use `yearlyNOI[refiYear]` as the income-cap base
- `artifacts/api-server/src/seeds/market-rates.ts` — pattern for admin-maintained rate seeding
- `lib/calc/src/analysis/exit-scenarios.ts` lines 192–207 — seven `TRANSFER_TAX_RATE_*` constants to migrate
- `artifacts/api-server/src/ai/specialists/live-comparables.ts` — NAI-28 pattern to follow for C1
- `artifacts/api-server/src/ai/specialists/portfolio-raise-live-comparables.ts` — current sync/canned implementation
- `docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md` — canonical NAI-33/34/35 integration pattern
- `artifacts/hospitality-business-portal/src/hooks/useServerFinancials.ts` line 38 — `waterfallResult` already typed and returned

### Institutional Learnings

- `docs/solutions/logic-errors/financial-engine-audit-findings-2026-05-04.md` — source audit document for all MAJOR findings
- `docs/solutions/database-issues/seed-insert-no-conflict-financial-assumptions-lost-2026-05-02.md` — `onConflictDoNothing()` pattern required for all seed inserts
- `docs/plans/number-taxonomy-and-assumption-lifecycle.md` — category decision table; transfer taxes are Category 4 (TABLE-SOURCED)

---

## Key Technical Decisions

- **MAJOR-2 income-cap formula:** `refiLoan = (yearlyNOI[refiYear] / exitCapRate) × refiLTV`. Fallback to cost-basis (with logged warning) when `yearlyNOI[refiYear] ≤ 0` — this prevents surprising zero-proceed outcomes for properties not yet stabilized at refi year. `exitCapRate` resolves as `property.exitCapRate ?? ctx.defaultExitCapRate`.
- **MAJOR-4 subordination base:** `leveredCash = anoi - interestExpense - principalPayment`. `feeIncentive = Math.max(0, Math.min(gop, Math.max(0, leveredCash)) × incentiveFeeRate)`. The `Math.min(gop, leveredCash)` bounds the incentive base so it never exceeds GOP when levered cash exceeds it.
- **Proof test gap fix (MAJOR-2):** The existing test passes under cost-basis because `existingDebt ≈ newLoan × LTV` for the test parameters. A correct distinguishing test uses a property with zero acquisition debt (Full Equity) and high NOI — cost-basis gives `purchasePrice × refiLTV` (large positive proceeds), income-cap gives `NOI / cap × LTV` (different value). Both scenarios must coexist in the test; the existing NOI=0 test stays.
- **Transfer tax migration:** Use `market_rates` table (same as the ERP / CPI band delta migration) rather than `model_constants_registry` — transfer taxes are not country-keyed in the registry schema, and market_rates already has the `admin_manual` / `isManual=true` pattern for authority rates. Seven rate keys: `transfer_tax_default`, `transfer_tax_us`, `transfer_tax_mexico`, `transfer_tax_netherlands`, `transfer_tax_uk`, `transfer_tax_france`, `transfer_tax_spain`. Values stored as percentage points (× 100); read site divides by 100.
- **`DEFAULT_PROPERTY_INCOME_TAX_RATE` retirement:** `PropertyInput` already carries a `country` field (confirmed by seed-data usage). Replace `?? DEFAULT_PROPERTY_INCOME_TAX_RATE` fallbacks with `?? getFactoryNumber('taxRate', property.country ?? 'United States')`. The constant export stays as a deprecated alias pointing to `getFactoryNumber('taxRate', 'United States')` for the one session where the rename would be too disruptive.

---

## Open Questions

### Resolved During Planning

- **Does `PropertyInput` carry `country`?** Yes — confirmed by `property-data.ts` seeds using `country: "Colombia"` etc. and the engine reading it via `ctx`.
- **Which `computeRefinance` valuation method for income-cap?** Current call uses `{ method: "direct", property_value_at_refi: costBasisValue }`. Switching to `{ method: "direct", property_value_at_refi: incomeCapValue }` (using the income-cap derived value directly) is cleaner than adding a new method to `computeRefinance`. The method label stays `"direct"` — the caller is now responsible for passing the correct value.
- **Is MAJOR-4 proof test completely missing?** Yes — `engine-integrity-fixes.test.ts` has no `describe('Finding #4')` block. The header comment lists it but it was never written.
- **Are all other audit findings (MAJOR-1, MAJOR-3, MAJOR-5, MINOR-6, MINOR-7) resolved?** Yes — proof tests pass; engine code confirmed for each.

### Deferred to Implementation

- Exact line numbers for all MAJOR-4 touch points in `property-engine.ts` — read the file during execution to find every `gop * ctx.incentiveFeeRate` occurrence.
- Whether the `computeRefinance` interface should eventually add a typed `"income_cap"` method option — out of scope for this plan; the direct-value approach is sufficient for now.
- Whether `DEFAULT_PROPERTY_INCOME_TAX_RATE` callers exist outside the engine/routes layer — grep at implementation time.

---

## Implementation Units

- U1. **MAJOR-2: Refinance income-cap implementation + proof test fix**

**Goal:** Replace the cost-basis refinance sizing in `refinance-pass.ts` with income-capitalization (`NOI / exitCapRate × LTV`); fix the existing proof test so it actually fails under cost-basis.

**Requirements:** R1, R3

**Dependencies:** None

**Files:**
- Modify: `lib/engine/src/property/refinance-pass.ts`
- Modify: `artifacts/api-server/src/tests/proof/engine-integrity-fixes.test.ts`

**Approach:**
- In `refinance-pass.ts`, after `yearlyNOI` is built (line ~66), compute `incomeCapValue = (yearlyNOI[refiYear] ?? 0) > 0 ? yearlyNOI[refiYear] / exitCapRate : null`
- If `incomeCapValue` is null (zero-NOI fallback), use `costBasisValue` and emit a logger.warn
- Pass `incomeCapValue ?? costBasisValue` as `property_value_at_refi` to `computeRefinance`
- `exitCapRate` resolves: `property.exitCapRate ?? ctx.defaultExitCapRate ?? DEFAULT_EXIT_CAP_RATE`
- In the proof test, add a **Full Equity / high-NOI** distinguishing scenario: a property with no acquisition debt and two ADR levels produces refi proceeds that track NOI, not purchase price. This scenario must produce different outcomes under income-cap vs cost-basis. The existing zero-NOI test stays (it correctly documents the fallback behavior).

**Execution note:** Write the strengthened proof test first; confirm it fails against the current cost-basis implementation; then apply the engine fix.

**Patterns to follow:**
- `refinance-pass.ts` `yearlyNOI[]` array already built at line ~64; `refiYear` computed at line ~60
- `computeRefinance` call pattern at line ~77
- Proof test fixture style in `engine-integrity-fixes.test.ts` (BASE_COSTS, ZERO_DEBT_GLOBAL)

**Test scenarios:**
- Happy path: property with $200k NOI at refi year, exit cap 8%, refiLTV 0.65 → refi loan = $200k/0.08 × 0.65 = $1.625M (verify within $5k rounding tolerance)
- Happy path: zero-acquisition-debt property — cost-basis would give `purchasePrice × LTV`; income-cap gives `NOI / cap × LTV`; both must produce different values when NOI/cap ≠ purchasePrice
- Edge case: NOI = 0 at refi year → income-cap undefined → falls back to cost-basis, logger.warn called
- Edge case: `exitCapRate` null on property → resolves from `ctx.defaultExitCapRate`
- Integration: `refi loan scales with NOI` ratio test must now be satisfied (the `if (year3RefiLow > 0 && year3RefiHigh > 0)` guard must be true and the ratio must be between 1.5 and 2.5)

**Verification:**
- Proof test for Finding #2 fails under current code (before engine fix) and passes after
- `pnpm --filter @workspace/calc run test` passes (all T012 tests green)
- `pnpm tsc --noEmit` clean in both `lib/engine` and `artifacts/api-server`

---

- U2. **MAJOR-4: Fee subordination gate + proof test**

**Goal:** Gate incentive fee on post-debt-service levered cash; add the missing Finding #4 proof test that must fail before the fix and pass after.

**Requirements:** R2, R3

**Dependencies:** None (parallel with U1; independent engine section)

**Files:**
- Modify: `lib/engine/src/property/property-engine.ts`
- Modify: `artifacts/api-server/src/tests/proof/engine-integrity-fixes.test.ts`

**Approach:**
- In the monthly loop where `feeIncentive` is computed, after computing `interestExpense` and `principalPayment` for that month, compute `leveredCash = anoi - interestExpense - principalPayment`
- Replace `feeIncentive = Math.max(0, gop * ctx.incentiveFeeRate)` with `feeIncentive = Math.max(0, Math.min(gop, Math.max(0, leveredCash)) * ctx.incentiveFeeRate)`
- This ensures: (a) fee is never negative, (b) fee base cannot exceed GOP, (c) fee is zero when levered cash ≤ 0
- Add `describe('Finding #4 — Fee subordination gate (T012)')` block to the proof test file

**Execution note:** Write the proof test first (pin that a property with GOP > 0 and DSCR < 1 produces feeIncentive = 0); confirm it fails against current code; then fix the engine.

**Patterns to follow:**
- Existing incentive fee section in `property-engine.ts` (lines ~173–184)
- `ZERO_DEBT_GLOBAL` fixture in proof test for unlevered baseline comparison

**Test scenarios:**
- Happy path: property with GOP $80k, debtService $60k (positive levered cash $20k) → `feeIncentive = Math.max(0, $20k × incentiveFeeRate)`, not `$80k × incentiveFeeRate`
- Error path: property with GOP $50k, debtService $60k (negative levered cash) → `feeIncentive = 0`
- Edge case: zero-debt property → `leveredCash = anoi`, incentive base = min(gop, anoi); consistent with pre-fix behavior when debt = 0
- Edge case: `incentiveFeeRate = 0` → `feeIncentive = 0` regardless of levered cash
- Integration: existing proof tests for pre-ops gating (Finding #5) still pass after this change

**Verification:**
- `describe('Finding #4')` test block present, fails before fix, passes after
- `pnpm --filter @workspace/calc run test` all 24+ T012 tests green
- A property with GOP > 0 and negative levered cash shows `feeIncentive: 0` in engine output

---

- U3. **B3 remaining: Seed exit cap rates, Colombia ADR, company rates**

**Goal:** Tune remaining seed values to market reality now that the engine is correct; validate demo numbers look like real deals.

**Requirements:** R4

**Dependencies:** U1, U2 (tune seeds against corrected engine)

**Files:**
- Modify: `artifacts/api-server/src/seeds/property-data.ts`
- Modify: `artifacts/api-server/src/seeds/properties.ts`

**Approach:**
- Colombia properties currently at `exitCapRate: 0.10` and `0.09` — target range 8.5–9.5%; update to named constants `SEED_COLOMBIA_EXIT_CAP_RATE_*`
- Check Colombia startAdr values: Medellin and Cartagena luxury-tier properties should be in the $300–320 range; update if below
- Verify `marketingRate` and `miscOpsRate` on company seed rows in `properties.ts` match `DEFAULT_MARKETING_RATE` / `DEFAULT_MISC_OPS_RATE`
- Run `pnpm check:magic-numbers` after every file change; any new numeric literal must become a named constant first

**Patterns to follow:**
- Existing `SEED_MEDELLIN_DUPLEX_START_ADR` constant pattern in `property-data.ts`
- All numeric literals must use `DEFAULT_*` or `SEED_*` named constants — no raw values

**Test scenarios:**
- Test expectation: none — seed changes have no behavioral tests; the verification gate is the magic-numbers ratchet + visual inspection of H+ UI

**Verification:**
- `check:magic-numbers` PASS
- `pnpm tsc --noEmit` clean
- Colombia properties have `exitCapRate` in [0.085, 0.095]; luxury ADR ≥ $300
- ≥ 4 of 6 active seed properties show positive stabilized NOI in the engine; at least one shows levered IRR ≥ 15%

---

- U4. **B2: Waterfall result UI panel**

**Goal:** Render the already-typed `waterfallResult` in a visible read-only property panel; show LP/GP economics with a clean null state when waterfall is not configured.

**Requirements:** R5

**Dependencies:** None (data already returned by API)

**Files:**
- Create: `artifacts/hospitality-business-portal/src/components/property/WaterfallPanel.tsx`
- Modify: `artifacts/hospitality-business-portal/src/pages/` or equivalent property detail surface (locate by grepping for `waterfallResult` or the Returns/Executive Summary component)

**Approach:**
- Compact read-only panel (not a form) rendering: LP equity %, preferred return (targeted $ vs satisfied $), LP total return, LP multiple, GP total return, GP multiple
- Null/empty state when `waterfallResult === null` or `lpEquityPct` is not set: soft message "Waterfall not configured — add LP equity % and tranche structure in property settings"
- Follow the existing Returns panel or NOI card pattern for layout and typography
- `WaterfallOutput` type imported from `@calc/analysis/waterfall`

**Patterns to follow:**
- `artifacts/hospitality-business-portal/src/hooks/useServerFinancials.ts` line 38 for `waterfallResult` type
- Existing read-only financial panel components in the property detail page

**Test scenarios:**
- Happy path: property with `lpEquityPct = 0.80`, `waterfallResult` populated → panel renders LP/GP split fields with correct values
- Empty state: `waterfallResult === null` → soft empty state message renders, no error thrown
- Edge case: `lp_multiple` is 0 (distressed deal) → renders "0.00×" not NaN or blank

**Verification:**
- Panel visible in property detail for a seeded property with waterfall configured
- Null state renders cleanly with message
- No TypeScript errors; no new raw literals

---

- U5. **C1: Portfolio raise live comparables**

**Goal:** Convert `getPortfolioRaiseComparables()` from synchronous/canned to async with a live SEC EDGAR Form D source; canned fallback when live row count is below threshold.

**Requirements:** R6

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/ai/specialists/portfolio-raise-live-comparables.ts`
- Modify: `artifacts/api-server/src/constants.ts` (two new `LIVE_*` constants)

**Approach:**
- Convert function signature from `(): readonly LpDealComparable[]` to `async (): Promise<readonly LpDealComparable[]>`
- Reuse the SEC EDGAR EFTS fetch logic already present in `live-comparables.ts` for `getLpComparables()` — filter for `industryGroup: "Real Estate"` or `businessDescription` containing "hotel"/"hospitality"
- Apply `Promise.allSettled` + `isFulfilled<T>` type guard pattern (per the live-comparables integration pattern doc)
- Add two constants to `constants.ts`: `LIVE_MIN_PORTFOLIO_RAISE_LIVE_ROWS = 2` and `LIVE_PORTFOLIO_RAISE_CACHE_TTL_SECONDS` (reuse `EDGAR_CACHE_TTL_SECONDS` value via named constant reference)
- If live row count < `LIVE_MIN_PORTFOLIO_RAISE_LIVE_ROWS`, return canned set and log

**Patterns to follow:**
- `docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md` — exact NAI-33/34/35 pattern
- `getLpComparables()` in `live-comparables.ts` — EDGAR fetch, deduplication by CIK, XML parsing

**Test scenarios:**
- Test expectation: none for live path (external API; tested in integration environments) — but the canned fallback path must not regress; verify the function returns the full canned set when live count < threshold
- Integration: call site in the portfolio-raise runner still receives a `readonly LpDealComparable[]` after the async conversion

**Verification:**
- `getPortfolioRaiseComparables()` is async; runner call site uses `await`
- `pnpm tsc --noEmit` clean
- `check:magic-numbers` PASS
- Log line "X/N rows live, N−X canned" appears in activity stream when run with EDGAR available

---

- U6. **T7: Property income tax via `getFactoryNumber`**

**Goal:** Replace `DEFAULT_PROPERTY_INCOME_TAX_RATE` fallbacks with `getFactoryNumber('taxRate', country)` so per-country corporate tax rates apply; retire the flat constant.

**Requirements:** R7

**Dependencies:** U1, U2 (engine must be stable before touching tax calculation path; also confirms PropertyInput.country is in scope)

**Files:**
- Modify: `lib/engine/src/property/property-engine.ts` (and any other engine file using `DEFAULT_PROPERTY_INCOME_TAX_RATE`)
- Modify: `lib/shared/src/constants.ts` (deprecate the export)
- Modify: `artifacts/api-server/src/shared/constants.ts` (mirror sync)
- Grep at implementation time for all other consumers

**Approach:**
- Grep `DEFAULT_PROPERTY_INCOME_TAX_RATE` across all non-test, non-seed files
- Replace each `?? DEFAULT_PROPERTY_INCOME_TAX_RATE` with `?? getFactoryNumber('taxRate', ctx.country ?? 'United States')` using the country already available in the engine context
- In `constants.ts`, keep the export but mark `@deprecated` with a JSDoc pointing to `getFactoryNumber`; do not delete it yet (allows gradual migration without breaking importers)
- Mirrors in `artifacts/api-server/src/shared/` must be synced

**Patterns to follow:**
- `getFactoryNumber('taxRate', 'United States')` call pattern in `syncHelpers.ts`, `seeds/properties.ts`
- Deprecation pattern: `/** @deprecated Use getFactoryNumber('taxRate', country) instead. */`

**Test scenarios:**
- Happy path: engine run for a Colombia property uses Colombia tax rate (~35%), not 25%
- Happy path: engine run for US property uses `getFactoryNumber('taxRate', 'United States')` result
- Edge case: `country` is null/undefined on a property → falls back to `'United States'` baseline

**Verification:**
- `grep -r DEFAULT_PROPERTY_INCOME_TAX_RATE` returns only the deprecated definition and any test fixtures; no production fallback usages remain
- `pnpm tsc --noEmit` clean
- Proof tests still pass (tax calculation behavior unchanged for US properties)

---

- U7. **T8: Transfer taxes → `market_rates` table**

**Goal:** Remove seven hardcoded transfer-tax constants from `exit-scenarios.ts`; seed them into `market_rates` as `admin_manual` entries with source URLs; read via `storage.getMarketRate` at exit-scenario calculation time.

**Requirements:** R8

**Dependencies:** U6 (establishes country-aware rate migration pattern; also allows U7 to follow the same admin-table precedent)

**Files:**
- Modify: `lib/calc/src/analysis/exit-scenarios.ts`
- Modify: `artifacts/api-server/src/seeds/market-rates.ts`
- Modify: `artifacts/api-server/src/routes/properties.ts` or wherever `exit-scenarios.ts` is called (to inject market rates via async lookup before calling the pure calc function)

**Approach:**
- Seven rate keys: `transfer_tax_default`, `transfer_tax_us`, `transfer_tax_mexico`, `transfer_tax_netherlands`, `transfer_tax_uk`, `transfer_tax_france`, `transfer_tax_spain`
- Values stored as percentage points; read sites divide by 100 (same pattern as `imf_em_cpi_band_delta_*`)
- `exit-scenarios.ts` is a pure calc library — it must not import `storage`. Instead, the caller (route or service layer) resolves the transfer tax rate map and passes it in as a parameter: `computeExitScenarios(property, globalInput, transferTaxRates: Record<string, number>)`
- If a rate key is missing from `market_rates`, fall back to the current hardcoded value (named constant defined locally as the bootstrap default) with a `logger.warn`

**Patterns to follow:**
- `artifacts/api-server/src/seeds/market-rates.ts` — `admin_manual` seeding with `ERP_*_SEED_PP` named constants
- ADR-007 DI pattern: no storage imports in calc/engine libraries; pass resolved values as parameters

**Test scenarios:**
- Happy path: Netherlands property exit → uses `transfer_tax_netherlands` value from market_rates (0.108 seeded = 10.8%)
- Fallback: `market_rates` row missing for a country → logged warning + hardcoded bootstrap value used
- Edge case: `transferTaxRates` map empty → all countries fall back to bootstrap constants
- Integration: route layer resolves all needed rates in parallel (`Promise.all`) before calling `computeExitScenarios`

**Verification:**
- `grep -r TRANSFER_TAX_RATE` returns only the bootstrap fallback constants in `exit-scenarios.ts` and seed named constants; no inline literals elsewhere
- `check:magic-numbers` PASS
- `pnpm tsc --noEmit` clean
- Admin `GET /api/admin/market-data-tables` (or market-rates endpoint) shows the 7 new rate rows

---

## System-Wide Impact

- **Interaction graph:** MAJOR-2/4 fixes change NOI-derived outputs — any downstream that reads `refinancingProceeds`, `feeIncentive`, `leveredCashFlow`, `netIncome`, or LP-facing IRR will see updated values. Waterfall compute (`computeWaterfall`) consumes these outputs; portfolio-raise comparables do not.
- **Error propagation:** Income-cap fallback to cost-basis (zero-NOI case) must log a warning and continue — it must never throw or produce a zero-proceed panic for stabilized properties.
- **State lifecycle risks:** U3 seed changes only affect dev DB; prod data is untouched. U7 transfer-tax migration: the route layer must resolve rates before the call; a missing rate row must degrade gracefully (fallback, not 500).
- **API surface parity:** `getPortfolioRaiseComparables()` becomes async — all call sites must be updated with `await`.
- **Integration coverage:** U1/U2 proof tests are the primary integration gate; they exercise the full engine pipeline, not isolated helpers.
- **Unchanged invariants:** The `computeRefinance` function signature does not change (we pass a pre-computed income-cap value as `property_value_at_refi`); all other callers are unaffected.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| MAJOR-4 fix shifts IRR on leveraged properties in ramp years | Write the proof test to pin specific expected behavior; run full proof suite after fix; document the semantic change in commit message |
| MAJOR-2 income-cap fallback (zero-NOI) silently stays on cost-basis | Use `logger.warn` so the fallback is visible in the activity stream; add an edge-case proof test for this path |
| U3 seed tuning produces wrong demo numbers because engine fix changed outputs | Always run U1+U2 first; then reseed and visually verify H+ Analytics |
| U7 transfer-tax DI pattern adds a new parameter to `computeExitScenarios` — caller audit needed | Grep all call sites at implementation time; the function signature change is a compile-time error so TypeScript will surface every uncovered caller |
| U6 `getFactoryNumber` call in engine adds a registry import to `lib/engine` — check for circular import with `lib/shared` | The registry already lives in `lib/shared` and is used by `artifacts/api-server/src`; verify `lib/engine` package.json allows `@shared` imports before editing |

---

## Sources & References

- **Origin document:** [docs/plans/2026-05-05-005-three-track-next-steps.md](docs/plans/2026-05-05-005-three-track-next-steps.md)
- **Audit source:** docs/solutions/logic-errors/financial-engine-audit-findings-2026-05-04.md
- **Live comparables pattern:** docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md
- **Number taxonomy:** docs/plans/number-taxonomy-and-assumption-lifecycle.md
- **Engine:** `lib/engine/src/property/refinance-pass.ts`, `lib/engine/src/property/property-engine.ts`
- **Proof test suite:** `artifacts/api-server/src/tests/proof/engine-integrity-fixes.test.ts`
