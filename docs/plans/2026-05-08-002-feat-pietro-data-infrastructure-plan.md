---
title: "feat: Pietro — Financial Data Infrastructure Agent"
type: feat
status: active
date: 2026-05-08
origin: docs/brainstorms/pietro-data-infrastructure-requirements.md
---

# feat: Pietro — Financial Data Infrastructure Agent

## Summary

Introduce Pietro, a new LLM-backed orchestrator that owns all financial and market data
infrastructure in H+ Analytics. Pietro dispatches deterministic per-source minions that
pre-populate DB cache tables on a schedule (REIT benchmarks from FMP/Daloopa, competitor
hotel rates from Booking/Expedia, extended FRED hospitality series), surfaces every data
source in Admin → Sources with health dots and Analyst/Regenerate buttons, and exposes
three new Rebecca tools for agent-native parity. Exa replaces Perplexity as the
web-grounded search provider. All 8 origin requirements are addressed across 12 implementation
units sequenced by dependency.

---

## Problem Frame

H+ Analytics lacks a single agent that owns data infrastructure across the platform. Iris owns
Rebecca's KB. Gustavo owns research specialist dispatch. Neither owns the scheduled data
pipelines that financial and analysis agents depend on. The result: FRED is the only pre-populated
external source; hotel REIT benchmarks, competitor rates, and research catalog resources are
unavailable to agents at runtime without live API calls. (see origin:
docs/brainstorms/pietro-data-infrastructure-requirements.md)

---

## Requirements

- R1. Pietro — LLM orchestrator agent (Italian male, CLAUDE.md §10), distinct from Iris and Gustavo
- R2. Per-source minions — deterministic TypeScript fetchers, one per API/MCP
- R3. Two new DB cache tables — `reit_benchmarks` and `competitor_rates`
- R4. `admin_resources` extended — new kinds (`mcp`, `search_url`, `research_prompt`) + `daily_request_budget` column
- R5. Pre-populated seed data — 7 admin_resource rows for active MCPs
- R6. Admin Sources UI — accordion rows with freshness dot + Analyst + Regenerate buttons
- R7. Research catalog — pre-seeded URLs and prompt templates as admin_resources rows
- R8. Exa replaces Perplexity — new provider branch in `callLlm` / `callLlmStream`

---

## Scope Boundaries

- Context7 seed row created but flagged "coding-session only" — no minion fetcher
- FactSet deferred — requires subscription not yet obtained
- Expedia official API deferred — partner-gated
- Per-property competitor rate scraping deferred — high volume, complex deduplication
- Natural-language "ask Pietro" from Rebecca chat deferred — future when pattern stabilizes
- Financial engine untouched — ADR-007 discipline; minions write to DB, engine reads via `getFactoryNumber()`
- Iris scope unchanged

### Deferred to Follow-Up Work

- MinionExa (R2 Phase 2) — on-demand search minion, separate PR once Exa key is obtained and Exa swap is stable
- `daily_request_budget` enforcement logic in Pietro scheduler (column added in U1, enforcement added in future iteration)

---

## Context & Research

### Relevant Code and Patterns

- `artifacts/api-server/src/ai/iris/agent.ts` — canonical LLM orchestrator pattern Pietro mirrors: named constants block, PietroRunResult interface, agentic loop, tool dispatch, run history
- `artifacts/api-server/src/ai/ambient/fetchers.ts` — FetcherResult pattern minions mirror: `Promise.allSettled`, `AbortSignal.timeout`, key-presence gating, error isolation per series
- `lib/db/src/schema/admin-resource.ts` — RESOURCE_KINDS, RESOURCE_KIND_LABELS, PROBE_PROFILES, `bucketResourceForSourcesTab` — four places to update
- `artifacts/api-server/src/jobs/probes/index.ts` — PROBES map, add new kinds pointing at `probeApiOrSource`
- `artifacts/api-server/src/chat/rebecca-tools.ts` — `getRebeccaTools()` + `dispatchRebeccaTool()` — two-touch registration pattern
- `artifacts/api-server/src/ai/ambient/scheduler.ts` — `startAmbientScheduler` / `stopAmbientScheduler` pattern Pietro scheduler mirrors
- `artifacts/api-server/src/migrations/admin-resources-001.ts` — runtime migration guard pattern for new admin_resource rows
- `artifacts/api-server/src/index.ts` lines ~334–341 — scheduler registration location
- `artifacts/api-server/src/ai/clients.ts` — `getPerplexityClient()` → `getExaClient()` swap point
- `artifacts/hospitality-business-portal/src/pages/admin/specialist/tabs/SourcesTab.tsx` — correct Admin Sources surface (NOT `components/admin/SourcesTab.tsx` which is the research URL/file config surface)

### Institutional Learnings

