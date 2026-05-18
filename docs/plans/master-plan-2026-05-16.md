# H+ Analytics — Master Plan
**Authored:** 2026-05-16 (CC session, full codebase audit)
**Status:** Living document — update as items complete
**Owner:** Ricardo Cidale / Norfolk AI

---

## How to use this document

Every CC or Replit session should open this file first. Before writing a line of code:
1. Find the item in the plan
2. Read the "Done when" criteria
3. Write the plan unit against those criteria — not against vague intent
4. After shipping, mark the item ✅ and record the commit SHA

**This document exists to eliminate the rewrite tax.** If you find yourself writing code for something not in this plan, add it here first and define "done" before you start.

---

## App health scorecard (as of 2026-05-16 audit)

| Area | Status | Investor-critical? | Notes |
|---|---|---|---|
| Financial engine (IRR, NOI, refi, exit) | ✅ Mechanically correct | YES | 95% test coverage; one verification step remaining |
| Slide factory (6-slide PPTX + PDF) | ✅ Operationally complete | YES | All builders wired; dual output working |
| Export routes (XLSX, DOCX, PPTX, CSV) | ✅ All exist | YES | Via `POST /api/exports/generate`; raw engine XLSX needs thin wrapper |
| User auth (Google OAuth, invitations) | ✅ Working | YES | Dual Railway + Replit secrets required |
| Scenario CRUD + sharing | ✅ Working | YES | Soft-delete, share by email, access control all wired |
| Photo albums | ✅ Working | NO | Upload, display, enhance, move — complete |
| Rebecca (AI assistant) | ✅ 104 tools, near-full parity | NO | 2 minor deferred gaps; 1 N/A |
| Agent infrastructure (Costantino, Pietro, Iris, Vito) | ✅ All working | NO | 27 DB-driven LLM slots |
| Railway deployment | ✅ Complete | YES | Zero hard Replit dependencies |
| Admin default scenario per user | ✅ Done (2026-05-16) | NO | `users.assignedScenarioId`; EditUserDialog dropdown; hydration at login |
| Management company / investor view separation | ✅ Done (2026-05-16) | NO | perspectiveRole on scenarios; compute strips mgmt co P&L for investor |
| Portfolio grouping (sub-groups) | ✅ Done (2026-05-16) | NO | portfolios table + assign UI; unassigned properties section on Portfolio page |
| Model router (Matteo) | ❌ Not started | NO | Phase 2 — 30–50% token cost savings |
| Dreaming on research | ❌ Not started | NO | Phase 2 — research memory accumulation |
| Email existence leak in sharing | ⚠️ Security bug | NO | Returns 201 instead of 404 on unknown email |
| DEFAULT_* → model_defaults migration | ⚠️ Partial | NO | Incremental — 5+ legacy TS constants remain |

---

## Track 0 — Investor demo ready
*Goal: Get correct numbers and a slide deck into investor hands, even if app is not fully polished. Days, not weeks.*

### T0-1: U8 — Verify portfolio IRR in 28–38% band
**Status:** ✅ Done (2026-05-16, commit `a8f1b0a5c`)
**Result:** Portfolio IRR = **35.55%** ✓ PASS. All 7 properties documented in `docs/runbooks/seed-calibration-2026-05-13.md`. CLAUDE.md U8 checkbox marked.
- San Diego 51.6% · Scott's House 42.6% · Lakeview Haven 37.7% · Loch Sheldrake 37.1% · Belleayre 30.4% · Jano Grande 29.8% · Medellin Duplex 13.5% (by design)
- Portfolio equity invested $19.43M · exit value $69.5M · equity multiple 6.12×

---

