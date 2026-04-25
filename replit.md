# H+ Analytics by Norfolk AI — Project Instructions

## Overview

H+ Analytics is a GAAP/USALI-compliant financial analytics portal for boutique hotel portfolio management, created and powered by Norfolk AI. It models a hospitality management company and its individual property SPVs with monthly and yearly financial projections, adhering to GAAP and USALI 12th Edition standards. The platform delivers a premium, bespoke financial experience, enabling precise financial modeling and reporting for the hospitality industry with an emphasis on financial accuracy and robust data governance.

The platform features two AI agents:
- **The Analyst**: A singular intelligence agent conducting research, providing ranges, conviction levels, and risk flags.
- **Rebecca**: An expert companion agent answering questions, explaining Analyst findings, guiding tours, and offering help.

## User Preferences

- Simple, everyday language. Ask clarifying questions before implementing — do not assume.
- **TOP PRIORITY: Financial accuracy always beats UI enhancements.** The proof system must always pass.
- Always format money as currency (commas, appropriate precision).
- Update skills and manuals after every feature change.
- **Documentation:** `.claude/claude.md` is the primary AI context file. `replit.md` is kept for Replit Agent compatibility. When in doubt, `claude.md` is authoritative.
- All UI components must reference a theme via the theme engine.
- New UI features get their own skill file in `.claude/skills/ui/`.
- **Button Label Consistency:** Always "Save" — never "Update". See `rules/ui-patterns.md`.
- **Brand Voice is LAW:** Before writing ANY user-facing text, read `.claude/brand-voice-guidelines.md` — the SINGLE SOURCE OF TRUTH.
- **CI Hygiene:** After pulling external code (Claude Code, other agents), run `npx tsx script/ci-hygiene.ts` to auto-fix ESLint unused vars/imports, secret scanner false positives, and TypeScript errors.
- **Intelligence-First Pages:** Every page with inputs must: (1) nudge user to Ask the Analyst on first visit (glowing button), (2) require Save before leaving, (3) auto-save if user doesn't press Save, (4) block downstream fields until compulsory fields are completed, (5) compel regeneration if intelligence is old. Track first-visit per-user per-page in DB.
- **100% Session Memory:** Save decisions to `.claude/session-memory.md` at session end.
- **Every financial line item** should have a ? tooltip (HelpTooltip or InfoTooltip).
- **Every page must be graphics-rich** — charts, animations, visual elements required.
- **Context reduction is mandatory.** Every refactor must produce skills, helpers, scripts. See `skills/coding-conventions/context-reduction.md`.
- **Premium design, always.** $50K+ bespoke financial platform feel. See `rules/design-standards.md`.
- **Always update claude.md after every task.** Mandatory — no exceptions.
- **Always update session-memory.md after every task.** Track decisions, architecture changes, industry knowledge, test counts, and session state.
- **CRITICAL RULE — NEVER navigate to /login or click any login button.** The login page has a Google OAuth button; if the testing agent clicks it, the entire session is permanently blocked by an external OAuth redirect. Instead, authenticate via a direct API call BEFORE any browser navigation.

## System Architecture

The application uses a React 18 frontend with TypeScript, Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts, D3.js, and framer-motion. The backend is an Express 5 application utilizing Drizzle ORM and PostgreSQL.

**Core Design Principles & Features:**
- **Financial Accuracy & Compliance:** Enforced by a comprehensive proof system, GAAP verification, and USALI 12th Edition compliance. Precision is hardened using `decimal.js`-backed arithmetic.
- **Modular Skill-Based Architecture:** Domain knowledge and context are managed through a skill-based system in `.claude/skills/`.
- **Theming & UI/UX:** A robust theme engine provides consistent UI with 5 presets. All UI components are theme-compliant.
- **Shared Financial Calculation Layer (`calc/`):** Pure financial calculation logic shared between client and server.
- **Server-Authoritative Finance:** `server/finance/service.ts` orchestrates the full portfolio computation pipeline server-side.
- **Deterministic Hashing & Tenant Isolation:** Scenarios use deterministic JSON serialization and hashing. All database writes are scoped to the caller's userId.
- **Financial Field Registry:** `shared/field-registry.ts` is the single source of truth for all financial fields.
- **Data Governance & Configuration:** Model constants follow a TS-factory + DB-overlay pattern, with factory baseline in `shared/constants.ts` and `shared/countryDefaults.ts`. `model_constant_overrides` stores genuine departures.
- **Unified Export System:** `server/report/compiler.ts` generates `ReportDefinition` IR for PDF, PPTX, XLSX, and DOCX, with premium PDF exports using `@react-pdf/renderer`.
- **Scenario Computed Snapshot Persistence:** The `scenario_results` table stores immutable computed artifacts per scenario.
- **Multi-Tenancy:** Supports users, groups, logos, themes, and branding for multiple entities.
- **Role Hierarchy:** `super_admin` > `admin` > `checker` / `user` > `investor`.
- **LLM Integration:** Dual-model configuration (primary + fallback) for AI-powered functionalities across 7 domains.
- **Pre-Collected Market Data:** 7 database tables serve as Priority 0 in the smart data router before external APIs are called.
- **Input Validation & Rate Limiting:** All mutation endpoints use Zod schema validation. Rate limiting is applied to compute-heavy endpoints.
- **Automated Validation Gates:** 5 registered CI-style gates (typecheck, lint, test, verify, parity) run automatically on task completion.
- **Code Quality & Audit:** ESLint, Husky pre-commit hooks, GitHub CI workflows.
- **Observability:** Structured logging, client-side error boundaries, Sentry for error tracking, PostHog for analytics, Postgres-backed cache, and circuit breakers.
- **Image Processing:** Server-side Sharp pipeline for responsive WebP/AVIF image variants.
- **Interactive Analyst - Admin Defaults:** Implements a system for admin-editable assumption values with an "Analyst" button and a save-time soft-gate, ensuring consistency across the application.
- **Admin IA - Defaults Group + AI Section:** Defines the canonical structure of the Admin sidebar, organizing defaults for Management Company, Property, Market & Macro, and Constants. It also establishes dedicated sections for AI Platform (LLM infrastructure) and AI Research (Specialist-first configuration).
- **Resources Control Plane:** A top-level Admin sidebar section for managing APIs, Sources, Tables, and Models, serving as the single canonical edit surface for these resources. Specialist pages become read-only assignment and health surfaces, with wiring managed through code.

## External Dependencies

- **Database:** PostgreSQL (managed by Drizzle ORM)
- **Frontend Libraries:** React 18, Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts, D3.js, framer-motion
- **PDF Generation:** jsPDF, @react-pdf/renderer, WeasyPrint (Python)
- **Document Processing:** Google Document AI (OCR)
- **Image Processing:** Sharp
- **Mapping:** MapLibre GL
- **Monitoring & Analytics:** Sentry, PostHog
- **Caching:** Postgres-backed (`cache_entries` table on Neon)
- **AI/LLM Providers:** `@anthropic-ai/sdk`, Gemini
- **Vector store:** Neon pgvector (`vector_chunks` table, 1536-dim cosine, HNSW index)
- **Cloudflare R2:** Object storage for new uploads and asset management.
- **Neon Database:** The primary PostgreSQL database, connected directly via `POSTGRES_URL`.
- **Icons:** Lucide
- **Email:** Resend