- `docs/solutions/architecture-patterns/mcp-integration-surfaces-production-vs-claude-code-2026-05-08.md` — `.mcp.json` is Claude Code only; production requires the 5-layer FRED template
- `docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md` — mandatory fetcher disciplines: `Promise.allSettled`, `AbortSignal.timeout`, key-presence gating, stale-while-revalidate with named TTL constants
- `docs/solutions/integration-issues/iris-llm-temperature-top-p-conflict-2026-05-08.md` — any new `callLlm` provider branch must use conditional-spread for `topP`: `...(sampling.topP !== undefined ? { top_p: sampling.topP } : {})`
- `docs/solutions/database-issues/drizzle-migration-state-drift-missing-tables-2026-05-07.md` — after new SQL migration, verify hash in `drizzle.__drizzle_migrations` on Neon (never via Replit executeSql); write runtime TS guard for every new table
- `docs/solutions/architecture-patterns/admin-sidebar-ia-sources-resources-2026-05-02.md` — Pietro sources belong under Admin → Sources → Tables or APIs, never under /intelligence
- `docs/solutions/architecture-patterns/sources-ux-status-analyst-button-2026-05-02.md` — every Pietro source row needs: status icon + last-regenerated timestamp + Analyst button (regenerates entire row, never cell-edit)
- `docs/solutions/architecture-patterns/rebecca-agent-native-architecture-2026-05-05.md` — Rebecca tool registration: `getRebeccaTools()` + `dispatchRebeccaTool()` switch case; each tool added to `docs/discipline/agent-native-parity-map.md`

---

## Key Technical Decisions

- **Pietro agent uses Anthropic as LLM provider** — same as Iris, consistent backstage agent pattern; no new provider configuration required
- **`daily_request_budget` is a dedicated column, not jsonb** — Pietro scheduler reads it per tick to enforce rate limits; dedicated column enables SQL queries and type safety. Default value exported as `DEFAULT_ADMIN_RESOURCE_DAILY_REQUEST_BUDGET` from `lib/db/src/constants.ts` per §1
- **Admin_resource seed rows go in a migration guard, not seeds/ directory** — confirmed pattern: existing Pietro-class rows are added via `artifacts/api-server/src/migrations/admin-resources-*.ts` runtime guards, which are idempotent and run on every boot
- **Exa adds a new provider branch; it does not rename Perplexity** — Exa's SDK is not OpenAI-compatible; the branch uses `exa.search()` / `exa.searchAndContents()` and appends sources similarly to the Perplexity citations block
- **MinionDaloopaReit degrades gracefully** — if `DALOOPA_API_KEY` is absent, the minion skips and returns a structured error; MinionFmpReit covers the same tickers as a fallback
- **reit_benchmarks uniqueness key: (ticker, period)** — period = quarterly string like "2024-Q4"; upsert updates value and source when same ticker+period is re-fetched
- **competitor_rates uniqueness key: (market, property_category, check_in_date, source)** — weekly snapshots are additive; queries use ORDER BY fetched_at DESC to get freshest

---

## Open Questions

### Resolved During Planning

- **Where to seed admin_resource rows for MCPs?** Migration guard in `src/migrations/pietro-resources-001.ts` — not the seeds/ directory (confirmed from repo research)
- **Which Admin Sources surface to extend?** `specialist/tabs/SourcesTab.tsx` and `routes/admin/sources-tab.ts` — not the research config `SourcesTab.tsx`
- **Should Exa replace Perplexity or add a parallel path?** Replace — admin toggle in Rebecca Config still controls web search on/off; `"exa"` replaces `"perplexity"` in the provider union

### Deferred to Implementation

- **Exact Exa SDK method calls** — depends on Exa npm package API; implementer should read the Exa SDK docs and mirror the Perplexity citations-block pattern
- **FMP endpoint paths** — Financial Modeling Prep REST v3 paths for income statement, key metrics, and historical price; implementer reads FMP docs
- **Daloopa tool names** — MCP tool names returned by `tools/list` endpoint; implementer reads at runtime
- **Booking.com RapidAPI response shape** — implementer inspects actual API response to define transform logic

---

## Output Structure

```
artifacts/api-server/src/ai/
  pietro/
    agent.ts          — Pietro LLM orchestrator
    tools.ts          — getPietroTools() + dispatchPietroTool()
    workspace.ts      — Pietro run history read/write
  ambient/
    minions/
      fred-extension.ts     — FRED hospitality series fetcher
      fmp-reit.ts           — FMP REIT fundamentals fetcher
      daloopa-reit.ts       — Daloopa REIT fundamentals fetcher
      booking-rates.ts      — Booking.com competitor rates fetcher
      expedia-rates.ts      — Expedia competitor rates fetcher
    pietro-scheduler.ts     — interval scheduler + minion dispatch

lib/db/src/schema/
  pietro-data.ts      — reit_benchmarks + competitor_rates Drizzle tables

artifacts/api-server/src/migrations/
  pietro-resources-001.ts   — runtime guard: new admin_resource rows + new column

artifacts/api-server/src/seeds/
  pietro-data.ts      — REIT + competitor seed rows (SEED_* constants)
```

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