### T0-2: Raw financial engine output → XLSX
**Status:** ✅ Done (2026-05-16, commit `a8f1b0a5c`)
**Route:** `GET /api/finance/compute/export?projectionYears=10`
**Result:** Valid 8-sheet XLSX (Portfolio Summary + 1 tab per property). Each property tab: Revenue, GOP, NOI, ANOI, Debt Service, Cash Flow, Occupancy %, ADR, Sold Rooms by year. Portfolio summary tab: IRR, equity multiple, totals, per-property table.
**Verified:** HTTP 200, 17KB XLSX with valid structure, passes typecheck + magic-numbers gate.
**Note:** Uses ExcelJS directly — independent of report compiler or slide factory. Auth via session cookie.

---

### T0-3: Confirm slide factory PPTX quality for manual-finish use
**Status:** ✅ Done (2026-05-16, commit d3dde140f)
**Result:** Full factory run 10 completed end-to-end. PPTX assembled (all 6 slides, 28 substitution entries), uploaded to R2, download route working. Root cause of `pptxR2Key=null` was `pptx-automizer` corrupting table data when `setTableData` was called once per cell — fixed by batching all `table_cell` entries per shape into one call (`applyTableCellsBatched`). `rebuild-pptx` route added for recovering complete runs with null R2 keys. LibreOffice unavailability handled gracefully (PPTX-only fallback). Learning documented at `docs/solutions/logic-errors/pptx-automizer-table-cell-batching-1x1-corruption-2026-05-16.md`.

---

## Track 1 — Platform hardening
*Goal: Fix security issues, close small gaps, and reduce technical debt. Weeks 1–4.*

### T1-1: Fix email existence leak in scenario sharing
**Status:** ✅ Done (2026-05-16, commit `c48b89f84`)
**Fix:** `artifacts/api-server/src/routes/scenarios.ts` line ~481 — changed silent `201 { shares: [] }` for unknown email to `404 { error: "User not found", code: "SCN-046" }`. The `201` response with empty `shares[]` leaked user existence via body discrimination (caller could tell unknown email by `shares.length === 0` with no error). Typecheck + magic-numbers gate pass.

---

### T1-2: Property soft-delete UI toggle
**Status:** ✅ Done (2026-05-16, Replit, commit `f02ee07b8`) — `AdminPropertiesTab.tsx` added; "Archived" entry in Portfolio admin sidebar group; Restore button calls `POST /api/admin/properties/:id/restore`; `AdminSidebar.tsx` wired.
**Done when:**
- User can "hide" a property from their view via a UI action (button or menu item)
- Hidden property disappears from the user's property list
- Admin can see all archived properties and restore them ✅
- Property DB row, all photos, and all renders are preserved on hide

**Effort:** 2–4 hours (thin UI + route wiring; storage already exists)
**Owner:** Replit-safe

---

### T1-3: Admin default scenario per user
**Status:** ✅ Done (2026-05-16) — CC backend commit `8bc3824fc` (schema + migration + route); Replit UI commit `f02ee07b8` ("Default Scenario" dropdown in EditUserDialog, `assignedScenarioId` in User type, `assignScenarioMutation` in UsersTab)
**Context:** Currently every user gets an auto-created `kind="default"` scenario at first login. Admin cannot pre-configure which properties a user sees. Required for: investor users who should see only their property on sign-in; management company owner who sees full portfolio.
**Done when:**
- `users` table has `assignedScenarioId` (FK to scenarios, nullable)
- Migration: `ALTER TABLE users ADD COLUMN assigned_scenario_id integer REFERENCES scenarios(id)`
- Admin UI: dropdown on user edit page to select a scenario as the user's default
- `POST /api/auth/google/callback` (and Replit + local auth callbacks): if `assignedScenarioId` is set, load that scenario instead of auto-creating a blank default
- If `assignedScenarioId` is null: current behavior (auto-create blank default) unchanged

**Effort:** 8–12 hours
**Owner:** CC (migration) + Replit-safe for UI

---

