# Chapter 15: Fixed Assumptions and Configurable Parameters

Not all assumptions in the model can be changed. Some are fixed by law or industry convention, while others — though they ship with sensible defaults — can be adjusted to match your specific investment scenario. This chapter clarifies which is which.

## Immutable Constants

Two values are permanently fixed in the calculation engine and cannot be overridden:

| Parameter | Value | Authority | Rationale |
|-----------|-------|-----------|-----------|
| Depreciation period | 27.5 years | IRS Publication 946 / ASC 360 | Mandated by U.S. tax law for residential rental property |
| Days per month | 30.5 days | Industry convention (365 ÷ 12) | Standard hotel revenue calculation convention |

The 27.5-year depreciation period is not a modeling choice — it is a legal requirement for the classification of property used in the model. Similarly, the 30.5-day month is universally used in hospitality financial analysis to convert daily rates to monthly revenue.

## Configurable Parameters

The following parameters were designed to be adjustable through the Company Assumptions page, allowing you to tailor the model to your market and investment thesis:

- **Exit cap rate** (default 8.5%) — reflects your expectation of market conditions at the time of sale
- **Tax rate** (default 25%) — can be adjusted for different jurisdictions or tax structures
- **Sales commission** (default 5%) — covers broker fees and transaction costs at exit
- **Loan terms** — LTV, interest rate, and amortization period can all be modified to reflect actual financing terms
- **Revenue shares** — the percentage of room revenue allocated to events, food and beverage, and other income

## Understanding Assumption Variability

When evaluating which assumptions to adjust, it helps to understand the three categories of variability:

| Category | Examples | Degree of Variability |
|----------|----------|----------------------|
| **Regulated by GAAP or IRS** | Depreciation (27.5 years), days per month (30.5) | None — set by law or accounting standard |
| **Market convention** | Amortization period (20–30 years), closing costs (1–3%), broker commission (4–6%) | Low — narrow industry range |
| **Market variable** | Average daily rate, occupancy, cap rate, catering boost | High — requires local market research |

Parameters in the first category are locked for good reason. Parameters in the second category have sensible defaults that rarely need adjustment. Parameters in the third category are where your local market knowledge and AI-assisted research add the most value — these are the assumptions that most significantly influence projected returns.

## In-App Guidance

Every input field includes a help tooltip explaining what the field controls and how changes will ripple through the model. For GAAP-regulated values, the tooltip explains the authoritative source and why the value cannot be changed. For market-variable fields, AI-powered research badges display recommended ranges based on current market data, helping you calibrate assumptions with confidence.
