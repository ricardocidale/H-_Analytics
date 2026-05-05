---
title: "Rebecca Agent-Native Architecture — Function-Calling and Action Parity"
date: 2026-05-05
category: architecture-patterns
module: rebecca-agent-native-architecture
problem_type: architecture_pattern
component: assistant
severity: high
applies_when:
  - Adding tool-calling capability to an existing RAG chatbot
  - Designing an agentic execution loop with depth capping and result feedback
  - Wiring LLM write-back events to frontend cache invalidation over SSE
  - Auditing provider-specific function-calling APIs across OpenAI / Anthropic / Gemini / Perplexity
tags:
  - agent-native
  - function-calling
  - tool-dispatch
  - agentic-loop
  - sse-write-back
  - action-parity
  - llm-provider
  - react-query-invalidation
---

# Rebecca Agent-Native Architecture — Function-Calling and Action Parity

## Context

Rebecca was implemented as a pure RAG chatbot: a single LLM call that receives a `systemPrompt` + `messages` array, returns text, and stops. The `callLlm()` and `callLlmStream()` functions in `artifacts/api-server/src/routes/chat.ts` have no `tools` parameter and no execution loop. Every provider branch — OpenAI, Anthropic, Gemini, Perplexity — exits after one round-trip.

This creates an **action parity gap**: a user can create a scenario through the UI in three clicks, but asking Rebecca "clone this scenario with a 6% exit cap" produces only a text suggestion. The core principle violated is _action parity_ — everything a user can accomplish through the UI, the agent should be able to accomplish through tools.

## Guidance

The target architecture has seven coordinated parts.

**Part 1: Tool type definitions**

Create `artifacts/api-server/src/routes/chat/tool-types.ts`:

```typescript
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
  executor: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
}

export interface ToolContext {
  userId: number;
  propertyId?: string;
}

export type ToolRegistry = Record<string, ToolDefinition>;
```

**Part 2: Tool executor module**

Create `artifacts/api-server/src/routes/chat/rebecca-tools.ts`. Tools call `storage.*` functions directly — same process, not HTTP. Seven categories:

| Category | Tools |
|---|---|
| Property ops | `get_property`, `update_property`, `list_properties` |
| Scenario ops | `get_scenario`, `create_scenario`, `update_scenario`, `clone_scenario`, `delete_scenario` |
| Research | `trigger_property_research` — calls the same logic as `POST /api/properties/:id/seed-research` |
| Market data | `get_market_rates` — queries the `market_rates` table |
| Export (future) | `export_scenario_pdf` — hook stub |
| Navigation hints | Return structured `{ navigateTo: string }` guidance; never manipulate DOM |
| Portfolio analysis | `get_portfolio_summary` — aggregate across properties |

**Part 3: Provider-specific function-calling**

Each provider has a different wire format. Add to `callLlm()`:

```typescript
// OpenAI — tools array with JSON Schema; tool_calls in response
const completion = await client.chat.completions.create({
  model,
  messages,
  tools: toolDefs.map(t => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters }
  })),
  // ... sampling
});
// Tool calls arrive in: completion.choices[0].message.tool_calls
// Feed results back as: { role: "tool", tool_call_id: ..., content: JSON.stringify(result) }
```

```typescript
// Anthropic — tools array; tool_use content blocks
const result = await client.messages.create({
  model,
  tools: toolDefs.map(t => ({
    name: t.name, description: t.description, input_schema: t.parameters
  })),
  // ...
});
// Tool use detected via: result.content.some(b => b.type === "tool_use")
// Feed results back in: { role: "user", content: [{ type: "tool_result", tool_use_id: ..., content: JSON.stringify(result) }] }
```

```typescript
// Gemini — functionDeclarations; functionCall parts
const response = await gemini.models.generateContent({
  model,
  tools: [{ functionDeclarations: toolDefs.map(t => ({
    name: t.name, description: t.description, parameters: t.parameters
  })) }],
  // ...
});
// Tool use detected via: response.candidates[0].content.parts.some(p => p.functionCall)
// Feed results back as: { role: "user", parts: [{ functionResponse: { name, response: result } }] }
```

```typescript
// Perplexity — no tool support; stays RAG-only
// Skip all tool processing; return text directly as before
```

**Part 4: Agentic execution loop**

Replace the single-call pattern with a bounded loop inside `callLlm()`:

```typescript
const MAX_TOOL_DEPTH = 5;
let depth = 0;
let currentMessages = buildInitialMessages(systemPrompt, history, userMessage);

while (depth < MAX_TOOL_DEPTH) {
  const response = await callProviderOnce(provider, model, currentMessages, toolDefs, sampling);

  if (!hasToolCalls(response)) {
    return { text: extractText(response), toolsInvoked };
  }

  const toolResults = await Promise.all(
    getToolCalls(response).map(async (call) => {
      const tool = toolRegistry[call.name];
      const result = await tool.executor(call.args, context);
      toolsInvoked.push(call.name);
      return { call, result };
    })
  );

  currentMessages = appendToolResults(currentMessages, response, toolResults);
  depth++;
}

// MAX_TOOL_DEPTH reached — return what the model has so far
return { text: extractFinalText(currentMessages), toolsInvoked };
```

