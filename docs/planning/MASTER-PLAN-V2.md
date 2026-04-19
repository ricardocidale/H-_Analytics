# H+ Analytics — Master Plan V2

> **Platform Migration & Product Excellence**
> Phases 8-13 | April 2026 onward

---

## How to Use This Plan

This document governs the next six phases of H+ Analytics development. Phases 0-7 are complete and archived in `MASTER-PLAN.md`.

**Rules for agents and developers:**

1. **Phases are sequential.** Do not start Phase 9 until Phase 8 is production-ready. Each phase builds on infrastructure from the previous one.
2. **Tasks within a phase can be parallelized.** Tasks numbered 8.1, 8.2, 8.3 etc. are independent unless noted. Multiple developers or agents can work on them simultaneously.
3. **Read before writing.** Before starting any task, read this plan, the relevant `.claude/skills/` files, and any files listed in the task description.
4. **One task at a time per agent.** Feed a single task with explicit file paths. Do not batch multiple tasks into one prompt.
5. **Test after every task.** Run `npm test` and `npm run verify` before committing. Financial accuracy always beats velocity.
6. **Update documentation.** After completing a task, update `.claude/claude.md` and any affected skill files.

**Tool assignment (post-migration):**

| Tool | Best For | Avoid For |
|------|----------|-----------|
| **Claude Code (CLI)** | Engine math, backend logic, tests, schema migrations, research prompts, skills, documentation | Large UI overhauls |
| **Cursor + Claude Code** | Full-stack development with live preview, UI components, visual work | Isolated backend math |
| **GitHub Actions CI** | TypeScript check, test suite, build verification | Manual testing |

**The rule:** CLI touches the math and the data. Cursor touches the screen. CI enforces the gates.

---

## App Identity

**H+ Analytics** (Hospitality Business Group) is a fundraising intelligence platform for boutique hospitality. It is NOT an operating system. It challenges assumptions like an investor would.

The platform models two financial entities:
1. **The Management Company (ManCo)** -- builds a hospitality brand focused on vertical communities (wellness, sexual wellness, corporate retreats, health/healing). Earns management fees from every property.
2. **Each Property (SPV)** -- independent real estate investment with its own investors, capital structure, and debt. Large residential estate converted to boutique hotel, operated under the brand, exited at a gain.

Two property models: **Hotel** (ADR x rooms x occupancy, 50/50 rooms/F&B split) and **Luxury Rental** (per-property-per-night pricing, capacity-based).

Portfolio: Medellin (luxury rental), Cartagena (hotel), New York State (2 hotels), Utah (1 hotel).

---

## Core Differentiators

These are listed in priority order. This is what keeps the app alive and what separates it from a spreadsheet.

### 1. Calculation Accuracy

All financial statements must be GAAP-compliant and independently verifiable. The three-tier proof system (server-side independent recalculation, client-side GAAP auditor, AI methodology review) produces audit opinions following standard audit language. 4,536+ tests across 187 files. Users choose this over Excel because they trust the numbers.

### 2. Research Engine Breadth and Precision

The unfair advantage. Entity-aware, multi-source, comparable-set-driven research engines supply the judgment that a human hospitality analyst would need years of experience to have. When someone enters "20-room boutique wellness hotel on 50 acres in the Catskills," the engines understand what that means financially. Without them, this is just Excel with a nicer UI.

### 3. Scenario Handling

Compare, save, drift-detect, reproduce. Scenario versioning with hash-based integrity. Computed snapshot persistence. Engine-version-aware drift detection. Golden scenarios as regression anchors.

### 4. Renders and Photo Handling

AI-generated property images, premium exports, investor-ready output. Branded PPTX/PDF/DOCX/XLSX with embedded charts, property profiles, and seasonality visualizations.

### 5. Knowledge Completeness

Rebecca chatbot with RAG across 7 pgvector namespaces. Contextual tooltips on every financial line item. Guided tours. Industry benchmark library. Users learn by using the platform.

---

## Completed Work (Phases 0-7)

All phases below are DONE. See `MASTER-PLAN.md` for full detail.

