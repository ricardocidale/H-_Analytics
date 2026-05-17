# CC Handoff: Agent Taxonomy Phase 3 — Orchestrator ID Rename

**Date:** 2026-05-17  
**From:** Replit Agent  
**To:** CC (Claude Code Shell)  
**Plan ref:** `docs/plans/2026-05-17-005-agent-taxonomy-registry.md`

---

## What Replit completed (Phases 1 & 2)

### Phase 1 — Centralized Entity Registry (portal)

**New file:** `artifacts/hospitality-business-portal/src/lib/intelligence-entity-registry.ts`

Builds a read-only `INTELLIGENCE_ENTITY_REGISTRY` array (JSON-serializable) containing every entity in the H+ Intelligence system — 1 orchestrator + 16 specialists + 2 agents + 5 minions — each with:

- `entityCode` — stable class-prefixed code (`orch.gustavo`, `spec.A`–`spec.Q`, `agent.rebecca`, `minion.aldo`, etc.)
- `class` — `"orchestrator" | "specialist" | "agent" | "minion"`
- `humanName`, `role`, `backendId`, `letter`, `description`

Derived from existing sources (no duplication): `SPECIALIST_CATALOG`, `ORCHESTRATOR_IDENTITY`, `AGENTS`, `MINIONS`.

Two lookup helpers: `getEntityByCode(entityCode)`, `getEntityByBackendId(backendId)`.

**Updated:** `artifacts/hospitality-business-portal/src/lib/agent-roster.ts`
- Added `entityCode: string` field to `RosterEntry` interface.
- `getAgentsRoster()` — populates `entityCode` via `getEntityByBackendId()`.
- `getSpecialistsRoster()` — populates `entityCode` as `spec.${d.letter}`.
- `getMinionsRoster()` — populates `entityCode` as `minion.${m.id}`.

**Updated:** `artifacts/hospitality-business-portal/src/components/intelligence/agent-roster/AgentRosterAccordion.tsx`
- `CLASS_LABEL.minion` changed from `"Helper"` → `"Minion"` (terminology fix).
- Probe routing now uses `entry.entityCode` instead of checking `entry.id`:
  - `orch.*` → `POST /api/admin/intelligence/:entityCode/probe` (new route)
  - `specialist` class → `POST /api/admin/specialists/:id/probe` (unchanged)
  - `agent.iris` → `GET /api/admin/iris/status` (unchanged)
  - `agent.rebecca` → `GET /api/rebecca/kb/stats` (unchanged)
  - `minion.*` → `POST /api/admin/minions/:id/self-test` (unchanged)
- "Deterministic helper" text → "Deterministic minion".

### Phase 2 — Class-aware probe route (api-server)

**New files:**
- `artifacts/api-server/src/routes/admin/intelligence-entity-codes.ts` — local constants for orchestrator + agent entity codes (Option A: no cross-package import needed).
- `artifacts/api-server/src/routes/admin/intelligence-entities.ts` — registers `POST /api/admin/intelligence/:entityCode/probe`. Handles orchestrators (pass result with class label) and agents (registration confirmation). Returns `{ entityCode, class, humanName, ranAt, status, steps[] }`.

**Updated:**
- `artifacts/api-server/src/routes/admin/index.ts` — registered `registerIntelligenceEntityRoutes(app)`.
- `artifacts/api-server/src/routes/admin/specialists/runtime.ts` — ASRT-005 error message updated: now directs callers to the intelligence entities route if they accidentally hit the specialist probe with a non-specialist ID.

---

## What CC needs to do (Phase 3)

### Goal

Rename `ORCHESTRATOR_SPECIALIST_ID` from `"gaspar"` → `"gustavo"` so the internal code matches the display name, eliminating the split that caused today's probe bug.

### Files to change

**1. `lib/engine/src/analyst/identity.ts`** (line 63)

