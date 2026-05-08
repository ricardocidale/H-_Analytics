---
title: "feat: Property Portfolio Capital Raise Specialist + Variable Tranche Count"
type: feat
status: completed
date: 2026-05-05
---

# feat: Property Portfolio Capital Raise Specialist + Variable Tranche Count

## Summary

Two related workstreams shipped as one plan because they share the ADR-007 specialist pattern and PE/hospitality domain context. **Phase A** extends the existing mgmt-co funding specialist to support up to three engine-determined tranches — removing the 2-tranche infrastructure constraint so the analyst can reason about seed → launch → scale structures consistent with industry norms. **Phase B** introduces a new greenfield `portfolio.capitalRaise` specialist that analyzes the LP equity raise strategy for the property portfolio itself: per-property equity needed, acquisition timeline alignment, concurrent ramp exposure, DSCR sustainability, and achievable IRR — all grounded in engine-computed property financials rather than abstract LP reasoning.

---

## Problem Frame

The current mgmt-co funding specialist silently caps its reasoning at two tranches because the DB, engine, and route layer all hardcode `capitalRaise1` / `capitalRaise2` slots. The engine already computes 1–3 tranches dynamically; the surrounding infrastructure just doesn't surface the third. Separately, no specialist exists for the property portfolio raise — the equity required to acquire, renovate, and ramp the actual investment properties. The management company raise funds operations; the portfolio raise funds acquisitions. These are distinct LP-facing analyses with different metrics, different waterfall structures, and different risk profiles.

---

## Requirements

- R1. The mgmt-co funding specialist must support three-tranche structures at every layer (DB, engine input, FundingAnalysisSummary, prompt)
- R2. Tranche count must emerge from engine calculations and PE industry norms, not from infrastructure limits
- R3. The new portfolio specialist must produce a 5-dimension LP-grade verdict grounded in engine-computed per-property equity needs
- R4. The portfolio specialist must quantify: total equity required (range), first-close minimum, blended DSCR, ramp overlap capital exposure, and achievable levered IRR
- R5. Both specialists must follow ADR-007: no DB imports in builder files; DB mapping strictly in the route layer
- R6. Silent-field-drop prevention is mandatory for every new context field: grep coverage check + prompt content unit test
- R7. v1 uses single-shot Opus and a canned LP comparables dataset (no verdict cache, no N+1 panels)
- R8. Engine integrity caveats (MAJOR-2 refi sizing, MAJOR-5 pre-ops gating) must be surfaced in the portfolio specialist's prompt grounding so Opus does not over-rely on affected fields
- R9. The portfolio specialist registers in the flat Intelligence accordion list, not as a new sidebar group

---

## Scope Boundaries

- The engine integrity bugs (MAJOR-1 through MAJOR-5) are not fixed in this plan — the portfolio specialist's prompt explicitly calls them out as grounding limitations
- No new DB columns for portfolio-level user targets in v1 — the specialist is analysis-first (derives everything from engine + existing property data)
- No LP comparable database; v1 ships with a canned dataset (same pattern as mgmt-co v1)
- No verdict cache for either specialist in this plan (G6-P3 pattern is a separate packet)
- No N+1 panels (single-shot Opus throughout)
- UI form for entering a third tranche's amount/date is deferred; DB columns are added, but the form field wiring is a separate frontend task
- More than 3 tranches is deferred — engine already caps at 3 and PE norms rarely exceed 3 for management company raises
- European vs. American waterfall selection is not a user-configurable input in v1 — the specialist reasons using European waterfall framing as the institutional LP default

### Deferred to Follow-Up Work

- Frontend form field for `capitalRaise3Amount` / `capitalRaise3Date` — DB columns land here but form wiring is a separate PR
- Verdict cache wiring for portfolio specialist — follow-up in G6-P3 packet
- Per-property SPV structure modeling (LPA docs, equalization math) — domain expansion after v1 validates utility

---

## Context & Research

### Relevant Code and Patterns

**ADR-007 three-layer DI pattern (canonical reference):**
- `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md`
- Route (`analyst-admin.ts`) fetches DB + engine output → slim summary type → builder (pure) → runner
- Builders must carry zero DB/LLM/HTTP imports — type boundary is enforced by convention, not compiler

**Silent field drop risk (high-severity prior incident):**
- `docs/solutions/logic-errors/reference-brands-dropped-from-llm-prompt-2026-05-02.md`
- Mandatory prevention: `grep -n "fieldName" <prompt-file>.ts` after every context field addition, plus a prompt content unit test

**Engine integrity caveat (affects portfolio grounding):**
- `docs/solutions/logic-errors/financial-engine-audit-findings-2026-05-04.md`
- MAJOR-2: refi proceeds mis-sized (cost basis, not income cap) — affects LP equity-at-refi projections
- MAJOR-5: pre-ops taxes/insurance gated on `isOperational` not `isAcquired` — understates pre-opening carry costs
- These fields should not be used as precise LP-facing figures; the portfolio specialist prompt must hedge accordingly

**Existing specialist to mirror (mgmt-co funding):**
- `artifacts/api-server/src/ai/specialists/mgmt-co-funding-prompt-input-builder.ts` — slim type pattern, DIMENSION_KEYS const, pure builder
- `artifacts/api-server/src/ai/specialists/mgmt-co-funding-runner.ts` — runner pattern, DIMENSION_FIELDS form anchors
- `artifacts/api-server/src/ai/specialists/mgmt-co-funding-prompt.ts` — system/user prompt builders, engine analysis serialization
- `artifacts/api-server/src/routes/analyst-admin.ts` — `runFundingV1Path()` (lines ~603–763) for route wiring pattern

