---
title: "Master Priority Plan: Engine Correctness → Demo Readiness → Research Depth → Taxonomy"
type: multi-track
status: active
date: 2026-05-05
origin: |
  Synthesis of:
  - docs/plans/2026-05-05-005-three-track-next-steps.md (master roadmap)
  - docs/plans/2026-05-05-006-feat-engine-investor-research-next-phase-plan.md (7 active units)
  - docs/plans/seed-defaults-optimization.md (seed tuning tasks)
  - docs/plans/number-taxonomy-and-assumption-lifecycle.md (taxonomy architecture)
  - Linear workspace scan (2026-05-05): all 10 issues are Canceled; NAI-23 noted as revivable tech debt
---

# Master Priority Plan: Engine Correctness → Demo Readiness → Research Depth → Taxonomy

## Context

This plan is a living roadmap synthesis — not an execution plan for a single sprint. It captures
every open work item across all active local plans and the Linear workspace, orders them by
dependency and risk tier, and describes what "done" looks like at each layer. Use it to route
individual ce-work runs: pick the highest-priority unblocked lane item, execute, mark it done
here, and advance to the next.

### What shipped before this plan

| Item | Source | Status |
|---|---|---|
| B1: capitalRaise3 form fields | plan-004 / plan-005 | ✅ Done |
| B3: DEFAULT_INTEREST_RATE = 0.075, SEED_DEBT_ASSUMPTIONS | plan-005 / seed-defaults T007 | ✅ Done |
| MAJOR-1: CFO identity proof | plan-006 | ✅ Done |
| MAJOR-3: PMT cap silent failure | plan-006 | ✅ Done |
| MAJOR-5: Pre-ops gating (taxes/insurance) | plan-006 | ✅ Done |
| MINOR-6: ANOI aggregator duplication | plan-006 | ✅ Done |
| MINOR-7: NOL summing in portfolio rollup | plan-006 | ✅ Done |
| Waterfall engine wiring (computeWaterfall → PropertyReturnMetrics) | plan-001 | ✅ Done |
| Knowledge Registry page (admin UI) | plan-002 | ✅ Done |
| Funding specialist engine grounding | plan-003 | ✅ Done |
| Portfolio capital raise specialist + 3-tranche DB | plan-004 | ✅ Done |
| Live specialist comparables: Revenue, Overhead, PropertyDefaults (NAI-33/34/35) | sprint | ✅ Done |
| analyst-intelligence-display skill + compound doc | session | ✅ Done |
| U1: MAJOR-2 refinance income-cap sizing | plan-006 | ✅ Done (CC) |
| L2-U5: Seed refi interest rate correction | seed-defaults T002 | ✅ Done |
| L2-U6: Seed company overhead calibration | seed-defaults T006 | ✅ Done |
| L4-U9: Portfolio raise live comparables (SEC EDGAR) | plan-006 U5 | ✅ Done |
| L4-U10: NAI-23 tryReserveAnalystCooldown CTE refactor | Linear NAI-23 | ✅ Done |
| L5-U11: Property income tax → getFactoryNumber | plan-006 U6 | ✅ Done |
| L5-U12: Transfer tax migration → market_rates table | plan-006 U7 | ✅ Done |
| U2: MAJOR-4 fee subordination gate proof + fix | plan-006 | ✅ Done (CC) |
| U3: Colombia seed tuning (exit caps + ADR) | plan-006 | ✅ Done (CC) |
| U4: Waterfall LP/GP panel + API gap fix | plan-006 | ✅ Done (CC) |

### Linear workspace status (2026-05-05 scan)

All 10 Linear issues are in **Canceled** state. The filter `nin: ["completed","cancelled"]` did
not exclude them because Linear uses `"canceled"` (one "l") — a known API quirk. One issue has
future relevance and is tracked below as revivable tech debt:

- **NAI-23** (Canceled) — "Refactor `tryReserveAnalystCooldown` to single-round-trip CTE"
  `artifacts/api-server/src/routes/analyst-admin.ts`,
  `artifacts/api-server/src/storage/intelligence/constants/watchdog.ts`
  Admission safety is preserved; only the `retryAfterMs` response number is approximate. Low
  urgency — candidacy for revival in Lane 4.

---

## Problem Frame

Four categories of residual debt survive the sprint:

