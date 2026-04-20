# H+ Analytics by Norfolk AI — Project Instructions

## Overview

H+ Analytics is a GAAP/USALI-compliant financial analytics portal for boutique hotel portfolio management, created and powered by Norfolk AI. It models a hospitality management company (default seed name: "Hospitality Management Co") and its individual property SPVs with monthly and yearly financial projections, adhering to GAAP (ASC 230, ASC 360, ASC 470) and USALI 12th Edition standards. ~1,180 source files in `calc/`+`server/`+`client/`+`shared/`, ~192K lines. ~4,400 tests across ~227 files. 19-phase verification pipeline (508 checks). The platform delivers a premium, bespoke financial experience enabling precise financial modeling and reporting for the hospitality industry with an emphasis on financial accuracy and robust data governance.

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
- Skills live in `.claude/skills/` (~21 domains, ~195 files). See `.claude/skills/_index.md` for the master catalog. **For Replit-specific behavior, read `.claude/skills/replit-workflow/SKILL.md` — it's authoritative for what Replit owns, session hygiene, and escalation rules.**
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
- **Financial Accuracy & Compliance:** Highest priority, enforced by a comprehensive proof system (~4,400 tests across ~227 files, 19-phase verification pipeline with 508 checks), GAAP verification, and USALI 12th Edition compliance. Precision is hardened using `decimal.js`-backed arithmetic.
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
- **Caching:** Postgres-backed (`cache_entries` table on Neon) — see `server/cache.ts`
- **AI/LLM Providers:** `@anthropic-ai/sdk`, Gemini
- **Vector store:** Neon pgvector (`vector_chunks` table, 1536-dim cosine, HNSW index) — 7 namespaces: knowledge-base, research-history, comparables, assumption-guidance, documents, scenarios, properties. Embeddings via OpenAI `text-embedding-3-small`.
- **Neon hostname note:** the DB hostname `helium` is Neon's internal project name, not a different provider. Replit's managed Postgres = Neon. Do NOT infer "not on Neon" from the hostname — check billing (`rewritetax.md` line 53 shows Neon compute charges) instead. Pinecone was fully removed Apr 17–19 via Task #353; only `PINECONE_API_KEY` secret remains as a vestigial env entry. Cache layer is Postgres-backed on the same Neon DB (`cache_entries` table) — no Upstash Redis.
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
- **Git commits**: All five gates must pass before commit (`tsc --noEmit`, `lint:summary`, vocabulary test 11/11, `test:summary`, `verify:summary` UNQUALIFIED). Never use `--no-verify`. Commit message must include the verification line: `Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED`. See `.claude/rules/pre-commit-verification.md` and `.agents/skills/pre-commit-gates/SKILL.md`.

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
| test | `npm run test:summary` | ~4,400 unit/integration tests (~227 files) |
| verify | `npm run verify:summary` | Financial calculation accuracy (508 checks, 15 phases) |
| parity | `tsx script/parity-check.ts` | Statement builder ↔ on-screen parity |

## Quick Commands

