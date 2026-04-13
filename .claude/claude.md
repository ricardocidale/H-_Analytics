# H+ Analytics — Project Instructions

## Project Summary

Fundraising intelligence platform for **Hospitality Business Group**. Models a boutique hospitality management company alongside individual property SPVs with monthly and yearly financial projections. GAAP-compliant (ASC 230, ASC 360, ASC 470). ~1,100 source files, 4,536+ tests across 187+ files. 15-phase verification pipeline.

> **Rebecca** is the sole AI assistant. The chatbot uses Pinecone RAG across 7 namespaces with entity-aware context.

---

## Core Differentiators (Priority Order)

1. **Calculation Accuracy** — GAAP-compliant, independently verifiable, users choose this over Excel
2. **Research Engine Breadth & Precision** — Entity-aware, multi-source, comparable-set-driven. The unfair advantage.
3. **Scenario Handling** — Compare, save, drift-detect, reproduce
4. **Renders & Photo Handling** — AI-generated images, premium investor-ready exports
5. **Knowledge Completeness** — Rebecca chatbot, RAG tooltips, help system. Users learn by using.

---

## User Preferences

- Simple, everyday language. Ask clarifying questions before implementing — do not assume.
- **TOP PRIORITY: Financial accuracy always beats UI enhancements.** The proof system must always pass.
- Always format money as currency (commas, appropriate precision).
- Skills live in `.claude/skills/`. See `_index.md` for the master catalog.
- Company name is "Hospitality Business Group" (or "H+ Analytics" for the product).
- Update skills and manuals after every feature change.
- All UI components must reference a theme via the theme engine.
- **Button Label Consistency:** Always "Save" — never "Update". See `rules/ui-patterns.md`.
- **100% Session Memory:** Save decisions to `.claude/session-memory.md` at session end.
- **Every financial line item** should have a ? tooltip (HelpTooltip or InfoTooltip).
- **Every page must be graphics-rich** — charts, animations, visual elements required.
- **Context reduction is mandatory.** Every refactor must produce skills, helpers, scripts.
- **Premium design, always.** $50K+ bespoke financial platform feel. See `rules/design-standards.md`.
- **Always update claude.md after every task.** Mandatory — no exceptions.
- **Always update session-memory.md after every task.** Track decisions and state changes.

---

## Project Structure

```
engine/          Pure financial calculation engine (no I/O) — 22 files
calc/            Standalone calculation modules — 78 files
server/          Express API, storage, AI, exports — 294 files
client/          React 18 frontend — 702 files
shared/          Types, constants, schemas — 36 files
tests/           Test suites (golden, proof, engine, server) — 194 files
docs/            Architecture, developer guide, research, planning
.claude/         AI knowledge base (skills, rules, tools, manuals)
```

**Key directories:**
- `engine/property/property-engine.ts` — Core monthly financial projection
- `engine/property/resolve-assumptions.ts` — Assumption resolution cascade
- `server/ai/` — Research engines, Rebecca context, Pinecone indexing
- `server/report/` — Export data assembly, report compiler
- `shared/constants.ts` — All named financial constants (DB-backed with fallbacks)
- `shared/schema/` — Drizzle ORM schema (single source of truth)

---

## Context Loading Protocol

With 170 skill files across 17 domains, **never load all skills at once**. Use `.claude/skills/_index.md` for the master catalog.

Quick rules:
- **Financial calc** → specific finance skill + `rules/audit-persona.md` + `proof-system/SKILL.md`
- **UI/visual** → `component-library/SKILL.md` + `ui/theme-engine.md` + specific UI skill
- **Testing** → `testing/SKILL.md` + relevant sub-skill only
- **Research** → `research/` + specific sub-skill
- **Cross-domain** → 2–4 skills max per domain

---

## Skill Router

