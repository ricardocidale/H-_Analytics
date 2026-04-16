# ADR-001: Self-Managing AI Engine

**Status:** Proposed
**Date:** 2026-04-16
**Deciders:** Ricardo Cidale (Founder), Engineering

## Context

H+ Analytics positions the Norfolk AI Engine as its unfair advantage. Today, the engine's LLM infrastructure is **manually managed** — an admin must click "Refresh Models" to update available models, manually select which LLM powers each function, and has no automated alerting when a chosen model becomes unavailable.

This creates three problems:
1. **Stale model lists** — New models (Claude 4, GPT-5, Gemini 3) ship monthly. We show outdated options.
2. **No intelligent defaults** — Admin picks models by name. The system doesn't know that Claude Opus is best for synthesis while Gemini Flash is best for speed.
3. **Silent failures** — If an admin-selected model is deprecated or throttled, research runs fail with no notification.

The engine should be smart enough to manage itself: keep vendor lists fresh, recommend the best model for each job, auto-switch when something breaks, and alert the admin only when a human decision is needed.

## Decision

Build a **self-managing AI orchestration layer** with four subsystems:

### 1. Model Registry (replaces `cachedModels` in ResearchConfig)

**New table: `llm_model_registry`**

| Column | Type | Purpose |
|--------|------|---------|
| id | serial PK | |
| vendor | text | "anthropic", "openai", "google", "xai", "deepseek", "meta" |
| modelId | text | "claude-sonnet-4-6", "gpt-4o", etc. |
| displayName | text | Human-readable label |
| capabilities | jsonb | { reasoning, speed, context_window, vision, tool_use, cost_per_1k_tokens } |
| recommended_for | text[] | ["synthesis", "research", "chat", "graphics", "export"] |
| is_available | boolean | Last health check result |
| is_deprecated | boolean | Model EOL detected |
| last_seen_at | timestamp | When the model last appeared in vendor API |
| first_seen_at | timestamp | When we first discovered this model |
| performance_score | real | 0-100 composite (latency, cost, quality) |
| admin_override | text | null = auto-manage, "pinned" = admin chose this, "blocked" = admin disabled |

**Refresh cycle:** On app startup + every 6 hours (piggyback on existing ambient scheduler), fetch model lists from all vendors. Compare to registry. Flag new models, flag disappeared models.

### 2. Smart Recommender

For each function domain (research, chat, export, graphics, utility), the engine picks the best available model based on:

| Factor | Weight | How Measured |
|--------|--------|-------------|
| Task fit | 40% | Capabilities match (reasoning for synthesis, speed for chat) |
| Cost efficiency | 25% | Cost per 1K tokens relative to quality |
| Reliability | 20% | Success rate from `source_call_logs` |
| Latency | 15% | Average response time from recent calls |

**Output:** Each domain gets a `recommended_model` and a `fallback_model`. These become the defaults in ResearchConfig unless admin has pinned a specific model.

**Recommendation refresh:** Runs after every model registry refresh. If recommendations change, log the change to `assumption_change_log` with `changeSource: "engine_optimization"`.

### 3. Admin Override Protocol

| Scenario | Engine Behavior |
|----------|----------------|
| Admin has NOT chosen a model | Engine auto-selects recommended. UI shows "Recommended by The Analyst" badge. |
| Admin pins a specific model | Engine respects the pin. UI shows "Admin selected" badge. |
| Admin-pinned model becomes unavailable | Engine switches to fallback immediately. Sends admin email via Resend: "Your selected model [X] is unavailable. The Analyst has switched to [Y]. Review in Admin > AI Engines." |
| Admin-pinned model is deprecated | Same email, but message says "deprecated by vendor" and recommends replacement. |
| New model appears that outperforms current | Engine logs it but does NOT auto-switch. Shows "New recommendation available" in Admin > AI Engines. |

### 4. Background Execution Model

| Process | Blocking? | When |
|---------|-----------|------|
| Model list refresh | Background | Startup + every 6h |
| Vendor health checks | Background | Every 6h (existing) |
| Recommendation recalculation | Background | After model refresh |
| Admin alert emails | Background | On state change only |
| First-visit research trigger | Blocking (user waits) | User's first page visit |
| Manual "Ask the Analyst" | Blocking (user waits) | User clicks button |
| Scheduled research workflows | Background | Per schedule (existing) |

## Implementation Plan

### Phase 1: Model Registry Table + Auto-Refresh (Week 1)

**Schema:**
- Create `llm_model_registry` table
- Migrate `cachedModels` from ResearchConfig JSONB → proper table rows

**Refresh job:**
- Add `refreshModelRegistry()` to `server/ai/ambient/scheduler.ts`
- Call existing `fetchOpenAIModels()`, `fetchAnthropicModels()`, etc.
- Upsert into registry, mark missing models as `is_available: false`
- Detect new models (first_seen_at = now), log to activity_logs

**Files:**
- `shared/schema/intelligence-v2.ts` — new table
- `server/storage/intelligence-v2.ts` — CRUD methods
- `server/ai/ambient/scheduler.ts` — add to refresh cycle
- `server/routes/admin/research.ts` — migrate refresh endpoint to use registry

