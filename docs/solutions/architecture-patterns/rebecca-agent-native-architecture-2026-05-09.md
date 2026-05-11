---
title: "Rebecca Agent-Native Architecture — As Built (Wave 0 + Full Tool Registry)"
date: 2026-05-09
last_updated: 2026-05-10
category: architecture-patterns
module: rebecca-agent-native-architecture
problem_type: architecture_pattern
component: assistant
severity: high
applies_when:
  - Extending Rebecca with a new tool
  - Adding a new LLM provider and wiring its function-calling format
  - Debugging why a tool mutation did not invalidate a frontend query
  - Understanding the agentic loop depth cap, fallback guard, or SSE event sequence
  - Adding Wave 0/1/2/3 features that inject context into the system prompt
tags:
  - agent-native
  - function-calling
  - tool-dispatch
  - agentic-loop
  - sse-write-back
  - action-parity
  - llm-provider
  - react-query-invalidation
  - wave-0
  - response-mode
  - portfolio-verification
---

# Rebecca Agent-Native Architecture — As Built (Wave 0 + Full Tool Registry)

## Context

The May 2026 architecture doc (`*-2026-05-05.md`) described a proposed design. That
architecture has since been fully implemented and has grown significantly. This document
replaces it as the canonical description of how Rebecca works today.

Rebecca transitioned from a pure RAG chatbot (single LLM call → text response) to a
full agentic assistant with a bounded execution loop, 50+ tools, and a rich SSE event
stream. The prior doc had seven specific inaccuracies that are corrected here:

1. The old doc said "Rebecca has no tools parameter and no execution loop" — now fully
   agentic with `MAX_TOOL_DEPTH = 4`.
2. It proposed `ToolDefinition { executor }` in a `ToolRegistry` — the actual shape is
   `ToolParam { name, description, parameters }` (JSON Schema only) with dispatch via a
   separate `dispatchRebeccaTool()` switch.
3. It specified `MAX_TOOL_DEPTH = 5` — the actual value is **4**.
4. It described `entityType: "property" | "scenario"` — the actual union is 12 types.
5. It described `entityId: string` — the actual type is **number**.
6. It proposed `callLlm()` returning `{ text, dataChanged }` — the actual return is
   `{ text, toolCalls?, stopReason? }`.
7. It omitted Wave 0–3 context-injection features that are now live.

## Guidance

> **2026-05-10 update — file split.** A file-splitting sprint broke the
> monolithic `chat/rebecca-tools.ts` and `routes/chat.ts` into focused domain
> modules. `chat/rebecca-tools.ts` is now a thin re-export barrel — all
> `import { … } from "../chat/rebecca-tools"` callers continue to resolve
> identically. The file paths called out below have been updated to point at
> the new homes for navigation; behavior is unchanged.

### Type layer (`artifacts/api-server/src/chat/tool-types.ts`)

Three types power the tool system:

```typescript
// Declaration passed to the LLM — JSON Schema only, no executor
export interface ToolParam {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

// A single tool invocation returned by the LLM
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// What callLlm() returns
export interface LlmResult {
  text: string;
  toolCalls?: ToolCall[];
  stopReason?: StopReason; // "end_turn" | "tool_use" | "max_tokens"
}
```

The `executor` field from the old proposal does not exist. Tool implementation lives in
`dispatchRebeccaTool()`, a `switch` statement in `chat/rebecca-tool-dispatch.ts`,
which delegates to per-domain implementation modules (`rebecca-tool-impls-property.ts`,
`rebecca-tool-impls-scenario.ts`, `rebecca-tool-impls-deck.ts`,
`rebecca-tool-impls-slide-factory.ts`, `rebecca-tool-impls-iris.ts`,
`rebecca-tool-impls-kb.ts`, `rebecca-tool-impls-admin.ts`).

### DataChangedEntry union (`artifacts/api-server/src/chat/rebecca-tool-types.ts`)

