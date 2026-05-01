# Chapter 4: Global Assumptions

## Overview

Global assumptions are model-wide parameters accessible via the Systemwide Assumptions page. These parameters affect all properties and the Management Company simultaneously. Changing any global assumption triggers an instant recalculation of every financial statement in the model.

When a property-level value is not explicitly set, the financial engine falls back to the corresponding global assumption, and ultimately to the system default constant. This ensures every calculation always has a valid input.

## Systemwide Assumptions Tabs

The Systemwide Assumptions page is organized into four tabs:

| Tab | Purpose |
|-----|---------|
| **Portfolio** | General property description (asset definition), disposition defaults, acquisition financing defaults, refinancing defaults for new properties |
| **Macro** | Economic assumptions (fiscal year start month, inflation rate) |
| **Other** | Calculation transparency toggles, AI research model selection |
| **Industry Research** | Configurable AI-powered industry research with focus areas, regions, time horizon, and custom questions. Displays model context (asset type, tier, room range, ADR range, inflation, projection years, features) as read-only summary from systemwide settings. Research results display inline. |

---

## Complete Global Assumptions Reference

### Model Parameters

| Field | Definition | Default Value | Impacts |
|-------|-----------|--------------|---------|
| Company Name | Display name for the management company | "Hospitality Business Company" | Both entities |
| Property Label | Label used for property type throughout the interface | "Boutique Hotel" | Both entities |
| Model Start Date | First month of the financial model | 2026-04-01 | Both entities |
| Projection Years | Number of years to project | 10 | Both entities |
| Company Operations Start Date | Date the Management Company begins operations | 2026-06-01 | Management Company |
| Fiscal Year Start Month | Month number when the fiscal year begins (1 = January, 4 = April) | 1 | Both entities |

### Inflation and Escalation

| Field | Definition | Default Value | Impacts |
|-------|-----------|--------------|---------|
| Inflation Rate | Annual inflation rate applied to salaries and variable costs | 3% | Both entities |
| Fixed Cost Escalation Rate | Annual escalation rate for Management Company fixed overhead | 3% | Management Company |

### Management Fees

| Field | Definition | Default Value | Impacts |
|-------|-----------|--------------|---------|
| Base Management Fee | Base management fee as percentage of property Total Revenue | 8.5% | Both entities |
| Incentive Management Fee | Incentive management fee as percentage of property GOP | 12% | Both entities |

The incentive fee is earned only when GOP is positive. A negative GOP produces zero incentive fee for that period.

### SAFE Funding

| Field | Definition | Default Value | Impacts |
|-------|-----------|--------------|---------|
| Funding Source Label | Label for the funding instrument type | "Funding Vehicle" | Management Company |
| Tranche 1 Amount | Amount of first SAFE tranche | $800,000 | Management Company |
| Tranche 1 Date | Disbursement date for first SAFE tranche | 2026-06-01 | Management Company |
| Tranche 2 Amount | Amount of second SAFE tranche | $800,000 | Management Company |
| Tranche 2 Date | Disbursement date for second SAFE tranche | 2027-04-01 | Management Company |
| Valuation Cap | Maximum pre-money valuation for SAFE conversion to equity | $2,500,000 | Management Company |
| Discount Rate | Discount rate applied when SAFE converts to equity | 20% | Management Company |

### Partner Compensation

Annual compensation pool and headcount per year across the projection horizon:

| Year | Default Compensation Pool | Default Partner Count |
|------|--------------------------|----------------------|
| 1 | $540,000 | 3 |
| 2 | $540,000 | 3 |
| 3 | $540,000 | 3 |
| 4 | $600,000 | 3 |
| 5 | $600,000 | 3 |
| 6 | $700,000 | 3 |
| 7 | $700,000 | 3 |
| 8 | $800,000 | 3 |
| 9 | $800,000 | 3 |
| 10 | $900,000 | 3 |

### Staffing

