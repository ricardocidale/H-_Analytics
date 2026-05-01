# Financial Statement Consolidation

## Source Components
- `client/src/pages/Company.tsx` (`generateCompanyIncomeData`, `generateCompanyCashFlowData`)
- `client/src/components/ConsolidatedBalanceSheet.tsx`
- `client/src/components/ConsolidatedIncomeStatement.tsx` — Dashboard multi-level accordion IS
- `client/src/components/ConsolidatedCashFlowStatement.tsx` — Dashboard multi-level accordion CF
- `client/src/components/InvestmentAnalysis.tsx`
- `client/src/lib/consolidatedFormulaHelpers.tsx` — Reusable formula row builders
- `client/src/lib/cashFlowAggregator.ts`
- `client/src/lib/yearlyAggregator.ts`

---

## Overview

The Hospitality Business platform models multiple property SPVs and one management company. Consolidation aggregates individual property-level financial statements into portfolio-level views, applying cross-entity eliminations where required.

## Consolidated Income Statement

Individual property income statements are aggregated by summing each line item across all active SPVs for each period:

```
Consolidated Revenue        = Σ(Property[i].totalRevenue)       for all active properties
Consolidated Room Revenue   = Σ(Property[i].roomRevenue)
Consolidated F&B Revenue    = Σ(Property[i].fbRevenue)
Consolidated Events Revenue = Σ(Property[i].eventsRevenue)
Consolidated Other Revenue  = Σ(Property[i].otherRevenue)

Consolidated OpEx           = Σ(Property[i].totalOperatingExpenses)
Consolidated GOP            = Σ(Property[i].GOP)
Consolidated Mgmt Fees      = Σ(Property[i].managementFees)
Consolidated FF&E           = Σ(Property[i].ffeReserve)
Consolidated NOI            = Σ(Property[i].NOI)

Consolidated Interest       = Σ(Property[i].interestExpense)
Consolidated Depreciation   = Σ(Property[i].depreciation)
Consolidated Tax            = Σ(Property[i].incomeTax)
Consolidated Net Income     = Σ(Property[i].netIncome)
```

Each property only contributes from its `operationsStartDate` onward. Properties acquired in later years begin contributing in their activation year.

## Consolidated Cash Flow Statement

Cash flows are aggregated across all properties following ASC 230 classification:

```
Consolidated Operating CF   = Σ(Property[i].operatingCashFlow)
  = Σ(Property[i].netIncome + Property[i].depreciation)

Consolidated Investing CF   = Σ(Property[i].investingCashFlow)
  (includes property acquisitions in their respective years)

Consolidated Financing CF   = Σ(Property[i].financingCashFlow)
  = Σ(−Property[i].principalPayment + Property[i].refinanceProceeds)

Consolidated Net Change     = Operating CF + Investing CF + Financing CF
```

The ASC 230 reconciliation check must hold at the consolidated level:
```
Consolidated Total CF = Σ(Property[i].NOI − Property[i].debtService − Property[i].incomeTax)
```

## Consolidated Balance Sheet

The consolidated balance sheet aggregates assets, liabilities, and equity across all property SPVs:

```
CONSOLIDATED ASSETS
  Total Property Value          = Σ(Property[i].purchasePrice + Property[i].buildingImprovements)
  Total Accumulated Depreciation = Σ(Property[i].accumulatedDepreciation)
  Total Net Property Value      = Total Property Value − Total Accumulated Depreciation
  Total Cash Reserves           = Σ(Property[i].operatingReserve)  (for properties past acquisition)
  Total Cumulative Cash Flow    = Σ(Property[i].cumulativeCashFlow)
  ─────────────────────────────────────────────────
  TOTAL ASSETS                  = Net Property Value + Cash Reserves + Cumulative Cash Flow

CONSOLIDATED LIABILITIES
  Total Debt Outstanding        = Σ(Property[i].debtOutstanding)
  ─────────────────────────────────────────────────
  TOTAL LIABILITIES

CONSOLIDATED EQUITY
  Total Initial Equity          = Σ(Property[i].equityInvested)
  Total Retained Earnings       = Σ(Property[i].cumulativeNetIncome)
  Total Refinance Proceeds      = Σ(Property[i].cumulativeRefinanceProceeds)
  ─────────────────────────────────────────────────
  TOTAL EQUITY                  = Total Assets − Total Liabilities
```

The `ConsolidatedBalanceSheet.tsx` component iterates over all properties, skipping any not yet acquired (`year < acqYear`), and sums each balance sheet line item.

