---
title: "feat: Agent-Native Parity Improvements — Silent Actions, CRUD, Macro Context, LLM Slots, Parameter Kind"
type: feat
status: active
date: 2026-05-09
---

# feat: Agent-Native Parity Improvements

## Summary

Eight targeted improvements advancing H+ Analytics toward agent-native parity, derived from the 2026-05-09 audit (overall score: 63%). The units address the top-ROI gaps: wiring `dataChanged` signals onto 10 silent-action tools so Rebecca's mutations immediately refresh the UI; injecting FRED macro-economic context into Rebecca's chat assembly; adding a `/help` slash command for in-chat capability discovery; adding KB management tools; adding `compare_scenarios` and `update_global_assumptions` action-parity tools; migrating Iris/Pietro to DB-driven LLM slot resolution; extending `admin_resources` with a `parameter` kind for ops-tunable behavioral constants; and adding 4 new CRUD tools (scenario sharing, photo management, company update). Priority 4 from the audit (tools-as-primitives refactor) and Priority 10 (document extraction) are deferred to follow-up as standalone architectural changes.

---

## Problem Frame

The 2026-05-09 CE agent-native audit scored H+ at 63%. The platform's shared-workspace architecture is excellent (100%), but UI Integration sits at 60% because 10 mutating tools return no `dataChanged` signal — Rebecca changes state and the UI never knows. Action Parity (56%) and CRUD Completeness (25%) mean Rebecca cannot compare scenarios, update global assumptions, manage KB entries, share scenarios, or update companies. Context Injection (79%) misses FRED macro data that is already built but not wired. Prompt-Native Features (50%) are held back by hardcoded model constants in Iris/Pietro and no ops-tunable parameter store.

---

## Requirements

- R1. All mutating Rebecca tools emit `dataChanged`; RebeccaPanel invalidates the relevant React Query caches on receipt.
- R2. FRED macro-economic context is injected into Rebecca's system prompt assembly, gated by the existing `sources.research.enabled` toggle.
- R3. Typing `/help` (or `/tools`) in the Rebecca chat input produces a formatted capability summary without a server round-trip.
- R4. Rebecca has `create_kb_entry`, `update_kb_entry`, `delete_kb_entry` tools, admin-only guarded.
- R5. Rebecca has `compare_scenarios` (read) and `update_global_assumptions` (admin) tools.
- R6. Iris and Pietro agents resolve their LLM models via `admin_resources` `llm_slot` rows, with hardcoded constants as compile-time fallbacks.
- R7. `admin_resources` gains a `"parameter"` kind; seed rows exist for specialist conviction threshold, max-regress attempts, and slide pixel-diff threshold.
- R8. Rebecca has tools for `share_scenario`, `delete_property_photo`, `set_hero_photo`, and `update_company`.

---

## Scope Boundaries

- Photo upload (multipart binary) — not included; only metadata operations (delete, set-hero) are in scope.
- `generate_exports` tool — deferred; export pipeline has complex async state that needs its own plan.
- Tools-as-primitives refactor (split 15 workflow tools into primitives) — deferred as a standalone architectural cleanup.
- Document-extraction tools — deferred; needs its own scoped plan.
- Admin UI for `parameter` kind rows — deferred; v1 is seed-only, readable from Admin > Sources & Resources.
- `update_global_assumptions` is admin-only, matching the existing `PATCH /api/global-assumptions` `requireAdmin` guard.

### Deferred to Follow-Up Work

- Tools-as-primitives split (audit priority 4): separate PR
- Document extraction tools (audit priority 10): separate plan
- `generate_exports` tool: blocked on async export state design
- Admin UI for `parameter` rows: follow-up to U7
- `RESPONSE_MODE_CONFIG` moved to `admin_resources parameter` rows: deferred to a follow-up to U7 — requires versioning of response modes and a UI affordance for admins to edit them safely.

---

## Context & Research

### Relevant Code and Patterns

