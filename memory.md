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
- **Rebecca** is the only AI assistant — copilot-style chat, no voice agents.
- drizzle-zod: NEVER use `.omit()` — only `.pick()`
- Domain boundary: Route files must NEVER import `db` or `drizzle-orm` directly
- Always update replit.md AND CLAUDE.md AND memory.md after changes (Doc Harmony Rule)
- useResearchQueue.getState() pattern for fresh Zustand reads

## Forward-Discipline Playbook
See `best-practices.md` (project root) — 22-rule playbook from `rewritetax.md`'s 7 cost vectors. Categories: (A) multi-agent hygiene, (B) avoiding architectural redirection, (C) vendor & library decisions, (D) AI/prompt-tuning, (E) DB & migration hygiene, (F) cosmetic churn, (G) platform tax.

## Replit Billing Telemetry DB (April 20, 2026)
Live Postgres tables (additive only, no app code touches them):
- `replit_invoices` — 75 rows. H+ workspace UUID: `e53ea481-4c36-4e2a-8bfc-80697f311b65`.
- `replit_invoice_line_items` — 139 rows.
- H+ attributed cash $4,378.41 = 92.2% of total $4,747.69.
- Refresh: `npx tsx script/seed-replit-billing.ts && npx tsx script/billing-report.ts`
- CSV upgrade path (B): drop Orb CSV at `./.local/orb-invoice-export.csv`

## Feature Flags
- RI_V2_WRITE: ON | RI_V2_READ: ON | REBECCA_V2: ON | ADMIN_INTEL_V2: ON

## Current Test Count
- **4,520 tests across 186 files** (as of April 11, 2026)

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

## External Data Sources (Active)
- **APIs**: FRED (env var `FRED_API_KEY`; series: SOFR, DGS2, DGS5, DGS10, DPRIME, CPIAUCSL), Xotelo, RapidAPI Hospitality, CoStar/STR, Moody's, S&P Global, Alpha Vantage, Open Exchange Rates, Weather API, World Bank
- **Scrapers (Apify)**: airbnb-scraper, vrbo-scraper, booking-scraper, tripadvisor-scraper
- **LLMs**: OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet, Opus), Google Gemini Flash, Perplexity
- **Vector DB**: pgvector (index: lb-hospitality, namespaces: knowledge-base, research-history, comparables, assumption-guidance, documents, scenarios, properties)
- **Health monitoring**: Circuit breaker (5 failures in 60s → open), BaseIntegrationService pattern, staleWhileRevalidate caching

## Help System
- InfoTooltip: primary contextual help pattern (i icon → hover → explanation + formula + manual link)
- GuidanceSideSheet: deep dive panel (P25/P50/P75, peer comps, relaxation trail, impact analysis)
- RebeccaPanel: AI assistant with contextual field awareness
- GuidedWalkthrough: 9-step spotlight tour (auto-prompts new users)
- Map Tour: cinematic fly-through of properties
- Help page: User Manual, Checker Manual, Architecture, Guided Tour tabs
- Glossary: shared data structure in `client/src/lib/glossary.ts`

## LB Slide Studio — Renderer Rewrite + Authoring Environment (May 4, 2026)
- **helpers.tsx rewritten**: removed all theme.ts imports; now uses PALETTE/FONTS/FW from contract.ts exclusively. All primitives coordinate-scaled to 960×540.
- **slides.tsx fully rewritten at 960×540**: all 6 slides use PALETTE, FONTS, FW, SLIDE_BG, bb(), CANVAS from contract.ts — zero theme.ts imports.
- **LbInternalDeck.tsx**: now imports SLIDE_HEIGHT_PX/SLIDE_WIDTH_PX from contract.ts — theme.ts no longer referenced by any slide component.
- **LbSlides.tsx rewritten as full Slide Studio**: 7 tabs (Config & Render + Slide 1–6). Config tab has property assignment + readiness summary cards + PDF render/download.
- **Magic-numbers fix**: promoted `255` VARCHAR literal to `VARCHAR_SHORT_MAX` in constants.ts; updated all 3 usages.
- All 9 CI checks PASS: typecheck, lint, production-image, magic-numbers, migration-guards, replit-independence, spinner-contrast, types-mirror, test:calc.

Archived session notes: docs/memory-archive/2026-04-archive.md
