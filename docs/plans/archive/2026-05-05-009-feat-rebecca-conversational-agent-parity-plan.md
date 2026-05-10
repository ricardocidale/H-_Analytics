---
title: "feat: Rebecca conversational agent — function-calling tools + agent-native parity discipline"
type: feat
status: completed
date: 2026-05-05
origin: |
  Agent-native architecture analysis (ce-agent-native-architecture skill, 2026-05-05).
  Motivated by the parity gap audit showing Rebecca can discuss but not act on portfolio data.
  See conversation context: Rebecca 100% conversational + admin sidebar redesign session.
---

# Rebecca Conversational Agent — Function-Calling Tools + Parity Discipline

## Problem Frame

Rebecca is a RAG chatbot. She can discuss the portfolio but cannot act on it. A user saying
"update the ADR for Belleayre to $285" gets a description of the current value, not the change
applied. This is the "agent as observer" anti-pattern — every action a user can take through the
H+ UI is unavailable to Rebecca.

**The surprising insight:** all CRUD REST routes already exist.

- `PATCH /api/properties/:id` — update any property field
- `POST /api/scenarios` — create scenario
- `PATCH /api/scenarios/:id` — edit scenario assumptions
- `POST /api/scenarios/:id/clone` — clone scenario
- `POST /api/properties/:id/seed-research` — trigger Analyst research

Rebecca just needs a function-calling tool layer wired into `callLlm` / `callLlmStream`, an
agentic execution loop in the chat handler, and a system prompt restructured from "knowledge
base" framing to "capability sections" framing.

The second deliverable is a durable parity discipline so the gap does not reopen as new UI
features ship: a CLAUDE.md rule, a capability map document, and an agent-native parity skill.

## Scope Boundaries

- **In:** Property + scenario tools (CRUD), Analyst research trigger, system prompt restructure,
  write-back SSE signal, frontend cache invalidation, parity discipline artifacts.
- **Out:** Document uploads, admin settings mutations, user management via chat, global
  assumptions edits via chat (higher risk surface — deferred).
- **Out:** Perplexity tool support (Perplexity API does not support function calling; that
  provider stays RAG-only).
- **Out:** UI for showing Rebecca's tool calls / "thinking" steps (deferred to a future UX pass).

## Key Technical Decisions

**Tools call the service layer directly, not HTTP.** Since `callLlm` runs in the same Node.js
process as the Express routes, tool executors import `storage.*` functions directly rather than
making internal HTTP calls. This eliminates auth-header round-trips, avoids latency, and keeps
tool results in the same transaction context as the chat handler. The existing auth guard moves
to the tool executor: `storage.getProperty(id, userId)` with ownership enforcement.

**Agentic loop terminates at tool-call depth 4.** The chat handler runs the LLM in a loop:
generate → if tool calls → execute → feed results → generate again. Cap at 4 iterations to
prevent runaway chains. Most conversational actions complete in 1–2 turns.

**Write-back via `dataChanged` in SSE done payload.** When a tool executor mutates a property or
scenario, it returns `{ changed: true, entityType, entityId }`. The chat handler collects these
across all tool turns and includes `dataChanged: [...]` in the SSE `done` event. The frontend
`RebeccaPanel.tsx` calls `queryClient.invalidateQueries()` for affected keys (`["properties"]`,
`["properties", id]`, `["scenarios"]`). This reuses the React Query invalidation pattern already
present in the codebase (`PropertyHeroImagesTab`, `ScenariosTab`).

**System prompt: capability sections, not knowledge framing.** The current `DEFAULT_SYSTEM_PROMPT`
is organized around what Rebecca knows. After this plan it is reorganized around what Rebecca can
do: each tool gets a `## Managing [Entity]` section with user-vocabulary guidance, judgment
criteria (when to confirm vs. proceed), and explicit guardrails (no silent bulk writes, always
show the delta after a change).

**Perplexity stays RAG-only.** The `callLlm` / `callLlmStream` functions skip tool execution
when `provider === "perplexity"`. The capability prompt section notes this so the LLM knows not
to attempt tool use when Perplexity is selected.

**Parity discipline encoded in CLAUDE.md.** Following the same pattern as the magic-numbers gate
(Rule 1), a new Rule 7 is added: "When adding any UI capability, add the corresponding Rebecca
tool in the same PR. Update `docs/discipline/agent-native-parity-map.md`." A parity audit skill
(`parity-audit`) is added under `.agents/skills/` so any session can run a structured gap
analysis.

## Implementation Units

---

### U1 — Tool-calling infrastructure in `callLlm` / `callLlmStream`

