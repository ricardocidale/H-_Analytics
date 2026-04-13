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

Rebecca chatbot with RAG across 7 Pinecone namespaces. Contextual tooltips on every financial line item. Guided tours. Industry benchmark library. Users learn by using the platform.

---

## Completed Work (Phases 0-7)

All phases below are DONE. See `MASTER-PLAN.md` for full detail.

| Phase | Focus | Key Deliverables |
|-------|-------|-----------------|
| **0** | Foundation | Verification retention fix, dead flag removal, Marketing & Brand rename, VRBO F&B fix, documentation |
| **1** | Data Model | Quality tiers, property descriptors, user simplification (groups eliminated), DB-backed constants, business brand entity, country defaults expansion |
| **2** | Admin & UI | Admin sidebar restructure, component deduplication, per-user default scenarios, required fields config, branding polish |
| **3** | Financial Engine | F&B as % of total revenue (not rooms), luxury rental model, monthly seasonality curves, improved occupancy ramp, owner's priority return, fee subordination |
| **4** | Research Engines | FRED API integration, Damodaran data loader, source management system, range badge UX, entity-aware research context, Pinecone RAG expansion |
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

## PHASE 9: Research Engine Excellence

**Goal:** Make the research engines best-in-class. Expand sources, improve accuracy, add confidence scoring. This is the product's core differentiator.

**Depends on:** Phase 8 (direct AI API access).

### 9.1 Comparable Set Source Expansion

**WHY:** More data sources mean more accurate research ranges. Currently limited to FRED and Damodaran.

**TASKS:**
- Integrate CoStar API for commercial real estate data (requires partnership/license).
- Integrate STR (Smith Travel Research) data feed for hotel performance benchmarks.
- Add AirDNA or AllTheRooms for short-term rental market data.
- Create `server/research/sources/` directory with one module per source.
- Each source implements a standard interface: `query(params) -> ResearchResult[]`.
- Admin UI for source configuration (API keys, enable/disable, refresh interval).

**TOOL:** Claude Code CLI first (backend integrations), then Cursor (admin UI)

### 9.2 Real-Time Macro Data Refresh

**WHY:** FRED data, interest rates, and inflation indices go stale. Admins need control over refresh timing.

**TASKS:**
- Add scheduled refresh for FRED data (configurable interval, default weekly).
- Add admin controls: manual refresh button, last-refreshed timestamp, staleness warning.
- Add Damodaran data refresh (quarterly, matching their publication schedule).
- Store refresh history in `market_data_refreshes` table.
- Alert admin when data is older than configured threshold.

**TOOL:** Claude Code CLI first (backend), then Cursor (admin indicators)

### 9.3 Per-Country Regulatory Data

**WHY:** Properties span 4 countries. Tax rates, depreciation rules, licensing requirements, and labor laws differ dramatically.

**TASKS:**
- Expand `country_defaults` table with: corporate tax rate, property tax methodology, depreciation method and period, VAT/sales tax, labor law minimums, licensing requirements.
- Seed data for: Colombia, United States, Brazil, Mexico, Spain.
- Research engine uses country defaults as baseline, then refines with local data.
- Admin can edit and add countries.
- Add state/province level overrides for US, Colombia, Mexico.

**TOOL:** Claude Code CLI

### 9.4 Research Confidence Scoring

**WHY:** Not all research results are equally reliable. Users need to know how confident the system is.

**TASKS:**
- Add `confidence` field (0-100) to all research results.
- Confidence factors: number of sources, source recency, geographic proximity, property type match.
- Display confidence badge on research range tooltips (green/yellow/red).
- Log confidence scores for admin review.
- Add "low confidence" warning when confidence < 50.

**TOOL:** Claude Code CLI first (scoring logic), then Cursor (UI badges)

### 9.5 Automated Staleness Detection

**WHY:** Research results age. A comp set from 6 months ago may be misleading.

**TASKS:**
- Add `researched_at` timestamp to all research-driven fields.
- Add staleness thresholds per field type (ADR: 30 days, cap rate: 90 days, tax rate: 365 days).
- Show staleness indicator on property fields.
- Add "re-research" button that triggers a fresh research run for stale fields.
- Admin dashboard showing staleness across entire portfolio.

**TOOL:** Claude Code CLI first (backend), then Cursor (UI indicators)

---

## PHASE 10: Scenario and Portfolio Intelligence

**Goal:** Transform scenarios from simple save/load into a strategic analysis tool. Portfolio-level intelligence.

**Depends on:** Phase 9 (accurate research data feeds into scenario analysis).

### 10.1 Multi-Scenario Comparison Dashboard

**WHY:** Investors want to see best/base/worst cases side by side. Currently requires switching between scenarios.

**TASKS:**
- Create comparison view: select 2-4 scenarios, see key metrics in columns.
- Metrics: IRR, equity multiple, cash-on-cash, NOI margin, DSCR, total investment.
- Highlight deltas between scenarios (green = better, red = worse).
- Add "what changed" summary showing which assumptions differ.
- Export comparison as standalone PDF/PPTX page.