| Phase | Focus | Key Deliverables |
|-------|-------|-----------------|
| **0** | Foundation | Verification retention fix, dead flag removal, Marketing & Brand rename, VRBO F&B fix, documentation |
| **1** | Data Model | Quality tiers, property descriptors, user simplification (groups eliminated), DB-backed constants, business brand entity, country defaults expansion |
| **2** | Admin & UI | Admin sidebar restructure, component deduplication, per-user default scenarios, required fields config, branding polish |
| **3** | Financial Engine | F&B as % of total revenue (not rooms), luxury rental model, monthly seasonality curves, improved occupancy ramp, owner's priority return, fee subordination |
| **4** | Research Engines | FRED API integration, Damodaran data loader, source management system, range badge UX, entity-aware research context, pgvector RAG expansion |
| **5** | Testing | 4 golden scenario archetypes (Clearwater Inn, Medellin Duplex, Cartagena Hotel, NY Estate) + 16 edge cases, 4,536+ tests across 187 files |
| **6** | Rebecca AI | Screen context awareness, proactive suggestions, enhanced greeting, Super Conversations, email summaries, feedback system, knowledge base CRUD, guardrail editor |
| **7** | Exports | Scope selector, property profile in PDF/PPTX, seasonality charts, unified report compiler, premium PDF via @react-pdf/renderer, server-side export generation |

**Current codebase:** ~1,056 source files, ~174K lines, 4,536 tests, 191 skill files, 22 rule files.

---

## Platform Migration Context

The app was built entirely on Replit. Every Replit dependency must be abstracted behind a provider interface so the app runs anywhere.

| Replit Service | Current Integration | Target Replacement |
|---------------|--------------------|--------------------|
| Database (PostgreSQL/Neon) | `DATABASE_URL` auto-configured | Direct Neon connection or self-hosted PostgreSQL |
| Object Storage (GCS-backed) | Replit Object Storage API | AWS S3 / Cloudflare R2 / local filesystem |
| Authentication | Replit Auth (OpenID Connect) | Auth.js (NextAuth successor) or Lucia Auth or Clerk |
| Domains | `.replit.app` domain | Custom domain on Vercel / Railway / Fly.io |
| AI Integrations | Replit-managed API keys | Direct API keys for Anthropic, OpenAI, Google |
| Secrets | Replit Secrets | `.env` file + provider secret management |
| Deployments | Replit Deployments | Vercel / Railway / Fly.io |

---

## PHASE 8: Platform Independence

**Goal:** Abstract all Replit dependencies behind provider interfaces. The app runs on Replit today and anywhere tomorrow. When ready to move: flip env vars, fill in the S3 stub, deploy.

**Success criteria:** `npm run dev` works on any machine. `npm test` passes. `npm run verify` passes. Deploy succeeds on at least one non-Replit host.

### 8.1 Provider Abstraction Layer ✅ DONE (April 13, 2026)

Created `server/providers/` with interfaces and factory functions for storage and auth. All 12 consuming files rewired. Zero direct Replit imports in business logic.

**What exists:**
- `server/providers/storage/` — `StorageProvider` interface (10 methods), `ReplitStorageProvider` (wraps existing), `S3StorageProvider` (stub), factory with `STORAGE_PROVIDER` env var
- `server/providers/auth/` — `AuthProvider` interface, `ReplitAuthProvider` (wraps existing), `LocalAuthProvider` (password-only), factory with `AUTH_PROVIDER` env var
- `server/providers/config.ts` — `getAppUrl()`, `isReplit()`, provider name helpers
- `server/utils/batch.ts` — Platform-neutral re-export of batch processing utils
- `.env.example` — Complete env var template for standalone deployment

**AI keys are already direct** — `server/ai/clients.ts` reads `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` from env. Replit just auto-provides them. No abstraction needed.

### 8.2 Local Development Environment ⬜ TODO

**WHY:** Developers must be able to run the full stack locally without Replit.

**TASKS:**
- Create `docker-compose.yml` with PostgreSQL 16 and Redis 7.
- Create `scripts/setup-local.sh` — installs dependencies, runs migrations, seeds data.
- `.env.example` already exists (done in 8.1).
- Update `drizzle.config.ts` to work with local PostgreSQL.
- Add `npm run dev:local` script that starts server + client with local providers.

**TOOL:** Claude Code CLI

### 8.3 Implement S3 Storage Provider ⬜ TODO (do when ready to move)

**WHY:** Object Storage is the only Replit dependency that requires new code.