- `artifacts/api-server/src/chat/rebecca-tools.ts` — all Rebecca tool implementations and the `DataChangedEntry` type (line 29). The `slide_factory_run` entityType is already in the union but unused by any tool.
- `artifacts/hospitality-business-portal/src/components/rebecca/RebeccaPanel.tsx` — SSE handler at lines 456–466 and 589–599 processes `data.dataChanged` array and invalidates React Query keys. Currently handles `property`, `scenario`, `analyst_table`, `lb_deck_config`.
- `artifacts/api-server/src/routes/chat.ts` — context assembly pipeline; FRED/macro data is not currently injected.
- `artifacts/api-server/src/ai/company-data-injector.ts` — contains macro-economic context builder (FRED rates, country defaults).
- `artifacts/api-server/src/ai/llm-config-resolver.ts` — `resolveLlmFor(slot)` reads `admin_resources` rows of `kind="llm_slot"`, falls back gracefully.
- `artifacts/api-server/src/ai/iris/agent.ts` — hardcoded `IRIS_HAIKU_MODEL`, `IRIS_SONNET_MODEL`, `IRIS_TEMPERATURE` at lines 23–31; model selection at line 163.
- `artifacts/api-server/src/ai/pietro/agent.ts` — hardcoded `PIETRO_SONNET_MODEL`, `PIETRO_HAIKU_MODEL` at line 19.
- `lib/db/src/schema/admin-resource.ts` — `RESOURCE_KINDS` array (lines 41–51): current values are `api`, `source`, `table`, `benchmark`, `model`, `llm_slot`, `mcp`, `search_url`, `research_prompt`.
- `artifacts/api-server/src/storage/admin-resource/crud.ts` — `getAdminResourceBySlug(kind, slug)` pattern.
- `artifacts/api-server/src/routes/scenarios.ts` — `GET /api/scenarios/:id1/compare/:id2` (line 442), `storage.compareScenarios()` (line 459); `POST /api/scenarios/:id/share` uses `storage.shareScenarioWithUser()` (line 499).
- `artifacts/api-server/src/routes/global-assumptions.ts` — `PATCH /api/global-assumptions` at line 101, `requireAdmin`.
- `artifacts/api-server/src/routes/property-photos.ts` — `POST /api/properties/:id/photos/:photoId/set-hero` (line 268); DELETE endpoint.
- `artifacts/api-server/src/routes/rebecca.ts` — Rebecca KB CRUD routes.
- `artifacts/api-server/src/tests/rebecca-tools.test.ts` — existing tool test suite to extend.
- `artifacts/api-server/src/tests/rebecca-slide-factory-tools.test.ts` — slide factory tool tests.

### Institutional Learnings

- Agent-native parity map is maintained at `docs/discipline/agent-native-parity-map.md` — update for every new tool added.
- `CLAUDE.md` §7: every UI action Rebecca can perform must be reflected in the parity map before merging.
- `CLAUDE.md` §1: integration identifiers (LLM model names) must never appear as string literals in source — confirmed violation in `iris/agent.ts` and `pietro/agent.ts` that U6 corrects.
- `CLAUDE.md` §4 (ADR-007): calc/engine layer must not import storage. All new tools are in the route/service layer and pass data as parameters — no ADR-007 risk.

---

## Key Technical Decisions

- **dataChanged for async jobs**: Tools that fire-and-forget (trigger_research, trigger_iris_*) should return `dataChanged` with the *job record* entityType and its newly created ID so the UI can optimistically invalidate the relevant list query. Tools that do in-memory operations (write_retrieval_gap, clear_iris_gaps) use `entityId: 0` sentinel since there is no DB row.
- **New entityTypes**: `"research_job"`, `"iris_run"`, `"iris_gap"`, `"data_source"` added to `DataChangedEntry` union. `"slide_factory_run"` is already declared (line 30) but unused — U1 activates it.
- **/help as client-side intercept**: The capability summary is static and versioned alongside the tool definitions. Parsing in `RebeccaPanel.tsx` before dispatch avoids a server round-trip and LLM token cost.
- **FRED context gating**: Injected only when `rebeccaSettings.sources.research.enabled` is true, matching the existing pattern for other research context blocks. The `company-data-injector.ts` builder is called lazily (no upfront network call unless flag is set).
- **parameter kind — no schema enum migration**: `RESOURCE_KINDS` is a TypeScript `as const` array; the DB column is `text("kind")` (confirmed in `lib/db/src/schema/admin-resource.ts` line 157 — `pgTable`, not `pgEnum`). Adding `"parameter"` requires only a TypeScript constant edit plus seed rows. No migration needed.
- **Iris/Pietro — no fallback constant**: CLAUDE.md §1 prohibits LLM model strings as TypeScript constants ("wrapping a hardcoded string in a const is the same violation with a disguise"). U6 therefore has no fallback: `resolveLlmFor()` throws if the slot row is missing, and the agent surfaces a clear error. The U6 seed rows are a deploy prerequisite — they ship in the same PR so there is no window where the code lands without the rows.
- **Admin gate for new tools**: All admin-gated tools in U4, U5, and U8 use the existing `requireAdminCtx(ctx)` helper at line 1300 of `rebecca-tools.ts`, which calls `isAdminRole(user.role)` from `@shared/constants`. This correctly covers the live `checker`/`investor` roles that exist in the DB but not in `VALID_USER_ROLES`. Do not use raw `ctx.user.role === "admin"` comparison.
- **compare_scenarios is read-only**: No `dataChanged` signal needed.

