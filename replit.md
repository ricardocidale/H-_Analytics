# H+ Analytics by Norfolk AI — Project Instructions

## Overview

H+ Analytics by Norfolk AI is a GAAP/USALI-compliant financial analytics portal for boutique hotel portfolio management. It models a hospitality management company and its individual property SPVs with monthly and yearly financial projections, adhering to GAAP (ASC 230, ASC 360, ASC 470) and USALI 12th Edition standards. 1,113 source files, ~190K lines. The platform delivers a premium, bespoke financial experience enabling precise financial modeling and reporting for the hospitality industry with an emphasis on financial accuracy and robust data governance.

**Rebecca** is the text chat AI assistant — Pinecone RAG across 7 namespaces with entity-aware context.

## User Preferences

- Simple, everyday language. Ask clarifying questions before implementing — do not assume.
- **TOP PRIORITY: Financial accuracy always beats UI enhancements.** The proof system must always pass.
- Always format money as currency (commas, appropriate precision).
- Skills live in `.claude/skills/` (18 domains, ~170 files). See `.claude/skills/_index.md` for the master catalog.
- Product name is "H+ Analytics by Norfolk AI" (or "H+ Analytics" for short). Company is "Norfolk AI".
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
- **Always update session-memory.md after every task.** Track decisions, architecture changes, industry knowledge, test counts, and session state.

## System Architecture

The application features a React 18 frontend with TypeScript, Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts, D3.js, and framer-motion. The backend is an Express 5 application utilizing Drizzle ORM and PostgreSQL.

**Core Design Principles & Features:**
- **Financial Accuracy & Compliance:** Highest priority, enforced by a comprehensive proof system (4,816 tests across 202 files, 15-phase verification pipeline), GAAP verification, and USALI 12th Edition compliance. Precision is hardened using `decimal.js`-backed arithmetic.
- **Modular Skill-Based Architecture:** Domain knowledge and context are managed through a skill-based system in `.claude/skills/`.
- **Theming & UI/UX:** A robust theme engine provides consistent UI with 5 presets. All UI components are theme-compliant, and specific UI patterns are enforced.
- **Shared Financial Calculation Layer (`calc/`):** Pure financial calculation logic in standalone modules. Both client and server import from `calc/`.
- **Server-Authoritative Finance:** `server/finance/service.ts` orchestrates the full portfolio computation pipeline server-side. A feature flag `USE_SERVER_COMPUTE` switches UI components to fetch pre-computed results.
- **Deterministic Hashing & Tenant Isolation:** Scenarios use deterministic JSON serialization and hashing. All database writes are scoped to the caller's userId.
- **Financial Field Registry:** `shared/field-registry.ts` is the single source of truth for all financial fields.
- **Data Governance & Configuration:** Model constants are DB-backed with fallbacks, editable via admin interfaces.
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
- **Vector DB:** Pinecone — 7 namespaces: knowledge-base, research-history, comparables, assumption-guidance, documents, scenarios, properties.
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
| Admin (16 sections) | `.claude/skills/admin/SKILL.md` |
| Rebecca Chatbot | `.claude/skills/rebecca-chatbot/SKILL.md` |
| **Vocabulary** | **`.claude/skills/vocabulary/SKILL.md`** — **Read before writing any UI text** |
| Finance (25 skills) | `.claude/skills/finance/` |
| Research (29 skills) | `.claude/skills/research/` |
| UI (54 skills) | `.claude/skills/ui/` |

## Key Rules

- **Calculations always highest priority** — never compromise financial accuracy for visuals
- **No raw hex in components** — use CSS variable tokens
- **All buttons GlassButton**, all pages PageHeader, all exports ExportMenu
- **No mock data** in production paths
- **Finance changes must state Active Skill** and pass verification (UNQUALIFIED)
- **Rebecca must NEVER compute financial values** — all data from the calculation pipeline
- **Rebecca Proactive Insights:** Two-tier insight system after portfolio compute. Tier 1: instant deterministic analysis. Tier 2: RAG-powered LLM insight via `POST /api/rebecca/insight`.
- **Balance Sheet Identity**: A = L + E must hold within $1
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
| lint | `npm run lint:summary` | ESLint violations |
| test | `npm run test:summary` | All 4,816 unit/integration tests |
| verify | `npm run verify:summary` | Financial calculation accuracy (498 checks) |
| parity | `tsx script/parity-check.ts` | Statement builder ↔ on-screen parity |

## Quick Commands

```bash
npm run dev            # Start dev server (port 5000)
npm run health         # tsc + tests + verify + doc harmony (~90s)
npm run test:summary   # All 4,816 tests, 202 files (~30s)
npm run verify:summary # 15-phase financial verification (~8s)
npm run lint:summary   # ESLint check (<10s)
npm run stats          # File/line/test counts (<5s)
npm run audit:quick    # Code quality: 13 checks (<3s)
npm run exports:check  # Unused export detection (<5s)
npm run diff:summary   # Git status + diff stats (<1s)
npm run db:push        # Push schema changes
```
