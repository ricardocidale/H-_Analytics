# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-14T04:00:00Z
Status: active

## Active Branch

feat/mgmt-co-fees-phase-1

## Last Commit on Branch

(pending — committing U1 now)

## What CC Did This Session

- Hand-crafted SQL migrations for U1: business_brands multi-flag extension
  - lib/db/migrations/0059_extend_business_brands_multi_flag.sql (idx 59)
  - artifacts/api-server/migrations/0065_extend_business_brands_multi_flag.sql (idx 61)
  - Updated both meta/_journal.json files
- Wrote runtime guard: artifacts/api-server/src/migrations/business-brands-multi-flag-001.ts
- Registered guard in artifacts/api-server/src/startup/migrations.ts
- typecheck ✅, magic-numbers ✅

## Files CC Owns Right Now (uncommitted, working tree)

- `.claude/settings.local.json` — minor tweak
- `docs/plans/2026-05-13-006-feat-mgmt-co-fees-centralization-and-multi-flag-brand-family-plan.md` — added
- `docs/plans/2026-05-13-007-feat-str-specialist-and-pietro-ota-minions-plan.md` — added
- `lib/db/src/schema/core.ts` — businessBrands extended
- `lib/db/src/schema/properties.ts` — FK behavior changed to RESTRICT

## Handoff to Replit

None — do NOT touch lib/db/src/schema/ or artifacts/api-server/src/migrations/ (CC-only surfaces).

## Pending CC Work (do NOT touch — CC will handle)

### Plan 006 Phase 1 — in progress (feat/mgmt-co-fees-phase-1)

**Task list lives in Claude Code task tracker (#1–#6).**

- **U1 (Task #1, complete):** Extend business_brands + data migration — ALL DONE
  - Schema changes: core.ts + properties.ts ✅
  - SQL migrations: 0059 (lib/db) + 0065 (api-server) + both journals ✅
  - Runtime guard: business-brands-multi-flag-001.ts registered in migrations.ts ✅
  - Typecheck ✅, magic-numbers ✅
  - NEXT: migration test (write test validating guard is idempotent)

- **U2 (Task #2):** Create management_company_fees + brand_fees tables + seed
- **U3 (Task #3):** Extend hydratePropertyFinancials + guardrails
- **U4 (Task #4):** Admin UI tabs (can parallel with U5)
- **U5 (Task #5):** Front-app Company Mgmt Co Assumptions tab (can parallel with U4)
- **U6 (Task #6):** Convert ManagementFeesSection to read-only

### Other pending

- U1: re-seed demo properties + Duplex per-entity CONFIRMED overrides (Plan 2026-05-13-001)
- U8: verification — portfolio IRR in 25–30% band + docs

## Do Not Touch

- `lib/engine/src/` — financial engine (CC-only per CLAUDE.md §9)
- `lib/calc/src/` — financial calculators (CC-only)
- `artifacts/api-server/src/finance/` — finance routes (CC-only)
- `artifacts/api-server/src/migrations/` — runtime guards (CC-only)
- `lib/db/src/schema/` — DB schema (CC-only)
