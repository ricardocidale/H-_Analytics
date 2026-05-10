---
title: "feat: Agent-Native Parity Wave 4 — Action Parity, Company CRUD, UI Integration fix"
type: feat
status: active
date: 2026-05-10
---

# feat: Agent-Native Parity Wave 4

## Summary

Closes three gaps identified in the third agent-native audit (71% overall). Adds 11 new Rebecca tools covering Prospective Properties, Price Events, Photo Reorder, and Service Templates (Action Parity); adds Company create/delete routes and tools (CRUD Completeness); removes an incorrect `dataChanged` emission from `probe_data_source` (UI Integration); and moves an inline `CONFIDENCE_CHIP` constant to a dedicated constants file (CodeRabbit PR #74 follow-up).

---

## Requirements

- R1. Rebecca can list, save, delete, and update notes on prospective properties (property-finder favorites).
- R2. Rebecca can list, create, update, and delete price events on a prospective property.
- R3. Rebecca can reorder photos in a property gallery by providing an ordered array of photo IDs.
- R4. Rebecca can list and update company service templates (admin-only).
- R5. Rebecca can create and delete companies (admin-only). HTTP routes for company create/delete are added alongside the tools.
- R6. `probe_data_source` no longer emits a spurious `dataChanged` event — it is read-only and must not trigger frontend cache invalidation.
- R7. `CONFIDENCE_CHIP` constant is extracted from `AssumptionGuidancePopover.tsx` to a co-located constants file.
- R8. All new tools follow the 4-part pattern: schema entry in `getRebeccaTools()`, dispatch case in `dispatchRebeccaTool()`, implementation function, parity map row.
- R9. `pnpm run typecheck` passes; parity-map-coverage test passes.

---

## Scope Boundaries

- Photo enhance/accept/reject pipeline — deferred; async state machine adds complexity disproportionate to frequency of agent use.
- ICP Research trigger/export — deferred; SSE streaming pattern doesn't map cleanly to tool calling.
- Market Rate and Analyst Table create/delete — intentionally N/A; seed-only entities managed by admin table refresh.
- Iris Run, Data Source, Global Assumptions create/delete — intentionally N/A by design.
- Tools-as-Primitives refactor (slide factory state machine) — separate concern, out of scope.

---

## Context & Research

### Relevant Code and Patterns

- 4-part Rebecca tool pattern: `artifacts/api-server/src/chat/rebecca-tools.ts` — schema in `getRebeccaTools()`, dispatch in `dispatchRebeccaTool()`, implementation function
- Property photo tools as ownership-check reference: `toolDeletePropertyPhoto`, `toolCreatePhoto`, `toolUpdatePhoto` (same file, ~lines 2421–2960)
- Property-finder routes: `artifacts/api-server/src/routes/property-finder.ts` — all prospective + price-event endpoints
- Service template routes: `artifacts/api-server/src/routes/global-assumptions.ts` lines 566, 575
- Photo reorder: `artifacts/api-server/src/routes/property-photos.ts` line 284; `artifacts/api-server/src/storage/photos.ts` `reorderPhotos()`
- Company table schema: `lib/db/src/schema/core.ts` — simple table, no incoming FKs, safe for create/delete
- Parity map: `docs/discipline/agent-native-parity-map.md`
- `requireNumericArg`, `requireAdminCtx`, `requireObjectArg` helpers in `rebecca-tools.ts`
- RebeccaPanel dataChanged handler: `artifacts/hospitality-business-portal/src/components/rebecca/RebeccaPanel.tsx` lines 466–500, 656–690
- CONFIDENCE_CHIP (to move): `artifacts/hospitality-business-portal/src/components/analyst/AssumptionGuidancePopover.tsx` ~line 39

### Institutional Learnings

- Barrel shadow pattern (docs/solutions/logic-errors/): never declare a constant in both a barrel and a sub-file.
- Admin-only company routes follow `requireAdmin` middleware pattern (same as `list_companies` / `update_company` tools).

---

## Key Technical Decisions

- **No new storage files for company create/delete**: add `createCompany` and `deleteCompany` directly to `artifacts/api-server/src/storage/admin.ts` (or wherever existing company storage lives) to stay consistent with the orchestrator pattern.
- **Prospective property tools scope**: Only core CRUD (list, save/create, delete, update-notes). No saved-search tools in this wave — adds scope without proportional parity value.
- **Price events live on prospective properties**: `priceEvents` is a JSONB column; tools call through to the property-finder routes' underlying storage, not a separate table.
- **CONFIDENCE_CHIP moves to a frontend-local constants file**: `artifacts/hospitality-business-portal/src/components/analyst/constants.ts`. Not to `lib/shared/src/constants.ts` — that file is for business/financial constants, not UI chip configurations.
- **Company entityType for dataChanged**: use `{ entityType: "company", entityId: id }` — the RebeccaPanel SSE handler already handles `"company"` (invalidates `/api/admin/companies`).

---

## Open Questions

### Resolved During Planning

- *Are Company create/delete routes missing?* Yes — confirmed. POST and DELETE endpoints do not exist; must be added alongside the tools.
- *Is probe_data_source the only spurious dataChanged emitter?* Yes — all other mutation tools emit correctly per the research audit.
- *Does RebeccaPanel handle all required entityTypes?* Yes — `property`, `scenario`, `company`, `slide_factory_run`, `market_rate`, `kb_entry`, `global_assumptions`, `analyst_table`, `data_source`, `iris_run`, `lb_deck_config`, `compliance_run`, `research_job`, `iris_gap` are all handled.
- *Where does prospective property storage live?* In the property-finder storage; called via `storage.` methods as usual (the storage index wires all submodules).

### Deferred to Implementation

- Exact storage method names for prospective property CRUD — discover by reading the storage module at implementation time.
- Whether company delete should soft-delete (set `isActive = false`) or hard-delete — check for any active user associations before deciding; default to soft-delete (set `isActive = false`) for safety.

---

## Implementation Units

- U1. **Fix probe_data_source spurious dataChanged**

**Goal:** Remove the incorrect `dataChanged` emission from `toolProbeDataSource` — it is a health-check read, not a mutation.

**Requirements:** R6

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`

**Approach:**
- Find `toolProbeDataSource` implementation function and remove the `dataChanged` field from its return value.
- Return type stays `Promise<{ result: unknown; dataChanged?: DataChangedEntry }>` — just don't populate the field.

**Patterns to follow:** Other read-only tools (`toolGetProperty`, `toolGetScenario`) that return only `{ result: ... }`.

**Test scenarios:**
- Test expectation: none — pure removal of a field; typecheck passing is the signal.

**Verification:**
- `grep -n "dataChanged" artifacts/api-server/src/chat/rebecca-tools.ts | grep "probe"` returns no results.
- `pnpm run typecheck` clean.

---

- U2. **Add Company create/delete HTTP routes**

**Goal:** Add `POST /api/admin/companies` and `DELETE /api/admin/companies/:id` endpoints so Rebecca tools have server-side backing.

**Requirements:** R5

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/routes/admin/` (find the file that registers company routes, or add to a new `companies.ts`)
- Modify: `artifacts/api-server/src/storage/admin.ts` (or wherever company storage methods live — discover at implementation time)

**Approach:**
- `POST /api/admin/companies` — requireAdmin, validate `{ name, type, description? }`, call `createCompany()`, return created row.
- `DELETE /api/admin/companies/:id` — requireAdmin, soft-delete by setting `isActive = false` (safe default; avoids breaking any audit trail). Confirm no active users reference the company before soft-deleting if a check is cheap.
- Add `createCompany(data)` and `deactivateCompany(id)` storage methods following the existing pattern in the companies storage layer.

**Patterns to follow:**
- `PATCH /api/admin/companies/:id` implementation (existing update route) for auth + validation shape.
- `toolDeleteProperty` for the soft-delete / archive pattern.

**Test scenarios:**
- Happy path: POST with valid name+type → 201, returns new company row with generated id.
- Happy path: DELETE existing active company → 200, isActive becomes false.
- Error path: POST with duplicate name → 409 or 400 (unique constraint).
- Error path: DELETE non-existent id → 404.
- Auth: both routes return 403 for non-admin callers.

**Verification:**
- `curl -X POST /api/admin/companies` with admin cookie returns a company row.
- `curl -X DELETE /api/admin/companies/:id` soft-deletes the record.
- `pnpm run typecheck` clean.

---

- U3. **Add create_company and delete_company Rebecca tools**

**Goal:** Expose company lifecycle to Rebecca via two new tools.

**Requirements:** R5, R8

**Dependencies:** U2

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Modify: `docs/discipline/agent-native-parity-map.md`

**Approach:**
- `create_company(name, type, description?)` — requireAdmin, validate, POST to storage, emit `dataChanged: { entityType: "company", entityId: newId }`.
- `delete_company(id)` — requireAdmin, soft-delete via `deactivateCompany`, emit `dataChanged: { entityType: "company", entityId: id }`.
- Add schema entries to `getRebeccaTools()`, dispatch cases, and implementation functions following the `toolUpdateCompany` pattern.

**Patterns to follow:** `toolUpdateCompany` (~line 2636 in `rebecca-tools.ts`), `toolDeleteProperty`.

**Test scenarios:**
- Happy path: `create_company` with name + type → `{ success: true, id: N }`.
- Happy path: `delete_company` with valid id → `{ success: true }`.
- Error path: `create_company` without admin role → error result.
- Error path: `delete_company` with unknown id → error result.

**Verification:**
- `grep -n "create_company\|delete_company" artifacts/api-server/src/chat/rebecca-tools.ts` shows schema entry, dispatch case, and implementation.
- Parity map has two new rows.
- Parity-map-coverage test passes.

---

- U4. **Add Prospective Properties tools**

**Goal:** Give Rebecca the ability to list, save, delete, and update notes on prospective (favorited) properties.

**Requirements:** R1, R8

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Modify: `docs/discipline/agent-native-parity-map.md`

**Approach:**
- `list_prospective_properties()` — calls storage equivalent of `GET /api/property-finder/prospective`, returns array of prospective property records. No auth restriction beyond user scope.
- `save_prospective_property(address, city?, state?, country?, notes?)` — creates a new prospective property record for the authenticated user.
- `delete_prospective_property(id)` — deletes a prospective property by id; verify ownership before deleting.
- `update_prospective_property_notes(id, notes)` — updates the notes field on a prospective property.
- Each mutation emits `dataChanged: { entityType: "property_finder", entityId: id }` — add this entityType to RebeccaPanel's SSE handler (invalidate `["/api/property-finder/prospective"]`).

**Patterns to follow:** `toolCreatePhoto` for ownership check pattern; `toolListProperties` for the list pattern. Discover exact storage method names by reading `artifacts/api-server/src/storage/` at implementation time.

**Test scenarios:**
- Happy path: `list_prospective_properties` → returns array (may be empty).
- Happy path: `save_prospective_property` with address → returns new record with id.
- Happy path: `delete_prospective_property` with own id → success.
- Happy path: `update_prospective_property_notes` → updated notes returned.
- Error path: `delete_prospective_property` with another user's id → not found error.

**Verification:**
- Four new tools appear in `getRebeccaTools()` and dispatch.
- `property_finder` entityType added to RebeccaPanel SSE handler.
- Parity map updated with four rows.

---

- U5. **Add Price Events tools**

**Goal:** Give Rebecca full CRUD over price events on a prospective property (acquisition price history).

**Requirements:** R2, R8

**Dependencies:** U4 (prospective property must exist)

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Modify: `docs/discipline/agent-native-parity-map.md`

**Approach:**
- `list_price_events(prospectivePropertyId)` — returns the priceEvents array from the prospective property record.
- `create_price_event(prospectivePropertyId, type, price, date?, notes?)` — adds a price event; validate with `priceEventInputSchema` from `@shared/price-history` or pass directly to storage.
- `update_price_event(prospectivePropertyId, eventId, patch)` — patches an existing price event.
- `delete_price_event(prospectivePropertyId, eventId)` — removes a price event by id.
- All mutations emit `dataChanged: { entityType: "property_finder", entityId: prospectivePropertyId }`.
- Verify ownership of the prospective property before any mutation.

**Patterns to follow:** `toolUpdatePhoto` for the ownership-check + patch pattern; `artifacts/api-server/src/routes/property-finder.ts` for exact schema validation approach.

**Test scenarios:**
- Happy path: `list_price_events` on own prospective property → returns events array.
- Happy path: `create_price_event` → new event appears in list.
- Happy path: `update_price_event` → patched fields updated.
- Happy path: `delete_price_event` → event removed.
- Error path: any mutation on another user's prospective property → not found error.
- Edge case: `list_price_events` on property with no events → empty array (not error).

**Verification:**
- Four new tools in schema + dispatch + implementation.
- Parity map updated with four rows.
- `pnpm run typecheck` clean.

---

- U6. **Add reorder_photos tool**

**Goal:** Allow Rebecca to reorder a property's photo gallery by providing an ordered list of photo IDs.

**Requirements:** R3, R8

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Modify: `docs/discipline/agent-native-parity-map.md`

**Approach:**
- `reorder_photos(propertyId, orderedPhotoIds)` — validates property ownership, calls `storage.reorderPhotos(propertyId, orderedPhotoIds)`, emits `dataChanged: { entityType: "property", entityId: propertyId }`.
- `orderedPhotoIds` is a JSON array of photo IDs in the desired order (0-indexed sort order assigned by position).
- Validate that `orderedPhotoIds` is a non-empty array of numbers.

**Patterns to follow:** `toolDeletePropertyPhoto` for ownership check; `storage.reorderPhotos()` in `artifacts/api-server/src/storage/photos.ts` line 295.

**Test scenarios:**
- Happy path: valid propertyId + ordered array → success, photos reordered.
- Error path: property belonging to another user → not found.
- Error path: empty array → error (at least one photo required).
- Error path: non-array or non-numeric ids → error.

**Verification:**
- One new tool in schema + dispatch + implementation.
- Parity map updated.
- `pnpm run typecheck` clean.

---

- U7. **Add Service Templates tools**

**Goal:** Allow Rebecca to list and update company service templates (admin-only).

**Requirements:** R4, R8

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Modify: `docs/discipline/agent-native-parity-map.md`

**Approach:**
- `list_service_templates()` — requireAdmin, calls `storage.getAllServiceTemplates()`, returns templates with id, name, serviceModel, defaultRate, markupPercent, isActive, sortOrder.
- `update_service_template(id, patch)` — requireAdmin, validates patch fields (name?, defaultRate?, markupPercent?, isActive?, sortOrder?), calls storage update, emits `dataChanged: { entityType: "service_template", entityId: id }`.
- Add `service_template` entityType to RebeccaPanel SSE handler (invalidate `["/api/company/service-templates"]`).

**Patterns to follow:** `toolUpdateMarketRate` for the admin-gated read-modify-write pattern.

**Test scenarios:**
- Happy path: `list_service_templates` as admin → returns template array.
- Happy path: `update_service_template` patching defaultRate → updated value returned.
- Error path: `list_service_templates` as non-admin → admin-required error.
- Error path: `update_service_template` with unknown id → not found.

**Verification:**
- Two new tools in schema + dispatch + implementation.
- `service_template` entityType handled in RebeccaPanel.
- Parity map updated with two rows.

---

- U8. **Extract CONFIDENCE_CHIP to analyst constants file**

**Goal:** Address CodeRabbit PR #74 finding — move the inline `CONFIDENCE_CHIP` constant to a dedicated constants file within the analyst component directory.

**Requirements:** R7

**Dependencies:** None

**Files:**
- Create: `artifacts/hospitality-business-portal/src/components/analyst/constants.ts`
- Modify: `artifacts/hospitality-business-portal/src/components/analyst/AssumptionGuidancePopover.tsx`

**Approach:**
- Create `constants.ts` in the analyst directory and export `CONFIDENCE_CHIP` from it.
- Remove the inline definition from `AssumptionGuidancePopover.tsx` and import from `./constants`.
- Keep the constant shape unchanged.

**Patterns to follow:** Other co-located component constants files in the frontend.

**Test scenarios:**
- Test expectation: none — pure refactor with no behavioral change. Typecheck passing is the signal.

**Verification:**
- `grep -n "CONFIDENCE_CHIP" artifacts/hospitality-business-portal/src/components/analyst/AssumptionGuidancePopover.tsx` shows only the import, not the definition.
- `pnpm run typecheck` clean.

---

## System-Wide Impact

- **Interaction graph:** New `property_finder` and `service_template` entityTypes require RebeccaPanel SSE handler additions (both blocks at ~lines 466 and 656). Company create/delete emit the existing `company` entityType — no handler change needed.
- **Error propagation:** All new tools follow the existing try/catch in `dispatchRebeccaTool` — errors surface as `{ result: { error: "..." } }`.
- **Unchanged invariants:** All existing tools, SSE handling, and storage patterns are unchanged. Photo reorder delegates entirely to the existing `storage.reorderPhotos()` method.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Prospective property storage method names differ from expectations | Read the storage module at implementation time; tool research confirmed routes exist |
| Company soft-delete (isActive=false) may leave orphaned references | Check for user/scenario associations before deactivating; default to soft-delete over hard-delete |
| `property_finder` entityType SSE handler missing causes silent no-refresh | Both SSE handler blocks in RebeccaPanel must be updated (lines ~466 and ~656) |
| Parity-map-coverage test fails if new tool names aren't added | Add all 11+ tool names to parity map before running the test |

---

## Sources & References

- Agent-native audit #3 results (this session)
- `artifacts/api-server/src/routes/property-finder.ts` — prospective + price-event routes
- `artifacts/api-server/src/routes/global-assumptions.ts` — service template routes
- `artifacts/api-server/src/routes/property-photos.ts` — reorder route
- `artifacts/api-server/src/chat/rebecca-tools.ts` — tool implementation patterns
- `docs/discipline/agent-native-parity-map.md` — parity tracking
