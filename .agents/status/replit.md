# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h old, treat as idle regardless of Status. -->

Updated: 2026-05-17T14:57:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

(analyst-tables nav move + save-button audit plan — this session)

## What Replit Did This Session

**Save-button audit — UnsavedExitDialog infrastructure + wiring (plan 2026-05-17):**

- NEW: `artifacts/hospitality-business-portal/src/components/ui/unsaved-exit-dialog.tsx`
  — 2-button modal: "Save" + "Leave without saving"; renders `isSaving` spinner on Save button
- NEW: `artifacts/hospitality-business-portal/src/hooks/useUnsavedExitGuard.ts`
  — Hook: `{ isDirty, onSave }` → `{ dialogOpen, isSaving, confirmLeave, handleSave, handleLeave, handleCancel }`
  — Registers `beforeunload` listener while dirty; exposes `confirmLeave(cb)` for in-app nav interception
- UPDATED: `artifacts/hospitality-business-portal/src/components/admin/save-state.ts`
  — Added optional `confirmNavigation?: (proceed: () => void) => void` to `AdminSaveState`
- UPDATED: `artifacts/hospitality-business-portal/src/pages/PropertyEdit.tsx`
  — Replace raw `beforeunload` useEffect → `useUnsavedExitGuard`
  — Remove `setLocation(...)` from `finishSave` (stays on page after save)
  — Remove Analyst CTA from header group; reorder header to Cancel | Save (alwaysActive)
  — Reorder sticky footer to Analyst | Cancel | Save (alwaysActive)
  — Render `<UnsavedExitDialog>` wired to `exitGuard`
- UPDATED: `artifacts/hospitality-business-portal/src/components/admin/ModelDefaultsTab.tsx`
  — `useUnsavedExitGuard` wired; tab-change intercepted with `exitGuard.confirmLeave`
  — `<UnsavedExitDialog>` rendered; `confirmNavigation: exitGuard.confirmLeave` passed via `onSaveStateChange`
- UPDATED: `artifacts/hospitality-business-portal/src/hooks/useCompanyAssumptionsForm.ts`
  — Raw `beforeunload` useEffect replaced with `useUnsavedExitGuard({ isDirty, onSave: () => {} })`
- UPDATED: `artifacts/hospitality-business-portal/src/pages/CompanyBracketMix.tsx`
  — `isDirtyBrackets` useMemo computed from `savedMix` vs `selectedSlugs + weights`
  — `useUnsavedExitGuard` wired for `beforeunload` protection (no nav dialog — Save is validation-gated)
- UPDATED: `artifacts/hospitality-business-portal/src/pages/Admin.tsx`
  — `handleNavigate` wraps `setActiveSection`: calls `saveState.confirmNavigation` if set, else navigates directly
  — `SectionContent` now uses `handleNavigate` instead of raw `setActiveSection`

**Gates:** typecheck ✅ portal lint ✅

**Pre-existing failures (CC-owned, not introduced):**
- check:lint → no-shadow in `api-server/src/chat/rebecca-tool-impls-slide-factory.ts`
- test:api-server → dispatch, pptx-substitution, marco, slide-6-embed-flow

**Users page split into Main / Admin sections + role-change super-admin gate:**

- SECURITY: `PATCH /api/admin/users/:id` — any role change now requires super admin (was: only super_admin assignment restricted); code `AUSR-013`
- SECURITY: `PATCH /api/admin/users/:id/role` — same gate; code `AUSR-017`
- UPDATED: `components/admin/UsersTab.tsx` — two labeled sections (Main = role user; Admin = role admin|super_admin), each with count and a `SectionHeader` divider; passes `currentUserRole` to `EditUserDialog`
- UPDATED: `components/admin/users/UserCardGrid.tsx` — new optional `showSortControls` prop (default true); sort bar hidden in Admin section; `currentUserRole` now destructured + used; role badges display human labels ("Super Admin", "Admin", "User")
- UPDATED: `components/admin/users/EditUserDialog.tsx` — new `currentUserRole` prop; role field shows editable Select (user/admin/super_admin) to super admins only; regular admins see read-only role display with "Role changes require super admin" note

**Gates:** typecheck ✅

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

> **[CC note — 2026-05-17, user-authorized one-time edit]** Handoff resolved.
> Phase 3 (`gaspar → gustavo` rename) was executed in CC session 11 (commit `f93cd76e8`) and shipped to main via PR #160 (squash `db246c075`, title "taxonomy Ph1-3"). The original handoff text below is preserved for session-log continuity but is no longer actionable.

**Action required:** ~~Execute Phase 3 of plan `docs/plans/2026-05-17-005-agent-taxonomy-registry.md`.~~ **DONE — shipped in PR #160.**

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