| Domain | Skill Path | What It Covers |
|--------|-----------|---------------|
| Skill Index | `.claude/skills/_index.md` | Master catalog of all 168 skills by domain |
| Architecture | `.claude/skills/architecture/SKILL.md` | Tech stack, two-entity model, file organization |
| Architecture extras | `.claude/skills/architecture/*.md` | Codebase map, multi-tenancy, server finance, tool schemas, source map, API routes, property lifecycle, source health |
| Business Model | `.claude/skills/business-model/SKILL.md` | Dual-entity model, revenue streams, USALI waterfall, management fees, SAFE funding |
| Finance (25 skills) | `.claude/skills/finance/` | IS, CF, BS, IRR, DCF, fees, funding, scenarios, constants, diagnostics |
| Research (29 skills) | `.claude/skills/research/` | Market, ADR, occupancy, cap rate, ICP, STR properties, property finder, market intelligence |
| UI (54 skills) | `.claude/skills/ui/` | Graphics, animation, entity cards, interactions, navigation, charts, mobile, 3D, tour, forms |
| Admin (9 skills) | `.claude/skills/admin/` | 16-section shell, components, settings, API routes |
| Testing (10 skills) | `.claude/skills/testing/` | Per-statement test coverage, conventions, golden scenarios |
| Proof System | `.claude/skills/proof-system/SKILL.md` | 4,536+ tests, 583 golden values, 15-phase verification, release checklist |
| Exports (8 skills) | `.claude/skills/exports/SKILL.md` | PDF, Excel, PPTX, PNG, CSV, premium export spec |
| Database | `.claude/skills/database/SKILL.md` | Drizzle ORM, migrations, sync |
| Rebecca Chatbot | `.claude/skills/rebecca-chatbot/SKILL.md` | RAG, Super Conversations, Knowledge Base, Guardrails, Rich Blocks |
| Integrations | `.claude/skills/integrations/SKILL.md` | AI providers, geospatial, document intelligence, observability |
| Design System | `.claude/skills/design-system/SKILL.md` | Colors, typography, component catalog, CSS classes |
| Component Library | `.claude/skills/component-library/SKILL.md` | PageHeader, GlassButton, ExportMenu |
| Coding Conventions | `.claude/skills/coding-conventions/SKILL.md` | Naming, formatting, context reduction, error handling, type contracts |
| Product Vision | `.claude/skills/product-vision/SKILL.md` | Product identity, design tenets, workflow, navigation, roles |
| Rules (22) | `.claude/rules/` | All behavioral constraints |

---

## Revenue Model

Revenue streams are percentages of **total revenue** (not room revenue):

```
totalRevenue = roomRevenue / (1 - eventsShare - fbShare - otherShare)
```

| Stream | Default Share of Total | Formula |
|--------|----------------------|---------|
| Room Revenue | 49% | Rooms × ADR × Occupancy × 30.5 days |
| F&B Revenue | 30% | totalRevenue × fbShare |
| Event Revenue | 18% | totalRevenue × eventsShare |
| Other Revenue | 3% | totalRevenue × otherShare |

**Luxury Rental (per_property):** `nightlyPropertyRate × daysPerMonth × occupancy` (whole-property pricing)

**Advanced features:**
- **Seasonality**: 12 monthly multipliers on occupancy (capped at 1.0) and ADR (uncapped)
- **Occupancy Ramp Curves**: Annual fractions of stabilized occupancy, overrides step function
- **Owner's Priority Return**: Cumulative owner cash flow must exceed hurdle × equity before incentive fees
- **Fee Subordination**: "full" defers all fees, "partial" defers only incentive when cash < debt service

---

## Engine Chain

```
gop = revenue − opex
agop = gop − feeBase − feeIncentive
noi = agop − expenseTaxes
anoi = noi − expenseFFE
```

Balance Sheet Identity: `A = L + E` must hold within $1.

---

## Testing & Proof System