Every mutating tool returns an optional `DataChangedEntry` that the agentic loop
accumulates and emits on the SSE `done` payload:

```typescript
export type DataChangedEntry = {
  entityType: "property" | "scenario" | "slide_factory_run" | "analyst_table"
            | "lb_deck_config" | "kb_entry" | "global_assumptions" | "research_job"
            | "iris_run" | "iris_gap" | "data_source" | "compliance_run"
            | "company" | "market_rate" | "property_finder" | "service_template";
  entityId: number;  // always a number, never a string
};
```

`chat.ts` defines a narrower local alias for the three entity types it creates directly
(`property | scenario | slide_factory_run`); the full 16-type union is in
`rebecca-tool-types.ts`.

### `callLlm()` return contract

`callLlm()` now accepts an optional `tools?: ToolParam[]` parameter and returns
`LlmResult`. When the LLM requests tool execution the return has `toolCalls` populated
and `stopReason: "tool_use"`. When it produces a text response it has `text` and
`stopReason: "end_turn"`. The agentic loop in `chat.ts` decides what to do next —
`callLlm` itself is single-step.

### Provider function-calling wire formats

All four supported providers differ in how tools are declared and how results are fed
back. The `appendToolResults()` helper in `routes/chat-sse.ts` handles the per-provider
serialization:

| Provider | Tool declaration key | Tool-call detection | Result feed-back format |
|---|---|---|---|
| OpenAI | `tools[].function.{name,description,parameters}` | `choices[0].message.tool_calls` | `{ role:"tool", tool_call_id, content: JSON }` |
| Anthropic | `tools[].{name,description,input_schema}` | `stop_reason === "tool_use"` | `{ role:"user", content:[{ type:"tool_result", tool_use_id, content: JSON }] }` |
| Gemini | `tools[0].functionDeclarations[]` | `parts[].functionCall` | `{ role:"user", parts:[{ functionResponse:{name,response} }] }` |
| Exa | N/A — tools not supported; web-grounded RAG only | — | — |

When `tools` are active, `callLlmStream()` delegates to the non-streaming `callLlm()`
and emits the full text as one token. Streaming only resumes on the final text-only
turn (no tools passed on the last depth iteration).

### The agentic loop (`runAgenticLoop` in `artifacts/api-server/src/routes/chat-loop.ts`)

```
MAX_TOOL_DEPTH = 4
```

The loop runs as a closure inside the `POST /api/chat` handler:

```
for depth 0..3:
  if depth == 3: pass no tools → force text turn
  result = callLlm(provider, model, systemPrompt, toolHistory, message, ...)
  if result has no toolCalls → done, return text
  emit SSE tool_start for each call
  execute all tool calls in parallel via dispatchRebeccaTool()
  for each result: push dataChanged if present
  emit SSE tool_done for each call (with runId if result has one)
  append tool call + results to toolHistory (provider-native format)
return final text
```

On depth 0, `callLlmStream()` is used when `stream: true` so tokens arrive
incrementally. On depths 1–3, `callLlm()` is used (batch) and any resulting text is
emitted as a single SSE `delta`.

**Fallback guard:** if the primary provider fails and the admin has configured a
`fallbackProvider`, the loop retries with the fallback — but **only if no mutating
tools have already executed**. If `primaryLoopExecutedTools` is true, the error
propagates rather than risk double-mutations (e.g. a property updated twice).

### SSE event sequence

The streaming response emits these named events in order:

```
event: delta        — { token: string }           (repeated, depth-0 text tokens)
event: tool_start   — { id, name }                (one per tool call, before execution)
event: tool_done    — { id, name, success, elapsedMs, runId? }  (one per result)
event: delta        — { token: string }           (depth 1–3 final text, as one event)
event: done         — full response payload
event: error        — { message, retryable }      (on failure)
```

`runId` on `tool_done` is present when the tool result object has an `id` or `runId`
field (e.g. Iris runs, slide factory runs). The frontend uses this to show a toast:
"Iris health check started — Run #42".

