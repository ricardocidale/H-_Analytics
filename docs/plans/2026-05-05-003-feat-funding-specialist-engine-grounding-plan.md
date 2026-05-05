---
title: "feat: Ground funding specialist in Capital Raise engine output"
type: feat
status: completed
date: 2026-05-05
---

# feat: Ground funding specialist in Capital Raise engine output

## Summary

Wire `analyzeFundingNeeds()` (the Capital Raise engine) into `runFundingSpecialist()` so the LLM reasons from computed figures — actual tranche structure, burn rate, breakeven month, cash runway — rather than abstractly from user-saved assumption fields. The route layer computes the engine output non-fatally before calling the specialist; a slim summary type is injected into `FundingPromptInputContext`; the quant panel user prompt serializes it as calibration context alongside comparables and benchmarks.

---

## Problem Frame

The funding specialist currently builds its narrative from five user-saved scalar inputs (`runwayBufferMonths`, `sizingOvershootPct`, etc.) plus benchmark ranges and LP comparables. It has no access to the monthly pro-forma financials the engine computes, so it cannot state how much capital the model actually predicts is needed, when breakeven occurs, or what the cash shortfall curve looks like. The `runwayNeedMonths` field in `FundingPromptInputContext` is filled with a hardcoded placeholder constant. The system prompt explicitly redirects to "check your Cash Flow Statement" when the LLM needs numeric grounding — a gap the route layer can close directly.

---

## Requirements

- R1. The funding specialist receives engine-computed `FundingAnalysis` fields (total raise needed, breakeven month, monthly burn rate, tranche structure, months of runway) as explicit context before panels execute.
- R2. Engine computation is non-fatal: a failure (misconfigured inputs, engine exception) logs a warning and falls back to the existing placeholder behavior rather than blocking the verdict.
- R3. The prompt serializes engine data as calibration context framed as directional — not authoritative — given the five known engine integrity gaps documented in `docs/solutions/logic-errors/financial-engine-audit-findings-2026-05-04.md`.
- R4. The `runwayNeedMonths` placeholder in `portfolio` is replaced with the engine-computed value when available.
- R5. A unit test confirms the engine analysis field, when populated, appears in the built prompt string (mitigating the `referenceBrands` silent-drop failure mode documented in `docs/solutions/logic-errors/reference-brands-dropped-from-llm-prompt-2026-05-02.md`).

---

## Scope Boundaries

- Engine integrity fixes (CFO, refi proceeds, `pmt()`, fee subordination, pre-ops costs) are out of scope — those are tracked separately.
- The verdict cache key is not updated to incorporate engine output hash. The engine is deterministic given inputs already captured in the key; a cache key audit is a separate task.
- No UI changes — this is server-side specialist wiring only.
- Market rates (`MarketRateResponse[]`) are not fetched for the engine call in v1; the route passes `undefined` and the engine uses defaults.
- Service templates are not passed to `generateCompanyProForma` in v1; the engine uses the stored service template data available via the global assumptions fallback path.

### Deferred to Follow-Up Work

- Verdict cache key should eventually incorporate a hash of property inputs so stale verdicts are not served when properties change but `companyInputs` fields stay the same — separate task.
- `marketRates` fetch (Fed Funds, SOFR, 10Y Treasury) could be plumbed in from the existing market rates storage call — deferred until the engine integrity gaps are resolved so the narrative context is reliable.

---

## Context & Research

### Relevant Code and Patterns

