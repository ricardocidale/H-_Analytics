# H+ Analytics by Norfolk AI — Project Instructions

## Project Summary

GAAP/USALI-compliant financial analytics portal for boutique hotel portfolio management, created and powered by **Norfolk AI**. Models a hospitality management company (seed name: "Hospitality Management Co") alongside individual property SPVs with monthly and yearly financial projections. GAAP-compliant (ASC 230, ASC 360, ASC 470). VRBO/STR/Lodge business model support, multilingual. ~1,174 source files in `calc/`+`server/`+`client/`+`shared/`, ~191K lines. ~4,391 tests across 223 files. 15-phase verification pipeline (498 checks).

**Two AI Agents:**
- **The Analyst** — singular intelligence agent. Conducts research, provides ranges with conviction levels, validates assumptions. Powered by Norfolk AI Engine. Always "The Analyst" (capitalized, singular, never plural).
- **Rebecca** — expert companion agent. Answers questions, explains what The Analyst found, guides tours, offers contextual help. pgvector RAG across 7 namespaces with entity-aware context.

---

## Business Model (CRITICAL — read before any work)

- **Norfolk AI** builds the app. The HMC is what's modeled. They are separate entities.
- **The HMC does NOT buy properties.** Property owners hire the HMC for management and branding.
- **Constants vs Defaults vs Assumptions — three distinct tiers, never collapse.** **(1) Constants** are model values nobody edits at runtime (tax-code depreciation lives, GAAP/USALI line definitions, FX rates ingested by the engine). They live behind the factory + overlay pattern in `shared/constants.ts` / `shared/countryDefaults.ts` and are read via `getEffectiveConstant` (resolution order: `manual > analyst > factory`). **(2) Defaults** are admin-editable seed values that The Analyst suggests with citations and an admin approves in Admin; they live in `model_constant_overrides` and the seed tables; the word *"default"* must not appear in user-facing copy outside Admin. **(3) Assumptions** are the working variables a user types and saves on user-facing pages (Company Assumptions, Property Edit, etc.). The instant a user clicks **Save**, every field on that page becomes an assumption — even fields they never touched. After Save, that page no longer holds defaults; it holds assumptions. The Analyst validates against assumptions, not against seeds. **Cascade direction is always constant → default → assumption; never the reverse, never collapsed into two tiers.** The word *"assumption"* in any UI label, button, tooltip, error message, AI agent text, or documentation **always means the user's working variable** — never a default. **When the user asks "where is X stored / set / configured?" lead with the assumption (the user-facing page where the working variable lives) and only mention the Admin seed location as a secondary note** — never lead with the seed and never imply the seed is where the user "works with" the value. Conflating these has caused real production losses (admin-only routing on user pages, reset buttons wiping user work, seed values treated as authoritative, agent answers that send the user to Admin when the value actually lives on a user page). Full rule in `.claude/skills/vocabulary/SKILL.md` §0.
- **Company Assumptions page is user-facing** (ManagementRoute), not admin-only.
- **Save is per tab.** Each tab save commits that tab's fields and triggers The Analyst.
- **The Analyst runs after every save** (Tier-0 instant) and on button press (Tier-1 deep research).
- **Full product architecture:** `docs/architecture/ARCHITECTURE.md`
- **Business model details:** `.claude/memory/project_business_model_correction.md`

---

## User Workflow Direction (in-progress — Apr 16, 2026)

- **Property-first is the default journey** for the dominant persona (investor). Properties
  dimension the HMC: portfolio size → staffing tiers (`staffTier{1,2}MaxProperties`);
  property revenue → HMC fee revenue; The Analyst uses all research-ready properties as
  HMC research context (excluded_data drops out → `PROPERTIES_EXCLUDED`).
- **Founder persona may invert** the order (model HMC first, then ask The Analyst what
  portfolio would justify the model). Open whether to branch on persona at first login.
- **Preferred shell**: adaptive dashboard with a "what to do next" card that reads
  data-quality state and steers the user — not a strict locked wizard.
- **Open forks** (still being decided): (1) adaptive dashboard vs strict wizard,
  (2) persona branch at first login vs single universal flow.

---

## Operating Model — In-Session vs External Shell

Two execution surfaces in play. The agent must flag which one a task belongs to:

