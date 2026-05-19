# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h old, treat as idle regardless of Status. -->

Updated: 2026-05-19T13:22:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

Figma skill demo + portal SEED_ constant fix

## What Replit Did This Session

**Figma prototyping skill demonstration (figma-prototyping)**
- Confirmed Replit Figma MCP is Write tier only — `use_figma` (Plugin API executor) unavailable
- Created FigJam flow diagram for Portfolio page interaction flows at https://www.figma.com/board/NUOCu7g0vujsIqV1ElJzo5
- Created blank Figma design file (key `2ZNLoX39bG4jOK41uSt32v`, Norfolk AI Team)
- Produced Prototype Spec Document (skill § "Inspect-only output" fallback):
  `docs/plans/portfolio-prototype-spec.md` — full component inventory, interaction tables,
  flow states, DS gap analysis, and Figma build guide for Portfolio.tsx

**Portal SEED_ constant fix (broken by prior CC retirement campaign)**
- `artifacts/hospitality-business-portal/src/lib/constants.ts` — removed `SEED_TRAVEL_PER_CLIENT`
  and `SEED_IT_LICENSE_PER_CLIENT` from shared re-export block (deleted from `lib/shared/src/constants.ts`
  by CC session 24 retirement campaign); added as local SEED_ constants (values 12000 / 3000 from
  store.ts type annotations) with source citation and §2 Category 5 SEED_ prefix + comment
- `check:production-image` restored to PASS

### Gates
- `check:production-image` ✅ (was failing — now passing)
- `check:magic-numbers` ✅ (2 improvements since baseline)
- `check:lint` ✅
- Portal typecheck ✅

### Still failing (CC territory — not caused by this session)
- `check:typecheck` — api-server `src/seeds/property-data.ts` still references
  `DEFAULT_PROPERTY_INCOME_TAX_RATE` and `DEFAULT_LAND_VALUE_PERCENT` (deleted by CC session 24
  but missed in seed file — §14 violation, CC needs to fix)
- `check:taxonomy-mirror` — CLAUDE.md missing "### Canonical definitions" section (CC work)
- `test:api-server` — pre-existing failures (dispatch, builder-substitution-map, marco, slide-6, pptx)

## Files Replit Owns Right Now

None — session complete.

## Handoff to CC

**Action needed in CC-owned files:**
1. `artifacts/api-server/src/seeds/property-data.ts` — still uses `DEFAULT_PROPERTY_INCOME_TAX_RATE`
   (lines ~338, 399) and `DEFAULT_LAND_VALUE_PERCENT` (line ~677). These were deleted from
   `lib/shared/src/constants.ts` in commit `8c133659c` but the seed file was missed.
   Fix: replace with appropriate seeded values (see retirement runbook or constants-research.ts
   for `RESEARCH_TAX_RATE_25_PCT = 0.25`).
2. CLAUDE.md — `check:taxonomy-mirror` cannot find "### Canonical definitions" section header.

## Do Not Touch (CC-owned surfaces)

- `lib/engine/src/` — financial engine
- `lib/calc/src/` — financial calculators
- `lib/shared/src/constants*.ts` — shared constants
- `lib/db/src/` — DB schema + constants
- `artifacts/api-server/src/finance/` — finance routes
- `artifacts/api-server/src/report/` — report routes
- `artifacts/api-server/src/migrations/*.ts` — runtime guards
- `artifacts/api-server/src/tests/proof/` and `tests/engine/` — engine tests
