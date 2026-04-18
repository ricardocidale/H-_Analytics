# H+ Analytics by Norfolk AI — Project Instructions

## Overview

H+ Analytics is a GAAP/USALI-compliant financial analytics portal for boutique hotel portfolio management, created and powered by Norfolk AI. It models a hospitality management company (default seed name: "Hospitality Management Co") and its individual property SPVs with monthly and yearly financial projections, adhering to GAAP (ASC 230, ASC 360, ASC 470) and USALI 12th Edition standards. 1,113 source files, ~190K lines. The platform delivers a premium, bespoke financial experience enabling precise financial modeling and reporting for the hospitality industry with an emphasis on financial accuracy and robust data governance.

**Two AI Agents:**
- **The Analyst** — the singular intelligence agent. Conducts research, provides ranges, conviction levels, and risk flags next to every assumption field. Always "The Analyst" (capitalized, singular). Powered by Norfolk AI Engine.
- **Rebecca** — the expert companion agent. Answers questions, explains what The Analyst found, guides tours, offers help. Always available in the chat panel.

## Business Model (CRITICAL — read before any work)

- **Norfolk AI** builds the app. The HMC is what's modeled. They are separate entities.
- **The HMC does NOT buy properties.** Property owners hire the HMC for management and branding.
- **Constants vs Defaults vs Assumptions — three distinct tiers, never collapse.** **(1) Constants** are model values nobody edits at runtime (tax-code depreciation lives, GAAP/USALI line definitions, FX rates ingested by the engine). They live behind the factory + overlay pattern in `shared/constants.ts` / `shared/countryDefaults.ts` and are read via `getEffectiveConstant` (resolution order: `manual > analyst > factory`). **(2) Default values** are admin-editable seed values that The Analyst suggests with citations and an admin approves in the Admin section; they live in `model_constant_overrides` and the seed tables, and the word *"default"* must not appear in user-facing copy outside Admin. **(3) Assumptions** are the working variables a user types and saves on user-facing pages (Company Assumptions, Property Edit, etc.). The instant a user clicks Save, every field on that page becomes an assumption — even fields they never touched. Cascade direction is always **constant → default → assumption**; never the reverse, never collapsed into two tiers. The full Defaults-vs-Assumptions rule below remains authoritative for the user-facing half of this distinction.
- **Defaults ≠ Assumptions — DO NOT CONFUSE. MASTER RULE.** **Assumptions = user-facing working variables** (the numbers a user types, saves, and runs scenarios on, on the front of the app). **Defaults = admin-only seed values** loaded into the DB to initialize a fresh tenant. **Seed-to-assumption transition:** a default is only a *seed*. The moment the user clicks **Save** on any page, every field on that page — whether the user edited it or left the seed untouched — becomes a **working variable, i.e. an assumption**. After Save, there are no defaults on that page anymore, only assumptions. The word *"assumption"* in any UI label, button, tooltip, error message, AI agent text, or doc **always means the user's working variable** — never a default. The word *"default"* must not appear in user-facing copy outside the Admin section. **When the user asks "where is X stored / set / configured?" you must answer in terms of the assumption (the user-facing page where the working variable lives) first, and only mention the Admin seed location as a secondary note** — never lead with the seed and never imply the seed is where the user "works with" the value. Conflating these has caused real production losses (admin-only routing on user pages, reset buttons wiping user work, seed values treated as authoritative). Full rule in `.claude/skills/vocabulary/SKILL.md` §0.
- **Company Assumptions page is user-facing** (ManagementRoute), not admin-only.
- **Save is per tab.** Each tab save commits that tab's fields and triggers The Analyst.
- **The Analyst runs after every save** (Tier-0 instant) and on button press (Tier-1 deep research).
- **Full product architecture:** `docs/architecture/ARCHITECTURE.md`
- **Business model details:** `.claude/memory/project_business_model_correction.md`
- **Active Replit tasks:** `.claude/replit-instructions/2026-04-16-master-fixes.md`

## User Workflow Direction (in-progress design — Apr 16, 2026)