```
┌─ Pietro scheduler (60-min tick) ─────────────────────────────────────────────┐
│  for each source in admin_resources where kind in (source, mcp):             │
│    if stale (now - fetched_at > TTL) AND within daily_request_budget:         │
│      dispatch matching minion → upsert to reit_benchmarks / competitor_rates  │
│      record result in admin_resources.last_health_status                      │
│      recordSchedulerCycle({ key: "pietro-data-refresh" })                    │
└───────────────────────────────────────────────────────────────────────────────┘

┌─ Pietro agent (LLM, triggered on manual-refresh / health-check) ─────────────┐
│  callLlm(anthropic, HAIKU, systemPrompt, [], kickoff)                         │
│  → tool: assess_source_health(slug)   → runs probe, returns status            │
│  → tool: dispatch_minion(slug)        → calls minion, returns FetcherResult   │
│  → tool: write_health_report(summary) → always last                           │
└───────────────────────────────────────────────────────────────────────────────┘

┌─ Admin → Sources accordion (R6) ─────────────────────────────────────────────┐
│  GET /api/admin/resources (all kinds)                                         │
│  Each row: freshness dot + kind badge + last-checked timestamp                │
│  Expanded: Analyst button → POST /api/admin/resources/:id/test (existing!)   │
│            Regenerate button → POST /api/admin/resources/:id/regenerate (new) │
└───────────────────────────────────────────────────────────────────────────────┘

┌─ Rebecca tools (agent-native parity) ────────────────────────────────────────┐
│  get_data_source_status()          → reads admin_resources, returns health    │
│  probe_data_source(id)             → wraps existing POST .../test endpoint    │
│  regenerate_data_source(slug)      → triggers Pietro to refresh one source    │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Units

- U1. **admin_resources schema extension**

**Goal:** Add `mcp`, `search_url`, `research_prompt` resource kinds and `daily_request_budget` column to the admin_resources infrastructure.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Modify: `lib/db/src/schema/admin-resource.ts`
- Modify: `artifacts/api-server/src/jobs/probes/index.ts`
- Modify: `lib/db/src/constants.ts` (add `DEFAULT_ADMIN_RESOURCE_DAILY_REQUEST_BUDGET`)
- Modify: `lib/shared/src/constants.ts` (if daily_request_budget default belongs there per §2)
- Create: `artifacts/api-server/migrations/NNNN_admin_resources_budget_and_kinds.sql`
- Create: `artifacts/api-server/src/migrations/admin-resources-006.ts`

**Approach:**
- In `admin-resource.ts`, add `"mcp"`, `"search_url"`, `"research_prompt"` to RESOURCE_KINDS array in all four locations: RESOURCE_KINDS array, RESOURCE_KIND_LABELS record, PROBE_PROFILES record (TTL: `mcp` = 300s, `search_url` = 3600s, `research_prompt` = 86400s), `bucketResourceForSourcesTab` switch (`mcp`/`search_url` → `"apis"`, `research_prompt` → `"bulk-sources"`)
- Add `dailyRequestBudget: integer("daily_request_budget")` column with nullable type and default `DEFAULT_ADMIN_RESOURCE_DAILY_REQUEST_BUDGET`
- In `probes/index.ts`, add `mcp`, `search_url`, `research_prompt` entries in the PROBES map pointing at `probeApiOrSource`
- SQL migration: `ALTER TABLE admin_resources ADD COLUMN IF NOT EXISTS daily_request_budget integer`
- Runtime TS guard (admin-resources-006.ts): `IF NOT EXISTS` DDL for the column; also register the 3 new kinds as valid (no DDL needed — enum is in TypeScript, not Postgres)

**Patterns to follow:**
- `lib/db/src/schema/admin-resource.ts` existing kind additions
- `artifacts/api-server/src/migrations/admin-resources-005.ts` runtime guard pattern

**Test scenarios:**
- Happy path: TypeScript compiles cleanly with new kinds in RESOURCE_KINDS — `pnpm run typecheck` passes
- Edge case: `daily_request_budget: null` rows are valid and accepted by the schema
- Integration: `pnpm --filter @workspace/scripts run check:migration-guards` passes after guard is registered
- Integration: `runProbe()` called with a row of kind `"mcp"` returns `{ status: "fail", errorCode: "CONFIG_INCOMPLETE" }` when `config.baseUrl` is absent (same as `"source"` kind)

**Verification:**
- `pnpm run typecheck` clean
- `check-magic-numbers` passes (no raw numerals for TTLs — use named constants)
- `check:migration-guards` passes
- PROBE_PROFILES has entries for all three new kinds

---

- U2. **New DB cache tables — reit_benchmarks and competitor_rates**

**Goal:** Define Drizzle schema and SQL migrations for the two new data cache tables Pietro minions write to.

**Requirements:** R3

**Dependencies:** None (parallel with U1)

**Files:**
- Create: `lib/db/src/schema/pietro-data.ts`
- Modify: `lib/db/src/schema/index.ts`
- Create: `artifacts/api-server/migrations/NNNN_create_reit_benchmarks_and_competitor_rates.sql`
- Create: `artifacts/api-server/src/migrations/pietro-tables-001.ts`

**Approach:**
- `reit_benchmarks`: `id` (PK), `ticker` (text, not null), `metricKey` (text), `value` (doublePrecision), `period` (text — "2024-Q4"), `source` (text — "fmp" | "daloopa"), `fetchedAt` (timestamp, defaultNow). Unique index on `(ticker, metric_key, period)`. Index on `ticker`.
- `competitor_rates`: `id` (PK), `market` (text, not null), `propertyCategory` (text), `checkInDate` (date), `avgRate` (doublePrecision), `currency` (text, default "USD"), `source` (text — "booking" | "expedia"), `fetchedAt` (timestamp, defaultNow). Unique index on `(market, property_category, check_in_date, source)`. Index on `(market, fetched_at)`.
- Export `InsertReitBenchmark`, `ReitBenchmarkRow`, `InsertCompetitorRate`, `CompetitorRateRow` types
- Runtime guard: `CREATE TABLE IF NOT EXISTS reit_benchmarks (...)` + `CREATE TABLE IF NOT EXISTS competitor_rates (...)`; register both in `migration-guards.json`

**Patterns to follow:**
- `lib/db/src/schema/intelligence-v2.ts` table definition style
- `artifacts/api-server/src/migrations/admin-resources-001.ts` guard pattern

**Test scenarios:**
- Happy path: `pnpm run typecheck` clean; schema exports correct types
- Integration: `pnpm --filter @workspace/scripts run check:migration-guards` passes
- Integration: After migration applied, both tables exist in Neon (`SELECT COUNT(*) FROM reit_benchmarks`) — verify hash in `drizzle.__drizzle_migrations`

**Verification:**
- Both tables present in `lib/db/src/schema/index.ts` exports
- Both migration guards registered in `migration-guards.json`
- TypeScript types are correct

---

- U3. **Minion infrastructure + MinionFredExtended**

**Goal:** Define the shared `MinionResult` interface, establish the minions directory, and implement the first minion (FRED extended series) as the pattern reference.

**Requirements:** R2, R3 (market_benchmarks extension)

**Dependencies:** U1

**Files:**
- Create: `artifacts/api-server/src/ai/ambient/minions/index.ts` (shared MinionResult type)
- Create: `artifacts/api-server/src/ai/ambient/minions/fred-extension.ts`
- Modify: `artifacts/api-server/src/ai/ambient/fetchers.ts` (extend series list or delegate to minion)

**Approach:**
- `MinionResult` interface: `{ source: string; rowsUpserted: number; rowsFailed: number; errors: string[]; durationMs: number }`
- `MinionFredExtended` fetches additional FRED series: `CUUR0000SEHB` (hospitality CPI), `CES7000000001` (leisure & hospitality employment), `HSNGSTARTW` (housing starts weekly proxy)
- Pattern: reads `FRED_API_KEY` from env, returns early with error if absent; uses `AbortSignal.timeout(10000)`; calls `fetchFredRate()` for each series; upserts into existing `market_benchmarks` (same `InsertBenchmarkSnapshot` type); returns `MinionResult`
- All TTL constants as named constants (e.g., `FRED_EXTENSION_FETCH_TIMEOUT_MS = 10_000`)

**Patterns to follow:**
- `artifacts/api-server/src/ai/ambient/fetchers.ts` — `fetchFredRate()`, `FetcherResult`, `Promise.allSettled` pattern

**Test scenarios:**
- Happy path: `FRED_API_KEY` set → minion returns `rowsUpserted > 0`, `errors.length === 0` for at least one known series
- Edge case: `FRED_API_KEY` absent → minion returns `{ rowsUpserted: 0, errors: ["FRED_API_KEY not set"] }` without throwing
- Error path: one FRED series returns HTTP 500 → that series error is in `errors[]` but other series still succeed (isolation via `Promise.allSettled`)

**Verification:**
- `pnpm run typecheck` clean
- `check-magic-numbers` passes (all constants named)
- Manual smoke: set `FRED_API_KEY` and call `runMinionFredExtended()` directly; observe upserted rows in `market_benchmarks`

---

- U4. **MinionFmpReit + MinionDaloopaReit**

**Goal:** Implement the two REIT fundamentals fetchers that populate `reit_benchmarks`.

**Requirements:** R2, R3

**Dependencies:** U2, U3 (MinionResult interface + reit_benchmarks table)

**Files:**
- Create: `artifacts/api-server/src/ai/ambient/minions/fmp-reit.ts`
- Create: `artifacts/api-server/src/ai/ambient/minions/daloopa-reit.ts`

**Approach:**
- `MinionFmpReit`: reads `FMP_ACCESS_TOKEN`; if absent, returns structured error (graceful degradation). Fetches key metrics for tickers `["HST", "RHP", "PEB", "APLE", "SHO"]` from FMP v3 (`/key-metrics/<ticker>?period=quarter&limit=4`). Transforms each quarter row to `InsertReitBenchmark` with `metricKey` values (capRate, noiBdMargin, debtToEbitda, occupancyRate where available). Upserts using `onConflictDoUpdate` on unique `(ticker, metric_key, period)`. TTL constant: `FMP_REIT_FETCH_TIMEOUT_MS`. Daily budget cap: respects `daily_request_budget` from the corresponding `admin_resources` row — reads budget before each ticker batch.
- `MinionDaloopaReit`: reads `DALOOPA_API_KEY`; if absent, logs and returns immediately (FMP is the fallback). Calls Daloopa MCP `get_fundamentals_data` tool via HTTP POST to `https://mcp.daloopa.com/server/mcp` with `X-API-KEY` header. Same target table and ticker list as FMP. Source field = `"daloopa"`. Must use conditional-spread sampling guard per integration-issues learning if any callLlm is used (not needed here — direct HTTP).
- Both minions: `Promise.allSettled` per ticker, `AbortSignal.timeout`, key-presence gating, structured `MinionResult` return