---

## Open Questions

### Resolved During Planning

- *Where is FRED macro context built?* In `company-data-injector.ts` — confirmed. The builder already exists and the function signature needs investigation at implementation time to confirm how to call it from `chat.ts`.
- *Is `parameter` a pgEnum or text?* Text column — no migration needed beyond seed rows and the TypeScript constant array update.
- *Is `DataChangedEntry.entityType` a discriminated union or open string?* Union literal — needs the new string literals added for type safety.

### Deferred to Implementation

- Exact function signature of the FRED/macro context builder in `company-data-injector.ts` — read at implementation time.
- Whether `share_scenario` needs an email notification side-effect (existing route sends one) — implement to match route behavior.
- Whether `delete_property_photo` needs R2 cleanup — confirm storage.deletePhoto behavior at implementation time.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

**dataChanged signal flow (U1):**
```text
rebecca-tools.ts tool function
  → return { result: ..., dataChanged: { entityType: "research_job", entityId: runId } }

chat.ts SSE stream
  → emits data.dataChanged array

RebeccaPanel.tsx SSE handler
  → for each entry: switch(entityType) → queryClient.invalidateQueries(...)
```

**LLM slot resolution migration (U6):**
```typescript
Before:  const model = trigger === "scheduled-health" ? IRIS_HAIKU_MODEL : IRIS_SONNET_MODEL;
After:   const model = await resolveLlmFor(trigger === "scheduled-health"
           ? "iris_health_check" : "iris_reindex").catch(() => fallback);
```

**Parameter resolver (U7):**
```typescript
getParameterValue(slug: string, fallback: number): Promise<number>
  → storage.getAdminResourceBySlug("parameter", slug)
  → return row.config.value ?? fallback
```

---

## Implementation Units

- U1. **Wire dataChanged signals onto all silent-action tools**

**Goal:** Every mutating Rebecca tool returns a `dataChanged` entry; RebeccaPanel correctly invalidates the React Query caches for each new entityType.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Modify: `artifacts/hospitality-business-portal/src/components/rebecca/RebeccaPanel.tsx`
- Modify: `artifacts/api-server/src/tests/rebecca-slide-factory-tools.test.ts`

**Approach:**
- Expand `DataChangedEntry.entityType` union at line 30 to add `"research_job" | "iris_run" | "iris_gap" | "data_source"`. The `"slide_factory_run"` variant is already present.
- Add `dataChanged` to each silent tool's return:
  - `trigger_research` → `{ entityType: "research_job", entityId: 0 }` (no DB record ID available synchronously)
  - `write_retrieval_gap` → `{ entityType: "iris_gap", entityId: 0 }`
  - `trigger_iris_health_check` → `{ entityType: "iris_run", entityId: runId }` (uses the DB record created inside the tool)
  - `trigger_iris_reindex` → `{ entityType: "iris_run", entityId: runId }`
  - `clear_iris_gaps` → `{ entityType: "iris_gap", entityId: 0 }`
  - `create_slide_factory_run` → `{ entityType: "slide_factory_run", entityId: runId }`
  - `trigger_slide_factory_build` → `{ entityType: "slide_factory_run", entityId: runId }`
  - `approve_all_slide_factory_slots` → `{ entityType: "slide_factory_run", entityId: runId }`
  - `probe_data_source` → `{ entityType: "data_source", entityId: 0 }`
  - `regenerate_data_source` → `{ entityType: "data_source", entityId: 0 }`
