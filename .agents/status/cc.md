# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-16T14:00:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

b6cc85d4c  fix(icp): document EMPTY_PORTFOLIO_DEFAULT_MIX weights as algorithm calibration (T1-5)

## What CC Did This Session (2026-05-16 session 2)

T1-4 (DEFAULT_* schema decoupling):
- lib/db/src/schema/properties.ts: removed DEFAULT_EXIT_CAP_RATE, DEFAULT_COMMISSION_RATE,
  DEFAULT_LAND_VALUE_PERCENT, DEFAULT_PROPERTY_INCOME_TAX_RATE from imports; replaced with
  inline numeric literals (0.085, 0.05, 0.25, 0.25) in .default() calls
- Engine fallback removal deferred: LoanParams/PropertyInput types still declare these as
  number | null — making them required would break 20+ proof test fixtures

T1-5 (CodeRabbit PR #147 deferred findings):
- migrations 0064 (lib/db) + 0071 (api-server): fix brand_id FK to explicit ON DELETE RESTRICT
- bracket-assignment-minion.ts: added taxonomy comment confirming EMPTY_MIX_WEIGHT_* as
  algorithm calibration constants (confirmed exception to DEFAULT_* rule)

Vulnerability fix (earlier session):
- Merged PR #156 (norfolk-starter next bump, 14 Dependabot alerts closed)
- Merged PR #157 (esbuild >=0.25.4 override + remove @google-cloud/storage — 2 more alerts)
- Zero open Dependabot alerts

## What's Pending

- T1-4: engine fallback removal (`?? DEFAULT_*`) — blocked on making PropertyInput fields
  non-nullable (requires updating ~20 proof test fixtures first); standalone PR needed
- T1-5 items 2 + 4 (Replit-safe or advisory):
  - analyst-admin-runners-mgmt.ts double-cast (`as unknown as`)
  - property-data.ts SEED_* literals — add source citations

## Handoff to Replit

None — all changes are committed to main. No Replit UI tasks pending.

If Replit wants to pick up T1-5 item 2 (double-cast in analyst-admin-runners-mgmt.ts):
- File: `artifacts/api-server/src/routes/analyst-admin-runners-mgmt.ts` lines 140-143
- Replace `as unknown as` chains with typed adapter functions or explicit type assertions

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
