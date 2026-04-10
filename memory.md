# H+ Analytics — Memory & Session State

## Project Identity
- **App Name**: H+ Analytics App
- **Brand**: H+ Analytics by Norfolk AI
- **AI Assistant**: Rebecca (text chat analytics AI)
- **Admin**: ricardo.cidale@norfolkgroup.io (password stored in environment secrets only)

## Architecture Decisions Log

### Task #314 Split icp-config.ts (April 2026) — COMPLETED
- **Objective**: Split 690-line monolith into focused modules per architect risk assessment
- **New files created**: `icp-types.ts` (186 lines), `icp-defaults.ts` (190 lines), `icp-sections.ts` (182 lines), `icp-units.ts` (33 lines)
- **Barrel**: `icp-config.ts` reduced to 113 lines (barrel re-exports + `generateIcpEssay`)
- **icp-prompt-builder.ts**: Updated imports to use `icp-types` and `icp-units` directly (avoids circular dependency)
- **Zero importer changes needed**: All 10 importing files use `@/components/admin/icp-config` barrel — no import path changes required
- **icp-config.ts dropped off Quick Audit "Files over 500 lines"** list (was #4, now gone)
- Health: ALL CLEAR — 4,456 tests, 0 TS errors, Lint PASS, verification UNQUALIFIED

### Task #315 Split sidebar.tsx (April 2026) — COMPLETED
- **Objective**: Split 771-line monolith into focused modules
- **New files**: `sidebar-context.tsx` (144L), `sidebar-shell.tsx` (353L), `sidebar-menu.tsx` (263L)
- **Barrel**: `sidebar.tsx` reduced to 34-line barrel, original public API only
- Health: ALL CLEAR — 4,436 tests

### Task #316 Split Scenarios.tsx (April 2026) — COMPLETED
- **Objective**: Split 737-line page into focused modules
- **New files**: `useScenarioActions.ts` (232L), `MyScenariosCard.tsx` (357L), `SharedScenariosCard.tsx` (130L), `ScenarioDialogs.tsx` (77L)
- **Orchestrator**: `Scenarios.tsx` reduced to 74 lines
- Health: ALL CLEAR — 4,436 tests

### Split shared/constants.ts (April 2026) — COMPLETED
- **Objective**: Split 764-line barrel into focused sub-files, re-exported from barrel
- **Barrel**: `shared/constants.ts` reduced to 293 lines (from 764)
- **New files**: `constants-business-models.ts` (107L), `constants-research.ts` (52L), `constants-funding.ts` (37L), `constants-enums.ts` (35L), `constants-capex.ts` (19L), `constants-staffing.ts` (17L)
- **Approach**: Sub-files define constants, barrel uses `export * from './constants-*'` — zero import path changes downstream
- **Hotel model circularity**: Inlined hotel default values (matching global DEFAULT_COST_RATE_* values) instead of referencing barrel constants, consistent with lodge/vrbo which already inline
- Health: ALL CLEAR — 4,463 tests (183 files)

### Task #317 Split pdf/render.tsx (April 2026) — COMPLETED
- **Objective**: Split 680-line monolith into focused modules
- **New files**: `theme-mappers.tsx` (57L), `chart-render.tsx` (157L), `table-render.tsx` (135L), `pagination.ts` (105L), `section-renderers.tsx` (131L)
- **Orchestrator**: `render.tsx` reduced to 125 lines
- **Deviation**: PageHeader/PageFooter/SectionDivider placed in `theme-mappers.tsx` (not `section-renderers.tsx`) to avoid circular dependency between chart-render↔section-renderers and table-render↔section-renderers
- **Snapshot tests**: 20 new tests in `tests/server/pdf-render.snapshot.test.ts` covering pagination constants, estimateSectionHeight (landscape vs portrait, all densities), splitOversizedSections, groupSectionsIntoPages, fmtCompact, monotoneCubicPath, and export integrity
- Health: ALL CLEAR — 4,463 tests (183 files)

### T013-T015 Pinecone Financial Intelligence (April 2026) — COMPLETED + ULTRAPLAN REVISION
- **T013 (Bug Fix + Tests)**: Fixed critical category→KPI mapping bug. Now uses explicit lookup table `CATEGORY_TO_KPI` (no substring matching). Null value propagates correctly (null ≠ zero).
- **T014 (Tests)**: 14 tests — score threshold, business model filtering, deterministic IDs, graceful degradation.
- **T015 (Tests)**: 16 tests — deterministic `scenario:{id}`, KPI extraction, truncation limits.
- **Ultraplan P0 fix**: Tenant-scoped vector retrieval — `userId` metadata added to `indexResearchResult`, `indexAssumptionGuidance`, `indexScenarioSummary`. Post-filter in `chat.ts` RAG loop by user's property IDs. `queryChunks`/`multiNamespaceQuery` now accept optional `filter` parameter.
- **Ultraplan P1 fix**: Replaced substring `includes()` matching with explicit `CATEGORY_TO_KPI` lookup table. Unknown categories return all-null (no false positives).
- **Ultraplan P1 fix**: Null vs zero semantics preserved — `mapCategoryToKpis(cat, null)` returns null for matched field, not 0.
- **Ultraplan P2 fix**: `computeBenchmarkFreshness()` utility — 90-day threshold, accepts Date or ISO string.
- Total: 74 tests across 3 files. 0 TS errors.
- **All phases (1-7) of Financial Integrity Plan now COMPLETE** — 19 tasks done.

### T001-T003 Calculation Audit Trail (April 2026) — COMPLETED
- **T001**: Schema + storage + routes for `calculation_audit_logs` table. Files: `shared/schema/calc-audit.ts`, `server/storage/calc-audit.ts`, `server/routes/calc-audit.ts`, migration `calc-audit-001.ts`
- **T002**: Engine instrumentation — `AuditCollector` class (`engine/property/audit-collector.ts`), `computePortfolioProjectionWithAudit()` in `server/finance/service.ts`, finance route wired (`?audit=true` bypasses cache + async persistence)
- **T002 code review fixes**: (1) Cache bypass when `audit=true`, (2) Engine decoupled from DB schema — `AuditEntry` interface in engine layer, (3) IDOR fix — calc-audit routes filter by userId, (4) Proper error logging on fire-and-forget persistence
- **T003**: Calc Audit Viewer UI — new "Calc Audit" tab in Admin > Verification section. `CalcAuditViewer.tsx` (lazy-loaded). Scenario ID search → log list → drill-down detail with expandable Property → Period → Line Items tree. Each entry: step #, label, formula, inputs, output. Inline note editor per step. Search/filter across all entries.
- Health: 4,436 tests, 0 TS errors, 0 lint, UNQUALIFIED, 0 empty catch blocks

### T019 Health Check Dashboard (April 2026) — COMPLETED
- **Pipeline Health tab** added to Admin > Verification section
- Server routes: `POST /api/admin/health-check/run` (runs TS + lint + 15-phase verify), `GET /api/admin/health-check/last`
- Rate-limited 1/min per user, admin-only, in-memory cache
- Dashboard: `HealthCheckDashboard.tsx` — opinion banner, infra cards (TS/Lint/DocHarmony), 15 phase cards with expandable failure details
- Code review fixes applied: opinion now gates on lint + TS + phases (not just TS + phases), PhaseCard uses flex-col layout, removed `as any` tab cast
- `as any` budget: server 56, client 154 (down 1 from 155)

### Deterministic Audit P2 Fixes (April 2026) — COMPLETED
- **P2-2 (Orphaned storage method)**: Removed `getScenarioResultByHash` from `financial-sharing.ts`, `financial.ts`, and `index.ts` — was fully implemented but never called from any route
- **P2-3 (IStorage interface)**: Added `getDbHealth()` method signature to `IStorage` interface — was implemented on `DatabaseStorage` but missing from the interface
- **P2-9 (Research `as any` casts)**: Eliminated all 10 `as any` instances in `server/routes/research.ts`:
  - `(property as any).hospitalityType/businessModel` → direct property access (fields exist on Property type)
  - `assetDefinition as any` → removed cast (already `Record<string, any>` from Zod)
  - `propertyContext as any` → removed cast, typed params as `ResearchParams`
  - `svcName as any` → properly typed as `"gemini" | "openai" | "anthropic"` union
- **P2-11 (Prompt injection defense)**: Added `<user_message>` XML tag delimiters around user input in both Perplexity and Gemini chat paths. Added input boundary instruction to system prompt telling LLM to only respond to content inside tags.
- **P2-4/5/6/7/10 deferred**: Schema-level advisory items (text dates, serial vs identity, N+1 fee sync, unbounded property fetch, dual sharing tables) — acceptable at current scale, would risk regressions.
- **P2-8 confirmed false positive**: All 3 types (ExportConfig, ConsolidatedYearlyJson, RawExtractionData) ARE used in schema and storage.
- Health check: ALL CLEAR — 0 TS errors, 4,054 tests (173 files), Lint PASS (0 errors), verification UNQUALIFIED

### Deterministic Audit P1 Fixes (April 2026) — COMPLETED
- **P1-1 (Waterfall div-by-zero)**: `calc/analysis/waterfall.ts:129` — added `catchUpTarget >= 1` guard before `catchUpTarget / (1 - catchUpTarget)` to prevent Infinity
- **P1-3 (Chat LLM timeouts)**: `server/routes/chat.ts` — wrapped Perplexity + Gemini API calls with `Promise.race` + `AI_GENERATION_TIMEOUT_MS` (120s)
- **P1-4 (Research hardcoded models)**: Added `OrchestratorModelOverrides` interface to `server/ai/research-orchestrator.ts`; `server/routes/research.ts` threads admin researchConfig models into orchestrator
- **Dead pages removed**: Deleted `AdminLoginLogs.tsx` (124L), `ExecutiveSummary.tsx` (595L), `GlobalResearch.tsx` (499L), `Methodology.tsx` (647L) — 1,865 lines of dead code. Kept `ComparisonView`, `TimelineView`, `FundingPredictor` (embedded in Analysis.tsx), `SensitivityAnalysis`, `FinancingAnalysis` (embedded in Analysis.tsx), `CheckerManual` (embedded in Help.tsx)
- **Dead lazy imports removed**: `GlobalResearch`, `SensitivityAnalysis`, `FinancingAnalysis`, `CheckerManual` from App.tsx (unused — components imported directly where embedded)
- **Domain boundary fix (auth.ts)**: Replaced direct `db.update(users)` with `storage.updateUserProfile()` call; removed dead `db`, `eq`, `users` imports. Added `userGroupId` to `updateUserProfile` accepted fields.
- **Remaining domain violations (deferred)**: `notifications/engine.ts` (4 db calls), `integrations/geospatial.ts` (2 db calls) — deeper refactors deferred to avoid regression risk
- **Net**: 12 files changed, 47 insertions, 1,891 deletions
- Health check: ALL CLEAR — 0 TS errors, 4,054 tests (173 files), Lint PASS, verification UNQUALIFIED

### Hospitality Company Vendors & Services Audit (April 2026) — COMPLETED
- **Scope**: Full audit of the management company's vendor/service model — schema (company_service_templates, property_fee_categories, external_integrations), storage (ServiceStorage, IntegrationStorage), routes (admin/services.ts, admin-integrations.ts), calculation engine (calc/services/), market intelligence services (21 files in server/services/), and frontend (ServicesTab, VendorCostsTab, IntegrationsTab, ServiceResearchPanel)
- **Architecture verified clean**:
  - **Cost-plus model**: Centralized services use `vendorCost = fee / (1 + markup)`, direct services keep 100% as oversight fee. Properly computed per-month in `computeCostOfServices()`.
  - **Service templates → fee categories**: Templates seed property fee categories on creation; `syncTemplatesToProperties()` fills missing categories (fill-only, respects user-set values).
  - **21 market intelligence services**: All properly extend `BaseIntegrationService` (circuit breaker, timeout, structured logging). Key router (`rapidApiKeyRouter.ts`) routes 3 RapidAPI keys to correct subscriptions.
  - **Admin integration health**: Comprehensive health check covering 14+ external services with circuit breaker state. All admin routes protected with `requireAdmin`.
  - **DB constraints**: Check constraints on rate/markup ranges (0-1), service model enum (`centralized`/`direct`).
- **Fixes applied**:
  - Removed dead `vecteezy.ts` (123 lines) — Vecteezy service was never imported or used anywhere (no route, no client reference). Seed entry in migration kept (immutable).
  - Fixed `DataPoint<any>` → `DataPoint<unknown>` in `MarketIntelligenceAggregator.ts` (function only accesses `.publishedAt`/`.fetchedAt`, doesn't need `any`)
- Health check: ALL CLEAR — 0 TS errors, 4,054 tests (173 files), Lint PASS, verification UNQUALIFIED

### Dead Replit Integration Chat/Audio Removal (April 2026) — COMPLETED
- **Scope**: Removed ~997 lines of dead code from `server/replit_integrations/chat/` (routes.ts 502L, storage.ts 64L, index.ts 3L) and `server/replit_integrations/audio/` (routes.ts 138L, client.ts 274L, index.ts 14L)
- **Why dead**: The frontend (`RebeccaPanel.tsx`, `RebeccaChatbot.tsx`) calls `/api/chat` and `/api/chat/conversations` routes from `server/routes/chat.ts` — NOT the `/api/conversations` routes from `replit_integrations/chat/routes.ts`. The audio routes were never registered (no call to `registerAudioRoutes` in routes.ts).
- **Issues fixed**: Route conflicts (both systems registered `/api/conversations` endpoints), security gap (audio routes missing `requireAuth`), separate storage layer (`chatStorage` vs main `storage`), duplicate system prompt that could drift
- **Kept**: `shared/schema/engagement.ts` (conversations + messages table definitions) — kept to avoid Drizzle dropping the tables. Tables exist in DB but are now unused.
- Health check: ALL CLEAR — 0 TS errors, 4,054 tests (173 files), Lint PASS, verification UNQUALIFIED

### Admin User Management Audit (April 2026) — COMPLETED
- **Scope**: Full audit of user/admin management — schema (users, sessions, user groups), storage (20+ methods in users.ts), routes (admin/users.ts, auth.ts), middleware (4 tiers: requireAuth, requireAdmin, requireChecker, requireManagementAccess), frontend (UsersTab, UserCardGrid, Create/Edit/Password/Invite dialogs)
- **Bugs found and fixed**:
  - Admin PATCH /api/admin/users/:id was missing email uniqueness check — could create duplicate emails. Added `getUserByEmail` check before update.
  - Admin PATCH /api/admin/users/:id was not sanitizing email (lowercase+trim) — could cause case-mismatch login failures. Added `sanitizeEmail()` call.
- **Everything else verified clean**: bcrypt 12 rounds, crypto.randomBytes session IDs, httpOnly/secure/sameSite cookies, IP rate limiting (5 attempts/15min), self-protection (can't delete self or change own role), transactional user deletion (14 tables), passwordHash stripped from all API responses, Google token encryption at rest, invitation system (temp passwords, batch limit 50), bulk reset requires confirmation phrase
- Health check: ALL CLEAR — 0 TS errors, 4,054 tests (173 files), verification UNQUALIFIED

### Google Drive Removed Entirely (April 2026) — COMPLETED
- Deleted: `client/src/pages/GoogleDrive.tsx`, `server/routes/google-drive.ts`
- Removed: Sidebar nav item, App.tsx route, server routes.ts registration, server/index.ts public paths
- Removed: Drive OAuth flow from `google-auth.ts` (kept Google Sign-In OAuth)
- Removed: `clearUserGoogleDriveTokens` storage method, `googleDriveConnected` from storage queries
- Removed: Google Drive link fields from ICP research sources (IcpSourcesPanel, useIcpResearch, icp-types, research-types, admin/research Zod schema, icp-research-helpers)
- Schema columns (`googleDriveConnected`, `googleAccessToken`, etc.) kept in database — non-destructive removal
- Net: 695 lines deleted across 17 files

### Profile Page 3-Column Layout (April 2026) — COMPLETED
- **Change**: Restructured Profile page from single-column (`max-w-2xl`) to responsive 3-column grid (`max-w-7xl`, `grid-cols-1 lg:grid-cols-3`)
- **Layout**: Column 1: Personal Information | Column 2: Appearance + Theme Preference | Column 3: Change Password
- **Checker Manual banner**: Stays full-width above the grid (admin/checker only)
- **Font grid**: Changed from `grid-cols-4` to `grid-cols-2` to fit narrower column width
- **Added**: `data-testid` attributes on all 3 password visibility toggle buttons
- **File**: `client/src/pages/Profile.tsx`

### Rebecca AI System Full Audit (April 2026) — COMPLETED
- **Scope**: Full architectural audit of the Rebecca AI assistant subsystem — schema (7 tables: conversations, messages, knowledge base, guardrails, feedback, emails, knowledge history), storage (27+ methods in intelligence-rebecca.ts), routes (20+ endpoints across chat.ts, chat-insight.ts, rebecca.ts), client UI (RebeccaPanel, RebeccaMarkdown, RichBlockRenderers, rich-block-parser), and 91 tests across 5 test files.
- **Findings (all verified safe)**:
  - Authorization: All admin routes properly protected with requireAuth + requireAdmin
  - Conversation ownership: Verified before message access in both routes and storage layer
  - Guardrails: Hard-coded + admin-configured rules properly concatenated into system prompt
  - Knowledge Base: CRUD with Pinecone sync, version history + rollback all working correctly
  - Rate limiting: Chat at 20 req/min, insight at 10 req/min per user — properly enforced
  - Rich block rendering: No XSS (react-markdown escapes HTML, no dangerouslySetInnerHTML)
  - Language detection: Heuristic-based Spanish/English detection — robust for typical usage
  - Email route: Allows arbitrary recipient emails (by design for sharing conversations, auth-gated)
- **Fixes applied**:
  - Removed all `(global as any)` type casts in chat.ts — `GlobalAssumptions` type already includes `rebeccaEnabled`, `rebeccaSystemPrompt`, `rebeccaChatEngine` as real typed columns
  - Fixed empty catch block in rebecca.ts KB stats Pinecone vector count — now logs warning
  - Fixed potential memory leak in RebeccaPanel.tsx — uncleared `setTimeout` in useEffect now properly cleaned up
- Health check: ALL CLEAR — 0 TS errors, 4,054 tests (173 files), verification UNQUALIFIED

### Scenarios System Full Audit (April 2026) — COMPLETED
- **Scope**: Full architectural audit of the scenarios subsystem — schema (4 tables), storage (30+ methods across 3 files), routes (28 endpoints across 3 files), client UI, and 261 tests across 8 files.
- **Findings (all verified safe)**:
  - Authorization: No IDOR bypass found — all load/preview/recompute paths check ownership + sharing tables
  - Access control: Dual sharing model (scenario_shares + scenario_access) properly enforced at all layers
  - Auto-save: Race condition handled via catch on unique constraint (23505) + fallback to update
  - stableLoadProperties: Preserves property IDs via stableKey matching, orphaned properties soft-archived (isActive:false)
  - Photos: By design, photos stay linked via property_id (stable across loads) — not snapshotted
  - Property URLs: Not included in snapshots (metadata lives outside scenario scope)
  - Comparison: feeCategories intentionally excluded from diff (design choice, not a bug)
- **Fixes applied**:
  - Removed double database fetch in `buildCreateSnapshotData` — was calling `getGlobalAssumptions()` + `getAllProperties()` twice per create
  - Replaced 3 `any` types in `validateLoadSnapshot` parameter with proper types (`unknown`, `Record<string, unknown[]> | null | undefined`)
- Health check: ALL CLEAR — 0 TS errors, 4,054 tests (173 files), verification UNQUALIFIED

### Audit Batch 3: intelligence-v2 + research-orchestrator splits + catch-any cleanup (April 2026) — COMPLETED
- **T001 — intelligence-v2.ts split** (709→431 lines): Extracted 27 Rebecca methods (conversations, messages, feedback, emails, guardrails, KB CRUD) to `server/storage/intelligence-rebecca.ts` (286 lines). New `IntelligenceRebeccaStorage` class wired in `server/storage/index.ts` via `private rebecca` instance.
- **T002 — research-orchestrator.ts split** (638→446 lines): Extracted `buildApiValidation` + 5 helper functions (`extractMid`, `parseStringRate`, `extractDeep`, `divergencePct`, `compareMetric`) to `server/ai/research-validation.ts` (196 lines). Re-exported from orchestrator for backward compat.
- **T003 — catch (error: any) cleanup**: Fixed 46 `catch (error: any)` / `catch (err: any)` patterns across 26 files → all now use `catch (error: unknown)` with proper type narrowing (`error instanceof Error ? error.message : String(error)`). Also fixed `isTransientError` in `integrations/base.ts` from `any` to `unknown`. Follow-up: fixed 20 additional TS18046/TS2339 errors from `error?.message` on `unknown` type across integrations (document-ai, geospatial, resend), routes (ai, chat, chat-insight, calculations, premium-exports, admin/scenarios, admin/tools), migrations (scenario-access-001), and storage (intelligence-v2 missing `isNull` import).
- **Upload restriction**: All file uploads restricted to image-only (PNG, JPEG, GIF, WebP, SVG, BMP, TIFF). Client-side `validateImageFile()` in `use-upload.ts` shows toast with file name and allowed formats. Server returns user-friendly "Only image files are supported" error. Admin panels (SourcesTab, IcpSourcesPanel, DocumentExtractionPanel) all updated.
- **New files**: `server/storage/intelligence-rebecca.ts`, `server/ai/research-validation.ts`

### File Splits Batch 2: scenarios.ts + research.ts (April 2026) — COMPLETED
- **scenarios.ts split** (713→491 lines): Extracted recompute/drift-check/results + access control routes to `server/routes/scenarios-access.ts` (235 lines). Updated static analysis test to include new file.
- **research.ts split** (737→588 lines): Extracted freshness counts, avg-duration, last-refresh, mark-refresh, refresh-config, research-questions CRUD to `server/routes/research-meta.ts` (159 lines). Remaining 588 lines dominated by 460-line SSE streaming generate endpoint.
- Health check: ALL CLEAR — 0 TS errors, 4,054 tests (173 files), verification UNQUALIFIED

### File Splits, dDiv Safety & Cleanup (April 2026) — COMPLETED
- **T001 — properties.ts split** (866→499 lines): Extracted URL routes to `server/routes/properties-urls.ts` (333 lines). Main file delegates via `registerPropertyUrlRoutes(app)`.
- **T002 — pinecone-service.ts split** (833→354 lines): Extracted 12 domain indexing functions to `server/ai/pinecone-indexing.ts` (466 lines). Main file re-exports for backward compatibility.
- **T003 — ScenariosTab.tsx split** (753→388 lines): Extracted `DeletedScenariosSection` + `DefaultScenariosSection` to `ScenariosTabSections.tsx` (358 lines). Cleaned up unused imports.
- **T004 — dDiv safety**: Added optional `label` parameter; logs `console.warn` on div-by-zero in non-production mode.
- **T005 — LB_Hospitality**: Deleted 96MB stale directory (copy of codebase).
- **T006 — npm audit**: 25→12 vulnerabilities. Critical eliminated (1→0), high reduced (10→2). Remaining 2 high are `xlsx` with no fix available.
- Health check: ALL CLEAR — 0 TS errors, 4,054 tests (173 files), verification UNQUALIFIED

### Audit Remediation: Critical & High Priority Fixes (April 2026) — COMPLETED
- **Access control**: `/api/fee-categories/all` and `/api/property-urls/all` upgraded from `requireAuth` to `requireAdmin` (cross-tenant data exposure fix)
- **Credential leak**: Removed hardcoded admin password from `memory.md`
- **N+1 query**: Admin coverage endpoint now uses single `getAllAssumptionGuidanceForScenario()` batch query instead of per-property `getAssumptionGuidance()` loop. New method in `server/storage/intelligence-v2.ts`.
- **In-memory filtering**: `financial-sharing.ts` `getAllScenarios()` now pushes group/company filters into SQL WHERE clause on `scenarioShares` instead of fetching entire table
- **WACC rounding drift**: `computePortfolioWACC` now uses raw (unrounded) per-property WACC values for capital weighting before final `roundTo()`, eliminating compounded rounding error
- Health check: ALL CLEAR — 0 TS errors, 4,054 tests (173 files), verification UNQUALIFIED

### Task #312: Empty Catches, Lazy-Loading & File Splits (April 2026) — COMPLETED
- **T001 — Empty catch blocks**: Fixed 5 empty catches: `chat.ts` (lines 660, 682, 725) now use `logger.warn(...)`, `RebeccaPanel.tsx` (lines 65, 428) now use `console.warn(...)`.
- **T002 — Lazy-loading**: Dashboard (5 tab components), Company (4 tab components), Scenarios (5 dialog components) all converted to `React.lazy()` with `<Suspense>` boundaries.
- **T003 — chat.ts split** (889→507 lines): Extracted `chat-prompts.ts` (prompt constants, `detectLanguage`, `generateFollowUpChips`, `deriveContextType`, `deriveContextKey`) and `chat-insight.ts` (`/api/rebecca/insight` endpoint). Main `chat.ts` imports and delegates.
- **T004 — financial.ts split** (1061→492 lines): Extracted `financial-sharing.ts` (20 sharing/access/results methods) and `financial-fees.ts` (fee category CRUD + `compareScenarios`). Circular dependency avoided by inlining `getGlobalAssumptions` in `FinancialSharingStorage`.
- **T005 — intelligence.ts split** (1131→224 lines): Extracted `intelligence-sources.ts`, `intelligence-scheduled.ts`, `intelligence-pinecone.ts`, `intelligence-qa.ts` (QA preview/live-test + key rotation routes).
- **New files**: `server/routes/chat-prompts.ts`, `server/routes/chat-insight.ts`, `server/routes/admin/intelligence-sources.ts`, `server/routes/admin/intelligence-scheduled.ts`, `server/routes/admin/intelligence-pinecone.ts`, `server/routes/admin/intelligence-qa.ts`, `server/storage/financial-sharing.ts`, `server/storage/financial-fees.ts`
- Health check: ALL CLEAR — 0 TS errors, 4,054 tests (173 files), verification UNQUALIFIED

### Task #311: Calc Dispatch Validation & ADR Zero-Guard (April 2026) — COMPLETED
- **Dispatch schemas**: Added 26 Zod input schemas to `calc/shared/schemas.ts` for all previously unvalidated tools: waterfall, hold-vs-sell, stress-test, capex-reserve, revpar-index, debt-yield, dscr, prepayment, sensitivity, compare-loans, interest-rate-swap, centralized-service-margin, cost-of-services, property-metrics, depreciation-basis, debt-capacity, occupancy-ramp, adr-projection, cap-rate-valuation, cost-benchmarks, service-fee, markup-waterfall, make-vs-buy, wacc, portfolio-wacc, mirr.
- **Schema registration**: All 38 tools in `calc/dispatch.ts` now have input validation — every dispatch call goes through `safeParse()` before reaching the handler.
- **ADR zero-guard**: `calc/research/adr-projection.ts` lines 52 and 71 now return 0% growth when `start_adr === 0` instead of producing Infinity.
- **Tests**: 7 new tests in `tests/calc/dispatch.test.ts` — zero-ADR edge case, valid ADR projection, schema coverage (all 38 tools reject invalid input), and specific rejection tests for DCF, waterfall, MIRR, and DSCR.
- **make-vs-buy schema**: `unitCount` uses `.min(0)` not `.positive()` because the function gracefully handles zero units.
- Health check: ALL CLEAR — 0 TS errors, 4,054 tests (173 files), verification UNQUALIFIED

### Task #310: Scheduled Research Authorization Gaps (April 2026) — COMPLETED
- **Backend**: Changed `/api/research/scheduled/check-stale` and `/api/research/scheduled/:id/execute` from `requireAuth` to `requireAdmin` in `server/routes/admin/intelligence.ts`. These endpoints expose internal workflow metadata and trigger costly AI research operations.
- **Frontend**: Added `user.role !== "admin"` guard to `ScheduledResearchGate` in `App.tsx` so non-admin users don't even make the stale-check request.
- **Audit scan**: Verified no other `requireAuth` routes in `server/routes/admin/` expose admin-level operations (execute, purge, reset, seed, etc.).
- Health check: ALL CLEAR — 0 TS errors, 4,047 tests (173 files), verification UNQUALIFIED

### Deep Codebase Audit Fixes (April 2026) — COMPLETED
- **T001 — IDOR/Authorization hardening**: Added `checkPropertyAccess` to property-photos (GET image access check + photo ownership in PATCH/DELETE), uploads (process-image), documents (extract + field status write-before-check fix), geospatial (geocode). Sanitized error messages in export-generate and premium-exports (generic messages instead of leaking internals). Added `getExtractionField()` single-field lookup to document storage.
- **T002 — Graceful shutdown + migration fail-safe**: Migration failures now fatal (`process.exit(1)`). All 4 `setInterval` calls wrapped in `intervalHandles[]` array. SIGTERM/SIGINT handler clears intervals, closes HTTP server, ends DB pool with 10s forced exit timeout.
- **T003 — Financial engine safety**: `dDiv()` now guards non-finite inputs (NaN/Infinity) returning 0 before reaching Decimal.js. DSCR calculator returns 0 instead of Infinity when `isFullIO && monthlyRate===0`. MIRR computation adds non-finite intermediate check on `fvPositive`/`pvNegative` before final calculation.
- **T004 — Atomic operations**: `updateUserPassword()` now wraps password hash update + session invalidation in a database transaction. `upsertMarketResearch()` wraps SELECT-then-INSERT/UPDATE in a transaction to prevent race conditions.
- **T005 — Frontend code splitting + ref fix**: `App.tsx` fixed `useState<any>(null)` used as mutable ref → `useRef<any>(null)` with `.current` access. `Admin.tsx` converted all 20 admin tab imports to `React.lazy()` with `<Suspense>` fallback spinner.
- **Files changed**: `server/index.ts`, `server/routes/property-photos.ts`, `server/routes/uploads.ts`, `server/routes/documents.ts`, `server/routes/geospatial.ts`, `server/routes/export-generate.ts`, `server/routes/premium-exports.ts`, `server/storage/users.ts`, `server/storage/research.ts`, `server/storage/documents.ts`, `server/storage/index.ts`, `calc/shared/decimal.ts`, `calc/financing/dscr-calculator.ts`, `calc/returns/mirr.ts`, `client/src/App.tsx`, `client/src/pages/Admin.tsx`, `tests/exports/premium-export.test.ts`
- Health check: ALL CLEAR — 0 TS errors, 4,047 tests (173 files), verification UNQUALIFIED

### Task #308: Response Mode & Conversation Analytics (April 2026) — COMPLETED
- **Response mode backend**: Added `responseMode` param to `chatRequestSchema` in `chat.ts` (concise/standard/detailed, default standard). Mode-specific token budgets (concise=200, standard=450, detailed=800) applied to both Gemini `maxOutputTokens` and Perplexity `max_tokens`. Mode-specific system prompt overlays: concise forces plain text + headline answers, detailed allows 2 rich blocks + thorough analysis.
- **Response mode frontend**: Added segmented mode selector in `RebeccaPanel.tsx` header (below SheetHeader, above context card). Icons: Zap/AlignLeft/BookOpen. State persisted to `localStorage` key `rebecca-response-mode`. Mode sent with all `/api/chat` calls (`responseMode` field).
- **Model attribution**: `updateRebeccaConversationModel()` added to `intelligence-v2.ts` and bound in `storage/index.ts`. Called in `chat.ts` for both Perplexity (`perplexity:sonar`) and Gemini/resolved vendor models. Conversation `model` column now populated on every chat.
- **Message metadata**: Assistant messages now store `responseMode`, `model` (resolvedModelName), and `engine` in JSONB `metadata` column via `addRebeccaMessage`.
- **Language detection**: Robust `detectLanguage()` in `chat.ts` — scores Spanish common words + diacritical markers (regex), threshold ≥2 score → "es". Stores `language: "es"|"en"` in user message metadata for analytics. Persists to `rebecca_conversations.language` column via `updateRebeccaConversationLanguage()`.
- **Multilingual Spanish overlay**: `SPANISH_MULTILINGUAL_OVERLAY` const in `chat.ts` — appended to system prompt when `detectedLanguage === "es"`. Covers: personality pillars in Spanish, voice register (banned phrases), financial glossary (NOI→Ingreso Operativo Neto, etc.), formatting rules (Fuentes:, Referencia, Proyectado, Valor).
- **Spanish follow-up chips**: `generateFollowUpChips()` accepts `language` param — returns Spanish chips when "es" (e.g., "¿Por qué este rango?", "Mostrar comparables").
- **Language badge**: "ES" teal badge on assistant messages when `detectedLanguage === "es"` in `RebeccaPanel.tsx`. `locale` prop passed to `RebeccaMarkdown`.
- **Rich block i18n labels**: `LABELS` in `RichBlockRenderers.tsx` expanded: source/Fuente, benchmark/Referencia, value/Valor, projected/Proyectado, period/Período, metric/Métrica, insight/Observación, current/Actual, recommended/Recomendado, difference/Diferencia.
- **DB migration**: `rebecca-language-001.ts` adds `language text DEFAULT 'en'` column to `rebecca_conversations`. Registered in `server/index.ts`.
- **API response**: `/api/chat` response now includes `detectedLanguage` field.
- **Analytics API**: Added `GET /api/rebecca/analytics` (admin-only) in `rebecca.ts`. Single-pass efficient query: fetches all conversations + all message stats in parallel (no N+1). Computes: totalConversations, totalMessages, uniqueUsers, avgTurnsPerConversation, medianTurns, singleTurnRate (≤2 msgs), deepConversationRate (≥5 turns), contextBreakdown, topicBreakdown, languageBreakdown, modelBreakdown, responseModeBreakdown, dailyVolumes (last 30 days), feedbackBreakdown, totalFeedback.
- **Analytics storage**: `getAllRebeccaMessageStats()` returns conversationId + role + createdAt + metadata from all messages. Bound in `storage/index.ts`.
- **Analytics UI**: `RebeccaAnalyticsTab.tsx` — 4 stat cards (Conversations/Messages/Users/Avg Turns), 4 quality metric cards (SingleTurn%/DeepConv%/MedianTurns/Feedback), daily volume ComposedChart (bars=conversations, area=messages), 6 PieCharts (context/feedback/model attribution/response mode/topic distribution/language breakdown). H+ design system colors.
- **Tab registration**: Analytics added as 6th tab in `RebeccaAdminTabs.tsx` (IconTrendingUp icon).
- **Code review fix**: Replaced N+1 serial message fetches with single `getAllRebeccaMessageStats()` query + `Promise.all`.
- **Files**: chat.ts, RebeccaPanel.tsx, rebecca.ts, RebeccaAnalyticsTab.tsx (new), RebeccaAdminTabs.tsx, intelligence-v2.ts, storage/index.ts
- Health check: 0 TS errors, 4,047 tests (173 files), verification UNQUALIFIED

### Skills & Documentation Update (April 2026) — COMPLETED
- **Rebecca chatbot skill updated**: `.claude/skills/rebecca-chatbot/SKILL.md` — comprehensive rewrite covering all Tasks #305-#307 (personality, guardrails, KB CRUD, rich blocks, 5 admin tabs, Pinecone sync, constraints table)
- **Rebecca chatbot skill created**: `.agents/skills/rebecca-chatbot/SKILL.md` — Agent Skills spec-compliant version for `.agents/` skills directory
- **Admin configurator updated**: `.agents/skills/admin-configurator/SKILL.md` — AI Assistant group now shows all 5 tabs (Configuration, Knowledge Base, Guardrails, Conversations, Feedback)
- **replit.md updated**: Added Rebecca Rich Blocks, Knowledge Base, and Guardrails to Key Rules section. Added Rebecca Chatbot to Skill Router table.
- **claude.md updated**: Recent Changes (April 8) section added for Tasks #305-#307. Rebecca Enhancement Layer section added under Phase 4. Skill Router entry updated.
- **memory.md updated**: Skills update entry added

### Task #307: Rebecca Rich Message Formatting (April 2026) — COMPLETED
- **Block parser**: `rich-block-parser.ts` — regex-based parser detects `:::blockType ... :::` patterns, extracts structured data, returns AST of mixed markdown + rich block nodes. Supports 5 block types: stat, compare, timeline, insight, kpi. Fenced code blocks are masked to prevent false positives.
- **Block renderers**: `RichBlockRenderers.tsx` — 5 styled React components (StatBlock, CompareBlock, TimelineBlock, InsightBlock, KpiBlock) using H+ Analytics design system (navy #112548 headers, teal #0091AE accents, gold #FDB817 highlights, Poppins typography). Each has `locale` prop for future i18n. Data-testids: rich-block-stat/compare/timeline/insight/kpi.
- **Markdown integration**: `RebeccaMarkdown.tsx` updated to parse rich blocks via `parseRichBlocks()`, rendering RichBlock components inline with standard ReactMarkdown. Added `locale` prop.
- **System prompt**: Added "Rich Visual Blocks" section to DEFAULT_SYSTEM_PROMPT in `chat.ts` — block syntax examples, when to use each type, max 1 block per response rule, conversational context requirement, skip-for-simple-answers rule.
- **Code review fix**: Added fenced code block masking to prevent `:::` inside code blocks from being parsed as rich blocks.
- **Files**: rich-block-parser.ts, RichBlockRenderers.tsx, RebeccaMarkdown.tsx, chat.ts
- Health check: ALL CLEAR — 0 TS errors, 4,047 tests (173 files), verification UNQUALIFIED

### Task #306: Rebecca Knowledge Base CRUD (April 2026) — COMPLETED
- **Schema**: `rebeccaKnowledgeBase` table (id, title, content, category, source, tags, priority, isActive, createdAt, updatedAt) and `rebeccaKnowledgeHistory` table (id, entryId FK, snapshot jsonb, changedBy, createdAt) in `shared/schema/intelligence-v2.ts`. Insert schemas via `drizzle-zod` with `.pick()`, types exported.
- **Storage CRUD**: `IntelligenceV2Storage` methods: listRebeccaKBEntries (optional category filter), getRebeccaKBEntry, createRebeccaKBEntry, updateRebeccaKBEntry (auto-snapshots to history), deleteRebeccaKBEntry (cascades history), getRebeccaKBHistory, rollbackRebeccaKBEntry, getRebeccaKBStats. Bound via `server/storage/index.ts`.
- **API routes** (`server/routes/rebecca.ts`): GET /api/rebecca/kb (list, optional ?category), GET /api/rebecca/kb/stats (total/active/vectorCount/byCategory), POST /api/rebecca/kb (create), PATCH /api/rebecca/kb/:id (update), DELETE /api/rebecca/kb/:id, GET /api/rebecca/kb/:id/history, POST /api/rebecca/kb/:id/rollback/:historyId. All admin-only with Zod validation.
- **Pinecone sync**: Non-blocking `syncKBEntryToPinecone()` helper upserts to `knowledge-base` namespace with ID pattern `admin-kb:{entryId}`. Active entries upserted, inactive entries deleted from vectors. Delete route removes vectors.
- **Seed migration**: `rebecca-kb-001.ts` seeds 26 entries from `kb-content.ts` into DB, registered with key `rebecca_kb_001` in server/index.ts.
- **Admin UI**: `KnowledgeBaseEditor.tsx` — stats cards (total/active/vectors/categories), category filter tabs (All/Methodology/Hospitality/Financial/FAQ/Custom), search input, create form (title/content/category/priority/tags), inline edit, toggle active/inactive, delete with confirmation, version history drawer with rollback. Added as "Knowledge Base" tab in `RebeccaAdminTabs.tsx` (between Configuration and Guardrails tabs).
- **Code review fix**: Inactive KB entries now deleted from Pinecone (not upserted) on toggle/rollback — prevents deactivated content from being retrieved by Rebecca.
- **Files**: intelligence-v2.ts (schema+storage), storage/index.ts, rebecca.ts (routes), rebecca-kb-001.ts (migration), server/index.ts, KnowledgeBaseEditor.tsx, RebeccaAdminTabs.tsx
- Health check: ALL CLEAR — 0 TS errors, 4,047 tests (173 files), verification UNQUALIFIED

### Task #305 Rebecca Personality Foundation & Guardrail Editor (April 2026) — COMPLETED
- **Personality rewrite**: DEFAULT_SYSTEM_PROMPT in chat.ts fully rewritten with Super Conversations framework (curiosity, art of questioning, empathy, active listening, trust building), voice register, banned phrases, user awareness, brevity rules, first message exception, and hard guardrails
- **rebecca_guardrails table**: New schema in intelligence-v2.ts (id, label, rule, sortOrder, isActive, createdAt, updatedAt) with insert schema and types
- **Storage CRUD**: getRebeccaGuardrails, getActiveRebeccaGuardrails, createRebeccaGuardrail, updateRebeccaGuardrail, deleteRebeccaGuardrail in IntelligenceV2Storage, bound through DatabaseStorage
- **API routes**: GET/POST/PATCH/DELETE /api/rebecca/guardrails (admin-only, Zod-validated)
- **System prompt injection**: Active guardrails fetched at query time and appended as structured "Admin-Configured Guardrails" block in system prompt
- **Seed migration**: rebecca-guardrails-001.ts creates table + seeds 5 default guardrails (off-topic, legal/tax, guarantees, arithmetic, redirect), registered in server/index.ts
- **Admin UI**: GuardrailEditor.tsx component (explainer banner, create form, inline edit, toggle active/inactive, delete with confirmation, move up/down reorder controls persisting sortOrder via PATCH) as 4th tab "Guardrails" in RebeccaAdminTabs
- **Multi-user awareness**: System prompt includes "ask if others are working through simulation" + remember guest names
- **Rich block constraint**: "Maximum ONE rich formatting block per response" rule in system prompt
- **Files**: chat.ts, rebecca.ts, intelligence-v2.ts (schema + storage), index.ts (storage + server), rebecca-guardrails-001.ts, GuardrailEditor.tsx, RebeccaAdminTabs.tsx, RebeccaConfig.tsx, RebeccaTab.tsx

### T24 Rebecca Admin Tabs & ConversationsTab Cleanup (April 2026) — COMPLETED
- **T24 was already implemented**: RebeccaAdminTabs.tsx (3 tabs: Configuration, Conversations, Feedback) were already built and wired into AIAgentsTab
- **ConversationsTab.tsx stub deleted**: Old placeholder removed from `client/src/components/admin/`
- **Admin.tsx cleaned**: Removed ConversationsTab import and switch case
- **Sidebar redirect added**: `"conversations": "ai-agents"` in SECTION_REDIRECTS — clicking Conversations in sidebar now navigates to AI Agents (where the real conversations tab lives)
- **claude.md updated**: T24 marked ✅, Phase 4 marked COMPLETE
- **replit.md updated**: Research Intelligence section updated to reflect Phase 4 complete
- **Phase 4 (T19-T24) fully complete**: All Rebecca Layer tasks shipped

### Phase 5 Engine Observatory Wiring (April 2026) — COMPLETE
- **CoverageAnalyticsDashboard wired into EngineDashboard**: Imported and rendered below CoverageHeatmap/PortfolioProfile grid. Provides scenario-aware coverage analytics with entity drill-down, field-level detail, freshness summary cards.
- **SystemIntelligenceStatus wired into EngineDashboard**: Imported and rendered below CoverageAnalyticsDashboard. Shows LLM vendor availability, Pinecone namespace stats, knowledge base health, missing API key detection, namespace re-index/clear actions.
- **SourceRegistryOverlay wired into DataSourcesTab**: Imported and rendered at bottom of DataSourcesTab. Trust-scored source cards with health badges, category grouping, cadence info, activate/deactivate toggles.
- **ApiDashboardGrid wired into EngineDashboard**: Imported from `admin/system/ApiDashboardGrid`. Shows integration health cards, circuit breaker status, cache stats, key rotation history, and toggle controls.
- **MethodologyOverview added to EngineDashboard**: New inline component showing the 6-stage research pipeline (Context Assembly → Tier Selection → Progressive Relaxation → Confidence Scoring → Value Extraction → Freshness Tracking).
- **Glossary enriched**: Added 13 new terms to checker manual Section21Glossary — chain scales (Luxury, Upper Upscale, Upscale, Upper Midscale), business models (Hotel, Lodge, VRBO/STR), Platform Fee, Comparable Set, Freshness Threshold, Relaxation Trail, Context Pack, Trust Score.
- **Pre-existing completions verified**: QASandbox (already wired in Admin.tsx), ModelRoutingPanel (already inside PipelineConfigTab), PipelinePoliciesForm (already inside PipelineConfigTab), MethodologyTransparencyPanel (already in research pages), Help page Section18Research (already comprehensive with badges/freshness/apply flow/FAQ), Section13AIResearch (already has intelligence verification workflow).
- **Files changed**: `EngineDashboard.tsx` (4 imports + 4 renders + MethodologyOverview component), `DataSourcesTab.tsx` (1 import + 1 render), `Section21Glossary.tsx` (13 new terms)
- All Phase 5 tasks complete. No remaining items.

### Skills Frontmatter Compliance (April 2026) — COMPLETED
- **32 skills updated with Agent Skills spec-compliant frontmatter**: Added `---\nname:\ndescription:\n---` YAML frontmatter to all skills missing it
- **20 `.agents/skills/` fixed**: api-backend-contract, app-defaults, consistent-card-widths, constants-governance, context7-best-practices, database, design-system-export, error-handling, export-config, export-system, financial-engine, hbg-design-philosophy, hbg-product-vision, property-photos, save-button-placement, settings-architecture, testing-conventions, type-contracts, verification-system, zod-schema-sync
- **12 `.claude/skills/` fixed**: balance-sheet-integrity, business-model, charts, design-export, help-page, integrations, product-vision, scenarios, server-finance, str-properties, tour, ui-blocks
- **All 54 `.agents/skills/` and 44 `.claude/skills/` now have proper frontmatter**
- **5 skills over 500 lines noted** (spec recommends <500): source-code (832), research-methodology (800), product-vision (761), design-system (714), ui-ux-pro-max (658) — not restructured this pass
- **Doc updates**: replit.md and claude.md updated — skills description changed from "slim pointers" to "full skills with Agent Skills spec frontmatter"

### Task #304: Code Quality & Dead Code Audit (April 2026) — COMPLETED
- **9 unused exports removed**: De-exported (made file-private) `LocationLinks` (map-utils.ts), `GlossaryEntry`+`lookupGlossary` (glossary.ts), `QueuedResearch` (research-queue.ts), `InsightResult` (rebecca-insights.ts), `HotelSnapshotData`+`HotelRateData`+`CityMedianData`+`PropertyValueEstimate` (api/types.ts)
- **10 empty catch blocks annotated**: All `.catch(() => {})` patterns now have `/* ignore: reason */` comments explaining why the catch is intentionally empty (best-effort indexing, non-blocking seeding, background enrichment)
- **Doc Harmony fixed**: Updated claude.md test counts from 4,024/172 to 4,047/173 across all 4 occurrences
- **Exports check**: 525 used, 0 unused, 21 API contracts
- **Quick audit**: 0 empty catch blocks, 0 `any` types, 0 TODOs, 0 console.logs
- **Large files noted** (>500 lines): intelligence.ts (1131), financial.ts (1061), properties.ts (865), pinecone-service.ts (833), sidebar.tsx (771) — all complex business logic, not safely decomposable without risk
- Health check: ALL CLEAR — 0 TS errors, 4,047 tests pass (173 files), verification UNQUALIFIED

### Task #303: AI Research Engine Calibration (April 2026) — COMPLETED
- **Business-model-aware prompts**: `assembleResearchPrompt` now injects `buildBusinessModelGuidance(businessModel)` — Hotel gets USALI departmental benchmarks, VRBO gets platform economics/cleaning turnover/STR-specific ADR sources, Lodge gets whole-property rental norms/guest meal costs/seasonal patterns
- **Context pack updated**: `PropertyContextPack.classification` now includes `businessModel` field; `property-pack.ts` reads `p.businessModel ?? "hotel"`
- **Expanded value extraction** (`research-value-extractor.ts`): Now extracts 6 new field categories: costSeg5yrPct/7yrPct/15yrPct (cost segregation splits), arDays/apDays (working capital), ltv (recommended LTV), preOpeningCosts, platformFee (VRBO). Falls back to alternative AI output field names (e.g. `capitalStructureAnalysis`, `financingAnalysis`, `platformEconomics`)
- **Business-model-tagged Pinecone guidance**: `indexAssumptionGuidance` and `retrieveSimilarGuidance` now accept `businessModel` param. Metadata includes `businessModel` tag. Query text includes business model for better embedding similarity. Returns include `businessModel` field
- **Relaxation engine model-aware scoring**: `ComparableProperty` now has `businessModel` field. `applyBusinessModelBoost()` gives same-model comps +15% score, cross-model comps -15%. `computeEvidenceScore()` adds 10% weight for business model alignment. Evidence scoring rebalanced: count 30%, similarity 25%, constraint 20%, diversity 15%, model alignment 10%
- **Validation context plumbed**: `server/routes/research.ts` now passes `businessModel` to `validateResearchValues()`, `indexAssumptionGuidance()`, and `retrieveSimilarGuidance()`
- **Tests**: 23 new tests in `tests/ai/research-calibration.test.ts` covering all 6 subtasks + scoring verification
- **Code review fix**: `indexResearchResult` now accepts `businessModel` param; orchestrator passes it from context pack. `applyBusinessModelBoost` exported for direct testing
- Health check: ALL CLEAR — 0 TS errors, 4,047 tests pass (173 files)

### Task #302: Business-Model-Specific Financial Defaults (April 2026) — COMPLETED
- **BUSINESS_MODEL_DEFAULTS** map in `shared/constants.ts` — keyed by `BusinessModelType` ('hotel'|'lodge'|'vrbo') with 21 fields per model (cost rates, revenue shares, catering boost, management fees, platform fees, pre-opening burn)
- **PLATFORM_FEE_RATES** constant — airbnb 15.5%, vrbo 8%, booking 15%, direct 0%, blended 14%
- **PropertyInput additions** (`engine/types.ts`): `businessModel`, `platformFeeRate`, `preOpeningMonthlyBurn`
- **MonthlyFinancials additions**: `expensePlatformFees`, `expensePreOpening`
- **resolvePropertyAssumptions** (`engine/property/resolve-assumptions.ts`): reads `property.businessModel` to pick `BUSINESS_MODEL_DEFAULTS[bm]` for all cost/rev defaults
- **Engine computation**: Platform fees = `platformFeeRate × revenueRooms`; pre-opening = monthly burn during ramp months only. Both flow through totalOperatingExpenses → GOP
- **Propagation**: yearlyAggregator.ts, consolidation.ts, property-detail/types.ts, calculation-checker types all updated
- **Validation** (`calc/research/validate-research.ts`): Model-specific bounds (HOTEL_BOUNDS, LODGE_BOUNDS, VRBO_BOUNDS) — platform fee VRBO 3-25%, hotel/lodge 0-5%; ramp months hotel 3-36, lodge 3-24, vrbo 1-12
- **Management company overhead**: Reviewed against HVS benchmarks — values well-calibrated (8.5% base fee, $75K staff salary, 2.5/4.5/7.0 FTE tiers, $540K-$900K partner comp). No changes needed.
- **Tests**: 44 new tests in 2 files (business-model-defaults.test.ts, validate-research-models.test.ts)
- **Fee ordering**: Management fees computed on net revenue after platform fees (not gross revenue)
- **VRBO ADR bounds**: Tightened from $5000 to $1500 for operational realism
- Health check: ALL CLEAR — 0 TS errors, 4,024 tests pass (172 files), verification UNQUALIFIED

### Admin Replan v3 (April 2026)
- **Full replan document**: `.local/replan-admin-intelligence-v3.md`
- **Admin restructured to 5 groups**: Business, Intelligence Engine, AI Assistant, Design, System
- **ICP page removed**: Auto-derived portfolio profile replaces manual ICP (per research methodology)
- **Data Sources card system**: 4-column responsive grid for APIs, Scrapers, Sources, Models — each card = report card with health metrics, toggle on/off, configure, test, logs
- **Engine Dashboard**: Unified intelligence observatory replacing Coverage Analytics + System Intelligence + API Dashboard + Cache & Services
- **Intelligence freshness system**: Page-level green/amber/red status bar on Property + Company assumptions pages
- **Auto-staleness detection**: Key assumption changes (starRating, ADR, hospitalityType, businessModel, roomCount, location, revShares) mark research as stale
- **Auto-refresh**: If estimated research time < 30s, auto-regenerate; otherwise notify admin
- **Financial Lines page**: New admin page for viewing/approving engine-suggested calculation additions
- **Brand page**: Merge Logos + Themes + Icons into single page
- **Skills to create**: help-documentation, intelligence-freshness, data-source-cards
- **Skills to update**: admin-configurator, hbg-business-model, integrations-infrastructure
- **Implementation phases**: 5 phases, 28 tasks total

### Task #298: Property URL Card with Validation (April 2026) — COMPLETED
- **Schema**: New `property_urls` table (`shared/schema/properties.ts`) — id, propertyId (FK cascade), url, label, isValid, isRelevant, relevanceScore, lastCheckedAt, metadata (jsonb), createdAt. Index on property_id. Insert schema with `.pick()`. Types exported: PropertyUrl, InsertPropertyUrl.
- **Storage module**: `server/storage/property-urls.ts` — PropertyUrlStorage class with getPropertyUrls, getPropertyUrlById, addPropertyUrl, updatePropertyUrl, deletePropertyUrl. Wired into DatabaseStorage via index.ts.
- **API routes** (`server/routes/properties.ts`): 5 new endpoints:
  - `GET /api/properties/:id/urls` — list all URLs for a property (requireAuth)
  - `POST /api/properties/:id/urls` — add URL with http/https-only validation + duplicate check (requireManagementAccess)
  - `PATCH /api/properties/:id/urls/:urlId` — update label/validity fields (requireManagementAccess)
  - `DELETE /api/properties/:id/urls/:urlId` — remove URL (requireManagementAccess)
  - `POST /api/properties/:id/urls/validate` — batch HEAD-request validation with SSRF protection (blocked hosts, private IPs, internal domains), auto-tags relevance for known hospitality domains (Airbnb, VRBO, Booking, etc.)
- **SSRF protection**: Blocked localhost, 127.0.0.1, 0.0.0.0, ::1, metadata.google.internal, 169.254.169.254, *.internal, *.local, 10.x, 172.16-31.x, 192.168.x private ranges
- **PropertyLinksSection.tsx** (`client/src/components/property-edit/`): Full CRUD UI card — add URL with optional label, status badges (Unchecked/Valid/Relevant/Broken), validate-all button, delete per URL. Uses react-query mutations.
- **PropertyDetail.tsx**: Link chips displayed between description card and map — color-coded (primary=relevant, destructive=broken, muted=valid), dot indicator, hostname fallback with safe URL parsing
- **PortfolioPropertyCard.tsx**: Compact link chips (max 3 shown, "+N" overflow) below description, stale-time query, stopPropagation on clicks
- Files: schema/properties.ts, storage/property-urls.ts, storage/index.ts, routes/properties.ts, PropertyLinksSection.tsx, property-edit/index.ts, PropertyDetail.tsx, PropertyEdit.tsx, PortfolioPropertyCard.tsx
- Health check: ALL CLEAR — 0 TS errors, 3980 tests pass, verification UNQUALIFIED

### Task #301: Reusable Property Intelligence Skills & Documentation (April 2026) — COMPLETED
- **New skill created**: `.agents/skills/property-intelligence/SKILL.md` — comprehensive pipeline documentation covering all 5 enrichment stages: (1) Address Autocomplete & Geocoding, (2) Map & 3D Location Links, (3) URL Management & Validation, (4) AI Image Enhancement, (5) AI Description Rewrite. Includes file maps, API contracts, auth patterns, display patterns, data flow diagram, and extension guide for adding new stages.
- **research-methodology skill updated**: New §7.4 "Property URLs as Research Sources" — documents how validated property URLs feed into the research engine context pack, URL category/value matrix (OTA listings, property website, review sites, market reports, competitor sites), relevance scoring for hospitality domains, SSRF protection gate, lifecycle diagram from URL add → research engine consumption.
- **integrations-infrastructure skill updated**: (1) "Image Generation" section expanded to "Image Generation & Enhancement" with full AI Enhancement Pipeline table (trigger → model → staging → preview → accept/reject → revert), 6 enhancement endpoint table, security notes. (2) New "URL Validation Service" section with SSRF protection details and relevance auto-tagging list. (3) Integration File Map updated with Replicate (enhance) and URL Validation entries.
- No code changes, no DB changes — documentation only
- Health check: ALL CLEAR — 0 TS errors, 3980 tests pass, verification UNQUALIFIED

### Pinecone Skills & Knowledge Installed (April 2026)
- **7 Pinecone skills installed** from `pinecone-io/skills` repo into `.agents/skills/`:
  - `pinecone-help` — Overview of all skills and prerequisites
  - `pinecone-quickstart` — Step-by-step onboarding (Database or Assistant path)
  - `pinecone-query` — Search integrated indexes via MCP (integrated indexes only)
  - `pinecone-cli` — Terminal-based management for ALL index types, vector ops, backups, CI/CD
  - `pinecone-assistant` — Managed RAG service for document Q&A with citations
  - `pinecone-mcp` — Reference for all MCP tools (list/describe/create/upsert/search/rerank)
  - `pinecone-docs` — Curated links to official docs organized by topic
- **MCP**: Pinecone MCP not available as a Replit integration — would need manual MCP server configuration. Project already uses Pinecone TS SDK directly in `server/ai/pinecone-service.ts`
- **Context7 knowledge absorbed**: TS SDK typed metadata (`pc.index<MovieMetadata>('idx')`), batch upsert patterns, namespace management, metadata filtering with MongoDB-style operators
- **Current HBG Pinecone usage**: Index `lb-hospitality`, 7 namespaces (knowledge-base, research-history, comparables, assumption-guidance, documents, scenarios, properties), OpenAI text-embedding-3-small (1536d), cosine metric, batches of 100

### Context7 Best Practices Applied (April 2026)
- **Express**: Added `app.disable("x-powered-by")` to `server/index.ts` — reduces server fingerprinting
- **Drizzle indexes**: Added missing FK indexes for `companies.logoId`, `companies.themeId`, `property_photos.beforePhotoId` — both in schema definitions and via direct SQL
- **Skill created**: `.agents/skills/context7-best-practices/SKILL.md` — comprehensive reference covering Drizzle ORM (FK indexing, GIN indexes, transactions), React (lazy loading, useMemo, useCallback, memo), Express (security headers, compression, error handling), and TanStack Query (hierarchical keys, stale time, optimistic updates, prefetching)
- **Includes feature checklist**: 11-item checklist for verifying patterns on new features

### Task #300: Map & 3D Flyover Location Links (April 2026) — COMPLETED
- **Location link utility**: `buildLocationLinks(lat, lng, name)` in `client/src/lib/map-utils.ts` — pure function returning Google Maps URL, Google Earth 3D flyover URL, and static map thumbnail URL
- **hasCoordinates(property)**: Helper to check if property has valid lat/lng (finite numbers, non-null)
- **PortfolioPropertyCard**: Map and 3D Globe icon-buttons appear inline next to location text when property has coordinates. Uses `IconMap` and `IconGlobe`. Includes `stopPropagation` for click handling.
- **PropertyDetail**: "Google Maps" and "3D Flyover" pill-shaped link buttons shown above the PropertyMap when coordinates exist. Satellite thumbnail (static map) shown between link buttons and interactive map — clickable, opens Google Maps.
- **Static map endpoint**: `GET /api/geospatial/static-map?lat=&lng=&zoom=&w=&h=` — proxies Google Maps Static API (satellite maptype, red marker), caches 24h, caps dimensions at 640px. Requires `requireAuth`.
- Health check: ALL CLEAR — 0 TS errors, 3980 tests pass, verification UNQUALIFIED

### Task #299: Hero Image AI Enhancement Pipeline (April 2026) — COMPLETED
- **Enhancement endpoint**: `POST /api/property-photos/:id/enhance` — sends photo to Replicate clarity-upscaler (photo-upscale model), saves enhanced base64 to `enhancedImageData` column
- **Enhanced image serving**: `GET /api/property-photos/:id/enhanced-image` — serves enhanced image binary from DB
- **Revert endpoint**: `DELETE /api/property-photos/:id/enhanced` — clears enhancedImageData
- **Schema**: Added `enhancedImageData` text column to `property_photos` (migration: enhanced-photo-001.ts)
- **EnhancePreviewDialog**: Side-by-side and slider compare modes, Accept/Reject buttons
- **PhotoCard**: Sparkles button on hero photos, "Enhanced" badge when enhanced data exists
- **PropertyHeader**: Prefers enhanced image for hero display, shows "AI Enhanced" badge
- **PortfolioPropertyCard**: Prefers enhanced hero image, shows "Enhanced" badge
- Health check: ALL CLEAR — 0 TS errors, 3980 tests pass, verification UNQUALIFIED

### Task #297: Property Description Card with AI Rewrite (April 2026) — COMPLETED
- **DescriptionSection enhanced** (`client/src/components/property-edit/DescriptionSection.tsx`): Read-only display mode (styled card with Edit button) when description exists; edit mode with textarea. Preview Dialog for AI rewrite — user can review improved vs original text side-by-side, then accept or dismiss. Frontend calls property-scoped `POST /api/properties/:id/rewrite-description`.
- **Server endpoint added** (`server/routes/properties.ts`): New `POST /api/properties/:id/rewrite-description` with `requireManagementAccess` + `checkPropertyAccess`, Zod validation (text 1-5000 chars), Gemini via `resolveLlm("aiUtilityLlm")`, cost logging.
- **PortfolioPropertyCard updated** (`client/src/components/portfolio/PortfolioPropertyCard.tsx`): Added `truncateWords(text, 60)` utility function; description shown as truncated text (max 60 words with ellipsis) below the location/date on the property card. Uses `line-clamp-3` for visual truncation.
- **PropertyDetail page updated** (`client/src/pages/PropertyDetail.tsx`): Added full description card between PropertyHeader and map section. Shows when `property.description` exists — styled card with "Property Description" label and full text with `whitespace-pre-wrap`.
- Files: DescriptionSection.tsx, PortfolioPropertyCard.tsx, PropertyDetail.tsx, server/routes/properties.ts
- Health check: ALL CLEAR — 0 TS errors, 3980 tests pass, verification UNQUALIFIED

### Task #296: Smart Address Autocomplete & Auto-Fill (April 2026) — COMPLETED
- **Existing AddressAutocomplete extended** (`client/src/components/AddressAutocomplete.tsx`): Added AbortController for stale-response protection, `countryBias` prop for country-scoped Google Places results, `disabled` prop, map pin icon (`IconMapPin`), proper `credentials: "include"` on fetch calls, cleanup on unmount (abort + debounce timer), proper `unknown` error type (no `any`)
- **BasicInfoSection updated**: Street address plain `<Input>` replaced with `<AddressAutocomplete>`, place selection auto-fills **only empty** fields (city, stateProvince, zipPostalCode, country, location) via `fillIfEmpty()` helper; street address always updated from selection; lat/lng stored in draft AND immediately persisted via `PATCH /api/properties/:id/coords`; `countryBias` passed from current geo selection; auto-fill badges ("auto-filled" green pill) + emerald ring highlights shown for 6s then fade
- **Server enhanced**: `placesAutocomplete()` now accepts optional `countryBias` parameter for country-scoped results (`&components=country:XX`); route passes `?country=` query param through; new `PATCH /api/properties/:id/coords` endpoint for immediate lat/lng persistence after place selection
- **Code review fixes**: (1) Extended existing component instead of creating duplicate, (2) Lat/lng persisted immediately via dedicated coords endpoint, (3) Country bias passed from frontend, (4) No `any` types — uses `unknown` + `instanceof`, (5) Only fills empty fields to preserve user-entered data
- Files: AddressAutocomplete.tsx (extended), BasicInfoSection.tsx, geospatial.ts, geospatial routes, properties.ts
- Health check: ALL CLEAR — 0 TS errors, 3980 tests pass, verification UNQUALIFIED

### Task #292: Skill Authoring & Updates (April 2026) — COMPLETED
- **3 new skills created**:
  - `help-documentation` — InfoTooltip patterns (benchmark citation format, STR chain scale reference, authoritative sources), manual section structure (SectionCard/ManualTable/Callout), glossary schema & categories, walkthrough step format (selector strategies), GuidanceSideSheet anatomy (tabs, attribution card, GuidanceRecord fields)
  - `intelligence-freshness` — State machine (missing→running→current→stale), computeFreshnessStatus logic (priority order), staleness triggers (7 assumption fields), IntelligenceStatusBar states (4-state with colors/icons), API contract (freshness-counts + avg-duration), sidebar badge pattern, auto-refresh guard logic
  - `data-source-cards` — Card report-card anatomy, health badge thresholds (90%/80%), category tabs (APIs/Scrapers/Sources/Models), full CRUD flow, toggle/test/logs actions, SSRF protection details, dependability rules, adding new source types
- **3 existing skills updated**:
  - `admin-configurator` — Rewritten for 5-group structure (Business/Intelligence Engine/AI Assistant/Design/System), section redirect system with full mapping table, merged pages (Brand/Pipeline Config/Engine Dashboard/Data Sources), Engine Dashboard anatomy, sidebar freshness badge, updated adding-new-section steps
  - `hbg-business-model` — Added comprehensive VRBO/STR section: excluded expense categories, platform fee structure (Airbnb 15.5%/VRBO 8%/Booking 15-18%), all-in management fee (20-35%), depreciation difference (27.5yr vs 39yr), revenue mix comparison table, full expense structure (52-92% of revenue), Lodge model details
  - `integrations-infrastructure` — Added Data Source Management section: source registry schema, card-based system replacing list-based, 4 category tabs, health badges, CRUD endpoints, call logging, SSRF protection, key files. Fixed "Marcela" references to "Rebecca"


### Task #291: Documentation & Help System Updates (April 2026) — COMPLETED
- **InfoTooltip benchmark citations**: All key assumption tooltips updated with STR chain scale ranges — Starting ADR (Luxury $396+, Upper Upscale $173–$312, etc.), ADR Growth (2–5% Upper Upscale, 3–6% Luxury), Starting Occupancy (40–55% Luxury, 50–65% Upscale), Stabilized Occupancy (65–75% Luxury, 70–80% Upper Upscale), Housekeeping (22–28% Luxury, 18–25% Upper Upscale), Management Fees (3–5% base Upper Upscale, 6–10% specialty), Compensation ($75K–$95K Upper Upscale, $85K–$120K Luxury)
- **User Manual Section18Research.tsx**: Added 4 new subsections — Research Badges (yellow pill/blue GAAP/guidance arrow), Freshness & Staleness (green/amber/red indicators with color dots), What Triggers Staleness (7 key assumption change types), Applying Research Recommendations (4-step workflow)
- **Checker Manual Section13AIResearch.tsx**: Added Intelligence Verification subsection with 6-step cross-reference workflow table + Key Verification Benchmarks table (chain scale × ADR/Occ/Fee/Source) + Callout for out-of-range flags
- **Glossary expanded**: 15 new terms — 6 STR chain scales (Luxury→Economy), 3 business models (Hotel/VRBO-STR/Lodge), 6 research terms (Freshness/Staleness/Context Pack/Guidance/STR/Chain Scale)
- **GuidedWalkthrough.tsx**: Added 2 new tour steps — Research Badges (target: badge-research) and Intelligence Status Bar (target: intelligence-status-bar)
- **GuidanceSideSheet.tsx RecommendationTab**: Enhanced attribution card — source name + date with Shield/Clock icons, relaxation level badge (amber), "Source attribution unavailable" fallback, Methodology label with FileText icon wrapping reasoning text
- Files changed: RevenueAssumptionsSection.tsx, OperatingCostRatesSection.tsx, ManagementFeesSection.tsx, CompensationSection.tsx, Section18Research.tsx, Section13AIResearch.tsx, glossary.ts, GuidedWalkthrough.tsx, GuidanceSideSheet.tsx

### Task #293: Lodge Business Model & Lakeview Haven Update (April 2026) — COMPLETED
- **"lodge" added** to both BUSINESS_MODEL_TYPES and HOSPITALITY_TYPES arrays in schema
- **BusinessModelSelector** updated: 3 options — Hotel, Lodge ("Large vacation lodge — whole-property rental, premium amenities, no F&B or events departments"), VRBO/STR
- **EngineDashboard** PortfolioProfile updated to display "Lodge" label for lodge business model
- **Lakeview Haven Lodge seed** updated: roomCount 8, businessModel "lodge", hospitalityType "lodge", real address (5597 Utah-39 Scenic), real description from website, real OwnerRez photos (15 photos from uc.orez.io — 6 building exteriors, 3 interior, 6 amenities/views), revShareFB 25% (breakfast, meals, drinks, picnics), revShareEvents 0% (no events dept)
- **Research methodology skill** updated: new §2.3 Lodge Business Model section with comparison table, expense structure, positioned between Hotel and VRBO
- **hbg-business-model skill** updated: Business Models table added, Lodge described alongside Hotel/VRBO

### Task #290: Financial Lines Admin Page (April 2026) — COMPLETED
- **engine_suggested_lines table**: statementType, category, lineName, formula, rationale, confidence, status (pending/approved/rejected), reviewedBy, reviewedAt, rejectionReason, propertyId, sourceId
- **Migration**: server/migrations/engine-suggested-lines-001.ts with idx_esl_status, idx_esl_statement_type indexes
- **Storage methods**: listEngineSuggestedLines (with status filter), getEngineSuggestedLineById, createEngineSuggestedLine, approveEngineSuggestedLine (+ Pinecone indexing), rejectEngineSuggestedLine, countEngineSuggestedLines
- **API routes**: GET /api/admin/intelligence/financial-lines?status=, POST /api/admin/intelligence/financial-lines/:id/approve, POST /api/admin/intelligence/financial-lines/:id/reject
- **FinancialLinesTab.tsx**: Count cards (total/pending/approved/rejected), status-filtered tabs, detail dialog, approve/reject with modal rejection reason, empty states
- **Icons added**: IconCheck, IconX added to status-icons.tsx + brand-icons.tsx + index.ts exports
- **Sidebar wired**: "Financial Lines" with IconCalculator in Intelligence Engine group
- **Admin.tsx wired**: sectionMeta + SectionContent switch case
- All tests passing, e2e verified, code review PASS

### Task #289: Data Sources Card CRUD (April 2026) — COMPLETED
- **sourceRegistry schema extended**: Added description, endpoint, apiKeyRef, rateLimitPerMin, successRate, avgLatencyMs, costPerCall, dataProvided (jsonb string[]) columns via direct SQL migration
- **source_call_logs table**: Real activity logging — id, sourceId, serviceKey, timestamp, httpStatus, latencyMs, success, errorMessage; cascading delete on source removal
- **Storage methods added**: getSourceRegistryEntry, createSourceRegistryEntry, updateSourceRegistryEntry, deleteSourceRegistryEntry, createSourceCallLog, getSourceCallLogs (server/storage/intelligence-v2.ts + index.ts)
- **API routes added**: POST /api/admin/source-registry (create), PATCH /api/admin/source-registry/:id (update), PATCH /api/admin/source-registry/:id/toggle, DELETE /api/admin/source-registry/:id, POST /api/admin/source-registry/:id/test (connectivity + logs call), GET /api/admin/source-registry/:id/logs (last 50 entries)
- **SSRF protection hardened**: Full RFC1918 CIDR blocking (10.0.0.0/8, 172.16-31.x.x, 192.168.x.x, 127.x.x.x, 169.254.x.x), IPv6 private (fc/fd/fe80), metadata IPs (Google/AWS), .local/.internal TLDs, DNS resolution guard (resolve hostname → check resolved IPs against private ranges)
- **DataSourcesTab.tsx rewritten**: Full CRUD with API-driven data, toggle persistence, ConfigureDialog, delete with AlertDialog, inline Test results, **real LogsPanel** querying GET /api/admin/source-registry/:id/logs (no mock data), HealthBadge (amber <90%, red <80%)
- **SourceRegistryOverlay.tsx fixed**: Updated from serviceKey-based PATCH to ID-based toggle route
- **15 seed records**: 4 APIs, 4 scrapers, 4 sources, 3 models
- **`as any` cast removed**: lastHealthCheck update uses typed Date directly
- All 3980 tests passing, 0 TS errors, lint clean, verification UNQUALIFIED

### Phase 1 Schema Changes (April 2026) — COMPLETED
- **businessModel field added** to properties table: `text("business_model").notNull().default("hotel")`
- **"vrbo" added to HOSPITALITY_TYPES** array + BUSINESS_MODEL_TYPES enum
- **lastAssumptionChangeAt** timestamp added to both `properties` and `global_assumptions` tables
- **BusinessModelSelector** component created in PropertyTypeSelector.tsx with Hotel/Lodge/VRBO options
- **BasicInfoSection** updated with Business Model field + InfoTooltip
- **Auto-staleness detection** wired into property PATCH and global-assumptions PUT routes
  - Property triggers: starRating, startAdr, hospitalityType, businessModel, roomCount, city, stateProvince, country, revShareFB, revShareEvents, revShareOther, maxOccupancy, startOccupancy, adrGrowthRate
  - Company triggers: baseManagementFee, incentiveManagementFee, inflationRate, companyTaxRate, commissionRate, staffSalary, partnerCompYear1-10
- **Code review fix**: partnerComp1/2/3 → partnerCompYear1-10 (correct schema names)
- DB columns added via direct SQL (drizzle-kit push had stableKey constraint prompt)

### Phase 2 Admin Reorganization (April 2026) — COMPLETED
- **AdminSidebar restructured** to new 5-group layout:
  - Business: Users, Companies, Groups, Scenarios
  - Intelligence Engine: Engine Dashboard, Data Sources, Pipeline Config, QA Sandbox, Scheduled Research
  - AI Assistant: Configuration (Rebecca), Knowledge Base, Conversations
  - Design: Brand (merged Logos+Themes+Icons), Exports
  - System: App Defaults, Verification, Database, Notifications, Navigation
  - Logs: Activity (separate section at bottom)
- **Section redirects**: Old section IDs (icp, logos, themes, icons, llms, model-routing, cache-services, integrations, api-dashboard, coverage-analytics, pipeline-policies, source-registry, system-intelligence, research, sources) all redirect to their new locations via `resolveSection()`
- **New components created**:
  - `BrandTab.tsx` — sub-tabs for Logos, Themes, Icons
  - `EngineDashboard.tsx` — health bar + 4 stat cards + coverage heatmap + portfolio profile
  - `DataSourcesTab.tsx` — 4-column card grid (APIs/Scrapers/Sources/Models) with 15 seeded sources, toggle/configure/test/logs actions
  - `PipelineConfigTab.tsx` — sub-tabs for Pipeline Policies + Model Routing
  - `KnowledgeBaseTab.tsx` — wraps existing SourcesTab for Rebecca's training data
  - `ConversationsTab.tsx` — placeholder for chat history/analytics
- **No `adminIntelV2` feature flag dependency** — new sidebar always shows full structure
- **buildNavGroups()** no longer takes arguments
- Files: AdminSidebar.tsx, Admin.tsx, Layout.tsx, + 6 new component files

### Phase 3 Intelligence Freshness System (April 2026) — COMPLETED
- **IntelligenceStatusBar component** created: `client/src/components/intelligence/IntelligenceStatusBar.tsx`
  - 4 states: Current (green), Stale (amber), Missing (red), Running (blue pulse)
  - Unified `computeFreshnessStatus()` function — single source of truth for both the status bar AND the header dot indicators
  - Handles: research age > 7 days (stale), assumptions changed since last research (stale), no research (missing), actively generating (running)
  - Edge-case hardened: `safeTimestamp()` guard for invalid dates, `Math.max(0, ...)` clamp for future timestamps
  - Regenerate button appears on stale/missing states
- **PropertyEdit page** wired: Status bar below PageHeader, header dot uses `computeFreshnessStatus`
- **CompanyAssumptions page** wired: Status bar below PageHeader, header dot unified via `computeFreshnessStatus`
- **GlobalResponse type** updated: added `lastAssumptionChangeAt: string | null`
- All 3980 tests passing, 0 TS errors, lint clean, verification UNQUALIFIED

### Task #288: Freshness Infrastructure, Badges & Auto-Refresh (April 2026) — COMPLETED
- **Backend endpoint**: `GET /api/admin/intelligence/freshness-counts` (admin-only)
  - Queries `research_runs` table (DISTINCT ON per entity_id) + `properties.lastAssumptionChangeAt`
  - Returns: `{ total, current, stale, missing, running, avgDurationMs }`
  - New storage method: `getLatestCompletedRunsPerEntity(entityType)` in IntelligenceV2Storage
- **Admin sidebar badge**: Intelligence Engine group shows count badge when stale/missing > 0
  - Red badge (bg-red-500/15) when missing > 0, amber (bg-amber-500/15) when only stale
  - Polls freshness-counts API every 60s
- **Engine Dashboard fixed**: Replaced incorrect global `/api/research/last-full-refresh` derivation
  - Now uses `/api/admin/intelligence/freshness-counts` API for stat cards + health bar
  - Coverage heatmap uses `/api/research/status` for per-property status
  - Polls every 30s for real-time updates
- **Auto-refresh**: PropertyEdit + CompanyAssumptions auto-trigger research on stale/missing
  - One-shot `useRef` guard prevents re-triggering
  - Guards: `!autoRefreshFired.current && !isDirty && !isGenerating`
  - Fires `generateResearch()` automatically when status is stale or missing

### Source URLs Feature (April 2026) — COMPLETED
- **Schema**: `sourceUrls` text array column added to `properties` table
- **Frontend**: `SourceUrlsSection` component in `client/src/components/property-edit/SourceUrlsSection.tsx`
  - Add/remove URLs with validation (must be valid URL format)
  - Enter key support for adding URLs
  - Hover-to-reveal delete button per URL
  - "Research from URLs" button appears when URLs exist — triggers `generateResearch()`
  - Positioned after Description section, before Timeline in PropertyEdit page
- **Research integration**: Source URLs included in property context pack narrative
  - AI research prompt sees user-provided URLs as reference sources
  - Can extract property details, photos, amenities, location info from listed URLs
- **Data flow**: URLs saved as `text[]` → property record → context pack → research prompt
- **E2E tested**: Add/remove/validate/keyboard all verified via Playwright

### Research Intelligence System (April 2026)
- **Research methodology skill created**: `.agents/skills/research-methodology/SKILL.md` — exhaustive 500+ line document covering STR chain scales, star ratings, revenue mix benchmarks, USALI expense ratios by segment, management fee structures, geography-driven cost adjustments, VRBO/STR business model, comp set selection criteria, and the full N+1 AI research pipeline
- **Key architectural decision**: Properties should auto-derive their research profile from existing assumptions — NO separate ICP definition needed per property. The property's own starRating + ADR + hospitalityType + location + revenue shares IS its research profile.
- **Business model variable**: `businessModel` field to be added to properties schema: "hotel" | "vrbo" (default: "hotel"). This determines which expense categories, revenue streams, fee structures, and research approaches apply.
- **Post-improvement principle**: Research must target the property's OPERATING state after improvements, not its acquisition state. If $2M in improvements add a pool and spa, research should target 4-star wellness boutique comps.
- **Equivalent STR tier derivation**: starRating + startAdr + hospitalityType → maps to Luxury/Upper Upscale/Upscale/Upper Midscale/Midscale
- **Tier-based default seeding**: New properties get defaults calibrated to their derived tier (see skill §8.1)

### Badge System (April 2026)
- All company-side badges wired: ManagementFeesSection (incentive fee), CompanySetupSection (inflation), PartnerCompSection (partner comp), FixedOverheadSection (business insurance)
- Key name mismatches fixed: travelPerClient→travelCost, itLicensePerClient→itLicense, miscOpsRate→miscOps, salesCommission→dispositionCommission, baseFee→baseManagementFee, incentiveFee→incentiveManagementFee
- ResearchBadge uses `accent-pop` (gold/amber) styling
- 42 PROPERTY_ASSUMPTION_KEYS + 22 COMPANY_ASSUMPTION_KEYS defined in schemas.ts

### Research Queue System (April 2026)
- Zustand store in `research-queue.ts`: concurrency 2, 429 retry with getState() fresh reads, reindex() position normalization, auto-prune after 15s
- ResearchLoadingOverlay: 3 variants (property, company, global), rotating tips, pulsing orb animation
- ResearchQueueIndicator mounted in Layout header

## Current Admin Structure (Pre-Replan)
```
Business: Users, Companies, Groups, Scenarios
Intelligence: ICP Mgmt Co, Research Center, [V2: Coverage, Policies, QA, Sources, Scheduler, System]
Design: Logos, Themes, Icons, Exports
AI: AI Agents, LLMs, Model Routing, Sources
System: App Defaults, Notifications, Navigation, Verification, Database, API Dashboard, Cache/Services, Integrations, Activity
```

## Planned Admin Structure (Post-Replan)
```
Business: Users, Companies, Groups, Scenarios
Intelligence Engine: Engine Dashboard, Data Sources (APIs|Scrapers|Sources|Models), Pipeline Config, QA Sandbox, Financial Lines
AI Assistant: Configuration, Conversations, Knowledge Base
Design: Brand (Logos|Themes|Icons), Exports
System: App Defaults, Verification, Database, Notifications, Navigation, Activity
```

## External Data Sources Inventory
- **APIs**: FRED (Federal Reserve Bank of St. Louis — https://www.stlouisfed.org/, API key from https://fred.stlouisfed.org/docs/api/api_key.html, env var `FRED_API_KEY`; series: SOFR, DGS2, DGS5, DGS10, DPRIME, CPIAUCSL — the definitive authority for US economic indicators), Xotelo, RapidAPI Hospitality, CoStar/STR, Moody's, S&P Global, Alpha Vantage, Open Exchange Rates, Weather API, World Bank
- **Scrapers (Apify)**: airbnb-scraper, vrbo-scraper, booking-scraper, tripadvisor-scraper
- **LLMs**: OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet, Opus), Google Gemini Flash, Perplexity
- **Vector DB**: Pinecone (index: lb-hospitality, namespaces: knowledge-base, research-history, comparables, assumption-guidance, documents, scenarios, properties)
- **Health monitoring**: Circuit breaker (5 failures in 60s → open), BaseIntegrationService pattern, staleWhileRevalidate caching

## Help System Inventory
- InfoTooltip: primary contextual help pattern (i icon → hover → explanation + formula + manual link)
- GuidanceSideSheet: deep dive panel (P25/P50/P75, peer comps, relaxation trail, impact analysis)
- RebeccaPanel: AI assistant with contextual field awareness
- GuidedWalkthrough: 9-step spotlight tour (auto-prompts new users)
- Map Tour: cinematic fly-through of properties
- Help page: User Manual, Checker Manual, Architecture, Guided Tour tabs
- Glossary: shared data structure in `client/src/lib/glossary.ts`

## Industry Knowledge Reference

### STR Chain Scale ADR Ranges (US Market)
- Luxury: $313+
- Upper Upscale: $173–$312
- Upscale: $131–$172
- Upper Midscale: $107–$130
- Midscale: $82–$106
- Economy: $55–$81

### Management Fee Benchmarks
- Non-branded 3rd party: 1.5–3.0% base (2.0–2.5% most common)
- Branded (Marriott/Hilton): 2.5–4.0% base (3.0% most common)
- Luxury/specialty: 3.0–5.0% base
- VRBO/STR manager: 20–35% all-in
- Incentive: 8–15% of GOP standard, 10–20% luxury

### Revenue Mix by Segment
- Select-service: 85–95% rooms, 2–5% F&B
- Boutique: 70–80% rooms, 12–18% F&B
- Full-service resort: 55–65% rooms, 20–28% F&B
- VRBO: 85–95% rental, 5–12% cleaning fees

## Test State
- 4,047 tests across 173 files — ALL PASSING
- TypeScript: 0 errors
- Lint: 0 errors
- Financial verification: UNQUALIFIED

### Full Codebase Audit (April 2026) — COMPLETED + P0/P1 FIXED
- **Report**: `.local/audit-report.md`
- **6 stages**: Backend/Security, Database/Schema, Financial Engine, Frontend/React, AI/Pinecone, Docs/UI
- **Overall**: STRONG with targeted improvements needed
- **P0 FIXED**: (1) `cleanupPropertyVectors()` in pinecone-service.ts — property deletion now cleans 5 namespaces, (2) `Promise.race` with `AI_GENERATION_TIMEOUT_MS` in research orchestrator
- **P1 FIXED**: (a) 7 new FK indexes (research_runs user/scenario, rebecca_emails user, rebecca_feedback user/conv, coverage_snapshots scenario, integration_key_rotations service), (b) `upsertGlobalAssumptions` + `writePropertyOverrides` wrapped in transactions, (c) Finance route 500s sanitized in production, (d) `React.memo` on PortfolioPropertyCard, (e) Bulk property URL fetch via `GET /api/property-urls/all` + `useAllPropertyUrls` hook eliminates N+1, (f) Rate limit message fixed to "15 minutes"
- **P2 FIXED**: (a) aria-labels added to ~25 icon-only buttons across 15 files, (b) aria-live on RebeccaTypingIndicator, (c) RAG score threshold raised from 0.3→0.45 in chat.ts, (d) Empty catch blocks annotated/logged (research-resources.ts, App.tsx, run-research.ts), (e) ScenariosTab decomposed: ScenarioCard + ScenarioAccessDialog extracted (1019→757 lines)
- **All STRONG**: Server setup, auth system, caching, schema design, storage layer, calc architecture, formula integrity, GAAP compliance, proof system, recalc enforcement, routing, state management, error handling, documentation, skills, UI consistency, UX patterns

### Deterministic Codebase Audit (April 2026) — COMPLETED
- **Report**: `.local/deterministic-audit-report.md`
- **Scope**: Full 136,610-line codebase (788 source files, 178 test files), 12 analysis areas
- **Verdict**: Production-grade, architecturally sound. 0 P0 (critical), 6 P1 (important), 11 P2 (advisory)
- **P1 issues found**:
  1. Waterfall div-by-zero when `catch_up_to_gp_pct = 1.0` (calc/analysis/waterfall.ts:129)
  2. Missing FK indexes on `property_fee_categories.propertyId` and `property_photos.propertyId`
  3. Rebecca chat missing timeout on LLM calls (server/routes/chat.ts)
  4. Research orchestrator hardcodes model constants, bypasses `resolveLlm()`
  5. 12 dead page files (4,405 lines) — unreachable or redirect-only
  6. Domain boundary violations — 3 files directly import db/drizzle-orm (auth.ts, notifications/engine.ts, geospatial.ts)
- **STRONG**: Financial engine (0 `as any`, decimal.js, 167 proof tests), verification (8-phase UNQUALIFIED), auth (default-deny, 4-tier RBAC), exports (5 formats × 3 entities), caching (LRU-200/60s TTL), security headers
- **calc/ layer**: 0 `as any`, 0 TODO/FIXME — cleanest layer in the codebase

### Exports & Photo Uploads Usability Audit (April 2026) — COMPLETED
- **Scope**: 46 tests covering file exports (5 formats × 3 entity types + premium + special), photo management (CRUD, hero, enhance), upload system (validation, presigned URLs, content-type filtering), and security (auth enforcement on all endpoints)
- **Standard exports ALL PASS**: PDF, Excel, CSV, PPTX, DOCX for portfolio/property/company entities — all generate valid binary files (3KB–230KB)
- **Premium exports ALL PASS**: PDF/Excel/PPTX/DOCX with computeRef (server-side recompute), memoSections, and custom entity names (13KB–532KB)
- **Special exports**: Scoped reports (income-only), portrait orientation, scenario export, ICP research export — all working
- **Photo CRUD cycle verified**: Upload PNG→Register as property photo (imageUrl field)→Update caption→Set hero (uniqueness enforced)→Delete — full cycle clean, counts restored
- **Upload validation correct**: PNG/JPEG/WebP/SVG accepted; text/json/pdf/octet-stream all rejected (400); empty body rejected; image-only restriction enforced
- **AI enhance**: Trigger returns 200 with preview URL; enhanced-image/enhanced-preview return 404 when no enhancement exists (correct behavior)
- **Presigned URLs**: `request-url` generates GCS signed URLs with objectPath
- **Security**: All 5 endpoint categories reject unauthenticated requests with 401
- **Key finding**: Photo registration requires `imageUrl` field (not `objectPath`) — the upload returns `objectPath` which must be passed as `imageUrl` when calling POST /api/properties/:id/photos
- **Process-image**: Rejects non-object-storage URLs (returns "Only object storage paths are allowed")

## Feature Flags
- RI_V2_WRITE: ON
- RI_V2_READ: ON
- REBECCA_V2: ON
- ADMIN_INTEL_V2: ON

## Critical Rules
- "Marcela" = "Rebecca" = text chat AI assistant
- drizzle-zod: NEVER use `.omit()` — only `.pick()`
- Domain boundary: Route files must NEVER import `db` or `drizzle-orm` directly
- Always update replit.md AND claude.md AND memory.md after changes (Doc Harmony Rule)
- useResearchQueue.getState() pattern for fresh Zustand reads
