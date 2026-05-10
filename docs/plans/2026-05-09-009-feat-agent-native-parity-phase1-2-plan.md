---
title: "feat: Agent-Native Parity Phase 1+2 — Read tools, CRUD gaps, photo/market tools, dataChanged fix"
type: feat
status: completed
date: 2026-05-09
---

# feat: Agent-Native Parity Phase 1+2

## Summary

Adds 10 new Rebecca tools and fixes one silent mutator, closing the highest-leverage action-parity and CRUD gaps surfaced by the 2026-05-09 agent-native audit (overall score: 69%). Tools follow all existing patterns: `requireAdminCtx` for admin-only operations, ownership checks for user-scoped entities, `dataChanged` emission for every mutating tool, and parity-map update in the same commit. Also extracts the repeated async-dispatch pattern from three trigger tools into a shared internal helper.

---

## Problem Frame

The 2026-05-09 audit found CRUD Completeness at 27% (3/11 entities) and Action Parity at 71% (24/34 routes). The highest-impact missing tools are: the only read direction for global assumptions (agent updates assumptions it cannot first read); list/get for KB entries (agent deletes content it cannot verify exists); company and scenario-share operations; property photo management; and market rate read/override. One mutating tool (`trigger_lb_deck_render`) silently fires without emitting `dataChanged`, causing the UI to miss the render trigger event.

---

## Requirements

- R1. Rebecca can read current global assumptions before proposing updates.
- R2. Rebecca can list and retrieve KB entries before deleting or referencing them.
- R3. Rebecca can share a scenario with another user (matching existing route behavior including email notification).
- R4. Rebecca can delete a property photo and set a hero photo.
- R5. Rebecca can update company metadata (admin-only).
- R6. Rebecca can read current market rates and override a specific rate (admin-only).
- R7. `trigger_lb_deck_render` emits `dataChanged` so the UI reflects the render trigger.
- R8. The repeated async-dispatch pattern across `trigger_iris_health_check`, `trigger_iris_reindex`, and `run_compliance_audit` is consolidated into a shared internal helper (no behavioral change, no new exposed tool).
- R9. Every new tool is documented in `docs/discipline/agent-native-parity-map.md` in the same PR (CLAUDE.md §7).

---

## Scope Boundaries

- No new HTTP routes — all new tools call existing storage methods or data-layer functions.
- Photo enhancement routes (accept/reject enhancement, `POST /api/property-photos/:id/enhanced`) — out of scope; separate concern.
- Photo reorder (`POST .../reorder`) — out of scope.
- Making `queue_job` an exposed Rebecca tool — out of scope; existing specialized trigger tool names are preserved.
- `update_market_rate` is limited to admin override of an existing rate key — no rate creation or deletion.
- Research questions, saved searches, service templates, admin config routes — deferred; low likelihood of user request.
- Slide factory tool refactor (Phase 3) — separate plan.

### Deferred to Follow-Up Work

- `update_company` storage method choice: confirm at implementation time whether company metadata lives in `global_assumptions` (patchable via `patchGlobalAssumptions`) or a separate `companies` table requiring a new storage method.
- `"company"` and `"market_rate"` entityType invalidation targets in `RebeccaPanel.tsx` — the correct React Query keys to invalidate for each must be confirmed from the existing query call sites at implementation time.

---

## Context & Research

### Relevant Code and Patterns

- `artifacts/api-server/src/chat/rebecca-tools.ts` — all Rebecca tools; `DataChangedEntry` union at line ~34; `requireAdminCtx` helper at line ~1300; `toolTriggerLbDeckRender` at line ~1229
- `artifacts/hospitality-business-portal/src/components/rebecca/RebeccaPanel.tsx` — SSE handler with `dataChanged` switch at lines ~467–492 and ~617–642
- `artifacts/api-server/src/routes/global-assumptions.ts` — `storage.getGlobalAssumptions(userId)` is the read path
- `artifacts/api-server/src/routes/rebecca.ts` — `storage.getRebeccaKBEntries(category?)` (admin-only list, line ~299) and `storage.getRebeccaKBEntry(id)` (authenticated read, line ~284)
- `artifacts/api-server/src/routes/scenarios.ts` — share route at line ~466: `storage.getUserByEmail`, `storage.shareScenarioWithUser`, self-share guard, privacy-preserving empty-200 for unrecognised email
- `artifacts/api-server/src/routes/property-photos.ts` — `storage.deletePropertyPhoto(photoId)`, `storage.setHeroPhoto(propertyId, photoId)`, last-photo guard (non-admin cannot delete last photo)
- `artifacts/api-server/src/routes/market-rates.ts` — admin-only PATCH; uses `getAllMarketRates()` and `upsertMarketRate()` from `artifacts/api-server/src/data/marketRates.ts`
- `artifacts/api-server/src/tests/rebecca-tools.test.ts` — existing tool test suite to extend

