# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-14T23:55:00Z
Status: idle

## Active Branch

main (712541d25 — Replit checkpoint captured CC changes)

## Last Commit on Branch

712541d25  Fix issue preventing users from disabling the login screen (Replit checkpoint)

## What CC Did This Session

- Diagnosed elevated IRR (53%) on Jano Grande Ranch (IDs 70–72, 76)
  - Root cause: 20 rooms at $250 ADR vs $1.2M purchase price = $60K/room
  - Peer properties (Loch, Belleayre) are at $150–175K/room
  - Created `script/debug-irr-refi.ts` to run per-year cash flow decomposition
- Fixed Jano Grande Ranch revenue assumptions:
  - roomCount 20→8 (calibrated to $150K/room parity)
  - startOccupancy 0.40→0.30 (rural/remote ramp profile)
  - occupancyRampMonths 9→12 (same)
  - Updated `sync-property-assumptions-001.ts` + `seeds/property-data.ts`
  - DB patched directly without server restart
- Post-fix IRR: Jano 25.8%, Loch 28.8%, Belleayre 25.9%, Duplex 12.2% ✅
- Fixed `/api/system/login-config` missing from PUBLIC_API_PATHS in `index.ts`
  (route existed from MOTD feature but was blocked by auth middleware)

## What's Pending

- Open PRs to review/merge: #145, #146, #147, #148, #150

- Plan 006 Phase 2 (DEFAULT_* constants → DB) — long-term incremental

- U1 (from Plan 2026-05-13-001): re-seed demo properties + Duplex per-entity CONFIRMED overrides via SQL migration

- `refiMaxLtvToOriginal` is dead code for demo properties (all use `purchase_price` basis).
  Not urgent — documented in memory file project-irr-refi.md.

## Files CC Owns Right Now

None — all committed.

## Do Not Touch

- `lib/engine/src/` — financial engine (CC-only per CLAUDE.md §9)
- `lib/calc/src/` — financial calculators (CC-only)
- `artifacts/api-server/src/finance/` — finance routes (CC-only)
- `artifacts/api-server/src/migrations/` — runtime guards (CC-only)
- `lib/db/src/schema/` — DB schema (CC-only)
