---
title: "Three-Track Next Steps: Engine Integrity, Investor Workflow, AI Research Depth"
type: multi-track
status: active
date: 2026-05-05
origin: "Synthesis of CC + Replit Agent completed work through 2026-05-05"
---

# Three-Track Next Steps

## What Was Just Shipped

This plan picks up after a sustained sprint by two agents:

**Claude Code (CC) shipped:**
- Waterfall engine wiring into the property returns pipeline (`computeWaterfall` → `PropertyReturnMetrics.waterfallResult`)
- Knowledge Registry page (U7) — full admin UI for knowledge assets
- Funding specialist engine grounding (NAI-32) — `analyzeFundingNeeds()` injected into prompt context, SEC EDGAR Form D live comparables, 3-tranche support in DB + engine + prompt
- Portfolio capital raise specialist (greenfield) — LP equity raise analysis, `capitalRaise3` DB columns

**Replit Agent shipped:**
- NAI-33/34/35 — live data fetching for Revenue, Overhead, and PropertyDefaults specialist comparables (Wikipedia, CNBC, Booking.com RapidAPI, REST Countries, Alpha Vantage)
- ce-compound documentation — live-comparables specialist integration pattern

**All check gates pass:** typecheck, lint, magic-numbers, replit-independence, migration-guards.

---

## Problem Frame

Three categories of work remain with no code written against them yet:

1. **Engine integrity** — Five MAJOR findings were documented in the 2026-05-04 audit (`docs/solutions/logic-errors/financial-engine-audit-findings-2026-05-04.md`) and have been explicitly deferred in every subsequent plan. Some may already be fixed (MAJOR-3 confirmed fixed, MAJOR-5 taxes line uses `isAcquiredGate`); none have been systematically verified or proof-tested. LP-facing outputs (IRR, refi proceeds, fee loads) are potentially misleading until these are resolved.

2. **Investor workflow gaps** — Two deferred items from completed plans are sitting at "DB columns exist but UI not wired": (a) the `capitalRaise3` amount/date form fields, and (b) the `waterfallResult` returned by the API but never rendered in the frontend. The seed defaults also produce demo numbers that fail the "does this look like a real deal?" bar.

3. **AI research depth** — Portfolio capital raise specialist ships with a canned comparables dataset. It's the only specialist that has no live data path; every other specialist got live wiring in the recent sprint.

---

## Scope

### In Scope

**Track A — Financial engine accuracy** (priority 1, correctness)
- Verify and fix MAJOR-1 through MAJOR-5 engine findings; write proof tests pinning each fix
- MAJOR-3 and potentially MAJOR-5 may already be fixed — verification is required before touching anything

**Track B — Investor workflow** (priority 2, demo-readiness)
- Wire `capitalRaise3Amount`/`capitalRaise3Date` form fields in the Company Assumptions or Funding tab
- Render `waterfallResult` (LP/GP split, multiples, tier breakdown) in a visible property UI surface
- Execute the seed defaults optimization plan (tuning refi rates, exit caps, ADR values)

**Track C — AI research depth** (priority 3, specialist completeness)
- Wire live SEC EDGAR / Crunchbase / PitchBook data into `getPortfolioRaiseComparables()` following the NAI-33/34/35 pattern documented in `docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md`

### Out of Scope

- European waterfall variant selection (deferred, ADR-010)
- LP-net IRR computation (deferred, ADR-010)
- Per-property SPV structure modeling (deferred from portfolio-raise plan)
- Verdict cache wiring for portfolio specialist (follow-up in a separate packet)
- Specialist Q (Quitéria) and Specialist R (Rafaela) from ADR-010 roadmap
- EU Eurostat HICP for the inflation comparables (parsing complexity deferred in NAI-34 comments)

---

## Track A — Engine Integrity

### A0 · Verification audit before any changes

Before touching a single engine line, run a targeted re-read of `lib/engine/src/property/property-engine.ts` and `lib/engine/src/property/refinance-pass.ts` to produce a confirmed status table. This prevents regressing code that was already fixed.

**Target status table (to produce):**

