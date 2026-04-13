---
name: Source Health Verification
description: Data source registry, health checking, trust scoring, source-aware research prompts
---

# Source Health Verification Skill

## Overview

The platform maintains a registry of 21 data sources with automated health checking. Research prompts dynamically include only healthy sources to prevent hallucination.

## Source Registry

`source_registry` table (seeded by `server/seeds/source-registry.ts`):
- 21 sources across 11 categories
- Each source has: `serviceKey`, `sourceType` (api/llm/sdk/db), `category`, `apiKeyRef`, `trustScore`
- `isActive` toggle allows admin to disable sources without deleting them

## Health Check Strategies

Located in `server/ai/source-health-checker.ts`:

| Strategy | Sources |
|----------|---------|
| Client init (no API call) | Anthropic, OpenAI, Gemini, Perplexity |
| Lightweight HTTP ping | FRED, Frankfurter |
| SDK ping | Upstash Redis |
| DB row count | Hospitality Benchmarks |
| Env var check only | Tavily, Pinecone, Resend, Sentry, PostHog, Google Maps, Walk Score, RapidAPI (x3), CoStar, Replicate, Apify |

## Trust Score Flow

1. Health check runs -> returns `healthy: boolean` + `latencyMs`
2. `successRate` updated via EMA: `rate = rate * 0.9 + (healthy ? 1 : 0) * 0.1`
3. `trustScore` set to `verified` (passed) or `unreliable` (failed)
4. Research prompts call `getHealthySources()` which returns sources where `isActive = true AND trustScore IN ('verified', 'unverified')`

## Critical Rules

- **Always call `getHealthySources()` before building research prompts.** Never hardcode source lists.
- LLM health checks verify client init only — never make actual API calls (costs money).
- All 21 sources checked in parallel via `Promise.allSettled()`.
- When critical sources are down, confidence scoring applies a penalty via `sourceAvailability` factor.

## Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `checkSourceHealth(key)` | `server/ai/source-health-checker.ts` | Check one source |
| `checkAllSources()` | same | Check all 21 sources in parallel |
| `getHealthySources(category?)` | same | Get active, trusted source keys |

## Key Files

- `server/seeds/source-registry.ts` — 21 source seed definitions
- `server/ai/source-health-checker.ts` — health check engine
- `server/ai/research-prompt-builders.ts` — source-aware prompt building
- `server/ai/confidence-scorer.ts` — 7-factor confidence scoring
- `shared/schema/` — `sourceRegistry` table definition

## See Also

- `docs/architecture/source-verification.md` — full architecture reference
- `docs/architecture/intelligence-pipeline.md` — end-to-end research flow
- `research/SKILL.md` — research engine master skill