### Phase 2: Smart Recommender (Week 2)

**Scoring engine:**
- Create `server/ai/model-recommender.ts`
- Define capability profiles per model (context window, vision, reasoning tier, cost)
- Score each model per domain using weighted factors
- Query `source_call_logs` for reliability/latency data

**Integration with resolve-llm:**
- `resolveLlm()` checks: admin pin → registry recommendation → hardcoded fallback
- `getRecommendedDefaults()` queries recommender instead of hardcoded order

**Files:**
- `server/ai/model-recommender.ts` — new (~200 lines)
- `server/ai/resolve-llm.ts` — modify to query registry
- `server/seeds/model-capabilities.ts` — seed known model capabilities

### Phase 3: Admin Alerts + Override UI (Week 3)

**Alert system:**
- When admin-pinned model goes unavailable/deprecated:
  - Switch to fallback
  - Send email via Resend with model name, reason, fallback chosen
  - Log to `assumption_change_log` with `changeSource: "engine_failover"`
- When new recommendation available:
  - Badge in Admin > AI Engines (no email — not urgent)

**Admin UI updates (Replit):**
- Model selector shows "Recommended" badge next to engine-picked models
- "Pinned by Admin" badge when admin overrides
- New recommendations panel: "The Analyst recommends switching [domain] from [X] to [Y] — 23% faster, same quality"
- Alert history log

**Files:**
- `server/ai/ambient/model-alerts.ts` — new, alert logic
- `server/routes/admin/research.ts` — add alert history endpoint
- Client components (Replit) — badges, recommendation panel

### Phase 4: Performance Optimization Loop (Week 4)

**Auto-learning:**
- After each research run, log model performance (tokens, latency, cost, user satisfaction if rated)
- Monthly: recalculate performance_score per model from actual usage data
- Feed back into recommender weights

**Cost tracking:**
- Existing `cost-logger.ts` middleware already tracks per-call costs
- Aggregate by model/domain for the recommender
- Admin dashboard: cost per research run, cost by model, cost trend

## Options Considered

### Option A: Full Auto-Management (chosen)
| Dimension | Assessment |
|-----------|------------|
| Complexity | High — 4 phases, new table, recommender engine |
| Cost | Low — uses existing ambient scheduler, no new infrastructure |
| Scalability | High — registry supports unlimited vendors/models |
| Team familiarity | High — extends existing resolve-llm + source-health patterns |

**Pros:** True unfair advantage. Investors see an engine that manages itself. Admin gets alerts instead of doing manual work. Best model always in use.
**Cons:** 3-4 weeks to build fully. Recommender scoring needs tuning over time.

### Option B: Manual with Staleness Alerts
| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — just add refresh timer + email on failure |
| Cost | Lowest |
| Scalability | Low — admin becomes bottleneck as vendors multiply |
| Team familiarity | Highest — minimal code changes |

**Pros:** Ship in 2 days. Simple.
**Cons:** Not an unfair advantage. Admin must monitor and react. No intelligence.

### Option C: Vendor-Provided Auto-Routing (e.g., OpenRouter)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — single API, they handle routing |
| Cost | Medium — OpenRouter markup on every call |
| Scalability | Depends on OpenRouter |
| Team familiarity | Low — new vendor dependency |

**Pros:** Instant multi-model support. No recommender to build.
**Cons:** Single point of failure. Can't show "powered by Norfolk AI Engine" if it's really OpenRouter. Less control over model selection. Cost markup.

## Trade-off Analysis

Option A is the only one that creates a demonstrable unfair advantage for investors. The admin alert system + auto-recommendation + performance loop is the kind of thing you show in a pitch deck. Options B and C are faster but commoditized.

The risk with A is over-engineering before product-market fit. Mitigation: Phase 1 alone (auto-refresh + registry) delivers 60% of the value in 1 week.

## Consequences

- **Easier:** Adding new LLM vendors becomes a seed entry, not a code change
- **Easier:** Admin doesn't need to know model names — engine recommends
- **Easier:** Debugging model failures — full history in registry + call logs
- **Harder:** Testing — need to mock model registry in tests
- **Harder:** First-time setup — registry must be seeded with capability profiles
- **Revisit:** Recommendation weights need tuning after 3 months of real usage data

## Action Items

1. [ ] Create `llm_model_registry` schema + storage methods (Claude Code)
2. [ ] Add model refresh to ambient scheduler (Claude Code)
3. [ ] Seed model capabilities for known models (Claude Code)
4. [ ] Create `model-recommender.ts` scoring engine (Claude Code)
5. [ ] Modify `resolve-llm.ts` to query registry (Claude Code)
6. [ ] Build admin alert email templates (Claude Code + Replit)
7. [ ] Admin UI: recommendation badges, pin/unpin, alert history (Replit)
8. [ ] Wire performance feedback loop from cost-logger (Claude Code)
9. [ ] Document for investors: "How the Norfolk AI Engine Manages Itself" (Claude Code)
