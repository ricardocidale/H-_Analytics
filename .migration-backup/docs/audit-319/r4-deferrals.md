# Audit #319 R4 — Deferred Splits

Two files >1000 lines remain unsplit at the close of R4. Each is a single-component or single-orchestrator monolith with state coupling that cannot be safely extracted under R4's "no test/workflow regression" constraint. (Three other deferrals — `data-routing.ts`, `risk-intelligence.ts`, and the earlier `regulatory-data.ts` / `ModelConstantsTab.tsx` — have since been split in follow-up tasks.)

## Status snapshot (post-R4)

| File | Lines | Decision |
| --- | --- | --- |
| `shared/regulatory-data.ts` | 1169 → 185 | DONE (T007) |
| `client/src/components/admin/model-defaults/ModelConstantsTab.tsx` | 1053 → 409 | DONE (T006) |
| `client/src/pages/CompanyAssumptions.tsx` | 1117 | **DEFERRED** |
| `server/storage/intelligence-v2.ts` | 1199 | **DEFERRED** |
| `server/ai/data-routing.ts` | 1150 → 192 | DONE (T470) |
| `server/ai/risk-intelligence.ts` | 1012 → 235 | DONE (T473) |

All gates remain PASS UNQUALIFIED; `audit:quick` reports 0 critical, prop `:any` count = 9 (objective ≤ 40 met).

## CompanyAssumptions.tsx (1117 lines) — Deferred

**Why not split now:**

- The file is a *single* `export default function CompanyAssumptions()` body (line 143 → 1117). There are no internal sub-components, no tabbed `TabsContent` seams beyond a single block, and no factored hooks.
- The component owns ~12 stateful hooks (`useState`, `useGlobalAssumptions`, `useUpdateGlobalAssumptions`, `useCompanyResearchStream`, `usePageVisit`, `useScenarioDirtyState`, `useQueryClient`, `useAuth`, `useToast`, plus dirty-field tracking). Every JSX subtree references at least 3 of these closures.
- Extraction without first introducing a dedicated hook layer (e.g. `useCompanyAssumptionsForm`, `useAnalystCoordination`) would require prop-drilling 15+ values per child, generating more risk than the current monolith.

**Required precursor before split (next audit cycle):**

1. Extract a `useCompanyAssumptionsForm()` hook (formData / dirty / save) — ~150 lines.
2. Extract a `useCompanyAnalyst()` hook (research stream + error mapping + page-visit) — ~80 lines.
3. After (1) and (2) the JSX body becomes presentational and naturally splits into ~3 section files (Overview, Financial Defaults, Analyst Theater).

## server/storage/intelligence-v2.ts (1199 lines) — Deferred

**Why not split now:**

- Implements a single `IntelligenceV2Storage` class with ~30 inter-dependent methods sharing a private cache, transaction helpers, and a normalized row mapper.
- The file is the sole implementation behind `IIntelligenceStorage` consumed by 14 routes and 6 schedulers; any seam introduced becomes a new public contract that downstream callers will pin to.
- All current methods touch the same `db` handle; splitting by domain (constants vs research-runs vs proposals) would force a shared-transaction redesign first.

**Required precursor:** introduce a transaction-scoped session object (`IntelligenceTx`) so domain modules can be split without losing transactional guarantees.

## server/ai/data-routing.ts (1150 → 192 lines) — DONE (T470)

The original deferral text described a hypothetical model-router shape (`pickModel` / `recordDecision` / `applyAdminOverride` / `enforceBudget` / `recentDecisions`) that was never actually present in the file. The file on disk was — and still is — the **smart data router**: a routing table mapping assumption fields to external services, with a per-service dispatcher and progressive-relaxation fallback.

The spirit of the precursor still applied: an in-module mutable cache (`_enabledMap` + `_enabledMapFetchedAt`) was the only state coupling that prevented a clean split. T470 extracted that cache into an **injectable integration-status sink** and then split the file along its existing section boundaries:

- `server/ai/data-routing/types.ts` — shared types
- `server/ai/data-routing/routing-table.ts` — `DATA_ROUTING_TABLE` (pure data)
- `server/ai/data-routing/integration-status-sink.ts` — `IntegrationStatusSink` interface + default TTL-cached implementation, with `getIntegrationStatusSink` / `setIntegrationStatusSink` for tests
- `server/ai/data-routing/service-registry.ts` — lazy service singletons + `isServiceEnabled` (consumes the sink)
- `server/ai/data-routing/relaxation.ts` — `buildRelaxedContexts`, `relaxQualityTier`, `confidenceFromRelaxation`
- `server/ai/data-routing/dispatchers.ts` — `callServiceForField` + `buildFieldSpecificQuery`
- `server/ai/data-routing.ts` — orchestrator (`fetchFieldData`, `fetchMultipleFields`, plus utility exports). Re-exports the public types/values so existing callers (`research-data-injector.ts`, `routes/research.ts`, the test suite) need no changes.

All 30 `tests/ai/data-routing.test.ts` tests and the 17 `tests/ai/research-data-injector.test.ts` tests pass. TypeScript and lint are clean.

## server/ai/risk-intelligence.ts (1012 → 235 lines) — DONE (T473)

The deferral hinged on a single coupling: every helper operated on an intermediate `RiskWorkingSet` whose only definition was private to the file, so extracting helpers meant either copying the type (drift) or growing the public surface (API churn). T473 lifted that contract first, then split along the existing section seams:

- `shared/risk-types.ts` — `RiskInsight`, `PropertyRiskBrief`, `PortfolioRiskBrief`, `MacroContext`, `RiskWorkingSet`, `PropertyFinancials`, plus the `RiskCategory` / `RiskSeverity` / `OverallRiskLevel` unions. Pure types, zero runtime.
- `server/ai/risk/benchmarks.ts` — the deterministic `BENCHMARKS` table.
- `server/ai/risk/helpers.ts` — formatting (`pct`, `money`), financial estimators, and the `buildRiskWorkingSet` session builder consumed by every generator.
- `server/ai/risk/insights-leverage.ts`, `insights-assumptions.ts`, `insights-macro.ts`, `insights-regulatory.ts`, `insights-concentration.ts`, `insights-stress.ts` — one generator per risk category, each ~95–110 lines.
- `server/ai/risk/llm-brief.ts` — deterministic property-brief builder + optional LLM narrative enhancement.
- `server/ai/risk-intelligence.ts` — thin orchestrator (`generateDeterministicInsights`, `generatePortfolioRiskBrief`, `generatePropertyRiskBrief`, `getRiskSummaryForContext`) that re-exports the public types from `@shared/risk-types` so legacy callers in `analyst-orchestrator.ts`, `intelligence-router.ts`, `routes/risk-intelligence.ts`, and the scheduler keep working unchanged.

All 10 `tests/ai/risk-intelligence.test.ts` tests pass. TypeScript (`npm run check`) and strict lint (`npm run lint:strict`) are clean.

## Acceptance against R4 objective

> "All 5 files under 500 lines OR explicitly deferred with rationale. Combined `:any` count ≤ 40. All workflows PASS UNQUALIFIED."

- 4/6 files split (regulatory-data, ModelConstantsTab, data-routing, risk-intelligence).
- 2 files deferred above (CompanyAssumptions.tsx, intelligence-v2.ts) with concrete precursor work identified.
- prop `:any` = 9 (≤ 40 ✓), `as any` budget = 18 (server 15, client 3).
- All eight workflows PASS UNQUALIFIED at commit close.