- In `RebeccaPanel.tsx`, extend both SSE handler branches (lines 456 and 589) with new `else if` cases:
  - `"research_job"` → invalidate `["properties"]` (research refreshes property field guidance)
  - `"iris_run"` → invalidate `["iris", "status"]` and `["/api/admin/iris/status"]`
  - `"iris_gap"` → invalidate `["iris", "gaps"]` (if gap list is queried) or no-op if not queried
  - `"slide_factory_run"` → invalidate `["/api/lb-slides/factory/runs"]`
  - `"data_source"` → invalidate `["/api/admin/data-sources"]`

**Patterns to follow:**
- Existing `dataChanged` pattern: `toolUpdateProperty` returns `{ result: {...}, dataChanged: { entityType: "property", entityId: id } }` — replicate for each new tool.
- `RebeccaPanel.tsx` SSE handler lines 456–466 for the invalidation switch pattern.

**Test scenarios:**
- Happy path: `toolTriggerResearch` called → return value includes `dataChanged.entityType === "research_job"`
- Happy path: `toolTriggerIrisHealthCheck` called → `dataChanged.entityType === "iris_run"` and `entityId` matches the created DB run ID
- Happy path: `toolCreateSlideFactoryRun` → `dataChanged.entityType === "slide_factory_run"` and `entityId` is the new run ID
- Happy path: `toolProbeDataSource` → `dataChanged.entityType === "data_source"`
- Edge case: tools that have no DB record (write_retrieval_gap, clear_iris_gaps, probe_data_source) → `entityId === 0`
- Integration: SSE stream carries `dataChanged` array with new entityTypes → RebeccaPanel handles them without throwing

**Verification:**
- All 10 previously-silent tools return `dataChanged`
- TypeScript union covers all new entityType strings — `tsc --noEmit` clean
- `pnpm run typecheck` passes
- Existing `rebecca-tools.test.ts` still passes

---

- U2. **Wire FRED macro-economic context into Rebecca's chat assembly**

**Goal:** FRED-sourced macro context (interest rates, CPI trend, country defaults) appears in Rebecca's system prompt when `sources.research.enabled` is true, giving Rebecca macro grounding for financial analysis.

**Requirements:** R2

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/routes/chat.ts`
- Read (no modification needed if builder already returns the right shape): `artifacts/api-server/src/ai/company-data-injector.ts`

**Approach:**
- Read `company-data-injector.ts` to identify the exported macro context builder function and its signature.
- In `chat.ts` context assembly (after the recent-activity block, around the existing `assembledPrompt +=` chain), add:
  ```typescript
  if (rebeccaSettings.sources.research.enabled) {
    const macroBlock = await buildMacroContextBlock(...relevant args...);
    assembledPrompt += macroBlock;
  }
  ```
- The macro block should be a `## MACRO ECONOMIC CONTEXT` markdown section so Rebecca understands it structurally.
- Ensure the call is non-blocking: wrap in try/catch so a FRED API failure does not break the whole chat request.

**Patterns to follow:**
- Other conditional context blocks in `chat.ts` (knowledge base block, research block) gated on `rebeccaSettings.sources.*`.
- The `assembledPrompt +=` accumulation pattern.

**Test scenarios:**
- Happy path: `sources.research.enabled = true` → macro block present in assembled prompt
- Happy path: `sources.research.enabled = false` → macro block absent
- Error path: FRED API throws → chat request continues without macro block (graceful degradation, no 500)
- Edge case: macro block content is empty string → block is not appended (avoids `## MACRO ECONOMIC CONTEXT\n\n` with no content)

**Verification:**
- Unit test verifying conditional injection based on settings flag
- No change to chat API response shape — only prompt content changes
- `pnpm run typecheck` passes

---

- U3. **Rebecca /help capability discovery slash command**

**Goal:** Typing `/help` or `/tools` in the Rebecca chat input displays a formatted list of Rebecca's capabilities without sending the message to the server.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/components/rebecca/RebeccaPanel.tsx`

**Approach:**
- In the message submission handler (before the API call), intercept messages matching `/help` or `/tools` (case-insensitive, trimmed).
- Instead of posting to `/api/chat`, inject a synthetic assistant message into the local conversation state with a preformatted markdown capability summary.
- The capability summary covers Rebecca's tool domains: reading properties/scenarios, creating/updating/deleting them, triggering research, managing the knowledge base, slide factory operations, and admin operations.
- Keep the summary concise (under 400 words) to avoid overwhelming the user.
- Clear the input after the intercept.

