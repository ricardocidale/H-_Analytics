# Hospitality Business Group — Project Instructions

## Project Summary

Business simulation portal for **Hospitality Business Group**. Models a boutique hospitality management company alongside individual property SPVs with monthly and yearly financial projections. GAAP-compliant (ASC 230, ASC 360, ASC 470). 953 source files, ~155K lines, 3,976 tests across 170 test files. Hosted on Replit.

> **Rebecca** is the sole active AI agent. Marcela voice agent, ElevenLabs, and Twilio integrations have been fully removed.

---

## User Preferences

- Simple, everyday language. Ask clarifying questions before implementing — do not assume.
- **TOP PRIORITY: Financial accuracy always beats UI enhancements.** The proof system must always pass.
- Always format money as currency (commas, appropriate precision).
- All skills live in `.claude/skills/`; `.agents/skills/` contains slim pointers for Replit task agent compatibility.
- Company name is "Hospitality Business Group" (or "Hospitality Business" for short).
- Update skills and manuals after every feature change.
- **Doc Harmony Rule:** `replit.md` and `.claude/claude.md` must stay in sync. Both are standalone, comprehensive project docs — neither is a "pointer" to the other. When updating one, update the other. The health check enforces matching test counts and stats across both files.
- All UI components must reference a theme via the theme engine.
- New UI features get their own skill file in `.claude/skills/ui/`.
- **Button Label Consistency:** Always "Save" — never "Update". See `rules/ui-patterns.md`.
- **100% Session Memory:** Save decisions to `.claude/session-memory.md` at session end.
- **Every financial line item** should have a ? tooltip (HelpTooltip or InfoTooltip).
- **Every page must be graphics-rich** — charts, animations, visual elements required.
- **Context reduction is mandatory.** Every refactor must produce skills, helpers, scripts. See `skills/coding-conventions/context-reduction.md`.
- **Premium design, always.** $50K+ bespoke financial platform feel. See `rules/design-standards.md`.
- **Always update replit.md and claude.md after every task.** Mandatory — no exceptions.

---

## Current Theme

**Tuscan Olive Grove** (olive-sage) is default. 5 presets available. See `.claude/skills/ui/theme-engine.md`.

---

## Context Loading Protocol

With 191 skill files, **never load all skills at once**. Use `.claude/skills/context-loading/SKILL.md` to find the minimum required set. Quick rules:
- **Financial calc** → specific finance skill + `rules/audit-persona.md` + `proof-system/SKILL.md`
- **UI/visual** → `component-library/SKILL.md` + `ui/theme-engine.md` + specific UI skill
- **Testing** → `testing/SKILL.md` + relevant sub-skill only
- **Cross-domain** → 2–4 skills max per domain

---

## Skill Router

