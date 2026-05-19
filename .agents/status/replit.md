# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h old, treat as idle regardless of Status. -->

Updated: 2026-05-19T19:45:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

feat(intelligence): per-entity LLM info on agent/specialist roster cards

## What Replit Did This Session

**LLM configuration UX improvement — per-entity model info on roster cards:**

- Added `RosterLlmInfo` type + optional `llmInfo` field to `RosterEntry` in `lib/agent-roster.ts`
- Updated `AgentRosterAccordion.tsx` with `VendorChip` + `RosterLlmDisplay` inline components; renders vendor/model badge in expanded card content
- Rewrote `SpecialistsRosterPage.tsx`: fetches `/api/admin/specialists` (hasLlmOverrides) + LLM registry recommendations; merges into cards
- Rewrote `AgentsRosterPage.tsx`: fetches `globalAssumptions` (rebeccaConfig.llm.provider/model) + LLM registry `chat` recommendation; wires llmInfo onto Rebecca's entry
- Removed `SpecialistsSection` import + render from `LlmWorkflowsPage.tsx` (info moved to roster cards); cleaned up docstring and visibility flags

## Files Modified This Session

- `artifacts/hospitality-business-portal/src/lib/agent-roster.ts`
- `artifacts/hospitality-business-portal/src/components/intelligence/agent-roster/AgentRosterAccordion.tsx`
- `artifacts/hospitality-business-portal/src/pages/intelligence/SpecialistsRosterPage.tsx`
- `artifacts/hospitality-business-portal/src/pages/intelligence/AgentsRosterPage.tsx`
- `artifacts/hospitality-business-portal/src/pages/intelligence/LlmWorkflowsPage.tsx`
- `.agents/status/replit.md`

## Handoff to CC

Session complete. All checks pass (typecheck, lint, ui-canonical). CC can resume any work on main.

## Do Not Touch (CC-owned surfaces)

- `lib/engine/src/` — financial engine
- `lib/calc/src/` — financial calculators
- `lib/shared/src/constants*.ts` — shared constants
- `lib/db/src/` — DB schema + constants
- `artifacts/api-server/src/finance/` — finance routes
- `artifacts/api-server/src/report/` — report routes
- `artifacts/api-server/src/migrations/*.ts` — runtime guards
- `artifacts/api-server/src/tests/proof/` and `tests/engine/` — engine tests
