# Financial Table Styling

## Common Patterns

All financial statement tables follow these UI conventions:

- **Theme:** Light theme — white/gray backgrounds (NOT dark glass theme)
- **Container:** `<Card className="overflow-hidden bg-white shadow-lg border border-gray-100">`
- **Table:** shadcn `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow`
- **Currency:** `<Money amount={value} />` component from `@/components/Money`
- **Header row:** `bg-gray-100` with `font-bold text-gray-900`
- **Section headers:** `bg-gray-50` with `font-bold` and colored text (e.g., `text-[#257D41]` for revenue)
- **Subtotal/total rows:** `border-t-2 border-gray-300` with `font-semibold`
- **Negative values:** Shown in parentheses or with minus sign
- **Numeric columns:** Right-aligned (`text-right`), monospaced (`font-mono`)
- **Year columns:** Displayed as column headers with fiscal year labels
- **Line items:** Indented with `pl-10` for detail rows
- **KPI/metric rows:** `text-gray-500` for non-currency display values

---

## Income Statement

**Location:** `client/src/components/YearlyIncomeStatement.tsx`

### Props
- `data: MonthlyFinancials[]` — Monthly financial data array
- `years?: number` — Number of projection years (default 5)
- `startYear?: number` — Starting fiscal year (default 2026)

### Structure

```
┌─────────────────────────────────────────────┐
│ Income Statement    │ Year 1 │ Year 2 │ ... │  ← bg-gray-100 header
├─────────────────────────────────────────────┤
│ Revenue (section)                           │  ← bg-gray-50, text-[#257D41]
│   ADR                                       │  ← pl-10, text-gray-500, KPI
│   Occupancy                                 │  ← pl-10, text-gray-500, KPI
│   RevPAR                                    │  ← pl-10, text-gray-500, KPI
│   Available Rooms                           │  ← pl-10, text-gray-500, KPI
│   Sold Rooms                                │  ← pl-10, text-gray-500, KPI
│   Rooms Revenue                             │  ← pl-10
│   Food & Beverage                           │
│   Events & Conference                       │
│   Other Revenue                             │
│   Total Revenue              ← border-t-2, font-semibold
├─────────────────────────────────────────────┤
│ Operating Expenses (section)                │  ← bg-gray-50
│   Rooms Expense                             │
│   Food & Beverage Expense                   │
│   Events Expense                            │
│   Other Costs                               │
│   Marketing                                 │
│   Property Operations                       │
│   Utilities                                 │
│   Administrative                            │
│   IT & Systems                              │
│   Insurance                                 │
│   Property Taxes                            │
│   FF&E Reserve                              │
│   Total Operating Expenses   ← border-t-2, font-semibold
├─────────────────────────────────────────────┤
│ Management Fees (section)                   │  ← bg-gray-50
│   Base Management Fee                       │
│   Incentive Fee                             │
│   Total Management Fees      ← border-t-2, font-semibold
├─────────────────────────────────────────────┤
│ Gross Operating Profit (GOP) ← bg-gray-50, font-bold, text-[#257D41]
│ Net Operating Income (NOI)   ← bg-gray-100, font-bold, text-[#257D41]
└─────────────────────────────────────────────┘
```

### Percentage Margin Rows (Common-Size Analysis)
Every subtotal row that financial managers review should be followed by a `MarginRow` showing its percentage of a base value (typically Total Revenue). These rows use the shared `MarginRow` component from `financial-table-rows.tsx`.

- **Styling:** `text-xs text-gray-400 italic font-mono` — visually subordinate to value rows
- **Placement:** Immediately after each subtotal (GOP, NOI, Net Income, Total OpEx, Operating CF, FCF, FCFE)
- **Formula:** `(value / base) × 100`, displayed as `XX.X%` or `—` when base is zero
- **Component:** `<MarginRow label="% of Total Revenue" values={...} baseValues={...} />`
- **Balance Sheet:** Uses inline `<tr>` with same styling for Debt-to-Assets and Equity-to-Assets ratios

### Key Styling
- Revenue section header: `text-[#257D41]` (green)
- GOP row: `bg-gray-50 font-bold text-[#257D41]`
- NOI row: `bg-gray-100 font-bold text-[#257D41]`
- Total rows: `border-t-2 border-gray-300 font-semibold`
- Margin/percentage rows: `text-xs text-gray-400 italic font-mono` (see above)

---

## Cash Flow Statement

**Location:** `client/src/components/YearlyCashFlowStatement.tsx`