1. **Two engine findings still unfixed (MAJOR-2, MAJOR-4)** — LP-facing IRR, DSCR, and
   refi proceeds remain potentially misleading. Every downstream consumer of `refinancingProceeds`
   or `feeIncentive` carries silent errors until these are resolved. They must be the first
   items any implementer touches.

2. **Demo-readiness gaps** — Seed values produce metrics that don't yet pass the "does this look
   like a real deal?" bar. Exit cap rates on US properties are 50–150bp above current market
   evidence (CBRE Q1-2026). Colombia ADRs sit below the luxury tier positioning. The waterfall
   UI panel is the only missing frontend surface — the API already returns `waterfallResult`.

3. **Research incompleteness** — The portfolio raise specialist is the only specialist without a
   live data path; every other specialist was wired in the NAI-33/34/35 sprint.

4. **Taxonomy hygiene debt** — Two number-taxonomy violations remain: `DEFAULT_PROPERTY_INCOME_TAX_RATE`
   masks a country-specific assumption behind a flat constant, and seven transfer-tax country
   rates are hardcoded literals in `exit-scenarios.ts` instead of residing in `market_rates`.

---

## Scope

### In Scope (ordered by lane)

**Lane 1 — Engine correctness (P0, blocks everything downstream)**
- MAJOR-2: Refinance income-cap sizing
- MAJOR-4: Incentive fee subordination (proof test + fix)

**Lane 2 — Seed & demo readiness (P1, run after Lane 1)**
- Seed tuning: exit cap rates, Colombia ADRs, per-property refi rates
- Company overhead and capital raise calibration
- Dev DB reseed + visual verification

**Lane 3 — Investor UI (P1, no engine dependency — can ship now)**
- Waterfall result UI panel

**Lane 4 — Research completeness (P2)**
- Portfolio raise live comparables (SEC EDGAR async)
- NAI-23: tryReserveAnalystCooldown CTE refactor (tech debt, revive from canceled)

**Lane 5 — Taxonomy hygiene (P2, schema-touching)**
- Property income tax → `getFactoryNumber`
- Transfer tax migration → `market_rates` table

### Out of Scope (Deferred — ADR-010 roadmap)

- LP-net IRR computation (full multi-year preferred return accrual)
- European waterfall variant user selection
- Specialist Q (Quitéria), Specialist R (Rafaela)
- Verdict cache wiring for portfolio capital raise specialist
- Per-property SPV structure modeling
- EU Eurostat HICP in inflation comparables (parsing complexity)
- `startOccupancy ?? 0.70` stress-test fallback (awaiting admin confirmation — taxonomy Q4)
- Seed reseed automation `--force` flag

---

## Lane 1 — Engine Correctness ✅ Complete

### L1-U1 · MAJOR-2: Refinance income-cap sizing ✅ Done (CC)

**Priority:** P0 — must ship first; blocks L1-U2 sequencing and all seed tuning  
**Depends on:** Nothing  
**Detail plan:** docs/plans/2026-05-05-006-feat-engine-investor-research-next-phase-plan.md § U1

**Problem:** `computeRefinance` passes `costBasisValue` (purchasePrice + improvements) as the
valuation input, instead of income-capitalization value (`NOI / exitCapRate`). This inflates
projected refinance proceeds for properties where cost basis exceeds income-cap value, and
understates them where the opposite holds. The existing proof test in
`artifacts/api-server/src/tests/proof/engine-integrity-fixes.test.ts` was written before the
formula was understood to be wrong — it passes under cost-basis for the chosen parameters.

**Formula:** `refiLoan = (yearlyNOI[refiYear] / exitCapRate) × refiLTV`  
Fallback to cost-basis (with `logger.warn`) when `yearlyNOI[refiYear] ≤ 0` — prevents
zero-proceed panic on pre-stabilized properties.

**Files:**
- Modify: `lib/engine/src/property/refinance-pass.ts` (change `property_value_at_refi`)
- Modify: `artifacts/api-server/src/tests/proof/engine-integrity-fixes.test.ts` (add distinguishing test)

**Distinguishing test:** Full-equity property with NOI=$500K, exitCapRate=0.08, refiLTV=0.65:
- Cost-basis path → `purchasePrice × 0.65` (wrong, depends on price)
- Income-cap path → `(500000 / 0.08) × 0.65 = $4,062,500` (correct, income-driven)
Both scenarios must coexist; existing NOI=0 test stays.

