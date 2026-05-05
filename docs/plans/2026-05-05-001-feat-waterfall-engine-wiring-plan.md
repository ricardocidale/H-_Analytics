---
title: "feat: Wire computeWaterfall into property returns pipeline"
type: feat
status: completed
date: 2026-05-05
---

# feat: Wire computeWaterfall into property returns pipeline

## Summary

The waterfall schema migration (ADR-011) is done — `lp_equity_pct`, `catch_up_rate`, `catch_up_to_gp_pct`, and `waterfall_tiers` columns exist in the DB and Drizzle schema, but nothing reads them at runtime. This plan wires `computeWaterfall` into the `computeReturnsSummary` function in `artifacts/api-server/src/routes/finance.ts` so each property's financial response includes LP/GP split, multiples, and tier breakdown. It also extends `PropertyInput` with the four new fields, adds the missing default constants to shared, and updates the frontend type mirror.

---

## Problem Frame

`computeWaterfall` in `lib/calc/src/analysis/waterfall.ts` is fully implemented and accessible via the dispatch layer as a standalone tool, but is never called from the main property engine pipeline. LP and GP receive the same total IRR figure; there is no view of how distributions split between them, whether the preferred return was satisfied, or what portion of exit proceeds flows through each promote tier.

---

## Requirements

