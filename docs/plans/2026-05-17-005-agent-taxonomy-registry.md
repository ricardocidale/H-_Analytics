---
id: 2026-05-17-005
title: "Agent Taxonomy: Centralized Registry & Terminology Consistency"
status: active
created: 2026-05-17
depth: Deep
---

# Agent Taxonomy: Centralized Registry & Terminology Consistency

## Problem Frame

Three connected problems triggered this plan:

1. **Misidentified entity classes in runtime messages.** Today's bug: the orchestrator's probe endpoint returned `"Specialist not found"` because `"gaspar"` (the internal ID for Gustavo) is not in `SPECIALIST_CATALOG`. The orchestrator is not a specialist — but all probe routes live under `/api/admin/specialists/:id/`, so the error message used the wrong class label. A bandage (`humanizeProbeMessage()`) was added, but the root cause remains.

2. **Opaque ID-to-name relationship.** `ORCHESTRATOR_SPECIALIST_ID = "gaspar"` bears no linguistic relationship to `"Gustavo"`. Any developer reading `gaspar` in a log, error, or route param has no idea it refers to the orchestrator persona. The disconnect is now documented in solution docs, but it will keep generating confusion.

3. **Scattered entity definitions.** The full roster of agents, specialists, minions, and the orchestrator is spread across three files in two separate packages — none of which is authoritative across all entity classes. The portal rendering layer must assemble metadata from multiple sources, which is fragile and hard to audit.

## Scope Boundary

**In scope:**
- New centralized entity registry in the portal rendering layer
- Class-aware probe route for the orchestrator (Replit-owned)
- Terminology cleanup in user-facing error messages across api-server routes
- `ORCHESTRATOR_SPECIALIST_ID` rename from `"gaspar"` → `"gustavo"` (CC Phase)
- A defined `entityCode` convention for all entity classes

**Out of scope (this plan):**
- Renaming specialist dotted IDs (e.g., `"mgmt-co.funding"`) — these are persisted in the DB and are too risky to change
- Renaming any DB tables or column names that include "specialist"
- Changes to the financial engine (`lib/calc/`, `lib/engine/src/`)

## CC-Owned Surfaces (Read-Only for Replit)

The following directories must not be edited by Replit Agent. Phases 1–2 are designed to be fully Replit-executable. Phases 3–4 require CC.

- `lib/engine/src/` — engine, orchestrator identity, specialist catalog
- `lib/calc/src/`
- `lib/shared/src/constants*.ts`
- `lib/db/src/`
- `artifacts/api-server/src/finance/`
- `artifacts/api-server/src/report/`
- `artifacts/api-server/src/migrations/*.ts`
- `artifacts/api-server/src/tests/proof/`
- `tests/engine/`

## Stable-Code Convention (Decision)

**Chosen: class-prefixed `entityCode` strings.** These are display/routing codes used by the portal registry and the new intelligence probe route. They do **not** replace the persisted specialist IDs (dotted notation like `"mgmt-co.funding"`) stored in the DB.

| Class | Code format | Examples |
|---|---|---|
| Orchestrator | `orch.<humanName>` | `orch.gustavo` |
| Specialist | `spec.<letter>` | `spec.A`, `spec.B` … `spec.Q` |
| Agent | `agent.<humanName>` | `agent.rebecca`, `agent.iris` |
| Minion | `minion.<id>` | `minion.aldo`, `minion.carlo` |

**Rationale:**
- The class prefix (`orch.`, `spec.`, `agent.`, `minion.`) makes the entity type unambiguous in any log, route param, or error message.
- `spec.<letter>` maps directly to the existing `letter` field in `SPECIALIST_CATALOG` — no new numbering scheme required.
- `orch.gustavo` associates the code with the display name directly, eliminating the `gaspar`/`Gustavo` split in routing contexts.
- Persisted DB IDs remain unchanged — the `entityCode` is a rendering/routing key only, derived at runtime from the existing sources.

---

## Phase 1 — Centralized Entity Registry (Replit-owned)

**Goal:** A single JSON-serializable registry in the portal layer that lists every agent, specialist, minion, and the orchestrator, keyed by `entityCode`. This becomes the single source of truth for portal rendering.

**Blocked by:** Nothing. Can start immediately.

### New file: `artifacts/hospitality-business-portal/src/lib/intelligence-entity-registry.ts`

Shape of each entry:

