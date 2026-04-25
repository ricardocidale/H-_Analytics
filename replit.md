# H+ Analytics by Norfolk AI — Project Instructions

## Overview

H+ Analytics is a GAAP/USALI-compliant financial analytics portal for boutique hotel portfolio management, created and powered by Norfolk AI. It models a hospitality management company and its individual property SPVs with monthly and yearly financial projections, adhering to GAAP and USALI 12th Edition standards. The platform delivers a premium, bespoke financial experience enabling precise financial modeling and reporting for the hospitality industry with an emphasis on financial accuracy and robust data governance.

**Key AI Agents:**
- **The Analyst:** A singular intelligence agent conducting research, providing financial ranges, conviction levels, and risk flags.
- **Rebecca:** An expert companion agent for answering questions, explaining Analyst findings, and guiding users.

## User Preferences

- Simple, everyday language. Ask clarifying questions before implementing — do not assume.
- **TOP PRIORITY: Financial accuracy always beats UI enhancements.** The proof system must always pass.
- Always format money as currency (commas, appropriate precision).
- Update skills and manuals after every feature change.
- **Documentation:** `.claude/claude.md` is the primary AI context file. `replit.md` is kept for Replit Agent compatibility. When in doubt, `claude.md` is authoritative.
- All UI components must reference a theme via the theme engine.
- New UI features get their own skill file in `.claude/skills/ui/`.
- **Button Label Consistency:** Always "Save" — never "Update".
- **Brand Voice is LAW:** Before writing ANY user-facing text, read `.claude/brand-voice-guidelines.md` — the SINGLE SOURCE OF TRUTH.
  - **The Analyst** (singular, capitalized): Intelligence agent. "Ask the Analyst" button. "The Analyst is studying..." status.
  - **Rebecca**: Expert companion. Outgoing, intellectual, geeky, dry wit.
  - NEVER: "the system", "the AI", "the chatbot", "your analysts" (plural), "Regenerate Intelligence", "Stale", "Fresh"
  - App = "H+ Analytics". Company = "Hospitality Management Co". Technology = "Norfolk AI Engine".
- **CI Hygiene:** After pulling external code (Claude Code, other agents), run `npx tsx script/ci-hygiene.ts` to auto-fix ESLint unused vars/imports, secret scanner false positives, and TypeScript errors.
- **Intelligence-First Pages:** Every page with inputs must: (1) nudge user to Ask the Analyst on first visit (glowing button), (2) require Save before leaving, (3) auto-save if user doesn't press Save, (4) block downstream fields until compulsory fields are completed, (5) compel regeneration if intelligence is old. Track first-visit per-user per-page in DB.
- **100% Session Memory:** Save decisions to `.claude/session-memory.md` at session end.
- **Every financial line item** should have a ? tooltip (HelpTooltip or InfoTooltip).
- **Every page must be graphics-rich** — charts, animations, visual elements required.
- **Context reduction is mandatory.** Every refactor must produce skills, helpers, scripts.
- **Premium design, always.** $50K+ bespoke financial platform feel.
- **Always update claude.md after every task.** Mandatory — no exceptions.
- **Always update session-memory.md after every task.** Track decisions, architecture changes, industry knowledge, test counts, and session state.

## System Architecture

The application features a React 18 frontend with TypeScript, Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts, D3.js, and framer-motion. The backend is an Express 5 application utilizing Drizzle ORM and PostgreSQL.

**Core Design Principles & Features:**
-   **Financial Accuracy & Compliance:** Enforced by a comprehensive proof system, GAAP verification, and USALI 12th Edition compliance. Precision is hardened using `decimal.js`-backed arithmetic.
-   **Modular Skill-Based Architecture:** Domain knowledge and context are managed through a skill-based system.
-   **Theming & UI/UX:** A robust theme engine provides consistent UI with 5 presets. All UI components are theme-compliant. Color scheme: Navy (#112548), Teal (#0091AE), Gold (#FDB817).
-   **Shared Financial Calculation Layer (`calc/`):** Pure financial calculation logic shared between client and server.
-   **Server-Authoritative Finance:** `server/finance/service.ts` orchestrates the full portfolio computation pipeline server-side.
-   **Deterministic Hashing & Tenant Isolation:** Scenarios use deterministic JSON serialization and hashing. All database writes are scoped to the caller's userId.
-   **Financial Field Registry:** `shared/field-registry.ts` is the single source of truth for all financial fields.
-   **Data Governance & Configuration:** Model constants follow a TS-factory + DB-overlay pattern, resolving `manual > analyst > factory` at the most specific locality.
-   **Unified Export System:** Generates `ReportDefinition` IR for PDF, PPTX, XLSX, and DOCX formats, with premium PDF exports using `@react-pdf/renderer`.
-   **Scenario Computed Snapshot Persistence:** Immutable computed artifacts per scenario are stored in `scenario_results`.
-   **Multi-Tenancy:** Supports users, groups, logos, themes, and branding for multiple entities.
-   **Role Hierarchy:** `super_admin` > `admin` > `checker` / `user` > `investor`.
-   **LLM Integration:** Features a dual-model configuration (primary + fallback) for AI-powered functionalities.
-   **Pre-Collected Market Data:** Seven database tables serve as Priority 0 in the smart data router before external APIs are called.
-   **Input Validation & Rate Limiting:** All mutation endpoints use Zod schema validation. Rate limiting is applied to compute-heavy endpoints.
-   **Automated Validation Gates:** Five registered CI-style gates (typecheck, lint, test, verify, parity) run automatically on task completion.
-   **Code Quality & Audit:** ESLint, Husky pre-commit hooks, GitHub CI workflows.
-   **Observability:** Structured logging, client-side error boundaries, activity logging, Sentry for error tracking, PostHog for analytics, and circuit breakers.
-   **Image Processing:** Server-side Sharp pipeline for responsive WebP/AVIF image variants.
-   **Admin Information Architecture:** Features a locked structure for Admin sidebar groups: `Defaults`, `Resources`, `AI Platform`, `AI Research`.
    -   **Defaults:** Contains Management Company, Property, Market & Macro, and Constants defaults, mirroring user-facing assumption pages.
    -   **Resources:** Canonical edit surface for APIs, Sources, Tables, and Models.
    -   **AI Platform:** Manages universal LLM uses, routing & fallback policy, and cross-vendor observability.
    -   **AI Research:** Collapsible 2-level tree (`Subject` → `Specialist`) where each Specialist page is the single source of truth for its configuration.
-   **The Analyst Team-of-Specialists Architecture:** Internally, The Analyst is a team of specialists (e.g., Funding, Revenue, ICP Intelligence, Risk Intelligence) each with dedicated configuration surfaces and research jobs.

## External Dependencies

-   **Database:** PostgreSQL (managed by Drizzle ORM on Neon)
-   **Frontend Libraries:** React 18, Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts, D3.js, framer-motion
-   **PDF Generation:** jsPDF, @react-pdf/renderer, WeasyPrint (Python)
-   **Document Processing:** Google Document AI (OCR)
-   **Image Processing:** Sharp
-   **Mapping:** MapLibre GL
-   **Monitoring & Analytics:** Sentry, PostHog
-   **Caching:** Postgres-backed (`cache_entries` table on Neon)
-   **AI/LLM Providers:** @anthropic-ai/sdk, Gemini
-   **Vector store:** Neon pgvector (`vector_chunks` table) for embeddings via OpenAI `text-embedding-3-small`.
-   **Object Storage:** Cloudflare R2 (via S3-compatible adapter) for new uploads; legacy Replit Object Storage for orphaned assets.
-   **Icons:** Lucide
-   **Email:** Resend