- R1. Each property in `PropertyReturnMetrics` includes a `waterfallResult` field containing the full `WaterfallOutput` when sufficient inputs are available, or `null` when equity is zero or missing.
- R2. Distributable cash flows fed to the waterfall equal gross cash returned to equity per year with ATCF clamped to zero (`Math.max(0, atcf)`) — operating shortfalls in ramp years are treated as covered by reserves, not netted against distributions. This is not a capital call model; a capital call model is deferred to ADR-010. This avoids both double-counting with the waterfall's return-of-capital step and producing negative distributable values in pre-opening years.
- R3. When `waterfallTiers` is null on the property, the waterfall falls back to `DEFAULT_WATERFALL_TIERS` (3-tier industry standard per ADR-011 seed defaults).
- R4. `preferred_return` aliases `property.ownerPriorityReturn` per ADR-011 — no new DB column.
- R5. New constants (`DEFAULT_PREFERRED_RETURN`, `DEFAULT_LP_EQUITY_PCT`, `DEFAULT_CATCH_UP_RATE`, `DEFAULT_WATERFALL_TIERS`) are extracted to `lib/shared/src/constants-research.ts` and mirrored identically to `artifacts/api-server/src/shared/constants-research.ts` in the same commit.
- R6. `PropertyInput` in `lib/engine/src/types.ts` declares all four waterfall fields as optional nullable so the route reads them with type safety.
- R7. The frontend `ServerReturnsSummary` type in `useServerFinancials.ts` matches the extended server shape.
- R8. A proof test asserts waterfall output identity (total_to_lp + total_to_gp ≈ total_distributable) with hand-derived arithmetic for every intermediate value (return_of_capital, preferred_return_amount, catch_up_amount, tier allocation) following the analytical-pin standard.
- R9. `propertyInputSchema` in `finance.ts` adds explicit Zod fields for `lpEquityPct` (0–1), `catchUpRate` (0–1), and `catchUpToGpPct` (0–1) so fat-finger values cannot produce negative GP equity silently.
- R10. API response documentation (inline comment on `PropertyReturnMetrics`) clearly marks `preferred_return_amount` and `preferred_return_shortfall` as single-period approximations — `computeWaterfall` computes `totalEquity × preferred_return` (one year's target), not a multi-year accrual. Consumers must not interpret these as the full hold-period preferred return.

---

## Scope Boundaries

- LP-net IRR computation is not in scope — deferred to ADR-010 Phase 1. This plan adds `lp_multiple`, `total_to_lp`, `total_to_gp` which is sufficient for v1.
- UI surfaces (property-edit LP/GP split panel, company-level waterfall defaults panel) are Replit-lane — excluded.
- Specialist Q (Quitéria) and Specialist R (Rafaela) from ADR-010 are roadmap — excluded.
- OpenAPI spec updates are not required — the spec is a health-check stub and does not cover finance endpoints.
- No new DB migration — the four columns already exist.

### Deferred to Follow-Up Work

- LP-net IRR: requires scaling per-year ATCF by LP waterfall share and running IRR on the LP cash flow vector. Deferred to ADR-010 Phase 1.
- Portfolio-level waterfall aggregation: only per-property wiring is in scope here.

---

## Context & Research

### Relevant Code and Patterns

- `lib/calc/src/analysis/waterfall.ts` — `computeWaterfall(WaterfallInput): WaterfallOutput`. Must be called with `rounding_policy: DEFAULT_ROUNDING` (not injected automatically outside of dispatch).
- `artifacts/api-server/src/routes/finance.ts` — `computeReturnsSummary` (lines ~216–307): integration point. `aggregateUnifiedByYear` is already called per property; `yearlyCF` is available with `atcf`, `exitValue`, `refinancingProceeds` per year.
- `lib/engine/src/debt/equityCalculations.ts` — `propertyEquityInvested(property)`: already called in the loop; this is `total_equity_invested`.
- `lib/shared/src/constants-research.ts` — where `DEFAULT_GP_CATCH_UP_TARGET_PCT = 0.20` lives; new waterfall constants go here.
- `artifacts/api-server/src/shared/constants-research.ts` — mirror; must stay identical (see Institutional Learnings).
- `lib/engine/src/types.ts` — `PropertyInput` interface; waterfall fields are absent and must be added.
- `lib/db/src/schema/properties.ts` — `waterfallTiers: jsonb("waterfall_tiers")` declared without `.$type<WaterfallTier[]>()` — add type annotation.
- `artifacts/hospitality-business-portal/src/hooks/useServerFinancials.ts` — `ServerReturnsSummary.properties[]` mirrors `PropertyReturnMetrics`; needs `waterfallResult` field added.
- `artifacts/api-server/src/tests/proof/engine-integrity-fixes.test.ts` — pattern for new proof tests: analytical pin + identity check pairs.

### Institutional Learnings

- **Mirror sync** (`docs/solutions/tooling/mirror-shared-package-sync.md`): every export added to `lib/shared/src/` must be identically applied to `artifacts/api-server/src/shared/` in the same commit. Run the diff loop after every shared change. `@shared/*` inside api-server resolves to `artifacts/api-server/src/shared/`, not `lib/shared/src/`.
- **Magic-numbers ratchet** (`docs/solutions/tooling/magic-numbers-ratchet-improvements.md`): new waterfall constants (hurdle rates, preferred return pct, LP equity split) must be extracted to `lib/shared/src/constants-research.ts`, not duplicated as raw literals across multiple files. After adding, run `pnpm --filter @workspace/scripts exec tsx ./src/check-magic-numbers.ts --init`.
- **Proof-test standards** (`docs/solutions/tooling/...` / `.agents/skills/hplus-proof-test-standards/SKILL.md`): every pinned numeric must show its arithmetic derivation in a comment. Analytical pin paired with a relational identity check is the standard pattern. Use `toBeCloseTo(value, precision)` for floats.
- **Financial engine audit findings** (`docs/solutions/logic-errors/financial-engine-audit-findings-2026-05-04.md`): MAJOR-2 notes that refinancing proceeds use cost-basis sizing, not income-cap. This means `refinancingProceeds` in `yearlyCF` may be based on a conservative estimate. The waterfall plan is not fixing this, but tests should not assume refi proceeds are a trusted figure for validating correctness — use scenarios without refinancing for canonical proof tests.
- **Seed insert pattern** (`docs/solutions/database-issues/seed-insert-no-conflict-financial-assumptions-lost-2026-05-02.md`): not directly applicable (no new seed data), but if in future the `waterfallTiers` default is seeded to existing property rows, use the idempotent UPDATE migration pattern, not plain `INSERT`.

---

## Key Technical Decisions

- **Distributable cash flows input**: Use `Math.max(0, atcf) + (refinancingProceeds ?? 0) + exitValue` per year from `unified.yearlyCF`, not `netCashFlowToInvestors`. Two reasons: (1) `netCashFlowToInvestors` subtracts `equityInvested` in the acquisition year — feeding that to `computeWaterfall` double-counts capital since the waterfall's `return_of_capital` step also deducts `total_equity_invested`; (2) `atcf` is negative in pre-opening and ramp years (debt service exceeds NOI before stabilization) — clamping to zero treats those shortfalls as covered by reserves rather than netting them against future distributions, which is the standard non-capital-call convention for this model tier.

- **`preferred_return` sourcing**: Read from `property.ownerPriorityReturn` per the ADR-011 alias decision. Fall back to `DEFAULT_PREFERRED_RETURN = 0.08` when null. Do not add a new DB column.

- **`waterfallTiers` null fallback**: When `property.waterfallTiers` is null, use `DEFAULT_WATERFALL_TIERS` (the ADR-011 seed: Tier 1 at 12% hurdle 80/20, Tier 2 at 18% hurdle 70/30, Tier 3 at 999 hurdle 60/40). Runtime Zod validation with `waterfallTierSchema.array()` before passing to `computeWaterfall` — the JSONB column is untyped and values arrive as `unknown`.

- **`rounding_policy`**: Pass `DEFAULT_ROUNDING` (imported from `@calc/shared/utils`) explicitly when calling `computeWaterfall` directly. The dispatch layer's `withRounding` wrapper is not in play here.

- **Single-period preferred return limitation**: `computeWaterfall` computes `preferred_return_amount_target = totalEquity × preferred_return` — one year's pref, not a multi-year accrual. For a 10-year hold at 8% on $5M equity, the function targets $400K, not the conventional ~$4M (simple) or ~$5.75M (compounded). This is a limitation of the calculator, not this plan. The plan mitigates by: (a) marking `preferred_return_amount` and `preferred_return_shortfall` in the API response with clear single-period disclaimers (R10), and (b) not surfacing these fields prominently in the UI until a multi-year accrual variant is built (deferred to ADR-010). The `lp_multiple`, `gp_multiple`, `total_to_lp`, and `total_to_gp` fields use the full hold-period distributable and are not affected by this limitation.

- **`waterfallResult: null` guard**: Skip computation and set `waterfallResult: null` when `equity === 0`. This prevents division-by-zero inside the waterfall and keeps the field typed as `WaterfallOutput | null` rather than using sentinel values.

- **No portfolio-level waterfall in v1**: The `portfolio` section of `ReturnsSummary` is not extended with a waterfall aggregate. Portfolio waterfall requires consolidated LP equity inputs that do not exist yet.

---

## Open Questions

### Resolved During Planning

- **Can `ownerPriorityReturn` serve as `preferred_return`?** Yes — ADR-011 explicitly decides this alias. No new column needed.
- **What is the correct `distributable_cash_flows` input?** Gross distributable (`atcf + refiProceeds + exitValue` per year) — see Key Technical Decisions rationale above.
- **Is the OpenAPI spec involved?** No — the spec at `artifacts/api-spec/openapi.yaml` is a health-check stub; finance endpoints are not specified there.

### Deferred to Implementation

- **Exact `distributable_cash_flows` per-year construction**: Verify whether `unified.yearlyCF[y].refinancingProceeds` exists and is defined on `YearlyCashFlowResult`. Confirm field name at implementation time.
- **Magic-numbers baseline reinit**: Confirm which numeric constants need `--init` reinit after adding the new shared constants.
- **`waterfallTiers` JSONB validation**: Confirm that `waterfallTierSchema.array()` from `lib/calc/src/shared/schemas.ts` is importable in the api-server route without creating a package boundary issue (or inline the Zod shape there).

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
DB properties row
  ├── lp_equity_pct       → property.lpEquityPct
  ├── catch_up_rate       → property.catchUpRate
  ├── catch_up_to_gp_pct  → property.catchUpToGpPct
  ├── waterfall_tiers     → property.waterfallTiers (JSONB → WaterfallTier[] | null)
  └── owner_priority_return → property.ownerPriorityReturn (alias: preferred_return)

computeReturnsSummary loop (per property):
  aggregateUnifiedByYear(monthly, property, global, years)
    └── yearlyCF[y] → { atcf, refinancingProceeds, exitValue }
  
  distributable[y] = atcf + refinancingProceeds + exitValue   ← gross, not net of equity
  
  computeWaterfall({
    total_equity_invested: propertyEquityInvested(property),
    lp_equity: equity * (lpEquityPct ?? DEFAULT_LP_EQUITY_PCT),
    gp_equity: equity - lp_equity,
    distributable_cash_flows: distributable[],
    preferred_return: ownerPriorityReturn ?? DEFAULT_PREFERRED_RETURN,
    tiers: waterfallTiers ?? DEFAULT_WATERFALL_TIERS,
    catch_up_rate: catchUpRate ?? undefined,
    catch_up_to_gp_pct: catchUpToGpPct ?? undefined,
    rounding_policy: DEFAULT_ROUNDING,
  })
  → WaterfallOutput { total_to_lp, total_to_gp, lp_multiple, gp_multiple, tier_results, ... }
  
PropertyReturnMetrics ← waterfallResult: WaterfallOutput | null
  └── sent in returnsSummary via sendSuperjson(res, { ...result, returnsSummary })
```

---

## Implementation Units

- U1. **Waterfall constants and defaults**

**Goal:** Define `DEFAULT_PREFERRED_RETURN`, `DEFAULT_LP_EQUITY_PCT`, `DEFAULT_CATCH_UP_RATE`, and `DEFAULT_WATERFALL_TIERS` in shared constants, mirrored to the api-server shared copy.

**Requirements:** R3, R5

**Dependencies:** None

**Files:**
- Modify: `lib/shared/src/constants-research.ts`
- Modify: `artifacts/api-server/src/shared/constants-research.ts` (mirror — must match)

**Approach:**
- Add four exports: `DEFAULT_PREFERRED_RETURN = 0.08`, `DEFAULT_LP_EQUITY_PCT = 0.90`, `DEFAULT_CATCH_UP_RATE = 1.0`, and `DEFAULT_WATERFALL_TIERS: WaterfallTier[]` (the 3-tier ADR-011 seed: Tier 1 at 12% hurdle 80/20 LP/GP, Tier 2 at 18% hurdle 70/30, Tier 3 at 999 hurdle 60/40).
- `WaterfallTier` type imported from `@calc/analysis/waterfall` in lib/shared; in the api-server mirror, inline or re-import as appropriate for the package boundary.
- Both files must be updated in the same commit. Run the diff loop to verify they match before committing.
- After adding, run the magic-numbers ratchet init so CI does not flag the new numeric literals.

**Patterns to follow:**
- `DEFAULT_GP_CATCH_UP_TARGET_PCT = 0.20` in `lib/shared/src/constants-research.ts` — same file, same style.

**Test scenarios:**
- Test expectation: none — pure constant definition, no behavioral change.

**Verification:**
- `diff lib/shared/src/constants-research.ts artifacts/api-server/src/shared/constants-research.ts` produces no output after the edit.
- All four constants are importable from `@shared/constants` in a calc package context and from the local mirror in api-server context.

---

- U2. **Extend `PropertyInput` type and DB schema type safety**

**Goal:** Add the four waterfall fields to `PropertyInput` in `lib/engine/src/types.ts` so the route can read them with TypeScript type safety. Add `.$type<WaterfallTier[]>()` to the `waterfallTiers` Drizzle column so Drizzle's inferred type is correct.

**Requirements:** R6

**Dependencies:** U1 (WaterfallTier type must be importable)

**Files:**
- Modify: `lib/engine/src/types.ts`
- Modify: `lib/db/src/schema/properties.ts`

**Approach:**
- In `lib/engine/src/types.ts`: add `lpEquityPct?: number | null`, `catchUpRate?: number | null`, `catchUpToGpPct?: number | null`, `waterfallTiers?: WaterfallTier[] | null` to `PropertyInput`. Import `WaterfallTier` from `@calc/analysis/waterfall` (or from `lib/shared` if re-exported there).
- In `lib/db/src/schema/properties.ts`: change `waterfallTiers: jsonb("waterfall_tiers")` to `waterfallTiers: jsonb("waterfall_tiers").$type<WaterfallTier[] | null>()` so the ORM infers the correct type on select.
- No migration — columns already exist.

**Patterns to follow:**
- Existing optional fields in `PropertyInput` (e.g., `buildingImprovements?: number`, `preOpeningCosts?: number`).
- `.$type<>()` usage pattern: search for `.$type<` in `lib/db/src/schema/` for existing JSONB typed columns.

**Test scenarios:**
- Test expectation: none — type-only change with no runtime behavior. TypeScript compilation verifying no errors is the check.

**Verification:**
- `pnpm tsc --noEmit` (or equivalent) passes without errors in `lib/engine` and `lib/db` packages.
- `PropertyInput` fields `lpEquityPct`, `catchUpRate`, `catchUpToGpPct`, `waterfallTiers` are recognized without casting in the route.

---

- U3. **Wire `computeWaterfall` into `computeReturnsSummary`**

**Goal:** Extend `PropertyReturnMetrics` with `waterfallResult: WaterfallOutput | null` and compute the waterfall for each property inside the existing per-property loop in `computeReturnsSummary`.

**Requirements:** R1, R2, R3, R4

**Dependencies:** U1, U2

**Files:**
- Modify: `artifacts/api-server/src/routes/finance.ts`
- Test: `artifacts/api-server/src/tests/proof/engine-integrity-fixes.test.ts`

**Approach:**
- Import `computeWaterfall`, `WaterfallOutput` from `@calc/analysis/waterfall` and `DEFAULT_ROUNDING` from `@calc/shared/utils`.
- Import `DEFAULT_PREFERRED_RETURN`, `DEFAULT_LP_EQUITY_PCT`, `DEFAULT_CATCH_UP_RATE`, `DEFAULT_WATERFALL_TIERS` from the api-server shared mirror (use the same import style as `DEFAULT_GP_CATCH_UP_TARGET_PCT` in this file).
- Extend `PropertyReturnMetrics` interface with `waterfallResult: WaterfallOutput | null`.
- Add explicit Zod fields to `propertyInputSchema` for `lpEquityPct: z.number().min(0).max(1).nullable().optional()`, `catchUpRate: z.number().min(0).max(1).nullable().optional()`, `catchUpToGpPct: z.number().min(0).max(1).nullable().optional()`. This ensures out-of-range values (e.g., `lpEquityPct > 1`) are rejected before reaching the waterfall and cannot produce negative GP equity.
- In the loop in `computeReturnsSummary`, after `unified` and `equity` are computed:
  1. Build `distributable` vector: `unified.yearlyCF.map(y => Math.max(0, y.atcf) + (y.refinancingProceeds ?? 0) + y.exitValue)`. ATCF is clamped to zero to treat pre-opening/ramp shortfalls as reserve-funded, not netted against distributions.
  2. Guard: if `equity === 0`, set `waterfallResult = null` and skip.
  3. Derive `lpEquityPct = property.lpEquityPct ?? DEFAULT_LP_EQUITY_PCT`.
  4. Validate `property.waterfallTiers` with runtime check (parse with Zod or `Array.isArray` guard); fall back to `DEFAULT_WATERFALL_TIERS` on null or invalid.
  5. Call `computeWaterfall({ total_equity_invested: equity, lp_equity: equity * lpEquityPct, gp_equity: equity * (1 - lpEquityPct), distributable_cash_flows: distributable, preferred_return: property.ownerPriorityReturn ?? DEFAULT_PREFERRED_RETURN, tiers, catch_up_rate: property.catchUpRate ?? undefined, catch_up_to_gp_pct: property.catchUpToGpPct ?? undefined, rounding_policy: DEFAULT_ROUNDING })`.
  6. Add inline comment on `waterfallResult.preferred_return_amount` in the `PropertyReturnMetrics` interface: "single-period approximation — equals totalEquity × preferredReturn for one year, not a multi-year accrual."
  7. Catch any exception from `computeWaterfall` and set `waterfallResult = null` with a logged warning — the waterfall must not crash the main finance response.

**Execution note:** Handle the try/catch for waterfall specifically — do not let a waterfall computation failure propagate to the route handler's outer catch, which would return a 500 for the whole finance response.

**Patterns to follow:**
- IRR guard pattern (lines ~256–261 in finance.ts): `hasPositiveFlow && hasNegativeFlow` check before computing — use a similar equity guard.
- `withRounding` pattern in dispatch.ts: model `DEFAULT_ROUNDING` injection after this.

**Test scenarios:**
- Happy path — analytical pin: a zero-debt, zero-refi property, `purchasePrice=$1,000,000`, `lpEquityPct=0.80`, `ownerPriorityReturn=0.08`, single tier `{hurdle_irr:999, lp_split:0.70, gp_split:0.30}`, ATCF every year = $100,000, projection 5 years, exit value = $200,000. Distributable = 5 × $100K + $200K = $700,000. `return_of_capital = min($700K, $1M) = $700K`. `preferred_return_target = $1M × 0.08 = $80K` — shortfall = $80K (distributable exhausted at ROC). `total_to_lp = ROC × 0.80 = $560,000`, `total_to_gp = $140,000`. Assert each intermediate with `toBeCloseTo` and derivation comment. Assert `total_to_lp + total_to_gp` === `total_distributable` (identity).
- Happy path — pref satisfied: same property but distributable = $1,500,000 (large exit). Step through: ROC = $1M, remaining = $500K; pref = $80K paid to LP, remaining = $420K; no catch-up (single tier to residual); tier = $420K split 70/30 → LP $294K, GP $126K. Total LP = $800K + $80K + $294K = $1,174K. Assert all five intermediate values.
- Edge case — null waterfall tiers: property with `waterfallTiers: null`. Assert `tier_results.length === 3`, `tier_results[0].hurdle_irr === 0.12`, `tier_results[0].lp_split === 0.80` — confirms DEFAULT_WATERFALL_TIERS was used.
- Edge case — zero equity: `purchasePrice=0`. Assert `waterfallResult === null` without throwing.
- Edge case — negative ATCF year: ATCF year 1 = −$50,000 (ramp year). Assert that `distributable[0] === 0` (clamped) and the total distributable does NOT include the negative value — the shortfall does not reduce LP distributions.
- Error path — malformed waterfallTiers JSONB: `waterfallTiers = "invalid"` (a non-array). Assert `tier_results.length === 3` (fallback to DEFAULT_WATERFALL_TIERS) rather than throwing.
- Error path — lpEquityPct out of range: `lpEquityPct = 1.5` sent in request body. Assert Zod schema rejects the request with a 400 before `computeReturnsSummary` is called.
- Integration: `returnsSummary.properties[i].waterfallResult` is non-null for a well-configured property in the POST /api/finance/compute response. Existing `irr`, `equityMultiple`, `cashOnCash` values are unchanged (no regression).

**Verification:**
- `returnsSummary.properties[i].waterfallResult` is present in the API response for a property with nonzero equity and valid inputs.
- Adding a property with zero equity does not crash the endpoint.
- Existing IRR, equityMultiple, and cashOnCash values in `PropertyReturnMetrics` are unchanged by this addition (no regression).

---

- U4. **Extend frontend type `ServerReturnsSummary`**

**Goal:** Add `waterfallResult?: WaterfallOutput | null` to the `properties[]` type in `ServerReturnsSummary` so the React portal type-checks against the extended server response.

**Requirements:** R7

**Dependencies:** U3 (shape is defined by server response)

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/hooks/useServerFinancials.ts`

**Approach:**
- Import or inline the `WaterfallOutput` type from `@calc/analysis/waterfall` (or a shared type file if the portal has access to `lib/calc` types).
- Add `waterfallResult?: WaterfallOutput | null` to the per-property type inside `ServerReturnsSummary`.
- No component changes in scope — this plan only wires the data to the API boundary. Rendering the waterfall breakdown in the UI is deferred.

**Patterns to follow:**
- Existing optional nullable fields in the `ServerReturnsSummary` portal type.

**Test scenarios:**
- Test expectation: none — type-only change. TypeScript compilation in the portal package is the check.

**Verification:**
- `pnpm tsc --noEmit` passes in the portal package.
- No existing components are broken (they may use `?.waterfallResult` safely due to optional typing).

---

## System-Wide Impact

- **Interaction graph:** `computeReturnsSummary` is called from `POST /api/finance/compute` only. The single-property routes (`/api/finance/property/:id`, `/api/finance/property/:id/exits`) do not call this function and are not affected.
- **Error propagation:** Waterfall failure must be caught locally (per U3 approach note) — a malformed `waterfallTiers` JSONB value must not crash the overall finance response. Set `waterfallResult: null` and log a warning on any exception.
- **State lifecycle risks:** None — `computeWaterfall` is a pure function; no state mutation.
- **API surface parity:** The `returnsSummary` shape is consumed by the portal's `useServerFinancials.ts` hook. U4 covers the type extension; the existing superjson serialization handles the new field automatically.
- **Unchanged invariants:** `irr`, `equityMultiple`, `cashOnCash`, `equityInvested`, `exitValue`, `netCashFlowsByYear` in `PropertyReturnMetrics` are additive — nothing is removed or changed in the existing fields. The portfolio section of `ReturnsSummary` is not modified.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `preferred_return` double-meaning: `ownerPriorityReturn` drives the engine priority-hurdle loop AND now the waterfall. If a user sets it to a very low value (e.g., 0%), the waterfall pref step passes through zero, which is valid math but may produce a confusing tier breakdown. | No mitigation needed in this plan — the waterfall renders what it receives. Future Specialist R can surface guidance. |
| `refinancingProceeds` may not exist on all `YearlyCashFlowResult` implementations — confirm field name during implementation. | U3 uses `y.refinancingProceeds ?? 0` null-coalesce to guard. |
| MAJOR-2 (refi sizing uses cost-basis): refi proceeds in `yearlyCF` may be lower than income-cap value. | Proof test avoids refinancing scenarios — use zero-debt, zero-refi property fixtures. Add a code comment noting the dependency on MAJOR-2 resolution for refi scenarios. |
| Mirror sync drift: a future developer adds a constant to `lib/shared/src/` without updating the api-server mirror. | **Accepted risk.** Documentation (comment at top of constants file) and the diff-loop from the learnings doc are the only guards — neither is enforced in CI. Consider adding a cross-import vitest that asserts `DEFAULT_WATERFALL_TIERS` from both paths are deep-equal; if not added here, track as follow-up. |
| `preferred_return_amount` misinterpreted as full hold-period pref satisfaction. | Marked as single-period approximation in the `PropertyReturnMetrics` interface comment (R10). Do not surface this field in LP-facing UI until multi-year accrual is built (ADR-010). |
| `waterfallTiers` JSONB from the DB may contain stale or malformed shapes if Zod schema evolves. | Runtime validation with fallback to `DEFAULT_WATERFALL_TIERS` ensures stability. |

---

## Sources & References

- ADR-011: `docs/architecture/decisions/ADR-011-waterfall-schema.md`
- ADR-010 (roadmap, not in scope): `docs/architecture/decisions/ADR-010-returns-and-distributions-specialists.md`
- Financial engine audit findings: `docs/solutions/logic-errors/financial-engine-audit-findings-2026-05-04.md`
- Mirror sync learning: `docs/solutions/tooling/mirror-shared-package-sync.md`
- Proof-test standards skill: `.agents/skills/hplus-proof-test-standards/SKILL.md`
- Magic-numbers ratchet: `docs/solutions/tooling/magic-numbers-ratchet-improvements.md`
- `computeWaterfall`: `lib/calc/src/analysis/waterfall.ts`
- Integration point: `artifacts/api-server/src/routes/finance.ts` (function `computeReturnsSummary`)
- `PropertyInput`: `lib/engine/src/types.ts`
- DB schema: `lib/db/src/schema/properties.ts` (lines 299–306)
- Frontend type: `artifacts/hospitality-business-portal/src/hooks/useServerFinancials.ts`
