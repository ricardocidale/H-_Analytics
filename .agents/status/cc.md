# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-13T00:00:00Z
Status: idle

## Active Branch

None (last active: `feat/seed-calibration-bracket-defaults`)

## Last Commit on Branch

`6fa406458` — "feat(engine): plan 002 U7 — migrate engine descriptor reads to property-descriptor-accessor"

## What CC Did This Session

- Confirmed taxonomy rules (algorithm calibration stays in TS, SEED_* OK in migration guards, ALL DEFAULT_* are violations)
- Updated `hplus-variable-taxonomy` skill with confirmed decisions
- Updated `agent-memory-files` skill with TODO list discipline section
- Updated `CLAUDE.md` + `replit.md` — taxonomy rules + per-agent TODO sections
- Created `agent-collab-status` skill + these status files

## Files CC Owns Right Now

None — session ended. Branch `feat/seed-calibration-bracket-defaults` is idle.

## Handoff to Replit

**U3 is ready for Replit:** Add refi LTV cap field to `DebtSection.tsx`.
- New column `refi_max_ltv_to_original` is live on `properties` table (migration 0057)
- Wire UI input + save via existing section pattern
- See `replit.md → Open TODOs — Replit Agent`

## Pending CC Work (do NOT touch — CC will handle)

1. Verify `global-assumptions.ts` + `bracket-assignment-minion.ts` don't access removed fields
2. Create `properties-refi-ltv-cap-001.ts` runtime guard
3. Update `icp-brackets-004.ts` header comment (lines 14-17)
4. U6: bracket-default seeding at POST /api/properties
5. U1: re-seed demo properties + Duplex per-entity CONFIRMED overrides
6. U8: verification — IRR 25–30% band + docs
7. Migrate remaining `DEFAULT_*` constants in `lib/shared/src/constants*.ts` (incremental)

## Do Not Touch

- `lib/engine/src/` — financial engine (CC-only per CLAUDE.md §9)
- `lib/calc/src/` — financial calculators (CC-only)
- `artifacts/api-server/src/finance/` — finance routes (CC-only)
- `artifacts/api-server/src/migrations/` — runtime guards (CC-only)
- `lib/db/src/schema/` — DB schema (CC-only)
