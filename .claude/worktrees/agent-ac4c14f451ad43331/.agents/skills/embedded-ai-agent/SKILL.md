---
name: embedded-ai-agent
description: Build or extend a streaming AI chat agent embedded in a web app — chatbot, assistant, analyst. Use when adding a conversational AI component, configuring a persona, wiring RAG or knowledge-base context, building admin config for an AI agent, or adding conversation history persistence. A reference implementation of this pattern is the Rebecca chatbot in this project.
---

# Embedded AI Agent Skill

Build a streaming conversational AI agent embedded in a web application. The agent has a configurable persona, receives contextual knowledge about the app's data, and streams responses back to the user. It can be scoped to a single page, a floating widget, or a full-screen panel.

## Architecture: the four layers

Every embedded AI agent has the same four layers. Build from backend to frontend.

```
┌──────────────────────────────────────────────────────────┐
│  1. Settings / Config layer                               │
│     Persona name, tone, model, source toggles            │
│     Stored in DB, editable in admin panel                 │
├──────────────────────────────────────────────────────────┤
│  2. Context assembly layer (server-side, per request)     │
│     Static app context + dynamic entity context + RAG     │
├──────────────────────────────────────────────────────────┤
│  3. LLM dispatch layer                                    │
│     Provider abstraction, primary + fallback, timeout     │
├──────────────────────────────────────────────────────────┤
│  4. Frontend layer                                        │
│     Chat UI, AbortController, streaming display,          │
│     message history (last N turns), conversation store   │
└──────────────────────────────────────────────────────────┘
```

---

## Layer 1 — Settings / Config

The persona and model are editable at runtime by admins. Store them in the database alongside the app's global config row (not in env vars or code).

**What to store:**
- `displayName` — the name shown in the chat header
- `description` — one paragraph about the agent's purpose and scope (surfaced in system prompt)
- `personaTone` — 0–100 slider: formal ↔ casual
- `focusDepth` — 0–100: concise ↔ detailed
- `model` + `provider` — selected at runtime (not hardcoded)
- `fallback` — secondary provider if primary fails
- Source toggles — which knowledge sources to enable (vector DB, knowledge base, web search, app data)

**Pattern:** A `mergeSettings(storedConfig)` function that fills in defaults where the admin has not set a value. The merged result is the only input to context assembly — route handlers never read raw config directly.