**Goal:** Extend the LLM call layer to accept tool definitions and return tool call results. No
behavior change for callers that pass no tools.

**Files:**
- Create: `artifacts/api-server/src/chat/tool-types.ts`
- Modify: `artifacts/api-server/src/routes/chat.ts`

**Approach:**

Define minimal shared types in `tool-types.ts`:

```typescript
export interface ToolParam {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmResult {
  text: string;
  toolCalls?: ToolCall[];
  stopReason?: "end_turn" | "tool_use" | "max_tokens";
}
```

Modify `callLlm()` signature:
```typescript
export async function callLlm(
  provider: ...,
  model: string,
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  userMessage: string,
  sampling: { temperature: number; maxOutputTokens: number; topP: number },
  userId?: number,
  webSearchEnabled?: boolean,
  tools?: ToolParam[],        // ← new optional
): Promise<LlmResult>         // ← was { text: string }
```

Per-provider implementation notes:
- **OpenAI:** pass `tools` as `tools: tools.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }))`, `tool_choice: "auto"`. Parse `choices[0].message.tool_calls` into `ToolCall[]`.
- **Anthropic:** pass `tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }))`. Parse `content` blocks where `type === "tool_use"` into `ToolCall[]`. `stop_reason === "tool_use"` maps to `stopReason: "tool_use"`.
- **Gemini:** pass `tools: [{ functionDeclarations: tools.map(...) }]`. Parse `parts` where `functionCall` exists into `ToolCall[]`.
- **Perplexity:** ignore `tools` parameter entirely — Perplexity API has no function-calling support. Return `stopReason: "end_turn"` always.

`callLlmStream()` follows the same signature extension. Streaming tool call events are buffered
(tool call arguments stream as deltas; accumulate them before emitting `ToolCall`). The
`onToken` callback continues to fire for text tokens only. Add an optional `onToolCall` callback
for the execution loop to receive complete tool calls.

**Patterns to follow:**
- `artifacts/api-server/src/routes/chat.ts` lines 86–233 — existing per-provider branching pattern
- All numeric literals (timeout values) must use existing `AI_GENERATION_TIMEOUT_MS` constant

**Test scenarios:**
- Unit: `callLlm` with `tools=[]` returns same shape as before (backward compatibility)
- Unit: OpenAI mock returns `tool_calls` → `LlmResult.toolCalls` is populated
- Unit: Anthropic mock returns `tool_use` block → `toolCalls` populated, `stopReason: "tool_use"`
- Unit: Perplexity with tools defined → tools ignored, returns `stopReason: "end_turn"` and text only

**Verification:**
- `pnpm run typecheck` — clean
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- `pnpm --filter @workspace/api-server run test` — PASS

---

### U2 — Agentic execution loop in the chat request handler

**Goal:** Add a tool executor dispatcher and an agentic loop to the chat POST handler. The loop
runs: LLM → tool calls → execute → feed results → LLM again, until `stopReason === "end_turn"`
or depth 4.

**Files:**
- Modify: `artifacts/api-server/src/routes/chat.ts` (chat request handler, lines ~900–1060)

**Approach:**

Add `executeTool(name, args, context)` dispatcher:
```typescript
type ToolContext = { userId: number; req: Request };

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> { ... }
```

`DataChangedEntry = { entityType: "property" | "scenario"; entityId: number }`.

The dispatcher delegates to tool modules imported from `./rebecca-tools` (U3). Unknown tool
names return `{ result: { error: "Unknown tool" } }`.

Agentic loop (replaces the current single `callLlm` / `callLlmStream` call):
```typescript
const MAX_TOOL_DEPTH = 4;
const dataChanged: DataChangedEntry[] = [];
let toolHistory = [...effectiveHistory];
let finalText = "";

for (let depth = 0; depth < MAX_TOOL_DEPTH; depth++) {
  const result = await callLlm(..., tools);
  if (!result.toolCalls?.length || result.stopReason === "end_turn") {
    finalText = result.text;
    break;
  }
  // execute tools
  const toolResults = await Promise.all(result.toolCalls.map(async (tc) => {
    const { result: r, dataChanged: dc } = await executeTool(tc.name, tc.arguments, ctx);
    if (dc) dataChanged.push(dc);
    return { id: tc.id, name: tc.name, result: r };
  }));
  // append tool calls + results to history for next turn
  toolHistory = appendToolResults(toolHistory, result.toolCalls, toolResults);
}
```

`appendToolResults` formats tool turns per-provider (OpenAI: `assistant` message with
`tool_calls` + `tool` messages with `tool_call_id`; Anthropic: `assistant` with `tool_use`
blocks + `user` with `tool_result` blocks; Gemini: `model` with `functionCall` parts + `user`
with `functionResponse` parts).