**Engine helpers for per-property equity computation:**
- `lib/engine/src/debt/equityCalculations.ts` — `totalPropertyCost()`, `propertyEquityInvested()`, `acqMonthsFromModelStart()`
- `lib/engine/src/funding/funding-predictor.ts` — `analyzeFundingNeeds()`, `buildTranches()` (dynamic 1–3 logic), `FundingGlobalInput`

**Tranche decision logic in engine (buildTranches):**
- 1 tranche: `periodLength ≤ 18 months` OR `totalRaise ≤ $400K`
- 3 tranches: `periodLength > 48 months` AND `tranche2Amount > $500K`
- 2 tranches: all other cases
- All thresholds come from named constants in `lib/shared/src/constants-funding.ts`

**UI registration precedent:**
- `docs/solutions/architecture-patterns/intelligence-specialists-page-2026-05-02.md`
- Flat accordion list, one row per specialist, no new sidebar group

**DB schema (properties and globalAssumptions):**
- `lib/db/src/schema/config.ts` — `capitalRaise1Amount`, `capitalRaise1Date`, `capitalRaise2Amount`, `capitalRaise2Date` (the current 2-tranche limit)
- `lib/db/src/schema/properties.ts` — `purchasePrice`, `acquisitionLTV`, `buildingImprovements`, `preOpeningCosts`, `operatingReserve`, `operationsStartDate` — all available for equity computation

### Institutional Learnings

- ADR-007 three-layer DI: enforced by convention, not compiler — every field addition must be manually verified through all three layers
- Silent drop is the #1 defect class for this pattern; grep + prompt content test are non-negotiable
- MAJOR-2 (refi sizing) and MAJOR-5 (pre-ops gating) affect portfolio specialist grounding — hedge explicitly in system prompt
- Seed idempotency: any new DB columns must use an idempotent UPDATE migration, not a seed extension

### External References

**PE/Hospitality LP norms (from external research):**
- Management company tranche structure: Seed (12–18 months burn, pre-first-property) → Launch (first contract signed) → Scale (OpCo EBITDA breakeven)
- Portfolio fund: first close at 30–50% of total, 1–3 sub-closes, final close 12–24 months after first
- DSCR lender floor: 1.25x at base case NOI; debt yield floor: 10–13% (NOI ÷ loan)
- LTV range: 55–65% of stabilized value (not cost)
- Boutique luxury value-add IRR target: 12–18% levered; equity multiple 1.8–2.2x
- LP preferred return: 8% non-compounded is market standard; GP carry: 20%
- Ramp to stabilization: 12–24 months acquisitions/repositionings; occupancy Year 1 is 10–20 points below stabilized
- First close minimum is determined by: max(30% of total fund, equity needed for first property acquisition)
- Concentration limit: single asset ≤ 20–25% of total fund — implies minimum fund size

---

## Key Technical Decisions

- **3-column extension over JSONB array for tranche 3**: Adding `capitalRaise3Amount` / `capitalRaise3Date` columns follows the established `capitalRaise1/2` pattern, preserves Drizzle column typing, and requires no migration for callers that use only slots 1–2. A JSONB array would support unlimited tranches but breaks the column pattern, loses Drizzle type safety, and is premature given the engine's 3-tranche cap. Revisit only if PE norms evolve toward 4+ tranches.

- **Portfolio specialist is analysis-first (no new user-saved columns required for v1)**: The 5 portfolio dimensions are derived entirely from engine-computed property data + LP industry benchmarks. This avoids a new DB table or additional globalAssumptions columns for v1 and lets the specialist tell the user what their portfolio implies rather than evaluating targets they don't yet know. New user-configurable portfolio targets (IRR target, preferred return, etc.) can be added in v2 once the specialist proves utility.

- **New engine function `analyzePortfolioCapitalRaise()` rather than extending `analyzeFundingNeeds()`**: The two analyses have different input shapes (per-property equity schedule vs. company monthly cash flows) and different output semantics (acquisition equity deployment vs. operating capital runway). Extending the existing function would conflate these. The new function lives alongside `analyzeFundingNeeds` in `lib/engine/src/funding/`.

- **Canned LP comparables dataset for v1**: Same pattern as mgmt-co v1. Live deal data (PitchBook / PrivateEquityInfo) is deferred to G6-P3. The canned dataset primes the prompt enough for Opus to produce conviction-calibrated output.

- **European waterfall framing as default**: The institutional LP base for boutique luxury funds strongly prefers whole-fund return of capital before GP promote. American-style waterfall (deal-by-deal carry) is deferred. The system prompt instructs Opus to frame waterfall analysis from a European-style default and flag if the user's target structure implies American-style.

- **Engine integrity caveats embedded in prompt, not silently swallowed**: MAJOR-2 (refi proceeds) and MAJOR-5 (pre-ops carry) are surfaced in the portfolio system prompt as explicit grounding hedges. The specialist is instructed not to treat refi-at-exit equity as precise or pre-opening carrying cost as complete.