**TOOL:** Cursor (this is primarily UI), Claude Code CLI for backend data aggregation

### 10.2 Sensitivity Analysis Automation

**WHY:** Users manually pick variables for sensitivity analysis. The system should auto-detect which variables matter most.

**TASKS:**
- Implement tornado chart: vary each input by +/- 10%, rank by impact on IRR.
- Auto-identify top 5 critical variables per property.
- Generate narrative: "IRR is most sensitive to ADR (+/- 2.3pp per 10% change) and least sensitive to utility costs."
- Store sensitivity results with scenario snapshots.

**TOOL:** Claude Code CLI (engine math), then Cursor (tornado chart UI)

### 10.3 Portfolio Risk Scoring

**WHY:** A portfolio concentrated in one geography or market tier carries hidden risk. Investors need to see this.

**TASKS:**
- Compute portfolio concentration metrics: geographic (HHI), market tier, property type, revenue source.
- Assign risk score (1-10) with breakdown by factor.
- Show portfolio risk dashboard on main Dashboard page.
- Add portfolio optimization suggestions: "Adding a midscale property in a different market would reduce geographic concentration by 15%."

**TOOL:** Claude Code CLI (scoring engine), then Cursor (dashboard UI)

### 10.4 Scenario Versioning with Diff

**WHY:** When a scenario changes, users need to see exactly what changed and when.

**TASKS:**
- Store scenario version history (already have `scenario_results` with hashes).
- Build diff viewer: show field-level changes between any two versions.
- Add timeline view of scenario evolution.
- Allow rollback to any previous version.

**TOOL:** Claude Code CLI first (version storage and diff engine), then Cursor (diff UI)

---

## PHASE 11: Export and Presentation Excellence

**Goal:** Exports that win investor meetings. Every document must look like it came from a top-tier advisory firm.

**Depends on:** Phase 10 (scenario comparison and portfolio analytics feed into exports).

### 11.1 Branded Investor Deck Templates

**WHY:** Generic PPTX output does not win deals. Need branded templates that match the management company's visual identity.

**TASKS:**
- Create 3-5 PPTX master templates with professional slide layouts.
- Template selection in export dialog.
- Custom cover page with property hero image, key metrics, date.
- Branded color scheme, typography, and chart styles per template.
- Management company logo and contact info on every slide.

**TOOL:** Cursor (visual/template work), Claude Code CLI (template engine)

### 11.2 Data Room Preparation Workflow

**WHY:** When raising capital, the company needs a complete data room. This should be one-click, not a manual assembly process.

**TASKS:**
- Define data room structure: executive summary, financial projections, property profiles, market research, verification reports, legal docs placeholder.
- "Prepare Data Room" button generates all documents in a ZIP.
- Include: portfolio overview PDF, per-property detail PDFs, Excel models, verification certificates.
- Track data room versions (date-stamped).

**TOOL:** Claude Code CLI (document assembly), then Cursor (workflow UI)

### 11.3 Automated Executive Summary

**WHY:** Every investor deck needs a 1-page executive summary. Currently manual.

**TASKS:**
- AI-generated executive summary using portfolio data + research context.
- Includes: investment thesis, portfolio overview, key metrics, risk factors, management team.
- Editable before export (AI drafts, human refines).
- Tone: professional, concise, investor-facing. Not marketing copy.

**TOOL:** Claude Code CLI (AI generation), then Cursor (editor UI)

### 11.4 Multi-Property Comparison One-Pager

**WHY:** Investors reviewing a portfolio want a single page comparing all properties.

**TASKS:**
- One-page PDF/PPTX with all properties in columns.
- Key rows: purchase price, rooms, ADR, occupancy, NOI, IRR, equity multiple.
- Mini charts: revenue mix, occupancy ramp, cash flow trajectory.
- Auto-generated from current scenario data.

**TOOL:** Claude Code CLI (data extraction + layout), then Cursor (design polish)

---

## PHASE 12: Knowledge and Onboarding

**Goal:** Users learn by using the platform. Rebecca becomes the primary interface for understanding hospitality finance.

**Depends on:** Phase 8 (standalone deployment enables onboarding flows).

### 12.1 Rebecca Conversational Onboarding

**WHY:** New users should not face a blank screen. Rebecca guides them through their first scenario.

**TASKS:**
- "Welcome" flow: Rebecca asks 5-7 questions to create a starter property.
- Questions: property type, location, approximate size, target market, budget range.
- Auto-populates property with research-driven defaults.
- Ends with: "I have created a starter scenario. Here is what the numbers look like."
- Skip option for experienced users.

**TOOL:** Claude Code CLI (conversational flow + backend), then Cursor (UI integration)

### 12.2 Contextual Help with Video Snippets

**WHY:** Tooltips explain formulas. But some concepts need visual explanation.