### Props
- `data: MonthlyFinancials[]` — Monthly financial data
- `property: Property` — Property entity for loan calculations
- `global: GlobalResponse` — Global assumptions
- `years?: number` — Projection years

### Structure (GAAP Indirect Method per ASC 230)

```
┌─────────────────────────────────────────────┐
│ Cash Flow Statement │ Year 1 │ Year 2 │ ... │  ← bg-gray-100 header
├─────────────────────────────────────────────┤
│ ▶ Operating Activities                      │  ← Collapsible section
│   Net Operating Income                      │
│   + Depreciation & Amortization             │
│   Working Capital Changes                   │
│   = Cash from Operations     ← font-semibold│
├─────────────────────────────────────────────┤
│ ▶ Investing Activities                      │  ← Collapsible section
│   Property Acquisitions                     │
│   Capital Expenditures                      │
│   = Cash from Investing      ← font-semibold│
├─────────────────────────────────────────────┤
│ ▶ Financing Activities                      │  ← Collapsible section
│   Debt Proceeds                             │
│   Principal Payments                        │
│   Refinance Proceeds                        │
│   = Cash from Financing      ← font-semibold│
├─────────────────────────────────────────────┤
│ Free Cash Flow (FCF)         ← font-bold    │
│ FCFE                         ← font-bold    │
├─────────────────────────────────────────────┤
│ Balance Check: ✓ or ⚠        ← bottom row   │
└─────────────────────────────────────────────┘
```

### Key Features
- **Collapsible sections:** `ChevronDown` (expanded) / `ChevronRight` (collapsed) icons toggle detail visibility
- **HelpTooltip:** GAAP references (e.g., ASC 230) shown via `<HelpTooltip>` component
- **Balance check:** `CheckCircle` (green) when cash flows balance, `AlertTriangle` (yellow) when they don't
- **Loan calculations:** Uses shared `loanCalculations.ts` module for debt service, refinance, depreciation
- **Cash position analysis:** Tracks monthly cash position to detect shortfalls and suggest operating reserve adjustments

---

## Balance Sheet

**Location:** `client/src/components/ConsolidatedBalanceSheet.tsx`

### Props
- `properties: Property[]` — All properties in portfolio
- `global: GlobalResponse` — Global assumptions
- `allProFormas: { property: Property; data: MonthlyFinancials[] }[]` — All pro formas
- `year: number` — Year to display (1-indexed)

### Structure (Assets = Liabilities + Equity)

```
┌─────────────────────────────────────────────┐
│ Consolidated Balance Sheet — FY 2027        │
├─────────────────────────────────────────────┤
│ ASSETS                       ← bg-gray-50, font-bold
│   Property Value (at cost)                  │
│   Less: Accumulated Depreciation            │  ← negative, 27.5-year straight-line
│   Net Property Value         ← font-semibold│
│   Cash & Operating Reserves                 │
│   Total Assets               ← border-t-2, font-bold
├─────────────────────────────────────────────┤
│ LIABILITIES                  ← bg-gray-50, font-bold
│   Debt Outstanding                          │
│   Total Liabilities          ← border-t-2, font-bold
├─────────────────────────────────────────────┤
│ EQUITY                       ← bg-gray-50, font-bold
│   Initial Equity Investment                 │
│   Retained Earnings                         │
│   Cumulative Cash Flow                      │
│   Total Equity               ← border-t-2, font-bold
├─────────────────────────────────────────────┤
│ Balance Check: Assets = L + E  ← ✓ or ⚠    │
└─────────────────────────────────────────────┘
```

### Key Features
- **Consolidated:** Aggregates across all properties in the portfolio
- **Acquisition-aware:** Only includes entries after a property's acquisition date (skips pre-acquisition years)
- **Depreciation:** 27.5-year straight-line on building value (GAAP for residential real estate)
- **Debt tracking:** Uses shared `getOutstandingDebtAtYear()` for consistent debt calculations (handles both acquisition and refinance loans)
- **Balance check:** Verifies Assets = Liabilities + Equity, shows check/warning indicator
- **Year selector:** Controlled by parent via `year` prop, displays fiscal year label

### Calculation Dependencies
- `calculateLoanParams()` — Initial loan amounts and equity
- `calculateRefinanceParams()` — Refinance proceeds and new loan terms
- `getOutstandingDebtAtYear()` — Debt balance at any year-end
- `calculateYearlyDebtService()` — Interest and principal breakdowns