### T1-4: DEFAULT_* constants → model_defaults DB rows (incremental)
**Status:** ✅ Phase 1 complete (2026-05-16) + 6 incremental retirements (2026-05-18, session 17) + 2 cross-cutting refactors deferred to dedicated plan docs.
**Progress phase 1 (commit `6d8cbaf0f`):** Schema (`lib/db/src/schema/properties.ts`) no longer imports `DEFAULT_EXIT_CAP_RATE`, `DEFAULT_COMMISSION_RATE`, `DEFAULT_LAND_VALUE_PERCENT`, or `DEFAULT_PROPERTY_INCOME_TAX_RATE` — replaced with inline numeric literals. `PropertyInput.exitCapRate/dispositionCommission/landValuePercent` and `LoanParams` equivalents promoted to required `number`. All `?? DEFAULT_*` dead-code fallbacks removed from engine and calc layers.

**Phase 2 retirements shipped 2026-05-18 (session 17):**
| Commit | Constant(s) retired |
|---|---|
| `b981c4e66` | `DEFAULT_MAX_STALENESS_HOURS` |
| `5f0c73402` | `DEFAULT_REINVESTMENT_RATE` |
| `5d02e7e18` | `DEFAULT_OCCUPANCY_GROWTH_STEP` |
| `ccb3efdcb` | `DEFAULT_AR_DAYS` + `DEFAULT_AP_DAYS` (paired) |
| `fe730c7c9` | `DEFAULT_PROPERTY_INFLATION_RATE` + `DEFAULT_COMPANY_INFLATION_RATE` (paired) |
| `b34b8d20a` | `DEFAULT_OFFICE_LEASE_START` + `DEFAULT_PROFESSIONAL_SERVICES_START` + `DEFAULT_TECH_INFRA_START` + `DEFAULT_BUSINESS_INSURANCE_START` (overhead quadruple) |

**Deferred — plan required (cross-cutting refactors, NOT 1–3-hour increments):**
- `DEFAULT_PROPERTY_INCOME_TAX_RATE` (20+ sites across client + calc + engine + verification) — see `docs/plans/t1-4-property-income-tax-rate-retirement.md`
- `DEFAULT_LAND_VALUE_PERCENT` (30+ sites including 10 client-side `??` chains) — see `docs/plans/t1-4-land-value-percent-retirement.md`

**Remaining bounded targets (still incremental-eligible):**
- `DEFAULT_OCCUPANCY_RAMP_MONTHS`, `DEFAULT_START_OCCUPANCY`, `DEFAULT_MAX_OCCUPANCY`, `DEFAULT_START_ADR`, `DEFAULT_ROOM_COUNT`, `DEFAULT_ADR_GROWTH_RATE` — share the PropertyUnderwritingTab/Portfolio.tsx admin UI + route fallback profile; moderate cascade per constant
- `DEFAULT_MARKETING_RATE`, `DEFAULT_MISC_OPS_RATE`, `DEFAULT_TRAVEL_COST_PER_CLIENT`, `DEFAULT_IT_LICENSE_PER_CLIENT` — overhead rate cluster, audit before classifying
- `DEFAULT_ALERT_COOLDOWN_MINUTES` — has notifications/engine.ts `??` fallback

**Context:** CLAUDE.md §2 prohibits TypeScript constants for financial values.
**Done when (per constant):**
- Constant removed from `constants*.ts`
- Corresponding `model_defaults` row added (already seeded for most via `seed-model-defaults.ts`) OR per-row schema column NOT NULL DEFAULT carries the bootstrap (e.g., `intelligence.maxStalenessHours`)
- Engine reads the value via DB column (no TS fallback) OR keeps `?? <literal>` inline if PropertyInput type-tightening is deferred
- `check-magic-numbers` script passes (re-init baseline as needed per the documented `--init` flow for intentional bootstrap-literal additions)

**Effort:** 1–3 hours per constant for bounded targets; 1–2 days for cross-cutting refactors (see plan docs)
**Owner:** CC only (constants files are in protected surface)

---

