# T2-2 — Portfolio Filter on Portfolio.tsx

**Status:** Ready to implement  
**Date:** 2026-05-19  
**Owner:** Replit-safe (frontend-only; no new backend routes needed)

---

## Objective

Add a portfolio filter dropdown to the property list page so users can view all properties, properties belonging to a specific portfolio, or unassigned properties only.

---

## Background

- `Portfolio.tsx` fetches properties via `useProperties()` (GET /api/properties). Properties already include `portfolioId` (nullable integer). No API change needed.
- `portfolios` is already fetched in the page via a local `useQuery` from GET /api/portfolios.
- The existing `selectedPortfolioId` state controls the *assignment* mutation in the "Unassigned Properties" section — it is separate from the new filter and must be renamed to avoid confusion (see T2-2-A).
- An "Unassigned Properties" section at the bottom (approx. lines 276–340) shows `portfolioId === null` properties and lets users assign them to a portfolio. This section stays functional after the filter is added.
- Filter is client-side only. No debounce or URL persistence needed for this pass.

---

## Scope

**In:**
- New discriminated-union filter state (see T2-2-A)
- `Select` filter component in the `PageHeader` actions slot, before the "Add Property" button
- Client-side derived `filteredProperties` applied to the main `AnimatedGrid`
- Conditional visibility of the "Unassigned Properties" section based on filter value
- Empty state when filter returns no results

**Out:**
- Server-side or URL-persisted filtering
- Multi-portfolio filter (checkbox style)
- Filter on any other page

---

## Implementation Tasks

### T2-2-A — Rename existing state; add typed filter state

The existing `selectedPortfolioId` state is used for the assignment mutation only. Rename it first to avoid shadowing:

```tsx
// Was: const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
const [assignmentTargetPortfolioId, setAssignmentTargetPortfolioId] = useState<number | null>(null);
```

Update all references to `selectedPortfolioId` in the file to `assignmentTargetPortfolioId`.

Add the filter state using a discriminated union to keep the three cases explicit and type-safe:

```tsx
type PortfolioFilter =
  | { type: "all" }
  | { type: "unassigned" }
  | { type: "portfolio"; id: number };

const [portfolioFilter, setPortfolioFilter] = useState<PortfolioFilter>({ type: "all" });
```

A helper to convert to/from the Select string value (Select requires strings):

```tsx
const filterToSelectValue = (f: PortfolioFilter): string => {
  if (f.type === "all") return "all";
  if (f.type === "unassigned") return "unassigned";
  return String(f.id);
};

const selectValueToFilter = (v: string): PortfolioFilter => {
  if (v === "all") return { type: "all" };
  if (v === "unassigned") return { type: "unassigned" };
  return { type: "portfolio", id: Number(v) };
};
```

### T2-2-B — Derive filtered properties

```tsx
const filteredProperties = useMemo(() => {
  const all = properties ?? [];
  if (portfolioFilter.type === "all") return all;
  if (portfolioFilter.type === "unassigned") return all.filter((p) => p.portfolioId == null);
  return all.filter((p) => p.portfolioId === portfolioFilter.id);
}, [properties, portfolioFilter]);
```

`properties ?? []` prevents undefined/loading edge-case errors. Add `useMemo` to the existing React import.

### T2-2-C — Add filter Select in PageHeader actions

Place a `Select` component in the `PageHeader` `actions` prop, **before** `<AddPropertyDialog>`:

```tsx
<Select
  value={filterToSelectValue(portfolioFilter)}
  onValueChange={(v) => setPortfolioFilter(selectValueToFilter(v))}
>
  <SelectTrigger className="w-48 h-9 text-sm" data-testid="select-portfolio-filter">
    <SelectValue placeholder="All portfolios" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All portfolios</SelectItem>
    {portfolios?.map((p) => (
      <SelectItem key={p.id} value={String(p.id)}>
        {p.name}
      </SelectItem>
    ))}
    <SelectItem value="unassigned">Unassigned</SelectItem>
  </SelectContent>
</Select>
```

`portfolios` is already fetched in the page — no new query needed.

### T2-2-D — Apply filter to the main grid

Replace the raw `properties` reference driving the main `AnimatedGrid` with `filteredProperties`. (The existing unassigned-properties section below uses its own derived list — update that derivation to also use `properties ?? []` for consistency, but do not apply `portfolioFilter` to it — the section is shown/hidden instead.)

### T2-2-E — Conditional Unassigned section visibility

Wrap the "Unassigned Properties" section so it only renders when the filter includes unassigned properties:

```tsx
{(portfolioFilter.type === "all" || portfolioFilter.type === "unassigned") && (
  /* existing unassigned section JSX — assignmentTargetPortfolioId refs updated */
)}
```

This prevents showing the unassigned section alongside a specific-portfolio view.

### T2-2-F — Empty state

When `filteredProperties.length === 0` and a specific-portfolio filter is active, render a short empty state:

```tsx
{filteredProperties.length === 0 && portfolioFilter.type === "portfolio" && (
  <p className="text-sm text-muted-foreground py-8 text-center">
    No properties in this portfolio.
  </p>
)}
```

---

## Files

| File | Change |
|---|---|
| `artifacts/hospitality-business-portal/src/pages/Portfolio.tsx` | All changes live here |

---

## Verification Gates

- [ ] `pnpm run typecheck` passes
- [ ] Default view shows all properties and the Unassigned section unchanged
- [ ] Selecting a named portfolio shows only that portfolio's properties; Unassigned section hidden
- [ ] Selecting "Unassigned" shows only unassigned properties; assignment flow still works
- [ ] `assignmentTargetPortfolioId` (formerly `selectedPortfolioId`) — assignment mutation works correctly after rename
- [ ] Empty state renders when a specific portfolio has no properties
- [ ] `check:ui-canonical` passes — no bare `TabsList`/`TabsTrigger` introduced