**Patterns to follow:**
- Existing `addInsight()` / synthetic message pattern in RebeccaPanel if one exists; otherwise inject directly into the conversation state array.

**Test scenarios:**
- Happy path: user sends `/help` → synthetic capability message appears in chat, no network call made
- Happy path: user sends `/tools` (case variation: `/TOOLS`) → same result
- Happy path: user sends `/help followed by more text` → NOT intercepted (only exact `/help` or `/tools` match)
- Edge case: input with leading/trailing spaces around `/help` → intercepted (after trimming)

**Verification:**
- `/help` in chat produces a capability summary with no SSE connection opened
- No regression in normal message sending
- TypeScript check passes (no new type errors)

---

- U4. **Rebecca KB management tools**

**Goal:** Admins can ask Rebecca to create, update, and delete knowledge-base entries — closing the gap where Rebecca relies on KB content she cannot herself curate.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Modify: `artifacts/api-server/src/tests/rebecca-tools.test.ts`

**Approach:**
- Read `artifacts/api-server/src/routes/rebecca.ts` to identify the storage methods called by the KB CRUD routes.
- Add three tool definitions to the tool schema array in `rebecca-tools.ts`:
  - `create_kb_entry(title, content, category?)` → calls the same storage method as `POST /api/rebecca/kb`; admin-only
  - `update_kb_entry(id, title?, content?, category?)` → same as `PATCH /api/rebecca/kb/:id`; admin-only, ownership check
  - `delete_kb_entry(id)` → same as `DELETE /api/rebecca/kb/:id`; admin-only, ownership check
- Admin gate: call `requireAdminCtx(ctx)` (existing helper at line 1300) at the top of each tool function body; return early with its error result if non-null.
- `create_kb_entry` and `update_kb_entry` should return `dataChanged: { entityType: "kb_entry", entityId: entryId }` — add `"kb_entry"` to the `DataChangedEntry` union.
- `delete_kb_entry` should return `dataChanged: { entityType: "kb_entry", entityId: id }`.
- Add corresponding `else if (entry.entityType === "kb_entry")` case in `RebeccaPanel.tsx` invalidating `["/api/rebecca/kb"]`.

**Patterns to follow:**
- `toolDeleteScenario` admin/ownership check pattern.
- Existing KB route storage calls in `artifacts/api-server/src/routes/rebecca.ts`.

**Test scenarios:**
- Happy path (admin): `create_kb_entry` with valid title/content → KB entry created, `dataChanged` returned
- Happy path (admin): `update_kb_entry` with valid id and new content → entry updated, `dataChanged` returned
- Happy path (admin): `delete_kb_entry` → entry deleted, `dataChanged` returned
- Error path (non-admin): any KB tool → `{ error: "Admin access required" }`
- Error path: `update_kb_entry` with non-existent ID → storage returns null → `{ error: "Entry not found" }`
- Edge case: `create_kb_entry` with empty content → Zod validation rejects, `{ error: ... }` returned

**Verification:**
- KB tools present in tool schema; tool names appear in the tool list visible to Rebecca
- Admin guard blocks non-admin users
- `pnpm run typecheck` passes

---

- U5. **compare_scenarios and update_global_assumptions tools**

**Goal:** Rebecca can compare two scenarios (read-only analysis) and update global assumptions on behalf of an admin — closing two high-impact action-parity gaps.

**Requirements:** R5

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Modify: `artifacts/api-server/src/tests/rebecca-tools.test.ts`

**Approach:**
- `compare_scenarios(scenarioId1, scenarioId2)`:
  - Calls `storage.compareScenarios(s1, s2)` (same as the route at line 459 of `scenarios.ts`).
  - Verify both scenarios belong to the authenticated user (ownership check).
  - Returns comparison result as `{ result: comparisonData }` — no `dataChanged` (read-only).
- `update_global_assumptions(patch)`:
  - Admin-only: call `requireAdminCtx(ctx)` and return early on non-null result.
  - Accepts a partial object of assumption fields to update.
  - Calls the same storage path as `PATCH /api/global-assumptions`.
  - Returns `dataChanged: { entityType: "global_assumptions", entityId: 0 }` — add `"global_assumptions"` to `DataChangedEntry` union.
  - In `RebeccaPanel.tsx`: `"global_assumptions"` → invalidate `["/api/global-assumptions"]`.

