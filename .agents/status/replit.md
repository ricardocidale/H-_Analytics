# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-13T14:15:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

sweep: replace all page-level spinners/error cards with floating states

## What Replit Did This Session

Completed full spinner/error-card sweep across the portal:
- Added `PageLoadingState` and `PageErrorState` shared components (previous session)
- Replaced all full-page `<Layout>`-wrapped spinners/error blocks across 11 pages:
  Company, CompanyResearch, Portfolio, Scenarios, PropertyPhotos, PropertyEdit,
  CompanyGuidance, PropertyResearchCriteria, CompanyAssumptions, CompanyBracketMix
  (loading + error → PageLoadingState / PageErrorState throughout)
- PropertyEdit: fixed both the isLoading, !property, and !draft spinner blocks
- OperatingStructureComparison: replaced `<Alert variant="destructive">` with compact
  inline chip (icon + text + retry link) — no more large red error card
- KnowledgeRegistryPage, SpecialistsDirectoryPage, SlideFactoryDetail: replaced
  Loader2 spinners in sub-components with skeleton shimmer bars; error text made muted

## Files Replit Owns Right Now

None — session complete.

## Handoff to CC

(none pending)

## Pending Replit Work

- U3: Add refi LTV cap field to `DebtSection.tsx` — see `replit.md → Open TODOs — Replit Agent`

## Do Not Touch (CC-owned surfaces)

- `lib/engine/src/` — financial engine
- `lib/calc/src/` — financial calculators
- `lib/shared/src/constants*.ts` — shared constants
- `lib/db/src/` — DB schema + constants
- `artifacts/api-server/src/finance/` — finance routes
- `artifacts/api-server/src/report/` — report routes
- `artifacts/api-server/src/migrations/*.ts` — runtime guards
- `artifacts/api-server/src/tests/proof/` and `tests/engine/` — engine tests