- **`trancheGapMonths` remains a scalar in mgmt-co specialist**: For 3-tranche structures, `trancheGapMonths` represents the gap between tranche 1 and tranche 2 (the most LP-visible scheduling question). Tranche 2→3 gap is surfaced as narrative context in the specialist's reasoning, not as a separate dimension. This avoids breaking the 5-dimension output schema.

---

## Open Questions

### Resolved During Planning

- **Should the portfolio specialist have 5 user-configurable dimensions or engine-derived dimensions?** → Engine-derived (analysis-first) for v1. User-configurable targets (IRR, pref return) can be added in v2 with a new DB migration.
- **JSONB array vs. additional columns for tranche 3?** → Additional columns (`capitalRaise3Amount`, `capitalRaise3Date`), following existing pattern. Simpler migration, full Drizzle typing.
- **One plan or two?** → One plan; the domain context and ADR-007 pattern are shared. Phased delivery separates the two workstreams clearly.
- **Should `deriveTrancheGapMonths()` become an array?** → No for this plan. Keep it as a scalar (gap between T1 and T2). The prompt layer can narrate T2→T3 timing from the engine's tranche array. Avoids schema break.

### Deferred to Implementation

- Whether `FundingAnalysisSummary.trancheCount` should be added explicitly or left as `tranches.length` — check if any prompt logic needs the count as a standalone field.
- Exact constant thresholds for the portfolio specialist's hardcoded LP benchmarks (e.g., DSCR floor, IRR band) — establish from the external research table in this plan; implementer should extract to a `constants-portfolio-raise-benchmarks.ts` file following the pattern of `constants-funding.ts`.
- Whether `runPortfolioRaiseV1Path()` belongs in `analyst-admin.ts` or a new `analyst-portfolio.ts` route file — `analyst-admin.ts` is growing large; if it exceeds ~1500 lines after Phase A, the implementer should extract the new function to a dedicated file.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Data Flow — Phase A (Variable Tranche Count)

```
DB: globalAssumptions
  capitalRaise1Amount / capitalRaise1Date
  capitalRaise2Amount / capitalRaise2Date
  capitalRaise3Amount / capitalRaise3Date  ← NEW

gaToGlobalInput()  [analyst-admin.ts]
  → GlobalInput { ..., capitalRaise3Amount?, capitalRaise3Date? }  ← extended

analyzeFundingNeeds(companyMonthly, globalInput)
  → FundingAnalysis { tranches: [T1, T2?, T3?] }   ← already dynamic

Route slim mapping:
  → FundingAnalysisSummary { tranches: [{ amountUsd, monthIndex }]  }  ← array already; no change

buildFundingSystemPrompt()  ← updated: add N-tranche PE reasoning guidance
buildFundingUserPrompt()    ← already serializes all tranches from array
```

### Data Flow — Phase B (Portfolio Specialist)

```
DB: properties[]
  purchasePrice, acquisitionLTV, buildingImprovements,
  preOpeningCosts, operatingReserve, operationsStartDate...

generatePropertyProForma(property, global)  ← existing per property
  → MonthlyFinancials[]

analyzePortfolioCapitalRaise(properties, proFormas, global)  ← NEW
  → PortfolioCapitalRaiseAnalysis {
      perPropertyEquity: [{ propertyId, equityRequired, deploymentMonth }]
      totalEquityRequired: number
      firstCloseMinimum: number          // max(30% of total, property1 equity)
      rampOverlapMonths: [{ startMonth, endMonth, concurrentCount }]
      portfolioDscr: { blended, byProperty }
      impliedIrr: number | null
      acquisitionTranches: PortfolioTranche[]
    }

Route slim mapping → PortfolioRaiseAnalysisSummary  (route layer, non-fatal)

portfolio-raise-prompt-input-builder.ts  (pure)
  → PortfolioRaisePromptInputContext { analysisSummary, persona, comparables }

portfolio-raise-prompt.ts
  → buildPortfolioRaiseSystemPrompt()    // Analyst persona, LP-grade framing, PE waterfall norms
  → buildPortfolioRaiseUserPrompt()      // Per-property equity table, ramp schedule, tranche plan

portfolio-raise-runner.ts → Opus → PortfolioRaiseOutputSchema (5 dimensions + overallNarrative)
```

### 5 Portfolio Raise Dimensions

| Key | Unit | Primary Question | LP Benchmark |
|-----|------|-----------------|--------------|
| `totalEquityRequired` | USD | Is the engine-computed equity need achievable as a fund? | Concentration: 1 asset ≤ 25% of total fund |
| `firstCloseMinimum` | USD | Is the minimum first close sized to deploy into Property 1 on schedule? | Industry standard: 30–50% of total fund |
| `portfolioDscr` | ratio | Does the portfolio sustain DSCR ≥ 1.25× at base-case NOI across stabilized properties? | Lender floor: 1.25× base; stress break: 1.0× |
| `rampCapitalBuffer` | months | How many months of working capital cover concurrent pre-stabilization cash burn? | Minimum: cover longest overlap window + 3 months |
| `achievableIrr` | % (decimal) | What levered IRR can this portfolio realistically deliver to LPs given NOI + cap rates? | Boutique luxury value-add: 12–18% (0.12–0.18) |

---

## Implementation Units

---

### Phase A: Variable Tranche Count (mgmt-co funding specialist)

