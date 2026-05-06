---
title: "feat: Iris — Backstage Agent for Rebecca's Resource Maintenance"
type: feat
status: active
date: 2026-05-06
---

# feat: Iris — Backstage Agent for Rebecca's Resource Maintenance

## Summary

Adds Iris, a second AI agent who operates entirely backstage to keep Rebecca's resources healthy. Iris has atomic tools for knowledge base ingestion, vector store pruning, API connection testing, and retrieval quality evaluation. She runs on three triggers: admin button press, a scheduled cadence, and gap signals Rebecca writes when retrieval fails. Iris writes her outputs to a shared `iris/` workspace that Rebecca reads at startup. The UI is a dedicated Iris panel under the AI Intelligence sidebar's "AI Agents" group — her own space alongside the existing Configuration, Knowledge Base, and Gustavo sections.

---

## Problem Frame

Rebecca is the front-line communicator. Her quality is bounded by the freshness and completeness of her knowledge base, the health of her API connections, and the relevance of her retrieval results. Currently, no automated agent maintains these resources. Knowledge base re-indexing is a manual restart concern; stale or unreachable API sources are only discovered when Rebecca retrieves nothing; retrieval gaps are invisible until a user notices a wrong or empty answer. Iris closes this loop.

---

## Requirements

- R1. Iris has atomic tools that operate on Rebecca's existing knowledge base and vector store without replacing the underlying infrastructure.
- R2. Iris runs on three triggers: manual (admin button), scheduled (daily health check, weekly full reindex), and gap-signal (Rebecca writes to `iris/gaps.md` on retrieval failure; Iris ingests coverage on next run).
- R3. Iris writes `iris/context.md`, `iris/health.md`, and `iris/run-history/` after every run. `iris/context.md` is indexed into the `"knowledge-base"` vector namespace at startup so Rebecca retrieves it semantically — not injected as raw system prompt text.
- R4. Iris uses Haiku model for health-check runs; Sonnet for full ingestion/reindex runs.
- R5. Iris has a dedicated panel under the AI Intelligence sidebar's "AI Agents" group, following the existing Sources UX pattern: green/red status icon + last-run timestamp + per-resource run button.
- R6. Iris's embedding client explicitly sets `baseURL: "https://api.openai.com/v1"` — not inherited from `OPENAI_BASE_URL` — preserving the two-client architecture established in `vector-store-service.ts`.
- R7. Iris reports her mutations in the SSE `dataChanged` payload so the frontend invalidates relevant React Query caches without polling.
- R8. Multi-source operations use `Promise.allSettled`; a single failing source does not abort the run.

---

## Scope Boundaries

- Iris does not have a user-facing chat interface. She is admin-operated only.
- Iris does not replace or wrap `vector-store-service.ts` — she calls its exported primitives directly.
- Iris does not manage Specialist prompts or LLM configuration — those belong in the existing LLMs section of AI Intelligence.
- Rebecca can trigger Iris admin actions via tools — see plan 012 (parity cluster fix). Iris's ambient daily-health and weekly-reindex triggers continue to run on her own scheduler loop independent of Rebecca.
- The Replit-proxy/direct-OpenAI two-client architecture is not changed. Iris uses the existing direct client in `vector-store-service.ts`.

### Deferred to Follow-Up Work

- Iris entry in AI Intelligence → LLMs page (as an LLM workflow card): follow-up to this plan.
- Iris self-modification of her own system prompt or ingestion strategy: separate plan.

---

## Context & Research

### Relevant Code and Patterns

