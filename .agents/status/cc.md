# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-14T18:20:00Z
Status: idle

## Active Branch

main (7425b26ae — U7 merged)

## Last Commit on Branch

7425b26ae  feat(u7): geography-tier bracket catalog + Davi classifier integration

## What CC Did This Session

- Audited remaining DEFAULT_* constants (all have active call sites — none dead after c7faaead7)
- U7 geography-tier catalog rewrite — shipped on feat/u7-geography-tier-catalog, PR #155
  - bracket-catalog.ts: 5 new bracket IDs (US Tertiary Resort, US Gateway, LATAM Prime Urban, LATAM Rural, LATAM Luxury STR)
  - bracket-assignment-minion.ts: rewired to call Davi per-property, handles null via US Gateway fallback
  - global-assumptions.ts (POST /bracket-mix/assign): queries icpBrackets match rules, passes to assignBrackets
  - icp-brackets-006.ts runtime guard: DELETE 4 old service-profile brackets, UPSERT 5 geography-tier brackets with Layer-2 defaults + match rules
  - startup/migrations.ts: registered icp_brackets_006
  - Typecheck ✅, magic-numbers ✅, migration-guards 63/63 ✅
- Branch cleaned: stripped Replit auto-checkpoint commits + coderabbit-loop noise; PR #155 now contains only U7 product commits

## Files CC Owns Right Now (uncommitted, working tree)

None — all committed and pushed to origin/feat/u7-geography-tier-catalog.

## Plan 001 Status

- U5 (icp_brackets schema columns): DONE ✅
- U6 (applyBracketLayerDefaults seeding pathway): DONE ✅
- U1 (demo property exit-cap overrides): DONE ✅
- U8 (Duplex full-equity refi rule + LTV recalibration): DONE ✅
- U7 FOUNDATION (Davi minion + match-rule columns): DONE ✅ — on main
- U7 CATALOG REWRITE (geography-tier brackets + bracket-assignment-minion): DONE ✅ — on main
- IRR verification (25–30% band): NOT done — prod boot first, then verify

## What's Pending

- Merge feat/u7-geography-tier-catalog → main (typecheck ✅, magic-numbers ✅)
- IRR verification after prod boot (icp-brackets-006 seeds 5 brackets with Davi rules)
- Plan 006 Phase 2 (DEFAULT_* constants migration to DB) — long-term incremental project
  - ~50 ?? DEFAULT_* fallbacks remain in engine/calc layers (§9 protected)
  - Each requires: remove ?? fallback + verify resolver guarantees the value + delete constant

## Handoff to Replit

U7 merged to main (7425b26ae). Next prod boot (Railway) will run `icp_brackets_006`:
- DELETE 4 old service-profile brackets
- UPSERT 5 geography-tier brackets with Davi match rules (atomic transaction)
After boot, verify IRR hits 25–30% band on demo portfolio. Do NOT touch Do Not Touch files below.

## Do Not Touch

- `lib/engine/src/` — financial engine (CC-only per CLAUDE.md §9)
- `lib/calc/src/` — financial calculators (CC-only)
- `artifacts/api-server/src/finance/` — finance routes (CC-only)
- `artifacts/api-server/src/migrations/` — runtime guards (CC-only)
- `lib/db/src/schema/` — DB schema (CC-only)
