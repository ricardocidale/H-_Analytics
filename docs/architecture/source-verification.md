# Source Verification Architecture

How the platform tracks, verifies, and routes data sources for research quality.

---

## Source Registry

The `source_registry` table stores metadata for all 21 data sources:

| Column | Type | Purpose |
|--------|------|---------|
| `serviceKey` | text (unique) | Machine identifier (e.g., `fred`, `anthropic`, `tavily`) |
| `name` | text | Human-readable name |
| `sourceType` | enum | `api`, `llm`, `sdk`, `db` |
| `category` | text | Functional group (e.g., `macro_economic`, `ai_research`, `web_research`) |
| `endpoint` | text | Base URL (null for internal sources) |
| `apiKeyRef` | text | Env var name that holds the API key (null if no key needed) |
| `rateLimitPerMin` | integer | Requests per minute cap |
| `isActive` | boolean | Admin toggle — disabled sources excluded from health checks and prompts |
| `trustScore` | text | `verified`, `degraded`, `unreliable`, `unverified` |
| `successRate` | numeric | Rolling EMA success rate (0.0 to 1.0) |
| `avgLatencyMs` | integer | Most recent check latency |

Seeded by `server/seeds/source-registry.ts` (21 sources across 11 categories).

---

## Health Check Engine

Located in `server/ai/source-health-checker.ts`. Each source type has a tailored check strategy:

| Strategy | Sources | What it checks |
|----------|---------|---------------|
| **Client init** | Anthropic, OpenAI, Gemini, Perplexity | Env var present + SDK client instantiation succeeds |
| **Lightweight API ping** | FRED, Frankfurter | Actual HTTP request with timeout (5s) |
| **Redis PING** | Upstash Redis | `redis.ping()` via SDK |
| **DB query** | Hospitality Benchmarks | `SELECT count(*) FROM hospitality_benchmarks` |
| **Env var only** | Tavily, Pinecone, Resend, Sentry, PostHog, Google Maps, Walk Score, RapidAPI (x3), CoStar, Replicate, Apify | Checks env var is set |

**Key design choice:** LLM providers only verify client initialization, not actual API calls. This avoids cost and rate-limit consumption during health checks.

---

## Rolling Success Rate (EMA)

After each health check, the source's success rate is updated using an Exponential Moving Average:

```
successRate = successRate * 0.9 + (healthy ? 1 : 0) * 0.1
```

This gives recent results 10% weight while smoothing out transient failures. A source that was healthy for 20 checks then fails once drops to ~0.9 (still trusted), not 0.0.

---

## Trust Score Classification

| Score | Meaning | Prompt behavior |
|-------|---------|-----------------|
| `verified` | Most recent check passed | Included in source block, full confidence weight |
| `unverified` | Never checked (just seeded) | Included in source block (benefit of the doubt) |
| `degraded` | Recent failures but not consecutive | Included with reduced confidence weight |
| `unreliable` | Consecutive failures | Excluded from source block, confidence penalty applied |

---

## Automated Schedule

Health checks run on two triggers:

1. **Ambient data fetch** — every 6 hours, `checkAllSources()` runs alongside scheduled research refresh
2. **On-demand** — admin triggers via `POST /api/admin/sources/:serviceKey/check`

All 21 sources are checked in parallel using `Promise.allSettled()` so one timeout does not block others.

---

## Source-Aware Prompts

Research prompts dynamically include only healthy sources:

1. `getHealthySources(category?)` queries sources where `isActive = true` AND `trustScore IN ('verified', 'unverified')`
2. The prompt builder inserts a "Data Sources Available" block listing only healthy sources
3. When critical sources (e.g., FRED for macro data) are down, confidence scoring applies a penalty via the `sourceAvailability` factor

This prevents LLMs from hallucinating data from unavailable sources.

---

## Admin API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/sources` | GET | List all sources with current health status |
| `/api/admin/sources/:serviceKey/check` | POST | Trigger health check for a single source |
| `/api/admin/sources/:serviceKey/toggle` | PATCH | Toggle `isActive` on/off |
| `/api/admin/sources/check-all` | POST | Trigger health check for all sources |
