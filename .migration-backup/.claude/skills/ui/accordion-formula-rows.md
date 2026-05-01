# Accordion Formula Rows — Expandable Calculation Verification

> See also: [calculation-transparency](calculation-transparency.md), [help-tooltip](help-tooltip.md), [financial-table-styling](financial-table-styling.md)

## Purpose
Expandable accordion rows inside financial tables that show step-by-step formula breakdowns when clicked. Used by the checker to verify every line item's calculation chain. The rows display chevron indicators (▶/▼) and expand to reveal `FormulaDetailRow` sub-rows with the full math.

## Components

### ExpandableLineItem
Location: `client/src/components/financial-table-rows.tsx`

Used for expense/revenue line items that can expand to show calculation details.

```tsx
<ExpandableLineItem
  label="Property Operations"
  tooltip="USALI fixed cost: 4.0% of Year 1 base revenue..."
  values={yd.map((y) => y.expensePropertyOps)}
  expanded={isExpanded("propertyOps")}
  onToggle={() => toggle("propertyOps")}
>
  {/* Child rows shown when expanded */}
  <FormulaDetailRow label="Base Mo. Revenue" values={[...]} colCount={years} />
  <FormulaDetailRow label="× Rate" values={[...]} colCount={years} />
  <FormulaDetailRow label="× Escalation" values={[...]} colCount={years} />
  <FormulaDetailRow label="× 12 months" values={[...]} colCount={years} />
</ExpandableLineItem>
```

### ExpandableMetricRow
Location: `client/src/components/financial-table-rows.tsx`

Used for KPI rows (ADR, Occupancy, RevPAR) that can expand to show derivation.

```tsx
<ExpandableMetricRow
  label="ADR Rate"
  values={columns.map((_, i) => `$${adr.toFixed(2)}`)}
  tooltip="Starting ADR × (1 + ADR growth)^year"
  expanded={isExpanded("adr")}
  onToggle={() => toggle("adr")}
>
  <FormulaDetailRow label="Base ADR" values={[...]} colCount={years} />
  <FormulaDetailRow label="× Growth Factor" values={[...]} colCount={years} />
</ExpandableMetricRow>
```

### FormulaDetailRow
Location: `client/src/components/financial-table-rows.tsx` (shared export)

Sub-row rendered inside expanded accordions. Shows one line of a formula chain.
Exported from the shared financial-table-rows module so both property-level and consolidated components can use it.

```tsx
import { FormulaDetailRow } from "@/components/financial-table-rows";

<FormulaDetailRow label="Base ADR" values={[...]} />
```

Note: Legacy local copies still exist in `YearlyIncomeStatement.tsx` and `YearlyCashFlowStatement.tsx`. New code should import from `financial-table-rows.tsx`.

### PropertyBreakdownRow
Location: `client/src/components/financial-table-rows.tsx` (shared export)

Level-3 row for consolidated statements showing a single property's contribution. Deeper indent (`pl-16`) and indigo tint (`bg-indigo-50/30`) to visually distinguish from Level-2 FormulaDetailRow.

```tsx
import { PropertyBreakdownRow } from "@/components/financial-table-rows";

<PropertyBreakdownRow propertyName="Hotel Alpha" values={["$150.00", "$142.00"]} />
```

### Dashboard Accordions
Location: `client/src/components/dashboard/OverviewTab.tsx`

Dashboards wrap major sections in the shadcn `Accordion` component to provide a clean, collapsible interface that is open by default.

```tsx
<Accordion type="multiple" defaultValue={["performance", "projection", "composition", "research", "insights"]}>
  <AccordionItem value="performance">
    <AccordionTrigger>
      <div className="flex items-center gap-2">
        <span>Investment Performance</span>
        <InfoTooltip text="..." formula="..." />
      </div>
    </AccordionTrigger>
    <AccordionContent>
      {/* KPI Cards & Charts */}
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

Sections:
- **performance**: IRR, EM, CoC, Equity Invested, Projected Exit
- **projection**: Revenue & ANOI chart + trend indicators
- **composition**: Property count, room count, market diversification
- **research**: Market-level insights and benchmarks
- **insights**: Consolidated portfolio takeaways

## State Management Pattern

Every component that uses accordion rows follows this pattern:

```tsx
const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
const toggle = (key: string) =>
  setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
