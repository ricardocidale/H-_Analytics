# Phase 7-C: Constants Specialists admin pages (H–K)

## Doctrine Freeze Gate Check

- **Governing ADR(s):** ADR-001 (two-tier architecture), ADR-003 (AnalystVerdict contract)
- **ADR status:** `Accepted`
- **Last ADR edit:** 2026-04-20
- **Sessions stable:** 3+
- **Gate decision:** ✅ Cleared to execute

---

## Context

Four Constants Specialists (H–K) have been in the catalog with `status: "needs-page"` since
the original analyst architecture landed. Their admin pages already render via the generic
`SpecialistPage` shell, but each page shows a "Specialist not yet wired into the engine"
banner because none of them have a **Constants Owned** surface — the component that shows
which constants they govern, each constant's current effective value, freshness status, and
a "Refresh research" button to trigger the existing `regenerate-constants.ts` flow.

This packet builds and mounts that surface. **No backend changes are needed** — the
`POST /api/admin/model-constants/:key/refresh` endpoint, the `ProvenanceBadge`,
`StaleBadge`, and `RefreshResearchPopover` components already exist and only need to be
assembled into a new card.

After this packet lands, CC flips the catalog status from `"needs-page"` → `"built"` in
`engine/analyst/registry/specialist-catalog.ts` (separate commit in the CC lane).

**Specialist roster and their owned constants:**

| Letter | Name | constantsOwned |
|--------|------|----------------|
| H | Helena (Tax Authority Research) | `taxRate`, `capitalGainsRate`, `costRateTaxes` |
| I | Isadora (Macro Indicators Research) | `countryRiskPremium`, `inflationRate` |
| J | Júlia (Depreciation Schedule Research) | `depreciationYears` |
| K | Kamila (Reporting Conventions Research) | `daysPerMonth`, `ffeReserveBenchmarkUsali` |

---

## Atomic-budget check

- **Sub-step count:** 2 ✅
- **File count:** 2 ✅
- **Capability domains touched:** UI (component), UI (mount) ✅

---

## Tasks

### S1: Create `ConstantsOwnedCard` component

- **Files:**
  - `client/src/pages/admin/specialist/ConstantsOwnedCard.tsx` (new file)

- **Change:** New component that:
  1. Accepts `{ specialistId, ownedKeys: string[] }` props
  2. Queries `GET /api/admin/model-constants?country=United+States` (same query the
     `ModelConstantsTab` uses by default)
  3. Filters the response's `items[]` to those whose `key` appears in `ownedKeys`
  4. Renders a `Card` titled "Constants Owned" with one row per constant showing:
     - Constant display name and description (from the `label` field on `ConstantRow`)
     - Effective value formatted with unit: `formatWithUnit(row.effectiveValue, row.unit)`
     - Provenance badge: `<ProvenanceBadge source={row.source} />`
     - Scope chip: `<ScopeChip scope={row.scope} />`
     - Stale badge when `row.isStale`: `<StaleBadge ...>`
     - Refresh button: `<RefreshResearchPopover row={row} country="United States" subdivision={null} />`
  5. Renders a "View all localities in Constants tab →" link that calls
     `navigateToResources(setLocation, "resources-benchmarks")` (or navigates to `/admin?section=constants`)
  6. Shows a skeleton / loading state while the query is in flight
  7. Renders nothing (returns `null`) when `ownedKeys.length === 0`

  **Mandatory imports — do NOT re-implement these, import the existing versions:**
  ```typescript
  // From constants/_shared.tsx (same package)
  import {
    type ConstantRow, type ApiResponse,
    ProvenanceBadge, StaleBadge, ScopeChip,
    formatWithUnit, formatRelative,
  } from "./tabs/../../../components/admin/model-defaults/constants/_shared";
  // Or use relative path from the new file location:
  // "../../../components/admin/model-defaults/constants/_shared"

  // Existing Refresh popover
  import { RefreshResearchPopover } from
    "../../../components/admin/model-defaults/constants/RefreshResearchPopover";
  ```

  **Data shape reference** (`ConstantRow` from `_shared.tsx`):
  ```typescript
  interface ConstantRow {
    key: string;
    label: string;
    unit: ConstantUnit;
    effectiveValue: unknown;
    source: ResolvedSource;          // "factory" | "analyst" | "manual"
    scope: { locality: "universal" | "country" | "country+state"; ... };
    isStale: boolean;
    lastRefreshedAt: string | null;
    refreshCadenceDays: number | null;
    // … see _shared.tsx for the full shape
  }
  ```

  **Query:**
  ```typescript
  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ["admin-model-constants", "United States", null],
    queryFn: async () => {
      const res = await fetch(
        "/api/admin/model-constants?country=United+States",
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load constants");
      return res.json();
    },
  });
  // Then filter: data?.items.filter(r => ownedKeys.includes(r.key))
  ```

  **`data-testid` requirements (mandatory for acceptance criteria):**
  - `data-testid="card-constants-owned"` — on the outer `Card`
  - `data-testid="constants-owned-row-{key}"` — on each constant row (e.g. `constants-owned-row-taxRate`)
  - `data-testid="constants-owned-loading"` — on the skeleton/loading state
  - `data-testid="link-constants-tab"` — on the "View in Constants tab" link

- **Affected dependency surfaces:** S7 (admin copy)
- **Cross-check invariants:** UI-only; no schema, storage, or route changes. No financial
  mutations → no `invalidateAllFinancialQueries` needed.
