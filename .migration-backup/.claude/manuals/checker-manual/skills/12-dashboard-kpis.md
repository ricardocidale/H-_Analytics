# Chapter 12: Dashboard & Portfolio KPIs

The Dashboard is the landing page after login. It presents a consolidated, portfolio-wide view of financial performance across all property SPVs. Every number displayed on this page is computed by running the financial engine for each property, aggregating monthly results into annual totals, and rendering them as charts and summary tables.

---

## Tab Structure

The Dashboard is organized into five tabs:

| Tab | Content |
|-----|---------|
| **Portfolio Overview** | KPI summary cards with trend charts and interactive accordions |
| **Consolidated Income Statement** | USALI-aligned profit and loss aggregated across all properties by fiscal year |
| **Consolidated Cash Flow** | ASC 230-compliant statement of cash flows by fiscal year |
| **Consolidated Balance Sheet** | Assets, liabilities, and equity across all SPVs |
| **Investment Analysis** | FCF, FCFE, IRR, and equity multiple per property and portfolio-wide |

---

## Portfolio Overview — Sections & Interactions

The Portfolio Overview uses a collapsible **Accordion** pattern to organize deep data sets into scannable sections. All sections are open by default.

### 1. Investment Performance
Displays headline KPIs with explainer tooltips (ℹ) containing exact formulas:
- **Portfolio IRR**: Internal Rate of Return gauge (uses `irrTube3D` gradient).
- **Equity Multiple (EM)**: Total Distributions / Total Equity.
- **Cash-on-Cash (CoC)**: Annual Cash Flow / Total Equity.
- **Equity Invested**: Total capital deployed.
- **Projected Exit**: Terminal value based on exit cap rate.

### 2. Revenue & ANOI Projection
Interactive chart showing consolidated portfolio growth.
- **Chart Mode Toggle**: Switch between **Area** (filled) and **Line** (outline) views.
- **ANOI (Adjusted Net Operating Income)**: Revenue − OpEx − Mgmt Fees − Insurance − Taxes − FF&E.
- **Styling**: Uses `hsl(var(--chart-n))` tokens with zero hardcoded hex.

### 3. Portfolio Composition
Breakdown of the portfolio by property count, room count, and market diversification. Each row includes an `InfoTooltip` explaining the metric derivation.

### 4. Portfolio Research
Consolidated market benchmarks and AI-driven research takeaways for the selected portfolio.

### 5. Consolidated Insights
High-level automated commentary on portfolio performance and risk factors.

---

## Consolidated Income Statement

This tab aggregates all property-level income statements into a single portfolio profit and loss by fiscal year. Monthly values are summed into annual buckets aligned to the fiscal year start month.

The key line items are:

- **Room Revenue** — the sum of ADR × Occupancy × Rooms × 30.5 per month, per property
- **Event Revenue** — Room Revenue × the event revenue share, per property
- **F&B Revenue** — Room Revenue × the F&B revenue share × (1 + catering boost percentage), per property
- **Other Revenue** — Room Revenue × the other revenue share, per property
- **Total Revenue** — the sum of all revenue streams
- **Operating Expenses** — the sum of all departmental cost rates applied to Total Revenue
- **Gross Operating Profit (GOP)** — Total Revenue minus Operating Expenses
- **Base Management Fee** — Total Revenue × the base management fee rate
- **Incentive Management Fee** — GOP × the incentive management fee rate
- **FF&E Reserve** — Total Revenue × the FF&E cost rate
- **Net Operating Income (NOI)** — GOP minus Management Fees minus FF&E Reserve
- **Debt Service** — monthly principal and interest payments × 12, aggregated
- **Net Income** — NOI minus Debt Service minus Income Tax Provision

Rows are expandable to show sub-line detail.

---

## Consolidated Cash Flow Statement (ASC 230)

This tab presents cash flows in the three-activity format required by ASC 230:

**Cash from Operations (CFO)** includes Net Income plus Depreciation plus Working Capital changes.

**Cash from Investing (CFI)** includes property acquisitions (outflow) and exit/disposition proceeds (inflow).

**Cash from Financing (CFF)** includes equity contributions, loan proceeds, debt repayment (principal), and refinance proceeds.

**Net Change in Cash** equals CFO + CFI + CFF. The Opening Cash Balance carries forward from the prior year closing balance (Year 0 starts at zero), and Closing Cash Balance equals Opening plus Net Change.

---

## Consolidated Balance Sheet

This tab aggregates all property SPV balance sheets into a consolidated view. The fundamental accounting equation must hold in every period:

> Assets = Liabilities + Equity

**Assets** include Land (non-depreciable), Building & Improvements (depreciable), Accumulated Depreciation, and Cash & Cash Equivalents.

**Liabilities** include Acquisition Debt Outstanding and Refinance Debt Outstanding.

**Equity** includes Contributed Equity (initial investment) and Retained Earnings (cumulative net income).

Depreciation is calculated straight-line over 27.5 years per IRS §168 for nonresidential real property. Land is carried at cost and is never depreciated. Land value is computed as the purchase price multiplied by the land value percentage.

---

## Investment Analysis

This tab provides return metrics at the individual property level and portfolio-wide:

**Free Cash Flow (FCF)** equals NOI minus capital expenditures (unlevered).

**Free Cash Flow to Equity (FCFE)** equals FCF minus Debt Service plus Net Borrowings.

**Internal Rate of Return (IRR)** is the discount rate that sets the NPV of equity cash flows to zero, computed via Newton-Raphson iterative solver.

**Equity Multiple** equals Total Distributions divided by Total Equity Invested.

---

## Data Flow: Assumptions to Display

Every number on the Dashboard traces through a clear pipeline: property assumptions (user-configured inputs such as ADR, occupancy, cost rates, and financing) feed into global assumptions (portfolio-wide parameters such as inflation, management fees, and projection years). The financial engine then computes monthly arrays for each property, which are aggregated into fiscal-year buckets. Portfolio-level yearly totals are the sum of all per-property yearly arrays. Finally, charts render the data as line charts (revenue trends) and bar charts (expense breakdowns) for visual presentation.

---

## Verification Notes for Checkers

Every number on the Dashboard should be independently verifiable by exporting property-level data to Excel and summing manually.

| Verification Step | Procedure |
|-------------------|-----------|
| 1. Export individual property data | Navigate to each property's detail page and export to Excel |
| 2. Sum across properties | In Excel, sum each line item across all property worksheets |
| 3. Compare to Dashboard | The manually computed totals must match the Dashboard consolidated figures exactly (to the penny) |
| 4. Check fiscal year alignment | Confirm that monthly-to-annual bucketing respects the configured fiscal year start month |
| 5. Verify chart data | Hover over chart data points and confirm they match the underlying table values |
| 6. Test with zero properties | Remove all properties — Dashboard KPIs should display $0 across all metrics |
| 7. Test single property | With only one property, consolidated totals must equal that property's individual financials exactly |
