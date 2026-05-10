# H+ Analytics — Memory & Session State

## Project Identity
- **App Name**: H+ Analytics App
- **Brand**: H+ Analytics by Norfolk AI
- **AI Assistant**: Rebecca (text chat analytics AI)
- **Admin**: ricardo.cidale@norfolkgroup.io (password stored in environment secrets only)

## Critical Rules
- **E2E Testing Auth**: NEVER navigate to `/login` or click any login button/logo. The Google OAuth button poisons the test session permanently. Always use `[API] POST /api/auth/dev-login` with body `{}` as the first step, then navigate directly to the target page.
- **DEV_SKIP_AUTH flag**: `server/dev-flags.ts` exports `DEV_SKIP_AUTH`. When `true` (and not production), `authMiddleware` auto-injects the admin user on every request — no login needed. Set to `false` before shipping. The flag has zero effect in production (double-guarded).
- **drizzle-zod `.omit()` is broken in this project** (numeric/identity columns infer as `never`). Use `typeof table.$inferInsert / $inferSelect` instead, or hand-roll `z.object({...})`. Confirmed again on `shared/schema/replit-billing.ts` (Apr 20).

## Forward-Discipline Playbook (April 20, 2026)
- **`best-practices.md`** (project root) — 22-rule forward-looking playbook distilled from `rewritetax.md`'s 7 cost vectors.
- **Categories**: (A) multi-agent hygiene, (B) avoiding architectural redirection, (C) vendor & library decisions, (D) AI/prompt-tuning workstreams, (E) database & migration hygiene, (F) cosmetic & inbox-driven churn, (G) platform-specific tax.
- **Meta-lesson**: almost every fix in the audit was codified retroactively, after the cost had been paid. Install rules first, ship code second.
- **Cross-references**: `rewritetax.md` bottom addendum points to this file; this file footer points back to `rewritetax.md` as source.

## Replit Billing Telemetry DB (April 20, 2026)
- **Why**: Promoted the 75-invoice forensic ledger from `rewritetax.md` (static markdown) to live, queryable Postgres tables in the existing project DB. Path "C-then-B" — ratio attribution now, CSV upgrade later.
- **Tables** (additive only, no app code touches them, no workflow restart):
  - `replit_invoices` — 75 rows. Columns: `invoice_number`, `issued_date`, `cycle_start/end`, `status`, `net_amount`, `gross_subtotal`, `pre_purchase_applied`, `prior_invoice_credit`, `is_cap_hit`, `is_spike_day`, `ship_day_context`, `hplus_attributed_net/gross`, `hplus_attribution_ratio`, `attribution_method`, `notes`, `raw_json`.
  - `replit_invoice_line_items` — 139 rows (3 portal-exact gross + 136 ratio-estimated net). Columns: `invoice_id` FK, `workspace_uuid`, `workspace_label`, `units_billed`, `unit_price`, `amount`, `amount_basis` (`'net'|'gross'`), `is_hplus_workspace`, `source`.
- **H+ workspace UUID**: `e53ea481-4c36-4e2a-8bfc-80697f311b65`. Other workspaces: `ff0487fd-…` (8.5%), `9fae4009-…` (0.5%).
- **Attribution model**: 91% routine, 95% spike days (Feb 10, Mar 8, Apr 19), portal-line-item-exact for `XFPSSE-DRAFT` (H+ gross $2,558.98).
- **Headline numbers**: H+ attributed cash $4,378.41 = 92.2% of total cash $4,747.69. Daily avg $128.78. 34 active billing days. 2 cap-hits ($511.68), 6 spike-day rows, 6 zero invoices.
- **Files**: `shared/schema/replit-billing.ts` (Zod-free; tables exported via `shared/schema/index.ts`), `script/seed-replit-billing.ts` (re-runnable, wrapped in `db.transaction`), `script/billing-report.ts` → `docs/billing/hplus-cost-report.md`, `script/_create-billing-tables.ts` (one-shot SQL bootstrap because drizzle-kit push needs a TTY).
- **Refresh**: `npx tsx script/seed-replit-billing.ts && npx tsx script/billing-report.ts`.
- **CSV upgrade path (B)**: drop Orb invoice CSV at `./.local/orb-invoice-export.csv`; a follow-up loader replaces ratio-estimated line items with workspace-exact figures (header table untouched).
- **Code review fixes baked in**: top-cost-day query renamed; explicit `amount_basis` column to prevent net/gross drift; transaction wraps the delete+reinsert.