```ts
export interface EntityRegistryEntry {
  /** Stable class-prefixed code. Never changes after creation. */
  entityCode: string;
  /** Entity class. Used for class-label display and probe routing. */
  class: "orchestrator" | "specialist" | "agent" | "minion";
  /** Display name (the human persona name). */
  humanName: string;
  /** One-line role description shown in admin UI. */
  role: string;
  /** Backend ID used in API calls. For specialists: dotted ID. For orchestrator: ORCHESTRATOR_SPECIALIST_ID constant. */
  backendId: string;
  /** Letter code for specialists (A–Q); null for all other classes. */
  letter: string | null;
  /** Short description for roster cards. */
  description: string;
}
```

The registry is a `readonly EntityRegistryEntry[]` constant. It is assembled at module load time from three sources:

1. **Orchestrator** — one hardcoded entry using values from `ORCHESTRATORS.gustavo` in `agent-taxonomy.ts`. The `backendId` is set to `"gaspar"` initially, and will switch to `"gustavo"` in Phase 3 after the CC rename.

2. **Specialists** — derived by importing `SPECIALIST_CATALOG` from `@engine/analyst/registry/specialist-catalog`. Map each entry to `EntityRegistryEntry` using `{ entityCode: \`spec.\${def.letter}\`, class: "specialist", humanName: def.humanName, role: def.realName, backendId: def.id, letter: def.letter, description: def.subject }`.

3. **Agents** — derived from `AGENTS` in `agent-taxonomy.ts`: `{ entityCode: \`agent.\${key}\`, class: "agent", humanName: entry.humanName, role: entry.role, backendId: key, letter: null, description: entry.secondary }`.

4. **Minions** — derived from `MINIONS` in `agent-taxonomy.ts`: `{ entityCode: \`minion.\${key}\`, class: "minion", ... }`.

Export two utility functions:
- `getEntityByCode(entityCode: string): EntityRegistryEntry | undefined`
- `getEntityByBackendId(backendId: string): EntityRegistryEntry | undefined`

### Changes to existing files

**`artifacts/hospitality-business-portal/src/lib/agent-roster.ts`**
- Refactor `getAgentsRoster()`, `getSpecialistsRoster()`, `getMinionsRoster()` to derive their data from `INTELLIGENCE_ENTITY_REGISTRY` filtered by class.
- Remove any hardcoded entity rows that duplicate what the registry now provides.
- Keep the existing return shapes identical to avoid breaking call sites.

**`artifacts/hospitality-business-portal/src/lib/agent-taxonomy.ts`**
- No structural changes needed yet. The registry imports from here. After Phase 3, update the orchestrator `backendId` reference.

**`artifacts/hospitality-business-portal/src/components/intelligence/agent-roster/AgentRosterAccordion.tsx`**
- Import `getEntityByBackendId` from the registry.
- Replace the `humanizeProbeMessage()` class-label lookup (currently uses a passed-in `entry.class`) with a call to `getEntityByBackendId(entry.id)?.class` to ensure the label always matches the registry truth.
- No visual changes required.

### Acceptance criteria (Phase 1)
- `INTELLIGENCE_ENTITY_REGISTRY` contains exactly 20 entries: 1 orchestrator + 16 specialists + 2 agents + 5 minions (± new entries as the roster grows).
- `getEntityByCode("orch.gustavo")` returns the orchestrator entry.
- `getEntityByCode("spec.A")` returns Ana's entry.
- `getEntityByCode("agent.rebecca")` returns Rebecca's entry.
- `getEntityByCode("minion.aldo")` returns Aldo's entry.
- `pnpm run typecheck` passes.

---

## Phase 2 — Class-Aware Probe Route (Replit-owned)

**Goal:** The orchestrator probe no longer goes through the `/api/admin/specialists/:id/` route. A new class-aware intelligence entity route handles the probe, using `entityCode` to route correctly.

**Blocked by:** Phase 1 (registry must exist before the route can use `getEntityByCode`).

### New file: `artifacts/api-server/src/routes/admin/intelligence-entities.ts`

Route: `POST /api/admin/intelligence/:entityCode/probe`

Logic:
1. Validate `entityCode` against an allow-list derived from the registry (static list or fetched from the portal lib — but since api-server cannot import portal lib, embed a minimal code→backendId map derived at build time, or define the registry in a shared lib). 

> **Implementation decision required:** The api-server and the portal are separate packages. The registry defined in Phase 1 lives in the portal package. Two options:
>
> **Option A (Recommended for speed):** Duplicate the orchestrator's `backendId` and `class` in a small, api-server-local constants file (e.g., `src/routes/admin/intelligence-entity-codes.ts`) that lists only the non-specialist entities (orchestrator, agents) the specialist routes cannot serve. Specialist probes stay on the existing route.
>
> **Option B (Cleaner long-term):** Extract the entity registry into `lib/shared/src/intelligence-entity-registry.ts` so both packages can import it. This requires CC approval since `lib/shared/` is CC-owned.
>
> Proceed with **Option A** initially. Plan Option B as a follow-on task.

