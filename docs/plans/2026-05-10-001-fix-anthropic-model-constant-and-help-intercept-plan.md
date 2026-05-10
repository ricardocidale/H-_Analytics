---
title: "fix: Remove DEFAULT_ANTHROPIC_MODEL §1 violation + add /help in-chat intercept"
type: fix
status: active
date: 2026-05-10
---

# fix: Remove DEFAULT_ANTHROPIC_MODEL §1 violation + /help in-chat intercept

## Summary

Two targeted fixes: (1) delete the unused `DEFAULT_ANTHROPIC_MODEL` string constant from both `constants-enums.ts` files — it violates CLAUDE.md §1 (LLM model names must not appear as TypeScript constants) and has zero callers; (2) add a `/help` slash-command intercept to `RebeccaPanel.tsx` that injects a synthetic capability-summary message without a server round-trip, closing the Wave 3 capability-discovery gap.

**Prerequisite:** Merge PR #66 (staff salary drift fix) before executing U1, since both touch protected constants files.

---

## Requirements

- R1. `DEFAULT_ANTHROPIC_MODEL` no longer exists as a TypeScript constant in `lib/shared/src/constants-enums.ts` or `lib/db/src/constants-enums.ts` (CLAUDE.md §1 — integration identifiers must not appear as named string constants).
- R2. Typing `/help` or `/tools` (trimmed, case-insensitive) in the Rebecca chat input produces a formatted capability summary as a synthetic assistant message, with no SSE connection opened and no server call made.
- R3. Typing any other message continues to work exactly as before.
- R4. `pnpm run typecheck` passes; `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` passes.

---

## Scope Boundaries

- No migration of `DEFAULT_ANTHROPIC_MODEL` to `admin_resources` (zero callers — nothing to wire up).
- Operating-structure private constants (`DEFAULT_CAPEX_FACTOR`, `DEFAULT_OPERATOR_TAKE_CAP_OF_GOP`) — scoped out; they are non-exported module-private constants not subject to §1.
- Wave 3 CRUD tools (`share_scenario`, `delete_property_photo`, `set_hero_photo`, `update_company`) — already shipped in plan 009 / PR #64.
- The capability summary text is static and maintained alongside the tool definitions — no server fetch.

---

## Context & Research

### Relevant Code and Patterns

- `lib/shared/src/constants-enums.ts` — line 28: `export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5"` (protected surface, §9 — CC-only edit)
- `lib/db/src/constants-enums.ts` — line 28: same declaration (protected surface)
- Both files are confirmed to have zero import consumers in the codebase
- `artifacts/hospitality-business-portal/src/components/rebecca/RebeccaPanel.tsx` — `sendMessage` callback at line ~508; trimmed check at line ~510 is the insertion point
- Pattern to follow for `/help`: inject into `messages` state via `setMessages(prev => [...prev, syntheticUserMsg, syntheticAssistantMsg])`, set `setInput("")`, return early before `setLoading(true)`

### Institutional Learnings

- CLAUDE.md §1: LLM model name strings as TypeScript constants are the same violation as raw string literals. No exceptions.
- CLAUDE.md §9: `lib/shared/src/constants*.ts` and `lib/db/src/constants*.ts` are protected — only shell CC may edit them.
- Agent-native capability discovery audit (2026-05-09): `/help` scored "Weak" — content exists in the system prompt but no in-chat intercept surfaced it to users mid-conversation.

---

## Key Technical Decisions

- **Delete, don't migrate**: `DEFAULT_ANTHROPIC_MODEL` has no callers. There is no code to update after removal. The constant was likely a planning artifact from before `resolveLlmFor()` was established.
- **Client-side intercept, not server route**: The `/help` response is static capability text. A server round-trip wastes tokens and latency. Intercept in `sendMessage` before the fetch, mirror the streaming-queue guard pattern.
- **Exact match only**: Intercept `/help` and `/tools` as exact trimmed lower-case matches. Natural-language questions containing "help" are not intercepted.
- **Synthetic message shape**: Inject both a user message and an assistant response into `messages` state, matching the existing `ChatMessage` type, so the conversation history display is consistent with real exchanges.

---

## Open Questions

### Resolved During Planning

- *Are there any callers of DEFAULT_ANTHROPIC_MODEL?* No — confirmed by grep across all packages.
- *Should /help persist to conversation history on the server?* No — it's a client-side capability hint, not a real exchange. Not persisted.
- *Should /help respect the streaming-queue guard?* Yes — if a stream is active when the user types `/help`, queue behavior should still apply (or simplify: if loading/streaming, no-op like other messages). Deferred to implementation to mirror the existing `isStreaming` branch.

### Deferred to Implementation