- **Route orchestration pattern:** `artifacts/api-server/src/routes/analyst-admin.ts` lines 565–698 — `runFundingV1Path()` assembles `FundingPromptInputContext` and calls the specialist. Reference brand wiring (lines 630–644) is the canonical pattern for non-fatal context enrichment: try/catch, log warn on failure, fall back to `undefined`.
- **`buildGlobalInput` mapper:** `artifacts/api-server/src/slides/build-payload.ts:88` — maps a DB `globalAssumptions` row to `GlobalInput` (the engine's input type). Reuse this for the engine call; no second mapper needed.
- **`generateCompanyProForma`:** `artifacts/api-server/src/finance/service.ts:185` — shows the property row → `PropertyInput[]` mapping pattern and the 120-month invocation convention.
- **`analyzeFundingNeeds`:** `lib/engine/src/funding/funding-predictor.ts:177` — `(financials: CompanyMonthlyFinancials[], global: FundingGlobalInput, marketRates?) → FundingAnalysis`. Pure TypeScript, no browser deps, server-callable.
- **`FundingGlobalInput`:** `lib/engine/src/funding/funding-predictor.ts:30` — extends `GlobalInput` with optional `fundingSourceLabel`, `capitalRaiseValuationCap`, `capitalRaiseDiscountRate`. Populated from `overlaidGa`.
- **`FundingPromptInputContext`:** `artifacts/api-server/src/ai/specialists/mgmt-co-funding-runner.ts` — the context type passed into `runFundingSpecialist`; `referenceBrands` is the most recent optional field addition, use as pattern.
- **Prompt builders:** `artifacts/api-server/src/ai/specialists/mgmt-co-funding-prompt.ts` — `buildFundingUserPrompt()` and `buildQuantPanelUserPrompt()` are the serialization surfaces. The existing `referenceBrands` section shows the `(none on file)` fallback pattern for optional fields.

### Institutional Learnings

- **Three-layer DI pattern** (`docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md`): route layer fetches/computes and maps → slim typed interface on context type → prompt builder serializes. No DB imports in prompt-builder layer (ADR-007).
- **Silent field drop risk** (`docs/solutions/logic-errors/reference-brands-dropped-from-llm-prompt-2026-05-02.md`): TypeScript does not catch unused context fields. After adding `engineAnalysis` to the context type, a unit test must assert the field appears in the built prompt string. Use the `(none on file)` fallback pattern so absent optional fields produce a clean signal.
- **Engine integrity gaps** (`docs/solutions/logic-errors/financial-engine-audit-findings-2026-05-04.md`): five MAJOR findings are unresolved (CFO overstates, refi proceeds mis-sized, `pmt()` cap, fee subordination timing, pre-ops suppression). Engine output must be framed as directional calibration, not authoritative ground truth.

---

## Key Technical Decisions

- **Slim summary type, not full `FundingAnalysis`:** The route maps engine output to a `FundingAnalysisSummary` interface containing only the fields the LLM needs (7–8 scalars + tranche array). Passing the full `FundingAnalysis` (including `cashRunway: CashRunwayPoint[]` with 120 entries) would bloat the prompt context unnecessarily.
- **Non-fatal injection:** Engine computation failure (bad input mapping, engine exception) must not block the verdict. Wrap in try/catch; log `warn`; set `engineAnalysis: undefined` and proceed. Mirrors the `referenceBrands` pattern exactly.
- **Directional framing in prompt:** Given the documented engine integrity gaps, the prompt frames engine figures as "directional calibration from the financial model — treat as one signal alongside comparables, not as authoritative." This is the honest framing and also what the system prompt should instruct Opus to communicate to the user.
- **Replace placeholder constant:** `DEFAULT_RUNWAY_NEED_MONTHS_PLACEHOLDER` in `portfolio.runwayNeedMonths` is replaced by `engineAnalysis.monthsOfRunway` when the engine call succeeds. The field name stays unchanged; only the value source changes.
- **120-month projection window:** Consistent with the finance service convention and sufficient to capture breakeven for any realistic management company timeline.

---

## Open Questions

### Resolved During Planning

- **Where does `buildGlobalInput` live?** `artifacts/api-server/src/slides/build-payload.ts:88` — already importable from api-server context.
- **Does the engine have browser deps?** No — pure TypeScript, confirmed by the finance service importing it directly.
- **Should market rates be fetched?** Not in v1 — deferred (see Scope Boundaries).

### Deferred to Implementation

- **Property row → `PropertyInput[]` mapping:** Follow `artifacts/api-server/src/finance/service.ts:185` exactly. The precise field mappings will be confirmed by reading that file at implementation time.
- **`FundingGlobalInput` vs `GlobalInput` delta:** `buildGlobalInput()` returns `GlobalInput`; `analyzeFundingNeeds` wants `FundingGlobalInput` (which extends `GlobalInput`). Implementer should spread `buildGlobalInput(overlaidGa, 120)` and add the funding-specific fields from `overlaidGa` (`fundingSourceLabel`, `capitalRaiseValuationCap`, `capitalRaiseDiscountRate`).

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

```
runFundingV1Path(userId)
  │
  ├── [existing] overlaidGa, properties, benchmarks, comparables
  │
  ├── [new, non-fatal] buildGlobalInput(overlaidGa, 120) → GlobalInput
  │         ↓
  │   generateCompanyProForma(propertyInputs, globalInput, 120) → CompanyMonthlyFinancials[]
  │         ↓
  │   analyzeFundingNeeds(monthlyFinancials, fundingGlobalInput) → FundingAnalysis
  │         ↓
  │   map to FundingAnalysisSummary (slim 7-field type)
  │
  ├── ctx = { inputs, persona, portfolio (runwayNeedMonths from engine), icpModel,
  │           priorVerdicts, referenceBrands, engineAnalysis }   ← new field
  │
  └── runFundingSpecialist(ctx, benchmarks, comparables)
            │
            └── buildFundingUserPrompt(ctx, ...)
                      │
                      └── [new section] Engine-computed capital structure:
                              totalRaiseNeeded, monthlyBurnRate, breakevenMonth,
                              monthsOfRunway, tranche[0..N] {amount, month}
                              "Directional — treat as calibration alongside comparables"
```

---

## Implementation Units

- U1. **Define `FundingAnalysisSummary` slim type and extend `FundingPromptInputContext`**

**Goal:** Add the typed surface the route will populate and the prompt builder will consume, without touching any logic.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/ai/specialists/mgmt-co-funding-runner.ts`

**Approach:**
- Define `FundingAnalysisSummary` interface with the fields the LLM needs: `totalRaiseNeeded`, `monthlyBurnRate`, `breakevenMonth` (nullable), `monthsOfRunway`, `fundingGap`, `peakCashDeficit`, `tranches: Array<{ amountUsd: number; monthIndex: number }>`.
- Add `engineAnalysis?: FundingAnalysisSummary` to `FundingPromptInputContext`. Mark optional — the route sets it only when the engine call succeeds.
- Import `FundingAnalysis` from `@engine/funding/funding-predictor` for reference when defining the slim type fields; do not re-export the full type.

**Patterns to follow:**
- `ReferenceBrandSummary` in `artifacts/api-server/src/ai/specialists/mgmt-co-funding-runner.ts` — same slim-type-on-context pattern.

**Test scenarios:**
- Test expectation: none — pure type addition, no runtime behavior change.

**Verification:**
- `pnpm --filter @workspace/api-server exec tsc --noEmit` passes with the new field.

---

- U2. **Compute engine output in `runFundingV1Path` and inject into context**

**Goal:** Before calling `runFundingSpecialist`, run the Capital Raise engine non-fatally and inject the result into `ctx.engineAnalysis`. Replace the placeholder constant in `portfolio.runwayNeedMonths`.

**Requirements:** R1, R2, R4

**Dependencies:** U1

**Files:**
- Modify: `artifacts/api-server/src/routes/analyst-admin.ts`

**Approach:**
- Import `buildGlobalInput` from `artifacts/api-server/src/slides/build-payload.ts` (already importable in api-server context).
- Import `generateCompanyProForma` from `@engine/company/company-engine` and `analyzeFundingNeeds` from `@engine/funding/funding-predictor`.
- In `runFundingV1Path`, after fetching `overlaidGa` and `properties`, add a non-fatal block that: (1) calls `buildGlobalInput(overlaidGa, 120)` → `GlobalInput`; (2) maps DB property rows to `PropertyInput[]` following the pattern in `artifacts/api-server/src/finance/service.ts:185`; (3) calls `generateCompanyProForma(propertyInputs, globalInput, 120)`; (4) extends `globalInput` with funding-specific fields from `overlaidGa` to form `FundingGlobalInput`; (5) calls `analyzeFundingNeeds(monthlyFinancials, fundingGlobalInput)`; (6) maps to `FundingAnalysisSummary`.
- Wrap the entire block in try/catch: on success, set `engineAnalysis` and replace `portfolio.runwayNeedMonths` with `engineAnalysis.monthsOfRunway`; on failure, log `logger.warn(...)` and leave `engineAnalysis: undefined` and `runwayNeedMonths` at the existing placeholder.
- Pass `engineAnalysis` into `ctx`.

**Patterns to follow:**
- Reference brand non-fatal block (`analyst-admin.ts:630–644`) for try/catch shape and logger.warn pattern.
- `artifacts/api-server/src/finance/service.ts:185` for `generateCompanyProForma` invocation and property row mapping.
- `artifacts/api-server/src/slides/build-payload.ts:88` for `buildGlobalInput` usage.

**Test scenarios:**
- Integration scenario: `runFundingV1Path` called with a user who has `overlaidGa` and two properties → `ctx.engineAnalysis` is populated with non-null `totalRaiseNeeded` and `breakevenMonth`; `portfolio.runwayNeedMonths` is not the placeholder constant.
- Error path: `analyzeFundingNeeds` throws → `ctx.engineAnalysis` is `undefined`; `portfolio.runwayNeedMonths` remains the placeholder; the specialist call still proceeds; a `warn` log is emitted with the error message.
- Edge case: user has zero properties → `generateCompanyProForma` receives an empty array; engine returns a zero-revenue analysis; `engineAnalysis` is populated (not thrown); `totalRaiseNeeded` reflects full operating cost burn.

**Verification:**
- Workspace typecheck passes.
- The integration test scenario above passes without mocking the engine (use the real engine with fixture inputs).
- The error path test above passes using a mock that throws on `analyzeFundingNeeds`.

---

- U3. **Serialize engine analysis into the quant panel user prompt and update system prompt**

**Goal:** Make engine-computed figures visible to the LLM panels as directional calibration context. Add a unit test to prevent silent field drop.

**Requirements:** R1, R3, R5

**Dependencies:** U1

**Files:**
- Modify: `artifacts/api-server/src/ai/specialists/mgmt-co-funding-prompt.ts`
- Create: `artifacts/api-server/src/ai/specialists/mgmt-co-funding-prompt.test.ts`

**Approach:**
- In `buildFundingUserPrompt()`, add a new section that serializes `ctx.engineAnalysis` when present. Frame the section header as: "Engine-computed capital structure (directional — treat as calibration alongside comparables, not authoritative)". Include: `totalRaiseNeeded` (formatted as USD), `monthlyBurnRate`, `breakevenMonth` (or "not reached in projection window"), `monthsOfRunway`, and a compact tranche list (`T1: $Xk at month N`, `T2: $Yk at month M`). When `engineAnalysis` is absent, emit `(engine analysis unavailable — using benchmarks only)`.
- In the system prompt instructions, add a paragraph directing the model to treat engine figures as primary quantitative grounding when present, note that the underlying engine has known integrity gaps (so ranges and comparables remain the authoritative basis for conviction scoring), and retire the "redirect to Cash Flow Statement" instruction (or demote it to a secondary verification suggestion).
- Unit test: build the prompt with a populated `FundingAnalysisSummary` fixture; assert the `totalRaiseNeeded` value appears in the output string. Build with `engineAnalysis: undefined`; assert the fallback string appears.

**Patterns to follow:**
- `referenceBrands` section in `buildFundingUserPrompt` for optional field serialization and `(none on file)` / fallback text pattern.
- Existing prompt test files (if any) in `artifacts/api-server/src/ai/specialists/` for test structure; otherwise mirror the log-parser test style from `scripts/src/log-parser.test.ts`.

**Test scenarios:**
- Happy path: `buildFundingUserPrompt({ ..., engineAnalysis: { totalRaiseNeeded: 2_400_000, monthlyBurnRate: 85_000, breakevenMonth: 18, monthsOfRunway: 24, tranches: [{ amountUsd: 1_100_000, monthIndex: 3 }, { amountUsd: 1_300_000, monthIndex: 9 }], ... } }, ...)` → returned string contains "2,400,000" (or equivalent USD formatting) and "month 18".
- Edge case: `engineAnalysis: undefined` → returned string contains the `(engine analysis unavailable…)` fallback; does NOT throw.
- Edge case: `engineAnalysis.breakevenMonth = null` → returned string contains "not reached" or equivalent; does NOT throw.

**Verification:**
- Unit tests pass (`pnpm --filter @workspace/api-server test`).
- Manual spot-check: trigger the funding specialist endpoint in dev; inspect the LLM prompt logged at debug level to confirm the engine section appears with real values.

---

## System-Wide Impact

- **Interaction graph:** `runFundingV1Path` in `analyst-admin.ts` gains two new engine calls before the specialist. Both calls are synchronous and CPU-bound (no I/O beyond the already-fetched DB rows). Added latency is negligible compared to LLM panel execution time.
- **Error propagation:** Engine failure is absorbed by the non-fatal wrapper. The specialist continues with `engineAnalysis: undefined`; the prompt falls back to `(engine analysis unavailable)`. No new error surface exposed to callers.
- **State lifecycle risks:** None — engine calls are pure functions with no side effects.
- **API surface parity:** No other specialist paths are affected. The seven other `runXxxV1Path` functions in `analyst-admin.ts` are unchanged.
- **Unchanged invariants:** `AnalystVerdict` shape, cache key structure, the five existing `FundingPromptInputContext` fields (`inputs`, `persona`, `portfolio`, `icpModel`, `priorVerdicts`) — all unchanged. Adding `engineAnalysis` is purely additive.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Engine integrity gaps produce misleading grounding | Prompt explicitly frames output as directional; conviction scoring still derives from comparables and benchmarks |
| Silent field drop (engineAnalysis never reaches prompt string) | Unit test in U3 asserts field value appears in built prompt |
| Property row → PropertyInput mapping drift | Follow `finance/service.ts:185` exactly; implementation-time check at that file |
| `generateCompanyProForma` slow for large property counts | Engine is synchronous CPU-bound; 120 months × N properties is fast (< 50ms for typical portfolios); no async concern |
| Verdict cache returns stale result after engine output changes | Deferred to follow-up cache key audit |

---

## Sources & References

- Capital Raise engine: `lib/engine/src/funding/funding-predictor.ts`
- Company engine (pro forma): `lib/engine/src/company/company-engine.ts`
- Finance service (generateCompanyProForma usage): `artifacts/api-server/src/finance/service.ts`
- GlobalInput mapper: `artifacts/api-server/src/slides/build-payload.ts`
- Funding specialist runner: `artifacts/api-server/src/ai/specialists/mgmt-co-funding-runner.ts`
- Funding prompt builder: `artifacts/api-server/src/ai/specialists/mgmt-co-funding-prompt.ts`
- Route orchestration: `artifacts/api-server/src/routes/analyst-admin.ts`
- Architecture pattern: `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md`
- Silent drop failure mode: `docs/solutions/logic-errors/reference-brands-dropped-from-llm-prompt-2026-05-02.md`
- Engine integrity gaps: `docs/solutions/logic-errors/financial-engine-audit-findings-2026-05-04.md`
