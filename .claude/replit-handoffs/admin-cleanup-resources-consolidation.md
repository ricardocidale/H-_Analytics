# Phase Admin-Cleanup-7: Consolidate Resources sidebar (4 leaves → 1 entry, internal tabs)

`AI Intelligence → Resources` has 5 sidebar leaves: APIs, Sources, Market Data, Benchmarks, Models. Four of them (APIs, Sources, Benchmarks, Models) render the same `<ResourcesTab>` component with a different `kind=` prop. This packet collapses them to ONE sidebar entry with an internal `<Tabs>` switcher, matching the RebeccaAdminTabs pattern.

Market Data stays as a separate leaf because it renders a different component (`MarketDataTablesPage`).

## Doctrine Freeze Gate Check (MANDATORY)

- **Gate decision:** ✅ Cleared — UX cleanup

## Context (MANDATORY)

`.claude/audits/admin-intelligence-inventory.md` flagged the 4-way duplication. Each leaf today is a 1-line redirect to `<ResourcesTab kind="X" />` — clicking through the sidebar is a worse UX than internal tabs because:
1. The 4 entries clutter the sidebar
2. Switching between APIs ↔ Sources ↔ Benchmarks ↔ Models takes 2 clicks instead of 1
3. The user has to remember which kind lives where

The fix: one "Resources" sidebar entry → wrapper component with 4 `<Tabs>` panes, each rendering `<ResourcesTab kind=... />`.

## Atomic-budget check (MANDATORY)

- **Sub-step count:** 4 ✅
- **File count:** 3 ✅ (sidebar + page + new wrapper component)
- **Capability domains touched:** UI ✅

## Tasks (MANDATORY)

### S1: Create a wrapper component with internal tabs

- **Files:**
  - `client/src/components/admin/resources/ResourcesAdminPage.tsx` (NEW)
- **Change:** New file. Wrapper that hosts a 4-tab `<Tabs>` and renders `<ResourcesTab>` per tab. Skeleton:
  ```tsx
  import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
  import { lazy, Suspense } from "react";
  const ResourcesTab = lazy(() => import("./ResourcesTab"));

  type ResourceKind = "api" | "source" | "benchmark" | "model";

  interface ResourcesAdminPageProps {
    initialKind?: ResourceKind;
  }

  export default function ResourcesAdminPage({ initialKind = "api" }: ResourcesAdminPageProps) {
    return (
      <Tabs defaultValue={initialKind} className="space-y-4">
        <TabsList>
          <TabsTrigger value="api"       data-testid="tab-resources-apis">APIs</TabsTrigger>
          <TabsTrigger value="source"    data-testid="tab-resources-sources">Sources</TabsTrigger>
          <TabsTrigger value="benchmark" data-testid="tab-resources-benchmarks">Benchmarks</TabsTrigger>
          <TabsTrigger value="model"     data-testid="tab-resources-models">Models</TabsTrigger>
        </TabsList>
        <Suspense fallback={null}>
          <TabsContent value="api"><ResourcesTab kind="api" /></TabsContent>
          <TabsContent value="source"><ResourcesTab kind="source" /></TabsContent>
          <TabsContent value="benchmark"><ResourcesTab kind="benchmark" /></TabsContent>
          <TabsContent value="model"><ResourcesTab kind="model" /></TabsContent>
        </Suspense>
      </Tabs>
    );
  }
  ```
- **Affected dependency surfaces:** S1 (UI)
- **Cross-check invariants:** Per `cross-check-invariants.md` — Suspense fallback + lazy import preserves the existing code-split boundary in `AiIntelligence.tsx` line 32.
- **Acceptance criteria:**
  - [ ] File exists with the structure above
  - [ ] `tsc --noEmit` 0 errors
  - [ ] `npm run lint` 0/0 on the new file
- **Rollback notes:** Delete the file.

### S2: Update sidebar — collapse 4 leaves into 1

- **Files:**
  - `client/src/components/ai-intelligence/AiIntelligenceSidebar.tsx`