### T1-5: CodeRabbit deferred findings from PR #147
**Status:** ⚠️ Partial (items 1, 3, 4 done 2026-05-16)
**Items:**
1. ✅ `brandId` FK `ON DELETE RESTRICT` — migrations 0064/0071 added (commit 5b7f2ab0b)
2. ⬜ Double-cast in `artifacts/api-server/src/routes/analyst-admin-runners-mgmt.ts` — advisory, deferred
3. ✅ `EMPTY_PORTFOLIO_DEFAULT_MIX` — taxonomy comment added confirming algorithm calibration exception (commit b6cc85d4c)
4. ✅ SEED_* literals in `property-data.ts` — market-source citations added to cap rates, financing rates, ADR growth tiers (commit f5e8c40a5)

**Effort:** 2–4 hours total
**Owner:** CC (items 1, 3) + Replit-safe (items 2, 4)

---

## Track 2 — User experience features
*Goal: Close the feature gaps users and investors will notice. Weeks 4–8.*

### T2-1: Management company / investor view separation
**Status:** ✅ Phase complete (2026-05-16, backend commit `295b07e85`) — schema, migration, runtime guard, finance route filter, scenario route, Rebecca tool, parity map. UI (admin per-user perspectiveRole setter + hidden menu items) remains Replit-safe.
**Context:** An investor in a single property should not see the management company's P&L, overhead, or fee structures. Currently all users see the same data model.
**Done when (backend):**
- ✅ `scenarios.perspectiveRole` enum: `operator | investor`, default `operator`, migration 0067/0074 + runtime guard
- ✅ Finance route `/compute`: strips `companyMonthly`/`companyYearly` when `perspectiveRole='investor'`
- ✅ Finance route `/company`: returns 403 FIN-011 for investor perspective
- ✅ Rebecca `update_scenario` tool exposes `perspectiveRole` toggle
- ✅ `createScenarioSchema` + `updateScenarioSchema` updated
- ⬜ UI: admin can set `perspectiveRole` on a per-user default scenario (Replit-safe)
- ⬜ UI: Menu items — management company assumptions hidden when role = investor (Replit-safe)

**Owner:** CC ✅ (finance route, schema) + Replit-safe ⬜ (UI)
**Note:** This is independent of the LP/GP waterfall — that is a separate feature. Investor view simply excludes management company economics from what the user sees.

---

### T2-2: Portfolio grouping
**Status:** ✅ Complete (2026-05-16) — CC backend: schema, migrations, storage, CRUD routes, Rebecca tools (6), parity map. Replit UI commit `9b3222350` ("Unassigned Properties" section on Portfolio.tsx with per-row dropdown + "Assign to portfolio" button; calls PUT /api/properties/:id/portfolio, invalidates properties query); ownership-check follow-up commit `00bac3340`.
**Context:** Multiple users need to be able to see different groupings of properties (e.g., "Southeast Portfolio," "Colombia Properties"). Currently all properties in a company are a flat list.
**Done when:**
- `portfolios` table: `(id, userId, companyId, name, description, createdAt)`
- `properties` table: `portfolioId` (FK to portfolios, nullable)
- `GET /api/portfolios`: list user's portfolios
- `GET /api/portfolios/:id/properties`: properties in a portfolio
- Finance compute accepts optional `portfolioId` filter
- UI: portfolio selector on the property list page

**Effort:** 3–5 days
**Owner:** CC (migration, routes) + Replit-safe (UI)

---

### T2-3: Analyst button — content generation discipline
**Status:** ✅ Complete (2026-05-16) — CC commit `0987d6968` (audit, `generate_executive_summary` + `rewrite_property_description` Rebecca tools); Replit UI commit `5252d10bf` (`ImprovedDescriptionField.tsx` extracted from `BasicInfoSection.tsx` — view/edit toggle, "Improve with AI" preview dialog, Clear + Done; `data-testid="input-description-improved"`).
**Context:** The vision is that users regenerate content rather than type it. Every text field with variable content should have an Analyst button that populates it from research or AI inference.
**Done when:**
- Audit of all property and scenario text fields: list which have Analyst buttons and which don't
- Each missing field has an Analyst button that calls the appropriate specialist
- Rebecca has matching tools for all fields that have Analyst buttons

