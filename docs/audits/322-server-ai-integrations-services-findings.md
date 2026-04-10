# Audit #322 — Server AI, Integrations & Services

**Auditor**: Opus (automated deep review)  
**Date**: 2026-04-10  
**Scope**: `server/ai/` (21 files, 5,055 lines), `server/services/` (20 files, 3,300 lines), `server/integrations/` (5 files, 1,391 lines), `server/notifications/` (2 files, 165 lines), `server/document-ai/` (2 files, 679 lines), `server/image/` (2 files, 229 lines)  
**Total**: 52 files, ~10,819 lines

---

## Verdict: **PASS** — 0 Critical, 1 High, 4 Medium, 6 Low

---

## Architecture Summary

### AI Layer (`server/ai/`)
- **Singleton client factories** (`clients.ts`): Lazy-init OpenAI, Anthropic, Gemini, Perplexity — one TCP connection pool per vendor. Proper fail-fast when API keys missing.
- **LLM resolution** (`resolve-llm.ts`): 8 domain slots (companyLlm → graphicsLlm), tab-level defaults, dual-model support with configurable primary/secondary per domain. `normalizeModelId()` maps deprecated Claude models to current versions.
- **Research orchestrator** (`research-orchestrator.ts`): N+1 parallel synthesis — two analyst panels (Gemini quantitative + Claude market-strategy) run concurrently, validated against live market data APIs, then synthesized by Claude Opus with streaming. Includes temporal decay for prior research relevance, progressive relaxation for comparable sets, and Pinecone-backed research memory.
- **Multi-vendor research client** (`research-client.ts`): Adapter pattern — `AnthropicResearchClient`, `OpenAIResearchClient`, `GeminiResearchClient` all implement `ResearchClient` interface. Supports tool use across all three vendors with format translation.
- **Pinecone service** (`pinecone-service.ts`): 7 namespaces (knowledge-base, research-history, comparables, assumption-guidance, documents, scenarios, properties). Embedding via `text-embedding-3-small` (1536 dims). Batch upserts in groups of 100.
- **Ambient schedulers**: Benchmark refresh (6h interval) and scheduled research workflows (15min check cycle with Anthropic batch API at 50% cost).
- **Rebecca context builder**: Structured context packs for property/company entities with field-level assumption guidance for the chatbot.

### Services Layer (`server/services/`)
- **Two-tier base class architecture**: `server/services/BaseIntegrationService.ts` (simple circuit breaker + `fetchWithTimeout`) used by 17 market data services. Separate `server/integrations/base.ts` (richer circuit breaker with retry, cache-through, Sentry tracing) used by 4 core integrations (geospatial, document-ai, resend, replicate).
- **MarketIntelligenceAggregator**: Orchestrates 14 parallel data sources via `Promise.allSettled`. Per-property caching (7-day TTL with stale-while-revalidate). Data recency validation with warning/critical thresholds (90/365 days).
- **RapidAPI key router**: 3-slot key routing by subscription (primary/secondary/tertiary) mapped to specific API subscriptions per account.

### Integrations Layer (`server/integrations/`)
- **Geospatial**: Google Maps geocoding, Places autocomplete, nearby POI search with haversine distance. In-memory geocode cache + 30-day places cache.
- **Resend**: Branded HTML email templates with dynamic theme colors. 7 email types (report share, scenario comparison, welcome, invitation, password reset, scenario share, admin share).
- **Document AI**: Google Document AI with fallback to simulated extraction. Object storage integration for PDF processing.
- **Replicate**: AI image generation with style presets, polling-based prediction lifecycle, 120s timeout.

---

## Findings

### HIGH (1)

#### H-1: Notification `actionUrl` is always `undefined` (dead code)
**File**: `server/notifications/engine.ts:39`
```typescript
actionUrl: event.link ? undefined : undefined,
```
Both branches evaluate to `undefined`. The notification email will never contain an action URL regardless of whether `event.link` is set. This means alert breach emails (DSCR, cap rate, occupancy, NOI variance) never include a link back to the affected property, reducing their usefulness.

