---
name: hplus-resource-catalog
description: "List, audit, and explain all external data resources integrated into H+ Analytics — APIs, MCPs, research URLs, and prompt templates. Use when asked 'what data sources do we have?', 'which MCPs are wired in?', 'what resources does Pietro manage?', or 'show me our unfair advantages in data'. Also use before planning new features that need market, financial, or hospitality data — surfaces what's already available so you don't rebuild what exists."
---

# H+ Resource Catalog

This skill surfaces the full inventory of external data resources integrated into H+ Analytics.
H+'s data moat is a strategic asset — a rich set of pre-populated financial, hospitality, and
market intelligence sources that ship pre-cached at runtime. This catalog documents what exists,
where it lives, and what it enables.

## When to use

- User asks "what data sources do we have?" or "which APIs/MCPs are active?"
- Planning a feature that needs financial, hospitality, or market data — check here first
- Auditing the Sources section before a new deploy
- Onboarding a new agent or session that needs to know what data is available
- Answering "what is our unfair advantage vs. competitor apps?"

## How to run

1. Read `admin_resources` via the live DB or admin API for current health status
2. Read `.mcp.json` for Claude Code session MCPs
3. Read `artifacts/api-server/src/ai/ambient/fetchers.ts` for scheduled ambient fetchers
4. Read `artifacts/api-server/src/ai/data-minions/` for Pietro's minion registry (when built)
5. Read `docs/brainstorms/pietro-data-infrastructure-requirements.md` for the full roadmap

Then present the catalog in the format below.

## The Resource Catalog

### Tier 1 — Pre-populated tables (no live API call at runtime)

These sources run on a schedule and cache data into DB tables. Users and agents read from
the cache instantly. **This is the moat.**

| Source | Kind | Data | Cadence | DB Table | Status |
|--------|------|------|---------|----------|--------|
| FRED | api | Mortgage rates, CPI, fed funds, treasury yields, employment | Daily | `market_benchmarks` | ✅ Live |
| FMP (Financial Modeling Prep) | mcp | Hotel REIT quarterly financials — FFO, NOI, cap rates, debt (HST, RHP, PEB, APLE, SHO) | Weekly | `reit_benchmarks` | ⏳ Planned (Pietro) |
| Daloopa | mcp | REIT financials from SEC filings, higher fidelity than FMP | Weekly | `reit_benchmarks` | ⏳ Planned (Pietro) |
| Booking.com (RapidAPI) | mcp | Competitor hotel rate snapshots by market | Weekly | `competitor_rates` | ⏳ Planned (Pietro) |
| Expedia (Apify) | mcp | Competitor hotel rate snapshots by market | Weekly | `competitor_rates` | ⏳ Planned (Pietro) |

### Tier 2 — On-demand (live API call, no pre-cache)

These sources are called in real-time when a user or agent requests them. Latency applies.

| Source | Kind | Data | Used by | Status |
|--------|------|------|---------|--------|
| Exa | mcp | Neural web search — market news, property intelligence, competitor research | Rebecca (replaces Perplexity) | ⏳ Planned (swap in `callLlm`) |
| Booking.com (search) | mcp | Live hotel availability and reviews for a specific query | Rebecca tools | ✅ Wired (`.mcp.json`) |
| Expedia (Apify search) | mcp | Live hotel search by location and date | Rebecca tools | ✅ Wired (`.mcp.json`) |
| Daloopa (document search) | mcp | SEC filing and earnings transcript search | Rebecca tools | ⏳ Planned |

### Tier 3 — Claude Code session only (development assistance, NOT production)

These are in `.mcp.json` and available to the AI assistant during coding. They do not reach
production users or Rebecca.

| Source | Kind | Data | Notes |
|--------|------|------|-------|
| FRED | mcp | FRED series lookup during development | Supplemental to live FRED integration |
| Context7 | mcp | Library documentation | Coding sessions only — no production value |
| FMP | mcp | REIT data lookup during development | Supplemental to Pietro's minion |
| Daloopa | mcp | REIT data lookup during development | Supplemental to Pietro's minion |

**Important:** Tier 3 MCPs never reach production users. See
`docs/solutions/architecture-patterns/mcp-integration-surfaces-production-vs-claude-code-2026-05-08.md`.

### Tier 4 — Research catalog (URLs and prompt templates)

Pre-populated reference links and prompt templates available to Rebecca and research
specialists without open-ended web searches.

| Category | Contents | Status |
|----------|----------|--------|
| Hotel market data | STR national trends, CBRE hotel cap rate reports, HVS surveys | ⏳ Planned (Pietro seed) |
| REIT filings | SEC EDGAR hotel REIT filter, Investor Relations pages | ⏳ Planned (Pietro seed) |
| Macro indicators | FRED housing starts, BLS accommodation sector, CBRE hotel research hub | ⏳ Planned (Pietro seed) |
| Prompt templates | cap-rate-benchmarking, reit-comp-analysis, competitive-set, investment-thesis | ⏳ Planned (Pietro seed) |

## The Strategic Picture

H+ Analytics has a data moat because:
1. **Pre-populated tables** — users get instant financial intelligence without search latency
2. **Breadth** — REIT comps + competitor rates + macro indicators + research prompts cover
   the full investment analysis workflow
3. **Agent-accessible** — every pre-populated table has a Rebecca tool, so future agents
   inherit the data layer automatically
4. **Health-monitored** — every source has a probe in `admin_resources`; admins see live
   status dots; Pietro auto-refreshes stale data

Competitor apps that build on top of raw LLMs start every analysis from scratch with a web
search. H+ starts every analysis from pre-populated institutional-grade data.

## Key files

| File | Contents |
|------|----------|
| `.mcp.json` | Claude Code session MCP config (Tier 3) |
| `admin_resources` table | All registered data sources with health status |
| `artifacts/api-server/src/ai/ambient/fetchers.ts` | FRED and ambient-data scheduled fetchers |
| `artifacts/api-server/src/ai/data-minions/` | Pietro's per-source minion fetchers (when built) |
| `artifacts/api-server/src/chat/rebecca-tools.ts` | Rebecca tools that expose cached data |
| `docs/brainstorms/pietro-data-infrastructure-requirements.md` | Full Pietro architecture requirements |
| `docs/discipline/agent-native-parity-map.md` | Parity tracking for all data tools |
| `lib/db/src/schema/data-tables.ts` | `reit_benchmarks`, `competitor_rates` schema (when built) |

## Adding a new source

Use the `external-data-source-integration` skill. It codifies the five-layer pattern
(admin_resources row + minion + DB table + Rebecca tool + parity map entry) and includes
a pre-merge checklist.