### Frontend cache invalidation (`RebeccaPanel.tsx`)

The `done` SSE event carries `dataChanged: Array<{ entityType, entityId }>`. The panel
iterates the array and calls `queryClient.invalidateQueries()` per entity type. The
full mapping:

| entityType | Query key invalidated |
|---|---|
| `property` | `["properties"]` + `["properties", entityId]` |
| `scenario` | `["scenarios"]` |
| `analyst_table` | `["/api/admin/analyst-tables"]` |
| `lb_deck_config` | `["lb-slides-config"]` |
| `kb_entry` | `["/api/rebecca/kb"]` + `["kb-entry", entityId]` |
| `global_assumptions` | `["/api/global-assumptions"]` |
| `research_job` | `["properties"]` |
| `iris_run` | `["/api/admin/iris/status"]` |
| `iris_gap` | (no-op — no dedicated list query in current UI) |
| `slide_factory_run` | `["/api/lb-slides/factory/runs"]` |
| `data_source` | `["/api/admin/data-sources"]` |
| `compliance_run` | `["/api/admin/compliance/violations"]` |

### Tool registry

`getRebeccaTools()` in `chat/rebecca-tool-definitions.ts` (assembled from
per-domain `rebecca-tool-defs-*.ts` files) returns 70+ `ToolParam` entries.
`dispatchRebeccaTool()` in `chat/rebecca-tool-dispatch.ts` is a `switch` statement
with a case for each. Categories:

| Category | Tools |
|---|---|
| Property CRUD | `list_properties`, `get_property`, `create_property`, `update_property`, `patch_property`, `delete_property` |
| Scenario CRUD | `list_scenarios`, `get_scenario`, `create_scenario`, `update_scenario`, `update_scenario_assumptions`, `lock_scenario`, `delete_scenario`, `compare_scenarios` |
| Global assumptions | `update_global_assumptions` |
| Research | `trigger_research`, `write_retrieval_gap` |
| Analyst tables | `get_analyst_table`, `refresh_analyst_table` |
| LB Deck (legacy) | `get_lb_deck_config`, `configure_lb_deck`, `trigger_lb_deck_render`, `get_lb_deck_render_status` |
| Slide Factory pipeline | `create_slide_factory_run`, `list_slide_factory_runs`, `get_slide_factory_run`, `record_slide_factory_brief`, `accept_slide_factory_brief`, `assign_slide_factory_properties`, `update_slide_factory_slot`, `approve_all_slide_factory_slots`, `trigger_slide_factory_build`, `cancel_slide_factory_build`, `produce_slide_factory_deck`, `rebuild_slide_factory_deck` |
| KB management | `create_kb_entry`, `update_kb_entry`, `delete_kb_entry` |
| Iris intelligence | `trigger_iris_health_check`, `trigger_iris_reindex`, `clear_iris_gaps`, `get_iris_status` |
| Data infrastructure | `get_data_source_status`, `probe_data_source`, `regenerate_data_source` |
| Companies | `list_companies`, `get_company` |
| Live market research | `get_tripadvisor_hotels` |
| Compliance | `run_compliance_audit` |

### Wave 0 features (injected context, not tools)

**W0.1 — rebeccaResponseMode from DB.** When the chat body omits `responseMode`, the
server resolves it from `authUser.rebeccaResponseMode` (a column on the `users` table,
written by `PATCH /api/profile/chat-preferences`). This means users' preferred mode
persists across devices without the client needing to send it on every request.

```typescript
const responseMode = resolveResponseMode(bodyResponseMode, authUser.rebeccaResponseMode);
```

**W0.2 — portfolio verification context.** When `fieldContext.entityType === "property"`,
the handler fetches the most recent verification run and appends a structured block to
the system prompt:

```
PORTFOLIO VERIFICATION (as of <date>):
Opinion: <auditOpinion> | Checks: <total> total, <passed> passed, <failed> failed
```

This gives Rebecca visibility into current portfolio health without requiring the user
to ask about it.

