# Chapter 3: Property Portfolio

## Overview

Each property in the Hospitality Business portfolio is modeled as an independent Special Purpose Vehicle (SPV) — a single-asset entity consistent with standard real estate private equity fund structures per ASC 810 and GAAP consolidation guidance. Every SPV produces its own complete set of financial statements, enabling both individual property analysis and aggregated portfolio reporting.

The portfolio targets luxury boutique hotels in North America and Latin America, with properties characterized by intimate scale (10–80 rooms), full-service food & beverage operations, and event and catering revenue streams.

---

## Financial Statements per SPV

Each property SPV produces the following GAAP/USALI-aligned financial statements:

| Statement | Standard | Granularity | Key Outputs |
|-----------|----------|-------------|-------------|
| **Income Statement** | USALI 12th Ed. | Monthly → Annual | Room Revenue, F&B Revenue, Event Revenue, GOP, NOI, Net Income |
| **Cash Flow Statement** | ASC 230 | Monthly → Annual | Operating CF, Investing CF, Financing CF, Net Cash Flow |
| **Balance Sheet** | ASC 210 | Monthly → Annual | Total Assets, Total Liabilities, Total Equity (must balance) |
| **Free Cash Flow (FCF)** | Industry standard | Annual | Unlevered FCF, Levered FCF, Cumulative FCF |
| **IRR Analysis** | Industry standard | Over hold period | Levered IRR, Unlevered IRR, Equity Multiple, Cash-on-Cash |

---

## Seed Properties

The model ships with five seeded properties representing the initial target portfolio:

| Property | Location | Rooms | Starting ADR | Purchase Price | Financing Type | Ops Start |
|----------|----------|-------|-------------|---------------|---------------|-----------|
| The Hudson Estate | Upstate New York | 20 | $385 | $3,800,000 | Full Equity (Refi planned) | 2026-12-01 |
| Eden Summit Lodge | Eden, Utah | 20 | $425 | $4,000,000 | Full Equity (Refi planned) | 2027-07-01 |
| Austin Hillside | Austin, Texas | 20 | $320 | $3,500,000 | Full Equity (Refi planned) | 2028-01-01 |
| Casa Medellín | Medellín, Colombia | 30 | $210 | $3,800,000 | Financed (60% LTV) | 2028-07-01 |
| Blue Ridge Manor | Asheville, NC | 30 | $375 | $6,000,000 | Financed (60% LTV) | 2028-07-01 |

All seed properties share common assumptions unless specifically overridden. The default parameters include an ADR growth rate of 2.5% (4.0% for Casa Medellín to reflect the emerging market premium), starting occupancy of 50–55%, maximum occupancy of 78–82%, occupancy growth steps of 5% every 6 months, a 36-month stabilization period, pre-opening costs of $200,000, operating reserve of $250,000, exit cap rate of 8.5%, and a tax rate of 25%.

---

## Acquisition Structures

Properties can be acquired under two capital structures:

| Structure | Description | Equity Required |
|-----------|-------------|----------------|
| **Full Equity** | 100% cash purchase with no acquisition debt | 100% of Total Project Cost |
| **Financed** | Debt plus equity, constrained by LTV ratio | (1 − LTV) × Total Project Cost |

Total Project Cost is calculated as:

> Purchase Price + Building Improvements + Pre-Opening Costs + Operating Reserve + Closing Costs

For financed acquisitions, the loan amount equals the LTV ratio multiplied by the sum of the purchase price and building improvements. Monthly debt service is calculated using the standard amortization PMT function. Closing costs equal the closing cost rate multiplied by the loan amount.

---

## Refinancing

Properties acquired with Full Equity may be refinanced after a stabilization period to return capital to investors. The default refinancing parameters include a 75% LTV ratio, 9% interest rate, 25-year amortization term, and 3% closing cost rate.

The refinancing process proceeds as follows:

1. The property is appraised using the trailing 12-month NOI divided by the cap rate.
2. A new loan is sized at the refinance LTV multiplied by the appraised value.
3. Any existing debt is paid off from refinance proceeds.
4. Net refinance proceeds are distributed to equity investors.
5. New debt service begins from the refinance date forward.

---

## Exit and Disposition

At the end of the projection horizon (default: Year 10), each property is assumed to be sold. Exit valuation uses the direct capitalization method:

| Calculation | Formula |
|-------------|---------|
| Terminal Value | Stabilized NOI ÷ Exit Cap Rate |
| Less: Sales Commission | Terminal Value × Sales Commission Rate (default 5%) |
| Less: Outstanding Debt | Remaining loan balance at exit |
| Less: Capital Gains Tax | (Terminal Value − Adjusted Basis) × Tax Rate |
| **Net Exit Proceeds** | **Terminal Value − Commission − Debt Payoff − Tax** |

Net exit proceeds flow to equity investors and are included in the IRR calculation.

---

## Investor Return Waterfall

Equity investors receive returns through three channels over the hold period:

| Channel | Timing | Source |
|---------|--------|--------|
| FCF Distributions | Ongoing (after debt service) | Levered Free Cash Flow from operations |
| Refinancing Proceeds | At refinance event | Net proceeds after debt payoff and closing costs |
| Exit Proceeds | At disposition (Year 10) | Net sale proceeds after commission, debt payoff, and taxes |

The IRR calculation incorporates all three cash flow streams against the initial equity investment to produce the levered internal rate of return.

---

## Portfolio Aggregation

The system produces both individual SPV financials and consolidated portfolio views. Individual property financials are available on the Property Detail page. Portfolio-level summaries aggregate all SPV line items and are available on the Dashboard and Portfolio pages. The consolidated balance sheet sums all SPV balance sheets, and the portfolio IRR is computed from the aggregate equity-weighted cash flows.

---

## Checker Verification Points

| Check | What to Verify |
|-------|---------------|
| Balance Sheet equation | Assets = Liabilities + Equity for every property, every period |
| Acquisition cost | Total Project Cost = Purchase Price + Improvements + Pre-Opening + Reserve + Closing Costs |
| Debt sizing | Loan Amount ≤ LTV × (Purchase Price + Building Improvements) |
| Fee expenses | Each property's management fee expense matches the global fee rates applied to its revenue and GOP |
| Refinance proceeds | Net proceeds = New Loan − Old Debt Payoff − Closing Costs |
| Exit valuation | Terminal Value = Trailing NOI ÷ Exit Cap Rate |
| IRR inputs | Initial equity outflow + periodic FCF + refi proceeds + exit proceeds |
| Portfolio totals | Sum of individual SPV line items = consolidated portfolio figures |