**System prompt assembly:** Build the system prompt from composable blocks:
1. Base persona block (name + description + tone)
2. Knowledge sources block (what the agent knows, what it doesn't)
3. App context block (what this application does, who uses it)
4. Response format block (markdown allowed? length guidance?)

A function like `assembleSystemPrompt(settings, contextBlocks)` concatenates only the blocks that are enabled. This lets admins toggle capabilities without touching code.

---

## Layer 2 — Context Assembly (server-side, per request)

The context assembled per request is what makes the agent useful — it knows the user's current data, not just generic knowledge.

**Static context** (same for all requests):
- What the application does (2–3 sentences)
- Key entity types and their relationships
- What the agent can and cannot answer

**Dynamic context** (per request, injected from request body):
- Current page / active entity (e.g., `{ entityType: "property", entityId: 42 }`)
- Active scenario or comparison set
- User role (drives what data to expose)

**RAG context** (semantic retrieval at request time):
- Vector store search against the user's message + entity context
- Knowledge base chunks (curated content, how-to docs, policies)
- Asset context (images, documents linked to the entity)

**Pattern:** A `buildContext(request, settings)` function that returns a structured object. Each field is a string block that gets concatenated into the final system prompt. The function is deterministic and testable — given the same input it returns the same context block.

**What NOT to inject:**
- Full table dumps — summarize or retrieve relevant slices
- Other users' private data
- Live prices or external API responses without a freshness label

---

## Layer 3 — LLM Dispatch

The dispatch layer is a single `callLlm(provider, model, systemPrompt, history, message, sampling)` function. It is provider-agnostic — callers do not know which provider runs the request.

**Required behaviors:**
- **Timeout**: wrap every provider call in `Promise.race` with a fixed-duration timeout (e.g., 30s). Never let a hanging LLM call block the response indefinitely.
- **Fallback**: if the primary provider throws, retry with the fallback provider. Log the failure and the fallback. Surface a user-visible error only if both fail.
- **History truncation**: pass only the last N turns (e.g., 10) to avoid context window overflow. The caller is responsible for slicing before calling.
- **Cost logging**: record estimated token counts + model + provider in a cost log table. Essential for understanding spend per user and per feature.

**Streaming vs. non-streaming:**
- Prefer non-streaming for simplicity in the first version. The backend resolves the full response, then sends JSON.
- Upgrade to streaming (SSE) only when response latency noticeably impacts UX. Streaming requires `res.writeHead(200, {'Content-Type': 'text/event-stream'})` and careful client-side chunk accumulation.

**Provider client pattern:**
```typescript
// Each provider returns { text: string }
function getAnthropicClient() { /* read API key from env */ }
function getOpenAIClient() { /* read API key from env */ }
// callLlm switches on provider string and returns { text }
```

Keep provider clients in a single `ai/clients.ts` file. Route handlers import only `callLlm`.

---

## Layer 4 — Frontend

### Component anatomy

```
<AgentWidget>                  ← floating button + panel wrapper
  <AgentHeader>                ← name, avatar, close button, history button
  <AgentMessages>              ← scrolling message list
    <UserMessage />            ← plain text bubble
    <AssistantMessage />       ← markdown-rendered, sources panel
    <TypingIndicator />        ← shown while loading=true
  <AgentInput>                 ← text input + send button + abort button
```

### Key behaviors (every implementation MUST include)

1. **AbortController on every request.** Store it in a `ref`. On send: abort previous, create new. On unmount: abort. This prevents race conditions when the user sends rapidly.

   ```typescript
   const abortRef = useRef<AbortController | null>(null);
   // on send:
   abortRef.current?.abort();
   const controller = new AbortController();
   abortRef.current = controller;
   // pass signal to fetch
   ```

2. **Optimistic message display.** Append the user's message to the list *before* the fetch resolves. Never wait for server confirmation to show the user's own words.

3. **History window.** Send only the last N turns (e.g., 10) in the request body. Keep the full history in component state for display but never send it all to the server.

4. **Loading state on the send button.** Disable send + show spinner while `loading=true`. Show an "interrupt" / stop button instead.

5. **Error display.** On fetch failure, append a system message to the chat list: "Something went wrong — please try again." Never leave the user staring at a spinner.

6. **Auto-scroll.** After every new message, scroll the messages list to bottom. Use `ref.current?.scrollIntoView({ behavior: "smooth" })` on a sentinel div.

7. **Keyboard submit.** Enter key submits; Shift+Enter inserts a newline.

### Conversation persistence

Store conversations in the database (not localStorage). Each conversation has:
- `id`, `userId`, `createdAt`, `title` (auto-generated from first message)
- `messages[]`: `id`, `conversationId`, `role`, `content`, `sources`

Provide a history panel where the user can browse and reload past conversations. Loading a conversation replaces the current message list with the stored messages — the user can continue from where they left off.

---

## Admin Configuration Panel

Give admins a live config screen with:
- Persona fields (display name, description, tone sliders)
- Model + provider picker (dropdown of available providers)
- Source toggles (checkboxes for each context source)
- **Test Chat panel**: a full chat interface that uses the admin's unsaved settings (`previewSettings`) without persisting to the live conversation log. This lets admins test persona changes before saving.

The test chat endpoint accepts a `previewSettings` param (admin-only, ignored for non-admin callers) that overrides the DB settings for that one call. This is the most important admin feature — it closes the loop between editing and testing.

---

## Quality Checklist

Before shipping any version of this feature:

- [ ] AbortController is in place and tested (rapid-fire two messages, only second response appears)
- [ ] Loading state disables send button and shows stop control
- [ ] Error state appends a visible error message (not silent)
- [ ] History window is capped (check Network tab — no unbounded payload)
- [ ] System prompt is logged or inspectable in dev mode (critical for debugging persona issues)
- [ ] Timeout is set and tested (simulate slow response, confirm timeout fires)
- [ ] Fallback provider is configured and tested (disable primary, confirm fallback fires)
- [ ] Conversation history saves to DB and reloads correctly
- [ ] Admin test chat uses `previewSettings` and does NOT persist to live conversation log
- [ ] Cost logging row is written per LLM call
- [ ] Component unmounts cleanly (navigate away mid-stream, no dangling state)

---

## Project Instantiation

When adapting this pattern to a specific project:

1. **Name the agent** — give it a name and persona appropriate to the domain. The name appears in the header, system prompt, and admin config.
2. **Define the static context block** — write 3–5 sentences describing what the app does and what the agent knows. This is the single most important thing for answer quality.
3. **Choose context sources** — which sources exist in this project? Vector DB? Knowledge base? App entity data? Enable only what's available.
4. **Pick starting model** — start with a capable default (e.g., `claude-sonnet-4-6`) and expose model selection in admin config for later tuning.
5. **Scope the history panel** — in the first version, per-user conversation list scoped to their own data is sufficient. Admin view of all conversations is a follow-up.

---

## Related skills

- `ce-brainstorm` — use when scoping the initial feature design
- `norfolk-code-review` — use after implementation to catch prompt-injection risks, missing auth guards on the chat endpoint, and unbounded history payloads
