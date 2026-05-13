# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-13T23:30:00Z
Status: active

## Active Branch

main

## Last Commit on Branch

`c6018a363` — "feat(db): add refi_max_ltv_to_original column to properties"

## What CC Did This Session

- Slide factory UI design sweep (b5eef369e auto-checkpoint + 2b3b2bed1): FactoryProgressPill + FactoryErrorPill created; LorenzoTab, LuccaTab, AgentsTab, DownloadTab, SlideFactoryPanel all rewritten per plan 2026-05-13-004; CSS keyframe for indeterminate progress added; typecheck + lint + spinner-contrast all pass
- DB migration for `refi_max_ltv_to_original` (c6018a363): schema column added to properties; Drizzle migration 0058 (lib/db) + 0064 (api-server); runtime guard `properties-refi-ltv-cap-001.ts`; wired in startup/migrations.ts; migration-guards check passes

## Files CC Owns Right Now

None — all committed and pushed to branch.

## Handoff to Replit

Branch `feat/financial-defaults-irr-calibration` — all backend work done:
- `refi_max_ltv_to_original` column is now in the DB schema and will be applied at boot
- Column is in `insertPropertySchema` pick list → accepted by PATCH route automatically
- Engine cap was wired in Phase 5 (both refinance paths)

**Replit unblocked items:**
- U3 UI: Add `refiMaxLtvToOriginal` slider to `CapitalStructureSection.tsx` in Refinance Terms block, after Closing Costs — the column exists, the route accepts it, the engine uses it

## Pending CC Work (do NOT touch — CC will handle)

1. Verify `global-assumptions.ts` + `bracket-assignment-minion.ts` don't access removed fields
2. ~~Create `properties-refi-ltv-cap-001.ts` runtime guard~~ ✅ DONE (c6018a363)
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