- `artifacts/api-server/src/ai/knowledge-base.ts` — `indexKnowledgeBase()`, `vectorCount()`, `upsertChunks()`, `queryChunks()`, `splitIntoChunks()`, `generateEmbeddings()`. Iris's tools call these directly. `indexKnowledgeBase()` has a session-skip guard (skips if namespace populated) — Iris's reindex tool needs a `force` flag to bypass this.
- `artifacts/api-server/src/ai/vector-store-service.ts` — embedding client at line 48 hardcodes `DIRECT_BASE = "https://api.openai.com/v1"` (no OPENAI_BASE_URL inheritance). Also exports `deleteNamespace()`, `pruneOrphanedVectors()`, `isVectorStoreAvailable()`. Iris imports from here only, never constructs her own embedding client.
- `artifacts/api-server/src/ai/ambient/scheduler.ts` — canonical scheduler pattern: named `REFRESH_INTERVAL_MS` and `STARTUP_DELAY_MS` constants, `setTimeout` startup delay, `setInterval` for recurring, `recordSchedulerCycle({key, considered, succeeded, failed, status, notes, durationMs})` in `finally` block. Iris's scheduler follows this exactly.
- `artifacts/api-server/src/index.ts` lines 269-392 — startup sequence. `setImmediate(() => indexKnowledgeBase()…)` at line 269 is the anchor for Iris startup initialization. Iris scheduler registers as a dynamic import in the same phase pattern.
- `artifacts/api-server/src/routes/admin/intelligence-vector-store.ts` — existing admin vector-store routes. Iris API routes follow this file's pattern.
- `artifacts/api-server/src/routes/admin/source-health.ts` — existing source health check routes. `test_api_connection` tool mirrors this logic.
- `artifacts/api-server/src/routes/chat.ts` — SSE `done` payload at line 1094-1108. U6 surfaces Iris-related `dataChanged` entries here.
- `lib/shared/src/rebecca-settings.ts` lines 249-270 — `SystemPromptParts` interface and `assembleSystemPrompt()`. R3's `iris/context.md` is indexed as KB content (not a `SystemPromptParts` field) — retrieved semantically via `retrieveRelevantChunks()` at chat time.
- `artifacts/hospitality-business-portal/src/components/ai-intelligence/AiIntelligenceSidebar.tsx` — `AiIntelligenceSection` type and `buildNavGroups()`. U7 adds `"iris"` here under the `"ai-agents"` group.
- `artifacts/hospitality-business-portal/src/pages/AiIntelligence.tsx` — section routing. U8 adds the Iris case.
- `artifacts/api-server/src/routes/admin/intelligence-sources.ts` — `source_registry` table REST API (GET/POST/PATCH). `sync_data_source` reads from this table to know which external sources to refresh.
- `lib/db/src/schema/intelligence-v2.ts` line 394 — `source_registry` table schema (`serviceKey`, `name`, `sourceType`, `endpoint`, `lastHealthCheck`, etc.).

### Institutional Learnings

- **Embedding client must be direct, not proxied** (`docs/solutions/integration-issues/openai-sdk-env-base-url-overrides-embedding-client-2026-05-02.md`): `baseURL` must be explicitly set to `"https://api.openai.com/v1"` on any embedding client. `upsertChunks` swallows errors and logs "upserted" even on failure — Iris health checks must probe `vectorCount("knowledge-base")` directly.
- **Admin sidebar IA placement** (`docs/solutions/architecture-patterns/admin-sidebar-ia-sources-resources-2026-05-02.md`): Knowledge base ingestion surfaces belong under Admin → Sources; API connection management belongs under Admin → Resources → APIs. But Iris as an agent belongs under AI Intelligence → AI Agents — her panel is the agent's operational dashboard, not a raw infrastructure control.
- **Sources UX convention** (`docs/solutions/architecture-patterns/sources-ux-status-analyst-button-2026-05-02.md`): Every Iris-managed resource row must show: green/red status icon (left), last-run timestamp (right, relative with ISO on hover), and a run trigger button. Spinner + "Running…" during active run. This is the team's established pattern for all source rows.
- **Fault-tolerant fetch pattern** (`docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md`): Use `Promise.allSettled`, never `Promise.all`, for multi-source operations. Maintain a minimum-threshold constant; fall back to last good state if below threshold.
- **Rebecca agent-native architecture** (`docs/solutions/architecture-patterns/rebecca-agent-native-architecture-2026-05-05.md`): SSE `done` payload's `dataChanged` array is the established write-back mechanism. Iris mutations should surface here. Do not add a separate polling endpoint.
- **Admin sidebar icon deduplication** (`docs/solutions/design-patterns/admin-sidebar-navigation-design-2026-05-05.md`): Check icon table before assigning a Phosphor icon to Iris's nav entry.

---

## Key Technical Decisions

