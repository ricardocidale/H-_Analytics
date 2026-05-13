# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-13T12:00:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

`e42dd7310` — "fix(coderabbit-loop): move branch-hygiene check to Step 1 preconditions"

## What CC Did This Session

- Patched `coderabbit-loop-review` command: moved branch-hygiene check to Step 1 (precondition) so it fails fast before spending API quota
- Synced patched command to global install and repo; helpers already in sync
- Confirmed `/coderabbit-loop-autofix` is fully implemented — no changes needed; CR bot autofixes iter 1, Claude handles residuals iter 2–4
- Updated cc.md + pushed all accumulated commits to origin/main

## Files CC Owns Right Now

None

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