Route behavior:
- If `entityCode` starts with `orch.` → proxy to the existing orchestrator probe logic (currently the early-return in `runtime.ts`), returning a pass result.
- If `entityCode` starts with `agent.` → return a formatted pass result (agents don't have backend probe endpoints today; this is a placeholder until agent self-tests exist).
- If `entityCode` starts with `minion.` → invoke the minion self-test (`MINION_SELF_TESTS[minionId]` in `self-tests.ts`).
- All responses include `{ status, class, entityCode, humanName, message }` — never the word "Specialist" for non-specialist entities.

Register in `artifacts/api-server/src/routes/admin/index.ts`.

### Terminology cleanup in existing specialist routes

**`artifacts/api-server/src/routes/admin/specialists/runtime.ts`**
- Change the early-return block for `ORCHESTRATOR_SPECIALIST_ID` to produce a response body with `class: "orchestrator"` and `message: "Gustavo is an orchestrator — routed via intelligence entities endpoint"` (or similar). This documents the asymmetry while the migration is in progress.
- Replace any user-visible error string containing `"Specialist not found"` with a class-aware variant: `"Entity not found"` or use `humanizeProbeMessage()` already in place.

**`artifacts/api-server/src/routes/admin/specialists/_shared.ts`**
- Review all error message strings. Replace `"Specialist"` in any error that could be triggered for non-specialist entities.

**`artifacts/api-server/src/routes/admin/specialists/catalog.ts`**
**`artifacts/api-server/src/routes/admin/specialists/identity.ts`**
**`artifacts/api-server/src/routes/admin/specialists/config.ts`**
**`artifacts/api-server/src/routes/admin/specialists/audit.ts`**
- These routes are specialist-only (the orchestrator never reaches them). No terminology changes needed — these correctly say "Specialist".

### Should `/api/admin/specialists/` be renamed?

**Decision: No rename in this plan.** Renaming would:
- Break all existing API clients and generated hooks.
- Require an OpenAPI spec update, codegen re-run, and client-side hook migration.
- Provide minimal user-visible benefit since the routes only serve specialist-class entities.

**Future consideration:** Once Option B (shared registry in `lib/shared/`) is completed, a route rename to `/api/admin/intelligence/specialists/:id/` could be done as a single coordinated CC+Replit changeset. Defer to a separate ADR.

### Acceptance criteria (Phase 2)
- `POST /api/admin/intelligence/orch.gustavo/probe` returns HTTP 200 with `{ class: "orchestrator", status: "pass" }`.
- `POST /api/admin/intelligence/agent.rebecca/probe` returns HTTP 200 with `{ class: "agent" }`.
- `POST /api/admin/intelligence/minion.aldo/probe` invokes the aldo self-test.
- The existing `POST /api/admin/specialists/:id/probe` continues to work for all 16 specialists.
- No user-facing error message uses the word "Specialist" for the orchestrator.
- `pnpm run typecheck` and `check:lint` pass.

---

## Phase 3 — Orchestrator ID Rename: `"gaspar"` → `"gustavo"` (CC-owned)

**Goal:** Eliminate the code/name split. The orchestrator's internal ID should be `"gustavo"`, matching the display name, so developers can follow the ID in any log or route without a separate lookup.

**Blocked by:** Phase 2 complete. The new intelligence probe route must be live before the specialist route's early-return is changed.

### Files to change (all CC-owned)

**`lib/engine/src/analyst/identity.ts`**
- Change `ORCHESTRATOR_SPECIALIST_ID = "gaspar"` to `ORCHESTRATOR_SPECIALIST_ID = "gustavo"`.
- Add a backward-compat alias for one release: `export const LEGACY_ORCHESTRATOR_ID = "gaspar"`.
- Update the JSDoc comment to explain the alias window.

**`artifacts/api-server/src/routes/admin/specialists/runtime.ts`** (CC scope since it imports from engine)
- Update the early-return check from `=== "gaspar"` to `=== ORCHESTRATOR_SPECIALIST_ID` (which is already done; the rename propagates automatically if the constant is used everywhere rather than inlined).

**DB migration (if applicable)**
- Query `SELECT COUNT(*) FROM specialist_identity_overrides WHERE specialist_id = 'gaspar'` (or equivalent table name).
- If rows exist, add a migration: `UPDATE specialist_identity_overrides SET specialist_id = 'gustavo' WHERE specialist_id = 'gaspar'`.
- Migration must run before the alias is removed in Phase 4.

### Replit follow-on after Phase 3 completes

**`artifacts/hospitality-business-portal/src/lib/intelligence-entity-registry.ts`**
- Update the orchestrator entry's `backendId` from `"gaspar"` to `"gustavo"`.

### Acceptance criteria (Phase 3)
- `ORCHESTRATOR_SPECIALIST_ID` equals `"gustavo"` in all runtime contexts.
- Probe endpoint for orchestrator continues to return pass (verifiable via the Phase 2 route).
- No DB rows reference `gaspar` as a specialist identity (migration verified).
- `pnpm run typecheck` and engine tests pass.

---

## Phase 4 — Alias Removal (CC-owned)

**Goal:** Remove `LEGACY_ORCHESTRATOR_ID = "gaspar"` and any backward-compat fallbacks added in Phase 3.

**Blocked by:** Phase 3 complete + one release cycle gap (to allow any external systems using `gaspar` to migrate).

### Acceptance criteria (Phase 4)
- `"gaspar"` does not appear in any TypeScript source file (verified by `rg "gaspar" --include="*.ts" --include="*.tsx"`).
- All tests pass.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Specialist dotted IDs in DB break if changed | n/a | High | Plan explicitly forbids changing dotted IDs. `entityCode` is a routing-only overlay. |
| Phase 1 registry drifts from `SPECIALIST_CATALOG` | Medium | Medium | Registry derives specialists from `SPECIALIST_CATALOG` at module load — it's a live derivation, not a copy. |
| Phase 2 api-server can't import portal registry (Option A) | Expected | Low | Option A uses a small local constants file for orchestrator/agent codes. Specialist probes stay on existing route. |
| Phase 3 DB rows exist for `gaspar` | Low | Medium | Query before migrating; rollback plan is to revert `ORCHESTRATOR_SPECIALIST_ID` constant. |
| CC and Replit Agent work the same files concurrently | Medium | High | Check `.agents/status/cc.md` before starting each phase. Phase 3 is explicitly CC-owned and must not be started while Replit has an active branch. |

---

## Implementation Sequencing

```
Phase 1 (Replit)          Phase 2 (Replit)         Phase 3 (CC)         Phase 4 (CC)
─────────────────         ─────────────────         ─────────────        ─────────────
Create registry   ──▶     New probe route    ──▶    Rename gaspar  ──▶   Remove alias
Refactor roster           Terminology fixes          DB migration
                                                     Portal update
                                                     (Replit follow-on)
```

Phases 1 and 2 are Replit-owned and can begin immediately. Phases 3 and 4 must be handed off to CC via `.agents/status/replit.md` after Phase 2 is committed.

---

## Key Files Summary

| File | Phase | Owner | Change type |
|---|---|---|---|
| `artifacts/hospitality-business-portal/src/lib/intelligence-entity-registry.ts` | 1 | Replit | New |
| `artifacts/hospitality-business-portal/src/lib/agent-roster.ts` | 1 | Replit | Refactor |
| `artifacts/hospitality-business-portal/src/components/intelligence/agent-roster/AgentRosterAccordion.tsx` | 1 | Replit | Minor update |
| `artifacts/api-server/src/routes/admin/intelligence-entities.ts` | 2 | Replit | New |
| `artifacts/api-server/src/routes/admin/intelligence-entity-codes.ts` | 2 | Replit | New (Option A constants) |
| `artifacts/api-server/src/routes/admin/index.ts` | 2 | Replit | Register new route |
| `artifacts/api-server/src/routes/admin/specialists/runtime.ts` | 2 | Replit | Terminology fix |
| `artifacts/api-server/src/routes/admin/specialists/_shared.ts` | 2 | Replit | Terminology fix |
| `lib/engine/src/analyst/identity.ts` | 3 | CC | `gaspar`→`gustavo` + alias |
| DB migration (table TBD) | 3 | CC | Data migration |
| `artifacts/hospitality-business-portal/src/lib/intelligence-entity-registry.ts` | 3 follow-on | Replit | Update `backendId` |
| `lib/engine/src/analyst/identity.ts` | 4 | CC | Remove alias |

---

## Definition of Done (Full Initiative)

- A developer can grep `"gaspar"` across the entire codebase and find zero results.
- Every admin UI message uses the correct class label: "Orchestrator", "Specialist", "Agent", or "Minion" — never the wrong one.
- The intelligence entity registry is the single place a developer looks to understand what entities exist, their codes, names, and classes.
- The orchestrator probe returns a class-aware response via the intelligence entities route, not the specialist route.
- All existing specialist routes and DB data are unchanged.
- `check:typecheck`, `check:lint`, `test:api-server` all pass.