| Finding | File | Line | Status |
|---------|------|------|--------|
| MAJOR-1 CFO identity | `lib/engine/src/aggregation/cashFlowSections.ts` | ~53 | ? |
| MAJOR-2 Refi sizing | `lib/engine/src/property/refinance-pass.ts` | ~77 | ? |
| MAJOR-3 PMT rate cap | `lib/calc/src/shared/pmt.ts` | 37–50 | ✅ Fixed (throws RangeError) |
| MAJOR-4 Fee subordination | `lib/engine/src/property/property-engine.ts` | ~179 | ? |
| MAJOR-5 Pre-ops gating | `lib/engine/src/property/property-engine.ts` | ~143 | Likely partial fix (taxes use `isAcquiredGate`; insurance needs check) |
| MINOR-6 FCFE definition | `lib/engine/src/aggregation/cashFlowSections.ts` | ~78 | ? |
| MINOR-7 Aggregation loop | `lib/engine/src/aggregation/yearlyAggregator.ts` | — | ? |

**Files:** `lib/engine/src/property/property-engine.ts`, `lib/engine/src/property/refinance-pass.ts`, `lib/engine/src/aggregation/cashFlowSections.ts`, `lib/calc/src/shared/pmt.ts`  
**Acceptance:** Status table complete and accurate before A1 begins.

---

### A1 · MAJOR-5 fix: pre-ops fixed-cost gating (taxes + insurance → `isAcquiredGate`)

**What the audit says:** Both `expenseTaxes` and `expenseInsurance` apply `fixedCostFactorGated` (gated on `isOperational`) when they should accrue from `isAcquired`. The design intent (session history) was that property taxes and insurance begin accumulating at acquisition close, before the hotel is operational.

**Likely already partially fixed:** `expenseTaxes` at line 143 of `property-engine.ts` already uses `isAcquiredGate`. Verify `expenseInsurance` at the adjacent line.

**Fix if needed:**
```typescript
// Before (if isOperational gate is still on insurance):
const expenseInsurance = ctx.insuranceRateMonthly * isOperationalGate;

// After (gate on isAcquired — insurance accrues at acquisition close):
const expenseInsurance = ctx.insuranceRateMonthly * isAcquiredGate;
```

**Proof test to add:** `lib/engine/src/tests/proof/pre-ops-cost-gating.test.ts` (new or extend existing proof suite)
- Pin: property acquired Month 1, operational Month 7 → taxes and insurance nonzero in Months 1–6, revenue = 0 in Months 1–6
- Pin: staffing costs (admin, IT, propertyOps) remain zero in Months 1–6 (still gated on isOperational)

**Files:** `lib/engine/src/property/property-engine.ts`, `artifacts/api-server/src/tests/proof/` (or `lib/engine/src/tests/proof/`)  
**Acceptance:** Proof test passes; `expenseInsurance` nonzero in pre-opening months for a property with acquisition date before opening date.

---

### A2 · MAJOR-4 fix: fee subordination gate

**What the audit says:** `feeIncentive = Math.max(0, gop * ctx.incentiveFeeRate)` fires on `gop` (pre-interest, pre-debt-service ANOI proxy) rather than on post-debt-service cash. This means management fees can accrue on a property with negative levered cash flow, transferring losses from the GP to LP silently.

**Fix:**
```typescript
// Before:
const feeIncentive = Math.max(0, gop * ctx.incentiveFeeRate);

// After: gate on post-debt-service cash (leveredCashThisMonth = anoi - debtService)
// Compute debtService = interestExpense + principalPayment for this month
const leveredCash  = anoi - interestExpense - principalPayment;
const feeIncentive = Math.max(0, Math.min(gop, Math.max(0, leveredCash)) * ctx.incentiveFeeRate);
// Note: Math.min(gop, leveredCash) bounds the incentive base at actual levered cash available
```

**Important:** MAJOR-4 is the most business-logic-sensitive fix. Changing the incentive fee base will shift NOI, ANOI, and derived IRR for properties that have positive GOP but negative levered cash in ramp years. The change must be accompanied by updated proof test pins (re-derive hand arithmetic).

**Proof test to add:** (extend `lib/engine/src/tests/proof/`)
- Pin: property with GOP $50k, debtService $60k (negative levered cash) → `feeIncentive = 0`, not `$50k × incentiveFeeRate`
- Pin: property with GOP $80k, debtService $60k (positive levered cash) → `feeIncentive = Math.max(0, $20k × incentiveFeeRate)` or full gop-based depending on chosen formula