- **Iris workspace files are filesystem-based, not DB rows.** `iris/context.md`, `iris/gaps.md`, and `iris/run-history/` are plain files parallel to `attached_assets/` in the KB content layer. Rationale: `indexKnowledgeBase()` already reads the filesystem for content; `iris/context.md` is re-indexed at startup by the same mechanism as `attached_assets/` without any new abstraction.
- **`iris/context.md` feeds Rebecca via vector store re-indexing, not system prompt injection.** At startup (in the `setImmediate` sequence in `src/index.ts`), `iris/context.md` is loaded by `loadAttachedAssets()` or a parallel call and chunked into the `"knowledge-base"` namespace. Rebecca retrieves it semantically at query time via `retrieveRelevantChunks()`. Rationale: the `SystemPromptParts` interface has no slot for Iris state; raw text injection bypasses retrieval relevance scoring; the KB path is zero new infrastructure.
- **`iris/health.md` is DB-persisted as a JSON blob.** Admin UI polling needs a single reliable source for last-run status and per-resource health. File read works for KB content but is fragile for real-time UI updates. A single `iris_runs` table row (latest run per type) is cleaner. Rationale: the UI needs structured data (timestamps, status codes per resource); markdown prose is wrong for that surface.
- **Iris's LLM calls go through the existing `callLlm()` function**, not a new LLM abstraction. The provider and model are passed as parameters matching the existing function signature extended in the Rebecca plan (U1 of plan 009). Rationale: reuses all provider handling, SSE, and tool infrastructure already built.
- **Gap signals are append-only until Iris clears them.** Rebecca appends one line to `iris/gaps.md` per failed retrieval. Iris reads all lines on startup, ingests coverage, then truncates the file. Rationale: append is safe under concurrent writes from multiple Rebecca sessions; truncate on Iris run avoids gap accumulation.
- **Iris's admin UI lives in AI Intelligence → AI Agents group**, not in Admin sidebar or as a rail panel like Rebecca. The AI Agents group already holds Gustavo (orchestrator persona) and is the right place for another agent persona. Rebecca's rail panel (`panel-manager.ts`) is user-facing and accessible from any page — Iris is admin-only and accessed from `/ai-intelligence`. Rationale: separating user-facing (Rebecca rail) from admin-facing (Iris in AI Intelligence) prevents UI surface confusion and keeps Iris behind the admin route guard.
- **Model tier selection is trigger-driven.** `trigger: "scheduled-health"` → Haiku. `trigger: "manual" | "gap-signal" | "scheduled-reindex"` → Sonnet. Rationale: health checks are tool-loop-heavy with simple per-tool reasoning; Sonnet is reserved for ingestion runs that require judgment about what to ingest.

---

## Open Questions

### Resolved During Planning

- **Where does Iris's UI panel live?** AI Intelligence → AI Agents group (alongside Gustavo), not Admin sidebar. (See Key Technical Decisions.)
- **Does Iris use the existing `callLlm()` or a new executor?** Existing `callLlm()` with tool support from plan 009 U1. (Iris plan depends on Rebecca plan 009 U1 being merged first.)
- **Filesystem vs DB for workspace files?** Split: context/gaps/history → filesystem; health status → DB row. (See Key Technical Decisions.)

### Deferred to Implementation

- **Exact `iris_runs` table schema:** Determined during U4 by reviewing the existing migrations pattern.
- **Whether `intelligence-scheduled.ts` uses a cron library or setInterval:** Determined during U5 by reading that file's scheduling mechanism.
- **Iris's system prompt content:** Authored during U3 based on the tool list and the corner-fighter framing. Not pre-written here.

---

## Output Structure

```text
artifacts/api-server/src/ai/
└── iris/
    ├── workspace.ts        # Read/write iris/ filesystem workspace
    ├── tools.ts            # Atomic tool implementations
    └── agent.ts            # LLM agent executor (runIrisAgent)

artifacts/api-server/src/ai/ambient/
└── iris-scheduler.ts       # Iris scheduled runs (follows scheduler.ts pattern)

artifacts/api-server/src/routes/admin/
└── iris.ts                 # POST /run, GET /status, DELETE /gaps

artifacts/api-server/src/storage/
└── iris-runs.ts            # DB layer for iris_runs table (health status)

artifacts/hospitality-business-portal/src/
└── components/
    └── iris/
        └── IrisPanel.tsx   # Iris operational dashboard component
```

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

```text
Admin button press / scheduled cron / gap-signal
         ↓
POST /api/admin/iris/run  →  runIrisAgent(trigger, model)
         ↓
         LLM loop (Haiku or Sonnet + Iris tools)
         ├── test_api_connection(source) × N   [Promise.allSettled]
         ├── evaluate_retrieval_quality(query)
         ├── ingest_document(url | path)       ← gap-driven
         ├── prune_stale_entries(maxAgedays)
         ├── sync_data_source(sourceId)
         └── write_health_report(results)
                    ↓
         iris/health.md written (filesystem)   →  iris_runs row upserted (DB)
         iris/context.md updated               →  Rebecca reads on next startup
         iris/gaps.md truncated (if gap-signal trigger)
         iris/run-history/YYYY-MM-DD.md appended
                    ↓
         SSE dataChanged: [{ entityType: "iris-run", entityId: runId }]
                    ↓
         Frontend React Query invalidates iris/status query → IrisPanel re-renders
```