| Level | Domains | Skill |
|-------|---------|-------|
| Individual Property | IS, CF, BS, trial balance, reconciliation, ASC 230 | `testing/property-statements.md` |
| Consolidated Portfolio | Aggregation, eliminations, portfolio IRR | `testing/consolidated-statements.md` |
| Management Company | Company pro forma, fee linkage, funding | `testing/management-company.md` |
| Returns Analysis | IRR, NPV, MOIC, sensitivity | `testing/analysis-returns.md` |
| Golden Scenarios | 4 archetypes + 16 edge cases, hand-calculated | `testing/golden-scenarios.md` |

**Commands**: `npm test` (4,536+ tests) · `npm run verify` (15-phase GAAP) · `npm run health` (tsc+tests+verify)

---

## Export System

- **Unified Report Compiler**: `server/report/compiler.ts` → `ReportDefinition` IR → 5 format renderers
- **Premium Export**: `POST /api/exports/premium` — PDF, PPTX, DOCX, XLSX, PNG. No LLM calls.
- **Reproducibility Lock**: `computeRef` triggers server-authoritative pipeline with SHA-256 hash headers
- **Scenario Snapshots**: `scenario_results` table stores immutable computed artifacts with drift detection
- **Property Profile**: Quality tier, business model, pricing model, descriptors, fee structure in exports
- **Deferred Fees**: Shown when fee subordination is active

See `.claude/skills/exports/SKILL.md` for full reference.

---

## Storage Architecture

| Store | What | Why |
|-------|------|-----|
| PostgreSQL (Neon) | Properties, scenarios, users, assumptions, research, market rates | Relational integrity, ACID |
| Pinecone `knowledge-base` | Document chunks, methodology, platform guide | RAG for Rebecca |
| Pinecone `research-history` | Research result summaries, property context | "Similar properties" retrieval |
| Pinecone `assumption-guidance` | Vectorized guidance records | Rebecca Q&A on research |

**Rule**: SQL is the system of record; Pinecone is the semantic index.

---

## Key Rules

- **Calculations always highest priority** — never compromise financial accuracy for visuals
- **No raw hex in components** — use CSS variable tokens
- **All buttons GlassButton**, all pages PageHeader, all exports ExportMenu
- **No mock data** in production paths
- **Finance changes must state Active Skill** and pass verification (UNQUALIFIED)
- **Rebecca must NEVER compute financial values** — all data from the calculation engine
- **Balance Sheet Identity**: A = L + E within $1. Cash derivation uses `m.anoi` (never `m.noi`)
- **LLM dual-model config** — primary + fallback per domain (7 domains). Admin-configured only.
- **Settings placement** — Two surfaces: Company Assumptions (entity config), Admin panel (system config)
- **ICP = Profile + Research Center** — two separate pages
- **Resend replaces SendGrid** for all transactional email
- **Properties NEVER hard deleted** -- soft delete via archivedAt. Admin can archive/restore. See `docs/architecture/property-portfolio-model.md`.
- **Property listing uses userDefaultProperties** -- users see assigned properties, not just created ones. Admin assigns via toggles.
- **Source health before research** -- research prompts only reference healthy sources. `getHealthySources()` before prompt building.
- **Defaults cascade** -- model -> country -> quality tier -> scale adjustment. `computePropertyDefaults()` in engine/helpers/.

---

## Infrastructure

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts |
| Backend | Express 5, TypeScript, Drizzle ORM |
| Database | PostgreSQL (Neon or self-hosted) |
| Vector DB | Pinecone (7 namespaces) |
| AI/LLM | Anthropic Claude, Google Gemini, OpenAI (direct API keys) |
| Object Storage | S3-compatible (AWS S3, Cloudflare R2, or local) |
| Auth | Express sessions + configurable OAuth |
| Monitoring | Sentry, PostHog, Upstash Redis |
| Email | Resend |
| Exports | @react-pdf/renderer, pptxgenjs, xlsx |

---

## User Roles

| Role | Access |
|------|--------|
| `admin` | Full — all pages + Admin Settings |
| `user` | Management-level — no Admin panel |
| `checker` | User + verification tools |
| `investor` | Limited — Dashboard, Properties, Profile, Help |