**Verification:**
- `pnpm --filter @workspace/calc run test` — PASS including new distinguishing test
- `pnpm run typecheck` — clean
- Engine audit doc updated: `status: fixed` for MAJOR-2

---

### L1-U2 · MAJOR-4: Incentive fee subordination proof test + fix ✅ Done (CC)

**Priority:** P0  
**Depends on:** L1-U1 (review after refi fix, ensure ANOI chain is stable)  
**Detail plan:** docs/plans/2026-05-05-006-feat-engine-investor-research-next-phase-plan.md § U2

**Problem:** The incentive fee accrues on a pre-debt-service proxy (ANOI or GOP) rather than
post-debt-service levered cash. A property with positive GOP but DSCR < 1 can still accrue
incentive fees, which is economically incorrect — incentive fees are subordinated to debt service
in every standard hospitality management agreement.

**Formula:**
```
leveredCash = anoi - interestExpense - principalPayment
feeIncentive = Math.max(0, Math.min(gop, Math.max(0, leveredCash)) × incentiveFeeRate)
```
`Math.min(gop, leveredCash)` bounds the incentive base so it never exceeds GOP when
levered cash happens to be larger.

**Files:**
- Modify: `lib/engine/src/property/property-engine.ts` (every `gop * ctx.incentiveFeeRate` occurrence — grep at implementation time)
- Modify: `artifacts/api-server/src/tests/proof/engine-integrity-fixes.test.ts` (add `describe('Finding #4')` block — currently missing)

**Distinguishing test:** Property with GOP=$300K, interestExpense=$350K (DSCR < 1):
- Pre-debt-service path → `feeIncentive = $300K × rate` (wrong, positive)
- Levered-cash path → `feeIncentive = 0` (correct, subordinated)

**Verification:**
- `pnpm --filter @workspace/calc run test` — PASS
- Engine audit doc: `status: fixed` for MAJOR-4

---

## Lane 2 — Seed & Demo Readiness ✅ Partially complete (U3 done)

**Sequencing:** L1 is complete. U3 (exit caps + ADRs) shipped with CC's sprint. Seed values must be tuned against the
corrected engine — tuning before MAJOR-2/4 are fixed will produce wrong target metrics.

### L2-U3 · Seed exit cap rate calibration ✅ Done (CC)

**Priority:** P1  
**Depends on:** L1-U1, L1-U2  
**Source:** seed-defaults plan T003 + plan-006 U3

**Changes:**

| Property | Current `exitCapRate` | Target | Rationale |
|---|---|---|---|
| Jano Grande Ranch (CO) | 0.10 | 0.10 | Keep — Colombia market evidence |
| Loch Sheldrake (NY) | 0.09 | 0.075 | Catskills luxury resort, CBRE Q1-2026: 7.0–8.0% |
| Belleayre Mountain (NY) | 0.085 | 0.075 | Western Catskills four-season, same comp |
| Scott's House (UT) | 0.085 | 0.075 | Wasatch luxury lodge, Mountain West |
| San Diego/Cartagena (CO) | 0.09 | 0.095 | Historic Cartagena boutique — LatAm premium |
| Lakeview Haven Lodge (UT) | 0.08 | 0.075 | Pineview Reservoir, Mountain West |

Values must be named `SEED_*` constants — no raw literals. Run `check:magic-numbers` after.

**Files:**
- Modify: `artifacts/api-server/src/seeds/property-data.ts`

---

### L2-U4 · Seed Colombia ADR adjustment ✅ Done (CC)

**Priority:** P1  
**Depends on:** L1-U1, L1-U2  
**Source:** seed-defaults plan T004

**Changes:**
- Jano Grande: `startAdr: 250` → `280` (Antioquia coffee-country luxury hacienda, STR/AirDNA Q1-2026 comp range $220–$320)
- San Diego/Cartagena: `startAdr: 240` → `310` (historic Cartagena walled city luxury, comp range $280–$450)

**Files:**
- Modify: `artifacts/api-server/src/seeds/property-data.ts`

---

### L2-U5 · Seed refinance interest rate correction ✅ Done

**Priority:** P1  
**Depends on:** L1-U1, L1-U2  
**Source:** seed-defaults plan T002

**Change:** `refinanceInterestRate: 0.09` (all properties) → `0.07` US / `0.085` Colombia.
Current 9% is acquisition bridge pricing; stabilized refinance in 2029–2031 against 4.5% 10yr
Treasury + 200bp spread = ~6.5–7.0%.

