# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h old, treat as idle regardless of Status. -->

Updated: 2026-05-16T12:33:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

feat(admin): T1-3 assigned-scenario dropdown + T1-2 archived-properties tab

## What Replit Did This Session

T1-3 (assigned scenario dropdown in Edit User dialog):
- admin/types.ts: added assignedScenarioId: number | null to User interface
- admin/users/types.ts: added field to EditUserForm + null default in defaultEditUser
- admin/UsersTab.tsx: scenarios useQuery, assignScenarioMutation, wired into
  handleEditUser/handleEditSubmit, scenarios prop passed to EditUserDialog
- admin/users/EditUserDialog.tsx: scenarios prop, Select dropdown with
  data-testid="select-edit-assigned-scenario"

T1-2 (archived properties restore tab):
- AdminPropertiesTab.tsx (new): fetches archived properties, Restore button per row
- AdminSidebar.tsx: "archived-properties" added to AdminSection union + Portfolio group
- Admin.tsx: lazy import + sectionMeta + switch case

Typecheck: all 4 packages pass clean.

## Files Replit Owns Right Now

None — session complete.

## Handoff to CC

None.

## Pending Replit Work

None.

## Do Not Touch (CC-owned surfaces)

- `lib/engine/src/` — financial engine
- `lib/calc/src/` — financial calculators
- `lib/shared/src/constants*.ts` — shared constants
- `lib/db/src/` — DB schema + constants
- `artifacts/api-server/src/finance/` — finance routes
- `artifacts/api-server/src/report/` — report routes
- `artifacts/api-server/src/migrations/*.ts` — runtime guards
- `artifacts/api-server/src/tests/proof/` and `tests/engine/` — engine tests