**Patterns to follow:**
- `toolGetScenario` ownership check pattern.
- `toolUpdateScenario` partial-update approach with Zod validation of patch fields.

**Test scenarios:**
- Happy path: `compare_scenarios` with two valid owned scenario IDs → returns comparison object
- Error path: `compare_scenarios` with scenario owned by another user → `{ error: "Not found" }`
- Error path: `compare_scenarios` with non-existent scenario ID → `{ error: "Scenario not found" }`
- Happy path (admin): `update_global_assumptions` with valid partial patch → assumptions updated, `dataChanged` returned
- Error path (non-admin): `update_global_assumptions` → `{ error: "Admin access required" }`
- Edge case: `update_global_assumptions` with empty patch object → returns `{ result: "No changes applied" }` or applies no-op

**Verification:**
- Both tools present in schema; covered by `rebecca-tools.test.ts`
- `compare_scenarios` is read-only (no DB write for non-admin users)
- `pnpm run typecheck` passes

---

- U6. **Iris and Pietro LLM slot resolution via admin_resources**

**Goal:** Replace hardcoded model string literals in `iris/agent.ts` and `pietro/agent.ts` with `resolveLlmFor()` slot lookups, making model selection ops-configurable without a code deploy.

**Requirements:** R6

**Dependencies:** Seed rows (`llm_slot` rows for `iris_health_check`, `iris_reindex`, `pietro_health_check`, `pietro_orchestration`) must be present before the agent code change is deployed. Both land in the same PR.

**Files:**
- Modify: `artifacts/api-server/src/ai/iris/agent.ts`
- Modify: `artifacts/api-server/src/ai/pietro/agent.ts`
- Modify (seed): `artifacts/api-server/src/seeds/admin-resources.ts` (or equivalent seed file for admin_resources)

**Approach:**
- In `iris/agent.ts`:
  - Remove hardcoded `IRIS_HAIKU_MODEL` and `IRIS_SONNET_MODEL` constants entirely (CLAUDE.md §1 prohibits model string literals and named constants that wrap them).
  - Replace model selection with `await resolveLlmFor("iris_health_check")` / `await resolveLlmFor("iris_reindex")`. If the slot row is missing, `resolveLlmFor` throws — agent surfaces an error rather than silently using a stale constant.
  - Temperature and max-tool-depth remain as numeric constants for now (U7 covers moving them to `parameter` rows).
- In `pietro/agent.ts`: same pattern — slot names `"pietro_health_check"` and `"pietro_orchestration"`. Remove `PIETRO_HAIKU_MODEL` and `PIETRO_SONNET_MODEL`.
- **Seed rows are a deploy prerequisite**: add `llm_slot` + `model` rows to the seed file for `iris_health_check`, `iris_reindex`, `pietro_health_check`, `pietro_orchestration`, pointing to existing Haiku and Sonnet `admin_resources` model rows. These seed rows ship in the same PR as the code change. List them explicitly in the U6 Dependencies field.
- After deploy, verify slot resolution works before removing the fallback window.

**Patterns to follow:**
- `artifacts/api-server/src/ai/llm-config-resolver.ts` — `resolveLlmFor(slot)` usage pattern already used by specialists.
- Existing `llm_slot` seed rows in the admin-resources seed file.

**Test scenarios:**
- Happy path: slot row exists → `resolveLlmFor("iris_health_check")` returns correct model ID string
- Error path: slot row missing → `resolveLlmFor` throws → Iris agent surfaces a clear error message, not a silent model substitution
- Integration: Iris health-check agent runs end-to-end with slot-resolved model
- Test expectation: none for seed file — seed correctness verified by migration-guards check

**Verification:**
- `grep -rn "claude-haiku\|claude-sonnet" artifacts/api-server/src/ai/iris/ artifacts/api-server/src/ai/pietro/` returns zero matches (all model strings removed)
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- `pnpm run typecheck` passes
- Seed rows present: `pnpm --filter @workspace/scripts run check:migration-guards` — PASS

---

- U7. **admin_resources `parameter` kind and behavioral tunable seed rows**

**Goal:** Ops-tunable behavioral constants (specialist conviction threshold, max-regress attempts, slide pixel-diff threshold) move from hardcoded TypeScript to `admin_resources` rows, configurable without a code deploy.