| Domain | Skill Path | What It Covers |
|--------|-----------|---------------|
| Context Loading | `.claude/skills/context-loading/SKILL.md` | Task-to-skill map, loading tiers |
| Architecture | `.claude/skills/architecture/SKILL.md` | Tech stack, two-entity model, file organization |
| Design System | `.claude/skills/design-system/SKILL.md` | Colors, typography, component catalog, CSS classes |
| Theme Engine | `.claude/skills/ui/theme-engine.md` | Multi-theme system, token structure |
| Component Library | `.claude/skills/component-library/SKILL.md` | PageHeader, GlassButton, ExportMenu, CurrentThemeTab |
| Proof System | `.claude/skills/proof-system/SKILL.md` | 3,976 tests across 170 files, 583 golden values, verification commands |
| Testing (8 skills) | `.claude/skills/testing/` | Per-statement/analysis test coverage |
| 3D Graphics | `.claude/skills/3d-graphics/SKILL.md` | Three.js scenes, framer-motion wrappers |
| Database | `.claude/skills/database/SKILL.md` | Dev/prod databases, Drizzle ORM, migrations, sync |
| Multi-Tenancy | `.claude/skills/multi-tenancy/SKILL.md` | Users, groups, logos, themes, branding resolution |
| Exports | `.claude/skills/exports/SKILL.md` | PDF, Excel, PPTX, PNG, CSV export system |
| Source Code | `.claude/skills/source-code/SKILL.md` | Full source code map |
| Codebase Arch | `.claude/skills/codebase-architecture/SKILL.md` | Client folder structure, UI component catalog (80+) |
| Admin Components | `.claude/skills/admin-components/SKILL.md` | Admin panel hooks, styles, tooltip patterns |
| Admin (16 sections) | `.claude/skills/admin/SKILL.md` | 16-section shell pattern, extraction guide, API routes |
| Finance (22 skills) | `.claude/skills/finance/` | Income statement, cash flow, balance sheet, IRR, DCF, fee categories, funding interest, diagnostic decision tree, etc. |
| Funding Strategy | `.claude/skills/funding-strategy/SKILL.md` | SAFE tranche modeling, cash runway, investor thesis, FRED rates |
| Research (23 skills) | `.claude/skills/research/` | Market, ADR, occupancy, cap rate, auto-refresh, ICP profile, research center, etc. |
| Chart Library | `.claude/skills/charts/SKILL.md` | 12 Recharts + 3 D3.js chart components |
| Mobile Responsive | `.claude/skills/mobile-responsive/SKILL.md` | Breakpoints, tablet layouts, responsive helpers |
| UI (45 skills) | `.claude/skills/ui/` | Graphics, animation, entity cards, interactions, navigation, Magic UI effects, consistent card widths, save button placement |
| API Routes | `.claude/skills/architecture/api-routes.md` | All REST endpoints (load when writing API code) |
| Constants Ref | `.claude/skills/finance/constants-and-config.md` | All named constants and protected fields |
| Verification | `.claude/skills/proof-system/verification-system.md` | GAAP verification pipeline detail |
| Release Checklist | `.claude/skills/proof-system/release-audit-checklist.md` | Pre-release audit (load for releases) |
| Coding Conventions | `.claude/skills/coding-conventions/SKILL.md` | Naming, formatting, context reduction, skill organization |
| Help Page | `.claude/skills/help-page/SKILL.md` | Help page with User Manual, Checker Manual, Guided Tour tabs |
| Property Finder | `.claude/skills/property-finder/SKILL.md` | RealtyService (Realtor.com listings), USRealEstateService (property values), XoteloService (hotel market comps), MarketContextPanel |
| Tool Schemas | `.claude/skills/tool-schemas/SKILL.md` | Tool schema organization for calc/ deterministic tools |
| Tour | `.claude/skills/tour/SKILL.md` | Guided tour/walkthrough component for onboarding |
| UI Blocks | `.claude/skills/ui-blocks/SKILL.md` | Reference shadcn block patterns |
| Market Intelligence | `.claude/skills/market-intelligence/SKILL.md` | FRED, hospitality benchmarks, grounded research, BaseIntegrationService |
| ICP Research | `.claude/skills/icp-research/SKILL.md` | ICP profile definition, AI research center, prompt builder |
| Rebecca Chatbot | `.claude/skills/rebecca-chatbot/SKILL.md` | Gemini-powered portfolio analytics chat |
| Document Intelligence | `.claude/skills/document-intelligence/SKILL.md` | Google Document AI OCR pipeline, field mapping |
| Map View | `.claude/skills/map-view/SKILL.md` | MapLibre GL, Supercluster clustering, globe animation |
| Notifications | `.claude/skills/notifications/SKILL.md` | Alert rules, Resend email, notification logs |
| Rules (22) | `.claude/rules/` | All behavioral constraints |
| Business Model | `.claude/skills/business-model/SKILL.md` | Dual-entity model, revenue streams, USALI waterfall, management fees, SAFE funding, ICP, property lifecycle |
| Product Vision | `.claude/skills/product-vision/SKILL.md` | Product identity, design tenets, workflow principles, navigation, user roles, white-labeling |
| Integrations | `.claude/skills/integrations/SKILL.md` | AI providers, voice AI, geospatial, document intelligence, communication, observability |
| Settings Architecture | `.claude/skills/settings/SKILL.md` | Two configuration surfaces (Company Assumptions for admins, Admin panel for system config), read-only Model Inputs panel for non-admins on Company page |
| Design Export | `.claude/skills/design-export/SKILL.md` | Replicate the HBG design system in another project (components, themes, icons, charts) |
| Card Widths | `.claude/skills/ui/consistent-card-widths.md` | Page layout width categories, grid patterns, PageHeader alignment |
| Save Buttons | `.claude/skills/ui/save-button-placement.md` | SaveButton component, three placement patterns, dirty-tracking |
| Server Finance Engine | `server/finance/` | Server-authoritative portfolio pipeline: `service.ts` orchestrator, `core/` re-exports client pure functions, `POST /api/finance/compute` endpoint |
| Deterministic Hashing | `server/scenarios/stable-json.ts` | `json-stable-stringify` + 64-char SHA-256, `fast-deep-equal` for diff engine, tenant-scoped DB writes |
| Business Domain Pointers (13) | `.agents/skills/` | Slim pointers to `.claude/skills/` — business model, financial engine, verification, design philosophy, integrations, API contract, product vision, export system, design export, card widths, save buttons, settings architecture |

---

## Testing & Proof System (3,973 Tests, 170 Files)

| Level | Domains | Skill |
|-------|---------|-------|
| Individual Property | IS, CF, BS, trial balance, reconciliation, ASC 230 | `testing/property-statements.md` |
| Consolidated Portfolio | Aggregation, eliminations, portfolio IRR | `testing/consolidated-statements.md` |
| Management Company | Company pro forma, fee linkage, funding | `testing/management-company.md` |
| Returns Analysis | IRR, NPV, MOIC, sensitivity | `testing/analysis-returns.md` |
| Golden Scenarios | 500 hand-calculated reference tests (incl. Clearwater Inn mgmt co + 1 property, WACC) | `testing/golden-scenarios.md` |

**Commands**: `npm test` (all 3,976 tests, 170 files) · `npm run verify` (8-phase GAAP) · `npm run health` (tsc+tests+verify+doc harmony)

