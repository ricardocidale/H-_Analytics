# Hospitality Business Group — Project Instructions

## Overview

This project is a business simulation portal for Hospitality Business Group, modeling a boutique hospitality management company and its individual property Special Purpose Vehicles (SPVs). It provides monthly and yearly financial projections, adhering to GAAP standards (ASC 230, ASC 360, ASC 470). The platform aims to deliver a premium, bespoke financial platform experience, enabling precise financial modeling and reporting for the hospitality industry with a focus on financial accuracy and robust data governance.

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

## System Architecture

The application features a React 18 frontend with TypeScript, Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts, D3.js, and framer-motion. The backend is an Express 5 application utilizing Drizzle ORM and PostgreSQL.

**Core Design Principles & Features:**
- **Financial Accuracy & Compliance:** Highest priority, enforced by a comprehensive proof system (3,973 tests across 170 files), GAAP verification, and USALI 12th Edition compliance. The Balance Sheet Identity (A = L + E) must hold within $1. Precision is hardened using `decimal.js`-backed arithmetic to eliminate floating-point drift.
- **Modular Skill-Based Architecture:** Domain knowledge and context are managed through a skill-based system in `.claude/skills/`.
- **Theming & UI/UX:** A robust theme engine provides consistent UI with 5 presets. All UI components are theme-compliant, and specific UI patterns are enforced. Every financial line item includes an `InfoTooltip`.
- **Shared Financial Engine (`engine/`):** Pure financial calculation logic is extracted into a shared `engine/` package for property, company, aggregation, debt, and funding calculations. Both client and server import from `@engine/*`.
- **Server-Authoritative Finance Engine:** `server/finance/service.ts` orchestrates the full portfolio computation pipeline server-side, importing from `@engine/*`. A feature flag `USE_SERVER_COMPUTE` switches UI components to fetch pre-computed results from the server via React Query.
- **Deterministic Hashing & Tenant Isolation:** Scenarios use deterministic JSON serialization and hashing. All database writes are scoped to the caller's userId to prevent cross-tenant mutation.
- **Financial Field Registry:** `shared/field-registry.ts` is the single source of truth for all financial fields, defining properties, sources, fallbacks, types, categories, and validation bounds.
- **Data Governance & Configuration:** Model constants are DB-backed with fallbacks, editable via admin interfaces. Settings are managed through "Company Assumptions", an "Admin panel", and a read-only "Model Inputs" panel.
- **Unified Export System:** A `server/report/compiler.ts` generates `ReportDefinition` IR for PDF, PPTX, XLSX, and DOCX formats. Premium PDF exports use `@react-pdf/renderer` with client-side chart screenshots.
- **Export Reproducibility Lock & Server-Side Generation:** Exports can be recomputed server-side using a `computeRef` field, ensuring deterministic results and providing output hashes and engine versions. A `POST /api/exports/generate` endpoint supports fully server-side generation of various report types from cached compute results, controlled by a `USE_SERVER_EXPORTS` feature flag.
- **Scenario Computed Snapshot Persistence:** The `scenario_results` table stores immutable computed artifacts per scenario, with API endpoints for recomputation, retrieval of latest results, and drift checks.
- **Multi-Tenancy:** Supports users, groups, logos, themes, and branding for multiple entities.
- **LLM Integration:** Features a dual-model configuration (primary + fallback) for AI-powered functionalities across 7 domains.
- **Input Validation & Rate Limiting:** All mutation endpoints use Zod schema validation. Rate limiting is applied to compute-heavy endpoints.
- **Code Quality & Audit:** ESLint flat config enforces coding standards, banning problematic constructs in financial code. Husky pre-commit hooks and GitHub CI workflows enforce linting and TypeScript. Deep audit tests cover data-flow integrity, cache invalidation, scenario management, endpoint security, export parity, integration pipelines, and checker architecture.
- **Observability:** Structured logging via `server/logger.ts`, client-side error boundaries (Sentry.ErrorBoundary, ErrorBoundary, FinancialErrorBoundary), activity logging for financial mutations, Sentry for error tracking, PostHog for analytics, Upstash Redis for caching, and circuit breakers. Health endpoints (`/api/health/live`, `/api/health/ready`, `/api/health/deep`) monitor system status.
- **Image Processing:** Server-side Sharp pipeline for responsive WebP/AVIF image variants.

## Tech Stack

React 18 + TypeScript frontend, Express 5 + Drizzle ORM + PostgreSQL backend. Shared financial engine in `engine/`. Key libraries: Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts, D3.js, framer-motion, jsPDF, @react-pdf/renderer, Sharp, MapLibre GL, Sentry, PostHog, Upstash Redis.

## Skill Router

| Domain | Skill Path | What It Covers |
|--------|-----------|---------------|
| Context Loading | `.claude/skills/context-loading/SKILL.md` | Task-to-skill map, loading tiers |
| Architecture | `.claude/skills/architecture/SKILL.md` | Tech stack, two-entity model, file organization |
| Design System | `.claude/skills/design-system/SKILL.md` | Colors, typography, component catalog, CSS classes |
| Proof System | `.claude/skills/proof-system/SKILL.md` | 3,973 tests across 170 files, verification commands |
| Admin (16 sections) | `.claude/skills/admin/SKILL.md` | 16-section shell pattern, extraction guide, API routes |
| Finance (22 skills) | `.claude/skills/finance/` | Income statement, cash flow, balance sheet, IRR, DCF |
| Research (23 skills) | `.claude/skills/research/` | Market, ADR, occupancy, cap rate, ICP profile |
| UI (45 skills) | `.claude/skills/ui/` | Graphics, animation, entity cards, navigation |

