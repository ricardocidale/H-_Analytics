---
name: market-intelligence
description: Three-service market intelligence pipeline (FRED rates, hospitality benchmarks, grounded research). Covers aggregator pattern, caching, circuit breakers, and BaseIntegrationService. Load when working on market data, integration health, or adding new external services.
---

# Market Intelligence Pipeline

## Purpose

Documents the three-service market intelligence system that aggregates real-time macro rates (FRED), hospitality benchmarks (CoStar/STR), and grounded web research (Perplexity/Tavily) into a unified `MarketIntelligence` response. Used by funding strategy, property research, and ICP analysis.

## Sub-Skills

| File | What It Covers |
|------|----------------|
| `adding-integrations.md` | How to add new integration services, debug failures, BaseIntegrationService pattern |

## Key Files

| File | Purpose |
|------|---------|
| `server/services/MarketIntelligenceAggregator.ts` | Orchestrator: `Promise.allSettled` across 3 services |
| `server/services/FREDService.ts` | Federal Reserve FRED API (SOFR, Treasury, CPI, Prime) |
| `server/services/HospitalityBenchmarkService.ts` | Hospitality benchmarks (ADR, occupancy, RevPAR) |
| `server/services/GroundedResearchService.ts` | Grounded web research (Perplexity or Tavily) |
| `server/integrations/base.ts` | `BaseIntegrationService` — circuit breaker, retry, cache, Sentry |
| `shared/market-intelligence.ts` | Shared types: `MarketIntelligence`, `FREDRateData`, `HospitalityBenchmarks` |
| `server/cache.ts` | In-memory cache with `cacheThrough()` and `staleWhileRevalidate()` |

## Architecture

```
MarketIntelligenceAggregator.gather(query)
  │
  ├── Promise.allSettled([
  │     FREDService.fetchAllRates()          → { sofr, treasury2y/5y/10y, prime, cpi }
  │     HospitalityBenchmarkService.fetch()  → { adr, occupancy, revpar, marketCap }
  │     GroundedResearchService.search()     → [{ title, url, snippet, source }]
  │   ])
  │
  ├── Collect partial results (no single failure blocks others)
  ├── Collect per-service errors
  └── Return MarketIntelligence { rates, benchmarks, groundedResearch, errors, fetchedAt }
```

**Singleton:** `getMarketIntelligenceAggregator()` returns the shared instance.

## Caching Strategy

| Service | Cache TTL | Strategy |
|---------|----------|----------|
| FRED rates | 24 hours | `cacheThrough()` (block until fresh) |
| Hospitality benchmarks | 7 days | `cacheThrough()` |
| Property-level MI | 7 days | `staleWhileRevalidate()` (return stale, update in background) |
| Grounded research | Not cached | Fresh per request |

## Key Types

```typescript
interface MarketIntelligence {
  rates: { sofr, treasury2y, treasury5y, treasury10y, primeRate, cpi };  // FREDRateData per key
  benchmarks?: HospitalityBenchmarks;
  groundedResearch: GroundedSearchResult[];
  fetchedAt: string;
  errors: string[];     // Per-service error messages (partial failure)
}

interface FREDRateData {
  value: number;
  date: string;
  history?: { date: string; value: number }[];
}
```

## Service Availability

All services are **optional** — missing API keys return null/empty, not errors:
- FRED: `FRED_API_KEY` env var
- Hospitality: `COSTAR_API_KEY` / `STR_API_KEY` / `AIRDNA_API_KEY`
- Grounded: `PERPLEXITY_API_KEY` or `TAVILY_API_KEY`

`getServiceStatus()` returns `{ fred: boolean, hospitality: boolean, grounded: boolean }`.

## Circuit Breaker (BaseIntegrationService)

All external services extend `BaseIntegrationService` from `server/integrations/base.ts`:

| State | Behavior | Transition |
|-------|----------|------------|
| **Closed** | Requests flow normally | → Open after 5 failures in 60s window |
| **Open** | Requests rejected immediately | → Half-Open after 30s cooldown |
| **Half-Open** | One probe request allowed | → Closed (if success) or → Open (if failure) |

**Retry:** Exponential backoff (200ms base, 5s max, 3 attempts). Only retries transient errors (5xx, timeout, ECONNRESET). 4xx errors fail immediately.

## Admin Integration Health

`GET /api/admin/integrations/health` — returns circuit state, latency, last error for each registered service. Displayed in Admin → Integrations tab.

## Related Rules

- `.claude/rules/error-handling.md` — Structured logging, domain tags
- `.claude/rules/domain-boundaries.md` — Notifications domain uses Resend

## Related Skills

- `.claude/skills/funding-strategy/SKILL.md` — Uses FRED rates for SAFE term calibration
- `.claude/skills/research/SKILL.md` — Uses MI for property research context