```text
Rebecca's chat turn:
  RAG retrieval returns 0 results for query X
         ↓
  Rebecca appends to iris/gaps.md: "Query: X — no results found"
         ↓
  iris/gaps.md accumulates until next Iris run
         ↓
  Iris reads gaps.md → decides what documents to ingest → clears file
```

---

## Implementation Units

- U1. **Iris workspace module**

**Goal:** Establish the `iris/` filesystem workspace with typed read/write helpers for all four workspace artifacts.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Create: `artifacts/api-server/src/ai/iris/workspace.ts`
- Test: `artifacts/api-server/tests/ai/iris/workspace.test.ts`

**Approach:**
- Exported functions: `readIrisContext(): Promise<string>`, `writeIrisContext(content: string)`, `readIrisHealth(): Promise<string>`, `writeIrisHealth(content: string)`, `readIrisGaps(): Promise<string[]>`, `appendIrisGap(query: string)`, `clearIrisGaps()`, `appendRunHistory(date: string, entry: string)`
- All paths resolve relative to the server's data root (same pattern as KB content scan in `knowledge-base.ts`)
- Directory is created on first write if absent
- `appendIrisGap` is append-safe under concurrent writes (append mode, not read-modify-write)

**Patterns to follow:**
- `artifacts/api-server/src/ai/knowledge-base.ts` — file path resolution and `fs.existsSync` guard pattern

**Test scenarios:**
- Happy path: write then read `iris/context.md` returns the written content
- Happy path: `appendIrisGap` called three times → `readIrisGaps()` returns three entries
- Happy path: `clearIrisGaps()` after append → `readIrisGaps()` returns empty array
- Happy path: `appendRunHistory` on a date that doesn't yet exist → creates the file
- Edge case: `readIrisContext()` when file does not exist → returns empty string (not an error)
- Edge case: concurrent `appendIrisGap` calls do not produce corrupted output (append mode)

**Verification:**
- `pnpm --filter @workspace/api-server run typecheck` — clean
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- Unit tests for all six exported functions — PASS

---

- U2. **Iris atomic tool implementations**

**Goal:** Implement the six Iris tools as typed async functions that call existing KB/vector-store primitives.

**Requirements:** R1, R6, R8

**Dependencies:** U1

**Files:**
- Create: `artifacts/api-server/src/ai/iris/tools.ts`
- Test: `artifacts/api-server/tests/ai/iris/tools.test.ts`

**Approach:**
- `ingest_document({ url?: string; filePath?: string; category: string })` — splits content into chunks via `splitIntoChunks()`, generates embeddings via `embedBatch()`, upserts via `upsertChunks("knowledge-base", …)`, verifies via `vectorCount("knowledge-base")`
- `prune_stale_entries({ maxAgeDays: number })` — calls `pruneOrphanedVectors()` from `vector-store-service.ts` for orphaned vectors; for age-based pruning, queries `vector_chunks` table directly and deletes rows older than threshold
- `test_api_connection({ sourceId: string; url: string })` — HTTP HEAD or GET to the source URL with a named `IRIS_API_TEST_TIMEOUT_MS` constant (default 5000ms); returns `{ reachable: boolean; latencyMs: number; errorMessage?: string }`; updates `lastHealthCheck` on the `source_registry` row via `intelligence-sources.ts` storage
- `evaluate_retrieval_quality({ testQuery: string; minExpectedResults: number })` — calls `queryChunks("knowledge-base", testQuery, 5)`, returns pass/fail with count
- `sync_data_source({ sourceId: string })` — reads source record from `source_registry` via existing `intelligence-sources.ts` storage, fetches refreshed content from `endpoint`, ingests via `ingest_document`
- `write_health_report({ results: ToolResult[] })` — formats markdown report, calls `writeIrisHealth()` from U1, upserts to `iris_runs` table (from U4 storage layer — tools.ts accepts an injected DB writer to avoid circular deps)
- All multi-source loops use `Promise.allSettled` with an `isFulfilled<T>` guard
- No new embedding client — import `embedBatch` from `vector-store-service.ts` directly; `isVectorStoreAvailable()` guards all vector operations

**Patterns to follow:**
- `artifacts/api-server/src/ai/knowledge-base.ts` — `upsertChunks` + `vectorCount` pattern
- `artifacts/api-server/src/routes/admin/source-health.ts` — connection test pattern
- Live comparables `isFulfilled<T>` guard pattern from `docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md`

