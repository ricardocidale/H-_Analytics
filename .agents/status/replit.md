# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h old, treat as idle regardless of Status. -->

Updated: 2026-05-17T11:30:00Z
Status: active

## Active Branch

main

## Last Commit on Branch

`b20c23bf` — Improve layout alignment for pending server update banner

## What Replit Did This Session

**Agent Roster pills redesign:**
- `AgentRosterAccordion.tsx` rebuilt — Radix Accordion replaced with shadcn Collapsible per-row
- Collapsed state: compact pill (rounded-full, single line: dot · name · role · description)
- Expanded state: pill top becomes card header; CollapsibleContent renders full card body below (rounded-b-xl, border continuation)
- Icon import corrected to `@/components/icons/themed-icons` (Phosphor via themed-icons — app standard)
- All three roster pages (Agents, Specialists, Minions) pick up the change automatically

**Gates:** vite compile ✅ lint ✅

**Pre-existing failures (CC-owned, not introduced):**
- check:lint → no-shadow in `api-server/src/chat/rebecca-tool-impls-slide-factory.ts`
- test:api-server → dispatch, builder-substitution-map, pptx-substitution, slide-6-embed-flow

## Files Replit Owns Right Now

- `artifacts/hospitality-business-portal/src/components/intelligence/agent-roster/AgentRosterAccordion.tsx`

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