- **Change:**
  1. In the Resources NavGroup (search for `label: "Resources"`), replace the four entries (`resources-apis`, `resources-sources`, `resources-benchmarks`, `resources-models`) with ONE entry:
     ```tsx
     { value: "resources",            label: "Catalog",     icon: IconLayers,
       tooltip: "APIs, Sources, Benchmarks, and Models — wire-up registry for Specialists" },
     ```
     Keep `resources-tables` (Market Data) — that's a different page.
  2. In the `AiIntelligenceSection` union (line 53-66), replace the four `"resources-*"` literals with a single `"resources"` literal. Keep `"resources-tables"`.
- **Affected dependency surfaces:** S1 (UI)
- **Cross-check invariants:** TypeScript compile errors will surface in AiIntelligence.tsx (case statements for the dropped literals); fix in S3.
- **Acceptance criteria:**
  - [ ] Sidebar shows: Catalog, Market Data (2 entries under Resources, down from 5)
- **Rollback notes:** Restore from git.

### S3: Update page routing

- **Files:**
  - `client/src/pages/AiIntelligence.tsx`
- **Change:**
  1. Import the new wrapper at top:
     ```tsx
     const ResourcesAdminPage = lazy(() => import("@/components/admin/resources/ResourcesAdminPage"));
     ```
     Remove the existing `const ResourcesTab = lazy(...)` line if no other case uses it (search the file — `resources-tables` uses `MarketDataTablesPage`, not `ResourcesTab`, so this should be safe).
  2. Replace the 4 case branches:
     ```tsx
     case "resources-apis":       return <ResourcesTab kind="api" />;
     case "resources-sources":    return <ResourcesTab kind="source" />;
     case "resources-benchmarks": return <ResourcesTab kind="benchmark" />;
     case "resources-models":     return <ResourcesTab kind="model" />;
     ```
     with one:
     ```tsx
     case "resources":            return <ResourcesAdminPage />;
     ```
  3. In the `pageMeta` map (around line 62), replace the four resources-* entries with one:
     ```tsx
     "resources":             { title: "Resources · Catalog", subtitle: "APIs, Sources, Benchmarks, and Models registries." },
     ```
     Keep `"resources-tables"`.
- **Affected dependency surfaces:** S1 (UI)
- **Cross-check invariants:** TypeScript compiles; if any other file references the dropped literals, surface them.
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` 0 errors
  - [ ] No `resources-apis | resources-sources | resources-benchmarks | resources-models` literal anywhere except (a) legacy redirect maps if any, (b) `client/src/lib/admin-nav.ts` if it has a redirect (check via grep)
- **Rollback notes:** Restore from git.

### S4: Run gates + behavioral check

- **Acceptance criteria:**
  - [ ] `npm run test:file -- tests/proof/admin-surface-coverage.test.ts` PASS (T1 will need the new "resources" value in the sidebar to map to a case branch — already covered)
  - [ ] AI Intelligence → Resources → Catalog loads with 4 tabs (APIs / Sources / Benchmarks / Models)
  - [ ] Each internal tab renders the corresponding ResourcesTab
  - [ ] AI Intelligence → Resources → Market Data still loads
  - [ ] No console errors

## Verification (MANDATORY)

- [ ] `npm run check` — 0 errors
- [ ] `npm run lint` — 0/0
- [ ] `npm run test:summary` — PASS
- [ ] `npm run verify:summary` — UNQUALIFIED
- [ ] Resources sidebar shows: Catalog, Market Data (2 leaves, down from 5)
- [ ] Catalog page shows 4 internal tabs working

## Out of scope (MANDATORY)

- **Merging Market Data into Catalog.** The audit recommended a separate consideration of folding Resources → Benchmarks INTO MarketDataTablesPage; that's a different packet (`admin-cleanup-benchmarks-into-market-data.md`).
- **Removing the dropped section literals from any legacy URL redirect maps.** If they exist (search `client/src/lib/admin-nav.ts`), leave them — they support old bookmarks.

## Surfaces footer template (MANDATORY)

```
Surfaces: S1
Packet: .claude/replit-handoffs/admin-cleanup-resources-consolidation.md
```