**Test scenarios:**
- Happy path: `test_api_connection` with a reachable URL → returns `{ reachable: true, latencyMs: <N> }`
- Error path: `test_api_connection` with an unreachable URL → returns `{ reachable: false, errorMessage: "…" }` without throwing
- Happy path: `evaluate_retrieval_quality` with a query that matches ≥ minExpectedResults → `{ pass: true }`
- Edge case: `evaluate_retrieval_quality` with an empty KB → `{ pass: false, count: 0 }`
- Happy path: `prune_stale_entries` with entries older than maxAgeDays in test DB → returns positive count
- Error path: `ingest_document` with an unreachable URL → returns error summary without crashing the caller
- Integration: `Promise.allSettled` over a mix of reachable and unreachable sources → all settle; fulfilled count matches reachable sources; rejected items carry error messages

**Verification:**
- `pnpm --filter @workspace/api-server run typecheck` — clean
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- All tool unit tests PASS
- `test_api_connection` integration test against a local URL PASS

---

- U3. **Iris agent executor**

**Goal:** Implement the LLM execution loop that receives a trigger type, reads workspace state, calls Iris tools, and writes results back.

**Requirements:** R2, R4, R8

**Dependencies:** U1, U2

**Files:**
- Create: `artifacts/api-server/src/ai/iris/agent.ts`
- Test: `artifacts/api-server/tests/ai/iris/agent.test.ts`

**Approach:**
- `runIrisAgent(trigger: "manual" | "scheduled-health" | "scheduled-reindex" | "gap-signal"): Promise<IrisRunResult>`
- Trigger determines model: `"scheduled-health"` → Haiku; all others → Sonnet
- Before calling the LLM: reads `iris/gaps.md` (U1), reads current `vectorCount("knowledge-base")`, reads `iris/health.md` for prior state — injects all three as context
- Calls `callLlm()` (extended by Rebecca plan 009 U1) with Iris's tool definitions and the appropriate model
- Iris system prompt: defines her role (corner team / resource maintainer), lists her tools with one-line usage examples, and instructs her to call `write_health_report` as the final action
- The executor runs the tool loop until `write_health_report` is called or `MAX_TOOL_DEPTH` is reached
- Returns `IrisRunResult: { runId: string; trigger: string; toolsInvoked: string[]; chunksIndexed: number; errorsEncountered: number; durationMs: number }`

**Patterns to follow:**
- `artifacts/api-server/src/routes/chat.ts` — agentic loop pattern (from Rebecca plan 009 U2)
- `artifacts/api-server/src/routes/chat-prompts.ts` — system prompt section structure

**Test scenarios:**
- Happy path: `runIrisAgent("scheduled-health")` with a healthy KB → uses Haiku model, calls `test_api_connection` for each configured source, calls `write_health_report`, returns `IrisRunResult`
- Happy path: `runIrisAgent("gap-signal")` with non-empty `iris/gaps.md` → uses Sonnet, calls `ingest_document` for each gap, clears `iris/gaps.md`, writes health report
- Edge case: `runIrisAgent("manual")` when vector store is unavailable → gracefully reports "vector store offline" in health report, does not throw
- Integration: after `runIrisAgent`, `iris/health.md` exists and `iris/run-history/YYYY-MM-DD.md` has a new entry

**Verification:**
- `pnpm --filter @workspace/api-server run typecheck` — clean
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- Integration test: `runIrisAgent("scheduled-health")` with mocked `callLlm` → tools invoked in expected sequence — PASS

---

- U4. **Iris API routes and DB storage layer**

**Goal:** Expose Iris's run trigger and status via admin API routes, with a `iris_runs` table for structured health state.

**Requirements:** R2, R5, R7

**Dependencies:** U3

**Files:**
- Create: `artifacts/api-server/src/routes/admin/iris.ts`
- Create: `artifacts/api-server/src/storage/iris-runs.ts`
- Modify: `artifacts/api-server/src/routes/admin/index.ts` (mount iris router)
- Create: migration file for `iris_runs` table
- Test: `artifacts/api-server/tests/routes/admin/iris.test.ts`

