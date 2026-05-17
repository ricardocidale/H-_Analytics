# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h old, treat as idle regardless of Status. -->

Updated: 2026-05-17T11:10:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

`27dfa12d` — Move ICP mix definition to admin section

## What Replit Did This Session

**ICP Mix moved to Admin → Management Co.:**
- `CompanyBracketMix.tsx` refactored to export `IcpMixContent` (inner content) + simplified default export
- New `IcpMixTab.tsx` created at `components/admin/model-defaults/IcpMixTab.tsx`
- `ModelDefaultsTab.tsx` gains "ICP Mix" tab between "Company" and "Capital Stack Discipline"
- `Admin.tsx` `MODEL_DEFAULTS_VISIBLE_TABS` updated for `defaults-management-company`
- `IcpMixSummary` removed from `CompanyAssumptions.tsx`

**Breadcrumbs fixed + skill created:**
- `Breadcrumbs.tsx` fully audited against `App.tsx` route table
- Added: `/company/guidance`, `/company/icp-definition`, `/intelligence`, `/lb-slides`, `/structures` (no-id), `photos` + `criteria` property sub-pages
- Removed stale redirect entries: `/voice`, `/compare`, `/timeline`, `/sensitivity`, `/financing`, `/global/research`, `/admin/logos`, `/methodology`, `/research`, `/analysis` (dupe)
- Created `.agents/skills/breadcrumbs/SKILL.md` — canonical breadcrumb map + full update protocol for future route changes

**Gates:** typecheck ✅ production-image ✅

**Pre-existing failures (CC-owned, not introduced):**
- check:lint → no-shadow in `api-server/src/chat/rebecca-tool-impls-slide-factory.ts`
- test:api-server → dispatch, builder-substitution-map, pptx-substitution, slide-6-embed-flow

## Files Replit Owns Right Now

None — session complete, all committed.

## Handoff to CC

None required.

## Pending Replit Work

None.

## Do Not Touch (CC-owned surfaces)

- `lib/engine/src/` — financial engine
- `lib/calc/src/` — financial calculators
- `lib/shared/src/constants*.ts` — shared constants
- `lib/db/src/` — DB schema + constants
- `artifacts/api-server/src/finance/` — finance routes
- `artifacts/api-server/src/report/` — report routes
- `artifacts/api-server/src/migrations/*.ts` — runtime guards
- `artifacts/api-server/src/tests/proof/` and `tests/engine/` — engine tests