### Institutional Learnings

- CLAUDE.md §7: parity map must be updated in the same PR as any new tool.
- CLAUDE.md §1: no integration identifiers as string literals — all tools call named storage/data functions, not direct DB queries.
- Agent-native parity map lives at `docs/discipline/agent-native-parity-map.md`.
- `DataChangedEntry` union must be extended for any new `entityType` string used in a `dataChanged` return. New entityTypes also need a handler branch in both SSE handler blocks in `RebeccaPanel.tsx`.

---

## Key Technical Decisions

- **`list_kb_entries` is admin-only; `get_kb_entry` is auth-only**: mirrors the existing route access levels (`GET /api/rebecca/kb` requires admin, `GET /api/rebecca/kb/entry/:id` requires auth only).
- **`share_scenario` matches route behavior including email notification**: the route sends an email when a recipient is found; the tool must replicate this to avoid behavior divergence. Confirm the exact email call site at implementation time.
- **Photo tools emit `dataChanged: { entityType: "property" }`**: photos are a property sub-resource; invalidating the property query is sufficient and reuses the existing handler.
- **`update_market_rate` emits new `"market_rate"` entityType**: market rates are not a property/scenario sub-resource; a dedicated entityType avoids spurious property-list invalidations.
- **`update_company` emits new `"company"` entityType**: admin-only; the exact storage call is a deferred implementation question.
- **`dispatchAsyncJob` is internal only**: no new schema entries, no parity map rows. The refactor extracts common boilerplate (create run record → fire async → return `{ runId, status: "started" }`) without changing the tool API surface or observable behavior.

---

## Open Questions

### Resolved During Planning

- *Does `delete_property_photo` involve R2 cleanup?* No — `storage.deletePropertyPhoto(photoId)` handles it internally; no R2 call needed from the tool.
- *Is `set_hero_photo` a clean storage call?* Yes — `storage.setHeroPhoto(propertyId, photoId)` with no extra logic.
- *What storage method backs `get_global_assumptions`?* `storage.getGlobalAssumptions(userId)` — same call as the existing GET route.
- *What are the KB list/read storage methods?* `storage.getRebeccaKBEntries(category?)` and `storage.getRebeccaKBEntry(id)`.
- *What data layer backs market rates?* `getAllMarketRates()` and `upsertMarketRate(data)` from `artifacts/api-server/src/data/marketRates.ts`.

### Deferred to Implementation

- *Does `update_company` map to `patchGlobalAssumptions` or need a new `patchCompany` storage method?* Check at implementation time; use whichever path the existing company admin UI uses.
- *Which React Query keys should `"company"` and `"market_rate"` invalidate in RebeccaPanel?* Trace from existing query call sites for `/api/companies` and `/api/market-rates`.
- *Does `share_scenario` need to replicate the email notification?* Yes — mirror the route's behavior. Identify the email call site at implementation time.

---

## Implementation Units

- U1. **Fix `trigger_lb_deck_render` missing dataChanged**

**Goal:** The one remaining silent mutating tool emits `dataChanged` so RebeccaPanel can invalidate the relevant query after a render is triggered.

**Requirements:** R7

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Test: `artifacts/api-server/src/tests/rebecca-tools.test.ts`

**Approach:**
- In `toolTriggerLbDeckRender`, add `dataChanged: { entityType: "lb_deck_config" as const, entityId: 0 }` to the return value. The `"lb_deck_config"` entityType is already in the union and already handled in RebeccaPanel — no new handler needed.

**Patterns to follow:**
- `toolConfigureLbDeck` which returns `dataChanged: { entityType: "lb_deck_config", entityId: 0 }`.