**Approach:**
- `iris_runs` table: `id`, `trigger`, `status` (running | completed | error), `model_used`, `chunks_indexed`, `errors_encountered`, `duration_ms`, `run_at` timestamp, `health_summary` (JSON blob with per-resource results)
- `POST /api/admin/iris/run` — admin-only, accepts `{ trigger: "manual" | "scheduled-health" | "scheduled-reindex" | "gap-signal" }`, launches `runIrisAgent()` async, immediately returns `{ runId, status: "started" }`. Emits `dataChanged: [{ entityType: "iris-run", entityId: runId }]` when done via SSE (or a websocket push — use whichever the existing admin routes use for async job completion).
- `GET /api/admin/iris/status` — returns latest `iris_runs` row + `iris/gaps.md` line count
- `DELETE /api/admin/iris/gaps` — admin-only, calls `clearIrisGaps()` from U1
- Authentication: all routes use the existing admin auth middleware

**Patterns to follow:**
- `artifacts/api-server/src/routes/admin/intelligence-vector-store.ts` — admin route structure
- `artifacts/api-server/src/storage/` — existing storage module patterns

**Test scenarios:**
- Happy path: `POST /api/admin/iris/run` with valid admin session → 200, `{ runId, status: "started" }`
- Error path: `POST /api/admin/iris/run` without admin session → 401/403
- Happy path: `GET /api/admin/iris/status` when no run has ever occurred → 200, `{ lastRun: null, gapsCount: 0 }`
- Happy path: `GET /api/admin/iris/status` after a successful run → 200, `{ lastRun: { status: "completed", … }, gapsCount: N }`
- Happy path: `DELETE /api/admin/iris/gaps` → 200, subsequent `GET /status` shows `gapsCount: 0`
- Error path: `DELETE /api/admin/iris/gaps` without admin session → 401/403
- Integration: `POST /run` → wait for completion → `GET /status` shows updated `lastRun.status: "completed"`

**Verification:**
- `pnpm --filter @workspace/api-server run typecheck` — clean
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- `pnpm --filter @workspace/scripts run check:migration-guards` — PASS
- All route tests PASS

---

- U5. **Scheduled trigger registration**

**Goal:** Register Iris's daily health check and weekly reindex as scheduled jobs following the ambient scheduler pattern.

**Requirements:** R2, R4

**Dependencies:** U4

**Files:**
- Create: `artifacts/api-server/src/ai/ambient/iris-scheduler.ts`
- Modify: `artifacts/api-server/src/index.ts` (register iris-scheduler as dynamic import in startup phases)
- Test: `artifacts/api-server/tests/ai/ambient/iris-scheduler.test.ts`

**Approach:**
- Follow `artifacts/api-server/src/ai/ambient/scheduler.ts` exactly:
  - Named constants: `IRIS_HEALTH_INTERVAL_MS` (24h), `IRIS_REINDEX_INTERVAL_MS` (7 days), `IRIS_STARTUP_DELAY_MS`
  - `startIrisScheduler()`: `setTimeout` → initial health check → `setInterval` for daily health; separate weekly reindex interval
  - `stopIrisScheduler()`: clears all handles
  - Each cycle wraps in `try/finally` and calls `recordSchedulerCycle({key: "iris-health" | "iris-reindex", considered, succeeded, failed, status, notes, durationMs})` — mandatory for Admin Observability panel
- Concurrency guard: if `iris_runs` has a row with `status: "running"`, skip the new trigger and log "iris run already in progress" in `notes`
- Register as a dynamic import in `src/index.ts` startup phases (phases 3a-3i pattern)

**Patterns to follow:**
- `artifacts/api-server/src/ai/ambient/scheduler.ts` — all conventions: named constants, setTimeout/setInterval, recordSchedulerCycle in finally

**Test scenarios:**
- Happy path: `startIrisScheduler()` → after `IRIS_STARTUP_DELAY_MS` → `runIrisAgent("scheduled-health")` called with Haiku model (mocked)
- Edge case: if `iris_runs` status is "running", scheduled trigger skips and `recordSchedulerCycle` is called with `status: "skipped"`
- Happy path: `stopIrisScheduler()` clears both interval handles

**Verification:**
- `pnpm --filter @workspace/api-server run typecheck` — clean
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- Scheduler tests PASS

---

- U6. **Iris context indexing and Rebecca gap-write tool**

**Goal:** Index `iris/context.md` into the `"knowledge-base"` vector namespace at startup so Rebecca retrieves it semantically. Add a `write_retrieval_gap` tool to Rebecca's tool registry for signaling failed retrievals.

**Requirements:** R3

**Dependencies:** U1

**Files:**
- Modify: `artifacts/api-server/src/ai/knowledge-base.ts` (load `iris/context.md` alongside `loadAttachedAssets()`)
- Modify: `artifacts/api-server/src/ai/iris/tools.ts` or `artifacts/api-server/src/chat/rebecca-tools.ts` (add `write_retrieval_gap` tool)
- Test: extend `artifacts/api-server/tests/ai/knowledge-base.test.ts`