### Balance Sheet Check
```
TOTAL ASSETS = TOTAL LIABILITIES + TOTAL EQUITY
```
This must hold at the consolidated level within rounding tolerance ($1).

## Cross-Entity Eliminations

### Management Fee Elimination
Management fees create an inter-entity transaction:
- **Property SPV side:** Management fees are an EXPENSE (deducted between GOP and NOI)
- **Management Company side:** Management fees are REVENUE

In a true consolidated view (combining properties + management company), these must net to zero:
```
Σ(Property[i].managementFeeExpense) = ManagementCompany.feeRevenue

Elimination Entry:
  DR  Management Company Fee Revenue
  CR  Property Management Fee Expense
  Net Effect: $0 in consolidated P&L
```

**Note:** Fee rates (`baseManagementFeeRate`, `incentiveManagementFeeRate`) are defined per-property, not as a single global rate. Each property may have different fee rates (defaults: 5% base, 15% incentive from `shared/constants.ts`). The elimination check must still hold: the sum of all per-property fee expenses must equal the management company's total fee revenue.

If these do not match, there is a fee linkage error that must be investigated.

## Portfolio-Level Metrics

### Portfolio IRR
The portfolio IRR treats all properties as a single investment:
```
cashFlows[0] = −Σ(Property[i].equityInvestment)   for properties acquired in Year 0
cashFlows[t] = Σ(Property[i].FCFE[t])              for all active properties in year t
             − Σ(Property[j].equityInvestment)     for properties acquired in year t
cashFlows[N] += Σ(Property[i].exitValue[N])         terminal values in final year
```

The `InvestmentAnalysis.tsx` component constructs this consolidated cash flow array and passes it to `computeIRR()`.

### Portfolio NOI
```
Portfolio NOI = Σ(Property[i].NOI)   for each period
```
Used for portfolio-level DSCR, debt yield, and valuation.

### Portfolio RevPAR
```
Portfolio RevPAR = Σ(Property[i].roomRevenue) ÷ Σ(Property[i].availableRooms)
```
Weighted average across all properties.

## Multi-Level Accordion Architecture (Dashboard)

The Dashboard consolidated statements use a 3-level accordion to provide the same formula verification depth as property-level statements:

### Level 1 — Consolidated Total
Standard `ExpandableLineItem` or `ExpandableMetricRow` showing the portfolio-wide total.
Example: "Total Revenue = $4,200,000"

### Level 2 — Consolidated Formula
`FormulaDetailRow` showing how the consolidated number is derived.
Example: "Weighted ADR = Σ(Room Revenue) / Σ(Sold Rooms) = $3,150,000 / 21,000 = $150.00"

### Level 3 — Per-Property Breakdown
`PropertyBreakdownRow` (or additional `FormulaDetailRow` with property name prefix) showing each property's individual contribution with its own formula chain.
Example:
```
Hotel Alpha:  $155.00 ADR × 87% Occ × 80 rooms × 366 nights = $1,750,000
Hotel Beta:   $142.00 ADR × 82% Occ × 60 rooms × 366 nights = $1,400,000
```

### Data Dependencies
```
Dashboard.tsx (precomputes all data)
  ├── allPropertyFinancials[]     → monthly engine output
  ├── allPropertyYearlyIS[]       → aggregatePropertyByYear() per property
  ├── allPropertyYearlyCF[]       → aggregateCashFlowByYear() per property
  ├── yearlyConsolidatedCache[]   → Σ across allPropertyYearlyIS
  └── weightedMetricsByYear[]     → room-night-weighted ADR/Occ/RevPAR

Helper functions in consolidatedFormulaHelpers.tsx accept these pre-computed arrays
and return JSX fragments ready to place inside Expandable* components.
```

### Key Design Decisions
1. **No re-aggregation** — helpers receive pre-computed data, never call aggregatePropertyByYear() themselves
2. **FormulaDetailRow shared** — exported from `financial-table-rows.tsx`, not duplicated
3. **Property-level formulas match property pages** — same escalation logic, same rate display
4. **Toggle-transparent** — helpers don't check CalcDetailsProvider; parent Expandable* handles visibility

See skill: `finance/consolidated-formula-helpers` for helper function API.

## Validation Rules

1. **Consolidated Balance Sheet must balance:** `Total Assets = Total Liabilities + Total Equity`
2. **Fee linkage must reconcile:** `Σ(Property fees) = Management Company revenue`
3. **Consolidated cash flow reconciliation:** `Operating CF + Investing CF + Financing CF = Net Change in Cash`
4. **Property count consistency:** Number of properties contributing to consolidated statements must match active property count for each period
5. **No double-counting:** Each property's financials appear exactly once in the consolidation