**Note:** These are property-level seed values, not `DEFAULT_*` constants. No new named constant
is needed unless the same value appears in ≥ 3 files with identical semantics.

**Files:**
- Modify: `artifacts/api-server/src/seeds/property-data.ts`

---

### L2-U6 · Seed company overhead calibration ✅ Done

**Priority:** P1 (conditional — run T001 audit first to confirm need)  
**Depends on:** L1-U1, L1-U2, L2-U3..U5 (tune after corrected engine)  
**Source:** seed-defaults plan T006

**Changes (conditional on audit output):**
- `marketingRate: 0.05` → `0.03` in `seedGlobalAssumptions` (5% of company revenue is aggressive for seed-stage with 1–2 clients in Y1)
- Verify `miscOpsRate: 0.03` — likely keep

**Files:**
- Modify: `artifacts/api-server/src/seeds/properties.ts`

---

### L2-U7 · Dev DB reseed and verification

**Priority:** P1  
**Depends on:** L2-U3..U6  
**Source:** seed-defaults plan T008

**Steps:**
1. `pnpm --filter @workspace/api-server exec tsx src/seed.ts --force`
2. Open H+ Analytics dashboard — verify:
   - ≥ 4/6 active properties show positive stabilized NOI
   - Company Funding tab shows break-even trajectory by Y3–Y4
   - At least one property with levered IRR ≥ 15% visible
3. `pnpm run typecheck` + `check:magic-numbers` — clean

---

## Lane 3 — Investor UI ✅ Complete

### L3-U8 · Waterfall LP/GP panel + API gap fix ✅ Done (CC)

**Priority:** P1 — no engine dependency; data already returned by API  
**Depends on:** Nothing (waterfallResult already in API response)  
**Detail plan:** docs/plans/2026-05-05-006-feat-engine-investor-research-next-phase-plan.md § U4

**Goal:** Render the already-typed `waterfallResult` in a compact read-only panel in the property
detail page. Show LP/GP economics with a clean null state when waterfall is not configured.

**Component:** `WaterfallPanel.tsx` — reads: LP equity %, preferred return (target vs satisfied),
LP total return, LP multiple, GP total return, GP multiple.

**Null state:** When `waterfallResult === null` or `lpEquityPct` not set: "Waterfall not
configured — add LP equity % and tranche structure in property settings."

**Files:**
- Create: `artifacts/hospitality-business-portal/src/components/property/WaterfallPanel.tsx`
- Modify: property detail surface (grep `waterfallResult` or the Returns/Executive Summary component)

**Patterns:**
- `artifacts/hospitality-business-portal/src/hooks/useServerFinancials.ts` for `waterfallResult` type
- Existing read-only financial panel components for layout/typography

**Test scenarios:**
- Happy path: property with `lpEquityPct = 0.80`, `waterfallResult` populated → all fields render
- Empty state: `waterfallResult === null` → soft message, no error thrown
- Edge: `lp_multiple = 0` (distressed deal) → renders "0.00×" not NaN/blank

---

## Lane 4 — Research Completeness + Tech Debt

### L4-U9 · Portfolio raise live comparables (SEC EDGAR) ✅ Done

**Priority:** P2  
**Depends on:** Nothing (no engine dependency)  
**Detail plan:** docs/plans/2026-05-05-006-feat-engine-investor-research-next-phase-plan.md § U5

**Goal:** Convert `getPortfolioRaiseComparables()` from synchronous/canned to async with a live
SEC EDGAR Form D source; canned fallback when live row count < threshold.

**Pattern:** Follow `docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md`
exactly — `isFulfilled<T>` type guard, `Promise.allSettled`, `AbortSignal.timeout(8000)`,
minimum-row threshold (≥ 3), named constants for all thresholds.

**Files:**
- Modify: `artifacts/api-server/src/ai/specialists/portfolio-raise-live-comparables.ts`
- Modify: `artifacts/api-server/src/constants.ts` (two new `LIVE_*` constants)

**Callers:** Update all `getPortfolioRaiseComparables()` call sites to `await`.

---

### L4-U10 · Revive NAI-23: tryReserveAnalystCooldown CTE refactor ✅ Done

**Priority:** P2 (tech debt — admission safety preserved; only retryAfterMs is approximate)  
**Depends on:** Nothing  
**Source:** Linear NAI-23 (Canceled — revive)