**Patterns to follow:**
- `artifacts/api-server/src/ai/ambient/minions/fred-extension.ts` (U3)
- `docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md`

**Test scenarios:**
- Happy path FMP: `FMP_ACCESS_TOKEN` set → returns `rowsUpserted >= 5` (one per ticker) with empty errors
- Edge case FMP: `FMP_ACCESS_TOKEN` absent → `{ rowsUpserted: 0, errors: ["FMP_ACCESS_TOKEN not set — skipping"] }`, no throw
- Edge case Daloopa: `DALOOPA_API_KEY` absent → graceful skip, structured result with skip message
- Error path: FMP rate-limits one ticker (HTTP 429) → that ticker error captured, others succeed
- Integration: After a successful run, `SELECT COUNT(*) FROM reit_benchmarks WHERE ticker = 'HST'` returns > 0

**Verification:**
- Both minions compile cleanly
- `check-magic-numbers` passes
- Graceful degradation confirmed manually for each key-absence case

---

- U5. **MinionBookingRates + MinionExpediaRates**

**Goal:** Implement the two competitor rate snapshot fetchers that populate `competitor_rates`.

**Requirements:** R2, R3

**Dependencies:** U2, U3

**Files:**
- Create: `artifacts/api-server/src/ai/ambient/minions/booking-rates.ts`
- Create: `artifacts/api-server/src/ai/ambient/minions/expedia-rates.ts`

