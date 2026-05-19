# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h old, treat as idle regardless of Status. -->

Updated: 2026-05-19T20:30:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

feat(intelligence): per-entity LLM info on agent/specialist roster cards

## What Replit Did This Session

**Sidebar UX restructure — all three IUs shipped:**

IU-A AdminSidebar.tsx:
- "AI" landmark → "Intelligence"
- "Testing & Verification" → "Quality & Audit"; required-fields moved here from Portfolio
- "Configuration" → "Preferences"
- Brand Assets: "Other Graphics" → "Graphics"; brand-themes moved here from System
- System: observability → "Monitoring", activity → "Audit Log", login-settings → "Authentication"

IU-B IntelligenceSidebar.tsx:
- Back-link icon: IconShield → IconArrowLeft
- Iris removed as nav item (still deep-linkable via agent-roster fallback)
- "agents" group renamed "rebecca" (id + label), group id "agents" → "rebecca"
- "Knowledge & Resources" split into "Knowledge & Data" + "Resources"
- Assumption Guidance moved from System → Knowledge & Data
- Animations moved from Knowledge & Resources → Agent Roster
- "LLMs" → "Models"; "Other" sub-item → "Operations"
- "Vector Search Latency" → "Search Performance"
- getGroupForSection fallback: return "agents" → return "rebecca"

IU-C Breadcrumbs.tsx:
- AI_INTEL.label: "AI Intelligence" → "Intelligence"
- LLM section labels updated to "Models · ..."
- vector-bench → "Search Performance"
- Admin: observability/activity/login-settings labels synced

## Files Modified This Session

- `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx`
- `artifacts/hospitality-business-portal/src/components/intelligence/IntelligenceSidebar.tsx`
- `artifacts/hospitality-business-portal/src/components/Breadcrumbs.tsx`
- `docs/plans/sidebar-ux-restructure-2026-05-19.md` (created)
- `.agents/status/replit.md`

## Handoff to CC

Session complete. typecheck + lint both pass. CC can resume any work on main.

## Do Not Touch (CC-owned surfaces)

- `lib/engine/src/` — financial engine
- `lib/calc/src/` — financial calculators
- `lib/shared/src/constants*.ts` — shared constants
- `lib/db/src/` — DB schema + constants
- `artifacts/api-server/src/finance/` — finance routes
- `artifacts/api-server/src/report/` — report routes
- `artifacts/api-server/src/migrations/*.ts` — runtime guards
- `artifacts/api-server/src/tests/proof/` and `tests/engine/` — engine tests