**Problem:** `tryReserveAnalystCooldown` in
`artifacts/api-server/src/routes/analyst-admin.ts` does a second SELECT after the UPSERT to
compute `retryAfterMs`. A third in-flight request can refresh the row between those two
statements, returning a stale (sometimes >60s) hint. Admission safety is preserved — only the
cooldown hint is wrong.

**Fix:** Emit a single CTE returning `{granted, reserved_at}` so both the lock decision and
the timestamp come from the same database statement.

**Also touches:** `artifacts/api-server/src/storage/intelligence/constants/watchdog.ts`

**Test scenario:** Two concurrent requests at the cooldown boundary — only one is granted; the
rejected request's `retryAfterMs` matches the actual reservation time within ±1s.

---

## Lane 5 — Taxonomy Hygiene

### L5-U11 · Retire DEFAULT_PROPERTY_INCOME_TAX_RATE → getFactoryNumber ✅ Done

**Priority:** P2  
**Depends on:** Nothing (isolated to engine/route layer)  
**Detail plan:** docs/plans/2026-05-05-006-feat-engine-investor-research-next-phase-plan.md § U6
**Architecture authority:** docs/plans/number-taxonomy-and-assumption-lifecycle.md § Country-specific rates

**Problem:** `DEFAULT_PROPERTY_INCOME_TAX_RATE` is a flat constant masking country-specific
variation. Colombia, Mexico, US, Brazil all have different property income tax structures.
The engine already carries `property.country` — there is no reason to flatten this to one number.

**Fix:** Replace `?? DEFAULT_PROPERTY_INCOME_TAX_RATE` fallbacks with
`?? getFactoryNumber('taxRate', property.country ?? 'United States')`.
Keep the constant export as a deprecated alias pointing to the US value for one session, then
remove it in a follow-up.

**Risk:** `lib/engine` importing `getFactoryNumber` from `lib/shared` — verify no circular import.
`PropertyInput` already carries `country` field (confirmed by seed-data usage).

**Files:**
- Modify: `lib/engine/src/property/property-engine.ts` (or wherever `DEFAULT_PROPERTY_INCOME_TAX_RATE` is consumed — grep at implementation time)
- Modify: `lib/shared/src/constants.ts` (deprecate the constant)

---

### L5-U12 · Transfer tax migration → market_rates table ✅ Done

**Priority:** P2  
**Depends on:** Nothing (independent DB migration)  
**Detail plan:** docs/plans/2026-05-05-006-feat-engine-investor-research-next-phase-plan.md § U7
**Architecture authority:** docs/plans/number-taxonomy-and-assumption-lifecycle.md § Category 4 (TABLE-SOURCED)

**Problem:** Seven transfer-tax country rates are hardcoded literals in `exit-scenarios.ts`.
Per the number taxonomy, authority-dictated jurisdiction-specific rates are Category 4 —
they belong in `market_rates`, not code.

**Seven rate keys (stored as percentage points × 100, read-site divides by 100):**
`transfer_tax_default`, `transfer_tax_us`, `transfer_tax_mexico`, `transfer_tax_netherlands`,
`transfer_tax_uk`, `transfer_tax_france`, `transfer_tax_spain`

**Pattern:** Use `market_rates` table with `isManual=true` (authority-rate pattern, same as
ERP / CPI band delta migration). Route layer resolves rates in parallel (`Promise.all`) before
calling `computeExitScenarios`; missing rate row → logged warning + bootstrap constant fallback,
never 500.

**ADR-007 discipline:** No storage imports in calc/engine libraries; rates resolved in route layer
and passed as parameters.

**Files:**
- Create: migration file in `lib/db/migrations/`
- Modify: `artifacts/api-server/src/seeds/market-rates.ts` (add 7 seed rows)
- Modify: `artifacts/api-server/src/routes/finance.ts` (resolve rates before engine call)
- Modify: `lib/engine/src/property/exit-scenarios.ts` (accept rates as parameter, remove inline literals)

**Test scenarios:**
- Happy path: Netherlands property exit → uses `transfer_tax_netherlands` from market_rates (0.108)
- Fallback: row missing for a country → logged warning + bootstrap constant used
- Edge: `transferTaxRates` map empty → all countries fall back to bootstrap

**Verification:**
- `grep -r TRANSFER_TAX_RATE` returns only bootstrap fallback constants — no inline literals
- `check:magic-numbers` PASS
- Admin market-data endpoint shows 7 new rate rows