**Approach:**
- In `indexKnowledgeBase()`, after `loadAttachedAssets()`, call `readIrisContext()` (U1). If non-empty, treat the content as a single chunk with `source: "iris/context.md"` and `category: "iris-status"` — split, embed, upsert into `"knowledge-base"` namespace alongside existing chunks.
- This means `iris/context.md` is present in the vector store after every `indexKnowledgeBase()` call (including Iris's own reindex runs). Rebecca retrieves it naturally when a user's query is relevant to resource status.
- Add `write_retrieval_gap` to Rebecca's tool registry (follows the tool definition pattern from plan 009 U3). The tool accepts `{ query: string }` and calls `appendIrisGap(query)` from workspace.ts (U1). Rebecca invokes this tool when `retrieveRelevantChunks()` returns fewer than `KB_MIN_CONFIDENCE` results.
- Rebecca's system prompt gains one instruction line in the capability section: "When your knowledge base retrieval returns no confident results, call `write_retrieval_gap` with the query topic. This is silent — do not mention it to the user."

**Patterns to follow:**
- `artifacts/api-server/src/ai/knowledge-base.ts:51` — `loadAttachedAssets()` filesystem read pattern
- `artifacts/api-server/src/chat/rebecca-tools.ts` — tool definition pattern (from plan 009 U3)

**Test scenarios:**
- Happy path: `iris/context.md` contains Iris health summary → after `indexKnowledgeBase()`, `vectorCount("knowledge-base")` increases by the chunk count from that file
- Edge case: `iris/context.md` does not exist → `indexKnowledgeBase()` completes normally, no error thrown
- Integration: `write_retrieval_gap` tool called with query string "luxury hotel exit cap rates" → `iris/gaps.md` has one new line containing that string
- Edge case: `appendIrisGap` is append-safe — two concurrent `write_retrieval_gap` calls do not produce corrupted output

**Verification:**
- `pnpm --filter @workspace/api-server run typecheck` — clean
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- `indexKnowledgeBase()` test: populated `iris/context.md` results in increased vector count — PASS

---

- U7. **AiIntelligenceSidebar — Iris nav entry**

**Goal:** Add `"iris"` to the `AiIntelligenceSection` type and add an Iris entry under the "AI Agents" group in the sidebar.

**Requirements:** R5

**Dependencies:** None (can run in parallel with backend units)

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/components/ai-intelligence/AiIntelligenceSidebar.tsx`

**Approach:**
- Add `"iris"` to the `AiIntelligenceSection` union type
- Add `{ value: "iris", label: "Iris", secondary: "Resource Maintainer", icon: IconWand2 }` under the `"ai-agents"` group sections, after Gustavo
- `IconWand2` is exported from `@/components/icons` and not currently used by any other nav item — verify against the icon table in `docs/solutions/design-patterns/admin-sidebar-navigation-design-2026-05-05.md` before finalizing

**Patterns to follow:**
- Gustavo entry in `AiIntelligenceSidebar.tsx` — `secondary` label pattern for persona-named items

**Test scenarios:**
- Test expectation: none — this is a nav entry addition with no behavioral change. Typecheck and visual review are sufficient.

**Verification:**
- `pnpm --filter @workspace/hospitality-business-portal run typecheck` — clean
- Iris entry appears in the "AI Agents" group in the sidebar with correct label and icon

---

- U8. **Iris panel component**

**Goal:** Build the IrisPanel React component showing Iris's health status, last run, resource rows, and action buttons.

**Requirements:** R5

**Dependencies:** U4 (API routes must exist), U7 (section type must exist)

**Files:**
- Create: `artifacts/hospitality-business-portal/src/components/iris/IrisPanel.tsx`
- Modify: `artifacts/hospitality-business-portal/src/pages/AiIntelligence.tsx` (add "iris" case to section routing)

**Approach:**
- Fetches from `GET /api/admin/iris/status` via React Query key `["iris", "status"]`
- Top header: "Iris — Resource Maintainer" with subtitle "Rebecca's corner team"
- Two action buttons: "Run Health Check" (Haiku, quick) and "Run Full Reindex" (Sonnet, thorough). Both POST to `/api/admin/iris/run` with appropriate trigger value. While running: button shows spinner + "Running…", disabled.
- Per-resource rows (knowledge base, each configured API source): green/red status dot (left), source name + last-indexed timestamp (right, relative with ISO title), and individual "Sync" button. Follows Sources UX pattern exactly.
- Gaps section: count of entries in `iris/gaps.md` with a "Clear Gaps" button (DELETE `/api/admin/iris/gaps`)
- Last run card: trigger type, model used, chunks indexed, errors, duration, timestamp
- React Query `invalidateQueries(["iris", "status"])` on run completion (when SSE `dataChanged` includes `entityType: "iris-run"`)

**Patterns to follow:**
- Sources UX row pattern (`docs/solutions/architecture-patterns/sources-ux-status-analyst-button-2026-05-02.md`)
- `artifacts/hospitality-business-portal/src/components/admin/AIAgentsTab.tsx` — agent persona panel pattern
- Existing admin panel components for button-with-spinner pattern

**Test scenarios:**
- Test expectation: none — visual component. Typecheck + manual review in dev server are the verification gates.

**Verification:**
- `pnpm --filter @workspace/hospitality-business-portal run typecheck` — clean
- Iris panel renders at `/ai-intelligence?section=iris` without errors
- "Run Health Check" button fires `POST /api/admin/iris/run` with `trigger: "scheduled-health"`
- Per-resource rows render with correct status indicator and timestamp

---

## System-Wide Impact

- **Interaction graph:** `indexKnowledgeBase()` in `knowledge-base.ts` is called by Iris's `ingest_document` tool and directly by the server startup sequence. Iris's runs can run concurrently with startup indexing — ensure the session-skip logic in `indexKnowledgeBase()` does not prevent Iris from forcing a fresh index when triggered manually.
- **Error propagation:** Iris tool failures are `Promise.allSettled`-contained — a failing tool does not abort the run. Iris reports all tool errors in her health report. The API route returns `{ status: "started" }` immediately; errors surface in the subsequent `GET /status` response.
- **State lifecycle risks:** The `iris/gaps.md` clear-on-run creates a write race: if Rebecca appends a gap during the window between Iris reading and clearing the file, that gap is lost. Acceptable given the low-stakes nature (missed gap = topic not ingested until next time Rebecca flags it again). This is explicitly not addressed in this plan.
- **Unchanged invariants:** Rebecca's RAG retrieval path (`queryChunks()`) is not changed. The SSE streaming architecture is not changed. The two-client architecture (proxy for chat, direct for embeddings) is not changed.
- **API surface parity:** The `POST /api/admin/iris/run` route is the only new external API surface. It is admin-only and follows the same auth middleware as existing admin routes.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Iris plan 009 U1 not yet merged when this plan executes | U3 (Iris agent executor) depends on `callLlm()` with tool support. Gate U3 on plan 009 U2 merge. |
| `indexKnowledgeBase()` session-skip blocks Iris manual reindex | Iris's `ingest_document` calls `upsertChunks` directly, bypassing the session-skip guard. Full reindex tool calls `indexKnowledgeBase` with a force flag (add `force?: boolean` parameter). |
| `Promise.allSettled` on many API sources causes slow runs | Iris uses a named `IRIS_API_TEST_TIMEOUT_MS` constant (default 5000ms) per source. Haiku runs test only the first N=5 sources; Sonnet tests all. |
| `iris/gaps.md` grows unboundedly if Iris never runs | Admin panel shows gaps count prominently. "Clear Gaps" button available. Iris auto-clears on every run. |
| `write_retrieval_gap` tool adds latency to every zero-result Rebecca response | Append to `iris/gaps.md` is a local file write — sub-millisecond. Not a meaningful latency concern. |

---

## Sources & References

- Related plan: `docs/plans/2026-05-05-009-feat-rebecca-conversational-agent-parity-plan.md` (U1, U2, U3 must be merged before Iris U3)
- Architecture reference: `docs/solutions/architecture-patterns/rebecca-agent-native-architecture-2026-05-05.md`
- Embedding client bug: `docs/solutions/integration-issues/openai-sdk-env-base-url-overrides-embedding-client-2026-05-02.md`
- Admin IA placement: `docs/solutions/architecture-patterns/admin-sidebar-ia-sources-resources-2026-05-02.md`
- Sources UX convention: `docs/solutions/architecture-patterns/sources-ux-status-analyst-button-2026-05-02.md`
- Fault-tolerant fetch: `docs/solutions/architecture-patterns/live-comparables-specialist-integration-pattern-2026-05-05.md`
- Icon deduplication: `docs/solutions/design-patterns/admin-sidebar-navigation-design-2026-05-05.md`