**TASKS:**
- Fill in `server/providers/storage/s3-storage.ts` (stub exists with TODO comments)
- Install `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
- Implement all 10 `StorageProvider` methods using S3 SDK
- Test with Cloudflare R2 (S3-compatible, no egress fees) or AWS S3
- Set `STORAGE_PROVIDER=s3` and verify uploads/downloads work

**TOOL:** Claude Code CLI | **Effort:** 2-4 hours

### 8.4 Deployment Configuration ⬜ TODO (do when ready to move)

**WHY:** The app needs to deploy somewhere that is not Replit.

**TASKS:**
- Create `Dockerfile` for production build (multi-stage: build + runtime).
- Create deployment configs for at least two providers:
  - `railway.toml` or `fly.toml` for container-based deployment.
  - `vercel.json` if pursuing serverless (may require architecture changes).
- Set up health check endpoint (`GET /api/health`).
- Configure custom domain with TLS.
- Set up GitHub Actions for CI/CD: lint, test, build, deploy on merge to `main`.

### 8.5 Post-Migration Cleanup ⬜ TODO (do after successful deployment)

**WHY:** Remove dead Replit code once it's no longer needed.

**TASKS:**
- Delete `replit.md`, `.replit`, `replit.nix`
- Delete `server/replit_integrations/` entirely
- Remove Replit CSP headers from `server/index.ts`
- Remove `REPL_ID` / `REPLIT_DOMAINS` fallbacks from `server/providers/config.ts`
- Move image routes from `server/replit_integrations/image/` to `server/routes/images/` (cosmetic — they're not Replit-specific)

**TOOL:** Claude Code CLI

### 8.6 ✅ pgvector-on-Neon (COMPLETED April 2026)

Migration from the managed vector DB to pgvector inside Neon Postgres shipped under `migrations/0012_pgvector_store.sql`. Vector store service at `server/ai/vector-store-service.ts`; indexing helpers at `server/ai/vector-indexing.ts`. All RAG retrieval and knowledge-base sync now run on pgvector. Historical cleanup of stale references across `.claude/`, `docs/`, and `README.md` completed April 20, 2026.

### 8.7 Database Migration Strategy

**WHY:** Need to move data from Replit-managed Neon to a self-managed database.

**TASKS:**
- Document the migration procedure (pg_dump/pg_restore or Neon branching).
- Create `scripts/migrate-database.sh` for data export/import.
- Test migration with a staging database.
- Add connection pooling configuration (PgBouncer or Neon's built-in pooler).
- Verify all Drizzle ORM operations work with the new connection.

**TOOL:** Claude Code CLI

---

## PHASE 9: Research Engine Excellence ✅ DONE (Backend Complete)

**Goal:** Make the research engines best-in-class. Expand sources, improve accuracy, add confidence scoring. This is the product's core differentiator.

**Depends on:** Phase 8 (direct AI API access).

**Status:** All backend work complete. Remaining UI tasks (benchmark admin tab, staleness dashboard, confidence badges) assigned to Replit T001-T007.

### 9.1 DB-Backed Benchmarks ✅ DONE (April 2026)

Hospitality benchmarks moved from hardcoded constants to database-backed tables. Admin can view, edit, and add benchmark data per segment, country, and metric type.

### 9.2 Country Expansion (11 to 17 Countries) ✅ DONE (April 2026)

Expanded country defaults from 11 to 17 countries. Tax rates, depreciation rules, and regulatory data seeded for all supported markets.

### 9.3 Staleness Detection ✅ DONE (April 2026)

Research results track `researched_at` timestamps. Configurable staleness thresholds per field type (ADR: 30 days, cap rate: 90 days, tax rate: 365 days). Re-research triggers for stale fields.

**Remaining UI:** Staleness dashboard for admin (Replit T004).

### 9.4 Confidence Scoring ✅ DONE (April 2026)

Confidence field (0-100) on all research results. Scoring factors: number of sources, source recency, geographic proximity, property type match. Low-confidence warnings when score < 50.

**Remaining UI:** Confidence badges on research range tooltips (Replit T005).

### 9.5 Web Research (Perplexity + Tavily) ✅ DONE (April 2026)

Integrated Perplexity and Tavily APIs for real-time web research. Research engines query live web data to supplement FRED, Damodaran, and DB-backed benchmarks.

### 9.6 Web-Enriched Comparables ✅ DONE (April 2026)

Comparable set generation now enriched with web-sourced data. Property matches consider live market conditions, recent transactions, and current listings.

### 9.7 Regulatory Data (18 Countries) ✅ DONE (April 2026)

Per-country regulatory data expanded to 18 countries: corporate tax, property tax methodology, depreciation method/period, VAT/sales tax, labor law minimums, licensing requirements. State/province overrides for US, Colombia, Mexico.

### 9.8 Source-Aware Prompts ✅ DONE (April 2026)

Research engine prompts now include source metadata — which databases were queried, what web results were found, confidence levels per source. LLM can reason about source quality.

### 9.9 Domain Preamble ✅ DONE (April 2026)

All research prompts include a hospitality domain preamble with property context, market segment definitions, and financial terminology. Improves LLM accuracy on domain-specific queries.

**Remaining UI:** Benchmark admin tab (Replit T001-T003), staleness dashboard (T004), confidence badges (T005-T007).

---

## PHASE 10: Scenario and Portfolio Intelligence ✅ DONE (Backend Complete)

**Goal:** Transform scenarios from simple save/load into a strategic analysis tool. Portfolio-level intelligence.

**Depends on:** Phase 9 (accurate research data feeds into scenario analysis).

**Status:** All backend work complete. Remaining UI tasks (risk insights panel, portfolio risk grade on dashboard) assigned to Replit T006.

### 10.1 Batch Scenario Comparison ✅ DONE (April 2026)

API for comparing 2-4 scenarios side by side. Returns key metrics (IRR, equity multiple, cash-on-cash, NOI margin, DSCR, total investment), deltas between scenarios, and "what changed" summary showing which assumptions differ.

### 10.2 Scenario Tagging ✅ DONE (April 2026)

Scenarios can be tagged (bull/base/bear, draft, final, shared). Tags auto-applied during stress test generation. Filterable in scenario list.

### 10.3 Portfolio Risk Scoring ✅ DONE (April 2026)

Portfolio concentration metrics: geographic (HHI), market tier, property type, revenue source. Risk score (1-10) with breakdown by factor. Optimization suggestions for diversification.

**Remaining UI:** Portfolio risk grade display on main dashboard (Replit T006).

### 10.4 Risk Intelligence Engine ✅ DONE (April 2026)

Per-assumption risk flags derived from research ranges. When a user's assumption falls outside the research-recommended range, the engine flags it with severity and explanation.

### 10.5 Stress Scenarios ✅ DONE (April 2026)

Auto-generation of bull/base/bear scenario variants from a base scenario. Variables stressed: ADR, occupancy, expense growth, cap rate, interest rate. Results stored with scenario tags.

### 10.6 Property Defaults (4-Layer Cascade) ✅ DONE (April 2026)

Default values resolved through a 4-layer cascade: (1) research-engine-driven, (2) property-specific overrides, (3) country defaults, (4) system fallbacks. Each layer clearly identified in the UI.

**Remaining UI:** Risk insights panel (Replit T006).

---

## PHASE 11: Export and Presentation Excellence

**Goal:** Exports that win investor meetings. Every document must look like it came from a top-tier advisory firm.

**Depends on:** Phase 10 (scenario comparison and portfolio analytics feed into exports).

### 11.1 Branded Investor Deck Templates (PPTX)

**WHY:** Generic PPTX output does not win deals. Need branded templates that match the management company's visual identity.

**TASKS:**
- Create 3-5 PPTX master templates with professional slide layouts matching the app's design themes.
- Auto-populate with portfolio data, property summaries, financial highlights.
- Include risk grade, confidence scores, and stress test results on relevant slides.
- Custom cover page with property hero image, key metrics, date.
- Branded color scheme, typography, and chart styles per template.
- Management company logo and contact info on every slide.

**TOOL:** CLI (template generation engine) + Cursor (preview UI and template selection dialog)

### 11.2 Data Room Preparation Workflow

**WHY:** When raising capital, the company needs a complete data room. This should be one-click, not a manual assembly process.

**TASKS:**
- New "Data Room" section: organize exports by category (financials, property profiles, market research, legal/regulatory).
- Auto-generate table of contents with document descriptions.
- Include research citations and source URLs for all data-driven claims.
- ZIP download of all documents in structured folder hierarchy.
- Track data room versions (date-stamped) with diff from previous version.

**TOOL:** CLI (backend document assembly) + Cursor (workflow UI and category management)

### 11.3 Automated Executive Summary Generation

**WHY:** Every investor deck needs a 1-page executive summary. Currently manual.

**TASKS:**
- LLM-generated 1-page executive summary per property and per portfolio.
- Includes: investment thesis, key metrics, risk factors, comparable market data.
- Embeds in PDF exports as first page automatically.
- Editable before export (AI drafts, human refines).
- Tone: professional, concise, investor-facing. Not marketing copy.

**TOOL:** CLI (AI generation + PDF embedding)

### 11.4 Multi-Property Comparison One-Pager

**WHY:** Investors reviewing a portfolio want a single page comparing all properties.

**TASKS:**
- Side-by-side property comparison table: ADR, occupancy, NOI, IRR, cap rate, equity multiple, risk grade.
- Mini charts: revenue mix, occupancy ramp, cash flow trajectory.
- Exportable as PDF or PPTX slide.
- Auto-generated from current scenario data.

**TOOL:** CLI (data assembly + layout) + Cursor (design polish)

---

## PHASE 12: Knowledge and Onboarding

**Goal:** Users learn by using the platform. Rebecca becomes the primary interface for understanding hospitality finance.

**Depends on:** Phase 8 (standalone deployment enables onboarding flows).

### 12.1 Rebecca Conversational Onboarding

**WHY:** New users should not face a blank screen. Rebecca guides them through their first scenario.

**TASKS:**
- When a new user first logs in, Rebecca greets them and walks through: "Let's set up your first property."
- Guided flow: property basics (type, location, size) -> Regenerate Intelligence -> review ranges -> save.
- Auto-populates property with research-driven defaults based on answers.
- Ends with: "I have created a starter scenario. Here is what the numbers look like."
- Skip option for experienced users.

**TOOL:** CLI (backend conversational flow) + Cursor (UI integration)

### 12.2 Contextual Help with Video Snippets

**WHY:** Tooltips explain formulas. But some concepts need visual explanation.

**TASKS:**
- Add short (15-30s) video tooltip support to HelpTooltip component.
- Create video explanations for: seasonality, fee subordination, stress testing, NOI waterfall, occupancy ramp.
- Videos hosted in object storage (S3/R2), served via presigned URLs.
- Lazy-load videos only when tooltip is opened.

**TOOL:** Cursor (UI component) + content creation (separate workstream)

### 12.3 Guided Scenario Creation Wizard

**WHY:** The property creation form is powerful but intimidating. A wizard makes it approachable.

**TASKS:**
- Step-by-step wizard: pick base scenario -> choose variables to stress -> auto-generate bull/base/bear cases.
- Tags auto-applied (bull/base/bear).
- Each step shows research-driven suggestions with "Accept" or "Override" options.
- Progress indicator with estimated time remaining.
- Can be abandoned and resumed (auto-save).

**TOOL:** CLI (scenario generation logic) + Cursor (wizard UI)

### 12.4 Industry Benchmark Library

**WHY:** Users need reference points. "Is 65% occupancy good?" depends on market, quality tier, and property age.

**TASKS:**
- Browsable, searchable database of all hospitality benchmarks.
- Filter by segment, country, metric type.
- Source attribution and freshness indicators on every data point.
- Link benchmarks to property fields: "Your ADR is in the 75th percentile for Upper Upscale properties in this market."

**TOOL:** CLI (API already exists from Phase 9) + Cursor (browsing UI)

---

## PHASE 13: Scale and Performance

**Goal:** The platform handles multiple organizations, concurrent users, and large portfolios without degradation.

**Depends on:** Phase 8 (standalone infrastructure), all other phases (features must exist before scaling them).

### 13.1 Horizontal Scaling

**WHY:** A single server instance is a bottleneck and a single point of failure.

**TASKS:**
- Make the server stateless (move session state to Redis; already using connect-pg-simple).
- Docker Compose for multi-instance deployment.
- Load balancer configuration (health checks, sticky sessions if needed).
- Document scaling thresholds: when to add instances, when to upgrade database.

**TOOL:** CLI

### 13.2 Computation Caching

**WHY:** Financial projections are deterministic given the same inputs. No need to recompute.

**TASKS:**
- Cache scenario computation results (already have `scenario_results` table with hash-based drift detection).
- Cache portfolio projections with invalidation on property/assumption change.
- Redis-backed with TTL per cache type.
- Add cache hit rate monitoring.

**TOOL:** CLI

### 13.3 Background Job Processing

**WHY:** Research runs, export generation, and portfolio computation can take 10-30 seconds. These should not block the API.

**TASKS:**
- Long-running research -> background job with SSE progress updates.
- Bulk property research -> queue with rate limiting.
- Export generation -> background with download link notification.
- Dead letter queue for failed jobs with admin visibility.

**TOOL:** CLI

### 13.4 Multi-Organization / White-Label

**WHY:** The platform should support multiple management companies, each with their own properties, users, and branding.

**TASKS:**
- Organization entity (replaces simplified user model's free-text company field).
- Per-org branding, themes, logo.
- Organization-level admin role (can manage their org but not others).
- Super-admin role (can manage all organizations).
- Tenant isolation: queries always scoped to the current organization.

**TOOL:** CLI + Cursor

### 13.5 Rate Limiting and Usage Tracking

**WHY:** AI API calls cost money. Need to track and limit usage per organization.

**TASKS:**
- Per-user API call tracking.
- LLM token usage tracking (already have cost logging infrastructure).
- Usage dashboard for admin with monthly breakdowns.
- Monthly usage reports (automated email or in-app).
- Alert when approaching configurable limits.

**TOOL:** CLI + Cursor

---

## Critical Rules (Unchanged)

These rules apply to ALL phases and ALL tasks. Violation of any rule is a blocker.

1. **No magic numbers.** Only `MONTHS_PER_YEAR = 12` and `DAYS_PER_MONTH = 30.5` may be hardcoded. Everything else is DB-backed.
2. **Financial statement lines are FIXED.** Admin influences via percentages, not by adding/removing lines.
3. **Properties are NEVER deleted.** Only toggled ON/OFF per scenario/user.
4. **ALL models need F&B revenue.** Even luxury rentals.
5. **ALL properties pay brand/management fees.** Marketing & Brand and incentive fees are mandatory.
6. **If research has not run, fields should be EMPTY** -- not pre-filled with US-centric guesses.
7. **The chatbot is named Rebecca.**
8. **Financial accuracy always beats UI enhancements.** The proof system must always pass.
9. **Country defaults (tax/depreciation) are never confused with property-specific defaults (ADR/reserves) or research-engine-driven values.**
10. **Every financial line item has a tooltip.** No exceptions.

---

## Key Reference Documents

| Document | Location | Purpose |
|----------|----------|---------|
| Business Model | `.claude/skills/business-model/SKILL.md` | Two-entity model, revenue streams, fee structures |
| Product Vision | `.claude/skills/product-vision/SKILL.md` | Design tenets, workflow principles, user roles |
| Research Strategy | `.claude/skills/research/research-intelligence-strategy.md` | Research engine architecture |
| Golden Scenarios | `.claude/skills/testing/golden-scenario-methodology.md` | Testing approach, 4 archetypes |
| Proof System | `.claude/skills/proof-system/SKILL.md` | 15-phase verification pipeline |
| Rebecca Chatbot | `.claude/skills/rebecca-chatbot/SKILL.md` | RAG, Super Conversations, admin config |
| Export System | `.claude/skills/exports/SKILL.md` | PDF, Excel, PPTX, unified compiler |
| Architecture | `.claude/skills/architecture/SKILL.md` | Tech stack, file organization |
| Hospitality Benchmarks | `docs/research/hospitality-classification-and-benchmarks.md` | STR scales, USALI, cap rates |
| Fee Structures | `docs/research/hospitality-fee-structures.md` | Management fee benchmarks worldwide |
| Data APIs | `docs/research/hospitality-data-apis.md` | Data sources, integration priority |
| Previous Master Plan | `docs/planning/MASTER-PLAN.md` | Phases 0-7 (all complete) |

---

## Timeline Estimates

| Phase | Estimated Duration | Status | Key Risk |
|-------|-------------------|--------|----------|
| **8: Platform Independence** | 4-6 weeks | In progress (8.1 done) | Auth migration may surface undocumented Replit dependencies |
| **9: Research Excellence** | -- | **DONE** (backend); UI in Replit T001-T007 | -- |
| **10: Scenario Intelligence** | -- | **DONE** (backend); UI in Replit T006 | -- |
| **11: Export Excellence** | 3-5 weeks | Not started | Template design requires graphic design input |
| **12: Knowledge & Onboarding** | 4-6 weeks | Not started | Video content production is a separate workstream |
| **13: Scale & Performance** | 6-8 weeks | Not started | Multi-org migration is the riskiest schema change |

**Remaining estimated: 13-19 weeks** (3-5 months) for Phases 8 (remainder), 11, 12, 13.

Phase 8 is the critical path. Nothing else moves forward until the app runs independently of Replit. Phases 9 and 10 backend completion means export and presentation work (Phase 11) can begin as soon as Phase 8 deployment is proven.

---

*H+ Analytics -- from Replit to production-grade platform.*
