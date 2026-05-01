# Company Tab Components

Extracted from `client/src/pages/Company.tsx` into `client/src/components/company/`.

## Files

| File | Purpose |
|------|---------|
| `types.ts` | Shared prop interfaces: `CompanyTabProps`, `CompanyBalanceSheetProps`, `CompanyHeaderProps`, `CompanyChartDataPoint`, `CompanyCashAnalysis` |
| `CompanyIncomeTab.tsx` | Income Statement table with expandable rows (service fees, incentive fees, opex breakdowns) |
| `CompanyCashFlowTab.tsx` | Statement of Cash Flows with operating/financing/net sections |
| `CompanyBalanceSheet.tsx` | Balance Sheet with assets/liabilities/equity sections (single-column layout) |
| `CompanyHeader.tsx` | PageHeader + KPIGrid + tab navigation + FinancialChart + InsightPanel |
| `index.ts` | Barrel export |

## Shared Helper

`client/src/lib/financial/analyzeCompanyCashPosition.ts` — cash position analysis utility (extracted from inline function).

## Usage Pattern

```tsx
import { CompanyHeader, CompanyIncomeTab, CompanyCashFlowTab, CompanyBalanceSheet } from "@/components/company";
import { analyzeCompanyCashPosition } from "@/lib/financial/analyzeCompanyCashPosition";
```

## Props

All tab components receive `CompanyTabProps`:
- `financials` — `CompanyMonthlyFinancials[]`
- `properties`, `global` — query data
- `projectionYears` — number of years
- `expandedRows` / `toggleRow` — accordion state
- `getFiscalYear` — fiscal year label function
- `fundingLabel` — configurable funding source label
- `tableRef` / `activeTab` — for PNG export targeting
- `propertyFinancials` — per-property financials for fee breakdown

`CompanyBalanceSheet` has its own props with `bsExpanded` / `setBsExpanded` instead of `expandedRows`.

`CompanyHeader` receives `exportMenuNode` as a React node to render the export dropdown.

## Key Behaviors

- All `data-testid` attributes preserved exactly from original
- Accordion expand/collapse via `expandedRows` Set and `toggleRow` callback
- Service fee breakdown drills into categories → properties (3-level hierarchy)
- Cash flow outflows shown in parentheses `(amount)` format
- Balance sheet uses IIFE pattern for cumulative calculations