**TASKS:**
- Add video snippet support to HelpTooltip component (short 15-30s clips).
- Record/create video explanations for: NOI waterfall, occupancy ramp, debt service, IRR calculation, balance sheet equation.
- Host videos on S3/R2 (not YouTube -- no external dependencies in the app).
- Lazy-load videos only when tooltip is opened.

**TOOL:** Cursor (UI component), Claude Code CLI (hosting infrastructure)

### 12.3 Industry Benchmark Library

**WHY:** Users need reference points. "Is 65% occupancy good?" depends on market, quality tier, and property age.

**TASKS:**
- Browsable, searchable benchmark library.
- Categories: ADR by market tier, occupancy by geography, expense ratios by property type, cap rates by market, management fee ranges.
- Data sourced from research engines + curated by admin.
- Link benchmarks to property fields: "Your ADR is in the 75th percentile for Upper Upscale properties in this market."

**TOOL:** Claude Code CLI (data model + research integration), then Cursor (browsable UI)

### 12.4 Guided Scenario Creation Wizard

**WHY:** The property creation form is powerful but intimidating. A wizard makes it approachable.

**TASKS:**
- Step-by-step wizard: Location > Property Details > Revenue Assumptions > Expense Structure > Capital Structure > Review.
- Each step shows research-driven suggestions with "Accept" or "Override" options.
- Progress indicator with estimated time remaining.
- Can be abandoned and resumed (auto-save).
- Results in a complete, research-grounded scenario.

**TOOL:** Cursor (wizard UI), Claude Code CLI (research integration per step)

---

## PHASE 13: Scale and Performance

**Goal:** The platform handles multiple organizations, concurrent users, and large portfolios without degradation.

**Depends on:** Phase 8 (standalone infrastructure), all other phases (features must exist before scaling them).

### 13.1 Horizontal Scaling

**WHY:** A single server instance is a bottleneck and a single point of failure.

**TASKS:**
- Make the server stateless (move all session state to Redis).
- Configure Redis for session store and cache.
- Add WebSocket support for real-time updates (scenario computation progress, research status).
- Load balancer configuration (health checks, sticky sessions if needed).
- Document scaling thresholds: when to add instances, when to upgrade database.

**TOOL:** Claude Code CLI

### 13.2 Computation Caching

**WHY:** Financial projections are deterministic given the same inputs. No need to recompute.

**TASKS:**
- Cache scenario computation results (already have hash-based drift detection).
- Cache export generation (same inputs = same PDF).
- Cache research results with TTL based on field type.
- Add cache hit rate monitoring.
- Implement cache invalidation on assumption changes.

**TOOL:** Claude Code CLI

### 13.3 Background Job Processing

**WHY:** Research runs, export generation, and portfolio computation can take 10-30 seconds. These should not block the API.

**TASKS:**
- Add job queue (BullMQ with Redis).
- Move to background: research engine runs, premium export generation, portfolio recomputation, data room assembly.
- Add job status API: `GET /api/jobs/:id` returns progress.
- Client shows progress indicator for long-running operations.
- Dead letter queue for failed jobs with admin visibility.

**TOOL:** Claude Code CLI (backend), then Cursor (progress UI)

### 13.4 Multi-Organization Infrastructure

**WHY:** The platform should support multiple management companies, each with their own properties, users, and branding.

**TASKS:**
- Add `organizations` table. All existing entities get an `organization_id` foreign key.
- Tenant isolation: queries always scoped to the current organization.
- Organization-level admin role (can manage their org but not others).
- Super-admin role (can manage all organizations).
- Per-organization billing and usage tracking.
- White-label: custom domain, logo, theme per organization.

**TOOL:** Claude Code CLI (schema + backend), then Cursor (org management UI)

### 13.5 Rate Limiting and Usage Tracking

**WHY:** AI API calls cost money. Need to track and limit usage per organization.

**TASKS:**
- Track AI API usage per organization per month (tokens, image generations, research runs).
- Configurable rate limits per tier (free, pro, enterprise).
- Usage dashboard in admin panel.
- Alert when approaching limits.
- Grace period before hard cutoff.

**TOOL:** Claude Code CLI (backend), then Cursor (usage dashboard UI)

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

These are rough estimates. Actual pace depends on complexity discovered during implementation.

| Phase | Estimated Duration | Key Risk |
|-------|-------------------|----------|
| **8: Platform Independence** | 4-6 weeks | Auth migration may surface undocumented Replit dependencies |
| **9: Research Excellence** | 6-8 weeks | CoStar/STR partnerships require business negotiations |
| **10: Scenario Intelligence** | 4-6 weeks | Tornado chart math must be independently verified |
| **11: Export Excellence** | 3-5 weeks | Template design requires graphic design input |
| **12: Knowledge & Onboarding** | 4-6 weeks | Video content production is a separate workstream |
| **13: Scale & Performance** | 6-8 weeks | Multi-org migration is the riskiest schema change |

**Total estimated: 27-39 weeks** (7-10 months)

Phase 8 is the critical path. Nothing else moves forward until the app runs independently of Replit.

---

*H+ Analytics -- from Replit to production-grade platform.*
