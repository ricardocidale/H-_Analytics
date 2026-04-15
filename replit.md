# Hospitality Business Group — Project Instructions

## Overview

This project is a business simulation portal for Hospitality Business Group, designed to model a boutique hospitality management company and its individual property Special Purpose Vehicles (SPVs). It provides monthly and yearly financial projections, adhering to GAAP standards (ASC 230, ASC 360, ASC 470). 1056 source files, ~174K lines. The platform's core purpose is to deliver a premium, bespoke financial platform experience, enabling precise financial modeling and reporting for the hospitality industry with an emphasis on financial accuracy and robust data governance.

## User Preferences

- Simple, everyday language. Ask clarifying questions before implementing — do not assume.
- **TOP PRIORITY: Financial accuracy always beats UI enhancements.** The proof system must always pass.
- Always format money as currency (commas, appropriate precision).
- Skills live in `.claude/skills/` (18 domains, 171 files). See `.claude/skills/_index.md` for the master catalog.
- Company name is "Hospitality Business Group" (or "Hospitality Business" for short).
- Update skills and manuals after every feature change.
- **Documentation:** `.claude/claude.md` is the primary AI context file. `replit.md` is kept for Replit Agent compatibility. When in doubt, `claude.md` is authoritative.
- All UI components must reference a theme via the theme engine.
- New UI features get their own skill file in `.claude/skills/ui/`.
- **Button Label Consistency:** Always "Save" — never "Update". See `rules/ui-patterns.md`.
- **Vocabulary is LAW:** Before writing ANY user-facing text (button labels, tooltips, headings, error messages, toasts, help text), read `.claude/skills/vocabulary/SKILL.md`. It defines every canonical term and forbidden alternative. Key rules: AI features use colleague language ("Ask the Analysts", "Analyst Note", "Conviction: High"), never machine language ("Generate", "Run", "Confidence Score: 78%"). See the skill for the full dictionary.
- **100% Session Memory:** Save decisions to `.claude/session-memory.md` at session end.
- **Every financial line item** should have a ? tooltip (HelpTooltip or InfoTooltip).
- **Every page must be graphics-rich** — charts, animations, visual elements required.
- **Context reduction is mandatory.** Every refactor must produce skills, helpers, scripts. See `skills/coding-conventions/context-reduction.md`.
- **Premium design, always.** $50K+ bespoke financial platform feel. See `rules/design-standards.md`.
- **Always update claude.md after every task.** Mandatory — no exceptions.
- **Always update memory.md after every task.** Track decisions, architecture changes, industry knowledge, test counts, and session state. This file persists across sessions and must reflect the current project state.

## System Architecture

The application features a React 18 frontend with TypeScript, Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts, D3.js, and framer-motion. The backend is an Express 5 application utilizing Drizzle ORM and PostgreSQL.