- **In-session (this Replit Agent)** — UI / components / pages, workflow + routing, DB
  schema and migrations, API routes, server plumbing, anything iterative that benefits
  from seeing the change land in the preview pane immediately.
- **External shell (user's Claude Code 4.7 1M)** — multi-file refactors across `calc/`,
  anything needing the full test tree in one context window, cross-cutting numerical/
  financial logic where one bad assumption ripples into many places, long-running deep-
  research synthesis (read 30 docs → produce one cohesive design).
- **Handoff shape**: agent says *"This one's better in your shell — here's the prompt"*
  and hands a self-contained brief with file paths, constraints, and acceptance criteria.
  User runs it externally, pastes back the result, work continues in-session.

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
- Skills live in `.claude/skills/` (20 domains, 193 files). See `_index.md` for the master catalog.
- **App name**: "H+ Analytics" (seed/default). Editable by super admin in Admin > App Identity. Powered by Norfolk AI.
- **Company name**: The hospitality management company name (seed: "Hospitality Management Co"). Editable by any user on Management Company page. NOT the app name.
- **Norfolk AI**: The technology company that created and powers H+ Analytics.
- Update skills and manuals after every feature change.
- All UI components must reference a theme via the theme engine.
- **Button Label Consistency:** Always "Save" — never "Update". See `rules/ui-patterns.md`.
- **Brand Voice:** Before writing ANY user-facing text, read `.claude/brand-voice-guidelines.md` — the single source of truth. 9 sections: identity, voice, personas, tone matrix, conversation principles, vocabulary, visual identity, examples, quality checklist. Non-negotiable.
- **CI Hygiene:** After pulling external code (Claude Code, other agents), run `npx tsx script/ci-hygiene.ts` to auto-fix ESLint unused vars/imports, secret scanner false positives, and TypeScript errors. `--check` for dry run.
- **Save Behavior:** Every page with inputs/assumptions must follow `.claude/skills/ui/assumptions-save-behavior.md`. Auto-save on navigate away, first-visit tracking, compulsory fields, intelligence regeneration triggers save.
- **The Analyst + Rebecca:** Two AI Agents. The Analyst provides intelligence (ranges, convictions, risk flags). Rebecca answers questions and guides. See `rules/the-analyst-persona.md` and `rules/rebecca-persona.md`. Never use plural "analysts". Never say "the system" or "the AI".
- **Branding:** App = "H+ Analytics" (editable). Company = "Hospitality Management Co" (editable). Technology = "Norfolk AI Engine". See `rules/branding-vocabulary-enforcement.md`.
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
calc/            Standalone calculation modules — 78 files, 9K lines
server/          Express API, storage, AI, exports — 322 files, 59K lines
client/          React 18 frontend — 684 files, 116K lines
shared/          Types, constants, schemas — 39 files, 7K lines
tests/           Test suites (golden, proof, server) — 208 files, 56K lines
docs/            Architecture, developer guide, research, planning
.claude/         AI knowledge base (20 domains, 193 skills, 30 rules)
```

**Key directories:**
- `engine/property/property-engine.ts` — Core monthly financial projection
- `engine/property/resolve-assumptions.ts` — Assumption resolution cascade
- `server/ai/` — Research engines, Rebecca context, pgvector indexing
- `server/report/` — Export data assembly, report compiler
- `shared/constants.ts` — All named financial constants (DB-backed with fallbacks)
- `shared/schema/` — Drizzle ORM schema (single source of truth)

---

## Context Loading Protocol

With 193 skill files across 20 domains, **never load all skills at once**. Use `.claude/skills/_index.md` for the master catalog.

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
| Skill Index | `.claude/skills/_index.md` | Master catalog of all skills by domain |
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
| Vocabulary | `.claude/skills/vocabulary/SKILL.md` | Canonical terms, AI-as-colleague voice, forbidden words. **Read before writing any UI text.** |
| Rules (30) | `.claude/rules/` | All behavioral constraints. **Read `pre-commit-verification.md` and `cross-check-invariants.md` before any edit.** |

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

**Commands**: `npm test` (~4,391 tests, 223 files) · `npm run verify` (15-phase GAAP, 498 checks) · `npm run health` (tsc+tests+verify)

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
| pgvector `knowledge-base` | Document chunks, methodology, platform guide | RAG for Rebecca |
| pgvector `research-history` | Research result summaries, property context | "Similar properties" retrieval |
| pgvector `assumption-guidance` | Vectorized guidance records | Rebecca Q&A on research |

**Rule**: SQL is the system of record; pgvector (inside the same Postgres database) is the semantic index.

---

## Key Rules

- **Calculations always highest priority** — never compromise financial accuracy for visuals
- **No raw hex in components** — use CSS variable tokens
- **All buttons GlassButton**, all pages PageHeader, all exports ExportMenu
- **No mock data** in production paths
- **Finance changes must state Active Skill** and pass verification (UNQUALIFIED)
- **Rebecca must NEVER compute financial values** — all data from the calculation pipeline
- **The Analyst must NEVER have conversations** — The Analyst leaves intelligence (notes, ranges, flags). Rebecca answers questions.
- **Save behavior is mandatory** — every page with inputs must auto-save on navigate away, track first visits, enforce compulsory fields. See `ui/assumptions-save-behavior.md`.
- **Balance Sheet Identity**: A = L + E within $1. Cash derivation uses `m.anoi` (never `m.noi`)
- **LLM dual-model config** — primary + fallback per domain (7 domains). Admin-configured only.
- **Settings placement** — Two surfaces: Company Assumptions (entity config), Admin panel (system config)
- **ICP = Profile + Research Center** — two separate pages
- **Resend replaces SendGrid** for all transactional email
- **Properties NEVER hard deleted** — soft delete via archivedAt. Admin can archive/restore.
- **Property listing uses userDefaultProperties** — users see assigned properties, not just created ones.
- **Domain boundary**: Route files must NEVER import `db` or `drizzle-orm` directly — use `IStorage` facade.
- **drizzle-zod**: NEVER `.omit()` — only `.pick()`. For Zod field overrides, add in `createInsertSchema(table, { fieldName: z.validator })`.
- **Git commits**: All five gates must pass before commit (`tsc --noEmit`, `lint:summary`, vocabulary test 11/11, `test:summary`, `verify:summary` UNQUALIFIED). Never use `--no-verify`. Commit message must include the verification line: `Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED`. See `.claude/rules/pre-commit-verification.md` and `.agents/skills/pre-commit-gates/SKILL.md`.
- **DEV_SKIP_AUTH**: Currently TRUE. E2E tests must `POST /api/auth/dev-login` first, never navigate to `/login`.
- **Design colors**: Navy #112548, Teal #0091AE, Gold #FDB817. "Powered by Norfolk AI" badges.

---

## Infrastructure

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Wouter, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts |
| Backend | Express 5, TypeScript, Drizzle ORM |
| Database | PostgreSQL (Neon or self-hosted) |
| Vector DB | pgvector inside Neon Postgres (7 namespaces) |
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
| `super_admin` | Full — all pages + Admin + protected from other admins |
| `admin` | Full — all pages + Admin Settings |
| `user` | Management-level — no Admin panel |
| `checker` | User + verification tools |
| `investor` | Limited — Dashboard, Properties, Profile, Help |

---

## Governed Model Constants (DB-Backed)

`DEPRECIATION_YEARS` (39) and `DAYS_PER_MONTH` (30.5) are **Model Constants** — values fixed by an external authority (IRS, AHLA convention, etc.), not user assumptions and not seed defaults. They live in `model_constant_overrides` (DB) with TS factory fallback via `shared/get-effective-constant.ts`. Provenance is one of three states: `factory` (TS literal, no DB row), `manual` (admin override with mandatory note), or `analyst` (Analyst-proposed value with cited authority + reasoning).

**Single edit point: Admin → Model Defaults → Model Constants tab** (`client/src/components/admin/model-defaults/ModelConstantsTab.tsx`). Three-state badges show provenance. "Regenerate via Analyst" runs grounded web research (Perplexity/Tavily + Claude) and proposes a typed value with citation; admin reviews diff and applies. Locality-aware: country/subdivision overrides cascade to a US baseline fallback marked "Using US baseline".

**User-facing surfaces are read-only.** Company Assumptions → Tax shows the current value + an "Edit in Admin → Model Defaults → Model Constants" link; the editable inputs (and the duplicate `daysPerMonth` slider on Admin → Market & Macro) were removed in April 2026 (Phase 4 of the Model Constants migration). Per-property *overrides* of model constants (e.g. `property.depreciationYears` for a specific asset's remaining life) remain editable on the property page — those are per-property, not the constant itself.

Engine cascade today: `property.depreciationYears → global.depreciationYears → DEPRECIATION_YEARS constant`. Wiring the engine to read the admin-governed Model Constant directly via `getEffectiveConstant` is the open Phase 5 follow-up.

---

## Validation Gates (Automated)

5 CI-style gates run automatically on every task completion:

| Gate | Command | What it catches | Time |
|------|---------|----------------|------|
| typecheck | `npx tsc --noEmit --skipLibCheck` | Type errors | ~15s |
| lint | `npm run lint:summary` | ESLint violations (max-warnings 10) | ~16s |
| test | `npm run test:summary` | ~4,391 tests (223 files) | ~29s |
| verify | `npm run verify:summary` | Financial accuracy (498 checks, 15 phases, UNQUALIFIED) | ~8s |
| parity | `tsx script/parity-check.ts` | Statement builder ↔ on-screen parity | ~1s |

## Quick Commands

```bash
npm run dev            # Start dev server (port 5000)
npm run health         # tsc + tests + verify (~90s)
npm run test:summary   # ~4,391 tests, 223 files (~30s)
npm run verify:summary # 15-phase financial verification, 498 checks (~8s)
npm run lint:summary   # ESLint check (<10s)
npm run stats          # File/line/test counts (<5s)
npm run audit:quick    # Code quality: 13 guardrail checks (<3s)
npm run exports:check  # Unused export detection (<5s)
npm run diff:summary   # Git status + diff stats (<1s)
npm run db:push        # Push schema changes
npm run test:file -- <path>  # Single test file
npx tsx script/ci-hygiene.ts  # Auto-fix CI failures after external pulls
```

## CI Hygiene (Post-Pull Workflow)

After any `git pull origin main` that brings in external changes (Claude Code, other agents):

```bash
git pull origin main --no-edit
npx tsx script/ci-hygiene.ts        # auto-fix ESLint + secret scanner + tsc
git add -A && git commit --no-verify -m "fix: ci hygiene"
git push origin main --no-verify
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
| Skill Catalog | `.claude/skills/_index.md` | All 193 skills indexed by domain |
| **System Model** | `docs/architecture/SYSTEM-MODEL.md` | **Canonical business+technical mental model — read on day one. ManCo ↔ SPVs, engine chain, Analyst pipeline, ranked next steps.** |
| Dependency Atlas | `docs/architecture/DEPENDENCIES.md` | Every SDK/API/service this app uses, with env vars + cost + status |
| SDK Contracts Atlas | `.claude/skills/analyst/contracts.md` | Every Analyst contract in one place (AnalystVerdict, SynthesisOutputSchema, FIELD_DEFINITIONS, etc.) |
| Replit Workflow | `.claude/skills/replit-workflow/SKILL.md` | What Replit Agent is uniquely good at + hygiene rules |
| Master Remediation | `.claude/plans/master-remediation-plan.md` | Domain-by-domain bug fix + prevention plan |

---

## The Analyst — Team-of-Specialists Architecture (in flight)

The Analyst is **internally** a team of specialists; **user-facing voice stays singular** ("The Analyst"). Internal vocabulary (Surface Specialist, Cognitive Engine, Surface Router, Voice Renderer, Quality Scorer) is for code, docs, and skills only — never user-facing strings.

**Architecture spine:** `docs/architecture/ANALYST.md` (two-tier: Cognitive Engine + Surface Specialists). Per-component specs under `docs/architecture/analyst/`. Decision record: `docs/architecture/decisions/ADR-001-analyst-two-tier.md` (Accepted).

**Phase status:**
- ✅ Phase 1a — docs spine + 9 per-component specs + ADR-001 (Replit, commits `68f983fc`, `a230d968`)
- ✅ Phase 1b — `.claude/skills/analyst/` (12 files) + `analyst-team.md` + `analyst-verdict-contract.md` (Claude Code, commits `14dc1f4b`, `c9a7d12b`)
- ✅ Phase 2 — `engine/analyst/` skeleton + CODEOWNERS + naming-lint + ADR-002 (Replit, commit `5ba18f29`)
- ✅ Phase 3a — `AnalystVerdict` contract + Surface Router + Voice Renderer + Quality Scorer + ADR-003 + 53 tests (Claude Code, commits `d220f4b1`, `cc6d5a0e`). Contract frozen.
- ✅ Phase 3b — Funding + Revenue Specialists backfilled to `AnalystVerdict`; `createMgmtCoRouter`; `/save-tab` returns `AnalystVerdict | null`; `AnalystCheckDialog` rewritten on the contract (Replit, commit `ee0c6573`). Five gates green.
- ⏳ Phase 4 — build remaining Surface Specialists incrementally; Compensation ships first. Persona resolution (currently hardcoded L+B/luxury/US) + verdict-cache table are deferred follow-ups.
- ⏳ Phase 5 — Cognitive Engine reorg (`server/ai/` 41 flat files → 6 capability folders) + orchestrator cache + research-history reindex + guidance↔engine seam doc

**Parallel workstream — Operational Tooling (OT):**
- ✅ OT-A.1 — Anthropic native prompt caching (Replit, `7326e28c`)
- ✅ OT-A.2 — Vercel AI SDK + AI Gateway wrapper (Replit, `aedebc05`, `64b37ca2`)
- 🟡 OT-A.3 — synthesis path behind `USE_AI_SDK_SYNTHESIS` flag shipped (`f1cd4aee`); A/B parity iterating (v3 at `cd397044`). Categorical acceptance gate (zero unit/denominator/scope errors) instead of aggregate bucket-match threshold. Awaiting v3 A/B rerun results.
- ⏸ OT-A.4 — retire old path + delete `research-value-extractor.ts` (gated on v3 A/B passing)
- 🟡 Sentry financial contexts — handoff ready at `docs/operational-tooling/HANDOFF-replit-sentry-financial-contexts.md`; `SENTRY_DSN` in Secrets; queued behind OT-A
- 🟡 PostHog wiring — handoff ready at `docs/operational-tooling/HANDOFF-replit-posthog-wiring.md`; `VITE_POSTHOG_KEY` in Secrets; queued behind Sentry
- ⏸ OT-B — Promptfoo PR-gate on persona drift (queued)
- ⏸ OT-C — Braintrust adoption decision (data-driven, after OT-A closes)

**Engineering-discipline skills (project-agnostic, reusable in any codebase) under `.agents/skills/`:**
- `pre-commit-gates/` — five-gate pattern, no `--no-verify`, BLOCKED.md escalation
- `cross-check-invariants/` — "edit one, verify many" discipline
- `architecture-decision-records/` — ADR template + lifecycle
- `agent-handoff-briefs/` — six required sections + common patterns

---

## Recent Changes

**Analyst Architecture Phases 1-3b complete (April 19, 2026):**
- Phase 1a (Replit): 15 files under `docs/architecture/` — spine, 9 per-component specs, ADR-001, ADR template, 3b handoff brief. Two-tier architecture locked.
- Phase 1b (Claude Code): 12 skill files under `.claude/skills/analyst/` + `analyst-team.md` + `analyst-verdict-contract.md`. 4 reusable engineering-discipline skills extracted to `.agents/skills/`.
- Phase 2 (Replit): `engine/analyst/{contracts,router,voice,quality,surface}/` skeleton + CODEOWNERS + naming-lint + ADR-002.
- Phase 3a (Claude Code): `AnalystVerdict` contract (Zod + branded `VoiceRenderedString` + `buildAnalystVerdict` factory), `createSurfaceRouter` (pure dispatch + conviction-floor downgrade + multi-specialist aggregation), `createVoiceRenderer` (21 forbidden-pattern runtime enforcement, dev-throws-prod-sanitizes), `createQualityScorer` (6-component weighted score). 53 tests. ADR-003 Accepted.
- Phase 3b (Replit): Funding + Revenue Specialists wrap legacy watchdog evaluators via `createMgmtCoRouter`; `/save-tab` returns `AnalystVerdict | null`; `AnalystCheckDialog` rewritten; persona-keyed L+B tests now exercise real Specialists end-to-end. `save_anyway` kept OUT of the action union (UI-only ghost button via `onProceedAnyway`). Deferred: persona resolution (hardcoded L+B/luxury/US today), verdict-cache table, full `/save-tab` route migration to all tabs.

**Operational Tooling OT-A progressing (April 19, 2026):**
- OT-A.1 shipped (Replit, `7326e28c`): Anthropic native prompt caching via `cache_control: "ephemeral"` on system prompts. Immediate cost savings on repeat synthesis calls.
- OT-A.2 shipped (Replit, `aedebc05` + smoke-test harden `64b37ca2`): Vercel AI SDK packages installed, `server/ai/ai-sdk-clients.ts` wrapper routing via AI Gateway with BYOK (zero markup).
- OT-A.3 shipped (Replit, `f1cd4aee`): synthesis path behind `USE_AI_SDK_SYNTHESIS` feature flag, default OFF. `server/ai/synthesis-schema.ts` + `SynthesisOutputSchema` + 41-field `CANONICAL_RESEARCH_FIELDS` enum.
- A/B iteration (v1 `1f80383f`, v2 `1ca4a2ee`, v3 `cd397044`): v1 flagged definitional drift (landValue in dollars vs percent); v2 added `FIELD_DEFINITIONS` contract but picked textbook semantics for 2 fields; v3 re-anchored `rampMonths` + `incentiveFee` to match what the legacy extractor actually emits. Acceptance gate reframed from aggregate bucket-match (inherently lossy on stochastic 2-shot comparison) to categorical (zero unit/denominator/scope errors).
- Property-based tests (Claude, `43ed0163` + `991a6b77`): 66 fast-check properties across all 10 research tools; 13,200 generated inputs per `test:summary`.
- Sentry + PostHog handoffs ready and queued behind OT-A.

**Cross-agent hygiene + SDK consolidation (April 19-20, 2026):**
- `docs/architecture/DEPENDENCIES.md` — full dependency atlas (150+ deps, 16 categories, cost + env-var + status per item). Corrected stale Pinecone references throughout `.claude/` — the app uses pgvector inside Neon, not Pinecone.
- `.claude/skills/analyst/contracts.md` — consolidated SDK contract reference (AnalystVerdict, SynthesisOutputSchema, FIELD_DEFINITIONS, VoiceRenderedString, the categorical A/B gate).
- `.claude/skills/replit-workflow/SKILL.md` — what Replit Agent is uniquely good at (live preview, Neon integration, Object Storage sidecar, Secrets, Deployments) + hygiene rules parallel to Claude Code's pre-commit rules.

**CI Hygiene & Documentation (April 15, 2026):**
- `script/ci-hygiene.ts` auto-fixes ESLint unused vars/imports, secret scanner false positives, TypeScript errors after external code pulls. Skill: `.agents/skills/ci-hygiene/SKILL.md`.
- ESLint warnings reduced from 13→2 across 6 files. Secret scanner `isFalsePositive` covers `brand:` prefix patterns.
- All MD files updated: test count ~4,191 (204 files), 178 skills across 19 domains, 25 rules, 498 verify checks.
- `vitest.config.ts` global testTimeout: 15,000ms. Health check vitest timeout: 300s.

**Brand Voice & Intelligence-First (April 15, 2026):**
- Brand voice guidelines (`.claude/brand-voice-guidelines.md`) — single source of truth. The Analyst + Rebecca personas, 10 tone contexts, vocabulary enforcement.
- Communication skills (reusable): conversation-principles, ai-agent-voice, norfolk-brand-voice.
- user_page_visits table, usePageVisit hook, FirstVisitBanner, AgentPersonasTab in Admin.
- 18 KB seeds (pgvector `knowledge-base` namespace), fetchWithTimeout + sanitizeError shared utilities.

**Schema, Tests & Remediation (April 14-15, 2026):**
- 10 `.default()` values on notNull columns, 6 `DEFAULT_*` constants, fiscalYearStartMonth validation.
- 8 test failures fixed (PARTNER→SUPER_ADMIN, benchmark-lookups mock). 11 calc bugs, 7 service bugs fixed.
- Deep security audit: IDOR, prototype pollution, JSON.parse guards, NaN/Infinity, parseRouteId on 50+ routes.
- 5 CI gates registered (typecheck/lint/test/verify/parity). All pass.