**Approach:**
- Both minions fetch weekly rate snapshots for markets: `["Miami", "New York", "Denver", "Los Angeles", "Chicago"]`
- `MinionBookingRates`: reads `RAPIDAPI_KEY`; calls `@pullapi/booking-scraper-mcp` REST endpoint with `search_hotels` tool (2-night stay, 1 room, 2 adults, check-in = next Friday). Aggregates results to `avg_rate` per market. Upserts `InsertCompetitorRate` with `source = "booking"`. TTL constant: `BOOKING_RATES_FETCH_TIMEOUT_MS`. Respects `daily_request_budget`.
- `MinionExpediaRates`: reads `APIFY_API_TOKEN`; calls Apify Expedia actor API (`https://api.apify.com/v2/acts/crawlerbros~expedia-hotels-scraper/runs`) with same market+date parameters. Transforms to `InsertCompetitorRate` with `source = "expedia"`. Same pattern.
- `check_in_date` = next Friday at time of fetch (computed, not hardcoded)
- Named constants for all markets list, dates offsets, and market-category label

**Patterns to follow:**
- `artifacts/api-server/src/ai/ambient/minions/fmp-reit.ts` (U4)

**Test scenarios:**
- Happy path: `RAPIDAPI_KEY` set → returns `rowsUpserted >= 3`, empty errors
- Edge case: key absent → structured error, no throw
- Edge case: market returns zero results from API → market is skipped, not counted as upsert or error
- Integration: After successful run, `SELECT DISTINCT market FROM competitor_rates` returns at least 3 markets

**Verification:**
- Both minions compile cleanly
- `check-magic-numbers` passes (market list in a named constant, not inline array)

---

- U6. **Pietro agent + tools + workspace**

**Goal:** Implement the Pietro LLM orchestrator, its tool dispatch layer, and the run-history workspace module.

**Requirements:** R1

**Dependencies:** U3, U4, U5 (all minions available to dispatch)

**Files:**
- Create: `artifacts/api-server/src/ai/pietro/agent.ts`
- Create: `artifacts/api-server/src/ai/pietro/tools.ts`
- Create: `artifacts/api-server/src/ai/pietro/workspace.ts`

**Approach:**

`workspace.ts` — stores Pietro run history in a markdown file at `artifacts/api-server/pietro/run-history/<date>.md`. Exports `readPietroHealth()` and `appendRunHistory()`. Mirrors `iris/workspace.ts`.

`tools.ts` — `getPietroTools()` returns Pietro's LLM tool definitions:
- `assess_source_health(slug)` — calls `runProbe` for the admin_resource row matching slug; returns health status
- `dispatch_minion(slug)` — calls the minion from `MINION_REGISTRY` matching slug; returns MinionResult
- `write_health_report(summary)` — writes to workspace run history; always the last tool called

`agent.ts` — Pietro orchestrator:
- Model: `PIETRO_HAIKU_MODEL = "claude-haiku-4-5-20251001"` (health checks), `PIETRO_SONNET_MODEL = "claude-sonnet-4-6"` (manual refresh)
- `export type PietroTrigger = "manual" | "scheduled-prefetch" | "health-check" | "source-added"`
- `export interface PietroRunResult` with `runId`, `trigger`, `model`, `sourcesChecked`, `sourcesRefreshed`, `errorsEncountered`, `errors[]`, `durationMs`, `summary`
- System prompt describes Pietro's role: assess source health, dispatch stale minions, write report
- Agentic loop mirrors Iris exactly (max depth 8 for Pietro to handle more sources than Iris)
- `callLlm("anthropic", model, systemPrompt, ...)` — Anthropic provider only
- Sampling: `temperature: 0.1` (deterministic dispatch decisions), no `topP` (per integration-issues learning)

**Patterns to follow:**
- `artifacts/api-server/src/ai/iris/agent.ts` — exact structural mirror
- `artifacts/api-server/src/ai/iris/workspace.ts`

**Test scenarios:**
- Happy path: `runPietroAgent("health-check")` completes without throwing, returns `PietroRunResult` with `summary` string
- Edge case: `ANTHROPIC_API_KEY` absent → throws with readable error (same behavior as Iris)
- Edge case: `dispatch_minion` called with unknown slug → returns error in result, loop continues
- Integration: Pietro run history file is written after a successful run

