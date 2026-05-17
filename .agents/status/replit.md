# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h old, treat as idle regardless of Status. -->

Updated: 2026-05-17T11:50:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

`b20c23bf` — Improve layout alignment for pending server update banner

## What Replit Did This Session

**Agent Roster pills redesign:**
- `AgentRosterAccordion.tsx` rebuilt — Radix Accordion replaced with shadcn Collapsible per-row
- Icon import corrected to `@/components/icons/themed-icons`

**Agent Roster probe fixes:**
- `runtime.ts`: added ORCHESTRATOR_SPECIALIST_ID early-return so gaspar probe returns 200 pass
- `AgentRosterAccordion.tsx`: `humanizeProbeMessage()` strips HTTP codes/error codes, uses correct class label
- Toast title changed "probe failed" → "check failed"
- Solution doc: `docs/solutions/ui-patterns/agent-roster-probe-messages-2026-05-17.md`
- replit.md updated with probe rules + Recent Changes

**Gates:** typecheck ✅ vite compile ✅

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