**Effort:** Audit first (1 day), then implementation (1–2 weeks depending on gap count)
**Owner:** CC (Rebecca tools) + Replit-safe (UI buttons)

---

### T2-4: Vision-based export quality verification
**Status:** ✅ Complete (2026-05-16) — commit `4dcd2a9cb`
**Context:** The app currently produces PDFs and PPTX files without verifying what they look like. An output verification agent would catch invisible text, cut-off fields, palette violations, and grammar errors before delivery.
**Shipped:**
- Bianca — new cross-app Visual Quality Verification Specialist (`src/slides/bianca-verification.ts`)
- Converts PPTX slides to PNG via LibreOffice headless; submits all slides to Claude vision in one batched call
- Six-category rubric: text_cutoff, placeholder, readability, layout, consistency, data_quality; severity: ok/advisory/warning/block
- `verificationStatus` + `verificationLog` columns on `slide_factory_runs` (migration 0066/0073 + runtime guard)
- `POST /api/slide-factory-runs/:id/verify` + `GET .../verification` routes
- Rebecca `verify_factory_deck` tool for agent-native parity
- LLM slot `bianca-verification` seeded via admin-resources-014 (defaults to Claude Haiku)

**Note:** UI integration shipped by Replit — "Verify deck quality" button in DownloadTab.tsx, collapsible findings panel with severity dots, auto-expands prior results on load. `SlideFactoryTypes.ts` updated with `VerificationFinding` interface and 5 new run fields.

---

### T2-5: Reference ranges in Model Defaults — singleton storage
**Status:** ⚠️ Deferred — ownership and definition need clarification before implementation (added 2026-05-17 from user input)
**Context:** Reference ranges in Model Defaults are currently saved over time, bloating the DB and admin UI. There should be one current set per (entity, metric), not a versioned history. Separately, the user is unclear what reference ranges are exactly and which agents own them; that question needs to be revisited before any storage refactor.
**Done when:**
- Decision recorded: which agent or specialist owns reference-range generation (Maya? a new range-quality specialist? Rebecca tool?); document in `docs/solutions/architecture-patterns/`
- Storage holds exactly one current snapshot per (entity, metric); no historical versioning
- Migration: archive or delete the historical rows that exist today (keep an export in case of a need-to-restore)
- Model Defaults admin UI shows one current set with a regeneration control; no history view
**Effort:** Clarification (founder discussion, 1 day) → audit current usage (1 day) → schema migration + UI (3–5 days)
**Owner:** CC (schema, migration, ownership decision) + Replit-safe (admin UI)

---

### T2-6: Generic brand-type slugs + admin UI for brand display names
**Status:** ❌ Not started (added 2026-05-17 from user input)
**Context:** Brand types in the app should use generic slug identifiers (`Boutique-Hotel-01`, `STR-01`, `Boutique-Hotel-02`, etc.). The actual brand display name does not have an authoring surface yet — admins need a place under Model Default Management Co to define the mapping from slug → display name and any per-brand metadata.
**Done when:**
- All brand-type references in DB / engine / UI use generic slug identifiers, not display names baked into code or seed data
- New `brand_definitions` table (or equivalent) with `(slug, display_name, created_at, updated_at)` and any per-brand metadata fields needed by admin
- Admin UI under Model Default Management Co: per-slug CRUD for display name + metadata
- Every UI surface that renders a brand name resolves via slug → display name lookup
- Migration: existing properties / scenarios renamed to slug identifiers with no data loss; backfill display names from any current literal usage
**Effort:** Schema decision + migration (1 day) → admin UI (3–5 days) → call-site migration sweep (1–2 days)
**Owner:** CC (schema, migration) + Replit-safe (admin UI)