- U1. **DB migration — third tranche slot on globalAssumptions**

**Goal:** Add `capitalRaise3Amount` and `capitalRaise3Date` columns to the `global_assumptions` table so users and the engine can configure a third management-company raise tranche.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `lib/db/src/schema/config.ts`
- Create: migration file following repo convention (e.g., `lib/db/src/migrations/0035_add_capital_raise_3.sql` or the numbered migration pattern in use)
- Modify: `lib/db/dist/` (rebuild artifacts if automated; note to implementer)

**Approach:**
- Add `capitalRaise3Amount: real("capital_raise_3_amount")` (nullable — most users have ≤ 2 tranches)
- Add `capitalRaise3Date: text("capital_raise_3_date")` (nullable — same pattern as `capitalRaise1Date`)
- Migration must be idempotent (ADD COLUMN IF NOT EXISTS) per the seed-idempotency learning
- No Zod schema change is required if the insert schema uses `omit` or `.partial()`; verify

**Patterns to follow:**
- `capitalRaise1Amount` and `capitalRaise2Amount` columns in `lib/db/src/schema/config.ts`
- Existing migration numbering in `lib/db/src/migrations/`

**Test scenarios:**
- Test expectation: none — pure schema migration with no behavioral change. The route and engine units (U2) carry the behavioral coverage.

**Verification:**
- New columns appear in the Drizzle inferred type for `globalAssumptions`
- An existing user row can be read without error (nullable columns default to null)
- `pnpm typecheck` passes

---

- U2. **Engine input + currentFunding — sum all three tranche slots**

**Goal:** Extend `FundingGlobalInput` and `gaToGlobalInput()` to carry the third tranche, and update `currentFunding` in `analyzeFundingNeeds()` to sum all non-null configured amounts.

**Requirements:** R1, R2

**Dependencies:** U1

**Files:**
- Modify: `lib/engine/src/funding/funding-predictor.ts` — `currentFunding` computation
- Modify: `artifacts/api-server/src/routes/analyst-admin.ts` — `gaToGlobalInput()` helper (lines ~114–126)
- Modify: `lib/engine/src/types.ts` or the `FundingGlobalInput` interface in `funding-predictor.ts` — add optional `capitalRaise3Amount`, `capitalRaise3Date`

**Approach:**
- `FundingGlobalInput` already extends `GlobalInput` with optional funding fields; add `capitalRaise3Amount?: number` and `capitalRaise3Date?: string`
- In `funding-predictor.ts`, update `currentFunding` from `(global.capitalRaise1Amount ?? 0) + (global.capitalRaise2Amount ?? 0)` to sum all three non-null slots
- In `gaToGlobalInput()` in `analyst-admin.ts`, map `overlaidGa.capitalRaise3Amount` and `capitalRaise3Date` into the returned `GlobalInput`
- No change to the `buildTranches()` decision logic — the engine already computes the optimal tranche count dynamically

**Patterns to follow:**
- Existing `capitalRaise1Amount` / `capitalRaise2Amount` handling in `gaToGlobalInput()` and `funding-predictor.ts`

**Test scenarios:**
- Happy path: 3-tranche globalAssumptions (all 3 amounts set) → `currentFunding` equals sum of all 3
- Edge case: `capitalRaise3Amount = null` → `currentFunding` equals sum of slots 1 and 2 (no regression for existing users)
- Edge case: `capitalRaise3Amount = 0` → treated as zero, not omitted

**Verification:**
- `currentFunding` correctly sums all populated tranche slots
- Existing 2-tranche users see no change in analysis output
- `pnpm typecheck` passes on engine and api-server packages

---

- U3. **Mgmt-co funding specialist prompt — N-tranche PE reasoning**

**Goal:** Update `buildFundingSystemPrompt()` and `buildFundingUserPrompt()` to reason about 1–3 tranche structures from PE/hospitality industry norms rather than assuming a fixed 2-tranche structure.

**Requirements:** R1, R2, R6

**Dependencies:** U2

**Files:**
- Modify: `artifacts/api-server/src/ai/specialists/mgmt-co-funding-prompt.ts`
- Modify: `artifacts/api-server/src/tests/mgmt-co-funding-prompt.test.ts`

**Approach:**
- In `buildFundingSystemPrompt()`: add a section explaining the three management-company tranche archetypes:
  - **Seed** (1 tranche): ≤18 months projected pre-first-property burn; raise covers runway to first signed management agreement
  - **Launch** (2 tranches): first property coming online; T1 funds pre-opening, T2 at 60–65% occupancy milestone
  - **Scale** (3 tranches): 2+ properties in pipeline; T3 at OpCo EBITDA breakeven
- Instruct Opus: the engine-computed tranche count (from the `# Engine-computed funding analysis` section) is the primary signal; the user's saved tranche amounts are what's being validated against that recommendation
- When engine shows 3 tranches but user configured only 2, Opus must flag the gap in `overallNarrative`
- In `buildFundingUserPrompt()`: show user-configured tranche amounts alongside engine-recommended tranches in the same block so Opus can compare them directly

**Patterns to follow:**
- Existing `engineAnalysisBlock` serialization pattern (recently added); extend with a user-configured-vs-engine-recommended comparison block

