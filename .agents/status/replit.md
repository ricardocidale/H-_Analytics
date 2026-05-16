# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h old, treat as idle regardless of Status. -->

Updated: 2026-05-16T19:00:00Z
Status: handoff-pending

## Active Branch

main

## Last Commit on Branch

feat(admin): standardize CurrentThemeTab across all admin pages, restructure sidebar

## What Replit Did This Session

Admin tab standardization + sidebar restructure (continued from prior session):

**Task 1 — CurrentThemeTab standardization (all horizontal tab menus):**
Converted 9 files from Radix Tabs (Tabs/TabsList/TabsTrigger/TabsContent) to `CurrentThemeTab`:
- ModelDefaultsTab.tsx
- DiagramsTab.tsx
- DataSourcesTab.tsx — also removed unused `cn` + `Badge` imports
- KnowledgeBaseEditor.tsx
- CompanyTab.tsx
- verification/index.tsx
- NotificationsTab.tsx — fixed multi-root Fragment wrappers for channels/rules/vector-latency tabs
- AssetDefinitionTab.tsx — added `activeAssetTab` state
- ResourceDetailDialog.tsx — added `activeTab` state + `useState` import

Pattern: added controlled useState → `<CurrentThemeTab tabs={[...]} activeTab={x} onTabChange={setX}/>` → TabsContent → `{activeTab === "x" && (<div ...>...</div>)}`.

**Task 2 — Admin sidebar restructure:**
- Removed "Brand & Appearance" sidebar group
- Themes and Brand Assets moved into Configuration group
- AdminSidebar.tsx updated accordingly

**Task 3 — Slides menu hidden:**
- Layout.tsx gates Slides link with `!onAdminRoute && !onIntelligenceRoute`

Validation: typecheck ✅ (4/4 packages), portal lint ✅.
Pre-existing lint failure in api-server/src/chat/rebecca-tool-impls-slide-factory.ts (CC-owned no-shadow errors) — not introduced by Replit.

## Files Replit Owns Right Now

None — session complete.

## Handoff to CC

None.

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