| Field | Definition | Default Value | Impacts |
|-------|-----------|--------------|---------|
| Average Staff Salary | Average annual salary per staff FTE | $75,000/year | Management Company |
| Tier 1 Max Properties | Maximum properties for Tier 1 staffing | 3 | Management Company |
| Tier 1 FTE | FTE headcount at Tier 1 | 2.5 | Management Company |
| Tier 2 Max Properties | Maximum properties for Tier 2 staffing | 6 | Management Company |
| Tier 2 FTE | FTE headcount at Tier 2 | 4.5 | Management Company |
| Tier 3 FTE | FTE headcount at Tier 3 (more than 6 properties) | 7.0 | Management Company |

Staff salary escalates annually at the inflation rate.

### Fixed Overhead (Management Company)

| Field | Definition | Default Value |
|-------|-----------|--------------|
| Office Lease | Annual office lease cost (Year 1) | $36,000/year |
| Professional Services | Annual legal, accounting, and advisory cost (Year 1) | $24,000/year |
| Technology Infrastructure | Annual technology infrastructure cost (Year 1) | $18,000/year |
| Business Insurance | Annual business insurance cost (Year 1) | $12,000/year |

All fixed costs escalate annually at the fixed cost escalation rate. The monthly cost is computed as: annual cost × (1 + escalation rate) raised to the year index, divided by 12.

### Variable Costs (Management Company)

| Field | Definition | Default Value |
|-------|-----------|--------------|
| Travel Cost Per Client | Annual travel cost per managed property | $12,000/property/year |
| IT Licensing Per Client | Annual IT licensing cost per managed property | $3,000/property/year |
| Marketing Rate | Marketing spend as percentage of total portfolio revenue | 5% |
| Miscellaneous Operations Rate | Miscellaneous operations as percentage of total portfolio revenue | 3% |

Per-client costs escalate with the inflation rate. Revenue-based costs scale naturally with portfolio growth.

### Revenue Variables (Property-Level Expense Rates)

These global rates govern how specific property revenue streams translate to departmental expenses:

| Field | Definition | Default Value |
|-------|-----------|--------------|
| Event Expense Rate | Expense rate applied to Event Revenue | 65% |
| Other Expense Rate | Expense rate applied to Other Revenue | 60% |
| Utilities Variable Split | Portion of utilities expense treated as variable | 60% |

### Exit and Sale

| Field | Definition | Default Value | Impacts |
|-------|-----------|--------------|---------|
| Exit Cap Rate | Capitalization rate for terminal value calculation | 8.5% | Properties |
| Sales Commission Rate | Broker commission at disposition | 5% | Properties |
| Company Tax Rate | Corporate income tax rate for Management Company | 30% | Management Company |

### Debt Assumptions

| Field | Definition | Default Value |
|-------|-----------|--------------|
| Interest Rate | Default loan interest rate (acquisition) | 9% |
| Amortization Years | Default loan amortization period | 25 years |
| Acquisition LTV | Default acquisition loan-to-value ratio | 75% |
| Acquisition Closing Cost Rate | Closing costs as percentage of acquisition loan amount | 2% |
| Refinance LTV | Default refinance loan-to-value ratio | 75% |
| Refinance Closing Cost Rate | Closing costs as percentage of refinance loan amount | 3% |

### Standard Acquisition Package

Default capital budget for new property acquisitions:

| Field | Definition | Default Value |
|-------|-----------|--------------|
| Purchase Price | Default property purchase price | $3,800,000 |
| Building Improvements | Default building improvement or renovation budget | $1,200,000 |
| Pre-Opening Costs | Pre-opening expenses (staffing, training, marketing) | $200,000 |
| Operating Reserve | Cash reserve for initial operations | $250,000 |
| Months to Operations | Default months from acquisition to operations start | 6 months |

### Boutique Definition

The boutique definition establishes the target property profile for the Property Finder and validation:

| Field | Definition | Default Value |
|-------|-----------|--------------|
| Minimum Rooms | Minimum room count | 10 |
| Maximum Rooms | Maximum room count | 80 |
| Has F&B | Property has food & beverage operations | Yes |
| Has Events | Property has event/meeting space | Yes |
| Has Wellness | Property has wellness programming | Yes |
| Minimum ADR | Minimum target ADR | $150 |
| Maximum ADR | Maximum target ADR | $600 |
| Service Level | Service level classification | Luxury |
| Event Locations | Number of distinct event spaces | 2 |
| Max Event Capacity | Maximum event guest capacity | 150 |
| Acreage | Minimum property acreage | 5 acres |
| Privacy Level | Guest privacy classification | High |
| Parking Spaces | Minimum parking spaces | 50 |

---

## Instant Recalculation

Changing any global assumption instantly recalculates all downstream financial statements, including the Management Company income statement and cash flow, every property's income statement, cash flow, balance sheet, FCF, and IRR, all portfolio aggregates, and all Dashboard KPIs.

---

## USALI Benchmark Reasonableness Ranges

The following benchmark ranges represent industry-accepted norms for boutique hotel properties. Values outside these ranges should be flagged for further investigation — they are not necessarily errors, but require justification.

| Metric | Acceptable Range (Boutique Hotels) | Red Flag Below | Red Flag Above |
|--------|-----------------------------------|----------------|----------------|
| ADR | $150 – $600 | $100 | $800 |
| Occupancy Rate | 55% – 85% | 40% | 95% |
| RevPAR | $100 – $400 | $60 | $500 |
| GOP Margin | 30% – 55% | 20% | 65% |
| NOI Margin | 20% – 40% | 10% | 50% |
| Rooms Revenue % of Total | 55% – 75% | 40% | 85% |
| F&B Revenue % of Total | 15% – 30% | 5% | 45% |
| Base Management Fee | 3% – 7% | 1% | 10% |
| Incentive Management Fee | 10% – 25% | 5% | 35% |
| FF&E Reserve | 3% – 6% | 1% | 10% |
| Exit Cap Rate | 6% – 12% | 4% | 15% |

---

## Inflation and Escalation Verification

The model uses two distinct escalation mechanisms, and it is critical that the checker verify each one independently.

**Path 1: Fixed Cost Escalation Rate.** This rate is applied to fixed costs including office lease, professional services, technology infrastructure, and business insurance. The formula is: cost × (1 + fixed cost escalation rate) raised to the year index.

**Path 2: Inflation Rate.** This rate is applied to variable costs including travel cost per client, IT licensing per client, marketing (revenue-based), and miscellaneous operations. It is also used for staff salary escalation.

If the fixed cost escalation rate is not set (null or undefined), the engine falls back to the inflation rate for fixed cost escalation. This ensures all costs still escalate even if only one rate is configured.

### Verification Procedure

To confirm the two-path escalation is working correctly:

1. Set the inflation rate to 3% and the fixed cost escalation rate to 5%.
2. Export the Management Company Income Statement to Excel.
3. Verify fixed costs grow at exactly 5% year-over-year (e.g., Office Lease: Year 1 = $36,000, Year 2 = $37,800, Year 3 = $39,690).
4. Verify variable costs grow at exactly 3% year-over-year (e.g., Travel Cost Per Client: Year 1 = $12,000, Year 2 = $12,360, Year 3 = $12,731).
5. Confirm that setting the fixed cost escalation rate to null causes fixed costs to fall back to the 3% inflation rate.

---

## Checker Verification Points

| Check | What to Verify |
|-------|---------------|
| Default values | All fields display correct default values per the tables above |
| Escalation | Fixed costs escalate at exactly the fixed cost escalation rate year-over-year |
| Staffing tiers | FTE transitions correctly as portfolio grows past tier thresholds |
| Fee rates | Base and incentive fee rates propagate correctly to all property income statements |
| SAFE dates | Tranche dates precede or equal the company operations start date (funding gate) |
| Debt assumptions | Property financing defaults match the debt assumptions when no property override is set |
| Acquisition package | New properties default to the standard acquisition package values |
| Instant recalculation | Changing any single assumption updates all dependent outputs without page reload |