The streaming path mirrors this loop but emits `delta` events during the final text-generation
turn only (not during tool execution turns, which are silent to the user).

Add `dataChanged` to the SSE `done` event payload (and the non-streaming JSON response).

**Patterns to follow:**
- `artifacts/api-server/src/routes/chat.ts` lines 940–970 — existing streaming/non-streaming branching
- `MAX_TOOL_DEPTH` must be a named constant, not a literal `4`

**Test scenarios:**
- Integration: single tool call resolves → final text includes tool result context
- Integration: depth cap prevents infinite loops — mock LLM that always returns tool calls hits depth 4 and returns last text
- Integration: `dataChanged` entries from tool executions appear in done payload

**Verification:**
- `pnpm run typecheck` — clean
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- Existing chat endpoint integration tests — PASS

---

### U3 — Rebecca tool implementations

**Goal:** Implement the property and scenario tools that give Rebecca write access to the
portfolio. Each tool enforces auth (user must own or have access to the entity), validates
inputs, and returns a structured result suitable for LLM consumption.

**Files:**
- Create: `artifacts/api-server/src/chat/rebecca-tools.ts`

**Approach:**

Tools to implement (all Zod-validated inputs):

```typescript
// Read tools
list_properties()               → { properties: Array<{ id, name, country, type }> }
get_property(id)                → { property: { id, name, ...key fields } }
list_scenarios(propertyId?)     → { scenarios: Array<{ id, name, propertyId, isLocked }> }
get_scenario(id)                → { scenario: { id, name, assumptions: {...} } }

// Write tools
update_property(id, field, value)
  → { success: true, field, before, after, displayName } | { error: string }
create_scenario({ propertyId, name, cloneFromId? })
  → { scenario: { id, name } } | { error: string }
update_scenario(id, fields)
  → { success: true, updated: string[] } | { error: string }
lock_scenario(id)               → { success: true }
delete_scenario(id)             → { success: true } | { error: string }

// Trigger tools
trigger_research(propertyId)    → { queued: true, estimatedMinutes: 2 }
```

Auth enforcement in each tool:
- `list_properties()` / `list_scenarios()`: call `storage.getProperties(userId)` — built-in user
  scoping
- `get_property(id)` / `update_property(id, ...)`: call `storage.getProperty(id)` then verify
  `property.userId === ctx.userId` (or admin override)
- `update_property(id, field, value)`: validate `field` exists in `updatePropertySchema` shape
  (import from `@workspace/db`). Return `{ error: "Unknown field: X" }` for unrecognized fields
  rather than throwing.

`update_property` returns the before/after delta so Rebecca can include it in her response:
```
Done — updated ADR for Belleayre Mountain from $245 to $285.
Projected RevPAR at 68% occupancy: $194.
```

`trigger_research(propertyId)` calls the existing research job queue logic (same as
`POST /api/properties/:id/seed-research` internal path) and returns `{ queued: true }`. Rebecca
tells the user the job is running and to refresh in ~2 minutes.

**Patterns to follow:**
- `artifacts/api-server/src/routes/properties.ts` lines 299–524 — `PATCH /api/properties/:id`
  validation and storage call patterns
- `artifacts/api-server/src/routes/scenarios.ts` lines 364–384 — clone logic
- All tool-returned numeric values (estimatedMinutes, etc.) must be named constants

**Test scenarios:**
- `list_properties`: returns only properties owned by the user (not all properties)
- `update_property` with unknown field: returns `{ error: "Unknown field" }` not a throw
- `update_property` on property not owned by user: returns `{ error: "Not found" }`
- `update_property` on valid field: storage called, delta returned
- `create_scenario` with `cloneFromId`: calls clone path, returns new id
- `trigger_research`: queues job and returns `{ queued: true }`

**Verification:**
- `pnpm run typecheck` — clean
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- `pnpm --filter @workspace/api-server run test` — PASS (tool unit tests)

---

### U4 — System prompt restructure: capability sections

**Goal:** Refactor `DEFAULT_SYSTEM_PROMPT` in `chat-prompts.ts` from knowledge-base framing to
capability-sections framing. Add a `## What You Can Do` block and per-capability guidance
sections with judgment criteria and guardrails.

**Files:**
- Modify: `artifacts/api-server/src/routes/chat-prompts.ts`

**Approach:**

The restructured prompt adds these sections after the existing persona/voice/behavior blocks:

```markdown
## What You Can Do

You have tools to take actions in H+ Analytics — not just discuss data.

**Portfolio reads**
- `list_properties` — see all properties in the portfolio
- `get_property` — fetch a specific property's full data
- `list_scenarios` — see available scenarios, optionally for one property
- `get_scenario` — fetch a scenario's assumptions

**Property edits**
- `update_property` — change any property field (ADR, occupancy, cap rate, marketing rate, etc.)
  Always confirm the change in your reply: show field name, old value → new value.

**Scenario management**
- `create_scenario` — create a new scenario, optionally by cloning an existing one
- `update_scenario` — edit scenario assumptions
- `lock_scenario` — lock a scenario to prevent further edits
- `delete_scenario` — delete a scenario (confirm before deleting)

**Research**
- `trigger_research` — queue a market research run for a property (~2 min)

## When to Use Tools vs. When to Answer

If the user asks a factual question about data you already have in context, answer directly —
don't make a tool call to retrieve information you were already given.

Use tools when:
- The user wants to change something ("update", "set", "change", "create", "clone", "delete")
- You need fresh data that wasn't in the system prompt (a specific scenario's assumptions, a
  property you weren't given details for)
- The user asks to trigger an operation ("run research", "refresh the data")

## Guardrails for Write Actions

- When scope is ambiguous (property not named, field not clear), ask before acting. Don't guess.
- Never write to multiple entities in one turn without first listing what you're about to change
  and getting confirmation.
- After every successful write, show the before → after delta. Don't just say "done".
- If the user's request would change something irreversible (delete a scenario), confirm
  explicitly: "I'll delete [scenario name]. Is that right?"
```

The existing persona/voice blocks, RAG source blocks, and guardrail blocks are preserved. The
`## What You Can Do` section is injected after the core persona, before the portfolio data block.

When `provider === "perplexity"`, append a note: "Note: tool actions are unavailable in
web-search mode. Switch to a different provider to use property and scenario tools."

**Patterns to follow:**
- `artifacts/api-server/src/routes/chat-prompts.ts` — existing block structure and `RESPONSE_MODE_CONFIG`

**Test scenarios:**
- Prompt assembly includes `## What You Can Do` when tools are enabled
- Perplexity path includes the tool-unavailable note
- Existing `DEFAULT_SYSTEM_PROMPT` snapshot test (if present) is updated

**Verification:**
- `pnpm run typecheck` — clean
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS

---

### U5 — Write-back signal + frontend cache invalidation

**Goal:** When Rebecca takes a write action, the UI reflects it immediately without a manual
refresh. The SSE `done` event carries `dataChanged` entries; `RebeccaPanel.tsx` invalidates
the relevant React Query caches.

**Files:**
- Modify: `artifacts/api-server/src/routes/chat.ts` — add `dataChanged` to done payload
- Modify: `artifacts/hospitality-business-portal/src/components/rebecca/RebeccaPanel.tsx` —
  read `dataChanged` from done payload, call `queryClient.invalidateQueries()`

**Approach:**

Backend (chat.ts):
The agentic loop (U2) accumulates `dataChanged: DataChangedEntry[]`. The existing `responsePayload`
object gains `dataChanged: dataChanged.length > 0 ? dataChanged : undefined`.

Frontend (RebeccaPanel.tsx):
In the SSE `done` event handler, after appending the assistant message:
```typescript
if (payload.dataChanged?.length) {
  for (const entry of payload.dataChanged) {
    if (entry.entityType === "property") {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      queryClient.invalidateQueries({ queryKey: ["properties", entry.entityId] });
    } else if (entry.entityType === "scenario") {
      queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    }
  }
}
```

`RebeccaPanel.tsx` already uses `useQuery` / `useMutation` patterns. Import `useQueryClient`
from `@tanstack/react-query` (already a dependency; check existing imports first).

The non-streaming JSON response path gets the same `dataChanged` field. The frontend
non-streaming handler already parses the response body — add the same invalidation logic there.

**Patterns to follow:**
- `artifacts/hospitality-business-portal/src/components/admin/PropertyHeroImagesTab.tsx` line 180
  — `queryClient.invalidateQueries({ queryKey: ["properties"] })`
- `artifacts/hospitality-business-portal/src/lib/api/properties.ts` lines 63, 70 — canonical
  query keys `["properties"]` and `["properties", id]`
- `artifacts/hospitality-business-portal/src/lib/api/scenarios.ts` line 47 — `["scenarios"]`

**Test scenarios:**
- `dataChanged` appears in done payload when `update_property` tool ran
- `dataChanged` is omitted (not `[]`) when no write tools were called
- Frontend: after `update_property` tool response, React Query cache for `["properties"]` is
  invalidated (verified by checking `queryClient.getQueryState`)