**Verification:**
- `pnpm run typecheck` clean
- Pietro can be manually triggered via `runPietroAgent("manual")` and completes

---

- U7. **Pietro scheduler**

**Goal:** Wire Pietro's ambient scheduler module that dispatches minions on a cadence and start it alongside the existing ambient scheduler.

**Requirements:** R1, R2

**Dependencies:** U6

**Files:**
- Create: `artifacts/api-server/src/ai/ambient/pietro-scheduler.ts`
- Modify: `artifacts/api-server/src/index.ts`

**Approach:**
- `startPietroScheduler()` / `stopPietroScheduler()` — same `setInterval` / `clearInterval` pattern as `startAmbientScheduler`
- Tick cadence: every 60 minutes for scheduled prefetch; check `fetched_at` per source against per-kind TTL before dispatching
- Each tick: reads all `admin_resources` rows where kind is `source` or `mcp` and `daily_request_budget > 0 OR daily_request_budget IS NULL`; looks up `MINION_REGISTRY[row.slug]`; dispatches if stale; records result in `admin_resources.last_health_status` + `last_checked_at`
- `recordSchedulerCycle({ key: "pietro-data-refresh", ... })` at end of each tick
- In `index.ts`: `startPietroScheduler()` called alongside `startAmbientScheduler()` at startup; log `[pietro-scheduler] Starting`

**Patterns to follow:**
- `artifacts/api-server/src/ai/ambient/scheduler.ts`
- `artifacts/api-server/src/jobs/scheduler-run-tracker.ts` (recordSchedulerCycle)

**Test scenarios:**
- Happy path: scheduler starts without throwing; log line emitted
- Edge case: minion throws → error is caught, recorded, scheduler continues next tick
- Integration: After one tick, `last_checked_at` is updated for at least one admin_resources row

**Verification:**
- `pnpm run typecheck` clean
- Scheduler starts in Railway logs without errors

---

- U8. **Migration guard — admin_resource seed rows**

**Goal:** Seed the 7 active MCP/source rows into `admin_resources` via a runtime migration guard.

**Requirements:** R5

**Dependencies:** U1

**Files:**
- Create: `artifacts/api-server/src/migrations/pietro-resources-001.ts`
- Modify: `artifacts/api-server/src/migrations/migration-guards.json`

**Approach:**
- Inserts 7 rows (fred-extended, fmp-reit, daloopa-reit, booking-rates, expedia-rates, exa-search, context7) using `INSERT INTO admin_resources ... ON CONFLICT (kind, slug) DO NOTHING`
- Each row: kind, slug, displayName, description, config (baseUrl where applicable), secretRef
- `context7` row has `description: "Coding-session only — no production data fetched"` and `daily_request_budget: 0` (prevents minion dispatch)
- Registered in `migration-guards.json` with `"status": "guarded"`
- Guard is idempotent — safe to re-run on every boot

**Patterns to follow:**
- `artifacts/api-server/src/migrations/admin-resources-005.ts`

**Test scenarios:**
- Happy path: running the guard twice produces same DB state (idempotent)
- Integration: after boot, all 7 slugs present in `admin_resources`
- Edge case: guard runs on a DB that already has 3 of the 7 rows — 4 new rows inserted, 3 skipped

**Verification:**
- `pnpm --filter @workspace/scripts run check:migration-guards` passes
- All 7 rows present in production `admin_resources` after deploy

---

- U9. **Research catalog seed**

**Goal:** Seed research URL and prompt template rows into `admin_resources` for the hospitality research catalog.

**Requirements:** R7

**Dependencies:** U8

**Files:**
- Create: `artifacts/api-server/src/migrations/pietro-research-catalog-001.ts`
- Modify: `artifacts/api-server/src/migrations/migration-guards.json`

**Approach:**
- Insert `search_url` rows for: STR national trends (placeholder URL until direct link verified), CBRE hotel cap rate reports, HVS surveys, SEC EDGAR hotel REIT filter, FRED housing starts, BLS accommodation sector, Booking.com market overview, CBRE hotel research hub
- Insert `research_prompt` rows for: market-rate-analysis, reit-comp-analysis, competitive-set-research, investment-thesis-research
- Each `research_prompt` row stores the full prompt template in `config.template` as a JSONB string
- All URLs are `config.baseUrl` + `secretRef: null` (no secret needed for public URLs)
- `daily_request_budget: null` for all catalog rows (no minion dispatches against them)

**Patterns to follow:**
- `artifacts/api-server/src/migrations/pietro-resources-001.ts` (U8)

**Test scenarios:**
- Integration: all URL and prompt slugs present in `admin_resources` after deploy
- Edge case: guard is idempotent — re-running produces same state

**Verification:**
- Guard registered in `migration-guards.json`
- Rows visible in Admin → Sources accordion after U11 is complete

---

- U10. **Rebecca tools — probe, regenerate, get_status**

**Goal:** Add three new Rebecca tools that give agents agent-native access to Pietro's data infrastructure.

**Requirements:** R6 (parity), R1 (agent-native)

**Dependencies:** U1, U7 (Pietro scheduler needed for regenerate dispatch)

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Modify: `docs/discipline/agent-native-parity-map.md`