const isExpanded = (key: string) => allExpanded || !!expandedRows[key];
```

- `allExpanded` prop (optional) — when `true`, forces all rows open (used during export capture)
- Individual row state is tracked by string key (e.g. `"propertyOps"`, `"adr"`)

## Where Accordion Rows Exist

### Property-Level Income Statement (`YearlyIncomeStatement.tsx`)
- **KPI section**: ADR Rate, ADR Effective, Occupancy, RevPAR
- **Fixed-cost GOP lines**: Property Ops, Utilities (split into variable + fixed), Admin, Insurance, Taxes, IT, Other
- Fixed costs show: Base Monthly Revenue × Rate × Escalation Factor × 12 = Annual total
- Utilities show both variable and fixed portions separately

### Property-Level Cash Flow Statement (`YearlyCashFlowStatement.tsx`)
- Operating Cash Flow and Free Cash Flow sections have expandable breakdowns

### Consolidated Income Statement (`ConsolidatedIncomeStatement.tsx`) — Dashboard
Uses **3-level accordion** architecture:
- **Level 1**: Consolidated total (e.g., "Total Revenue = $4.2M") — `ExpandableLineItem`/`ExpandableMetricRow`
- **Level 2**: Consolidated formula row (e.g., "Σ Room Revenue / Σ Sold Rooms = Weighted ADR") — `FormulaDetailRow`
- **Level 3**: Per-property breakdown rows showing each property's individual contribution with formula chain — `PropertyBreakdownRow`

Expandable sections:
- **KPI metrics**: Weighted ADR, Weighted Occupancy, Portfolio RevPAR with per-property breakdowns
- **Revenue lines**: Each revenue type expandable to show per-property contributions
- **Fixed-cost expenses**: Per-property base × rate × escalation breakdown
- **GOP, NOI**: Per-property breakdowns with individual property values

### Consolidated Cash Flow Statement (`ConsolidatedCashFlowStatement.tsx`) — Dashboard
Same 3-level pattern:
- **Operating Activities**: NOI, depreciation add-back, interest, tax — each expandable to per-property
- **Financing Activities**: Principal payments, refi proceeds — per-property breakdown
- **Cash flow metrics**: DSCR, Cash-on-Cash — per-property contributions

### Helper Functions
Reusable helpers in `client/src/lib/consolidatedFormulaHelpers.tsx`:
- `consolidatedLineItemBreakdown()` — per-property breakdown for any summed IS field
- `consolidatedWeightedADR()` — weighted ADR formula with per-property breakdown
- `consolidatedWeightedOccupancy()` — weighted occupancy formula with per-property breakdown
- `consolidatedRevPAR()` — portfolio RevPAR formula with per-property breakdown
- `consolidatedCashFlowBreakdown()` — per-property breakdown for any CF field
- `consolidatedDSCR()` — DSCR formula with per-property breakdown
- `consolidatedCashOnCash()` — Cash-on-Cash formula with per-property breakdown
See skill: `finance/consolidated-formula-helpers` for full API

## Calculation Transparency Toggle Integration
All accordion components respect the `CalcDetailsProvider` context:
- When `showDetails = false`: ExpandableLineItem/ExpandableMetricRow render as plain rows (no chevron, no children, no tooltip)
- When `showDetails = true`: Full accordion behavior with chevrons, tooltips, and expandable children
- See skill: `calculation-transparency` for toggle details

## Fixed-Cost Formula Logic
The `fixedCostFormulaRows()` function in YearlyIncomeStatement generates per-year formula breakdowns:
- Computes per-month escalation factors based on `opsYear = floor(monthsSinceOps / 12)`
- Shows unique factors when a model year spans two operational years
- Explicitly displays annualization step: `monthly × 12 = annual`
- Uses `(1 + fixedCostEscalationRate)^opsYear` for each operational month

## Export Behavior
When exporting income statement with "Include formula details" checked:
1. Sets `allExpanded = true` on YearlyIncomeStatement
2. Waits 300ms for React to render all expanded rows
3. Captures the table (PDF/PNG)
4. Resets `allExpanded = false`