**Verification:**
- `pnpm run typecheck` — clean
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- Manual test: say "update ADR for [property] to [value]" in chat → property card in UI updates
  without page reload

---

### U6 — Agent-native parity discipline

**Goal:** Encode the parity discipline as a non-negotiable project rule so the capability gap
does not reopen as new UI features ship. Deliverables: a CLAUDE.md rule, a living capability
map document, and a parity audit skill.

**Files:**
- Modify: `/home/runner/workspace/CLAUDE.md` — add Rule 7
- Create: `docs/discipline/agent-native-parity-map.md` — living capability map
- Create: `.agents/skills/parity-audit/SKILL.md` — parity audit skill for any session to invoke

**Approach:**

**CLAUDE.md Rule 7 (agent-native parity gate):**

```markdown
## 7. Agent-Native Parity — Mandatory Discipline

Every UI action a user can take, Rebecca must be able to achieve through conversation.

**When adding any UI capability**, also add the corresponding Rebecca tool in the same PR
and update `docs/discipline/agent-native-parity-map.md`.

**Parity map status values:**
- ✅ Tool exists and is documented in Rebecca's system prompt
- ⚠️ UI action exists but no Rebecca tool — MUST be resolved before merging
- 🚫 N/A — user-only action (file picker, camera, biometric auth)

**The parity audit skill:** run `/parity-audit` in any session to get a structured
gap analysis comparing the current UI action list against known Rebecca tools.
```

**`docs/discipline/agent-native-parity-map.md`:**

| UI Action | Route / Location | Rebecca Tool | Status |
|---|---|---|---|
| View property list | Properties sidebar | `list_properties` | ✅ |
| View property detail | Property page | `get_property` | ✅ |
| Edit property field | Property → Edit | `update_property` | ✅ |
| Create scenario | Scenarios → New | `create_scenario` | ✅ |
| Clone scenario | Scenarios → Clone | `create_scenario (cloneFromId)` | ✅ |
| Edit scenario | Scenario → Edit | `update_scenario` | ✅ |
| Lock scenario | Scenario → Lock | `lock_scenario` | ✅ |
| Delete scenario | Scenario → Delete | `delete_scenario` | ✅ |
| Run research | Property → Research | `trigger_research` | ✅ |
| Upload document | Property → Docs | — | 🚫 N/A (file picker) |
| Edit global assumptions | Admin → Defaults | — | ⚠️ Deferred (high risk) |
| Change brand / appearance | Admin → Appearance | — | 🚫 N/A (admin-only) |
| Manage users | Admin → Team | — | 🚫 N/A (admin-only) |
| Change Rebecca config | Admin → AI | — | 🚫 N/A (admin-only) |

**`.agents/skills/parity-audit/SKILL.md`:**

A lightweight skill that, when invoked, reads the capability map, checks each ✅ entry by
searching for the tool name in `artifacts/api-server/src/chat/rebecca-tools.ts`, and reports
any ⚠️ entries where the tool file doesn't contain the tool name (drift detection). Output is a
table of current status with any gaps flagged.

**Patterns to follow:**
- `CLAUDE.md` existing rule format (Rules 1–6)
- `.agents/skills/no-magic-numbers/SKILL.md` — format reference for discipline skills

**Verification:**
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS (no numeric literals
  added in discipline docs)
- Manual: read CLAUDE.md and confirm Rule 7 is present and correctly formatted

---

## Execution Routing

| Unit | Where | Dependency |
|---|---|---|
| U1: Tool infrastructure | CC | none |
| U2: Agentic loop | CC | U1 |
| U3: Tool implementations | CC | U1 |
| U4: System prompt restructure | CC or Replit | none (independent) |
| U5: Write-back + frontend | CC | U2 + U3 |
| U6: Parity discipline | CC | none (independent) |

**Parallel batch A (no dependencies):** U1, U4, U6 can run in parallel.
**Batch B (after U1):** U2 and U3 in parallel (both need U1's type definitions).
**Batch C (after U2 + U3):** U5.

---

## Deferred to Implementation

- Whether `trigger_research` should also accept a `fields` array to scope the research run
  (currently full-property only)
- Whether streaming tool call events should emit a visible "thinking" UI indicator in Rebecca
  panel (separate UX decision)
- Whether `update_scenario` should accept partial field paths or full scenario objects (decide
  based on actual scenario schema shape at implementation time)
- Rate limiting for write tools per user per minute (decide threshold at implementation time;
  should be a `DEFAULT_*` or named constant, not a literal)