**Test scenarios:**
- Happy path: when engine analysis has 3 tranches and user has 3 amounts configured → prompt contains both and the comparison block
- Edge case: engine recommends 3 tranches but user has only 2 configured → prompt block shows mismatch (user tranche 3 = "(not configured)")
- Happy path: engine recommends 1 tranche → prompt reflects single-tranche adequacy framing
- Silent-drop check: after edit, `grep -n "capitalRaise3" mgmt-co-funding-prompt.ts` returns at least 1 hit (the comparison block uses it)

**Verification:**
- All 4 existing `mgmt-co-funding-prompt.test.ts` tests still pass
- New test: engine 3-tranche + user 2-tranche → prompt string contains "(not configured)" for tranche 3
- New test: system prompt string contains "Seed" and "Launch" and "Scale" tranche archetype labels
- `pnpm test` green

---

### Phase B: Property Portfolio Capital Raise Specialist

- U4. **New engine function `analyzePortfolioCapitalRaise()`**

**Goal:** Implement a new engine function that takes the full property array and their pro-forma outputs, and produces a `PortfolioCapitalRaiseAnalysis` — the equity deployment schedule, ramp overlap map, blended DSCR, and implied IRR range for the portfolio.

**Requirements:** R3, R4, R8

**Dependencies:** None (pure engine code, parallel to Phase A)

**Files:**
- Create: `lib/engine/src/funding/portfolio-capital-raise.ts`
- Modify: `lib/engine/src/types.ts` — add `PortfolioCapitalRaiseAnalysis`, `PortfolioTranche`, `PortfolioPropertyEquitySummary`
- Modify: `lib/engine/src/funding/index.ts` (or equivalent barrel export) — export new function and types