**Test scenarios:**
- Happy path: `toolTriggerLbDeckRender` returns an object containing `dataChanged.entityType === "lb_deck_config"` and `dataChanged.entityId === 0`.

**Verification:**
- `grep "trigger_lb_deck_render" artifacts/api-server/src/chat/rebecca-tools.ts` shows the function returns `dataChanged`.
- `pnpm run typecheck` clean.

---

- U2. **`get_global_assumptions` read tool**

**Goal:** Rebecca can read the current global assumptions before proposing or making updates — closing the write-only CRUD gap.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Test: `artifacts/api-server/src/tests/rebecca-tools.test.ts`

**Approach:**
- Add tool definition `get_global_assumptions` (no parameters needed — assumptions are user-scoped via `ctx.user.id`).
- Call `storage.getGlobalAssumptions(ctx.user.id)` and return the result.
- Read-only: no `dataChanged` needed.
- Admin users see the full assumptions including admin-only fields; non-admin users see the same shape (the route does not restrict fields by role, just requires auth).

**Patterns to follow:**
- `toolGetScenario` — simple authenticated read returning a storage result.

**Test scenarios:**
- Happy path: authenticated user calls `get_global_assumptions` → returns assumptions object with expected financial fields.
- Error path: `storage.getGlobalAssumptions` throws → tool returns `{ error: "Failed to fetch global assumptions" }`, does not propagate the exception.

**Verification:**
- Tool name `get_global_assumptions` appears in the tool schema array.
- Parity map row added: ✅ `get_global_assumptions` — `GET /api/global-assumptions`.
- `pnpm run typecheck` clean.

---

- U3. **`list_kb_entries` + `get_kb_entry` tools**

**Goal:** Rebecca can verify KB content exists before deleting or referencing it, and list entries by category.

**Requirements:** R2

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Test: `artifacts/api-server/src/tests/rebecca-tools.test.ts`

**Approach:**
- `list_kb_entries(category?: string)` — admin-only via `requireAdminCtx`. Calls `storage.getRebeccaKBEntries(category)`. Returns the entry array.
- `get_kb_entry(id: number)` — authenticated (not admin-only). Calls `storage.getRebeccaKBEntry(id)`. Returns `{ error: "Not found" }` if null or `isActive === false` (mirrors route behavior).
- Both are read-only: no `dataChanged`.

**Patterns to follow:**
- `toolGetScenario` for ownership/existence check pattern.
- Existing KB CRUD tools (`create_kb_entry`) for schema placement and switch-case routing.

**Test scenarios:**
- Happy path: `list_kb_entries()` with no filter returns all KB entries (admin user).
- Happy path: `list_kb_entries("market-analysis")` returns only entries with that category.
- Error path: non-admin calls `list_kb_entries` → `{ error: "Admin access required" }`.
- Happy path: `get_kb_entry(id)` for an existing active entry → returns `{ id, title, content, category, source }`.
- Error path: `get_kb_entry(999999)` for non-existent id → `{ error: "Not found" }`.
- Edge case: `get_kb_entry(id)` where entry exists but `isActive === false` → `{ error: "Not found" }`.

**Verification:**
- Both tool names appear in schema; `list_kb_entries` dispatch is admin-gated.
- Parity map rows added: ✅ `list_kb_entries` — `GET /api/rebecca/kb`; ✅ `get_kb_entry` — `GET /api/rebecca/kb/entry/:id`.
- `pnpm run typecheck` clean.

---

- U4. **`share_scenario` tool**

**Goal:** Rebecca can share a scenario with another user by email, matching the full behavior of the existing route.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Test: `artifacts/api-server/src/tests/rebecca-tools.test.ts`