---

### T2-7: Horizontal tabs → collapsible UI on non-main pages
**Status:** ❌ Not started (added 2026-05-17 from user input)
**Context:** Pages other than the main pages currently use horizontal tab menus with cards rendered under each tab. The user wants those refactored to a collapsible UI pattern modeled on Agent Roster — each item shows a description plus a few indicators that expand into a full card on click.
**Excluded from refactor (keep horizontal tabs):**
- Dashboard
- Management Company page
- Properties list page
- Individual property pages
**Done when:**
- Audit produces a list of every page with horizontal tabs that is NOT in the excluded set
- A reusable collapsible component lands in `components/ui/` (extending or wrapping the AgentRosterAccordion pattern) with `{ summary, indicators[], expandedContent }` props
- Each non-excluded page replaces its horizontal-tab + cards layout with the collapsible component
- Excluded pages continue to use the canonical `<CurrentThemeTab>` wrapper (§13 mandates that for horizontal tabs)
- No regression in `scripts/src/check-ui-canonical.ts` (must NOT touch `CurrentThemeTab` itself; the refactor replaces tab *usage* on specific pages, not the tab component)
**Effort:** Audit (½ day) → reusable component (2 days) → per-page refactor (1–2 weeks depending on count)
**Owner:** Replit-safe (UI refactor)

---

## Track 3 — Agent autonomy vision
*Goal: Reduce founder operational burden; make agents self-improving. Months 2–4.*

Full requirements: `docs/brainstorms/agent-autonomy-managed-agents-dreaming-requirements.md`