**Files:** `lib/engine/src/property/property-engine.ts`, `artifacts/api-server/src/tests/proof/`  
**Acceptance:** Proof tests pass. A stabilized property with positive GOP and negative DSCR shows `feeIncentive = 0`.

---

### A3 · MAJOR-2 fix: refinance sizing via income capitalization

**What the audit says:** `refinance-pass.ts` sizes the new loan on cost basis (`purchasePrice + improvements`) × LTV rather than on the income-capitalization value (`projectedNOI_atRefiYear / exitCapRate`). This understates refi proceeds for high-NOI properties and overstates them for low-NOI ones.

**Fix approach:**
```typescript
// In refinance-pass.ts — compute income-cap property value at refi year
const refiYearNoi       = yearlyData[refiYear]?.anoi ?? 0;
const exitCapRate       = property.exitCapRate ?? ctx.defaultExitCapRate;
const incomeCapValue    = exitCapRate > 0 ? refiYearNoi / exitCapRate : 0;
const refiLoanAmount    = incomeCapValue * refiLTV;
// Pass refiLoanAmount to computeRefinance instead of implicitly computing from existingDebt
```

**Key decision:** If `refiYearNoi` is zero (property not yet stabilized at refi date), fall back to cost-basis sizing with a logged warning. Do not produce zero refi proceeds silently.

**Proof test:** Hand-derive refi proceeds for a property with known NOI and exit cap rate; pin against income-cap formula. Verify cost-basis fallback fires and logs when NOI = 0.

**Files:** `lib/engine/src/property/refinance-pass.ts`, proof suite  
**Acceptance:** `refinancingProceeds` for a stabilized property with $500k NOI and 7% exit cap = ~$7.14M × LTV, not `purchasePrice × LTV`.

---

### A4 · MAJOR-1 investigation: CFO identity — prove or realign

**What the audit says:** `cashFlowSections.ts` computes CFO as `NOI − interest − tax`, which deviates from the GAAP indirect method (Net Income + Depreciation + working capital changes). The FFE is moved to CFI, but no test proves `CFO + CFI + CFF = ΔEndingCash`.

**This is the hardest finding.** It may be a documentation gap (the chosen method is intentionally non-GAAP and should be disclosed) rather than a code bug. A4 must:

1. Write the reconciliation identity test first: `CFO + CFI + CFF = ΔEndingCash`
2. Run it against the current engine with a seeded property
3. If it passes → MAJOR-1 is a documentation issue, not a bug; update the module header comment
4. If it fails → identify the gap field and fix the section assignment

**Do not change CFO semantics without the reconciliation test passing first.** Changing CFO changes IRR, DSCR, and every downstream metric.

**Proof test:** `aggregation-crosscheck.test.ts` — add reconciliation identity assertion  
`CFO + CFI + CFF ≈ endingCashBalance − beginningCashBalance` (within $1 floating-point tolerance)

**Files:** `lib/engine/src/aggregation/cashFlowSections.ts`, `artifacts/api-server/src/tests/proof/aggregation-crosscheck.test.ts`  
**Acceptance:** Reconciliation test written and passing. Module header updated to reflect which CFO method is in use and why.

---

### A5 · MINOR-7 + MINOR-6: loop dedup and FCFE clarification

**MINOR-7:** `yearlyAggregator.ts` and `cashFlowAggregator.ts` both implement a monthly accumulation loop with overlapping logic. Extract the shared accumulation body into a helper to ensure future fixes propagate to both paths. This is a maintenance task, not a correctness bug.

**MINOR-6:** `FCFE` in `cashFlowSections.ts` is defined as `atcf - equityInvested` (project-level), not the standard `netIncome + depreciation - capex + netBorrowing`. Add a comment clarifying the definition and noting it is not FCFE in the standard corporate finance sense.

**Files:** `lib/engine/src/aggregation/yearlyAggregator.ts`, `lib/engine/src/aggregation/cashFlowAggregator.ts`, `lib/engine/src/aggregation/cashFlowSections.ts`  
**Acceptance:** Shared helper extracted; FCFE comment added; existing proof tests still pass.

---

## Track B — Investor Workflow

### B1 · capitalRaise3 form field