**Part 5: Write-back via SSE `done` payload**

The SSE `done` event already fires at line 1046 in `chat.ts`:

```typescript
sseWrite(res, "done", responsePayload);
```

Extend `responsePayload` with a `dataChanged` field populated by the tool executor:

```typescript
// Server — build dataChanged from toolsInvoked results
const dataChanged: Array<{ entityType: "property" | "scenario" | "market_rate", entityId: string }> =
  toolResults
    .filter(r => r.mutated)
    .map(r => ({ entityType: r.entityType, entityId: r.entityId }));

sseWrite(res, "done", { ...responsePayload, dataChanged });
```

```typescript
// Frontend — RebeccaPanel.tsx, in the SSE done handler
if (payload.dataChanged?.length) {
  for (const change of payload.dataChanged) {
    if (change.entityType === "property") {
      queryClient.invalidateQueries(["properties", change.entityId]);
    } else if (change.entityType === "scenario") {
      queryClient.invalidateQueries(["scenarios", change.entityId]);
    }
  }
}
```

**Part 6: System prompt restructure**

Add a "## Your Capabilities" section to Rebecca's system prompt that lists each tool with a one-line usage example. Shift framing from "you have access to this knowledge base" to "you can take these actions." The Perplexity path keeps the knowledge-base framing unchanged — it receives no tools.

**Part 7: Parity discipline**

Add to `CLAUDE.md`:

> Every UI action must have a corresponding Rebecca tool. Before adding a new UI feature, check `docs/discipline/agent-native-parity-map.md`.

Create `docs/discipline/agent-native-parity-map.md` as a table mapping every UI action to its Rebecca tool equivalent. Create `.agents/skills/parity-audit/SKILL.md` as an audit skill that surfaces gaps when new UI actions are added.

## Why This Matters

Without tools, Rebecca can only describe. She can tell a user "you might want to update the exit cap rate" but cannot do it. This makes her a reference assistant, not a collaborator. The cost is user friction: every insight Rebecca produces requires a manual follow-up action in the UI.

The write-back mechanism is equally critical. If Rebecca updates a property value but the UI cache is stale, the user sees the old value and assumes the action failed. Without `dataChanged` + cache invalidation, mutations are silent — the UI and the database diverge until the user manually refreshes.

The `MAX_TOOL_DEPTH` guard (5 iterations) prevents runaway agentic loops in edge cases where tool results trigger further tool calls indefinitely. Five is conservative enough to cover most legitimate multi-step tasks (clone scenario → update assumption → recalculate → summarize) without unbounded recursion risk.

## When to Apply

- Rebecca is being upgraded from a single-call responder to a capable agent
- A new UI action is added that users will naturally want to request conversationally
- A tool is added or removed from the registry (re-verify provider wire format coverage)
- A new LLM provider is added and needs function-calling wiring

Do not retrofit tool support into the Perplexity path — Perplexity is web-grounded and has no function-calling protocol. It remains RAG-only.

## Examples

**Before — pure RAG, no tools:**

```typescript
// callLlm() — current state
export async function callLlm(
  provider: "openai" | "anthropic" | "gemini" | "perplexity",
  model: string,
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  userMessage: string,
  sampling: { temperature: number; maxOutputTokens: number; topP: number },
): Promise<{ text: string }> {
  // Single call per provider branch, no tools parameter, returns text
  if (provider === "openai") {
    const completion = await client.chat.completions.create({
      model, messages, max_tokens: sampling.maxOutputTokens, // no tools
    });
    return { text: completion.choices[0].message.content };
  }
  // ... other providers similarly
}
```

**After — agent-native with tool loop:**

```typescript
export async function callLlm(
  provider: "openai" | "anthropic" | "gemini" | "perplexity",
  model: string,
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  userMessage: string,
  sampling: { temperature: number; maxOutputTokens: number; topP: number },
  tools: ToolRegistry,       // NEW
  context: ToolContext,      // NEW
): Promise<{ text: string; dataChanged: MutationRecord[] }> {
  // Perplexity: skip tool processing, return text directly
  if (provider === "perplexity") { /* unchanged */ }

  // All other providers: run agentic loop
  const { text, dataChanged } = await runAgenticLoop(
    provider, model, systemPrompt, history, userMessage, sampling, tools, context
  );
  return { text, dataChanged };
}
```

**SSE done payload — before:**

```typescript
sseWrite(res, "done", {
  suggestedChips,
  detectedLanguage,
  sourcesUsed: sourcesUsedSorted,
});
```

**SSE done payload — after:**

```typescript
sseWrite(res, "done", {
  suggestedChips,
  detectedLanguage,
  sourcesUsed: sourcesUsedSorted,
  dataChanged,   // NEW — Array<{ entityType, entityId }>
});
```

## Related

- `docs/plans/2026-05-05-009-feat-rebecca-conversational-agent-parity-plan.md` — Implementation plan for all 6 units
- `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md` — Related: wiring DB data into `handleToolCall` dispatch; ADR-007 DI discipline applies to tool executors