**Impact**: All notification emails sent via `processNotificationEvent` will lack the action URL. Users receiving threshold breach alerts must manually navigate to the property.

**Fix**: Change to `actionUrl: event.link || undefined`.

---

### MEDIUM (4)

#### M-1: Duplicate `BaseIntegrationService` classes with divergent behavior
**Files**: `server/services/BaseIntegrationService.ts` (79 lines) vs. `server/integrations/base.ts` (182 lines)

Two separate base classes with the same name provide different resilience patterns:
- **services/** version: Simple circuit breaker (5 failures / 60s window), `AbortSignal.timeout()` on fetch.
- **integrations/** version: Configurable circuit breaker with half-open probe, exponential backoff retry, cache-through, Sentry span tracing.

17 services extend the simpler version; 4 integrations extend the richer version. The services version lacks retry and observability, meaning all 17 market data services will fail permanently on transient network blips without retry.

**Impact**: Market data fetches (FRED, CoStar, Xotelo, etc.) have no retry — a single timeout fails the request. The aggregator catches this via `Promise.allSettled`, so it's non-fatal but reduces data completeness.

**Recommendation**: Either merge the two classes or add retry to the services version.

#### M-2: `as any` casts in research-scheduler for JSONB storage
**Files**: `server/ai/ambient/research-scheduler.ts` (lines 57, 102, 108, 224, 227, 290)

Six `as any` casts used when reading `researchConfig` keys and constructing JSONB payloads for `upsertMarketResearch`. The `researchConfig[contextKey as keyof ResearchConfig]` cast bypasses the strict typing on `ResearchConfig`, and the JSONB content/promptConditions objects are cast to avoid creating proper interfaces.

**Impact**: Type drift risk — if `ResearchConfig` shape changes, the scheduler will silently produce malformed data.

**Recommendation**: Define explicit interfaces for scheduled research content/promptConditions payloads.

#### M-3: Hardcoded 8-second sleep during Pinecone index creation
**File**: `server/ai/pinecone-service.ts:120`
```typescript
await new Promise(r => setTimeout(r, 8_000));
```
After creating the Pinecone index, the code blindly waits 8 seconds hoping the index is ready. Pinecone serverless index creation can take 10-30+ seconds depending on region. If the index isn't ready, subsequent operations will fail with transient errors (which are not retried by this code).

**Impact**: Possible startup race condition on first deployment. Low probability since the index is created once and the mutex pattern prevents concurrent creation. The `_indexReady` flag prevents re-checking.

**Recommendation**: Poll `describeIndex()` until status is "Ready" instead of sleeping.

#### M-4: `rebecca-context-builder.ts` uses 5 `as any` casts for missing type fields
**File**: `server/ai/rebecca-context-builder.ts` (lines 122, 133-136, 164)

The service template query returns objects without `defaultRate`, `serviceModel`, `serviceMarkup`, `isActive` in their types, requiring `(t as any).defaultRate` pattern. Similarly, `(ga as any)?.icpConfig` suggests `GlobalAssumptions` type is missing the `icpConfig` field.

**Impact**: If these fields are renamed in the schema, the context builder silently produces zero/null values without any type error.

**Recommendation**: Extend the `ServiceTemplate` and `GlobalAssumptions` types to include these fields, or create a storage method that returns properly typed data.

---

### LOW (6)

#### L-1: Empty `catch {}` blocks suppress errors silently
**Files**: 
- `server/ai/aiResearch.ts:97` (JSON parse failure returns `rawResponse` — acceptable)
- `server/ai/pinecone-service.ts:266, 341` (vectorCount/totalVectorCount return 0 — acceptable)
- `server/ai/knowledge-base.ts:80`
- `server/ai/ambient/research-scheduler.ts:81, 183, 307`
- `server/ai/comparables/relaxation-engine.ts:58`

Total: 8 empty catch blocks across AI layer. Most are intentional non-blocking patterns (benchmark loading, Pinecone stats) but lack even a debug-level log. The scheduler's `catch { return; }` at line 183 silently skips batch processing when Anthropic client creation fails.

#### L-2: `isTransientError` heuristic in `integrations/base.ts` uses fragile string matching
**File**: `server/integrations/base.ts:175`
```typescript
return msg.includes("5") && msg.includes("error");
```
This matches any error message containing the digit "5" and the word "error" — e.g., "5 items failed" or "Error in step 5" would incorrectly trigger a retry.

#### L-3: In-memory caches in geospatial integration have no size limit
**File**: `server/integrations/geospatial.ts:7-9`

`geocodeCache` and `placesCache` are unbounded `Map` instances. In a long-running production process with many unique addresses, these will grow indefinitely. The places cache has TTL-based expiry but no eviction, meaning expired entries are only skipped on read, never removed.

#### L-4: Document AI fallback produces hardcoded simulated data
**File**: `server/integrations/document-ai.ts:168-209`

When Document AI is not configured (no `GOOGLE_CLOUD_PROJECT`), `simulateExtraction()` returns fixed financial data ($2.1M revenue, 72% occupancy, etc.). This simulated data could be mistakenly treated as real extraction results downstream.

The fallback is also triggered on any Document AI API error (line 119-122), meaning production failures silently return fake data.

#### L-5: Resend integration creates a new client per email
**File**: `server/integrations/resend.ts:17-19`

`getClient()` instantiates a new `Resend` object on every call. Unlike the AI clients in `clients.ts` which use lazy singletons, this creates unnecessary objects. Low impact since Resend is stateless, but inconsistent with the codebase pattern.

#### L-6: Research orchestrator assumes synthesis model is always Anthropic
**File**: `server/ai/research-orchestrator.ts:383-390`

The synthesis phase hardcodes `getAnthropicClient()` for streaming, even though `SYNTHESIS_MODEL` is configurable via `modelOverrides.synthesisModel`. If a user overrides the synthesis model to a Gemini or OpenAI model, the code still uses the Anthropic streaming API, which would fail or produce incorrect results.

---

## Positive Observations

1. **N+1 parallel research architecture**: The orchestrator's design (dual analyst panels → API validation → synthesis) with temporal decay on prior research is genuinely sophisticated. The single-panel fallback mode and confidence calibration are well-engineered.

2. **Robust aggregator fault isolation**: `MarketIntelligenceAggregator.gather()` uses `Promise.allSettled` for all 14 data sources. Individual service failures are captured as error strings without blocking other sources. The `isOn()` guard respects admin toggle settings per integration.

3. **Data recency validation**: The `validateRecency()` function checks every data point's age against 90-day warning and 365-day critical thresholds, logging appropriately. This prevents stale market data from silently degrading research quality.

4. **Proper circuit breaker implementations**: Both base classes implement circuit breaker patterns. The integrations version includes half-open probe recovery. The services version uses `AbortSignal.timeout()` for request timeouts — clean and non-leaky.

5. **Consistent error handling in catch blocks**: Most catch blocks (40+ across the scope) correctly use `err instanceof Error ? err.message : String(err)` pattern. The `error: unknown` annotation is present in critical paths (base.ts retry, resend health check).

6. **Ambient scheduler mutual exclusion**: Both schedulers (`scheduler.ts` and `research-scheduler.ts`) use `isRunning` boolean guards to prevent concurrent execution. The benchmark scheduler also protects interval cleanup on stop.

7. **Pinecone index creation mutex**: `ensureIndex()` uses a promise-based mutex (`_ensureIndexPromise`) to prevent concurrent index creation during startup — correct concurrency pattern.

8. **Branded email templates**: The Resend integration produces production-quality HTML emails with responsive design, dynamic theme colors from the admin panel, and proper XSS protection via `esc()` helper.

9. **RapidAPI key routing by subscription**: The 3-slot router correctly maps API endpoints to the specific key that has the subscription, verified by live probing (documented in comments).

10. **Stale-while-revalidate caching**: Market data services consistently use `cache.staleWhileRevalidate()` for data freshness with background refresh — users get fast responses with eventually-consistent data.

---

## `as any` Inventory (AI/Integrations/Services scope)

| File | Count | Context |
|------|-------|---------|
| `ambient/research-scheduler.ts` | 7 | ResearchConfig keys, JSONB payloads |
| `rebecca-context-builder.ts` | 5 | Missing type fields on GA/templates |
| `research-client.ts` | 2 | Gemini tools cast, schema cleanup |
| `pinecone-service.ts` | 1 | Pinecone upsert records format |
| **Total** | **15** | |

---

## Catch Block Summary

| Pattern | Count |
|---------|-------|
| `catch (err)` with proper logging | 38 |
| `catch (error: unknown)` with proper handling | 5 |
| `catch (error)` (untyped) with logging | 12 |
| `catch {}` empty (silent) | 8 |
| **Total** | **63** |

---

## Files Reviewed (52)

### server/ai/ (21 files)
- `clients.ts` — Singleton AI SDK factories
- `resolve-llm.ts` — Domain-based LLM resolution with vendor fallback
- `research-orchestrator.ts` — N+1 parallel synthesis engine
- `research-client.ts` — Multi-vendor research adapter (Anthropic/OpenAI/Gemini)
- `research-prompt-builders.ts` — Prompt construction for research types
- `research-tool-prompts.ts` — Tool call handlers
- `research-validation.ts` — API validation cross-checks
- `research-value-extractor.ts` — Value extraction from research output
- `research-resources.ts` — Skill/tool definition loading
- `aiResearch.ts` — Research generation with tool loop
- `pinecone-service.ts` — Vector store operations (7 namespaces)
- `pinecone-indexing.ts` — Domain-specific Pinecone indexing
- `rebecca-context-builder.ts` — Rebecca chatbot context packs
- `knowledge-base.ts` — Knowledge base management
- `kb-content.ts` — Knowledge base content definitions
- `buildPropertyContext.ts` — Property context for AI
- `asset-intelligence.ts` — Asset intelligence features
- `agentSkillsExport.ts` — Agent skill export utilities
- `ambient/scheduler.ts` — Benchmark refresh scheduler (6h)
- `ambient/research-scheduler.ts` — Scheduled research workflow runner
- `ambient/fetchers.ts` — FRED/hospitality benchmark fetchers
- `ambient/index.ts` — Ambient module barrel

### server/services/ (20 files)
- `BaseIntegrationService.ts` — Circuit breaker + timeout base class
- `MarketIntelligenceAggregator.ts` — 14-source parallel aggregator
- `rapidApiKeyRouter.ts` — 3-slot RapidAPI key routing
- `FREDService.ts`, `AlphaVantageService.ts`, `CoStarService.ts`, `MoodysService.ts`, `SPGlobalService.ts`, `HospitalityBenchmarkService.ts`, `GroundedResearchService.ts`, `XoteloService.ts`, `ApifyService.ts`, `RapidApiHospitalityService.ts`, `WeatherService.ts`, `OpenExchangeRatesService.ts`, `WorldBankService.ts`, `FinancialNewsService.ts`, `WalkScoreService.ts`, `RealtyService.ts`, `USRealEstateService.ts`

### server/integrations/ (5 files)
- `base.ts` — Rich circuit breaker with retry/cache/tracing
- `geospatial.ts` — Google Maps geocoding + places
- `resend.ts` — Branded email delivery (7 templates)
- `document-ai.ts` — Google Document AI extraction
- `replicate.ts` — AI image generation via Replicate

### server/notifications/ (2 files)
- `engine.ts` — Alert rule evaluation + notification dispatch
- `events.ts` — Event type definitions + labels

### server/document-ai/ (2 files)
- `field-mapper.ts` — Fuzzy field mapping for document extraction
- `templates.ts` — Document AI template definitions

### server/image/ (2 files)
- `pipeline.ts` — Sharp image processing + variant generation
- `variants.ts` — Image variant specifications