DB columns (`capitalRaise3Amount`, `capitalRaise3Date`) exist in `lib/db/src/schema/config.ts`. The route layer at `artifacts/api-server/src/routes/analyst-admin.ts` (lines 136–137, 696, 769) already reads and uses them. The funding predictor test suite covers the 3-tranche scenario. Only the frontend form is missing.

**Where to add it:** Company Assumptions page or the Funding tab — wherever the user currently enters `capitalRaise1Amount`/`capitalRaise1Date` and `capitalRaise2Amount`/`capitalRaise2Date`. Add a third tranche row with the same field pattern. Gate visibility behind a toggle or conditional ("Add third tranche") to avoid clutter.

**Form fields to add:**
- `capitalRaise3Amount` — currency input, same validation as `capitalRaise1Amount`
- `capitalRaise3Date` — date/quarter input, same validation as existing tranche date fields

**Files:** `artifacts/hospitality-business-portal/src/` — the Company Assumptions or Funding tab component (locate by searching for `capitalRaise1Amount` or `capitalRaise2Amount`)  
**Acceptance:** User can enter a third tranche amount and date; it persists on save; the Funding specialist picks it up in its next run.

---

### B2 · Waterfall result UI panel

`waterfallResult` (`WaterfallOutput | null`) is already typed in `useServerFinancials.ts` (line 38) and is returned by the API from `computeReturnsSummary`. The type is imported from `@calc/analysis/waterfall`. No data is missing — only a UI surface needs to be built.

**Where to render:** Property detail page or the Returns / Executive Summary section. A compact read-only panel (not a form) showing:
- LP equity %
- GP promote structure (tier thresholds and splits)
- LP total return ($), LP multiple, LP IRR (derived from `total_to_lp / equity_invested`)
- GP total return ($), GP multiple
- Preferred return: amount targeted vs. amount satisfied

**Design guidance:** Follow the existing Returns panel pattern; treat `waterfallResult === null` with a soft "Waterfall not configured — add LP equity % and tranche structure in property settings" empty state (not an error).

**Files:** `artifacts/hospitality-business-portal/src/` — property detail or Executive Summary page; `artifacts/hospitality-business-portal/src/hooks/useServerFinancials.ts` (already has the type)  
**Acceptance:** A property with `lpEquityPct` set shows LP/GP split figures; a property with `lpEquityPct = null` shows the configured empty state.

---

### B3 · Seed defaults optimization

The draft plan at `docs/plans/seed-defaults-optimization.md` defines the target values. Execute it:

| Task | File | Change |
|------|------|--------|
| T002 — Refi interest rates | `artifacts/api-server/src/seeds/property-data.ts` | `refinanceInterestRate: 0.09` → `0.07` (US market) |
| T007 — SEED_DEBT_ASSUMPTIONS | `lib/shared/src/constants-funding.ts` | `interestRate: 0.09` → `0.075` |
| Exit cap rates | `artifacts/api-server/src/seeds/property-data.ts` | US luxury → 6.5–7.5%; Colombia → 8.5–9.5% |
| Colombia ADR | `artifacts/api-server/src/seeds/property-data.ts` | Properties at $240–250 → $300–320 for luxury tier |
| Company rates | `artifacts/api-server/src/seeds/properties.ts` | Verify `marketingRate` and `miscOpsRate` match model defaults |

**Invariant:** Each change to a numeric value in a seeds file must already be (or become) a named constant following the `DEFAULT_*` or `SEED_*` convention. Do not add raw literals. Run `check:magic-numbers` after each file.

**After all changes:** `pnpm --filter @workspace/api-server exec tsx src/seed.ts --force` to reseed dev DB; verify in H+ UI that ≥ 4/6 active properties show positive stabilized NOI margin and at least one shows levered IRR ≥ 15%.

**Files:** `artifacts/api-server/src/seeds/property-data.ts`, `artifacts/api-server/src/seeds/properties.ts`, `lib/shared/src/constants-funding.ts` (+ mirror sync)  
**Acceptance:** `check:magic-numbers` clean; dev DB reseeded; H+ Analytics shows credible demo numbers.

---

## Track C — AI Research Depth

### C1 · Portfolio raise live comparables

`getPortfolioRaiseComparables()` in `artifacts/api-server/src/ai/specialists/portfolio-raise-live-comparables.ts` is synchronous and returns canned data only. It is the last specialist without a live data path.

**Pattern to follow:** `docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md` — exactly the NAI-33/34/35 approach.

