---
title: Pietro — Financial Data Infrastructure Agent
status: draft
date: 2026-05-08
---

# Pietro — Financial Data Infrastructure Agent

## Problem

H+ Analytics needs reliable, pre-populated market and financial data available at runtime — REIT
benchmarks, competitor hotel rates, macro indicators — without requiring live API calls during
user interactions. The existing `admin_resources` table and `ambient-fetcher` scheduler provide
the infrastructure pattern (FRED is the working template), but they cover only a fraction of the
available data sources. MCPs, research URLs, and prompt templates are not yet first-class
resources.

The gap is architectural: no single agent owns data infrastructure across the platform.
Iris owns Rebecca's KB. Gustavo owns research specialist dispatch. Neither owns the scheduled
data pipelines that future financial and analysis agents will depend on.

## Solution

Introduce **Pietro**, a new dedicated orchestrator whose identity is "financial and market data
infrastructure for all H+ agents." Pietro dispatches deterministic per-source minions, monitors
their health, pre-populates DB tables on a schedule, and surfaces status to admins via the
existing Sources & Resources section.

## Primary Users

- **Admin users** — see live health status of all data sources; trigger manual refreshes
- **Rebecca** — calls pre-populated data via existing tool dispatch
- **Research specialists (Gustavo's swarm)** — read from pre-populated tables without live API calls
- **Future financial/analysis agents** — inherit the pre-populated data layer without rebuilding it

## Requirements

### R1 — Pietro agent

Pietro is a new LLM-backed orchestrator (CLAUDE.md §10: Italian male name, orchestrator role).

- **Role**: "Financial & Market Data Infrastructure Orchestrator"
- **Identity**: Distinct from Iris (KB maintenance) and Gustavo (research dispatch)
- **Triggers**: `scheduled-prefetch`, `manual-refresh`, `health-check`, `source-added`
- **Behavior**: On each trigger, Pietro assesses which sources are stale or unhealthy, dispatches
  the relevant minions, collects results, and writes a health summary to `admin_resources`
- **CLAUDE.md §10**: Reserve "Pietro" — add to reserved names list

### R2 — Per-source minions (deterministic, no LLM)

One minion per data source. Each minion:
- Fetches from its assigned API/MCP
- Transforms the response into the canonical DB schema
- Upserts into the target table
- Returns a structured result to Pietro (rows fetched, errors, latency)

**Initial minion set (phased):**

Phase 1 — Pre-populated, scheduled:
- `MinionFredExtended` — adds hospitality FRED series (CUUR0000SEHB, regional hotel employment) to existing `market_benchmarks`
- `MinionFmpReit` — fetches quarterly fundamentals for HST, RHP, PEB, APLE, SHO from FMP → `reit_benchmarks`
- `MinionDaloopaReit` — same tickers via Daloopa (richer data if key available; falls back to FMP) → `reit_benchmarks`
- `MinionBookingRates` — weekly competitor rate snapshots for key markets (Miami, NYC, Denver, etc.) via RapidAPI → `competitor_rates`
- `MinionExpediaRates` — same markets via Apify Expedia scraper → `competitor_rates`

Phase 2 — On-demand / realtime:
- `MinionExa` — wraps Exa search; replaces Perplexity in `callLlm` for web-grounded research

### R3 — New DB tables

- `reit_benchmarks` — REIT company, ticker, metric_key, value, period, source, fetched_at
- `competitor_rates` — market, property_category, check_in_date, avg_rate, source, fetched_at
- Existing `market_benchmarks` — extended with new FRED series (no schema change needed)

All tables include a `fetched_at` timestamp. Pietro reads `fetched_at` to decide whether data
is stale before dispatching a minion.

### R4 — `admin_resources` extended

New resource kinds added to `RESOURCE_KINDS`:
- `mcp` — an MCP server (remote HTTP or local stdio)
- `search_url` — a research URL or link catalog entry
- `research_prompt` — a prompt template used by specialists or Rebecca

New column on `admin_resources`:
- `daily_request_budget: integer | null` — max requests per day for rate-limited sources.
  Pietro's scheduler respects this ceiling before dispatching minions.

New probe profile for `mcp` kind:
- TTL: 300s (same as `source`)
- Probe: HTTP GET to the MCP server's health endpoint or `/tools/list`; success = 200 + valid JSON

### R5 — Pre-populated seed data

On first deploy, seed `admin_resources` with all active sources:

| Slug | Kind | Secret ref | Notes |
|------|------|------------|-------|
| `fred-extended` | source | `FRED_API_KEY` | Additional FRED series |
| `fmp-reit` | mcp | `FMP_ACCESS_TOKEN` | Financial Modeling Prep |
| `daloopa-reit` | mcp | `DALOOPA_API_KEY` | Falls back to FMP if key absent |
| `booking-rates` | mcp | `RAPIDAPI_KEY` | RapidAPI/Booking.com |
| `expedia-rates` | mcp | `APIFY_API_TOKEN` | Apify Expedia scraper |
| `exa-search` | mcp | `EXA_API_KEY` | On-demand search |
| `context7` | mcp | — | Coding-session only; no production data |

Research URL and prompt rows seeded separately (R7).

### R6 — Admin UI — Sources section

Extend the existing Sources & Resources section in Admin to show all resource kinds (api,
source, model, mcp, search_url, research_prompt) in accordion rows.

Each row shows:
- Freshness dot (green = within TTL, amber = approaching, red = stale/failed)
- Resource display name, kind badge, last-checked timestamp

Expanded card shows:
- Config summary (baseUrl, kind-specific metadata — no secrets displayed)
- Last health result (latency, error code if failed)
- **"Analyst" button** — triggers a manual probe of this specific resource (POST
  `/api/admin/resources/:id/probe`). Shows the SpecialistOrb in `thinking` phase while
  running. Displays result inline.
- **"Regenerate" button** (pre-populate kinds only) — triggers Pietro to dispatch the
  minion for this source and refresh its DB table. Disabled for `search_url` and
  `research_prompt` kinds.

Agent-native parity (CLAUDE.md §7): all admin UI actions have Rebecca tool equivalents:
- `probe_data_source(id)` — triggers a manual probe
- `regenerate_data_source(id)` — triggers Pietro to refresh a source's table
- `get_data_source_status()` — returns health summary for all sources

### R7 — Research catalog (URLs and prompts)

Pre-populate `admin_resources` with research URLs and prompt templates for key hospitality
intelligence topics. These give Rebecca and research specialists a curated starting point
without open-ended web searches.

**Research URL categories to seed:**
- Hotel market data: STR national trends page, CBRE hotel cap rate reports, HVS surveys
- REIT filings: SEC EDGAR hotel REIT filter, Investor Relations pages for HST/RHP/PEB/APLE
- Macro: FRED housing starts, FRED hospitality employment, BLS accommodation sector
- Competitive intelligence: Booking.com market overview pages, CBRE hotel research hub

**Research prompt templates to seed:**
- `market-rate-analysis` — template for cap rate benchmarking by market
- `reit-comp-analysis` — template for comparing a target property to public REIT comps
- `competitive-set-research` — template for competitor hotel analysis
- `investment-thesis-research` — template for operator/market due diligence

### R8 — Exa replaces Perplexity in `callLlm`

In `artifacts/api-server/src/routes/chat.ts`, the Perplexity provider branch is the current
web-grounded search path. When `EXA_API_KEY` is set and the admin has enabled Exa as the web
search provider, route web-grounded queries through the Exa MCP instead.

This is a provider-swap, not an architecture change. The admin toggle in Rebecca Configuration
→ Knowledge & Sources → Web Search controls which provider is active.

## Scope Boundaries

**In scope:**
- Pietro agent, minion set, DB tables, admin_resources extension, Sources UI, seed data, Exa swap

**Deferred:**
- FactSet (requires subscription)
- Expedia official API (partner-gated, months to obtain)
- Per-property competitor rate scraping (high volume, complex deduplication)
- Natural-language "ask Pietro" from Rebecca chat (future when pattern stabilizes)

**Out of scope permanently:**
- Context7, Gmail, Calendar, GoDaddy, DocuSign, Eraser, Excalidraw, Fireflies, Datadog (wrong domain)
- Financial engine changes (ADR-007 — Pietro's minions write to DB; engine reads from DB via existing `getFactoryNumber()`)
- Iris scope changes

## Success Criteria

- Admin → Sources section shows all MCPs and data sources with live freshness dots
- REIT benchmark data (HST, RHP, PEB, APLE, SHO) is available from DB without any live API call
- Competitor rate snapshots for 3+ key markets available from DB
- Analyst button works per resource (manual probe)
- Regenerate button refreshes a source's DB table
- Rebecca can answer "what is the current cap rate for US luxury hotels?" from cached DB data
- All new admin UI actions have Rebecca tool equivalents (parity map updated)
- `daily_request_budget` respected for rate-limited sources
- CLAUDE.md §10 updated to reserve "Pietro"

## Agent Naming (CLAUDE.md §10)

| Name | Role | Type |
|------|------|------|
| **Pietro** | Financial & Market Data Infrastructure Orchestrator | Orchestrator |
| MinionFredExtended | FRED extended series fetcher | Minion |
| MinionFmpReit | FMP REIT fundamentals fetcher | Minion |
| MinionDaloopaReit | Daloopa REIT fundamentals fetcher | Minion |
| MinionBookingRates | Booking.com competitor rate fetcher | Minion |
| MinionExpediaRates | Expedia competitor rate fetcher | Minion |
| MinionExa | Exa web search wrapper | Minion |