## Architecture Decisions Log

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

### pgvector Skills & Knowledge Installed (April 2026)
- **7 pgvector skills installed** from `pgvector-io/skills` repo into `.agents/skills/`:
  - `pgvector-help`, `pgvector-quickstart`, `pgvector-query`, `pgvector-cli`, `pgvector-assistant`, `pgvector-mcp`, `pgvector-docs`
- **MCP**: pgvector MCP not available as a Replit integration. Project uses pgvector TS SDK directly in `server/ai/pgvector-service.ts`
- **Current HBG pgvector usage**: Index `lb-hospitality`, 7 namespaces (knowledge-base, research-history, comparables, assumption-guidance, documents, scenarios, properties), OpenAI text-embedding-3-small (1536d), cosine metric, batches of 100

### Context7 Best Practices Applied (April 2026)
- **Express**: Added `app.disable("x-powered-by")` to `server/index.ts`
- **Drizzle indexes**: Added missing FK indexes for `companies.logoId`, `companies.themeId`, `property_photos.beforePhotoId`
- **Skill created**: `.agents/skills/context7-best-practices/SKILL.md` — comprehensive reference covering Drizzle ORM, React, Express, and TanStack Query patterns with 11-item feature checklist

### Research Intelligence System (April 2026)
- **Research methodology skill created**: `.agents/skills/research-methodology/SKILL.md` — 500+ line document covering STR chain scales, star ratings, revenue mix benchmarks, USALI expense ratios, management fee structures, VRBO/STR business model, comp set selection, and the full N+1 AI research pipeline
- **Key architectural decision**: Properties auto-derive their research profile from existing assumptions — NO separate ICP definition needed. The property's own starRating + ADR + hospitalityType + location + revenue shares IS its research profile.
- **Post-improvement principle**: Research must target the property's OPERATING state after improvements, not its acquisition state.
- **Equivalent STR tier derivation**: starRating + startAdr + hospitalityType → maps to Luxury/Upper Upscale/Upscale/Upper Midscale/Midscale

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
- **APIs**: FRED (env var `FRED_API_KEY`; series: SOFR, DGS2, DGS5, DGS10, DPRIME, CPIAUCSL), Xotelo, RapidAPI Hospitality, CoStar/STR, Moody's, S&P Global, Alpha Vantage, Open Exchange Rates, Weather API, World Bank
- **Scrapers (Apify)**: airbnb-scraper, vrbo-scraper, booking-scraper, tripadvisor-scraper
- **LLMs**: OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet, Opus), Google Gemini Flash, Perplexity
- **Vector DB**: pgvector (index: lb-hospitality, namespaces: knowledge-base, research-history, comparables, assumption-guidance, documents, scenarios, properties)
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
- Luxury: $313+ | Upper Upscale: $173–$312 | Upscale: $131–$172
- Upper Midscale: $107–$130 | Midscale: $82–$106 | Economy: $55–$81

### Management Fee Benchmarks
- Non-branded 3rd party: 1.5–3.0% base (2.0–2.5% most common)
- Branded (Marriott/Hilton): 2.5–4.0% base (3.0% most common)
- Luxury/specialty: 3.0–5.0% base | VRBO/STR manager: 20–35% all-in
- Incentive: 8–15% of GOP standard, 10–20% luxury

### Revenue Mix by Segment
- Select-service: 85–95% rooms, 2–5% F&B | Boutique: 70–80% rooms, 12–18% F&B
- Full-service resort: 55–65% rooms, 20–28% F&B | VRBO: 85–95% rental, 5–12% cleaning fees

## Test State
- 4,047 tests across 173 files — ALL PASSING (stale; see Current Test Count below)
- TypeScript: 0 errors | Lint: 0 errors | Financial verification: UNQUALIFIED

## Feature Flags
- RI_V2_WRITE: ON | RI_V2_READ: ON | REBECCA_V2: ON | ADMIN_INTEL_V2: ON