```ts
// BEFORE
export const ORCHESTRATOR_SPECIALIST_ID = "gaspar" as const;

// AFTER
export const ORCHESTRATOR_SPECIALIST_ID = "gustavo" as const;

/**
 * Backward-compat alias. Present for one release cycle to allow any
 * remaining callers using the string literal "gaspar" to be found and
 * updated. Remove in Phase 4.
 */
export const LEGACY_ORCHESTRATOR_ID = "gaspar" as const;
```

**2. `lib/engine/src/analyst/identity.ts`** — update JSDoc on `ORCHESTRATOR_SPECIALIST_ID`

Change the comment that currently says "Synthetic specialistId reserved for the orchestrator" to clarify the ID now matches the humanName:

```ts
/**
 * Stable orchestrator ID. Used as the synthetic specialistId for admin
 * identity routes. Matches humanName ("gustavo") so it is self-documenting
 * in logs, route params, and error messages.
 *
 * Phase 3: renamed from "gaspar" → "gustavo" (2026-05-17).
 * See docs/plans/2026-05-17-005-agent-taxonomy-registry.md.
 */
export const ORCHESTRATOR_SPECIALIST_ID = "gustavo" as const;
```

**3. Check for string literal `"gaspar"` across the codebase**

```bash
rg '"gaspar"' --include="*.ts" --include="*.tsx" -l
```

Any file using the string literal `"gaspar"` instead of `ORCHESTRATOR_SPECIALIST_ID` must be updated to use the constant. The comment in `_shared.ts` at line 45 is one known case:

- `artifacts/api-server/src/routes/admin/specialists/_shared.ts` line 45:  
  `"Returns the orchestrator default for "gaspar""` → update to `"gustavo"`.

**4. DB migration check**

Run this query to determine whether any rows use the old ID:

```sql
SELECT COUNT(*) FROM specialist_identity_overrides WHERE specialist_id = 'gaspar';
```

(Table name may differ — search for tables with a `specialist_id` column.)

If rows exist, add a migration:

```sql
UPDATE specialist_identity_overrides SET specialist_id = 'gustavo' WHERE specialist_id = 'gaspar';
```

**5. Replit follow-on after Phase 3 is deployed**

After CC's rename is merged and deployed, Replit will update:

- `artifacts/hospitality-business-portal/src/lib/intelligence-entity-registry.ts`  
  The orchestrator entry's `backendId` references `ORCHESTRATOR_SPECIALIST_ID` via the import — it will automatically pick up `"gustavo"` with no manual edit.

- `artifacts/api-server/src/routes/admin/intelligence-entity-codes.ts`  
  Same — imports `ORCHESTRATOR_SPECIALIST_ID`, so it auto-updates.

No manual Replit edits needed for Phase 3 follow-on. Just verify the probe still returns pass after deploy.

---

## Phase 4 (after one release cycle)

Remove `LEGACY_ORCHESTRATOR_ID = "gaspar"` from `lib/engine/src/analyst/identity.ts`.

Verify:
```bash
rg '"gaspar"' --include="*.ts" --include="*.tsx"
# Should return zero results
```

---

## Testing checklist after Phase 3

- [ ] `POST /api/admin/intelligence/orch.gustavo/probe` returns `{ status: "pass", class: "orchestrator" }`
- [ ] `POST /api/admin/specialists/gustavo/probe` returns pass (orchestrator early-return in `runtime.ts` uses `ORCHESTRATOR_SPECIALIST_ID` constant, so it picks up the rename automatically)
- [ ] Admin → Agent Roster → Agents page: Gustavo row probe button returns green
- [ ] `pnpm run typecheck` passes
- [ ] `rg '"gaspar"' --include="*.ts" --include="*.tsx"` returns zero results (except LEGACY_ORCHESTRATOR_ID declaration itself)

---

## Gates Replit verified (Phases 1 & 2)

- `check:typecheck` ✅
- `check:lint:libs` ✅
- `check:magic-numbers` ✅
- `check:replit-independence` ✅

Pre-existing failures (not introduced, CC-owned):
- `test:api-server` → dispatch, marco, pptx-substitution, slide-6-embed-flow
- `check:lint` → no-shadow in `api-server/src/chat/rebecca-tool-impls-slide-factory.ts`