**Approach:**
- `get_data_source_status()` — queries `admin_resources` (all kinds), returns array of `{ slug, kind, displayName, lastHealthStatus, lastCheckedAt, dailyRequestBudget }`. No auth required beyond existing tool context.
- `probe_data_source({ id })` — wraps the existing `POST /api/admin/resources/:id/test` route logic inline (calls `runProbe` directly; no HTTP round-trip needed since we're in the same process). Returns `{ status, latencyMs, errorCode?, errorMessage? }`.
- `regenerate_data_source({ slug })` — looks up the `admin_resources` row by slug, dispatches the matching minion from `MINION_REGISTRY`, returns `MinionResult`. Validates that the slug has a registered minion; returns an error if not.
- Register all three in `getRebeccaTools()` array with clear descriptions mentioning which kinds of sources each applies to
- Add `case` branches in `dispatchRebeccaTool()` switch before `default`
- Update `docs/discipline/agent-native-parity-map.md` with 3 new ✅ rows

**Patterns to follow:**
- `artifacts/api-server/src/chat/rebecca-tools.ts` existing tool pattern (toolTriggerIrisRun for analogy)

**Test scenarios:**
- Happy path `get_data_source_status`: returns non-empty array containing at least the 7 seeded slugs
- Happy path `probe_data_source`: known slug with `FRED_API_KEY` set → `{ status: "ok" }`
- Error `probe_data_source`: unknown id → `{ result: { error: "Resource not found" } }`
- Happy path `regenerate_data_source`: known slug with API key set → returns MinionResult with `rowsUpserted >= 0`
- Error `regenerate_data_source`: slug with no registered minion → `{ result: { error: "No minion registered for slug: context7" } }`

**Verification:**
- All 3 tools appear in `getRebeccaTools()` output
- Parity map has ✅ rows for all 3
- `pnpm run typecheck` clean

---

- U11. **Admin Sources UI extension**

**Goal:** Extend the Admin → Sources accordion to show all resource kinds (api, source, model, mcp, search_url, research_prompt) with freshness dot, Analyst button, and Regenerate button (where applicable).

**Requirements:** R6

**Dependencies:** U8, U10 (seed rows must exist; Rebecca tool routes must be wired)

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/pages/admin/specialist/tabs/SourcesTab.tsx`
- Modify: `artifacts/api-server/src/routes/admin/sources-tab.ts` (or `resources.ts` — add Regenerate endpoint)
- Create: `artifacts/api-server/src/routes/admin/resources.ts` — add `POST /api/admin/resources/:id/regenerate` route

**Approach:**
- Add `POST /api/admin/resources/:id/regenerate` route that calls `regenerate_data_source` tool internally (or directly invokes the minion). Returns 202 + `MinionResult`. Rate-limited (same pattern as test button).
- In `SourcesTab.tsx`, fetch all `admin_resources` rows (all kinds) and render them in the existing accordion pattern. Current accordion shows only `api`/`source`/`model` kinds — extend to include `mcp`, `search_url`, `research_prompt`.
- Each expanded card: freshness dot (green/amber/red per TTL), kind badge, last-checked timestamp, config summary (no secrets), last health result
- **Analyst button**: present for all kinds — calls existing `POST /api/admin/resources/:id/test` endpoint; shows `SpecialistOrb` in `thinking` phase while running; updates freshness dot on completion
- **Regenerate button**: present only for kinds that have a registered minion (`source`, `mcp`, specifically the 5 data-fetching slugs); disabled for `search_url`, `research_prompt`, `context7`; calls new `POST .../regenerate` endpoint; shows running state inline
- Design gate: CLAUDE.md §11 — `/post-coding-design-review` must pass before marking done

**Patterns to follow:**
- `artifacts/hospitality-business-portal/src/pages/intelligence/SpecialistsDirectoryPage.tsx` — accordion + SpecialistOrb pattern
- `artifacts/api-server/src/routes/admin/resources.ts` — existing test button endpoint pattern
- `docs/solutions/architecture-patterns/sources-ux-status-analyst-button-2026-05-02.md`

**Test scenarios:**
- Happy path: Sources section renders all 7+ seeded slugs in accordion rows
- Happy path Analyst: clicking Analyst on `fred-extended` → orb spins → freshness dot updates
- Happy path Regenerate: clicking Regenerate on `fmp-reit` with FMP key set → shows running → MinionResult displayed inline
- Edge case Regenerate: clicking on `context7` → button is disabled (no minion)
- Edge case Regenerate: clicking on `market-rate-analysis` (research_prompt) → button absent

**Verification:**
- Design review passes (`/post-coding-design-review`)
- All accordion rows visible in Admin → Sources
- Analyst + Regenerate buttons functional in browser test

---

- U12. **Exa replaces Perplexity in callLlm**

**Goal:** Swap Perplexity for Exa as the web-grounded search provider in `callLlm` and `callLlmStream`.

**Requirements:** R8

**Dependencies:** None (can be built in parallel; no shared files with U1–U11)

**Files:**
- Modify: `artifacts/api-server/src/ai/clients.ts`
- Modify: `artifacts/api-server/src/routes/chat.ts`
- Modify: `artifacts/api-server/src/seeds/source-registry.ts`
- Create or install: Exa npm SDK (`npm install exa-js` or equivalent)

**Approach:**
- In `clients.ts`: replace `getPerplexityClient()` with `getExaClient()`. Reads `EXA_API_KEY` from env. Returns Exa client singleton. Perplexity import removed.
- In `chat.ts`:
  - Provider union type: replace `"perplexity"` with `"exa"` in `callLlm` and `callLlmStream` signatures
  - Replace the `if (provider === "perplexity")` branch with `if (provider === "exa")` that calls `exa.searchAndContents()` or `exa.search()`. Appends `\n\n**Sources:**\n` block to the response text (same as Perplexity citations).
  - New Exa branch must use `topP?: number` conditional-spread pattern (even if Exa doesn't use it) for type consistency
  - `ChatPolicyError` message updated to reference Exa
- In `source-registry.ts`: replace `perplexity` row with `exa` row (`serviceKey: "exa"`, `apiKeyRef: "EXA_API_KEY"`, `endpoint: "https://api.exa.ai"`)
- Cost logging: update from `service: "perplexity"` to `service: "exa"` in `logApiCost` call

**Patterns to follow:**
- Existing Perplexity branch in `chat.ts` as structural template (replace, don't add parallel)
- `docs/solutions/integration-issues/iris-llm-temperature-top-p-conflict-2026-05-08.md` — sampling guard

**Test scenarios:**
- Happy path: `callLlm("exa", model, ...)` with `EXA_API_KEY` set returns `{ text: "...\n\n**Sources:**\n[1] https://..." }`
- Edge case: `EXA_API_KEY` absent → `ChatPolicyError` thrown with readable message
- Error path: `webSearchEnabled === false` → `ChatPolicyError` (same as Perplexity behavior)
- Integration: Rebecca chat using Exa model returns web-grounded response with Sources block

**Verification:**
- `pnpm run typecheck` clean
- `check-magic-numbers` passes
- Rebecca chat with `provider = "exa"` and `EXA_API_KEY` set completes a web search turn

---

## System-Wide Impact

- **Interaction graph:** Pietro scheduler fires every 60 min; each minion writes to DB cache tables; `resource-health-checker` (existing 60s tick) continues independently and now covers `mcp`/`search_url`/`research_prompt` kinds. No overlap — different jobs, different purposes.
- **Error propagation:** Minion errors are collected into `MinionResult.errors[]` and stored in `admin_resources.last_health_status`; they do not propagate to users. Pietro agent errors follow Iris's pattern (logged, run history written, error re-thrown so caller can record).
- **State lifecycle risks:** `reit_benchmarks` and `competitor_rates` are append-on-conflict-update; queries should use `ORDER BY fetched_at DESC LIMIT 1` per key. No cleanup needed — stale rows persist but are never served first.
- **API surface parity:** Three new Rebecca tools documented in parity map. `POST /api/admin/resources/:id/regenerate` is new — must be documented in API spec if it exists.
- **Integration coverage:** End-to-end flow to verify: admin presses Regenerate → route calls minion → minion writes to DB → page refreshes → freshness dot turns green.
- **Unchanged invariants:** Existing `resource-health-checker` (60s), `ambient-scheduler` (macro rates/FRED), and Iris agent are unchanged. `getFactoryNumber()` continues to read from `market_benchmarks` as before.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| FMP free tier hits 250 req/day cap with 5 tickers × 4 quarters each run | `daily_request_budget` column enforces cap; scheduler respects it; cache TTL of 7 days reduces frequency |
| Exa SDK API surface is unfamiliar; wrong method call breaks web search | Research Exa SDK docs before implementing U12; `callLlm` has a test path with web search |
| Daloopa MCP response shape not yet known | MinionDaloopaReit reads `/tools/list` first; graceful degradation if key absent |
| Migration state drift (Iris tables incident pattern) | After each new SQL migration, verify hash in Neon `drizzle.__drizzle_migrations`; runtime guards are belt-and-suspenders |
| SourcesTab.tsx design review may require iteration | CLAUDE.md §11 design gate — run early before polish |

---

## Documentation / Operational Notes

- Set `EXA_API_KEY` in both Railway and Replit secrets before deploying U12
- Set `FMP_ACCESS_TOKEN` in Railway and Replit secrets before deploying U4
- `DALOOPA_API_KEY` is optional — minion degrades gracefully if absent
- After deploy: verify all 7 admin_resource slugs visible in Admin → Sources
- Add "Pietro" to CLAUDE.md §10 reserved names if not already done (already completed in prior session)
- Run `/hplus-resource-catalog` skill to verify final resource inventory

---

## Sources & References

- **Origin document:** [docs/brainstorms/pietro-data-infrastructure-requirements.md](docs/brainstorms/pietro-data-infrastructure-requirements.md)
- Iris agent pattern: `artifacts/api-server/src/ai/iris/agent.ts`
- Ambient fetcher pattern: `artifacts/api-server/src/ai/ambient/fetchers.ts`
- Admin resources schema: `lib/db/src/schema/admin-resource.ts`
- Related learnings: `docs/solutions/architecture-patterns/mcp-integration-surfaces-production-vs-claude-code-2026-05-08.md`
- Related learnings: `docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md`
- Related learnings: `docs/solutions/integration-issues/iris-llm-temperature-top-p-conflict-2026-05-08.md`
- Related learnings: `docs/solutions/database-issues/drizzle-migration-state-drift-missing-tables-2026-05-07.md`
