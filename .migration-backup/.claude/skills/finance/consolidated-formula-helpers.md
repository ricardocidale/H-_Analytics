# Consolidated Formula Helpers — Token-Efficient Accordion Builders

> See also: [consolidation](consolidation.md), [../ui/accordion-formula-rows](../ui/accordion-formula-rows.md), [../ui/calculation-transparency](../ui/calculation-transparency.md)

## Purpose
Reusable helper functions in `client/src/lib/consolidatedFormulaHelpers.tsx` that build multi-level accordion formula rows for consolidated financial statements (Dashboard). These helpers eliminate repetitive per-property iteration code and keep component files small.

## Architecture: Multi-Level Accordion

Consolidated statements use a **3-level accordion** pattern:

```
Level 1 (ExpandableLineItem/ExpandableMetricRow):
  Consolidated total line — e.g., "Total Revenue = $4,200,000"
  ▶ Click to expand...

Level 2 (FormulaDetailRow):
  Weighted/consolidated formula — e.g., "Σ(Room Revenue) / Σ(Sold Rooms) = Weighted ADR"

Level 3 (PropertyBreakdownRow):
  Per-property contributions — e.g., "Hotel Alpha: $150.00 ADR × 85% Occ = $2.1M"
```

### Visual Hierarchy
- **Level 1**: Standard `ExpandableLineItem` or `ExpandableMetricRow` with chevron
- **Level 2**: `FormulaDetailRow` — italic, blue-tinted (`bg-blue-50/40`), small text showing the consolidated formula
- **Level 3**: `PropertyBreakdownRow` — deeper indent (`pl-16`), indigo-tinted (`bg-indigo-50/30`), each property's contribution

Both `FormulaDetailRow` and `PropertyBreakdownRow` are exported from `client/src/components/financial-table-rows.tsx`.

## Exported Helper Functions

### Location
`client/src/lib/consolidatedFormulaHelpers.tsx`

### Income Statement Helpers

#### `consolidatedLineItemBreakdown(field, properties, allPropertyYearlyIS, years)`
Per-property breakdown for any summed field (revenue, expense, NOI, GOP, etc.).
Returns `PropertyBreakdownRow` per property showing the field value.

#### `consolidatedWeightedADR(properties, allPropertyYearlyIS, yearlyConsolidated, weightedMetrics, years)`
Level 2 formula: "Σ(Room Revenue) ÷ Σ(Sold Rooms) = $X.XX"
Level 3: Per-property ADR × sold rooms.
Reads from precomputed `yearlyConsolidated[]` — no re-aggregation.

#### `consolidatedWeightedOccupancy(properties, allPropertyYearlyIS, yearlyConsolidated, weightedMetrics, years)`
Level 2 formula: "Σ(Sold Rooms) ÷ Σ(Available Rooms) = XX.X%"
Level 3: Per-property occupancy with room counts.

#### `consolidatedRevPAR(properties, allPropertyYearlyIS, yearlyConsolidated, weightedMetrics, years)`
Level 2 formula: "Σ(Room Revenue) ÷ Σ(Available Rooms) = $X.XX"
Level 3: Per-property RevPAR with room count context.

### Cash Flow Statement Helpers

#### `consolidatedCashFlowBreakdown(field, properties, allPropertyYearlyCF, years)`
Per-property breakdown for any `YearlyCashFlowResult` field.

#### `consolidatedDSCR(properties, allPropertyYearlyCF, consolidatedNOI, consolidatedDS, years)`
Level 2 formula: "NOI ÷ Total Debt Service = X.XXx"
Level 3: Per-property DSCR.
Accepts precomputed `consolidatedNOI[]` and `consolidatedDS[]` arrays — no re-aggregation.

#### `consolidatedCashOnCash(properties, allPropertyYearlyCF, equityByProperty, consolidatedATCF, totalEquity, years)`
Level 2 formula: "ATCF ÷ Equity Invested = X.X%"
Level 3: Per-property Cash-on-Cash.
Accepts precomputed arrays — no re-aggregation.

## WeightedMetrics Interface

Defined and exported from `consolidatedFormulaHelpers.tsx`:
```tsx
export interface WeightedMetrics {
  weightedADR: number;
  weightedOcc: number;
  revPAR: number;
  totalAvailableRoomNights: number;
}
```
Matches the structure computed in `Dashboard.tsx` `weightedMetricsByYear` useMemo.

## Data Flow

```
Dashboard.tsx (precomputes all data — single source of truth)
  ├── allPropertyFinancials[]     → monthly engine output per property
  ├── allPropertyYearlyIS[]       → aggregatePropertyByYear() per property
  ├── allPropertyYearlyCF[]       → aggregateCashFlowByYear() per property
  ├── yearlyConsolidatedCache[]   → Σ across allPropertyYearlyIS
  └── weightedMetricsByYear[]     → room-night-weighted ADR/Occ/RevPAR

Helpers accept these precomputed arrays → return JSX fragments
  └── No reduce/aggregation inside helpers (zero re-aggregation)
```

## Usage Pattern

```tsx
<ExpandableLineItem
  label="Total Revenue"
  values={yearlyConsolidated.map(y => y.revenueTotal)}
  expanded={isExpanded("totalRevenue")}
  onToggle={() => toggle("totalRevenue")}
>
  {consolidatedLineItemBreakdown("revenueTotal", properties, allPropertyYearlyIS, years)}
</ExpandableLineItem>

<ExpandableMetricRow
  label="Weighted ADR"
  values={weightedMetrics.map(m => `$${m.weightedADR.toFixed(2)}`)}
  expanded={isExpanded("weightedADR")}
  onToggle={() => toggle("weightedADR")}
>
  {consolidatedWeightedADR(properties, allPropertyYearlyIS, yearlyConsolidated, weightedMetrics, years)}
</ExpandableMetricRow>
```

## Token Efficiency Rules

1. **All helpers in one file** — not duplicated per component
2. **Accept precomputed data** — no re-aggregation (use yearlyConsolidated, consolidatedNOI[], etc.)
3. **Return JSX fragments** — drop inside `<ExpandableLineItem>` or `<ExpandableMetricRow>` children
4. **FormulaDetailRow/PropertyBreakdownRow shared** — exported from `financial-table-rows.tsx`
5. **Property iteration centralized** — `properties.map()` happens once in the helper

## Calculation Transparency Integration

All consolidated accordion rows respect `CalcDetailsProvider` context automatically:
- Helpers don't check the toggle — parent `Expandable*` components handle visibility
- Dashboard wraps financial tabs with `<CalcDetailsProvider show={global.showCompanyCalculationDetails ?? true}>`