### T3-1: Matteo — Model Router Specialist
**Note:** Named Matteo to avoid conflict with existing Fabio minion (range-quality validator at `lib/engine/src/analyst/minions/fabio.ts`).
**Priority:** Highest in Track 3 (reduces token costs, pays for the other agents)
**Done when:**
- LiteLLM or Bifrost gateway installed and routing traffic from H+ → multiple providers
- Matteo specialist resolves task type → gateway → cheapest viable model per the routing matrix
- Routing table in `admin_resources` (kind = `llm_slot`), admin-editable
- Mistral OCR 3 routing for PDF parsing tasks
- DeepSeek V4-Flash routing for bulk extraction / code generation
- Gemini 3.1 Flash already wired (confirm it's routing correctly)
- Cost per task type visible in Admin panel
- Estimated 30–50% reduction in monthly AI token spend measurable

**Effort:** 2–3 weeks
**Owner:** CC (gateway config, routing logic, admin UI)

---

### T3-2: Dreaming on research orchestrator
**Access needed:** Request Anthropic research preview access first
**Done when:**
- Gustavo writes session outcome summary to `client.beta.memory_stores` after each synthesis
- Dreaming configured: review-before-land mode (founder approves memory updates)
- Gustavo prefixes synthesis prompt with relevant playbook entries from memory
- Admin panel: shows pending dreaming memory proposals for review

**Effort:** 1–2 weeks (after access granted)
**Owner:** CC (research orchestrator changes, admin UI)

---

### T3-3: Outcomes gate on analyst research
**Done when:**
- Rubric defined: specific numbers with citations, numeric range (not point estimate), named comparable market
- Grader (separate Claude Sonnet call) evaluates each synthesis against rubric
- One self-correction cycle allowed per session
- Grader result logged to `research_sessions` table
- Quality trend visible in admin

**Effort:** 1 week
**Owner:** CC (research orchestrator)

---

### T3-4: Giorgio — Data Source Discovery Agent
**Note:** Named Giorgio to avoid conflict with existing Lorenzo swarm (Lorenzo-01..05, slide factory canonical ingestion).
**Done when:**
- Native Managed Agent defined (system prompt, tools: web search, code execution, admin_resources write)
- Weekly scheduled run + geography-triggered run
- Giorgio proposes new `admin_resources` rows (draft state, requires founder review)
- Dreaming watches Giorgio cycles; accumulates which source categories yield validated results
- Admin panel: "Giorgio proposals" queue for review

**Effort:** 2–3 weeks
**Owner:** CC (Managed Agent definition, scheduler, admin UI)

---

## Track 4 — Architecture & graduation
*Long-term. No deadline, but don't let these accumulate forever.*

### T4-1: Replit graduation (100% CC)
**Status:** Already 100% Railway-native; zero hard Replit dependencies found in audit
**Blockers:** None technical. Operational switch only.
**Done when:**
- All development done exclusively from CC sessions
- Replit workspace kept as reference/preview only, not as a coding surface
- `.agents/status/replit.md` marked idle permanently
- No more branch conflicts from Replit auto-commits

**Effort:** Zero engineering. Operational decision.
**Note:** The audit confirmed Railway deployment is complete and all 9 Replit references in the codebase are environment checks or URL whitelists — none require Replit to be the runtime.

---

### T4-2: Scenario / portfolio full separation
**Status:** Foundation exists (scenarios table mature)
**Context:** The current data model conflates scenario (a set of assumptions for a computation run) with portfolio (a collection of properties). Task-800 identified this. Full separation would enable: multi-scenario comparison per portfolio, LP vs GP perspectives, admin-curated portfolio templates.
**Effort:** 40–60 hours
**Owner:** CC (schema, routes) + Replit-safe (UI)
**Note:** This is infrastructure-level. Do not start until Track 1 and Track 2 are complete.

---

### T4-3: Rebecca on Managed Agents
**Status:** Rebecca works; Managed Agents would give her long-running execution, real file manipulation, code execution in sandboxed environments
**Effort:** 3–4 weeks
**Owner:** CC
**Note:** Parity map is nearly complete (104 tools, 2 minor gaps). This is an upgrade, not a gap-close. Do after T3-1 proves the managed infrastructure.

---

### T4-4: Design audit agent
**Status:** Not started
**Context:** A continuous agent that screenshots app pages, compares against design tokens, and files violations. Uses Claude vision + Playwright screenshot.
**Effort:** 1–2 weeks
**Owner:** CC
**Note:** Defer until Track 2 is complete. Auditing broken UX doesn't help; audit after the UX is intentional.

---

## Sequencing guide

```
NOW (days):
  T0-1  U8 IRR verification            ← unblock investor demo
  T0-2  Raw XLSX from engine           ← investor needs Excel model
  T0-3  Factory test run               ← confirm PPTX quality

WEEKS 1-2:
  T1-1  Email leak fix                 ← security before any user invites
  T1-2  Property soft-delete UI        ← quick win
  T1-4  DEFAULT_* cleanup              ← one per session, ongoing

WEEKS 2-4:
  T1-3  Admin default scenario         ← needed before investor user setup
  T1-5  CodeRabbit findings            ← quality pass
  T2-2  Portfolio grouping             ← enables investor scenario pre-load

WEEKS 4-8:
  T2-1  Investor view separation       ← needed before multi-user demo
  T2-3  Analyst content audit          ← systematic pass
  T2-4  Export verification agent      ← wrap working factory with quality gate
  T2-6  Brand-type slugs + admin UI    ← decouple display names from identifiers
  T2-7  Tabs → collapsible refactor    ← UX consistency on non-main pages
  T2-5  Reference ranges singleton     ← deferred pending ownership clarification

MONTHS 2-4:
  T3-1  Matteo model router            ← token cost reduction
  T3-2  Dreaming on research           ← research quality improvement
  T3-3  Outcomes gate                  ← research quality gate
  T3-4  Giorgio discovery agent        ← data source autonomy

LONG TERM:
  T4-1  Replit graduation              ← operational decision, no code
  T4-2  Scenario/portfolio separation  ← architecture upgrade
  T4-3  Rebecca on Managed Agents      ← upgrade, not gap
  T4-4  Design audit agent             ← polish pass
```

---

## CC-only vs Replit-safe designation

**CC only (CLAUDE.md §9 — engine authoring authority):**
- Any file in: `lib/engine/src/`, `lib/calc/src/`, `lib/shared/src/constants*.ts`, `lib/db/src/constants*.ts`
- `artifacts/api-server/src/finance/`, `artifacts/api-server/src/report/`
- `artifacts/api-server/src/tests/proof/`, `artifacts/api-server/src/tests/engine/`
- All DB schema migrations
- Any new agent definition (Matteo, Giorgio, etc.)
- LLM routing logic

**Replit-safe (UI, non-engine routes, non-schema features):**
- Frontend components (`.tsx` files in `artifacts/hospitality-business-portal/src/`)
- Non-engine API routes (scenarios, photos, admin UI, user management)
- Styling, design, copy
- No schema migrations (must go to CC)

---

## Open questions for next session

1. **Renato role clarification**: The user mentioned "Renato's part is not being built." The codebase has Renato as a minion for mgmt co markup factor fetching (`minions/mgmt-co-markup-factors.ts`). If there is a different Renato role envisioned for the slide factory or elsewhere, it needs to be defined.

2. **Clerk vs Firebase vs current auth**: Current auth (Google OAuth + invitation) works. Evaluate whether migrating to Clerk or Firebase Auth would reduce admin burden and add features (magic links, better user management UI) before recommending a migration.

3. **Photo storage migration**: Photos are currently in a hybrid state (some in Neon bytea, some in Replit Object Storage, some as base64). As part of Replit graduation, these should move fully to Cloudflare R2. Timeline: whenever Replit Object Storage is deprecated or Replit graduation happens.

4. **"Scenario bank per user" intent**: The current scenario system supports saving/listing/sharing scenarios. Is the "scenario bank" a different concept (e.g., a curated library of template scenarios that any user can clone), or is it the current save/share feature?

5. **2026-05-17 tooling detour (acknowledged off-plan):** A CC session today shipped cross-platform Claude Code permission-bypass installers (PR #161, squash `4f29261c4`), a compound learning doc (`27463422a`), and a memory-file harmonization trim (`483dbe48d`). None of these are tracked masterplan tasks. The detour is dev-environment tooling driven by per-tool permission prompts that were blocking unattended Claude Code workflows; rationale and gotchas captured in `docs/solutions/tooling-decisions/claude-code-permission-bypass-path-shim-2026-05-17.md`. Treating as a one-off — no plan-level action needed beyond this acknowledgment.

6. **2026-05-17 orchestrator rename shipped:** Plan `docs/plans/2026-05-17-005-agent-taxonomy-registry.md` Phase 3 renamed `ORCHESTRATOR_SPECIALIST_ID` from `gaspar` → `gustavo` in `lib/engine/src/analyst/identity.ts` (CC session 11, individual commit `f93cd76e8`; landed on main via PR #160 squash `db246c075`). Legacy `gaspar` string aliased for one release cycle (Phase 4 removes it). Affects T2-3 wiring at the agent-roster probe layer only; no impact on engine math.

---

## Appendix: Audit sources

All findings from parallel CC audit agents run 2026-05-16:
- Financial engine: `a470e9eaf296c2810` (IRR, NOI, refi, exports)
- Slide factory: `aad792aba199183d0` (pipeline, builders, exports)
- Auth + scenarios: `a4fd343c264af01db` (CRUD, sharing, roles)
- Property + photos: `a207405cde5a69c65` (soft-delete, albums, admin)
- Rebecca + agents: `a72b35e97ec4201b3` (parity, infrastructure, Railway)
- Agent autonomy requirements: `docs/brainstorms/agent-autonomy-managed-agents-dreaming-requirements.md`
