# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-16T06:10:00Z
Status: idle

## Active Branch

main (d3dde140f — slide-factory PPTX batching fix committed)

## Last Commit on Branch

d3dde140f  fix(slide-factory): batch table_cell ops per shape + rebuild-pptx route + overflow bypass

## What CC Did This Session

T0-3 (slide factory pptxR2Key=null fix):
- Fixed builder-substitution-entries.ts: corrected code→template slide number mapping
  (Sofia=2, Bianca=4, Chiara=5, Dario=1, Elisa=3, Felix=6) and DEFAULT_SHAPE_NAMES
  from python-pptx inspection of the v7 template
- Added `rebuild-pptx` route (POST /api/lb-slides/factory/runs/:id/rebuild-pptx):
  reassembles PPTX from luccaDraft for complete runs with null pptxR2Key
- Fixed pptx-substitution.ts: batched all table_cell entries per shape into one
  setTableData call (applyTableCellsBatched) — resolves sliceRows corruption
- Added skipOverflowCheck + requiredSlideNumbers options to substituteSlots
- Made soffice unavailability graceful (PPTX-only upload fallback)
- Fixed deckR2Key aliasing so GET /download works (ADV-003)
- Run 10 verified: Table 4 → 4 rows × 3 cols, all 6 slides, all text substitutions correct
- Committed migration 0069 (pptxR2Key + pdfR2Key columns)
- /ce-compound: documented the setTableData batching bug at
  docs/solutions/logic-errors/pptx-automizer-table-cell-batching-1x1-corruption-2026-05-16.md
  + added 4th constraint to pptx-substitution-library-decision-2026-05-11.md

## What's Pending

- T1-1 through T1-5 (master plan 2026-05-16) — blocked behind T0-3, now unblocked
- Plan 006 Phase 2 (DEFAULT_* constants → DB) — long-term incremental
- Deferred CodeRabbit findings from PR #147 (advisory):
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