**Approach:**
- `share_scenario(scenarioId: number, recipientEmail: string)`.
- Verify scenario belongs to `ctx.user` via ownership check (mirror `requireScenarioPermission`).
- Self-share guard: if `recipientEmail === ctx.user.email`, return `{ error: "You cannot share scenarios with yourself" }`.
- Look up recipient via `storage.getUserByEmail(recipientEmail)`. If not found, return `{ result: { shares: [], recipientName: null } }` (privacy-preserving, matches existing route fix from Task #plan-003).
- If found, call `storage.shareScenarioWithUser(scenarioId, recipient.id, ctx.user.id)`.
- Mirror the email notification side-effect from the route — identify the exact call at implementation time.
- Return `dataChanged: { entityType: "scenario", entityId: scenarioId }`.

**Patterns to follow:**
- `toolDeleteScenario` for ownership check pattern.
- The route at `artifacts/api-server/src/routes/scenarios.ts` line ~466 for the full share logic including guards.

**Test scenarios:**
- Happy path: valid owned scenario + known recipient email → shares successfully, returns `dataChanged` with `entityType: "scenario"`.
- Edge case: unrecognised email → returns `{ result: { shares: [], recipientName: null } }` (no error, privacy-preserving).
- Error path: `recipientEmail === ctx.user.email` (self-share) → `{ error: "You cannot share scenarios with yourself" }`.
- Error path: `scenarioId` belongs to another user → `{ error: "Not found" }`.

**Verification:**
- Tool name `share_scenario` in schema.
- Parity map row: ✅ `share_scenario` — `POST /api/scenarios/shares`.
- `pnpm run typecheck` clean.

---

- U5. **`delete_property_photo` + `set_hero_photo` tools**

**Goal:** Rebecca can delete a property photo and set a photo as the hero image, completing photo management parity.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Test: `artifacts/api-server/src/tests/rebecca-tools.test.ts`

**Approach:**
- `delete_property_photo(propertyId: number, photoId: number)`:
  - Ownership check on `propertyId`.
  - Retrieve photo via `storage.getPhotoById(photoId)`. If null or not belonging to `propertyId`, return `{ error: "Not found" }`.
  - Mirror the last-photo guard from the route: if this is the only photo AND user is not admin, return `{ error: "Cannot delete the last photo — admin required" }`.
  - Call `storage.deletePropertyPhoto(photoId)`.
  - Return `dataChanged: { entityType: "property", entityId: propertyId }`.
- `set_hero_photo(propertyId: number, photoId: number)`:
  - Ownership check on `propertyId`.
  - Verify photo belongs to property.
  - Call `storage.setHeroPhoto(propertyId, photoId)`.
  - Return `dataChanged: { entityType: "property", entityId: propertyId }`.
- Both use the existing `"property"` entityType — no new SSE handler branch needed.

**Patterns to follow:**
- `toolPatchProperty` for ownership-check + storage-write + `dataChanged: property` pattern.
- Route at `artifacts/api-server/src/routes/property-photos.ts` for guard logic.

**Test scenarios:**
- Happy path: `delete_property_photo` with owned property and non-last photo → photo deleted, property `dataChanged` returned.
- Error path: `delete_property_photo` where photo is the last and user is non-admin → `{ error: "Cannot delete the last photo — admin required" }`.
- Error path: `delete_property_photo` with photo not belonging to that property → `{ error: "Not found" }`.
- Error path: `delete_property_photo` on property not owned by user → `{ error: "Not found" }`.
- Happy path: `set_hero_photo` with valid owned property and photo → hero updated, property `dataChanged` returned.
- Error path: `set_hero_photo` on property not owned by user → `{ error: "Not found" }`.

**Verification:**
- Both tool names in schema.
- Parity map rows: ✅ `delete_property_photo` — `DELETE /api/properties/:id/photos/:photoId`; ✅ `set_hero_photo` — `POST /api/properties/:id/photos/:photoId/set-hero`.
- `pnpm run typecheck` clean.

---

- U6. **`update_company` tool**

**Goal:** Admins can update company metadata through Rebecca, closing the company CRUD gap.

**Requirements:** R5

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Modify: `artifacts/hospitality-business-portal/src/components/rebecca/RebeccaPanel.tsx`
- Test: `artifacts/api-server/src/tests/rebecca-tools.test.ts`

**Approach:**
- `update_company(patch: object)` — admin-only via `requireAdminCtx`.
- Accept a partial object of company-level fields (name, description, settings). Validate against the schema for whatever storage method is chosen (see Deferred below).
- Return `dataChanged: { entityType: "company" as const, entityId: 0 }` — add `"company"` to the `DataChangedEntry` union.
- In `RebeccaPanel.tsx`: add `"company"` handler in both SSE handler blocks; invalidate the correct React Query keys for the company/assumptions query (confirm key names from existing call sites at implementation time).
- **Deferred implementation decision**: if company fields (name, description) live in `global_assumptions`, call `patchGlobalAssumptions`. If a dedicated `companies` table exists, call `patchCompany`. Do not invent a new storage method if an existing one covers the needed fields.

**Patterns to follow:**
- `toolUpdateGlobalAssumptions` for the admin-only partial-patch pattern.
- `toolConfigureLbDeck` for the pattern of adding a new `entityType` to the union and SSE handler simultaneously.

**Test scenarios:**
- Happy path (admin): `update_company` with valid patch fields → company updated, `dataChanged` with `entityType: "company"` returned. *(Confirm storage method before writing this test — the assertion should verify the correct storage function was called, whichever the implementation uses.)*
- Error path (non-admin): → `{ error: "Admin access required" }`.
- Edge case: empty patch object → return `{ result: "No changes applied" }` or call storage with empty patch — whichever is consistent with existing no-op behavior.
- Integration: after `update_company` succeeds, the RebeccaPanel `"company"` handler invalidates the React Query key used by the company/assumptions data display. *(Confirm the exact key from call sites before writing this scenario.)*

**Verification:**
- Tool `update_company` in schema.
- `"company"` in `DataChangedEntry` union; handler present in both RebeccaPanel SSE blocks.
- Both SSE handler blocks' `"company"` branches verified to invalidate the same key the UI uses to fetch company data.
- Parity map row: ✅ `update_company`.
- `pnpm run typecheck` clean.

---

- U7. **`get_market_rates` + `update_market_rate` tools**

**Goal:** Rebecca can surface current market rates to users and allow admin overrides, closing the market-rate parity gap.

**Requirements:** R6

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Modify: `artifacts/hospitality-business-portal/src/components/rebecca/RebeccaPanel.tsx`
- Test: `artifacts/api-server/src/tests/rebecca-tools.test.ts`

**Approach:**
- `get_market_rates(key?: string)` — authenticated (not admin-only; the route is `requireAuth`).
  - If `key` provided: call `getMarketRate(key)` from `artifacts/api-server/src/data/marketRates.ts`. Return single rate or `{ error: "Rate not found" }`.
  - If no `key`: call `getAllMarketRates()`. Return array of rates with staleness status.
  - Read-only: no `dataChanged`.
- `update_market_rate(key: string, value: number, note?: string)` — admin-only via `requireAdminCtx`.
  - Call `upsertMarketRate({ key, value, source: "admin_override", ... })` from the data layer.
  - Return `dataChanged: { entityType: "market_rate" as const, entityId: 0 }` — add `"market_rate"` to the `DataChangedEntry` union.
- In `RebeccaPanel.tsx`: add `"market_rate"` handler in both SSE blocks; invalidate `["/api/market-rates"]`.

**Patterns to follow:**
- `toolGetAnalystTable` for the authenticated read-with-optional-filter pattern.
- Route at `artifacts/api-server/src/routes/market-rates.ts` for admin guard and `upsertMarketRate` call signature.

**Test scenarios:**
- Happy path: `get_market_rates()` with no key → returns array of rate objects with staleness fields.
- Happy path: `get_market_rates("fed_funds_rate")` → returns single rate object with `value`, `key`, and staleness metadata.
- Error path: `get_market_rates("nonexistent_key")` → `{ error: "Rate not found" }`.
- Happy path (admin): `update_market_rate("fed_funds_rate", 5.25)` → calls `upsertMarketRate` with the key and value, returns `dataChanged` with `entityType: "market_rate"`.
- Error path (non-admin): `update_market_rate(...)` → `{ error: "Admin access required" }`.
- Integration: after `update_market_rate` succeeds, the RebeccaPanel `"market_rate"` handler invalidates `["/api/market-rates"]`. *(Before writing this integration test, confirm the React Query key used by the market-rates display from existing call sites.)*

**Verification:**
- Both tool names in schema.
- `"market_rate"` in `DataChangedEntry` union; handler in both RebeccaPanel SSE blocks, verified to invalidate the key used by the market-rates UI query.
- Parity map rows: ✅ `get_market_rates` — `GET /api/market-rates`; ✅ `update_market_rate` — `PATCH /api/market-rates/:key`.
- `pnpm run typecheck` clean.

---

- U8. **Internal `dispatchAsyncJob` helper extraction**

**Goal:** Eliminate copy-pasted async-dispatch boilerplate across three trigger tools without changing any observable behavior or tool API surface.

**Requirements:** R8

**Dependencies:** None (no behavioral dependency; can be done alongside or after other units)

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`

**Approach:**
- Extract the repeated pattern from `toolTriggerIrisRun`, `toolRunComplianceAudit` (and any other trigger tools sharing this shape):
  1. Create a DB run record
  2. Fire the agent asynchronously (non-blocking)
  3. Return `{ result: { runId, status: "started" }, dataChanged: { entityType: X, entityId: runId } }`
- Create a private `dispatchAsyncJob` helper inside `rebecca-tools.ts` (not exported, not a Rebecca tool). Each existing trigger function calls the helper with its agent-specific arguments.
- No tool names change. No `DataChangedEntry` entries change. No parity map rows change. No RebeccaPanel changes.

**Patterns to follow:**
- The existing implementations of `toolTriggerIrisRun` and `toolRunComplianceAudit` as the reference for what to extract.

**Test scenarios:**
- Test expectation: none — pure internal refactor. Existing Iris and compliance tool tests must continue to pass unchanged.

**Verification:**
- Existing test suite passes: `pnpm --filter @workspace/api-server run test`.
- `pnpm run typecheck` clean.
- No tool names, descriptions, or `dataChanged` shapes changed (confirmed by diff review).

---

## System-Wide Impact

- **Interaction graph:** RebeccaPanel SSE handler gains two new `entityType` branches (`"company"`, `"market_rate"`). The `"lb_deck_config"` branch already exists and handles U1's fix transparently.
- **Error propagation:** All new tools follow the existing pattern: catch exceptions, return `{ error: "..." }`, never propagate unhandled rejections.
- **State lifecycle risks:** `share_scenario` may send an email as a side-effect — ensure the tool does not emit dataChanged before the email call to avoid a partial-success state where the UI refreshes before the share is fully committed.
- **API surface parity:** No new HTTP routes added; all tools call existing storage/data-layer methods.
- **Integration coverage:** `share_scenario` crosses three layers (ownership check → storage write → email notification) — the integration scenario requires end-to-end verification that all three steps complete in order.
- **Unchanged invariants:** Existing tool names, their descriptions, parameter schemas, and `dataChanged` shapes are unchanged by U8's internal refactor.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| `update_company` has no PATCH route → storage method unclear | Deferred to implementation: use whichever storage path the admin company UI uses. Do not add a new route. |
| `share_scenario` email side-effect may not have a clean injectable interface | Read the route's email call at implementation time; replicate the exact call chain, not an approximation. |
| New `"company"` / `"market_rate"` entityTypes orphaned if RebeccaPanel handler is missed | TypeScript will NOT catch this (the union accepts the new strings but the switch-case is unchecked). Verify both SSE handler blocks cover the new types before merging. |
| U8 refactor accidentally changes trigger tool behavior | U8 is limited to extracting identical code — any diff to return shapes or async firing order is a regression. Verify with existing tests. |

---

## Documentation / Operational Notes

- `docs/discipline/agent-native-parity-map.md` must be updated in the same PR (9 new ✅ rows for 9 new tools).
- After merging, trigger a `/parity-audit` to confirm the score improvement and verify no new gaps were introduced.

---

## Sources & References

- Agent-native audit: conversation context (2026-05-09 audit, overall 69% → targeting ~80% after this PR)
- `artifacts/api-server/src/chat/rebecca-tools.ts` — all tool implementations
- `artifacts/hospitality-business-portal/src/components/rebecca/RebeccaPanel.tsx` — SSE handler
- `artifacts/api-server/src/routes/global-assumptions.ts`, `property-photos.ts`, `scenarios.ts`, `market-rates.ts`, `rebecca.ts`
- `artifacts/api-server/src/data/marketRates.ts` — `getAllMarketRates`, `getMarketRate`, `upsertMarketRate`
- Related plan: `docs/plans/2026-05-09-005-feat-agent-native-parity-improvements-plan.md` (prior parity wave)
- Agent-native parity discipline: `.agents/skills/ce-agent-native-architecture/references/action-parity-discipline.md`
