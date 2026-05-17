# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h old, treat as idle regardless of Status. -->

Updated: 2026-05-17T13:18:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

(taxonomy registry phase 1+2 — this session)

## What Replit Did This Session

**Brand Assets admin restructure (4-tab layout + super-admin App Logo gate):**

- SECURITY: `PATCH /api/app-branding` in `branding.ts` — `requireAdmin` → `requireSuperAdmin`
- NEW: `components/admin/brand-assets/animationCatalog.tsx` — shared REBECCA_CARDS (7) + ANALYST_CARDS (8); single source of truth for both Brand Assets and Intelligence
- NEW: `components/admin/brand-assets/AnimationFamilyCollapsible.tsx` — Card + Collapsible per-family widget with per-card Play/Pause toggle
- NEW: `components/admin/brand-assets/AnimationsTab.tsx` — two families (Rebecca + The Analyst), both defaultOpen
- NEW: `components/admin/brand-assets/AppLogoTab.tsx` — upload + auto-assign app logo; super-admin only (hidden at parent level for non-super-admins)
- UPDATED: `components/admin/BrandAssetsPage.tsx` — 4-tab structure: App Logo (super-admin only) | Logos | Animations | Other Graphics
- UPDATED: `pages/intelligence/AnimationsPage.tsx` — imports from shared animationCatalog; no duplicate card definitions

**Gates:** typecheck ✅ portal lint ✅ magic-numbers ✅ replit-independence ✅

**Agent taxonomy registry (plan 2026-05-17-005, Phases 1 & 2):**

Phase 1 — Portal-layer entity registry:
- NEW: `artifacts/hospitality-business-portal/src/lib/intelligence-entity-registry.ts`
  — `INTELLIGENCE_ENTITY_REGISTRY` (1 orchestrator + 16 specialists + 2 agents + 5 minions)
  — `entityCode` format: `orch.gustavo`, `spec.A`–`spec.Q`, `agent.rebecca`, `minion.aldo`
  — `getEntityByCode()`, `getEntityByBackendId()` lookup helpers
- UPDATED: `artifacts/hospitality-business-portal/src/lib/agent-roster.ts`
  — Added `entityCode: string` to `RosterEntry` interface
  — `getAgentsRoster()`: looks up entityCode via `getEntityByBackendId()`
  — `getSpecialistsRoster()`: derives `spec.${d.letter}`
  — `getMinionsRoster()`: derives `minion.${m.id}`
- UPDATED: `artifacts/hospitality-business-portal/src/components/intelligence/agent-roster/AgentRosterAccordion.tsx`
  — `CLASS_LABEL.minion`: `"Helper"` → `"Minion"` (terminology fix)
  — Probe routing now uses `entry.entityCode` (orch.* → intelligence endpoint; specialist → specialist endpoint)
  — "Deterministic helper" → "Deterministic minion"

Phase 2 — API-server class-aware probe route:
- NEW: `artifacts/api-server/src/routes/admin/intelligence-entity-codes.ts`
  — `INTELLIGENCE_ENTITY_CODES`, `ENTITY_CODE_MAP`, `ORCHESTRATOR_ENTITY_CODE`
- NEW: `artifacts/api-server/src/routes/admin/intelligence-entities.ts`
  — `POST /api/admin/intelligence/:entityCode/probe` (orchestrators + agents)
- UPDATED: `artifacts/api-server/src/routes/admin/index.ts`
  — Registered `registerIntelligenceEntityRoutes(app)`
- UPDATED: `artifacts/api-server/src/routes/admin/specialists/runtime.ts`
  — ASRT-005 error message now directs callers to intelligence endpoint for non-specialist IDs

CC handoff doc: `docs/handoffs/2026-05-17-cc-taxonomy-phase3.md`

**Gates:** typecheck ✅ magic-numbers ✅ replit-independence ✅ taxonomy-mirror ✅ types-mirror ✅ vite compile ✅

**Pre-existing failures (CC-owned, not introduced):**
- check:lint → no-shadow in `api-server/src/chat/rebecca-tool-impls-slide-factory.ts`
- test:api-server → dispatch, pptx-substitution, marco, slide-6-embed-flow

## Files Replit Owns Right Now

None — session complete, all committed to main.

## Handoff to CC

**Action required:** Execute Phase 3 of plan `docs/plans/2026-05-17-005-agent-taxonomy-registry.md`.

Full details: `docs/handoffs/2026-05-17-cc-taxonomy-phase3.md`

Summary: Rename `ORCHESTRATOR_SPECIALIST_ID` from `"gaspar"` → `"gustavo"` in
`lib/engine/src/analyst/identity.ts`. Add `LEGACY_ORCHESTRATOR_ID = "gaspar"` alias for one
release cycle. Scan for any string literal `"gaspar"` remaining in the codebase. Check DB for
rows using the old ID and migrate if needed. Remove alias in Phase 4.

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
