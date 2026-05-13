# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-13T15:15:00Z
Status: handoff-pending

## Active Branch

feat/factory-v2-u7-wire

## Last Commit on Branch

`a7e0d1cdc` — "feat(slide-factory): wire U7 PPTX substitution + seed admin_resources source row"

## What CC Did This Session

- Ran CodeRabbit review on Replit's spinner/error-card sweep (committed diff); applied 1 ARIA fix (`OperatingStructureComparison.tsx`)
- Audited R2 canonical files; deleted 25 orphaned past-run outputs
- Extracted bare PPTX template from v7 ZIP → uploaded to R2 at `canonical/lb-6-slide/templates/lb-v7-template.pptx`
- Seeded `admin_resources` source row via migration guard `admin-resources-013.ts`
- Wired U7 PPTX substitution + soffice PDF pipeline in `marco.ts` (post-Marco try/catch block)
- All on new branch `feat/factory-v2-u7-wire`, pushed

## Files CC Owns Right Now

- `artifacts/api-server/src/slides/marco.ts`
- `artifacts/api-server/src/slides/factory-v2-constants.ts`
- `artifacts/api-server/src/migrations/admin-resources-013.ts`
- `artifacts/api-server/src/startup/seeds.ts`

## Handoff to Replit

**U7 PR ready for review:** `feat/factory-v2-u7-wire`

- PPTX template is live in R2 at `canonical/lb-6-slide/templates/lb-v7-template.pptx`
- `admin-resources-013.ts` guard seeds the source row on boot
- U7 block in `marco.ts` runs after Marco completes — PPTX substitution → soffice PDF → upload
- E2E PDF conversion (soffice) only works on Railway — Replit preview will log a U7 error and continue normally (Franco's PDF path is unaffected)
- typecheck ✅ magic-numbers ✅

**Next: open the PR** then Replit can merge after review, or CC can do it next session.

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
