# Calculation Transparency Toggle

> See also: [accordion-formula-rows](accordion-formula-rows.md), [help-tooltip](help-tooltip.md), [financial-table-styling](financial-table-styling.md)

## Overview
Two systemwide toggles in Systemwide Assumptions (Other tab) that control whether financial reports show calculation verification details:
- **Management Company Reports** — controls Company page financial statements
- **Property Reports** — controls all property-level financial statements

When ON (default): Tables show `?` help icons, expandable accordion rows with formula breakdowns, and chevron indicators.
When OFF: Tables render clean numbers only — ideal for investor presentations.

## Architecture

### Schema
Two boolean fields on `global_assumptions` table:
- `show_company_calculation_details` (default: true)
- `show_property_calculation_details` (default: true)

### React Context
`CalcDetailsProvider` + `useCalcDetails()` in `client/src/components/financial-table-rows.tsx`.

Wrap financial tables with `<CalcDetailsProvider show={boolean}>` and every child component automatically reads the toggle via `useCalcDetails()`.

### How Components Behave
When `showDetails = false` (via context):
- **SectionHeader, SubtotalRow, LineItem, GrandTotalRow, MetricRow** — hide their `?` tooltip icons
- **ExpandableLineItem** — renders as a plain row (no chevron, no children, no tooltip)
- **ExpandableMetricRow** — renders as a plain metric row (no chevron, no children, no tooltip)

When `showDetails = true` (default):
- All components render normally with full accordion and tooltip functionality

### Wiring Points
- **PropertyDetail.tsx**: Wraps financial tabs with `<CalcDetailsProvider show={global.showPropertyCalculationDetails ?? true}>`
- **Company.tsx**: Wraps financial tabs with `<CalcDetailsProvider show={global.showCompanyCalculationDetails ?? true}>`
- **Settings.tsx** (Systemwide Assumptions > Other tab): Two `<Switch>` components under "Calculation Transparency" card, each with a `?` help icon

### API Type
`GlobalResponse` in `client/src/lib/api.ts`:
```typescript
showCompanyCalculationDetails: boolean;
showPropertyCalculationDetails: boolean;
```

## Key Rules
1. Default is always ON (true) — never change the default
2. The toggle does NOT affect calculations — only display
3. Export dialog "Include formula details" checkbox is independent of this toggle
4. Help icons on Settings/CompanyAssumptions pages are NOT affected (those explain settings, not calculations)
5. Always use `?? true` fallback when reading the toggle to handle legacy data without the column

## MarginRow Behavior
`MarginRow` percentage rows are NOT affected by the calculation transparency toggle. They are always visible because:
- They display standard financial analysis (common-size percentages), not formula breakdowns
- They serve financial managers who expect to see margins alongside subtotals
- They are lightweight (single italic gray row) and don't clutter the presentation

## InfoTooltip vs HelpTooltip in Financial Tables
Financial tables use two distinct tooltip icons:
- **`HelpTooltip` (? icon)**: Controlled by calc transparency toggle. Explains formula breakdowns and calculation methodology. Hidden when toggle is OFF.
- **`InfoTooltip` (ℹ icon)**: NOT controlled by this toggle. Used for read-only values and calculated metrics to explain "what does this mean?" Always visible regardless of toggle state.

See `info-icons.md` for full InfoTooltip documentation.