**W0.3 — parity map CI guard.** `docs/discipline/agent-native-parity-map.md` was
extended with 4 tools that existed in code but were undocumented (`list_scenarios`,
`get_scenario`, `patch_property`, `get_tripadvisor_hotels`). A CI test guards against
future drift.

**W0.4 (confirmed complete):** Dino constants were already extracted; no new work
needed.

### Additional context blocks

Beyond Wave 0, the system prompt assembles several blocks:

- **FRED macro-economic context** (U2) — gated on `sources.research.enabled`; built by
  `buildCompanyDataInjection()` and appended after `assembleSystemPrompt()`.
- **Recent activity** (U6) — last 5 non-chat actions from the activity log, with
  relative timestamps, appended to the assembled prompt.
- **RAG context** — KB chunks + assumption-guidance + research-history from pgvector,
  hybrid query when `fieldContext.entityType/entityId` are present.
- **Document context** — uploaded property documents via `retrieveDocumentContext()`.
- **Asset context** — uploaded photos/logos via `searchAssets()`, gated on visual
  keywords or property name match.

### `fieldContext` shape

```typescript
const fieldContextSchema = z.object({
  entityType: z.enum(["property", "company"]),
  entityId: z.number().int().positive(),     // number, not string
  fieldKey: z.string().max(100).optional(),
  scenarioId: z.number().int().positive().nullable().optional(),
});
```

`entityType` in the request is `"property" | "company"` (two values); the broader 12-
value union lives in `DataChangedEntry` for tool write-back payloads.

## Why This Matters

**Action parity requires both tools and write-back.** Tools without `dataChanged` leave
the UI cache stale after Rebecca performs a mutation — users see the old value and
assume the action failed. Both halves are required.

**`MAX_TOOL_DEPTH = 4`, not 5.** The cap is enforced by passing an empty tools array on
the last iteration, forcing a text response rather than an abrupt truncation. Depth 4 is
sufficient for the longest legitimate chains (research → read → update → summarize).

**The fallback anti-mutation guard is critical.** Without `primaryLoopExecutedTools`,
a provider failure mid-loop could cause the fallback to re-execute mutating tools — a
property updated twice, a scenario created twice. The guard makes mutation idempotency a
non-requirement by ensuring fallback only fires on clean (zero-mutation) failures.

**Tool dispatch is a `switch`, not a registry map.** This is intentional: TypeScript's
exhaustiveness checking catches missing cases at compile time when a new tool is added
to `getRebeccaTools()` but not to `dispatchRebeccaTool()`.

**Background tool toasts use `runId`.** Tools that launch background jobs (Iris health
check, data source regeneration) return `{ runId }` on the tool result. The server
extracts it from the result object and includes it in the `tool_done` SSE event. The
frontend maps specific tool names (`BACKGROUND_TOOL_LABELS`) to toast messages so users
get immediate confirmation without polling.

## When to Apply

**Adding a new tool:**
1. Add a `ToolParam` entry to the array in `getRebeccaTools()`.
2. Add a handler function in `rebecca-tools.ts`.
3. Add a case in `dispatchRebeccaTool()`.
4. Add a row to `docs/discipline/agent-native-parity-map.md`.
5. If the tool mutates data, return `dataChanged: { entityType, entityId }` from the
   handler; add the entity type to `DataChangedEntry` if it's new.
6. Add the corresponding `queryClient.invalidateQueries()` branch to `RebeccaPanel.tsx`
   if the entity type is new.

**Adding a new LLM provider:**
1. Add a branch to `callLlm()` and `callLlmStream()`.
2. Add a branch to `appendToolResults()` for provider-native tool result format.
3. If the provider does not support function-calling, skip tool parameters (like Exa).
4. Add the vendor → provider-id mapping to `VENDOR_TO_PROVIDER_ID` in `chat.ts`.