- Exact capability summary text — the implementer should review current tool names from the tool schema to ensure the summary stays accurate. Keep under 400 words.
- Whether to show the synthetic user message in the UI or just the assistant response — follow the existing pattern for synthetic messages if one exists; otherwise inject both.

---

## Implementation Units

- U1. **Remove DEFAULT_ANTHROPIC_MODEL from constants-enums files**

**Goal:** Eliminate the §1 violation — an LLM model string wrapped in a named TypeScript constant.

**Requirements:** R1, R4

**Dependencies:** PR #66 merged (both files are in the same protected constants layer)

**Files:**
- Modify: `lib/shared/src/constants-enums.ts`
- Modify: `lib/db/src/constants-enums.ts`

**Approach:**
- Delete the `export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5"` line from each file.
- Verify no import of this name exists anywhere (`grep -rn "DEFAULT_ANTHROPIC_MODEL"` must return zero hits after removal).
- Run `pnpm run typecheck` and `check-magic-numbers.ts` to confirm clean.

**Patterns to follow:**
- The staff salary fix (PR #66) — same protected-surface edit pattern.

**Test scenarios:**
- Test expectation: none — pure constant deletion with zero callers. Typecheck passing is the signal.

**Verification:**
- `grep -rn "DEFAULT_ANTHROPIC_MODEL"` returns no results.
- `pnpm run typecheck` clean.
- `check-magic-numbers.ts` passes (should show improvement since a string literal constant is removed).

---

- U2. **Add /help slash-command intercept in RebeccaPanel**

**Goal:** Typing `/help` or `/tools` in Rebecca's chat input produces an instant capability summary without a server call, closing the Wave 3 capability-discovery gap.

**Requirements:** R2, R3

**Dependencies:** None (independent frontend change)

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/components/rebecca/RebeccaPanel.tsx`

**Approach:**
- In `sendMessage` (line ~508), after `const trimmed = (text ?? input).trim()` and the early-return guards, add a check: `if (trimmed.toLowerCase() === "/help" || trimmed.toLowerCase() === "/tools")`.
- On match: inject a synthetic user message and a synthetic assistant response into `messages` state via `setMessages`, clear `input` via `setInput("")`, and return before `setLoading(true)`. Do not open an SSE connection.
- The capability summary covers Rebecca's main tool domains grouped concisely: reading portfolio data, creating/updating/deleting (scenarios, properties), triggering research, managing the knowledge base, slide factory operations, and admin tools. Under 400 words.
- The intercept fires only on exact trimmed lower-case match — not on natural-language messages containing the word "help".

**Patterns to follow:**
- The existing `isStreaming` branch that queues a message and returns early — same early-return shape.
- `ChatMessage` type from the existing `messages` state for the synthetic message shape.
- `nextMsgId("user")` and `nextMsgId("assistant")` for consistent ID generation.

**Test scenarios:**
- Happy path: user types `/help` → synthetic capability summary appears in chat, no network request fired, input cleared.
- Happy path: user types `/tools` → same result.
- Happy path: user types `/HELP` (uppercase) → same result (case-insensitive match).
- Edge case: user types `/help followed by more text` → NOT intercepted (exact match only).
- Edge case: user types `  /help  ` (surrounding spaces) → intercepted after trim.
- Error path: user types "can you help me?" → NOT intercepted (not an exact match).
- Integration: normal message sent after a `/help` exchange proceeds normally — no state corruption.

**Verification:**
- `/help` in chat shows a capability summary with no SSE connection opened (check browser network tab).
- Normal message sending works after a `/help` exchange.
- `pnpm run typecheck` clean (no type errors from the new branch).

---

## System-Wide Impact

- **Interaction graph:** U1 touches protected constants files; the `export *` barrel in each parent `constants.ts` will simply no longer re-export the deleted name. No downstream effects since there are no callers.
- **Error propagation:** U2 intercept is a pure early-return with no async calls — no failure modes.
- **Unchanged invariants:** All existing Rebecca tool behavior, SSE flow, and server-side chat handling are unchanged by both units.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| A caller of DEFAULT_ANTHROPIC_MODEL exists that grep missed (e.g., dynamic string concatenation) | Run typecheck after deletion; a missing export will surface as a TS error if any consumer exists |
| /help intercept creates a synthetic message that breaks conversation history replay | Use the same ChatMessage shape as real messages; do not persist to server; test that the next real send works |

---

## Sources & References

- CLAUDE.md §1 (integration identifier rule), §9 (financial engine authoring authority — protected surfaces)
- Vito compliance audit run ID 2 (2026-05-10) — surfaced DEFAULT_ANTHROPIC_MODEL warning
- `docs/plans/2026-05-09-005-feat-agent-native-parity-improvements-plan.md` — Wave 3 U3 (/help command, conditional)
- `artifacts/hospitality-business-portal/src/components/rebecca/RebeccaPanel.tsx` — sendMessage at line ~508