```bash
npm run dev            # Start dev server (port 5000)
npm run health         # tsc + tests + verify + doc harmony (~90s)
npm run test:summary   # ~4,400 tests, ~227 files (~30s)
npm run verify:summary # 19-phase financial verification, 508 checks (~8s)
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

## The Analyst — Team-of-Specialists Architecture (in flight)

The Analyst is **internally** a team of specialists; **user-facing voice stays singular** ("The Analyst"). Internal vocabulary (Surface Specialist, Cognitive Engine, Surface Router, Voice Renderer, Quality Scorer) lives in code, docs, and skills only — never user-facing strings.

**Architecture spine:** `docs/architecture/ANALYST.md` (two-tier: Cognitive Engine + Surface Specialists). Per-component specs under `docs/architecture/analyst/`. Decision record: `docs/architecture/decisions/ADR-001-analyst-two-tier.md` (Accepted).

**Phase status:**
- ✅ Phase 1a — docs spine + 9 per-component specs + ADR-001 (Replit, `68f983fc`, `a230d968`)
- ✅ Phase 1b — `.claude/skills/analyst/` (12 files) + `analyst-team.md` + `analyst-verdict-contract.md` (Claude Code, `14dc1f4b`, `c9a7d12b`)
- ✅ Phase 2 — `engine/analyst/{contracts,router,voice,quality,surface}/` skeleton + CODEOWNERS + naming-lint + ADR-002 (Replit, `5ba18f29`)
- ✅ Phase 3a — `AnalystVerdict` contract + Surface Router + Voice Renderer + Quality Scorer + persona test bench + ADR-003 + 53 tests (Claude Code, `d220f4b1`, `cc6d5a0e`). Contract frozen.
- ✅ Phase 3b — Funding + Revenue Surface Specialists; `createMgmtCoRouter`; `/save-tab` returns `AnalystVerdict | null`; `AnalystCheckDialog` rewritten on the contract; tests use real Specialists end-to-end (Replit, `ee0c6573`)
- ⏳ Phase 4 — build remaining mgmt-co Specialists (Compensation, Overhead, Company, Property-Defaults). Persona resolution (currently hardcoded `{ L+B, luxury, US }` single-tenant) + verdict-cache table are deferred follow-ups.
- 🟡 Phase 5 — Cognitive Engine reorg (`server/ai/` 41 flat files → 6 capability folders, pending ADR-005) + **verdict cache (ADR-004 Accepted 2026-04-20 — Phase 5A Claude-side shipped `38a468b3`; migrations handoff queued at `.claude/replit-handoffs/phase-5a-verdict-cache-migrations.md`)** + research-history reindex + guidance↔engine seam doc

**Parallel workstream — Operational Tooling (OT):**
- ✅ OT-A.1 — Anthropic native prompt caching (Replit, `7326e28c`)
- ✅ OT-A.2 — Vercel AI SDK + AI Gateway BYOK wrapper (Replit, `aedebc05`, `64b37ca2`)
- ✅ OT-A.3 — escalated + resolved. Five A/B iterations (v1→v5) surfaced **four mechanism bugs** (definition drift, mode collapse, representational mismatch, parity-against-broken-baseline). Gate re-specced from raw-output parity to per-tier value-parity with a four-class exemption taxonomy. T1 cleared 8/8 under exemption-adjusted scoring. Each bug now has a codified rule (see Codified Rules below).
- ✅ OT-A.4 — **shipped (Replit, `7da9f25a`, 2026-04-19 18:14 UTC).** Legacy regex extractor retired; `streamObject` + `synthesisOutputToLegacyJson` adapter is the single synthesis path; `USE_AI_SDK_SYNTHESIS=true` by default; `ENGINE_VERSION` bumped v1→v2 (`v2-2026-04-20-a`); `SYNTHESIS_FINGERPRINT` `786aae35…`. Zod validation failures yield `ORCHESTRATOR_BOTH_FAILED` → single-model fallback engages cleanly. All gates green on ship.
- 🟡 OT-A.5 — **drafting (Replit), in T+72h observation window (eligible 2026-04-22 18:14 UTC).** Section A (`inflationRate`) **DEFER** outcome (`97c5a331`): all 20 v5 cases were US-only; mono-country sample cannot test country-awareness. Filed for OT-A.6 with $3–5 mixed-country LEA trace gate. Section C.2 (`costSeg5yrPct`): v3.3 anchor confirmed byte-identical between `e5d873fe` and HEAD; v5 −26.7% bias is a real regression — strengthen with IRS Cost Seg ATG source pointer. v6 batch scope: 6 T2 USALI source-pointer anchors (B.1–B.6) + C.2 strengthen + C.1 docs-only reclassification. Drafts staged at `.local/drafts/OT-A-5-item-{3,4}-*.md`; held until gate. Single $22 v6 rerun authorized at gate clearance with explicit ack.
- 🟡 Sentry financial contexts — handoff ready at `docs/operational-tooling/HANDOFF-replit-sentry-financial-contexts.md`; queued behind OT-A
- 🟡 PostHog wiring — handoff ready at `docs/operational-tooling/HANDOFF-replit-posthog-wiring.md`; queued behind Sentry
- ⏸ OT-B — Promptfoo PR-gate on persona drift (queued)
- ⏸ OT-C — Braintrust adoption decision (after OT-A closes)

**Codified rules from OT-A.3/A.4 (enforce on future LLM-pipeline migrations):**
- `.claude/rules/field-definitions-no-prescription-hints.md` + `tests/proof/field-definitions-no-hints.test.ts` — ban numeric typical-range hints in `FIELD_DEFINITIONS` (mechanism bug #2).
- `.claude/rules/llm-contract-migration-parity.md` — parity tests must happen at the downstream-effect layer, not raw-output (mechanism bug #3).
- `.claude/rules/parity-exemption-classes.md` — four-class exemption taxonomy for when parity-measurement itself is the wrong question (mechanism bug #4).
- `server/ai/engine-version.ts` + `tests/proof/engine-version-drift.test.ts` — `SYNTHESIS_FINGERPRINT` + `ENGINE_VERSION` must co-bump when `synthesis-schema.ts` or `research-prompt-builders.ts` change. Orchestrator changes (e.g. Sentry tag emission) are NOT in the fingerprint denominator.

**OT/Analyst boundary:** OT-A touches `server/ai/` only; never `engine/analyst/**`, `engine/watchdog/*Evaluator.ts`, `server/routes/**`, `client/src/**`, `tests/analyst/**`.

**Reusable engineering-discipline skills** (project-agnostic, under `.agents/skills/`): `pre-commit-gates`, `cross-check-invariants`, `architecture-decision-records`, `agent-handoff-briefs`, `agent-memory-files`.

**Boundary rule:** `.claude/**` is Claude Code's authoritative domain. Replit Agent edits limited to ≤5-line append on `.claude/session-memory.md` and `BLOCKED.md` siblings; everything else under `.claude/` goes through a handoff brief. `.agents/skills/**` is project-agnostic. `docs/**` is open editing for either agent.

## Interactive Analyst — Admin Defaults slice (in flight, April 20, 2026)

**Goal:** every admin-editable assumption value carries a visible "Analyst"
button + a Save-time soft-gate, with one set of universal primitives that
will later roll out to property edit and CompanyAssumptions without change.

**Doctrine (locked this slice):**
- Constants → Defaults → Assumptions cascade. Admin Defaults is the
  "Defaults" layer; the Analyst produces ranges that gate "blunt"
  violations of high-confidence guidance, never the constants themselves.
- Cooldown: 60s per user, enforced server-side (in-memory) and mirrored
  client-side via `retryAfterMs`.
- Blunt-violation thresholds: `confidence==="high"` AND value >20% past
  the nearest band edge. Interrupt when ≥2 fields violate OR a single
  field is >40% past the edge.
- Never show token/cost in the tooltip.

**Primitives (all under `client/src/components/analyst/`):**
- `AnalystActionButton` — shadcn outline + amber accent + Sparkles icon.
  Variants `header` / `save-row` / `modal`. Pulses while running, shows
  cooldown countdown in tooltip. `data-testid="button-analyst[-suffix]"`.
- `useAnalystRefresh({ scope, invalidateKeys })` — POSTs
  `/api/analyst/refresh`, syncs local 60s cooldown with server
  `retryAfterMs`, invalidates caller's query keys, surfaces toasts.
- `computeAnalystViolations({ draft, guidance, fields })` — pure helper
  returning `{ violations, shouldInterrupt, maxOutOfBandPct }`. Exports
  `ANALYST_VIOLATION_THRESHOLD=0.2` and
  `ANALYST_SINGLE_FIELD_BLUNT_THRESHOLD=0.4`.
- `useAnalystSaveGate({...})` + `<SaveWithAnalystGate />` — returns
  `{ requestSave, dialog }` (hook form) or a drop-in wrapper (component
  form). The dialog offers `[Cancel]` `[Save Anyway]` `[Analyst ✨]`.
  In-dialog rerun auto-closes + saves when violations clear; background
  rerun from a header button does not hijack the dialog
  (separate `awaitingRerun` state).

**Server surface:**
- `POST /api/analyst/refresh` — body `{ scope: "global-assumptions",
  fields?: string[] }`; guards `requireAuth` + `requireAdminGuard`;
  60s per-user cooldown → 429 `{ retryAfterMs }`; returns guidance
  inline so the UI doesn't need a second fetch. Translates
  `"global-assumptions"` → runner's `"company"` dialect. Exports
  `__resetAnalystCooldown` test hook.
  (`server/routes/analyst-admin.ts`, registered in `server/routes.ts`.)
- `runAnalystScoped({ scope:"company", userId, fields? })` — non-HTTP
  entry point. Mirrors the company branch of `/api/market-research`
  without streaming: drains orchestrator → parses → `extractGuidance` →
  creates `research_runs` row → upserts `assumption_guidance` → fire-
  and-forgets vector index. `fields` filters only the **returned**
  slice; every record is persisted so overlapping tabs don't re-run.
  (`server/ai/analyst-scoped-runner.ts`.)
- `GET /api/guidance/company/:userId` — reused unchanged; feeds the
  admin-side inline range indicators.

**Wired surfaces:** `ModelDefaultsTab` renders the Analyst button in
three sub-tabs (Company, Market & Macro, Property Underwriting), each
scoped to its own canonical field list at
`client/src/components/admin/model-defaults/analyst-fields.ts`. The
parent fetches `/api/guidance/company/:userId` once (admin-gated via
`useAuth().isAdmin`) and shares one cooldown clock across tabs. Save is
intercepted via `useAnalystSaveGate` with the union of all three field
lists; the gate routes through `onSaveStateChange` so AdminPage's Save
button picks up the gate without knowing it exists.

**Skipped by design:** Model Constants, LLM Defaults, Required Fields —
their content is registry / model config / metadata, not assumption
values, so the guidance extractor has no vocabulary for them.

**Deferred (explicitly not in this slice):** Analyst button on property
edit sections; same button on CompanyAssumptions and Scenarios;
scheduled/batch pre-population worker; promotion of Analyst values into
Property scalar columns (owned by the later property-edit slice —
`server/ai/analyst-promotion.ts` is drafted but shelved).

**Recent Changes** entries for this slice are appended below in chunk
order so the chronology is preserved.

## Recent Changes

**Interactive Analyst — Admin Defaults, chunks T003–T007b (April 20, 2026, Replit):**
- T003: `AnalystActionButton` with three variants, amber Sparkles, cooldown tooltip.
- T004: `runAnalystScoped` non-HTTP entry point (~260 LOC). Persists all records, filters return slice only.
- T005: `POST /api/analyst/refresh` (~110 LOC). 60s cooldown → 429; activity-logged; did **not** reuse the bigger `analystRefreshGuards()` composer (that's for the separate analyst-tables feature — 10/hr, CSRF, audit logs).
- T006a: `useAnalystRefresh` hook + per-tab canonical field map + parent guidance query + CompanyTab pilot.
- T006b: MarketMacroTab + PropertyUnderwritingTab wired; ModelConstants/LlmDefaults/RequiredFields skipped as planned.
- T007a: `computeAnalystViolations` pure helper + `<SaveWithAnalystGate />` dialog (high-confidence + 20% single / 40% lone-blunt thresholds; in-dialog rerun auto-proceeds).
- T007b: Refactor extracts `useAnalystSaveGate` hook; `ModelDefaultsTab.tsx` unions all three sub-tab field lists and routes the lifted `onSave` through `requestSave` before AdminPage ever sees it.
- T008: gates all green (TS 0, Lint 0, Tests PASS, Verify UNQUALIFIED, Parity PASS, Health ALL CLEAR); architect review executed. **Architect surfaced a real functional bug queued as T009**: `analyst-fields.ts` lists match guidance-extractor vocabulary (`maxOccupancy`, `dispositionCommission`) but the actual tab drafts use prefixed keys (`defaultMaxOccupancy`, `salesCommissionRate`), so `computeAnalystViolations` reads `undefined` for most fields and `shouldInterrupt` is almost always `false`. Gate doesn't crash — it silently no-ops. T009 will introduce an `AnalystFieldSpec = { guidanceKey, draftKey }` mapping + per-tab tests asserting drafts line up. Non-urgent follow-ups from the same review: `useAnalystRefresh`'s hard-wired `scope:"global-assumptions"` (widen at property-edit rollout) and the `extractGuidance("company")` vocabulary gap for property-flavored keys.

**Defaults overlay read path landed (April 20, 2026, Replit):**
- The 46 seeded `model_defaults` rows (all `mc.*` universal scope) are now reachable. New reader primitive at `server/defaults.ts` exposes `resolveDefault<T>(key, scope?)` and `resolveDefaultsByCard(cat, subTab, cardKey, scope?)`. Contract: candidates must be scope-compatible (each column is NULL or equal to the passed scope); highest specificity wins; ties broken by `id DESC`.
- **Architectural rule** — the financial engine stays pure (no I/O). Server code resolves defaults at the request boundary, layers the user's saved value on top, then hands a plain value/overlay into the engine as an argument. Pattern: `ga?.X ?? (await resolveDefault<T>("mc.card.X")) ?? TS_CONSTANT_X`.
- First call-site wired: `server/routes/chat.ts:205` (`Projection Years` in Rebecca's prompt context) — byte-identical swap since DB and TS constant both = 10, zero calc-path exposure.
- Test: `tests/server/defaults-resolver.test.ts` — 7/7 pass against the real seeded DB. Covers known-key resolution, unknown→undefined, scope→universal fallback, jsonb type decoding, card grouping, category/subTab isolation.

**Defaults-drift guard wired into verify suite (April 20, 2026, Replit, same session):**
- New proof test `tests/proof/defaults-drift.test.ts` compares every seeded `model_defaults` row against its paired TS constant (`DEFAULT_*` in `shared/constants.ts`). If anyone edits the constant without re-seeding, or edits the seed without updating the constant, the gate fails with a pointer to the remediation (`tsx script/seed-model-defaults.ts`).
- Registered as Phase 20 in `script/lib/verify-phases.ts` → "Defaults Drift" → 47 checks (one per seeded key + one orphan-spec guard).
- Shared source of truth: `SPECS` + `toDefaultKey()` + `CardKey` now exported from `script/seed-model-defaults.ts` so seed and guard read from the same list.
- Current baseline: 47/47 in sync on first run — confirms no existing drift.
- All gates green: TS 0, Lint 0, Tests PASS, Verify UNQUALIFIED (20 phases / 555 checks), Parity PASS, Health ALL CLEAR.

**Bulk wire-through increment 1 (April 20, 2026, Replit, same session):**
- 4 additional byte-identical swaps landed, all prompt/validation-context (zero calc-path exposure), all in pre-existing async handlers:
  - `server/routes/chat.ts:206` — `mc.property_defaults.propertyInflationRate` (Rebecca's inflation-rate prompt line).
  - `server/routes/research.ts:538-540` — `mc.property_defaults.roomCount`, `.startAdr`, `.maxOccupancy` (fallbacks passed into `validateResearchValues()`).
- Running tally: 5 of 46 seeded values now consumed via `resolveDefault()`. The drift guard protects all swaps.
- Pattern reminder for the next hop: `userValue ?? (await resolveDefault<T>("mc.card.X")) ?? TS_CONSTANT_X`.
- Known non-targets on the Setup card: `DEFAULT_MODEL_START_DATE` / `DEFAULT_COMPANY_OPS_START_DATE` live only in seed files (circular); `DEFAULT_COMPANY_INFLATION_RATE` has zero server consumers today — nothing to wire.
- `DEFAULT_PROJECTION_YEARS` also referenced at `server/calculation-checker/index.ts:54` but the enclosing `runIndependentVerification()` is sync — wiring it requires an async refactor, deferred.
- All gates green: TS 0, Lint 0, Tests PASS, Verify UNQUALIFIED (20 phases / 555 checks incl. 47 drift), Parity PASS, Health ALL CLEAR.

**Bulk wire-through increment 2 (April 20, 2026, Replit, same session):**
- Three more byte-identical swaps landed, using the "hoist-and-inject" pattern so sync code paths stay sync:
  - `server/finance/sensitivity.ts` — `DEFAULT_EXIT_CAP_RATE` and `DEFAULT_COMMISSION_RATE` resolved once at the top of `computeSensitivityAnalysis()` (async) and threaded into the sync `runScenario()` as a new `ResolvedDefaults` bag. Keeps the 40-run hot loop (base + 14 tornado + 25 heatmap) free of awaits while still DB-authoritative.
  - `server/document-ai/templates.ts` — removed the direct `DEFAULT_EXIT_CAP_RATE` import. `renderTemplate`, `renderLOI`, and `renderInvestmentMemo` now take a `defaultExitCapRate: number` parameter.
  - `server/routes/documents.ts` — async route handler now resolves `mc.tax_exit.exitCapRate` once per request and passes it into `renderTemplate`.
- Running tally: **8 of 46 seeded values** now consumed via `resolveDefault()`. Drift guard still 47/47.
- Pattern established: for calc-path or rendered-output code that is sync, resolve the default in the nearest async boundary (route or orchestrator) and inject it as an explicit argument. This preserves engine/renderer purity without introducing async cascades.
- Sweep exhaustive for remaining async-reachable consumers. The last wirable `DEFAULT_*` constant still hardcoded in server code is `DEFAULT_PROJECTION_YEARS` / `DEFAULT_LTV` / `DEFAULT_OCCUPANCY_RAMP_MONTHS` inside `server/calculation-checker/index.ts` — blocked by `runIndependentVerification()` being a sync top-level entry point. Would need the same hoist pattern applied one level up (at the scheduler or API route that triggers it).
- All gates green: TS 0, Lint 0, Tests PASS, Verify UNQUALIFIED (20 phases / 555 checks incl. 47 drift), Parity PASS, Health ALL CLEAR.

**Template display/calc consistency fix (April 20, 2026, same session, post code-review):**
- Code review of increment 2 caught a latent bug: although `estimatedNOI` in `renderLOI` / `renderInvestmentMemo` used the resolved fallback, three displayed cap-rate rows still called `formatPercent(property.exitCapRate)` directly. With a null `property.exitCapRate`, this would render `NaN%` to the document while the NOI number used the fallback — silent calc/display divergence.
- Fix: each renderer now computes `const effectiveExitCapRate = property.exitCapRate || defaultExitCapRate` (or `capRate` in investment memo) **once**, and uses the same variable for both the numeric calc AND every displayed cap-rate cell. `renderManagementAgreement` was extended with the same `defaultExitCapRate` param for consistency, and `renderTemplate` threads it into all three renderers.
- Added `tests/server/document-templates.test.ts` (5 tests): asserts no `NaN%` leaks for any of the three templates when `property.exitCapRate` is null, verifies LOI calc↔display parity (display cap rate and NOI both derived from the same effective value), and confirms explicit `property.exitCapRate` still wins over the fallback.
- Re-review: PASS, bug closed, increment accepted.
- Final state: 8/46 values wired, TS 0, Lint 0, 20/20 verify phases (555 checks, 47 drift), 5 new template regression tests, Parity PASS.

**Cross-check detector sweep shipped (April 20, 2026, Claude Code, end-of-day):**
- **4 new proof tests** wired into `verify:summary` as Phases 16-19: orphan-files, any-prop-detector, literal-drift, seed-schema-sync. Total is now 19 phases / 508 checks. Each ships with a baseline + stale-entry guard for incremental cleanup.
- **Baseline progression across the session:** orphans 29 → 0, any-prop 28 → 0, literal-drift 25 → 0, seed/schema 64 → 36. Net: 34 barrel files + 4 UNWIRED modules + 1 shim deleted (~720 LOC); 20+ files retyped from `any` to precise types; `DEFAULT_MODEL_START_DATE` centralized (closes D-1 drift pattern).
- **3 real production bugs surfaced + fixed:** (1) IcpMarketContextTab over-broad `assetDefinition` cast, (2) InvestmentAnalysis dead `allPropertyFinancials`/`getPropertyYearly` props with mismatched-shape callers, (3) **OtherAssumptionsSection silent display bug** — cost-of-equity always showed 18% regardless of admin override, because `draft.globalAssumptions?.costOfEquity` ran on a type with no `globalAssumptions` field.
- **ADR-004 verdict cache Accepted** (`66f3df90`). Phase 5A Claude-side (cache-key utilities + 21 tests) shipped (`38a468b3`). Phase 5A migrations queued for Replit at `.claude/replit-handoffs/phase-5a-verdict-cache-migrations.md`.
- **ADR-005 workspace reorganization Proposed** (docs-only). 4 open questions resolved; Phase 1 handoff queued at `.claude/replit-handoffs/phase-1-workspace-bootstrap.md` (tooling-only, zero file moves). Status stays Proposed until Phase 1 + 2 land cleanly per ADR's own acceptance criteria.
- **Lint 348 → 40 warnings** (88% reduction) across 9 atomic sub-batches this session + prior sessions.

**Forward-discipline playbook (April 20, 2026, Replit, docs-only):**
- `best-practices.md` (project root) — 22-rule forward-looking distillation of `rewritetax.md`'s 7 cost vectors. Categories: multi-agent hygiene, architectural redirection, vendor decisions, AI prompt-tuning, migration hygiene, cosmetic churn, platform-specific tax. Read before starting the next project; install the rules first, ship the code second.
- `rewritetax.md` got two short addendums (Forward-Discipline Playbook + Live Billing Database) — body untouched.

**Replit billing telemetry DB — 75-invoice ledger live (April 20, 2026, Replit):**
- Promoted the forensic 75-invoice ledger from static markdown (`rewritetax.md`) to live Postgres tables in the existing project DB (additive only — no app code touches them, no workflow restart, OT-A.5 v6 observation window untouched).
- New tables: `replit_invoices` (75 rows: invoice headers + cap-hit/spike-day flags + H+ attribution columns) and `replit_invoice_line_items` (139 rows: 3 portal-line-item-exact gross + 136 ratio-estimated net, with explicit `amount_basis` column so the future CSV upgrade preserves semantics).
- Files: `shared/schema/replit-billing.ts`, `script/seed-replit-billing.ts` (re-runnable, wrapped in `db.transaction`), `script/billing-report.ts` → `docs/billing/hplus-cost-report.md`, `script/_create-billing-tables.ts` (one-shot SQL bootstrap; drizzle-kit push needs a TTY).
- Headline numbers: H+ workspace `e53ea481-…` = $4,378.41 attributed cash = 92.2% of total project-life cash invoiced ($4,747.69 across 34 active billing days, $128.78/day average).
- Attribution model (path "C-then-B"): 91% routine ratio, 95% spike-day ratio (Feb 10, Mar 8, Apr 19), portal-line-item-exact for `XFPSSE-DRAFT` (H+ gross $2,558.98). Upgrade path: drop an Orb CSV at `./.local/orb-invoice-export.csv` and a follow-up loader replaces estimates with workspace-exact figures.
- Implementation note: hit the documented `drizzle-zod .omit()` violation on first try; switched to `typeof table.$inferInsert/$inferSelect` (no Zod), which sidesteps the issue. Schema is Zod-free.
- Refresh anytime: `npx tsx script/seed-replit-billing.ts && npx tsx script/billing-report.ts`.

**OT-A.5 prep — Section A DEFER + C.2 strengthen confirmed (April 19, 2026, Replit, `97c5a331`, docs-only):**
- Two offline verifications during the OT-A.4 T+72h observation window. **No source files touched, no API spend, engine-version-drift test stays clean.**
- **Section A:** tabulating `(market, legacy.inflationRate.mid, new.mid)` across all 20 v5 cases revealed the sample is US-only; STAYS/PROMOTED rules from OT-A-5-design.md §A both presuppose mixed-country evidence. DEFER outcome → Section A removed from v6 batch; filed for OT-A.6 with $3–5 mixed-country LEA trace gate.
- **Section C.2:** diffed FIELD_DEFINITIONS cost-seg block (`synthesis-schema.ts:203–205`) between `e5d873fe` and HEAD — byte-identical. v3.3 anchor intact in production; v5 −26.7% bias is a real regression. Strengthen with IRS Cost Segregation Audit Techniques Guide source pointer.
- v6 batch now: 6 T2 USALI anchors (B.1–B.6) + C.2 strengthen + C.1 docs-only. v6 prompt LOC delta ~100–140 (down from ~120–160 without Section A).
- Drafts for items (3) Sentry `fallback_reason` tag patch and (4) v6 prompt diff package staged at `.local/drafts/`. Held until 2026-04-22 18:14 UTC gate clearance with explicit $22 ack.

**OT-A.4 — streamObject + adapter shipped (April 19, 2026, Replit, `7da9f25a`):**
- Legacy regex extractor retired. `streamObject` (Vercel AI SDK) + `synthesisOutputToLegacyJson` (in `server/ai/synthesis-schema.ts`) is the single synthesis path. `USE_AI_SDK_SYNTHESIS=true` by default. `ENGINE_VERSION` v1 → v2 (`v2-2026-04-20-a`); `SYNTHESIS_FINGERPRINT` `786aae35…`.
- Zod validation failures route through try/catch in `research-orchestrator.ts:467-501` to `ORCHESTRATOR_BOTH_FAILED` sentinel → single-model fallback engages cleanly.
- All gates green on ship. T+72h production observation window opened — gate eligible 2026-04-22 18:14 UTC.

**Analyst Architecture Phase 3b (April 19, 2026, Replit, `ee0c6573`):**
- Funding + Revenue evaluators ship through `engine/analyst/surface/mgmt-co/{funding,revenue}-specialist.ts` and dispatch via `createMgmtCoRouter` from `/save-tab`. Response shape: `{ ok, savedTabs, verdict: AnalystVerdict | null }` (legacy `watchdog` field removed — single consumer).
- `AnalystCheckDialog` rewritten on `AnalystVerdict`: renders `voice.headline` verbatim, flatten+dedupe per-dim actions, separate ghost "Save Anyway" button outside `actions[]` (contract stays frozen — `save_anyway` deliberately not in the union).
- `tests/analyst/personas/lb.test.ts` exercises real Specialists end-to-end through Router + Voice Renderer + Quality Scorer; compensation case stays a stub for Phase 4.
- Verified: TS 0, Lint 0, test:summary PASS, Verify UNQUALIFIED, Parity PASS, Health ALL CLEAR.
- Deferred (follow-ups): persisted verdict cache per tab; persona resolution from user/company settings (currently hardcoded `{ L+B, luxury, US }` single-tenant).

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