**Adding a Wave-style system-prompt injection:**
Append to `assembledPrompt` after `assembleSystemPrompt()`, following the FRED macro
pattern. Gate on the relevant `rebeccaSettings.sources.*` toggle so admins can disable
it. Keep failures non-blocking with `try/catch` + `logger.warn`.

## Examples

**DataChangedEntry on a mutating tool result:**

```typescript
// In a tool handler in rebecca-tools.ts
async function toolUpdateProperty(args, ctx) {
  const updated = await storage.updateProperty(id, { [field]: value });
  return {
    result: { updated: true, field, oldValue, newValue },
    dataChanged: { entityType: "property", entityId: id },  // number, not string
  };
}
```

**Tool not found in dispatchRebeccaTool — returns error result, not throws:**

```typescript
default:
  return { result: { error: "Unknown tool" } };
```

This means an unknown tool name never crashes the loop — the LLM receives an error
result and can either retry with a correct name or produce a text response.

**SSE tool_done with runId (Iris health check):**

```typescript
// chat.ts — inside the tool result handler
const runId = r && typeof r === "object"
  ? ((r as Record<string, unknown>).runId ?? (r as Record<string, unknown>).id)
  : undefined;
sseWrite(res, "tool_done", {
  id: tc.id, name: tc.name, success: true, elapsedMs,
  ...(typeof runId === "number" ? { runId } : {}),
});
```

**Frontend toast for background tools (RebeccaPanel.tsx):**

```typescript
const BACKGROUND_TOOL_LABELS: Record<string, string> = {
  trigger_iris_health_check: "Iris health check",
  trigger_iris_reindex: "Iris reindex",
  clear_iris_gaps: "Iris gap queue clear",
  regenerate_data_source: "Data source regeneration",
};
// On tool_done event with a BACKGROUND_TOOL_LABELS entry, show toast:
toast({
  title: success ? `${label} started` : `${label} failed`,
  description: runId ? `Run #${runId}` : undefined,
  duration: 4000,
});
```

## Related

- `artifacts/api-server/src/routes/chat-loop.ts` — `runAgenticLoop`, `MAX_TOOL_DEPTH`, `executeTool`
- `artifacts/api-server/src/routes/chat-llm.ts` — `callLlm`, `callLlmStream`
- `artifacts/api-server/src/routes/chat-sse.ts` — `appendToolResults`, SSE event helpers
- `artifacts/api-server/src/routes/chat.ts` — `POST /api/chat` handler that wires the above (plus chat-prompt-builder, chat-context, chat-prompts, chat-settings, chat-sources, chat-conversation, chat-conversations, chat-insight)
- `artifacts/api-server/src/chat/tool-types.ts` — `ToolParam`, `ToolCall`, `LlmResult`
- `artifacts/api-server/src/chat/rebecca-tool-types.ts` — `DataChangedEntry`, `ToolContext`, arg validators (`requireNumericArg`, `requireObjectArg`, `requireAdminCtx`)
- `artifacts/api-server/src/chat/rebecca-tool-definitions.ts` — `getRebeccaTools()` (assembled from per-domain `rebecca-tool-defs-*.ts`)
- `artifacts/api-server/src/chat/rebecca-tool-dispatch.ts` — `dispatchRebeccaTool()` switch
- `artifacts/api-server/src/chat/rebecca-tool-impls-*.ts` — per-domain tool implementations (property, scenario, deck, slide-factory, iris, kb, admin)
- `artifacts/api-server/src/chat/rebecca-tools.ts` — thin re-export barrel; preserves existing import paths
- `artifacts/hospitality-business-portal/src/components/rebecca/RebeccaPanel.tsx` — SSE event handling, `dataChanged` invalidation, tool step indicators, `BACKGROUND_TOOL_LABELS`
- `docs/discipline/agent-native-parity-map.md` — Canonical record of tool coverage vs UI actions; all ✅ as of Wave 0
- `docs/solutions/architecture-patterns/rebecca-agent-native-architecture-2026-05-05.md` — Superseded: the proposed design before implementation