**Proposed live sources:**
- **SEC EDGAR Form D** (free, no auth) — same source as `getLpComparables()` in `live-comparables.ts`; filter for `industryGroup: "Real Estate"` or `businessDescription` containing "hotel" / "hospitality". This reuses the existing EDGAR fetch helper.
- **Crunchbase / Apify actor** (if APIFY_API_TOKEN present) — fund raise data for boutique hospitality brands
- **Fallback:** current canned dataset when live row count < `LIVE_MIN_PORTFOLIO_RAISE_LIVE_ROWS` (new constant, target: 2)

**Implementation:**
1. Convert `getPortfolioRaiseComparables()` from sync to `async`
2. Call `getLpComparables()` (already wired) and filter/transform to `LpDealComparable` shape — the types overlap significantly
3. Apply the fault-tolerant `Promise.allSettled` + minimum-row guard pattern
4. Register any new sources in `seed-external-integrations.ts` using `onConflictDoNothing()`
5. Add 2 new `LIVE_*` constants to `constants.ts` (minimum row threshold + cache TTL)

**Files:** `artifacts/api-server/src/ai/specialists/portfolio-raise-live-comparables.ts`, `artifacts/api-server/src/constants.ts`, `artifacts/api-server/src/migrations/seed-external-integrations.ts`  
**Acceptance:** `getPortfolioRaiseComparables()` is async; a live EDGAR row appears in the source citation when the API is reachable; fallback to canned data is clean when it isn't.

---

## Sequencing and Lane Assignment

```
Week 1 (parallel):
  CC-lane:  A0 → A1 → A2 (verification + pre-ops + fee subordination, smallest-to-largest risk)
  RA-lane:  B1 + B3 (capitalRaise3 form + seed defaults — independent of engine work)

Week 2 (parallel):
  CC-lane:  A3 → A4 (refi sizing → CFO investigation, sequenced by risk)
  RA-lane:  B2 (waterfall UI panel — B1 done, type already available)
  Either:   C1 (portfolio raise live comparables — patterns fully established)

Week 3:
  Either:   A5 (MINOR cleanup — low risk, maintenance)
  CC/RA:    Verify check gates, update proof suite baseline
```

**Hard dependencies:**
- A1 must complete before A2 (confirm gating approach is consistent; avoid double-fixing)
- A3 must complete before A4 (CFO investigation becomes simpler once refi proceeds are correct)
- B2 requires B1 to be shipped (capitalRaise3 form is adjacent UI context)
- C1 has no blocking dependencies

---

## Done Looks Like

**Track A:**
- `pnpm --filter @workspace/calc run test` — all proof tests pass including new ones for MAJOR-1, MAJOR-2, MAJOR-4, MAJOR-5
- `pnpm run typecheck` — clean
- Engine audit findings doc updated with `status: fixed` entries where resolved

**Track B:**
- `capitalRaise3Amount`/`capitalRaise3Date` fields visible and saveable in the Company Assumptions / Funding tab
- Property detail page shows LP/GP split for any property with `lpEquityPct` configured; null state renders cleanly otherwise
- Dev DB reseeded; H+ Analytics demo shows ≥ 4/6 properties with credible deal metrics

**Track C:**
- `getPortfolioRaiseComparables()` is async with live EDGAR source path
- Source citation in the portfolio specialist verdict references live URLs when available
- `check:magic-numbers`, `check:replit-independence`, `check:migration-guards`, `pnpm run typecheck` all pass

---

## Key Patterns to Follow

- **Engine fixes:** Always write the proof test first (pin the expected output with arithmetic derivation in comments); then fix the code; then run the full proof suite
- **Live comparables:** Follow `docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md` exactly — `isFulfilled<T>` type guard, `Promise.allSettled`, `AbortSignal.timeout`, minimum-row threshold, named constants with source citations
- **Seed changes:** `onConflictDoNothing()` upsert pattern per `docs/solutions/database-issues/seed-insert-no-conflict-financial-assumptions-lost-2026-05-02.md`; run `check:magic-numbers` after every seed file change
- **Frontend form wiring:** Follow the `capitalRaise1`/`capitalRaise2` field pattern exactly; do not add raw numeric literals
- **ADR-007:** No DB imports in specialist builder files; all DB access strictly in the route layer