**Approach:**
- Accept `properties: PropertyInput[]`, `proFormas: Record<propertyId, MonthlyFinancials[]>`, `global: GlobalInput`
- For each property: call `propertyEquityInvested(property)` and `acqMonthsFromModelStart(property, global.modelStartDate)` to get equity required and deployment month
- Sort by `deploymentMonth` to produce acquisition timeline
- Identify ramp overlap windows: for each month from first acquisition to last stabilization, count properties simultaneously in ramp (deployment month to deployment month + occupancyRampMonths)
- Compute `firstCloseMinimum = max(properties[0].equityRequired, totalEquityRequired * 0.30)`
- Compute blended DSCR from pro-forma NOI and debt service at stabilized month (each property's `occupancyRampMonths` months post-open)
- Compute implied IRR if a cap rate is available (use `global.exitCapRate` if present, or null if absent) — this is advisory, not precise
- Return `PortfolioCapitalRaiseAnalysis` (see High-Level Technical Design for shape)
- **Engine integrity caveat**: do NOT use `refinanceProceeds` fields in any computation (MAJOR-2 is unresolved); flag `rampCarryUnderstated: boolean` in the return type when MAJOR-5 is known to affect pre-ops period

**Patterns to follow:**
- `analyzeFundingNeeds()` in `lib/engine/src/funding/funding-predictor.ts` — structure of the analysis function
- `propertyEquityInvested()` and `acqMonthsFromModelStart()` in `lib/engine/src/debt/equityCalculations.ts`

**Test scenarios:**
- Happy path: 2 properties with 9-month gap → analysis shows T1 (property 1 equity at month 0), T2 (property 2 equity at month 9), `rampOverlapMonths` covers months 9–18 where both are in ramp
- Happy path: 1 property → single-tranche, no ramp overlap, firstCloseMinimum = property equity
- Edge case: empty properties array → returns zero/empty analysis without throwing
- Edge case: `acquisitionLTV = 0` (all-cash acquisition) → debt service = 0, DSCR = undefined/null, not NaN or division error
- Edge case: `operationsStartDate` beyond projection window → property equity deployed but no NOI in projection period; handle gracefully
- Integration: `analyzePortfolioCapitalRaise` called with real engine output from `generatePropertyProForma` produces per-property equity that is consistent with `propertyEquityInvested` standalone

**Verification:**
- A portfolio of 2 properties produces 2 `perPropertyEquity` entries with distinct `deploymentMonth` values
- `totalEquityRequired` equals sum of per-property equity
- `firstCloseMinimum` is at least 30% of `totalEquityRequired`
- Empty properties input does not throw

---

- U5. **Portfolio raise slim type + prompt-input-builder**

**Goal:** Define the `PortfolioRaiseAnalysisSummary` slim type (the route→builder boundary) and the pure `portfolio-raise-prompt-input-builder.ts` with 5 dimension keys, dimension descriptors, and `PortfolioRaisePromptInputContext`.

**Requirements:** R3, R4, R5, R6

**Dependencies:** U4

**Files:**
- Create: `artifacts/api-server/src/ai/specialists/portfolio-raise-prompt-input-builder.ts`
- Create: `lib/shared/src/constants-portfolio-raise-benchmarks.ts` — hardcoded LP benchmark ranges for the 5 dimensions

**Approach:**
- `PORTFOLIO_RAISE_DIMENSION_KEYS` as const array (5 keys): `totalEquityRequired`, `firstCloseMinimum`, `portfolioDscr`, `rampCapitalBuffer`, `achievableIrr`
- `PortfolioRaiseAnalysisSummary` slim type: strips `rampOverlapMonths` detail and `perPropertyEquity` array to scalars + a property breakdown array (propertyId, propertyLabel, equityRequired, deploymentMonth)
- `PortfolioRaisePromptInputContext`: `{ analysisSummary: PortfolioRaiseAnalysisSummary; persona: FundingPersonaContext; icpModel?: IcpModelProfile | null; priorVerdicts?: readonly PriorVerdictRef[]; }`
- Note: no `referenceBrands` in portfolio context (LP comparables are deal-level, not brand-level)
- `buildPortfolioRaisePromptInput(ctx)` — pure assembler following `buildFundingPromptInput()` pattern
- Benchmark constants file: export `DEFAULT_PORTFOLIO_RAISE_BENCHMARKS` with low/mid/high per dimension key (values from PE research: DSCR 1.0/1.25/1.5, IRR 0.12/0.15/0.18, etc.)
- ADR-007: zero DB/LLM/HTTP imports in the builder file

**Patterns to follow:**
- `mgmt-co-funding-prompt-input-builder.ts` — FUNDING_DIMENSION_KEYS, FundingDimensionDescriptor, FundingPromptInputContext, buildFundingPromptInput()
- `constants-funding.ts` in `lib/shared/src/` for benchmark constant shape

**Test scenarios:**
- Happy path: `buildPortfolioRaisePromptInput(ctx)` with full analysis summary → returns all 5 dimension descriptors
- Edge case: `analysisSummary.achievableIrr = null` (no cap rate available) → dimension descriptor still present; hint in evidenceCues to note IRR as not computable
- Silent-drop check: every field on `PortfolioRaiseAnalysisSummary` must appear in at least one prompt string (checked in U7 tests)

**Verification:**
- `buildPortfolioRaisePromptInput` is importable with zero server-side deps
- 5 dimension keys match `DEFAULT_PORTFOLIO_RAISE_BENCHMARKS` keys exactly
- `pnpm typecheck` on api-server passes

---

- U6. **Portfolio raise runner + output schema**

**Goal:** Implement the runner that invokes Opus, validates the structured output, and returns the specialist verdict. Follows the mgmt-co-funding-runner pattern exactly.

**Requirements:** R3, R7

**Dependencies:** U5

**Files:**
- Create: `artifacts/api-server/src/ai/specialists/portfolio-raise-runner.ts`
- Create: `artifacts/api-server/src/ai/specialists/portfolio-raise-output-schema.ts` — Zod schema for the 5-dimension output + overallNarrative

**Approach:**
- `PortfolioRaiseOutputSchema` (Zod): same shape as `FundingSpecialistOutputSchema` — 5 dimensions each with `key`, `low`, `mid`, `high`, `conviction`, `reasoning`, `evidenceRefs`; plus `overallNarrative`
- The `key` enum uses `PORTFOLIO_RAISE_DIMENSION_KEYS` values
- `runPortfolioRaiseSpecialist(ctx, benchmarks, comparables, deps?)` → `Promise<AnalystVerdict>`
- Follows the Tier-0 fallback pattern: schema rejection → `meta.fallbackReason: "tier1_temporarily_unavailable"`
- Primary question the `overallNarrative` must answer: "Can this portfolio of properties support a fundable LP capital raise — and how should it be structured?"

**Patterns to follow:**
- `mgmt-co-funding-runner.ts` — full file; same error handling, Tier-0 fallback, schema validation pattern
- `mgmt-co-funding-output-schema.ts` (if it exists) or the schema embedded in the runner

**Test scenarios:**
- Happy path: valid Opus response → schema parses successfully, verdict returned
- Error path: Opus response fails schema validation → `Tier1UnavailableError` thrown with fallback metadata
- Error path: LLM call throws → `Tier1UnavailableError` propagates

**Verification:**
- `runPortfolioRaiseSpecialist` accepts the correct context and returns a typed verdict
- Zod schema rejects responses with unknown dimension keys
- `pnpm typecheck` passes

---

- U7. **Portfolio raise prompt (system + user)**

**Goal:** Write the system and user prompt builders for the portfolio specialist. System prompt grounds Opus in LP-grade hospitality fund analysis norms. User prompt serializes all engine-computed portfolio data so Opus reasons from numbers, not abstractions.

**Requirements:** R3, R4, R6, R8

**Dependencies:** U5, U6

**Files:**
- Create: `artifacts/api-server/src/ai/specialists/portfolio-raise-prompt.ts`
- Create: `artifacts/api-server/src/tests/portfolio-raise-prompt.test.ts`

**Approach:**

*System prompt responsibilities:*
- Same Analyst persona as `buildFundingSystemPrompt()` — senior advisor at Norfolk AI, Goldman Sachs research tone, range-first delivery, investor-aware
- Primary question to answer: "Can this portfolio of properties support a fundable LP capital raise — and how should it be structured?"
- LP-grade framework section: explain the fund structure (PropCo SPVs under fund entity), European waterfall default, preferred return + carry norms, first-close sizing rules
- Engine integrity caveat section: "The Analyst has engine-computed equity data for each property. Refi-at-exit equity projections may be understated (cost-basis debt model); pre-opening carry costs may be understated (some pre-ops costs only start at operations date, not acquisition date). Flag these as assumptions, not confirmed figures."
- Dimension-specific guidance: for `achievableIrr` — compute from `portfolioDscr × loan + equityYield`, not fabricated; if cap rate is absent, output DEVELOPING conviction with reasoning explaining the gap
- Forbidden: inventing per-property NOI figures not in the engine section; citing comparables not in the user message

*User prompt responsibilities:*
- `# Portfolio overview` — total properties, total equity required, first-close minimum, ramp overlap summary
- `# Per-property equity breakdown` — table: property name, deployment month, equity required, LTV, DSCR at stabilization
- `# Acquisition tranche schedule` — engine-computed tranches (date, amount, properties funded)
- `# Ramp overlap exposure` — months where 2+ properties are simultaneously pre-stabilization; peak concurrent count
- `# Persona` — vertical, market tier, locale (same as mgmt-co funding)
- `# LP comparables` — comparable portfolio fund deals from the canned dataset
- `# Benchmark ranges` — hardcoded LP benchmarks per dimension from `DEFAULT_PORTFOLIO_RAISE_BENCHMARKS`
- Engine integrity hedge block: inline note that refi and pre-ops carry figures should be treated as floor estimates

**Test scenarios:**
- Happy path: ctx with 2-property summary + full analysis → prompt contains "Per-property equity breakdown" and both property rows
- Happy path: achievableIrr present → prompt contains "Implied IRR" line with the value
- Edge case: achievableIrr = null → prompt contains "IRR not computable" placeholder (no value fabricated)
- Edge case: empty perPropertyEquity → prompt contains "(no properties with computable equity)" rather than empty table
- Silent-drop check for every field on PortfolioRaiseAnalysisSummary: assert each appears in the prompt string for a fully-populated ctx
- System prompt test: contains "refi-at-exit equity projections may be understated" (engine integrity hedge)
- System prompt test: contains "European waterfall" or "whole-fund return"

**Verification:**
- All prompt tests pass
- `grep -n "analysisSummary\." portfolio-raise-prompt.ts` returns hits for every field on the slim type
- `pnpm test` green

---

- U8. **Route wiring — `runPortfolioRaiseV1Path()`**

**Goal:** Wire the portfolio raise specialist into the analyst route: load properties, run engine, map slim type, build context, invoke specialist, return verdict.

**Requirements:** R3, R5, R9

**Dependencies:** U4, U5, U6, U7

**Files:**
- Modify: `artifacts/api-server/src/routes/analyst-admin.ts` — add `runPortfolioRaiseV1Path(userId)` and route handler for `specialistId === "portfolio.capitalRaise"`
- Create: `artifacts/api-server/src/ai/specialists/portfolio-raise-live-comparables.ts` — canned LP comparable deals dataset

**Approach:**
- `runPortfolioRaiseV1Path(userId)`:
  1. `storage.getGlobalAssumptions(userId)` — for persona resolution and globalInput construction
  2. `storage.getAllProperties(userId)` — load full property array
  3. Early return if `properties.length === 0` — return a structured "no properties" sentinel the client can handle
  4. `gaToGlobalInput(overlaidGa, 10)` — reuse existing helper
  5. Per property: `generatePropertyProForma(property, globalInput, 10 * 12)` — generate pro forma
  6. `analyzePortfolioCapitalRaise(properties, proFormas, globalInput)` — new engine call
  7. Non-fatal: wrap engine call in try/catch; log warn on failure; `analysisSummary = undefined` if engine throws
  8. Map to `PortfolioRaiseAnalysisSummary` slim type in the route layer
  9. Build `PortfolioRaisePromptInputContext` with analysis summary + persona + ICP model
  10. `getPortfolioRaiseComparables()` from the canned dataset file
  11. `runPortfolioRaiseSpecialist(ctx, benchmarks, comparables)` — note: use `DEFAULT_PORTFOLIO_RAISE_BENCHMARKS` (not per-user watchdog row)
  12. Return verdict
- Add route dispatch: `else if (specialistId === "portfolio.capitalRaise") { return res.json(await runPortfolioRaiseV1Path(userId)); }`
- Canned comparables: 4–6 boutique/luxury portfolio fund deals with: operator, vintage, totalEquityUsd, propertyCount, blendedIrr, holdPeriodYears, vertical, asOf

**Patterns to follow:**
- `runFundingV1Path()` in `analyst-admin.ts` — exact pattern for all steps including non-fatal try/catch blocks
- `getLpComparables()` / `getCannedLpComparables()` in `live-comparables.ts` for the canned dataset pattern

**Test scenarios:**
- Integration: POST `/api/analyst/refresh` with `{ specialistId: "portfolio.capitalRaise" }` routes to the new handler
- Error path: engine throws during portfolio analysis → non-fatal, route continues with `analysisSummary: undefined`, specialist receives context without analysis block
- Edge case: `properties.length === 0` → returns a structured sentinel (not a Tier1UnavailableError)

**Verification:**
- The route handler is reachable via POST with the correct specialistId
- Non-fatal engine failure does not produce a 500 response
- `pnpm typecheck` passes

---

- U9. **Specialist catalog entry + UI accordion row**

**Goal:** Register `portfolio.capitalRaise` in the specialist catalog and add its accordion row to the Intelligence panel.

**Requirements:** R9

**Dependencies:** U6, U8

**Files:**
- Modify: `lib/engine/src/analyst/registry/specialist-catalog.ts` — add `"portfolio.capitalRaise"` entry
- Modify: relevant UI component file for the Intelligence accordion (identify from `docs/solutions/architecture-patterns/intelligence-specialists-page-2026-05-02.md`)

**Approach:**
- Catalog entry: `id: "portfolio.capitalRaise"`, `label: "Portfolio Capital Raise"`, `description: "LP equity raise strategy for the property portfolio — per-property equity, acquisition timeline, DSCR, ramp exposure, and IRR achievability"`, `candidateFields` uses the 5 `PORTFOLIO_RAISE_DIMENSION_KEYS`, `prerequisites: ["all-properties-financials-computed"]`
- UI row fields: human name, function/domain label ("Portfolio / Capital Raise"), last-called timestamp, status icon, [Run Analyst] trigger button dispatching `specialistId: "portfolio.capitalRaise"`
- Do NOT add a new sidebar item or domain group — flat accordion list only (per the architecture pattern learning)

**Test scenarios:**
- Test expectation: none — UI wiring and catalog entry have no behavioral logic to unit-test. Covered by manual smoke test: navigating to Intelligence panel shows the new row; clicking [Run Analyst] invokes the POST with the correct specialistId.

**Verification:**
- Catalog entry is present and parseable by the registry
- UI row appears in the accordion list
- [Run Analyst] button sends the correct specialistId to the route

---

## System-Wide Impact

- **Interaction graph:** `runPortfolioRaiseV1Path` calls `generatePropertyProForma` per property (N calls, potentially expensive for large portfolios); the existing company-level engine call is separate and not reused here. If portfolio has 10+ properties, the N-call fan-out could exceed route timeout — consider adding a properties count gate or parallelizing with `Promise.all` in the route.
- **Error propagation:** Portfolio engine failure is non-fatal (returns undefined summary); the specialist runs with a hedged prompt. Mgmt-co funding engine failure follows the same pattern (already in place).
- **State lifecycle risks:** No new persistent state. The portfolio specialist does not write to any cache or DB table in v1.
- **API surface parity:** The `specialistId: "portfolio.capitalRaise"` string is the external contract surface. It must match exactly in: route dispatch, catalog entry, and any client-side invocation.
- **Integration coverage:** The route-level integration test (U8) exercises the full chain: DB → engine → slim type → prompt → Opus mock → verdict. Unit tests alone do not prove the non-fatal fallback correctly propagates through all layers.
- **Unchanged invariants:** The existing `runFundingV1Path()` (mgmt-co specialist) is unchanged in behavior — Phase A adds DB columns and prompt reasoning but does not alter the mgmt-co engine analysis path or its output schema.
- **N property fan-out:** `generatePropertyProForma` is called once per property in U8. This is acceptable for portfolios of ≤20 properties but may be slow for larger ones. The existing service layer `computeCompanyProjection()` caches by hash; the portfolio route should check whether it can reuse cached per-property results rather than recomputing.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| MAJOR-5 (pre-ops gating) understates property equity needs | System prompt explicitly hedges; `rampCarryUnderstated` flag in engine output informs Opus |
| MAJOR-2 (refi sizing) produces incorrect LP return projections | Do not include `refinanceProceeds` in any equity computation; hedge in system prompt |
| Silent field drop on new portfolio context fields | Mandatory grep check + prompt content unit test for every field on `PortfolioRaiseAnalysisSummary` (U7) |
| Route grows too large | Implementer discretion: if `analyst-admin.ts` exceeds ~1500 lines, extract `runPortfolioRaiseV1Path` to `analyst-portfolio.ts` |
| Per-property engine fan-out slow for large portfolios | Add `properties.length > 20` warn log; explore reusing company-engine cached proFormas |
| `deriveTrancheGapMonths()` breaks for 3-tranche scenarios | Function remains scalar (T1→T2 gap); T2→T3 gap surfaced as narrative only — no schema break |
| MINOR-7 (aggregator duplication) causes field to appear only in one aggregator | Any new metric added to engine for portfolio analysis must be added to both `aggregatePropertyByYear` and `aggregateUnifiedByYear` |

---

## Documentation / Operational Notes

- After Phase A ships: run the mgmt-co funding specialist end-to-end for a user with 2 configured tranches and confirm no regression in verdict output
- After Phase B ships: smoke-test the portfolio specialist for a 1-property user and a 2-property user; verify the `overallNarrative` references property names and equity figures from the engine, not fabricated numbers
- The `capitalRaise3Amount` / `capitalRaise3Date` form fields are not wired in the UI as of this plan — document in the internal handoff that these DB columns exist and are ready when the frontend work lands

---

## Sources & References

- Related code: `artifacts/api-server/src/ai/specialists/mgmt-co-funding-prompt-input-builder.ts`
- Related code: `artifacts/api-server/src/routes/analyst-admin.ts` (lines ~603–763, `runFundingV1Path`)
- Related code: `lib/engine/src/funding/funding-predictor.ts`
- Related code: `lib/engine/src/debt/equityCalculations.ts`
- Institutional learnings: `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md`
- Institutional learnings: `docs/solutions/logic-errors/reference-brands-dropped-from-llm-prompt-2026-05-02.md`
- Institutional learnings: `docs/solutions/logic-errors/financial-engine-audit-findings-2026-05-04.md`
- Institutional learnings: `docs/solutions/architecture-patterns/intelligence-specialists-page-2026-05-02.md`
- External: PE/hospitality fund structures, OpCo raise milestone norms, LP waterfall precedents (KHP Capital Partners, Limestone Capital, Lore Group precedents)
