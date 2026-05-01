# Chapter 14: Management Company Financials

The management company — Hospitality Business Co. — is modeled as a standalone business entity with its own revenue, expenses, and profitability profile. Its financial health determines whether the management platform is self-sustaining and capable of supporting portfolio growth.

## Revenue

The management company earns revenue from two sources, both tied directly to the performance of the properties it manages:

**Base management fee** is calculated at 5% of the total portfolio revenue. This fee provides a stable revenue base that grows as the portfolio expands and as individual properties increase their top-line performance.

**Incentive management fee** is calculated at 15% of gross operating profit above a defined threshold. This performance-based fee rewards the management company when properties exceed profitability expectations, aligning management incentives with investor outcomes.

Revenue only begins after the company's operations start date, which is gated on receipt of initial funding.

## Operating Expenses

The management company carries the following expense structure:

| Expense | Default Amount |
|---------|---------------|
| Staff salaries | FTE count × $75,000 per year |
| Office lease | $36,000 per year |
| Professional services | $24,000 per year |
| Technology infrastructure | $18,000 per year |
| Business insurance | $12,000 per year |
| Travel | $12,000 per year per active property |
| IT licenses | $3,000 per year per active property |
| Marketing | 5% of management company revenue |
| Miscellaneous operations | 3% of management company revenue |
| Partner compensation | Per-year schedule (configurable) |

Note that travel and IT license costs scale with the number of active properties in the portfolio, reflecting the incremental cost of managing additional assets. Marketing and miscellaneous operations scale as a percentage of the management company's own revenue.

## Staffing Tiers

The management company's staffing requirements grow with the portfolio. Full-time equivalent (FTE) headcount is determined by the number of active properties, using three tiers that can be configured in the global assumptions:

| Portfolio Size | Default FTE |
|---------------|------------|
| Up to 3 properties | 2.5 FTE |
| 4 to 6 properties | 4.5 FTE |
| 7 or more properties | 7.0 FTE |

These tiers reflect the operational reality that a small portfolio can be managed by a lean team, while a larger portfolio requires dedicated staff for asset management, accounting, operations oversight, and investor relations.

## Funding Gate

The management company cannot begin operations — and therefore cannot generate revenue or incur operating expenses — until it has received its initial SAFE funding. The default SAFE tranche is $800,000, which provides the working capital needed to establish the management infrastructure before the first property acquisition closes.