- **Acceptance criteria:**
  - [ ] `tsc --noEmit` returns 0 errors
  - [ ] No new lint warnings on `ConstantsOwnedCard.tsx`
  - [ ] Component renders `null` when passed an empty `ownedKeys` array
  - [ ] `data-testid="card-constants-owned"` is present in the DOM when `ownedKeys` is non-empty
  - [ ] `data-testid="constants-owned-row-taxRate"` (and siblings) appear after data loads
  - [ ] `data-testid="constants-owned-loading"` appears while the query is in flight
  - [ ] No inline numeric literals for constant values — all formatting goes through `formatWithUnit`
- **Test impact:** No new test file required for this step. The acceptance criteria above
  verify the component via dev-server inspection. (A future proof test will assert the card
  renders on the H–K pages — CC owns that after the status flip.)
- **Rollback notes:** Revert the commit. No DB or migration changes.

---

### S2: Mount `ConstantsOwnedCard` in `SpecialistPage.tsx`

- **Files:**
  - `client/src/pages/admin/specialist/SpecialistPage.tsx`

- **Change:** Import `ConstantsOwnedCard` and mount it after the `SpecialistToolsICall`
  block (before the `needs-page` Alert banner), gated on `constantsOwned.length > 0`.

  **Exact insertion point** — after line 170 (`<SpecialistToolsICall .../>`):
  ```tsx
  // BEFORE (lines 169-172):
  <SpecialistToolsIBuild specialistId={specialistId} />
  <SpecialistToolsICall specialistId={specialistId} />

  {definition.status === "needs-page" && (
    <Alert ...>

  // AFTER:
  <SpecialistToolsIBuild specialistId={specialistId} />
  <SpecialistToolsICall specialistId={specialistId} />
  {(definition.constantsOwned ?? []).length > 0 && (
    <ConstantsOwnedCard
      specialistId={specialistId}
      ownedKeys={definition.constantsOwned ?? []}
    />
  )}

  {definition.status === "needs-page" && (
    <Alert ...>
  ```

  Also add the import at the top of `SpecialistPage.tsx`:
  ```tsx
  import { ConstantsOwnedCard } from "./ConstantsOwnedCard";
  ```

- **Affected dependency surfaces:** S7 (admin copy)
- **Cross-check invariants:** The `definition.constantsOwned` field is already typed in
  `client/src/pages/admin/specialist/types.ts` (line 120: `constantsOwned?: string[]`).
  No type changes needed.
- **Acceptance criteria:**
  - [ ] `tsc --noEmit` returns 0 errors
  - [ ] No new lint warnings on `SpecialistPage.tsx`
  - [ ] Navigate to `/ai-intelligence?section=specialist-constants-tax-research` in the
    dev server — the `card-constants-owned` card appears with rows for `taxRate`,
    `capitalGainsRate`, and `costRateTaxes`
  - [ ] Navigate to A (Funding) or M (Compensation) — the `card-constants-owned` card
    does NOT appear (they have no `constantsOwned`)
  - [ ] Navigate to H, I, J, K respectively — each shows only its own owned constants
    (Helena: 3 rows; Isadora: 2 rows; Júlia: 1 row; Kamila: 2 rows)
  - [ ] Clicking "Refresh research" on a constant opens the existing `RefreshResearchPopover`
    and can complete a preview without errors
  - [ ] The "needs-page" banner still shows for H–K (CC removes it in the follow-up commit
    when flipping status to "built")
- **Test impact:** No new test file required for this step. Behavioral verification above.
- **Rollback notes:** Revert the commit.

---

## Verification

### Gate commands

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npm run lint` — 0 errors, 0 warnings on touched files
- [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 PASS
- [ ] `npm run test:summary` — all tests PASS
- [ ] `npm run verify:summary` — UNQUALIFIED

### Behavioral verification (run in dev server)

- [ ] `/ai-intelligence?section=specialist-constants-tax-research` — Helena's page shows
  the "Constants Owned" card with 3 rows (taxRate, capitalGainsRate, costRateTaxes)
- [ ] `/ai-intelligence?section=specialist-constants-macro-research` — Isadora shows 2 rows
- [ ] `/ai-intelligence?section=specialist-constants-depreciation-research` — Júlia shows 1 row
- [ ] `/ai-intelligence?section=specialist-constants-reporting-research` — Kamila shows 2 rows
- [ ] `/ai-intelligence?section=specialist-mgmt-co-funding` — Anabela (Funding) shows NO
  "Constants Owned" card
- [ ] Each row shows a provenance badge (factory/analyst/manual), a formatted value, and
  a Refresh research button
- [ ] Clicking Refresh on any row opens the popover without a console error
- [ ] `/admin?section=specialist-constants-tax-research` same result via Admin surface

### Surface-specific verification

- S7 (admin copy): no user-facing strings use forbidden vocabulary terms (verified by vocab gate above)

---

## Out of scope

- **Catalog status flip** (`"needs-page"` → `"built"` for H–K) — CC follow-up commit after
  this packet lands. Do not edit `engine/analyst/registry/specialist-catalog.ts`.
- **Multi-locality selector** — The card shows US-baseline values only. Full locality
  selector (matching ModelConstantsTab's country+subdivision dropdowns) is deferred.
- **Per-specialist refresh flow** — The refresh button triggers the same
  `POST /api/admin/model-constants/:key/refresh` endpoint that ModelConstantsTab uses.
  A specialist-specific evaluator path is deferred.
- **Proof test** for H–K built status — CC authors after the status flip lands.

---

## Surfaces footer template

Every commit from this packet must end with:

```
Surfaces: S7
Packet: .claude/replit-handoffs/p7-c-constants-specialists-page.md
```

---

## Completion report (filled by Replit on exit)

- **Commits:** _
- **Sub-steps PASSED:** _
- **Sub-steps SKIPPED with reason:** _
- **Verification gates PASSED:** _
- **Verification gates SKIPPED with reason:** _
- **Out-of-scope items discovered (filed as BLOCKED or follow-up):** _
- **Session-memory entry added:** ❌
