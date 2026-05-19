# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h old, treat as idle regardless of Status. -->

Updated: 2026-05-19T20:15:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

feat(intelligence): per-entity LLM info on agent/specialist roster cards

## What Replit Did This Session

**Sidebar UX restructure — ce-plan written:**

- Investigated Iris in depth (IrisPanel.tsx, agent.ts, routes/admin/iris.ts, tools.ts)
- Confirmed Iris is a monitoring/trigger surface only (status + action buttons), same
  shape as Gustavo — no sub-sections, no config depth
- Wrote implementation plan: `docs/plans/sidebar-ux-restructure-2026-05-19.md`

## Files Modified This Session

- `docs/plans/sidebar-ux-restructure-2026-05-19.md` (created)
- `.agents/status/replit.md`

## Handoff to CC

Plan is ready for implementation. See docs/plans/sidebar-ux-restructure-2026-05-19.md.

## Do Not Touch (CC-owned surfaces)

- `lib/engine/src/` — financial engine
- `lib/calc/src/` — financial calculators
- `lib/shared/src/constants*.ts` — shared constants
- `lib/db/src/` — DB schema + constants
- `artifacts/api-server/src/finance/` — finance routes
- `artifacts/api-server/src/report/` — report routes
- `artifacts/api-server/src/migrations/*.ts` — runtime guards
- `artifacts/api-server/src/tests/proof/` and `tests/engine/` — engine tests
