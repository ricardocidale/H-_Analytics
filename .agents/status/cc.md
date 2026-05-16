# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-16T11:00:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

43b620fb3  refactor(T1-4): migrate DEFAULT_FIXED_COST_ESCALATION_RATE to DB

## What CC Did This Session

T1-1 (security fix — scenario share email leak):
- scenarios.ts: return 404 for unknown email instead of silent 201 + empty shares[]

T1-3 CC scope (admin default scenario per user):
- lib/db/src/schema/auth.ts: assignedScenarioId column
- Migrations 0063 + 0070, runtime guard users-assigned-scenario-001.ts
- storage/users.ts: updateUserAssignedScenario + session select
- routes/helpers.ts: assignedScenarioId in userResponse
- routes/admin/users.ts: PATCH /api/admin/users/:id/assigned-scenario

T1-4 (DEFAULT_* → model_defaults): DEFAULT_STABILIZATION_MONTHS, DEFAULT_OCCUPANCY_RAMP_MONTHS (engine paths), DEFAULT_FIXED_COST_ESCALATION_RATE

Replit completed same session:
- T1-3 UI: "Default Scenario" dropdown in EditUserDialog (admin/types.ts, users/types.ts, UsersTab.tsx, EditUserDialog.tsx)
- T1-2: AdminPropertiesTab.tsx + AdminSidebar.tsx "Archived" entry + Restore button

## What's Pending

- T1-4: remaining DEFAULT_* constants (incremental, CC only)
- T1-5: CodeRabbit deferred findings from PR #147 (advisory):
  - `brandId` FK `onDelete: "restrict"` needs migration (lib/db/src/schema/properties.ts)
  - `analyst-admin-runners-mgmt.ts` double-cast
  - `bracket-assignment-minion.ts` EMPTY_PORTFOLIO_DEFAULT_MIX
  - `property-data.ts` SEED_* literals

## Handoff to Replit

Full handoff doc: `.local/tasks/replit-handoff-2026-05-16.md`

Two tasks for Replit (frontend only, no backend changes needed):

**T1-3 UI** — Add "Assigned Default Scenario" Select dropdown to `EditUserDialog`.
- Files: `admin/types.ts`, `admin/users/types.ts`, `admin/UsersTab.tsx`, `admin/users/EditUserDialog.tsx`
- API: `PATCH /api/admin/users/:id/assigned-scenario { scenarioId: number | null }` (CC already built this)

**T1-2** — Restore flow for archived properties in the admin panel.
- API: `POST /api/admin/properties/:id/restore` (already exists)
- Scope: find or create an admin properties list; add Restore button per archived row.

Typecheck gate: `pnpm run typecheck` must pass clean after both tasks.

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