---

## Recent Changes (April 6, 2026)

- **Rebecca Panel (T19)** (Task #287) — 520px right slide-over chat panel (`client/src/components/rebecca/RebeccaPanel.tsx`) with context card, message bubbles, markdown rendering, and follow-up chips. Mutually exclusive with Guidance Side-Sheet via `panel-manager.ts` Zustand store. Mobile-responsive (100vw on small screens).
- **Rebecca Context Injection (T20)** (Task #287) — `server/ai/rebecca-context-builder.ts` assembles rich entity + field context server-side from IDs (never trusts client text). 40+ field label mappings with format awareness. `/api/chat` extended with optional `fieldContext` (entityType, entityId, fieldKey, scenarioId). IDOR prevention: validates property ownership via user portfolio, company ownership via `authUser.companyId`. Returns `autoGreeting` for field-contextual panel opens. `ResearchBadgePopover` passes `fieldKey + scenarioId` through panel manager.
- **Rebecca Super Conversations (T21)** (Task #287) — POST `/api/chat` now creates/resumes conversations via `getOrCreateConversation`, persists user + assistant messages to `rebecca_messages`, loads DB history (most recent N, capped at MAX_HISTORY_LENGTH). Returns `conversationId` + `suggestedChips` (contextual follow-up chips that evolve by round count and field context). GET `/api/chat/conversations/:id/messages` loads full conversation with ownership check. Context consistency enforced server-side — `conversationId` rejected if context mismatch. `newConversation` flag creates fresh thread. Client tracks `conversationId` in panel state, resets on context switch, loads prior conversation on re-open.
- **Rebecca Email + Feedback (T22)** (Task #287) — `server/routes/rebecca.ts`: POST `/api/rebecca/email` derives summary server-side from DB messages, sends via Resend, persists to `rebecca_emails`; POST `/api/rebecca/feedback` stores category + notes + context. Admin-only GET endpoints for conversations and feedback lists. `RebeccaEmailPreview.tsx` modal for recipient input + preview. `RebeccaFeedbackForm.tsx` modal for issue reporting. Panel header buttons: Mail (email summary) + Flag (report issue), visible when conversation active.
- **Rebecca RAG Expansion (T23)** (Task #287) — `multiNamespaceQuery()` in pinecone-service.ts for parallel cross-namespace vector search. KB expanded with 5 new chunks (GAAP revenue/expenses, investment metrics, ICP definitions, benchmark sources). Chat route now does parallel KB + multi-namespace retrieval (research-history, assumption-guidance) with namespace-specific metadata mapping and 3000-char budget cap. RAG context injected as attributed source block in system prompt.

## Recent Changes (April 4, 2026)

- **Input Validation Hardening (Phase 11)** (Task #277) — Comprehensive audit of all POST/PUT/PATCH handlers confirmed 100% Zod coverage. Fixed remaining gaps: added `prospectiveNotesSchema` for `PATCH /api/property-finder/prospective/:id/notes` (was reading `req.body.notes` without validation), added `adminLoginSchema` for `POST /api/auth/admin-login` (was manually destructuring password). Research fallback: when AI returns unparseable JSON (`rawResponse === true`) for property research, market_research storage is now skipped with a warning log (property value application was already guarded). Schemas added to `server/routes/helpers.ts`.
- **Observability & Error Handling (Phase 10)** (Task #276) — Verified zero unstructured `console.error/warn/log` in server code (only `server/logger.ts` uses `console.log` as the structured output). Upgraded `Sentry.ErrorBoundary` fallback in `App.tsx` from empty div to styled card with icon, message, and reload button. Added `logActivity("apply-research-values")` in `server/routes/research.ts` for AI research value application to properties (fields applied count, warning/failure metadata). All financial mutations now covered by activity logging.
- **JSONB Type Safety (Phase 8)** (Task #275) — All JSONB columns now carry `.$type<>()` annotations: `standardAcqPackage` → `StandardAcqPackage`, `debtAssumptions` → `DebtAssumptions`, `assetDefinition` → `AssetDefinition` in `config.ts`; `consolidatedYearlyJson` → `ConsolidatedYearlyJson` in `scenario-results.ts`; `metadata` → `NotificationLogMetadata`, `rawExtractionData` → `RawExtractionData` in `notifications.ts`; `seedValue` → `unknown` in `seedDefaults`. Eliminated all `z.any()` from Zod insert schemas (replaced with `z.unknown()` or `z.record(z.unknown())`). Removed unsafe `as Record<string, unknown>` cast in chat routes (now uses typed `AssetDefinition` directly). Six new shape interfaces added to `jsonb-shapes.ts`.
- **Deep Re-Audit (Phase 7)** (Task #274) — 7 audit files in `tests/audit/` (added `checker-architecture.test.ts` covering calculation checker boundary enforcement, adapter wiring verification, verification endpoint access policy, calc/validation module independence). All 123 audit assertions passing. Full architecture documentation updated.
- **Calculation Checker Consolidation (Phase 6)** (Task #273) — Added `reconcileSchedule` adapter to `server/calculation-checker/adapters.ts`. All 3 `calc/validation` modules now wired: `validateFinancialIdentities`, `checkFundingGates`, `reconcileSchedule`. Independent amortization schedule computation via `calc/shared/pmt.ts`. Boundary enforcement test prevents `@engine/` imports in checker code.
- **Deep Re-Audit & Final Quality Gate** (Task #268) — 6 audit test files in `tests/audit/` covering: data-flow integrity (engine pipeline trace, chain identity, precision, determinism), cache invalidation (hit/miss/clear, mutation path coverage, consistency under repeated access), scenario save/load (roundtrip hash, consolidation, persistence infra), endpoint security (auth, rate limiting, Zod validation, no hardcoded secrets), export parity (verifyExport checks, pipeline structure, hash stability), integration pipeline (engine→service→export contract verification, portfolio consolidation parity, scenario persistence roundtrip simulation, export data shape contracts, file-based server structure verification).
- **Zod Validation + Rate Limiting** (Task #266) — All unprotected POST/PUT/PATCH handlers now use Zod schema validation. `marketRatePatchSchema` uses `z.coerce.number` for backward compat. Rate limiting on compute-heavy endpoints.
- **ESLint CI + Pre-Commit Hooks** (Task #267) — ESLint flat config (`eslint.config.mjs`) scoped to `calc/` and `engine/` bans `Math.pow`, `|| 0`, `as any`, bare `any`, `safeNum`. Husky pre-commit hooks + lint-staged. `.github/workflows/ci.yml` for PR enforcement.

## Recent Changes (April 3, 2026)

- **Scenario Computed Snapshot Persistence** (Task C) — `scenario_results` table stores immutable computed artifacts (consolidated yearly JSON, output hash, inputs hash, audit opinion, engine version). Three endpoints: `POST /api/scenarios/:id/recompute` (full pipeline + persist + drift detection), `GET /api/scenarios/:id/results/latest`, `POST /api/scenarios/:id/drift-check` (engine-version-aware: `match` / `input_changed` / `engine_changed`). Scenarios table has denormalized `lastOutputHash`, `lastComputedAt`, `lastEngineVersion` pointers.
- **Export Reproducibility Lock** (Task B) — `server/report/server-export-data.ts` builds IS/CF statements from server-recomputed data. `computeRef` in export requests triggers server-authoritative pipeline, ignoring client payload. `X-Finance-Output-Hash` + `X-Finance-Engine-Version` response headers. Legacy path unchanged.
- **Server-Side Export Generation** (Phase 4) — `POST /api/exports/generate` endpoint generates PDF/Excel/PPTX/DOCX/CSV exports server-side. Accepts `{ entityType, entityId?, format, orientation, version, projectionYears, reportScope }`. `version` controls row detail (`short` = summary, `extended` = full). `reportScope` filters statements (`all | income | cashflow | balance | overview | investment`). Builders: `buildExportData` (portfolio), `buildPropertyExportData`, `buildCompanyExportData`. CSV generator: `server/exports/csv-generator.ts`. `USE_SERVER_EXPORTS=true` feature flag. Client `ExportDialog` passes `ServerExportConfig` with `reportScope` from active tab. Client fallback preserved.

## Recent Changes (March 23, 2026)

- **Admin Scenario Governance** (Task #235) — Admin scenario governance and assignment management.
- **KPI Cover Pages Permanently Removed** — Removed both KPI generation paths from report compiler (`compileReport`). No KPI sections or cover pages in ANY PDF export, ever.
- **Chart Screenshots in Premium PDF** — Client captures Overview charts via `dom-to-image-more` → base64 PNG in payload `chartScreenshots[]` → server embeds via `@react-pdf/renderer` `Image` component. CSS cleanup sheet injected during capture (transparent borders, no shadows).
- **Admin LLM Recommendations** — Per-domain differentiated LLM recommendations: Gemini 2.5 Pro (company/property research), Claude Sonnet 4.5 (market/chatbot), GPT-4.1 Mini (utilities), Claude Sonnet 4 (graphics). Star icon hints below card titles.
- **Premium Overview PDF Polish** (Task #230) — Removed header accent bar, increased font sizes, denser pagination for Overview PDF exports.
- **Line-Item Detail Toggle Removal** (Task #228) — Removed conflicting line-item detail toggle from export UI.
- **Premium PDF Theme Compliance** (Task #227) — Removed out-of-theme colors from premium PDF, added LLM design pass for layout hints, dropped Puppeteer dependency for PDF (retained for PNG only).
- **Hardcoded Green → Theme Tokens** (Task #226) — Replaced all hardcoded green color values with theme CSS variable tokens.
- **Overview PDF Export & Cover Page Removal** (Task #225) — Fixed Overview tab premium PDF export. Cover pages permanently removed from all export formats.
- **Unified Report Compiler** (Task #224) — Built `server/report/compiler.ts` with single `compileReport()` → `ReportDefinition` IR consumed by all 5 format renderers. No AI calls in any renderer.
- **Premium PDF Engine Replacement** (Task #223) — Replaced puppeteer-core + AI HTML pipeline with @react-pdf/renderer for premium PDF exports.

## Changes (March 16, 2026)

- **Premium PDF Export Redesign** — Switched premium export AI backend from Anthropic to Gemini 2.5 Flash. Enterprise-quality PDF design with branded headers, KPI cards, callout blocks.
- **Model Defaults Admin Section** — New "Model Defaults" tab in Admin > Business group with Market & Macro and Property Underwriting sub-tabs.
- **Verification Bug Fixes** — Fixed DSCR check for pre-operational Year 1 properties, Net Income/Cash Flow identity checks for NOL carryforward.
- **Multi-Vendor Research LLMs** — Vendor-agnostic `ResearchClient` with Anthropic, OpenAI, and Gemini adapters.
- **Settings Elimination & Access Control** (Task #168) — Eliminated General Settings page. Two-surface model: Company Assumptions + Admin.
- **Governance Harmonization** (Task #153) — 7 new skills, 13 slim pointers.
- **Configuration Terminology Refresh** (Tasks #180–182) — Standardized "seed defaults", "live assumptions", "config switches" vocabulary.
- **USALI Restructure** — All property-level IS and CF statements follow USALI 12th Edition order.
- **Insurance Removal** — Removed insurance expense from entire codebase. NOI = IBFC − Property Taxes.
- **Fee Category Restructure** (Tasks #108–#109), **Funding Interest** (Task #116), **Login Redesign** (Tasks #63, #131), **ICP Split** (Task #71), **LLM Dual-Model** (Task #101), **DocuSign/Slack Removal** (Tasks #133–134), **Resend Email** (Task #68), **Excel Standardization** (Task #112), **Admin Hardening** (March 13), **Norfolk AI Theme** (Task #84), **DB Integrity** (Task #80), **Deterministic Calcs** (Task #64).

---

## Export System

Full reference: `.claude/skills/exports/SKILL.md`. SDD: `.claude/skills/exports/premium-export-spec.md`.
- **Unified Report Compiler**: `server/report/compiler.ts` — single `compileReport()` produces a `ReportDefinition` IR (types in `server/report/types.ts`) consumed by all 5 format renderers. Consolidates section selection, value formatting, formula-row filtering, chart series extraction, investment section splitting, and theme resolution. KPI sections are never generated.
- **Premium Export**: `POST /api/exports/premium` — All 5 formats (PDF, PPTX, DOCX, XLSX, PNG) compile once via `compileReport()` then dispatch to format-specific renderers. No LLM calls for any format.
- **Export Reproducibility Lock**: When `computeRef` is present in export requests, `server/report/server-export-data.ts` fetches properties + global assumptions from DB, runs `computePortfolioProjection` server-side, and produces deterministic IS/CF statements, rows, and metrics — ignoring client payload entirely. Response headers `X-Finance-Output-Hash` (SHA-256) and `X-Finance-Engine-Version` accompany each server-recomputed export. Legacy path unchanged when `computeRef` absent.
- **Scenario Computed Snapshot Persistence**: `scenario_results` table stores immutable computed artifacts (consolidated yearly JSON, output hash, inputs hash, audit opinion, engine version) per scenario. `POST /api/scenarios/:id/recompute` runs full pipeline + persists + drift detection. `GET /api/scenarios/:id/results/latest` returns most recent. `POST /api/scenarios/:id/drift-check` engine-version-aware (`match` / `input_changed` / `engine_changed`). Scenarios table carries denormalized `lastOutputHash`, `lastComputedAt`, `lastEngineVersion` pointers.
- **Format renderers**: PDF (`server/pdf/render.tsx` via @react-pdf/renderer), PPTX (`generatePptxFromReport`), XLSX (`generateExcelFromReport`), DOCX (`generateDocxFromReport`), PNG (`generatePngFromReport` via browser screenshots). Each accepts a `ReportDefinition` with pre-formatted values and design tokens. Supports `ImageSection` for embedded chart screenshots.
- **Chart screenshots**: Client captures Overview charts via `dom-to-image-more` (3 targets: `data-export-section="investment-chart"`, `"revenue-chart"`, `"distribution-chart"`), sends as base64 PNG array in `chartScreenshots[]`. Server embeds via `@react-pdf/renderer` `Image` component. `captureOverviewCharts.ts` injects CSS cleanup sheet during capture (transparent borders, no shadows).
- **Client-side fallback** (when premium toggle off): jsPDF, pptxgenjs, SheetJS, CSV, dom-to-image-more.
- **Page dimensions**: Landscape = 16:9 (406.4mm × 228.6mm), Portrait = US Letter (215.9mm × 279.4mm).
- **Browser rendering**: `server/browser-renderer.ts` — Puppeteer with system Chromium. Used for PNG rendering only.
- **Report structure**: Statement→Chart interleaving. Each statement table is followed by a chart page. Overview tab produces multi-page reports with chart screenshots, projection tables, portfolio composition, property insights, distribution tables, and USALI waterfall. No cover pages, no KPI sections — ever.
- **Export Rules** (see `.claude/rules/exports.md`):
  1. **Full-scope**: Export from ANY tab exports ALL statements — never just the active tab.
  2. **Formula filtering**: Rows with `isItalic=true` never exported.
  3. **Short/Extended**: Short = header/total rows; Extended = all line items. Controlled via `summaryOnly` parameter.
  4. **Theme colors**: Client sends `themeColors` array; server resolves via `resolveThemeColors()`.
  5. **File save**: `saveFile()` tries native `showSaveFilePicker` (Chrome/Comet), falls back to download.
  6. **Single button**: One `ExportMenu` per page in tab bar — no per-tab export buttons.
  7. **Tables never split**: `wrap={false}` on all section Views. Tables move to next page intact unless larger than a page.
  8. **Thin hairlines**: Table borders use hairline widths (0.25–0.75pt) with `theme.foreground` color for strong contrast against white.
  9. **Chart series keywords**: Must match actual row labels (e.g., "cash flow from operations" not "free cash flow").

---

## Storage Architecture (SQL vs Pinecone)

| Layer | Store | What | Why |
|-------|-------|------|-----|
| Structured data | PostgreSQL | Properties, scenarios, users, market_research, market_rates, global_assumptions, logos, companies, integrations | Relational integrity, ACID transactions, joins, indexing |
| Semantic retrieval | Pinecone `knowledge-base` | Document chunks from methodology, platform guide, checker manual, attached_assets | RAG for AI chat (Rebecca) and research prompts |
| Prior knowledge | Pinecone `research-history` | Research result summaries (≤1,500 chars), key metrics, propertyId, location | Enables "what did we learn about similar properties?" context for N+1 orchestrator |
| Guidance vectors | Pinecone `assumption-guidance` (PLANNED) | Vectorized assumption guidance records for Rebecca RAG | Enables Rebecca to answer questions about any research finding |

**Design rule:** SQL is the system of record; Pinecone is the semantic index. Research results live in `market_research` (full content, JSONB) and are *additionally* indexed in Pinecone (summary only) for retrieval.

---

## Research Intelligence Redesign (IN PROGRESS — Task #287)

Major architectural evolution of the research system. Full spec: `.claude/skills/research/research-intelligence-redesign.md` and `.local/tasks/research-intelligence-redesign.md`.

### Key Innovations
- **Star Rating System (1-5★)**: User-defined hotel classification (5★=Four Seasons, 3★=Holiday Inn). Primary driver for comparable matching. Auto-suggested from ADR + amenities + rooms. Star icon badges in UI.
- **Hotel vs Resort Classification**: User-set property type (Hotel/Resort/Boutique Hotel/Business Hotel/Wellness Resort/Conference Hotel/Extended Stay). Different economics drive different comparable sets.
- **Entity Context Packs**: Auto-assembly of 60+ property/company fields into research prompts (replaces thin 7-field context). Includes star rating, property type, full address, amenities (natural language), cost rates, capital structure, ICP alignment.
- **3-Tier Intelligence**: Tier 0 (ambient macro data, no LLM), Tier 1 (entity-scoped N+1 pipeline), Tier 2 (single-field deep-dive, <5s)
- **Progressive Relaxation (L0-L5)**: Finds comparable sets by gradually relaxing criteria. Star rating NEVER relaxes beyond ±1. Full provenance transparency.
- **Rebecca as Conversational Intelligence Layer**: Replaces complex tooltips. Super Conversations (trademark Norfolk AI). Sends email summaries and Norfolk AI feedback reports. Special RAG with access to everything.
- **Scenario-Scoped Guidance**: Research keyed to (scenario_id, entity_type, entity_id, assumption_key)
- **ResearchBadge → Popover → Side-Sheet + Rebecca**: Badge click shows 3-option popover (Ask Rebecca / Apply Value / View Details)
- **Complete Badge Coverage**: 40+ property fields, 30+ company fields
- **Admin Console**: Coverage Analytics, QA Sandbox, Pipeline Policies, Model Routing per tier, Rebecca admin (6 sub-tabs), unified API Dashboard, Source Registry
- **Navigation Redesign**: App sidebar: Home/Intelligence/Settings. Admin: Business/Intelligence/AI/Design/System

### New Database Tables (IMPLEMENTED)
assumption_guidance, research_runs, benchmark_snapshots, relaxation_traces, guidance_decisions, rebecca_conversations, rebecca_messages, rebecca_emails, rebecca_feedback, coverage_snapshots, source_registry, integration_key_rotations, pipeline_policies — all in `shared/schema/intelligence-v2.ts`

### New Property Fields (IMPLEMENTED)
starRating (1-5), starRatingSource, starRatingSuggested, hospitalityType (hotel|resort|boutique_hotel|...) — with Zod validation

### Context Pack System (IMPLEMENTED)
- `server/ai/context-pack/` — PropertyContextPack (10 categories), CompanyContextPack (8 categories), luxury classifier
- `server/ai/prompt/` — Auto-prompt assembly engine (Tier 1 full entity, Tier 2 single assumption)
- `server/ai/guidance/` — Guidance extractor with Zod validation, key normalization, dual extraction paths
- `server/routes/guidance.ts` — Scenario-scoped guidance API + Tier 2 deep-dive endpoint
- `server/ai/ambient/` — Tier 0 benchmark scheduler (21 hospitality benchmarks, 6h refresh)
- `server/ai/comparables/` — Progressive relaxation engine (L0-L5), Star ±1 hard guard

### Phase 3 UX Components (IMPLEMENTED — T13/T14/T15)
- `client/src/lib/panel-manager.ts` — Zustand store for mutual exclusion between GuidanceSideSheet and Rebecca panel
- `client/src/components/research/ResearchBadgePopover.tsx` — 3-option popover (Apply Value, View Details, Ask Rebecca)
- `client/src/components/research/GuidanceSideSheet.tsx` — 480px right slide-over with 4 tabs + sticky footer actions
- `client/src/components/research/RelaxationTrailStepper.tsx` — L0-L5 vertical stepper with expandable detail
- `client/src/components/research/ResearchContextFieldLabel.tsx` — Unified wrapper: label + badge + confidence + freshness + state

### Phase 4 Rebecca Layer (IN PROGRESS — T19-T24)
- **T19 ✅** `client/src/components/rebecca/RebeccaPanel.tsx` — 520px slide-over, auto-greeting, field context chips
- **T19 ✅** `client/src/components/rebecca/RebeccaContextCard.tsx` — Collapsible field context card
- **T20 ✅** `server/ai/rebecca-context-builder.ts` — Server-side context assembly from entity IDs + field key. Calls context pack builders, fetches guidance records, generates auto-greeting. IDOR-safe (never trusts client context text).
- **T20 ✅** `server/routes/chat.ts` — Extended with optional `fieldContext` Zod schema (entityType, entityId, fieldKey, scenarioId). Validates entity ownership before context build. Injects rich field+entity context into LLM system prompt.
- **T20 ✅** `client/src/lib/panel-manager.ts` — RebeccaContext extended with `fieldKey` and `scenarioId`
- **T21 ✅** `server/routes/chat.ts` — Super Conversations: POST /api/chat creates/resumes conversations via `getOrCreateConversation`, persists user+assistant messages to `rebecca_messages`, loads DB history (most recent N), returns `conversationId` + `suggestedChips`. GET `/api/chat/conversations/:id/messages` loads conversation with ownership check. Context consistency enforced server-side. `newConversation` flag creates fresh thread.
- **T21 ✅** `client/src/components/rebecca/RebeccaPanel.tsx` — Tracks `conversationId` state, resets on context change, loads prior conversation from API, uses server-provided `suggestedChips`, "New conversation" button sends `newConversation: true`.
- **T22 ✅** `server/routes/rebecca.ts` — POST `/api/rebecca/email` (derives summary server-side from DB messages, sends via Resend, persists to `rebecca_emails`), POST `/api/rebecca/feedback` (category enum + notes + conversation context), GET `/api/rebecca/conversations` (admin-only), GET `/api/rebecca/feedback` (admin-only, optional status filter). Registered in `server/routes.ts`.
- **T22 ✅** `client/src/components/rebecca/RebeccaEmailPreview.tsx` — Email preview modal: recipient input, auto-generated subject preview, conversation summary preview, send button.
- **T22 ✅** `client/src/components/rebecca/RebeccaFeedbackForm.tsx` — Feedback modal: category dropdown (incorrect/unhelpful/missing_data/other), notes textarea, auto-includes entity context.
- **T22 ✅** `client/src/components/rebecca/RebeccaPanel.tsx` — Added Mail + Flag action buttons in header (visible when conversation has messages + conversationId). Opens email/feedback modals.
- **T23 ✅** `server/ai/pinecone-service.ts` — Added `multiNamespaceQuery(query, namespaces[], topK)` for parallel cross-namespace vector search. Returns `MultiNamespaceMatch[]` with namespace attribution, sorted by score.
- **T23 ✅** `server/ai/kb-content.ts` — Added 5 new KB chunks: GAAP revenue recognition (ASC 606), USALI expense classification, investment metrics (IRR/equity multiple/cap rates/DSCR), ICP scoring definitions, benchmark data sources.
- **T23 ✅** `server/routes/chat.ts` — RAG context injection: parallel KB + multi-namespace retrieval (research-history, assumption-guidance), namespace-specific metadata mapping, 3000-char budget cap with source attribution. Injected as `KNOWLEDGE BASE & RESEARCH CONTEXT` block in system prompt.
- T24: NOT STARTED (admin tabs)

---

## Key Rules

- **Calculations always highest priority** — never compromise financial accuracy for visuals
- **No raw hex in components** — use CSS variable tokens
- **All buttons GlassButton**, all pages PageHeader, all exports ExportMenu
- **No mock data** in production paths
- **Finance changes must state Active Skill** and pass verification (UNQUALIFIED)
- **ANOI terminology**: After-fee NOI = "Adjusted NOI (ANOI)". Internal field stays `noi`.
- **Rebecca must NEVER compute financial values** — all data from the calculation engine
- **Engine chain**: `gop = revenue − opex`, `agop = gop − feeBase − feeIncentive`, `noi = agop − expenseTaxes`, `anoi = noi − expenseFFE`
- **Balance Sheet Identity**: A = L + E must hold within $1. Cash derivation uses `m.anoi` (never `m.noi`). See `rules/balance-sheet-identity.md`.
- **Brand colors**: SAGE=#9FBCA4, DARK_GREEN=#257D41, NAVY=#1A2332, SECTION_BG=#EFF5F0, ALT_ROW=#F8FAF9
- **normalizeCaps() abbreviations**: GOP, NOI, AGOP, ANOI, GAAP, FFE, FF&E, DSCR, IRR, CFO, ADR, REVPAR, LTV, EBITDA, WACC
- **Icon standard**: `IconPlay` for "Run Research", `IconEye` for "Criteria", `IconBanknote` for Reconciliation
- **Resend replaces SendGrid** for all transactional email — `server/services/resend.ts`
- **ICP = Profile + Research Center** — two separate pages, not one monolithic ICP page
- **LLM dual-model config** — primary + fallback model with vendor selection (OpenAI, Anthropic, Gemini) in Admin LLM tab. 7 domains: Company Research, Property Research, Market Research, Report Generation, Chatbot (Rebecca), Premium Exports, AI Utilities. All AI model selections defined in admin LLMs page only — no hardcoded models anywhere.
- **Norfolk AI theme** — additional theme preset alongside Tuscan Olive Grove
- **Settings placement** — General Settings page eliminated (Task #168). Two surfaces: Company Assumptions (admin-only, entity config), Admin panel (system config). Calc transparency + tour toggles moved to Admin Navigation tab. Auto-research toggle moved to Admin Research Center tab. Non-admins see read-only Model Inputs panel on Company page.

---

## User Roles

| Role | Access |
|------|--------|
| `admin` | Full — all pages + Admin Settings |
| `user` | Management-level — no Admin panel |
| `checker` | User + verification tools |
| `investor` | Limited — Dashboard, Properties, Profile, Help |

---

## Database Migration Pattern

Consolidated Drizzle-managed SQL migrations in `migrations/`. 7 migration files:
- `0000_brainy_mother_askani.sql` — initial schema
- `0001_optional_password_hash.sql` — optional password hash
- `0002_db_integrity_hardening.sql` — FK indexes, composite indexes, constraints
- `0003_add_business_insurance.sql` — business insurance fields
- `0004_consolidated_schema.sql` — consolidated schema (all tables)
- `0005_google_drive_tokens.sql` — Google Drive token storage
- `0006_add_missing_indexes.sql` — additional performance indexes

Old individual `server/migrations/*.ts` files have been superseded by this consolidated Drizzle migration structure.

---

## Governed Model Constants (DB-Backed)

`DEPRECIATION_YEARS` (39) and `DAYS_PER_MONTH` (30.5) are now DB-backed with constant fallbacks. Cascade: `property.depreciationYears → global.depreciationYears → DEPRECIATION_YEARS constant (39)`. `daysPerMonth` is global-only: `global.daysPerMonth → DAYS_PER_MONTH constant (30.5)`. Editable in Company Assumptions under "Model Constants" with governed field wrappers. All engine files (`resolve-assumptions.ts`, `property-engine.ts`), server checker files, and client audit files use the cascade. **DEPRECIATION_YEARS = 39 is the US fallback default, NOT immutable.** The useful life varies by country (see `shared/countryDefaults.ts` for per-country values and governing authority citations). The calculation METHOD always follows US GAAP (ASC 360, straight-line); only the period changes.

---

## H+ Analytics Logo Variants

| Variant | Path | Best Use |
|---------|------|----------|
| Glass (default) | `/logos/h-plus-glass.png` | Sidebar, favicon, small contexts |
| Enhanced Transparent | `/logos/h-plus-enhanced-transparent.png` | Login page, reports, light backgrounds |
| Enhanced Dark | `/logos/h-plus-enhanced-dark.png` | PDF headers, dark mode, presentation slides |

---

## Quick Commands

```bash
npm run dev            # Start dev server (port 5000)
npm run health         # tsc + tests + verify + doc harmony (~60s)
npm run test:summary   # All 3,976 tests, 170 files (~35s)
npm run verify:summary # 8-phase financial verification (~20s)
npm run lint:summary   # TypeScript check only (<10s)
npm run stats          # File/line/test counts (<5s, no vitest)
npm run audit:quick    # Code quality: `any`, TODO, console.log (<3s)
npm run exports:check  # Unused export detection (<5s)
npm run diff:summary   # Git status + diff stats (<1s)
npm run db:push        # Push schema changes
npm run test:file -- <path>  # Single test file
```
