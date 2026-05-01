# Property Detail Tab Architecture

## Overview
PropertyDetail page (`client/src/pages/PropertyDetail.tsx`) is a shell (~300 lines of data logic + exports) that delegates rendering to extracted sub-components in `client/src/components/property-detail/`.

## File Map
| File | Purpose | Lines |
|------|---------|-------|
| `types.ts` | Shared prop interfaces for all sub-components | ~90 |
| `PPECostBasisSchedule.tsx` | PP&E / Cost Basis expandable schedule | ~200 |
| `IncomeStatementTab.tsx` | Income Statement chart + YearlyIncomeStatement table | ~100 |
| `CashFlowTab.tsx` | Cash Flow chart (NOI/FCF/FCFE) + YearlyCashFlowStatement | ~120 |
| `PropertyHeader.tsx` | Property image, location, status badge, Map/Assumptions buttons | ~100 |
| `PropertyKPIs.tsx` | KPIGrid with Year 1 metrics (Revenue, GOP, NOI, Cash Flow) | ~45 |
| `index.ts` | Barrel export | ~6 |

## Tab Structure
- **Income Statement** → `IncomeStatementTab` (LineChart + YearlyIncomeStatement)
- **Cash Flows** → `CashFlowTab` (LineChart + YearlyCashFlowStatement)
- **Balance Sheet** → Inline `<ConsolidatedBalanceSheet>` (~8 lines, stays in shell)
- **PP&E / Cost Basis** → `PPECostBasisSchedule` (expandable sections)

## Prop Flow
The shell owns:
- Queries: `useProperty`, `useGlobalAssumptions`
- Computed: `financials` (useMemo), `yearlyChartData`, `yearlyDetails`, `cashFlowDataMemo`
- Refs: `incomeChartRef`, `cashFlowChartRef`, `incomeTableRef`, `cashFlowTableRef`
- State: `activeTab`, `exportDialogOpen`, `exportType`, `incomeAllExpanded`
- Export logic: CSV, Excel, PDF, PPTX, PNG exports (remain in shell due to cross-tab dependencies)

Sub-components receive data via props (no own data fetching).

## Key Interfaces
- `PPECostBasisScheduleProps`: `{ property, global }`
- `IncomeStatementTabProps`: `{ yearlyChartData, yearlyDetails, financials, property, global, projectionYears, startYear, incomeChartRef, incomeTableRef, incomeAllExpanded }`
- `CashFlowTabProps`: `{ yearlyChartData, cashFlowData, yearlyDetails, financials, property, global, projectionYears, startYear, cashFlowChartRef, cashFlowTableRef }`
- `PropertyHeaderProps`: `{ property, propertyId, onPhotoUploadComplete }`
- `PropertyKPIsProps`: `{ yearlyChartData, projectionYears }`

## Import Pattern
```typescript
import {
  PPECostBasisSchedule,
  IncomeStatementTab,
  CashFlowTab,
  PropertyHeader,
  PropertyKPIs,
} from "@/components/property-detail";
```
