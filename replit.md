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
- **Intelligence-First Pages:** Every page with inputs must: (1) nudge user to consult the Analyst on first visit (glowing Analyst button per `.claude/skills/vocabulary/SKILL.md` § 2 — never write "Ask The Analyst" as a literal label), (2) require Save before leaving, (3) auto-save if user doesn't press Save, (4) block downstream fields until compulsory fields are completed, (5) compel regeneration if intelligence is old. Track first-visit per-user per-page in DB.
- **100% Session Memory:** Save decisions to `.claude/session-memory.md` at session end.
- **Every financial line item** should have a ? tooltip (HelpTooltip or InfoTooltip).
- **Every page must be graphics-rich** — charts, animations, visual elements required.
- **Context reduction is mandatory.** Every refactor must produce skills, helpers, scripts. See `skills/coding-conventions/context-reduction.md`.
- **Premium design, always.** $50K+ bespoke financial platform feel. See `rules/design-standards.md`.
- **Always update claude.md after every task.** Mandatory — no exceptions.
- **Always update session-memory.md after every task.** Track decisions, architecture changes, industry knowledge, test counts, and session state.
- **CRITICAL RULE — NEVER navigate to /login or click any login button.** The login page has a Google OAuth button; if the testing agent clicks it, the entire session is permanently blocked by an external OAuth redirect. Instead, authenticate via a direct API call BEFORE any browser navigation.
- **Assumption Field Naming — Use Industry-Standard Terms.** When naming any Assumption field (display labels, tooltips, registry entries in `engine/analyst/registry/field-registry.ts`, etc.), research the standard term used in real estate, hospitality, and/or finance and use it verbatim. Examples: "ADR" (not "Average Rate"), "RevPAR" (not "Revenue Per Room"), "GOP" (not "Gross Operating Profit Margin"), "Cap Rate" (not "Capitalization Percentage"), "F&B" (not "Food and Beverage" in compact labels), "DSCR" (not "Debt Service Coverage"). Do NOT invent labels from camelCase variable names — look up the canonical industry term first (STR/CBRE/HVS/PwC hospitality reports, NCREIF/ULI real estate, CFA/SEC finance) and pin it in the field registry so the heuristic formatter never has to guess.

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
- **Tax / Cost-Rate Source of Truth (Audit #406, Task #405):** The locality-aware `MODEL_CONSTANTS_REGISTRY` is the **single canonical source** for both `taxRate` (US baseline = 0.21, federal corporate per IRC §11) and `costRateTaxes` (US baseline = 0.012, blended industry property-tax rate). The legacy flat fallbacks `DEFAULT_COMPANY_TAX_RATE` (0.30) and `DEFAULT_COST_RATE_TAXES` (0.03) were deleted from `shared/constants.ts` because they diverged from the registry baselines and admins were seeing one value in editable cards and a different one when the resolver picked the factory baseline. **Every UI fallback, seed, export, golden test, and engine read now resolves through `getFactoryNumber('taxRate' | 'costRateTaxes', country, state)`** — there is no surviving flat literal. Goldens were re-baselined in the same change. Re-introducing either constant would resurrect the divergence; the TypeScript compile error from importing a non-existent export is the canonical guard.
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
- **Exit Scenarios (Task #807):** `calc/analysis/exit-scenarios.ts` is the single source of truth for the Pessimistic / Base / Optimistic × 3/5/7/10-yr exit grid. It pulls loan balances from `getOutstandingDebtAtYear`, derives jurisdiction-specific selling-cost line items (broker, transfer/doc-stamp tax with US-state lookup, step-down prepayment penalty 5→0%, FF&E disposition), folds in cumulative negative cash flow, and reports breakeven hold period, annualized ROI, and an early-exit risk flag (>5 yrs breakeven). Server endpoint `POST /api/finance/property/:id/exit-scenarios` reuses `recomputeSinglePropertyAndStamp` + `aggregateUnifiedByYear` for the NOI / cash-flow series; `ExitScenariosSection` renders it on PropertyDetail with hover tooltips and per-scenario terminal-value-vs-cumulative-cost area charts.
- **Resources Control Plane:** A top-level Admin sidebar section for managing APIs, Sources, Tables, and Models, serving as the single canonical edit surface for these resources. Specialist pages become read-only assignment and health surfaces, with wiring managed through code.
- **Operating-Structure Comparison (Task #809):** `/structures/:id` compares 6 operating structures (Fee-Simple Independent, Franchise, HMA, Master Lease as Tenant, Master Lease as Landlord, Hybrid HMA+Franchise) for any property. Server endpoint `POST /api/properties/:id/structure-comparison` runs `compareOperatingStructures` (calc/analysis) over the recomputed engine output, applying country-aware overlays from `shared/constants-operating-structures.ts` and producing GOP/EBITDA/NOI, unlevered/levered IRR, equity multiple, peak negative cash flow, downside NOI, and a risk-adjusted recommendation. Reachable from PropertyDetail (quick action) and the Analysis page launcher.

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

## User Roles

- **super_admin** — full platform access including user management and provider switches.
- **admin** — manages Constants, Resources, model defaults, properties, scenarios, and specialist wiring (admin routes use `requireAdmin`).
- **checker** — reviews and approves scenarios; cannot edit financial inputs.
- **user** — creates and edits properties and scenarios within their group.
- **investor** — read-only access to assigned reports.

## Key Rules

- Financial accuracy beats UI enhancements. The proof system must always pass.
- All financial fields go through `shared/field-registry.ts` (single source of truth).
- All Constants edits go through the admin Constants tab (Phase 4 read-only doctrine guards every other surface).
- Research-trigger buttons say "Analyst" with the sparkle icon — the canonical `AnalystActionButton` from `client/src/components/analyst/`.
- Storage URLs use the relative `/objects/<key>` form (no hard-coded R2/GCS hosts).
- The Replit-independence guard fails the build if non-allowlisted code references `@replit/`, `process.env.REPL*`, or `replit.dev` / `replit.app`.

## Quick Commands

- `npm run dev` — start the Express + Vite dev server on port 5000.
- `npm run build` — produce `dist/` (vite client + esbuild server bundle) for production.
- `npm start` — run the production bundle (`node dist/index.cjs`).
- `npm run check` — TypeScript typecheck (no emit).
- `npm run lint:strict` — ESLint with all bug guards.
- `npm run test:summary` — full Vitest run, condensed output.
- `npm run verify:summary` — financial proof + verification gates.
- `npm run audit:quick` — fast structural audit (file-size, bug-pattern, doctrine guards).
- `npm run db:push` — sync Drizzle schema to Postgres (use `--force` in CI).
- `npx tsx script/cleanup-legacy-logo-urls.ts [--apply]` — post-R2-cutover cleanup that rewrites or deletes `logos` rows still pointing at legacy `/objects/uploads/<uuid>` URLs (Task #526).

## Skill Router

Project skills live in `.claude/skills/` (canonical) and are mirrored under `.local/skills/`. Read the relevant `SKILL.md` before working in that domain. Common entry points:

- UI patterns and theme engine: `.claude/skills/ui/`
- Coding conventions and context reduction: `.claude/skills/coding-conventions/`
- Financial calculation rules: `.claude/skills/finance/`
- Analyst-button convention: `.agents/skills/analyst-research-buttons/SKILL.md`
- Compound Engineering bundle (vendored from EveryInc/compound-engineering-plugin v3.2.0): `.agents/skills/COMPOUND-ENGINEERING.md` — index of 37 `ce-*` skills + 51 personas. Tool/path mapping for Replit Agent at `.agents/ce-agents/REPLIT-ADAPTATION.md`. Setup is a no-op (already vendored).

The full skill index is in `.claude/claude.md`, which is the authoritative AI context file when in doubt.

## Tech Stack

- **Runtime:** Node.js 22 (production via `npm start` → `node dist/index.cjs`).
- **Server:** Express 5, Drizzle ORM, PostgreSQL (Neon).
- **Client:** React 19, TypeScript, Vite, Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts, D3.js, framer-motion.
- **Build:** esbuild (server bundle) + Vite (client) via `script/build.ts`.
- **Storage:** Cloudflare R2 via the AWS S3 SDK (`server/providers/storage/s3-storage.ts`); switchable through `STORAGE_PROVIDER`.
- **Auth:** Pluggable provider (`server/providers/auth/`) — `replit` (OIDC) or `local` (Google OAuth + sessions).
- **Hosting:** Railway (production) — see `railway.json` for build/start/healthcheck. Cutover from Replit completed for DB (Neon) and storage (R2).