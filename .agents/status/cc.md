# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-16T07:00:00Z
Status: active

## Active Branch

main

## Last Commit on Branch

43b620fb3  refactor(T1-4): migrate DEFAULT_FIXED_COST_ESCALATION_RATE to DB

## What CC Did This Session

T1-1 (security fix — scenario share email leak):
- scenarios.ts: return 404 for unknown email instead of silent 201 + empty shares[]
  (body discrimination leak — attacker could distinguish known/unknown by shares.length)

T1-3 (admin default scenario per user — CC scope complete):
- lib/db/src/schema/auth.ts: added assignedScenarioId (nullable integer, no Drizzle FK to avoid circular import)
- Migrations 0063 (lib/db) + 0070 (api-server) + runtime guard users-assigned-scenario-001.ts
  (ADD COLUMN IF NOT EXISTS + DO $$ FK constraint guard)
- migration-guards.json: added 0069 (pre-existing gap for slide factory) + 0070 (new)
- scenario-helpers.ts: skip auto-create when user.assignedScenarioId != null
- storage/users.ts: updateUserAssignedScenario(id, scenarioId | null)
- routes/helpers.ts: expose assignedScenarioId in userResponse
- routes/admin/users.ts: PATCH /api/admin/users/:id/assigned-scenario

T1-3 Replit scope still needed:
- Admin UI: dropdown on user edit page to select a scenario as the user's default

## What's Pending

- T1-2: Property soft-delete UI toggle — Replit-safe
- T1-3 Replit UI: admin dropdown to assign a scenario to a user
- T1-4: DEFAULT_* constants → model_defaults DB rows (3 done this session: DEFAULT_STABILIZATION_MONTHS, DEFAULT_OCCUPANCY_RAMP_MONTHS ?? fallbacks, DEFAULT_FIXED_COST_ESCALATION_RATE)
- T1-5: CodeRabbit deferred findings from PR #147 (advisory):
  - `brandId` FK `onDelete: "restrict"` needs migration (lib/db/src/schema/properties.ts)
  - `analyst-admin-runners-mgmt.ts` double-cast
  - `bracket-assignment-minion.ts` EMPTY_PORTFOLIO_DEFAULT_MIX
  - `property-data.ts` SEED_* literals

## Files CC Owns Right Now

None — all committed.

## Do Not Touch

- `lib/engine/src/` — financial engine (CC-only per CLAUDE.md §9)
- `lib/calc/src/` — financial calculators (CC-only)
- `artifacts/api-server/src/finance/` — finance routes (CC-only)
- `artifacts/api-server/src/migrations/` — runtime guards (CC-only)
- `lib/db/src/schema/` — DB schema (CC-only)

### Owner-maintained CC skills — DO NOT DELETE OR MODIFY

These four skill files are maintained by the repo owner and have been
restored multiple times after CC sessions wiped them. Treat as read-only.
Do not remove, overwrite, or merge-conflict-resolve them away.

- `.agents/skills/start-here/SKILL.md`
- `.agents/skills/plugin-stack/SKILL.md`
- `.agents/skills/workflows/SKILL.md`
- `.agents/skills/run-workflow/SKILL.md`