---

## Governed Model Constants (DB-Backed)

`DEPRECIATION_YEARS` (39) and `DAYS_PER_MONTH` (30.5) are DB-backed with constant fallbacks. Cascade: `property.depreciationYears → global.depreciationYears → DEPRECIATION_YEARS constant (39)`. Editable in Company Assumptions under "Model Constants". The useful life varies by country (see `shared/countryDefaults.ts`). Calculation METHOD always follows US GAAP (ASC 360, straight-line); only the period changes.

---

## Quick Commands

```bash
npm run dev            # Start dev server (port 5000)
npm run health         # tsc + tests + verify (~60s)
npm run test:summary   # All 4,536+ tests (~35s)
npm run verify:summary # 15-phase financial verification (~25s)
npm run lint:summary   # TypeScript check only (<10s)
npm run stats          # File/line/test counts (<5s)
npm run audit:quick    # Code quality: 13 guardrail checks (<3s)
npm run exports:check  # Unused export detection (<5s)
npm run db:push        # Push schema changes
npm run test:file -- <path>  # Single test file
```

---

## Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| Architecture Overview | `docs/architecture/system-overview.md` | System layers, data flow, entity model |
| Developer Setup | `docs/developer/setup.md` | Local dev environment |
| Migration Guide | `docs/developer/migration-from-replit.md` | Replit → standalone |
| Master Plan V2 | `docs/planning/MASTER-PLAN-V2.md` | Product roadmap (Phases 8-13) |
| Research Docs | `docs/research/` | Hospitality benchmarks, APIs, fee structures |
| Skill Catalog | `.claude/skills/_index.md` | All 168 skills indexed by domain |

---

## Recent Changes (April 13, 2026)

**Source Verification & Property Portfolio (April 13, 2026):**
- Soft delete for properties (archivedAt, never hard delete)
- Property listing via userDefaultProperties join (admin assigns to users)
- Source registry: 21 sources seeded, health checker with EMA success rate
- Source-aware prompts: dynamic source block, confidence degradation
- computePropertyDefaults: 4-layer cascade (model -> country -> tier -> scale)
- computeStressScenarios: 5 deterministic stress tests with DSCR breach detection
- Risk intelligence engine: deterministic + LLM investor-grade narratives
- Domain preamble in all research prompts (boutique hospitality, fundraising context)

**MASTER-PLAN Phases 0-7 Complete.** Key highlights from the final sprint:
- F&B revenue model changed from "% of room revenue" to "% of total revenue"
- Luxury rental pricing model (per_property), seasonality, occupancy ramp curves
- Owner's priority return and fee subordination in engine
- 4 golden scenario archetypes + 16 edge case tests
- FRED API (6 new series), entity-aware research prompts, Pinecone enrichment
- Rebecca screen context, proactive suggestions, enhanced greeting
- Export scope selector, property profile in PDF/PPTX, seasonality charts

**Phase 8.1 — Provider Abstraction Layer:**
- Created `server/providers/` with `StorageProvider` (10 methods) and `AuthProvider` interfaces
- `ReplitStorageProvider` and `ReplitAuthProvider` wrap existing code (zero behavior change)
- `S3StorageProvider` stub ready to fill when migrating, `LocalAuthProvider` for password-only mode
- Rewired 12 consumer files: uploads, image pipeline, document-ai, scripts, scenarios, index
- `getAppUrl()` replaces `REPLIT_DOMAINS` with fallback chain. `.env.example` created.
- **To move off Replit:** fill S3 stub, set env vars, deploy. See `docs/developer/migration-from-replit.md`

**Codebase Reorganization:**
- `.agents/skills/` archived (55 Replit-specific skills → `.claude/archive/`)
- 28 satellite skill directories merged into 17 domain directories
- Marcela/ElevenLabs/Twilio references scrubbed across 22 files
- New Master Plan V2, architecture docs, developer setup, migration guide
- Skills master index created (`_index.md`)
- README de-Replitified for standalone deployment
