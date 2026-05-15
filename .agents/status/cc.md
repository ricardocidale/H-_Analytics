# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-15T23:35:00Z
Status: idle

## Active Branch

main (5cf7fd810 — PR #147 merged)

## Last Commit on Branch

5cf7fd810  feat: plan-002 U3 — accessor-mediated descriptor reads in exports + research (#147)

## What CC Did This Session

- Resolved 25 merge conflicts on feat/replit-plan-002-u3-non-engine-readers (PR #147)
  after PRs #145, #146, #150 all landed on main while #147 was waiting on CI
- Fixed post-merge typecheck errors: duplicate SEED_JANO_GRANDE_ROOM_COUNT,
  duplicate mockup component entry, duplicate JSX className props in
  CompensationSection/FixedOverheadSection/VariableCostsSection
- Merged PR #147 (5cf7fd810) — all 5 backlog PRs now on main

## What's Pending

- Plan 006 Phase 2 (DEFAULT_* constants → DB) — long-term incremental

- U1 (from Plan 2026-05-13-001): re-seed demo properties + Duplex per-entity CONFIRMED overrides via SQL migration

- `refiMaxLtvToOriginal` is dead code for demo properties (all use `purchase_price` basis).
  Not urgent — documented in memory file project-irr-refi.md.

- Deferred CodeRabbit findings from PR #147 (advisory, not yet addressed):
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