**Requirements:** R7

**Dependencies:** None

**Files:**
- Modify: `lib/db/src/schema/admin-resource.ts` (add `"parameter"` to `RESOURCE_KINDS`)
- Create: `artifacts/api-server/src/ai/parameter-resolver.ts`
- Modify: seed file for `admin_resources`
- Modify (consumers): `artifacts/api-server/src/ai/specialists/mgmt-co-*-runner.ts` files (replace `CONVERGENCE_MIN_QUANT_CONVICTION` and `MAX_SYNTHESIS_REGRESSES` literals with `getParameterValue()` calls)
- Modify (consumers): `artifacts/api-server/src/slides/deck-render-constants.ts` (replace `DINO_PIXEL_DIFF_THRESHOLD_PCT` with `getParameterValue()`)

**Approach:**
- Add `"parameter"` to the `RESOURCE_KINDS` `as const` array in `lib/db/src/schema/admin-resource.ts`. Because the column is `text` (not a pgEnum), no migration is needed beyond updating the TypeScript type.
- Create `parameter-resolver.ts`:
  ```typescript
  getParameterValue(slug: string, fallback: number): Promise<number>
    → storage.getAdminResourceBySlug("parameter", slug)
    → return (row?.config as { value: number })?.value ?? fallback
  ```
  Non-throwing — always returns fallback on missing row or malformed config.
- Seed rows for initial parameters (values match the current hardcoded constants to avoid behavior change on first deploy):
  - `slug: "specialist_convergence_min_conviction"`, `config: { value: 55, description: "Minimum average quantitative conviction score (0-100) to pass specialist convergence check" }`
  - `slug: "specialist_max_regress_attempts"`, `config: { value: 2, description: "Maximum synthesis regress iterations before failing a specialist run" }`
  - `slug: "slide_pixel_diff_threshold_pct"`, `config: { value: 5, description: "Maximum pixel-diff percentage before Dino flags a slide as mismatched" }`
- Replace constant references in specialist runners and `deck-render-constants.ts` with `await getParameterValue(slug, fallback)`. Since specialist runners are already async, this is a drop-in await.

**Patterns to follow:**
- `resolveLlmFor()` in `llm-config-resolver.ts` as the model for a resolver that reads from `admin_resources` with a typed fallback.
- Existing seed file structure for `admin_resources` rows.

**Test scenarios:**
- Happy path: `getParameterValue("specialist_convergence_min_conviction", 55)` with seed row present → returns 55
- Happy path: admin changes the row's `config.value` to 60 → subsequent calls return 60 without redeploy
- Fallback: no row with that slug → returns the numeric fallback argument
- Error path: row exists but `config.value` is not a number → returns fallback (no throw)
- Integration: specialist runner uses `getParameterValue` result correctly in convergence check