**Core Design Principles & Features:**
- **Financial Accuracy & Compliance:** Highest priority, enforced by a comprehensive proof system (4,536 tests across 187 files, 15-phase verification pipeline), GAAP verification, and USALI 12th Edition compliance. Precision is hardened using `decimal.js`-backed arithmetic.
- **Modular Skill-Based Architecture:** Domain knowledge and context are managed through a skill-based system in `.claude/skills/`.
- **Theming & UI/UX:** A robust theme engine provides consistent UI with 5 presets. All UI components are theme-compliant, and specific UI patterns are enforced.
- **Shared Financial Engine (`engine/`):** Pure financial calculation logic is extracted into a shared `engine/` package. Both client and server import from `@engine/*`.
- **Server-Authoritative Finance Engine:** `server/finance/service.ts` orchestrates the full portfolio computation pipeline server-side. A feature flag `USE_SERVER_COMPUTE` switches UI components to fetch pre-computed results.
- **Deterministic Hashing & Tenant Isolation:** Scenarios use deterministic JSON serialization and hashing. All database writes are scoped to the caller's userId.
- **Financial Field Registry:** `shared/field-registry.ts` is the single source of truth for all financial fields.
- **Data Governance & Configuration:** Model constants are DB-backed with fallbacks, editable via admin interfaces.
- **Unified Export System:** A `server/report/compiler.ts` generates `ReportDefinition` IR for PDF, PPTX, XLSX, and DOCX formats, with premium PDF exports using `@react-pdf/renderer`. Exports are reproducible server-side using a `computeRef` field.
- **Scenario Computed Snapshot Persistence:** The `scenario_results` table stores immutable computed artifacts per scenario.
- **Multi-Tenancy:** Supports users, groups, logos, themes, and branding for multiple entities.
- **Role Hierarchy:** `super_admin` > `admin` > `checker` / `user` > `investor`. The `isAdminRole()` helper in `shared/constants-enums.ts` checks for both `admin` and `super_admin`. Super admins are protected: regular admins cannot edit, delete, change role, or reset password of a super admin. Only super admins can assign the `super_admin` role.
- **LLM Integration:** Features a dual-model configuration (primary + fallback) for AI-powered functionalities across 7 domains.
- **Input Validation & Rate Limiting:** All mutation endpoints use Zod schema validation. Rate limiting is applied to compute-heavy endpoints.
- **Code Quality & Audit:** ESLint (covers `calc/`, `client/src/`, `server/`; `no-unused-vars: warn`, `no-console: warn`), Husky pre-commit hooks, and GitHub CI workflows enforce coding standards and TypeScript. Quick Audit runs 13 guardrail checks (catch compliance, brand hex, prop-any tracking, `as any` budget: server ≤85, client ≤100). Deep audit tests cover data-flow integrity and system security. Admin Testing Dashboard (Verification > Testing tab) provides live codebase scanning with source breakdown, test counts, and audit findings via `POST /api/admin/testing-dashboard/run`. Test Battery system adds 3 admin endpoints: `POST /api/admin/tests/run-battery` (engine/proof tests), `POST /api/admin/tests/source-verification` (audit tests), `POST /api/admin/tests/financial-verify` (financial verification pipeline). All are rate-limited, admin-only, and activity-logged.
- **Observability:** Structured logging, client-side error boundaries (Sentry.ErrorBoundary, ErrorBoundary, FinancialErrorBoundary), activity logging, Sentry for error tracking, PostHog for analytics, Upstash Redis for caching, and circuit breakers. Health endpoints monitor system status.
- **Image Processing:** Server-side Sharp pipeline for responsive WebP/AVIF image variants. Admin-configurable render settings via `render_settings` DB table (model configs, prompt templates, style toggles, auto-enhance, rate limits). Photo generation pipeline persists Base64 imageData to DB for storage independence.
- **Research Intelligence Redesign (Task #287):** A major architectural evolution of the research system, introducing a Star Rating System, Hotel vs Resort Classification, Entity Context Packs, 3-Tier Intelligence (ambient, entity-scoped, deep-dive), Progressive Relaxation for comparable sets, and Rebecca as a conversational AI layer for guidance. 13 new V2 database tables implemented. Phases 1-3 complete (T1-T18). Phase 4 complete (T19-T24): Rebecca 520px panel with context card, server-side context injection with IDOR prevention, Super Conversations with history persistence, email summaries + feedback system, RAG expansion with multi-namespace Pinecone queries, and admin tabs (Configuration, Conversations, Feedback). Phase 5 complete: All Engine Observatory components wired — CoverageAnalyticsDashboard, SystemIntelligenceStatus, ApiDashboardGrid, and MethodologyOverview in EngineDashboard; SourceRegistryOverlay in DataSourcesTab. QASandbox, ModelRoutingPanel, PipelinePoliciesForm already wired. Help pages and glossary enriched with chain scale, business model, and research intelligence terms.

## External Dependencies

- **Database:** PostgreSQL (managed by Drizzle ORM)
- **Frontend Libraries:** React 18, Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts, D3.js, framer-motion
- **PDF Generation:** jsPDF, @react-pdf/renderer
- **Document Processing:** Google Document AI (OCR)
- **Image Processing:** Sharp
- **Mapping:** MapLibre GL
- **Monitoring & Analytics:** Sentry, PostHog
- **Caching:** Upstash Redis
- **AI/LLM Providers:** `@anthropic-ai/sdk`, Gemini
- **Vector DB:** Pinecone — fully integrated across 7 namespaces: knowledge-base, research-history, comparables, assumption-guidance, documents, scenarios, properties. Multi-namespace RAG powers Rebecca's chat. Admin dashboard provides per-namespace stats, re-indexing, and clearing. Region configurable via `PINECONE_REGION` env var.
- **Icons:** Lucide (hardcoded — Phosphor/Material removed)
- **Email:** Resend
- **Research/Data APIs:** RapidAPI (RealtyService, USRealEstateService, XoteloService), FREDService, HospitalityBenchmarkService, MoodysService, SPGlobalService, Perplexity SDK, Tavily
- **Spreadsheet/Presentation:** xlsx, pptxgenjs

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts, D3.js, framer-motion |
| Backend | Express 5, TypeScript, Drizzle ORM |
| Database | PostgreSQL |
| Icons | Lucide (hardcoded, single icon set) |
| AI/LLM | Anthropic SDK, Gemini |
| PDF | jsPDF, @react-pdf/renderer |
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
| Multi-Tenancy | `.claude/skills/multi-tenancy/SKILL.md` |
| Exports | `.claude/skills/exports/SKILL.md` |
| Admin (16 sections) | `.claude/skills/admin/SKILL.md` |
| Rebecca Chatbot | `.claude/skills/rebecca-chatbot/SKILL.md` |
| **Vocabulary** | **`.claude/skills/vocabulary/SKILL.md`** — **Read before writing any UI text** |
| Finance (22 skills) | `.claude/skills/finance/` |
| Research (23 skills) | `.claude/skills/research/` |
| UI (45 skills) | `.claude/skills/ui/` |

## Key Rules

- **Calculations always highest priority** — never compromise financial accuracy for visuals
- **No raw hex in components** — use CSS variable tokens
- **All buttons GlassButton**, all pages PageHeader, all exports ExportMenu
- **No mock data** in production paths
- **Finance changes must state Active Skill** and pass verification (UNQUALIFIED)
- **Rebecca must NEVER compute financial values** — all data from the calculation engine
- **Rebecca Proactive Insights:** Two-tier insight system after portfolio compute. Tier 1: instant deterministic analysis (`client/src/lib/rebecca-insights.ts`) for immediate feedback. Tier 2: RAG-powered LLM insight via `POST /api/rebecca/insight` — queries Pinecone `comparables`, `assumption-guidance`, and `research-history` namespaces, then generates a context-aware observation using the chatbot LLM. Uses `useRebeccaInsightStore` Zustand store with hash-based deduplication. Insights get smarter as research accumulates.
- **Rebecca Rich Blocks**: 5 visual block types (stat/compare/timeline/insight/kpi) via `:::blockType ... :::` syntax. Max 1 block per response. Parser in `rich-block-parser.ts`, renderers in `RichBlockRenderers.tsx`.
- **Rebecca Knowledge Base**: Admin CRUD with Pinecone sync (active entries upserted, inactive deleted). Version history with rollback. See `.claude/skills/rebecca-chatbot/SKILL.md`.
- **Rebecca Guardrails**: Admin-configured response rules injected into system prompt at runtime. CRUD via `/api/rebecca/guardrails`.
- **Engine chain**: `gop = revenue − opex`, `agop = gop − feeBase − feeIncentive`, `noi = agop − expenseTaxes`, `anoi = noi − expenseFFE`
- **Balance Sheet Identity**: A = L + E must hold within $1
- **Resend replaces SendGrid** for all transactional email

## User Roles

| Role | Access |
|------|--------|
| `admin` | Full — all pages + Admin Settings |
| `user` | Management-level — no Admin panel |
| `checker` | User + verification tools |
| `investor` | Limited — Dashboard, Properties, Profile, Help |

## Research Intelligence System

The app uses a comprehensive research methodology. Key architectural principles:

- **Auto-derived research profiles**: Properties derive their research profile from existing assumptions (starRating + ADR + hospitalityType + location). No separate ICP definition needed per property.
- **Business model types**: `businessModel` field on properties: "hotel" (default) | "vrbo". Determines applicable expense categories, revenue streams, fee structures, and research approaches.
- **STR chain scale equivalence**: Independent/boutique properties are classified into equivalent STR tiers (Luxury/Upper Upscale/Upscale/etc.) based on ADR and star rating for industry-standard benchmarking.
- **Post-improvement targeting**: Research targets the property's planned operating state after improvements, not acquisition state.
- **N+1 synthesis pipeline**: Parallel analyst panels (Gemini + Claude) → API validation → Opus synthesis with attribution.
- **Badge system**: Gold/amber `accent-pop` badges near every guidable assumption input field, showing AI-recommended ranges with source attribution. `RangeIndicator` component shows green/yellow/red status when current field value is within/near/outside the recommended range, plus inline confidence indicator (High/Med/Low dot).
- **Intelligence Workflow**: Regenerate Intelligence button with staleness dot (green/amber/red), IntelligenceStatusBar with 30/90-day freshness thresholds, ApplyResearchDialog with dirty-field tracking and user-edit badges, RiskInsightsPanel (collapsible property risk grade + top risks), RegulatoryNotesPanel (non-US country regulatory context), PortfolioRiskGradeSection on OverviewTab, and HospitalityBenchmarksTab in Admin > AI Research Engines.
- **Per-User Default Properties**: Admin can assign default properties to each user via `userDefaultProperties` table. UI in Admin > Users with toggle switches per property.
- **Required Fields Configuration**: Admin can configure which property fields are required via `requiredFieldsConfig` JSONB on `global_assumptions`. Toggle UI in Admin > Model Defaults.

## E2E Testing Authentication

**CRITICAL RULE — NEVER navigate to /login or click any login button.** The login page has a Google OAuth button; if the testing agent clicks it, the entire session is permanently blocked by an external OAuth redirect.

Instead, authenticate via a direct API call BEFORE any browser navigation:

```
1. [New Context] Create a fresh browser context
2. [API] POST /api/auth/dev-login with body {} and Content-Type: application/json — this auto-logs in as admin and sets a session cookie
3. [Browser] Navigate directly to the target page (e.g., /dashboard, /admin?tab=brand)
```

- Always use `[API]` step first, never `[Browser]` to /login
- Do NOT pass `authConfig` credentials — they trigger the OAuth flow which is blocked
- Do NOT click any Google sign-in button, spinning logo, or any element on the login page

## Quick Commands

```bash
npm run dev            # Start dev server (port 5000)
npm run health         # tsc + tests + verify + doc harmony (~60s)
npm run test:summary   # All 4,536 tests, 187 files (~35s)
npm run verify:summary # 15-phase financial verification (~25s)
npm run lint:summary   # TypeScript check only (<10s)
npm run stats          # File/line/test counts (<5s, no vitest)
npm run audit:quick    # Code quality: 13 checks — any, catch-any, error casts, brand hex, prop-any (<3s)
npm run exports:check  # Unused export detection (<5s)
npm run diff:summary   # Git status + diff stats (<1s)
npm run db:push        # Push schema changes
```