## Toggle Compliance Audit (April 11, 2026)
- **PropertyFeeSummaryTable fix**: Inactive fee category cells now filter by `c.isActive` — headers AND cells consistently show active-only categories. Inactive cats show "—" dash.
- **costSegEnabled UI toggle**: Added Switch toggle + 3 percentage sliders (5yr/7yr/15yr) in CapitalStructureSection.tsx after depreciation override. Only visible when toggle is ON.
- **Service templates in scenarios**: Design decision PENDING — not captured in snapshots, may be by-design (company infrastructure).
- **Doc Harmony**: Updated CLAUDE.md test counts from 4,478/184 → 4,495/185

## Current Test Count
- **4,520 tests across 186 files** (as of April 11, 2026)

## Critical Rules
- **Rebecca** is the only AI assistant — copilot-style chat, no voice agents
- drizzle-zod: NEVER use `.omit()` — only `.pick()`
- Domain boundary: Route files must NEVER import `db` or `drizzle-orm` directly
- Always update replit.md AND CLAUDE.md AND memory.md after changes (Doc Harmony Rule)
- useResearchQueue.getState() pattern for fresh Zustand reads
- **E2E Test Login**: Click the spinning logo on `/login` page to trigger `POST /api/auth/dev-login`. Do NOT pass `authConfig` credentials (triggers blocked OAuth). Do NOT use Google sign-in button.

## Phase 2.1: Admin Sidebar Restructure (April 12, 2026)
- **AdminSidebar.tsx** rewritten from 5-group to 10-block structure per MASTER-PLAN.md Phase 2.1
- **10 blocks**: Management Company, Properties, AI Research Engines, Users, Scenarios, Rebecca AI Assistant, Themes & Appearance, App Settings, Testing & Verification, Reports & Exports
- **New AdminSection values**: 16 new alias section IDs added (financial-defaults, services-fees, company-profile, hotel-defaults, rental-defaults, required-fields, sources-apis, llm-config, engine-health, user-management, default-assignments, rebecca-config, themes-appearance, app-settings, testing-verification, reports-exports)
- **All redirect via SECTION_REDIRECTS** to existing canonical sections — no backend changes, no component deletions
- **Admin.tsx sectionMeta** extended with all 16 new aliases. **admin-configurator skill** updated.
- **Lint**: 0 errors. Tests: 4,520/4,520 PASS. Doc count: 4,495 → 4,493.

## Phase 2.2: Delete Orphaned Admin Components (April 12, 2026)
- Full admin orphan audit found 7 files with 0 imports anywhere in the codebase
- Deleted: DesignTab.tsx, ServicesTab.tsx, IntegrationHealthTab.tsx, IntegrationsTab.tsx, LLMsTab.tsx, RebeccaTab.tsx, ResearchCenterTab.tsx (-2,342 lines)
- Cleaned barrel (admin/index.ts): removed DesignTab + ResearchCenterTab exports
- Files used outside admin/: AssetDefinitionTab (Icp.tsx), IcpLocationTab (Icp.tsx), MarketRatesTab (ResearchHub.tsx), DiagramsTab (Help.tsx) — all kept
- Health Check: ALL CLEAR | Exports: 564 used, 0 unused

## LB Slide Studio — Renderer Rewrite + Authoring Environment (May 4, 2026)
- **helpers.tsx rewritten**: removed all theme.ts imports; now uses PALETTE/FONTS/FW from contract.ts exclusively. All primitives coordinate-scaled to 960×540.
- **slides.tsx fully rewritten at 960×540**: all 6 slides use PALETTE, FONTS, FW, SLIDE_BG, bb(), CANVAS from contract.ts — zero theme.ts imports.
- **LbInternalDeck.tsx**: now imports SLIDE_HEIGHT_PX/SLIDE_WIDTH_PX from contract.ts — theme.ts no longer referenced by any slide component.
- **LbSlides.tsx rewritten as full Slide Studio**: 7 tabs (Config & Render + Slide 1–6). Config tab has property assignment + readiness summary cards + PDF render/download.
- **Magic-numbers fix**: promoted `255` VARCHAR literal to `VARCHAR_SHORT_MAX` in constants.ts; updated all 3 usages.
- All 9 CI checks PASS: typecheck, lint, production-image, magic-numbers, migration-guards, replit-independence, spinner-contrast, types-mirror, test:calc.

Archived session notes: docs/memory-archive/2026-04-archive.md