- **Property-first is the default user journey** for the dominant persona (investor).
  Properties feed The Analyst's HMC dimensioning: portfolio size drives staffing
  tiers (`staffTier{1,2}MaxProperties`); property revenue drives HMC fee revenue;
  The Analyst literally uses all research-ready properties as HMC research context
  (excluded_data properties drop out — that's the `PROPERTIES_EXCLUDED` error).
- **Founder persona may invert** the order (model the HMC first, ask The Analyst
  what portfolio would make the math work). Open question whether to branch on
  persona at first login or treat property-first as universal default with manual
  skip-ahead.
- **Preferred shell**: adaptive dashboard with a "what to do next" card that reads
  data-quality state and steers the user — not a strict locked wizard.
- **Open forks** (still being decided with the user):
  1. Adaptive dashboard vs strict wizard
  2. Persona branch at first login vs single universal flow

## Operating Model — In-Session vs External Shell

Two execution surfaces are in play. The agent must flag which one a task belongs to:

- **In-session (this Replit Agent)** — UI / components / pages, workflow + routing,
  DB schema and migrations, API routes, server plumbing, anything iterative the user
  wants to see in the preview pane immediately.
- **External shell (user's Claude Code 4.7 1M session)** — multi-file refactors across
  `calc/`, anything requiring the full test tree in one window, cross-cutting numerical
  /financial logic where one bad assumption ripples into many places, long-running
  deep-research synthesis (read 30 docs → produce one cohesive design).
- **Handoff shape**: when escalating, the agent says *"This one's better in your shell —
  here's the prompt"* and hands a self-contained brief with file paths, constraints,
  and acceptance criteria. User runs it, pastes back the result, work continues.

## User Preferences

- Simple, everyday language. Ask clarifying questions before implementing — do not assume.
- **TOP PRIORITY: Financial accuracy always beats UI enhancements.** The proof system must always pass.
- Always format money as currency (commas, appropriate precision).
- Skills live in `.claude/skills/` (19 domains, 178 files). See `.claude/skills/_index.md` for the master catalog.
- **App name** is "H+ Analytics" (seed/default). Editable by super admin in Admin > App Identity. Powered by Norfolk AI.
- **Company name** refers to the hospitality management company (seed/default: "Hospitality Management Co"). Editable by any user on the Management Company page. NOT the app name.
- **Norfolk AI** is the technology company that created and powers H+ Analytics.
- Update skills and manuals after every feature change.
- **Documentation:** `.claude/claude.md` is the primary AI context file. `replit.md` is kept for Replit Agent compatibility. When in doubt, `claude.md` is authoritative.
- All UI components must reference a theme via the theme engine.
- New UI features get their own skill file in `.claude/skills/ui/`.
- **Button Label Consistency:** Always "Save" — never "Update". See `rules/ui-patterns.md`.
- **Brand Voice is LAW:** Before writing ANY user-facing text, read `.claude/brand-voice-guidelines.md` — the SINGLE SOURCE OF TRUTH. It covers everything: identity (We Are / We Are Not), voice principles, The Analyst + Rebecca personas, tone-by-context matrix (10 contexts), conversation principles, vocabulary, visual identity, 10 before/after examples, and a 5-question quality checklist. Non-negotiable.
- **Quick reference from the guidelines:**
  - **The Analyst** (singular, capitalized): Intelligence agent. "Ask the Analyst" button. "The Analyst is studying..." status.
  - **Rebecca**: Expert companion. Outgoing, intellectual, geeky, dry wit.
  - NEVER: "the system", "the AI", "the chatbot", "your analysts" (plural), "Regenerate Intelligence", "Stale", "Fresh"
  - App = "H+ Analytics". Company = "Hospitality Management Co". Technology = "Norfolk AI Engine".
- **Enforcement:** `rules/branding-vocabulary-enforcement.md`, `rules/the-analyst-persona.md`, `rules/rebecca-persona.md`. Audit test blocks 8 forbidden terms on every commit.
- **CI Hygiene:** After pulling external code (Claude Code, other agents), run `npx tsx script/ci-hygiene.ts` to auto-fix ESLint unused vars/imports, secret scanner false positives, and TypeScript errors. See `.agents/skills/ci-hygiene/SKILL.md`.
- **Communication skills** (reusable): `skills/communication/conversation-principles.md`, `skills/communication/ai-agent-voice.md`, `skills/communication/norfolk-brand-voice.md`.
- **Intelligence-First Pages:** Every page with inputs must: (1) nudge user to Ask the Analyst on first visit (glowing button), (2) require Save before leaving, (3) auto-save if user doesn't press Save, (4) block downstream fields until compulsory fields are completed, (5) compel regeneration if intelligence is old. Track first-visit per-user per-page in DB.
- **100% Session Memory:** Save decisions to `.claude/session-memory.md` at session end.
- **Every financial line item** should have a ? tooltip (HelpTooltip or InfoTooltip).
- **Every page must be graphics-rich** — charts, animations, visual elements required.
- **Context reduction is mandatory.** Every refactor must produce skills, helpers, scripts. See `skills/coding-conventions/context-reduction.md`.
- **Premium design, always.** $50K+ bespoke financial platform feel. See `rules/design-standards.md`.
- **Always update claude.md after every task.** Mandatory — no exceptions.
- **Always update session-memory.md after every task.** Track decisions, architecture changes, industry knowledge, test counts, and session state.

## System Architecture

The application features a React 18 frontend with TypeScript, Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts, D3.js, and framer-motion. The backend is an Express 5 application utilizing Drizzle ORM and PostgreSQL.

**Core Design Principles & Features:**
- **Financial Accuracy & Compliance:** Highest priority, enforced by a comprehensive proof system (~4,191 tests across 204 files, 15-phase verification pipeline with 498 checks), GAAP verification, and USALI 12th Edition compliance. Precision is hardened using `decimal.js`-backed arithmetic.
- **Modular Skill-Based Architecture:** Domain knowledge and context are managed through a skill-based system in `.claude/skills/`.
- **Theming & UI/UX:** A robust theme engine provides consistent UI with 5 presets. All UI components are theme-compliant, and specific UI patterns are enforced.
- **Shared Financial Calculation Layer (`calc/`):** Pure financial calculation logic in standalone modules. Both client and server import from `calc/`.
- **Server-Authoritative Finance:** `server/finance/service.ts` orchestrates the full portfolio computation pipeline server-side. A feature flag `USE_SERVER_COMPUTE` switches UI components to fetch pre-computed results.
- **Deterministic Hashing & Tenant Isolation:** Scenarios use deterministic JSON serialization and hashing. All database writes are scoped to the caller's userId.
- **Financial Field Registry:** `shared/field-registry.ts` is the single source of truth for all financial fields.
- **Data Governance & Configuration:** Model constants follow a TS-factory + DB-overlay pattern (Option B). The factory baseline lives in `shared/constants.ts` (universal) and `shared/countryDefaults.ts` (country-keyed across 19 countries with authority citations). The `model_constant_overrides` table records ONLY genuine departures, written either by the Analyst (research-engine source, with citation) or by an admin (manual override, with note). The shared `getEffectiveConstant` helper resolves `manual > analyst > factory` at the most specific locality (subdivision → country → universal). The registry of governed keys lives in `shared/model-constants-registry.ts`.
- **Unified Export System:** A `server/report/compiler.ts` generates `ReportDefinition` IR for PDF, PPTX, XLSX, and DOCX formats, with premium PDF exports using `@react-pdf/renderer`. Exports are reproducible server-side using a `computeRef` field. WeasyPrint (Python) available for HTML→PDF rendering.
- **Scenario Computed Snapshot Persistence:** The `scenario_results` table stores immutable computed artifacts per scenario.
- **Multi-Tenancy:** Supports users, groups, logos, themes, and branding for multiple entities.
- **Role Hierarchy:** `super_admin` > `admin` > `checker` / `user` > `investor`. The `isAdminRole()` helper in `shared/constants-enums.ts` checks for both `admin` and `super_admin`. Super admins are protected: regular admins cannot edit, delete, change role, or reset password of a super admin. Only super admins can assign the `super_admin` role.
- **LLM Integration:** Features a dual-model configuration (primary + fallback) for AI-powered functionalities across 7 domains.
- **Pre-Collected Market Data:** 7 database tables (market ADR index, seasonal calendars, event calendars, labor rates, F&B benchmarks, airport distances, hospitality benchmarks) serve as Priority 0 in the smart data router before external APIs are called. Managed via `server/ai/benchmark-lookups.ts`.
- **Input Validation & Rate Limiting:** All mutation endpoints use Zod schema validation. Rate limiting is applied to compute-heavy endpoints.
- **Automated Validation Gates:** 5 registered CI-style gates (typecheck, lint, test, verify, parity) run automatically on task completion. All must pass before changes are delivered.
- **Code Quality & Audit:** ESLint, Husky pre-commit hooks, GitHub CI workflows. Quick Audit runs 13 guardrail checks. Deep audit covers data-flow integrity and system security.
- **Observability:** Structured logging, client-side error boundaries (Sentry.ErrorBoundary, ErrorBoundary, FinancialErrorBoundary), activity logging, Sentry for error tracking, PostHog for analytics, Upstash Redis for caching, and circuit breakers.
- **Image Processing:** Server-side Sharp pipeline for responsive WebP/AVIF image variants. Admin-configurable render settings.

## External Dependencies

- **Database:** PostgreSQL (managed by Drizzle ORM)
- **Frontend Libraries:** React 18, Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts, D3.js, framer-motion
- **PDF Generation:** jsPDF, @react-pdf/renderer, WeasyPrint (Python)
- **Document Processing:** Google Document AI (OCR)
- **Image Processing:** Sharp
- **Mapping:** MapLibre GL
- **Monitoring & Analytics:** Sentry, PostHog
- **Caching:** Upstash Redis
- **AI/LLM Providers:** `@anthropic-ai/sdk`, Gemini
- **Vector store:** Neon pgvector (`vector_chunks` table, 1536-dim cosine, HNSW index) — 7 namespaces: knowledge-base, research-history, comparables, assumption-guidance, documents, scenarios, properties. Embeddings via OpenAI `text-embedding-3-small`.
- **Icons:** Lucide (hardcoded — Phosphor/Material removed)
- **Email:** Resend

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts, D3.js, framer-motion |
| Backend | Express 5, TypeScript, Drizzle ORM |
| Database | PostgreSQL |
| Icons | Lucide (hardcoded, single icon set) |
| AI/LLM | Anthropic SDK, Gemini |
| PDF | jsPDF, @react-pdf/renderer, WeasyPrint |
| Exports | xlsx, pptxgenjs |
| Monitoring | Sentry, PostHog |
| Caching | Upstash Redis |
| Email | Resend |

## Skill Router

| Domain | Skill Path |
|--------|-----------|
| Context Loading | `.claude/skills/context-loading/SKILL.md` |
| Architecture | `.claude/skills/architecture/SKILL.md` |
| Design System | `.claude/skills/design-system/SKILL.md` |
| Theme Engine | `.claude/skills/ui/theme-engine.md` |
| Component Library | `.claude/skills/component-library/SKILL.md` |
| Proof System | `.claude/skills/proof-system/SKILL.md` |
| Database | `.claude/skills/database/SKILL.md` |
| Exports | `.claude/skills/exports/SKILL.md` |
| Admin (19 sections) | `.claude/skills/admin/SKILL.md` |
| Rebecca Chatbot | `.claude/skills/rebecca-chatbot/SKILL.md` |
| **Vocabulary** | **`.claude/skills/vocabulary/SKILL.md`** — **Read before writing any UI text** |
| Communication (3 skills) | `.claude/skills/communication/` |
| Finance (25 skills) | `.claude/skills/finance/` |
| Research (29 skills) | `.claude/skills/research/` |
| UI (55 skills) | `.claude/skills/ui/` |

## Key Rules

- **Calculations always highest priority** — never compromise financial accuracy for visuals
- **No raw hex in components** — use CSS variable tokens
- **All buttons GlassButton**, all pages PageHeader, all exports ExportMenu
- **No mock data** in production paths
- **Finance changes must state Active Skill** and pass verification (UNQUALIFIED)
- **Rebecca must NEVER compute financial values** — all data from the calculation pipeline
- **Rebecca Proactive Insights:** Two-tier insight system after portfolio compute. Tier 1: instant deterministic analysis. Tier 2: RAG-powered LLM insight via `POST /api/rebecca/insight`.
- **Balance Sheet Identity**: A = L + E must hold within $1
- **Management Company has NO exit cap rate.** It is an operating service business, not real estate. Never apply NOI ÷ cap rate to the HMC. Terminal value (if ever needed) = DCF on FCF discounted at `costOfEquity`, or EBITDA multiple. Fields `exitCapRate`, `salesCommissionRate`, `dispositionCommission` are PROPERTY DEFAULTS (cascade through `global` bag), not company exit fields. See `.claude/skills/finance/management-company-statements.md`.
- **Resend replaces SendGrid** for all transactional email
- **Domain boundary**: Route files must NEVER import `db` or `drizzle-orm` directly — use `IStorage` facade.
- **drizzle-zod**: NEVER `.omit()` — only `.pick()`.

## User Roles

| Role | Access |
|------|--------|
| `super_admin` | Full — all pages + Admin + protected from other admins |
| `admin` | Full — all pages + Admin Settings |
| `user` | Management-level — no Admin panel |
| `checker` | User + verification tools |
| `investor` | Limited — Dashboard, Properties, Profile, Help |

## Design System

- **Navy:** #112548 | **Teal:** #0091AE | **Gold:** #FDB817
- Premium, bespoke financial platform aesthetic
- "Powered by Norfolk AI" badges on research panels, PDF footers, About page

## E2E Testing Authentication

**CRITICAL RULE — NEVER navigate to /login or click any login button.** The login page has a Google OAuth button; if the testing agent clicks it, the entire session is permanently blocked by an external OAuth redirect.

Instead, authenticate via a direct API call BEFORE any browser navigation:

```
1. [New Context] Create a fresh browser context
2. [API] POST /api/auth/dev-login with body {} and Content-Type: application/json
3. [Browser] Navigate directly to the target page (e.g., /dashboard, /admin?tab=brand)
```

## Validation Gates (Automated)

5 CI-style gates run automatically on every task completion:

| Gate | Command | What it catches |
|------|---------|----------------|
| typecheck | `npx tsc --noEmit --skipLibCheck` | Type errors |
| lint | `npm run lint:summary` | ESLint violations (max-warnings 10) |
| test | `npm run test:summary` | ~4,191 unit/integration tests (204 files) |
| verify | `npm run verify:summary` | Financial calculation accuracy (498 checks, 15 phases) |
| parity | `tsx script/parity-check.ts` | Statement builder ↔ on-screen parity |

## Quick Commands

```bash
npm run dev            # Start dev server (port 5000)
npm run health         # tsc + tests + verify + doc harmony (~90s)
npm run test:summary   # ~4,191 tests, 204 files (~30s)
npm run verify:summary # 15-phase financial verification, 498 checks (~8s)
npm run lint:summary   # ESLint check (<10s)
npm run stats          # File/line/test counts (<5s)
npm run audit:quick    # Code quality: 13 checks (<3s)
npm run exports:check  # Unused export detection (<5s)
npm run diff:summary   # Git status + diff stats (<1s)
npm run db:push        # Push schema changes
npx tsx script/ci-hygiene.ts  # Auto-fix CI failures after external pulls
```

## Admin Analyst Tables (task #339)

Admin-only LLM-driven refresh of benchmark tables, starting with
`capital_raise_benchmarks`. Lives at Admin → AI Research → Analyst Tables.

- Schema: `capital_raise_benchmarks`, `analyst_refresh_audit_log`,
  `analyst_refresh_settings` (in `shared/schema/intelligence.ts`).
- Backend: `server/routes/admin/analyst-tables.ts` exposes list / refresh /
  commit / discard / reseed-accounts / settings endpoints.
- LLM helper: `server/ai/analyst-table-refresh.ts` (single round-trip,
  N+1 = 3 sources required).
- Security: 7 composable guards in
  `server/middleware/analyst-refresh-guards.ts` — admin-role, CSRF
  double-submit, per-admin rate limit (10/hr), table allow-list,
  single-flight, audit-log open, suspicious-pattern tracker (>5/10min).
- Frontend: `client/src/components/admin/intelligence/AnalystTables.tsx`
  with `AnalystRefreshTheater`, `RefreshDiffDialog`,
  `SuspiciousActivityBanner`, plus `useFirstVisitBenchmarkSeed`.
- Tests: `tests/server/analyst-refresh-guards.test.ts` (16 cases).

## Migration Drift Checklist (Apr 18, 2026)

Stage 0 fix-app + Stage 1 migration hygiene applied. Recurring root cause:
`bootstrapDrizzleMigrationState()` in `server/migrations/consolidated-schema.ts`
is one-shot — it stamps a snapshot of `drizzle.__drizzle_migrations` at first
run and never backfills when later migrations land. If a new migration is added
but its hash is missing from `__drizzle_migrations`, drizzle's `migrate()`
re-runs already-applied SQL and the boot fails (`column already exists`,
`column does not exist`, etc).

When adding a new migration, do all five:
1. Drop SQL into `migrations/NNNN_*.sql`
2. Add a matching entry to `migrations/meta/_journal.json` (idx + tag must match)
3. If running on an existing DB that already has the column, stamp the hash:
   `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES (sha256(file), now_ms);`
4. Update `shared/schema/*.ts` so Drizzle queries see the new column
5. `script/post-merge.sh` now runs the same node-postgres migrator the server
   uses at boot (headless, no TTY). Fresh clones / merged branches pick up
   pending migrations automatically.

Known historical-state issues (deferred — non-blocking):
- `__drizzle_migrations` row id=5 has stale hash `b01b0292…` that matches no
  current file (originally 0004 prior to a rewrite).
- Rows id=7 and id=8 are duplicate inserts of the 0006 hash.
Cleanup is safe but not required; drizzle keys by hash, not row id.

Migrations 0013 (`industry_vertical` + `exit_revenue_multiple`) and 0014
(`saved_tabs` jsonb) were added April 18 to bring the journal in sync with
already-applied DB state.