---

## Roadmap Horizon (ADR-010 — Not Planned Here)

These items are tracked in `docs/plans/2026-05-05-005-three-track-next-steps.md` as explicitly
deferred. Do not plan or execute these without a new brainstorm / ce-plan session:

| Item | ADR reference | Why deferred |
|---|---|---|
| LP-net IRR (multi-year preferred return accrual) | ADR-010 Phase 1 | Requires new waterfall accrual model |
| European waterfall variant | ADR-010 | User-configurable selection; v1 uses European framing as default |
| Specialist Q (Quitéria) | ADR-010 roadmap | New specialist domain — not yet scoped |
| Specialist R (Rafaela) | ADR-010 roadmap | New specialist domain — not yet scoped |
| Verdict cache wiring (portfolio-raise specialist) | plan-004 follow-up | Separate packet |
| Per-property SPV structure modeling | plan-004 scope | Out of v1 scope |
| `startOccupancy ?? 0.70` fallback | taxonomy Q4 | Awaiting admin confirmation |
| EU Eurostat HICP inflation | NAI-34 comments | Parsing complexity deferred |

---

## Sequencing Summary

```
Now (parallel, independent):
  L3-U8   — Waterfall UI panel          (no dependencies)
  L4-U10  — NAI-23 CTE refactor         (no dependencies)

Now (correctness first):
  L1-U1   — MAJOR-2 refinance income-cap
  L1-U2   — MAJOR-4 fee subordination   (after L1-U1 stable)

After L1-U1 + L1-U2:
  L2-U3   — Seed exit cap calibration   \
  L2-U4   — Seed Colombia ADR           | parallel seed tuning
  L2-U5   — Seed refi interest rates    /
  L2-U6   — Company overhead (conditional on audit)
  L2-U7   — Reseed + verify             (after L2-U3..U6)

Anytime (no dependencies):
  L4-U9   — Portfolio raise live comparables (SEC EDGAR)
  L5-U11  — Property income tax → getFactoryNumber
  L5-U12  — Transfer tax migration → market_rates
```

---

## Key Patterns to Follow

- **Engine fixes:** Write the proof test first (pin expected output with arithmetic derivation in
  comments); fix the code; run full proof suite. Never fix without a distinguishing test.
- **Live comparables:** Follow `docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md`
  exactly — `isFulfilled<T>`, `Promise.allSettled`, `AbortSignal.timeout`, minimum-row threshold.
- **Seed changes:** `onConflictDoNothing()` upsert pattern per
  `docs/solutions/database-issues/seed-insert-no-conflict-financial-assumptions-lost-2026-05-02.md`;
  run `check:magic-numbers` after every seed file change.
- **Taxonomy / market_rates:** ADR-007 strict — no DB imports in calc/engine; all resolution
  happens in the route layer and is passed as parameters to engine functions.
- **Analyst intelligence display:** Any new verdict panel must follow
  `docs/solutions/architecture-patterns/analyst-intelligence-display-pattern-2026-05-05.md` —
  100% specialist-sourced, no local range derivation.

---

## Global Verification Gates (run after each lane)

- `pnpm run typecheck` — clean
- `pnpm --filter @workspace/calc run test` — PASS
- `pnpm --filter @workspace/scripts run check:magic-numbers` — PASS
- `pnpm --filter @workspace/scripts run check:replit-independence` — PASS
- `pnpm --filter @workspace/scripts run check:migration-guards` — PASS
- `pnpm run check:lint` — clean

---

## Sources & References

- Origin plans: `docs/plans/2026-05-05-005-three-track-next-steps.md`, `docs/plans/2026-05-05-006-feat-engine-investor-research-next-phase-plan.md`
- Seed tuning: `docs/plans/seed-defaults-optimization.md`
- Taxonomy: `docs/plans/number-taxonomy-and-assumption-lifecycle.md`
- Engine audit: `docs/solutions/logic-errors/financial-engine-audit-findings-2026-05-04.md`
- Live comparables pattern: `docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md`
- Intelligence display pattern: `docs/solutions/architecture-patterns/analyst-intelligence-display-pattern-2026-05-05.md`
- ADR-010 (waterfall/LP-IRR roadmap): referenced in plan-001, plan-004, plan-005
- Linear workspace: all 10 issues Canceled; NAI-23 revived as L4-U10
