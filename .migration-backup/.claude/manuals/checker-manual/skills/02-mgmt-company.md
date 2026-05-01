# Chapter 2: Management Company Entity

## Overview

The Management Company (referred to as "Hospitality Business Company" in the default configuration) is a hospitality management services company. It is not a property owner or real estate holding company. Its business model follows the asset-light hotel management paradigm common among independent hospitality operators, per AHLA industry classification.

The Management Company earns revenue exclusively from management fees charged to the property SPVs it manages. It does not hold real property on its balance sheet, does not earn room revenue, and does not directly operate hotel departments.

---

## Revenue Model — Management Fees

The Management Company's sole revenue source is management fees, structured as two components consistent with standard Hotel Management Agreement (HMA) terms:

| Fee Type | Calculation Basis | Default Rate | USALI Classification |
|----------|------------------|-------------|---------------------|
| **Base Management Fee** | Percentage of property Total Revenue | 8.5% | Management Fee — Base (USALI Schedule 1) |
| **Incentive Management Fee** | Percentage of property Gross Operating Profit (GOP) | 12% | Management Fee — Incentive (USALI Schedule 1) |

Several key rules govern fee calculation:

- Fees are calculated per property, per month, based on that property's operating results.
- Fees are only charged for months when the property is operational (after the operations start date).
- The Incentive Management Fee is only earned when GOP is positive. If GOP is negative, the incentive fee for that period is zero.
- Both fee rates are configurable as global assumptions on the Systemwide Assumptions page.

---

## Fee Linkage — Dual-Entry Flow

Management fees create a dual-entry linkage between the two entity types. This is the most critical cross-entity validation point for the checker.

On the property side, both the Base and Incentive Management Fees appear as operating expenses on the property's income statement, classified below the GOP line per USALI convention. On the Management Company side, these same amounts appear as fee revenue — the company's top-line income.

The verification rule is straightforward: the sum of all property management fee expenses must equal the Management Company's total fee revenue for every period. Any variance indicates a calculation error.

---

## Funding — SAFE Notes

The Management Company is funded primarily by private equity investors via SAFE (Simple Agreement for Future Equity) notes, a Y Combinator-originated instrument commonly used in early-stage venture financing.

The default SAFE funding parameters are:

| Parameter | Default Value | Description |
|-----------|--------------|-------------|
| Tranche 1 Amount | $800,000 | First tranche of SAFE funding |
| Tranche 1 Date | 2026-06-01 | Disbursement date for Tranche 1 |
| Tranche 2 Amount | $800,000 | Second tranche of SAFE funding |
| Tranche 2 Date | 2027-04-01 | Disbursement date for Tranche 2 |
| Valuation Cap | $2,500,000 | Maximum pre-money valuation for SAFE conversion |
| Discount Rate | 20% | Discount rate applied to conversion price |

### Mandatory Business Rule: Funding Gate

The Management Company cannot operate before SAFE funding is received. This is a hard business rule enforced by the financial engine. The company operations start date (default: 2026-06-01) must be on or after the first SAFE tranche date. If the company operations start date precedes the first SAFE tranche date, the engine will not generate revenue or incur operating expenses for the Management Company during the unfunded period.

The funding gate ensures that no management fees are collected before funding, no staff are hired before capital is available, and no fixed overhead (office lease, insurance) is incurred before the company is capitalized.

---

## Expense Structure

Management Company expenses are organized into four categories.

### 1. Partner Compensation

Partner compensation is configurable per year across the 10-year projection. The default schedule escalates the total annual compensation pool from $540,000 in Years 1–3 to $900,000 by Year 10, with 3 partners in all years. The compensation is subject to a $30,000 per month cap per partner as a reasonableness constraint. Monthly partner cost equals the annual pool divided by 12.

### 2. Staff Compensation

Staff headcount is determined by a tiered staffing model based on the number of operational properties in the portfolio:

| Tier | Max Properties | FTE Headcount | Description |
|------|---------------|--------------|-------------|
| Tier 1 | ≤ 3 | 2.5 FTE | Startup phase — lean team |
| Tier 2 | ≤ 6 | 4.5 FTE | Growth phase — expanded support |
| Tier 3 | > 6 | 7.0 FTE | Scale phase — full operations team |

Staff cost per month is calculated as FTE headcount multiplied by the average staff salary (default: $75,000/year) divided by 12. Staff salaries escalate annually at the inflation rate.

### 3. Fixed Overhead

Fixed costs escalate annually at the fixed cost escalation rate (default: 3%):

| Cost Category | Annual Starting Amount |
|--------------|----------------------|
| Office Lease | $36,000 |
| Professional Services (legal, accounting) | $24,000 |
| Technology Infrastructure | $18,000 |
| Business Insurance | $12,000 |
| **Total Fixed Overhead** | **$90,000** |

The monthly fixed cost for any given year is calculated as: annual cost × (1 + escalation rate) raised to the year index, divided by 12.

### 4. Variable Costs

Variable costs scale with the number of managed properties and portfolio revenue:

| Cost Category | Basis | Default Rate or Amount |
|--------------|-------|----------------------|
| Travel (site visits) | Per managed property | $12,000/property/year |
| IT Licensing | Per managed property | $3,000/property/year |
| Marketing | % of total portfolio revenue | 5% |
| Miscellaneous Operations | % of total portfolio revenue | 3% |

Per-client costs escalate with the inflation rate. Revenue-based costs naturally scale as the portfolio grows.

---

## Financial Statements Produced

The Management Company generates:

| Statement | Content | Frequency |
|-----------|---------|-----------|
| **Income Statement** | Fee revenue, operating expenses, EBITDA, net income | Monthly (aggregated to annual) |
| **Cash Flow Statement** | SAFE inflows, operating cash flow, cumulative cash position | Monthly (aggregated to annual) |

The Management Company does not produce a Balance Sheet (it holds no real property assets) or IRR calculations (returns are measured at the property and portfolio level).

---

## Company Tax Rate

Pre-tax income is subject to the company tax rate (default: 30%) to derive after-tax cash flow. This rate applies to positive net income only — tax losses do not generate refunds in the current model.

---

## Checker Verification Points

| Check | What to Verify |
|-------|---------------|
| Fee reconciliation | Sum of property fee expenses = Management Company fee revenue (every period) |
| Funding gate | No revenue or expenses before SAFE Tranche 1 date |
| Staff tiering | FTE headcount matches property count tier for each period |
| Fixed cost escalation | Year-over-year fixed costs grow at exactly the configured escalation rate |
| Partner cap | No partner monthly compensation exceeds $30,000 |
| Cash flow | SAFE inflows appear on correct dates; cumulative cash never goes negative after funding |