**Verification:**
- `"parameter"` appears in `RESOURCE_KINDS` and `ResourceKind` type
- `pnpm run typecheck` passes
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` passes (seed file uses `SEED_*` or named constants per §3 rule)
- `pnpm --filter @workspace/scripts run check:migration-guards` — PASS

---

- U8. **CRUD expansion — share_scenario, delete_property_photo, set_hero_photo, update_company**

**Goal:** Four new Rebecca tools close the most impactful CRUD gaps: scenario sharing, photo management (no binary upload), and company metadata update.

**Requirements:** R8

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Modify: `artifacts/api-server/src/tests/rebecca-tools.test.ts`

**Approach:**
- `share_scenario(scenarioId, recipientEmail)`:
  - Calls `storage.shareScenarioWithUser()` matching route behavior.
  - Owner-check: scenario must belong to `ctx.user`.
  - Optionally sends notification (match route behavior — confirm during implementation).
  - Returns `dataChanged: { entityType: "scenario", entityId: scenarioId }`.
- `delete_property_photo(propertyId, photoId)`:
  - Calls the same storage method as `DELETE /api/properties/:id/photos/:photoId`.
  - Ownership check on property.
  - Returns `dataChanged: { entityType: "property", entityId: propertyId }`.
- `set_hero_photo(propertyId, photoId)`:
  - Calls the same storage method as `POST /api/properties/:id/photos/:photoId/set-hero`.
  - Ownership check on property.
  - Returns `dataChanged: { entityType: "property", entityId: propertyId }`.
- `update_company(companyId, patch)`:
  - Admin-only.
  - Accepts partial company fields (name, description, settings).
  - Returns `dataChanged: { entityType: "company", entityId: companyId }` — add `"company"` to `DataChangedEntry` union.
  - In `RebeccaPanel.tsx`: `"company"` → invalidate `["/api/companies"]` and `["/api/companies", companyId]`.

**Patterns to follow:**
- `toolDeleteScenario` for ownership-check + delete pattern.
- `toolPatchProperty` for ownership-check + partial-update pattern.

**Test scenarios:**
- Happy path: `share_scenario` with valid owned scenario and recipient email → success, `dataChanged` scenario
- Error path: `share_scenario` with scenario owned by another user → `{ error: "Not found" }`
- Error path: `share_scenario` with self email → `{ error: "You cannot share scenarios with yourself" }` (matching route behavior)
- Happy path: `delete_property_photo` with valid owned property and photo → photo deleted, `dataChanged` property
- Error path: `delete_property_photo` with photo not belonging to that property → `{ error: "Not found" }`
- Happy path: `set_hero_photo` → hero updated, `dataChanged` property
- Happy path (admin): `update_company` with valid patch → company updated, `dataChanged` company
- Error path (non-admin): `update_company` → `{ error: "Admin access required" }`

**Verification:**
- 4 new tools present in the tool schema array
- Agent-native parity map at `docs/discipline/agent-native-parity-map.md` updated with all 4 entries marked ✅
- `pnpm run typecheck` passes

---

## System-Wide Impact

- **Interaction graph:** RebeccaPanel's SSE handler must handle all new `entityType` values — any unhandled variant is a silent no-op (not a crash), so old clients are safe, but cache staleness will persist until deployed.
- **Error propagation:** New `getParameterValue` calls are non-throwing; specialist runners continue even if the DB is unavailable (fallback to compile-time constant).
- **State lifecycle risks:** U7 changes values read at request time; if a parameter row is updated mid-flight, a running specialist invocation uses the value it resolved at start. This is acceptable — no partial-write risk.
- **API surface parity:** U4, U5, U8 add new tool definitions but no new HTTP routes. All new tools route through the existing `/api/chat` endpoint.
- **Integration coverage:** U6 requires seed rows deployed before agent model selection picks them up; without seed rows, agents fall back gracefully to hardcoded constants.
- **Unchanged invariants:** The `/api/chat` SSE response schema (`dataChanged` is an optional array) is not changed — new entityTypes are additive to the union, not breaking.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| U7: specialist runners become slower (extra DB read per convergence check) | `getParameterValue` hits a single indexed row; cache at warm-up or use a request-scoped cache if latency is measurable |
| U6: LLM slot rows missing at deployment → Iris/Pietro fall back to hardcoded models | Fallback is explicit and returns the same model as today; add seed rows to the same PR |
| U2: FRED API unavailable → macro block skipped gracefully | Non-throwing wrapper + conditional injection ensure chat works regardless |
| U3: /help command intercept collides with a user legitimately asking `/help` as a question | Only intercept exact `/help` or `/tools` (trimmed) — natural-language questions won't match |
| U8: share_scenario notification side-effect | Read route implementation during U8; if email is conditional on a flag, mirror that flag |
| U1: `entityId: 0` sentinel for no-record tools could confuse invalidation handlers | RebeccaPanel handlers only need to invalidate list queries for these types — `entityId` is ignored in those branches |

---

## Documentation / Operational Notes

- Update `docs/discipline/agent-native-parity-map.md` for every tool added in U4, U5, and U8.
- After U7 seed rows are deployed, verify `getParameterValue("specialist_convergence_min_conviction", 55)` returns `55` via an admin API call or Node script against production Neon.
- The `"parameter"` kind will appear in Admin > Sources & Resources alongside other resource kinds once the seed rows are present. No UI changes needed for v1.

---

## Sources & References

- Agent-native audit findings: memorised at `/home/runner/.claude/projects/-home-runner-workspace/memory/project_agent_native_audit.md`
- CLAUDE.md §1 (no integration identifiers as string literals), §7 (agent-native parity)
- `docs/discipline/agent-native-parity-map.md` — parity map to update
- Related plans: `docs/plans/2026-05-05-009-feat-rebecca-conversational-agent-parity-plan.md` (earlier parity work)