## Key Rules

- **Calculations always highest priority** — never compromise financial accuracy for visuals
- **No raw hex in components** — use CSS variable tokens
- **No mock data** in production paths
- **Balance Sheet Identity**: A = L + E must hold within $1
- **DEPRECIATION_YEARS = 39** — US fallback default (varies by country; method is always GAAP straight-line)
- **Button labels always "Save"** — never "Update"
- **LLM dual-model config** — primary + fallback, 7 domains, no hardcoded models
- **Doc Harmony Rule:** `replit.md` and `.claude/claude.md` must stay in sync

## User Roles

| Role | Access |
|------|--------|
| `admin` | Full — all pages + Admin Settings |
| `user` | Management-level — no Admin panel |
| `checker` | User + verification tools |
| `investor` | Limited — Dashboard, Properties, Profile, Help |

## Quick Commands

```bash
npm run dev            # Start dev server (port 5000)
npm run health         # tsc + tests + verify + doc harmony (~60s)
npm run test:summary   # All 3,973 tests, 170 files (~35s)
npm run verify:summary # 8-phase financial verification (~20s)
npm run lint:summary   # TypeScript check only (<10s)
npm run stats          # File/line/test counts (<5s)
npm run audit:quick    # Code quality checks (<3s)
npm run exports:check  # Unused export detection (<5s)
npm run diff:summary   # Git status + diff stats (<1s)
```

## External Dependencies

- **Database:** PostgreSQL (managed by Drizzle ORM)
- **Frontend Libraries:** React 18, Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts, D3.js, framer-motion
- **PDF Generation:** jsPDF (client-side), @react-pdf/renderer (server-side premium)
- **Document Processing:** Google Document AI (OCR)
- **Image Processing:** Sharp
- **Mapping:** MapLibre GL
- **Monitoring & Analytics:** Sentry, PostHog
- **Caching:** Upstash Redis
- **AI/LLM Providers:** `@anthropic-ai/sdk`, Gemini
- **Vector DB:** Pinecone (serverless, `lb-hospitality` index, 1536-dim cosine, `text-embedding-3-small`)
- **Icons:** @phosphor-icons/react, Lucide
- **Email:** Resend
- **AI Assistant:** Rebecca (chat-based financial advisor)
- **Research/Data APIs:** RapidAPI (RealtyService, USRealEstateService, XoteloService), FREDService, HospitalityBenchmarkService, MoodysService, SPGlobalService, Perplexity SDK, Tavily
- **Spreadsheet/Presentation:** xlsx, pptxgenjs (client-side)

## Storage Architecture (SQL vs Pinecone)

| Layer | Store | What | Why |
|-------|-------|------|-----|
| Structured data | PostgreSQL | Properties, scenarios, users, market_research, market_rates, global_assumptions, logos, companies, integrations | Relational integrity, ACID transactions, joins, indexing |
| Semantic retrieval | Pinecone `knowledge-base` | Document chunks from methodology, platform guide, checker manual, attached_assets | RAG for AI chat (Rebecca) and research prompts |
| Prior knowledge | Pinecone `research-history` | Research result summaries (≤1,500 chars), key metrics, propertyId, location | Enables "what did we learn about similar properties?" context for N+1 orchestrator |
| Guidance vectors | Pinecone `assumption-guidance` (PLANNED) | Vectorized assumption guidance records for Rebecca RAG | Enables Rebecca to answer questions about any research finding |

**Design rule:** SQL is the system of record; Pinecone is the semantic index. Research results live in `market_research` (full content, JSONB) and are *additionally* indexed in Pinecone (summary only) for retrieval.

## Research Intelligence Redesign (PLANNED — Task #287)

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
assumption_guidance, research_runs, benchmark_snapshots, relaxation_traces, guidance_decisions, rebecca_conversations, rebecca_messages, rebecca_emails, rebecca_feedback, coverage_snapshots, source_registry, integration_key_rotations, pipeline_policies — all in `shared/schema/intelligence-v2.ts`, migration `0009_intelligence_v2.sql`

### New Property Fields (IMPLEMENTED)
starRating (1-5), starRatingSource, starRatingSuggested, hospitalityType (hotel|resort|boutique_hotel|business_hotel|wellness_resort|conference_hotel|extended_stay) — with Zod validation

### Context Pack System (IMPLEMENTED)
- `server/ai/context-pack/` — PropertyContextPack (10 categories), CompanyContextPack (8 categories), luxury classifier
- `server/ai/prompt/` — Auto-prompt assembly engine (Tier 1 full entity, Tier 2 single assumption)
- `server/ai/guidance/` — Guidance extractor with Zod validation, key normalization, dual extraction paths (property + company)
- `server/routes/guidance.ts` — Scenario-scoped guidance API (GET/POST with access control) + Tier 2 deep-dive endpoint
- `server/ai/ambient/` — Tier 0 benchmark scheduler (21 hospitality benchmarks, FRED macro rates, 6h refresh)
- `server/ai/comparables/` — Progressive relaxation engine (L0-L5), ComparableQueryBuilder, integrated into orchestrator pre-phase. Star ±1 hard guard at all levels. Traces persisted to relaxation_traces table.

## H+ Analytics Logo Variants

| Variant | Path | Best Use |
|---------|------|----------|
| Glass (default) | `/logos/h-plus-glass.png` | Sidebar, favicon, small contexts |
| Enhanced Transparent | `/logos/h-plus-enhanced-transparent.png` | Login page, reports, light backgrounds |
| Enhanced Dark | `/logos/h-plus-enhanced-dark.png` | PDF headers, dark mode, presentation slides |