# Management Company — Financial Statement Formulas

> Pure formula reference for the management company (HoldCo) pro forma.
> All formulas operate on a **monthly** basis unless noted otherwise.

---

## Revenue Formulas

| ID | Formula | Description |
|--------|---------|-------------|
| F-C-01 | `Base Management Fee Revenue = Σ(Property[i].Total Revenue × Base Fee Rate)` | Sum of base fees earned across all managed properties |
| F-C-02 | `Incentive Management Fee Revenue = Σ(max(0, Property[i].GOP × Incentive Fee Rate))` | Sum of incentive fees; each property evaluated independently (no cross-subsidy) |
| F-C-03 | `Total Revenue = Base Fee Revenue + Incentive Fee Revenue` | Gross management company revenue |

---

## Expense Formulas

### Compensation

| ID | Formula | Description |
|--------|---------|-------------|
| F-C-04 | `Partner Compensation = partnerCompYear[y] × partnerCount[y] ÷ 12` | Monthly partner draw; both amount and headcount are configured per year (years 1–10) |
| F-C-05 | `Staff Compensation = Staff FTE × Average Staff Salary ÷ 12` | Monthly staff payroll based on tiered headcount model |
| F-C-06 | `Staff FTE = Tier1 FTE if properties ≤ Tier1Max; Tier2 FTE if properties ≤ Tier2Max; else Tier3 FTE` | Step-function staffing model driven by portfolio size |

### Fixed Overhead (Escalating)

| ID | Formula | Description |
|--------|---------|-------------|
| F-C-07 | `Office Lease = Annual Amount ÷ 12 × (1 + Fixed Cost Escalation Rate)^year` | Monthly office rent with annual escalation |
| F-C-08 | `Professional Services = Annual Amount ÷ 12 × (1 + Fixed Cost Escalation Rate)^year` | Legal, accounting, advisory with annual escalation |
| F-C-09 | `Tech Infrastructure = Annual Amount ÷ 12 × (1 + Fixed Cost Escalation Rate)^year` | PMS, channel manager, cloud services with annual escalation |
| F-C-10 | `Business Insurance = Annual Amount ÷ 12 × (1 + Fixed Cost Escalation Rate)^year` | E&O, D&O, general liability with annual escalation |

### Variable Overhead (Portfolio-Linked)

| ID | Formula | Description |
|--------|---------|-------------|
| F-C-11 | `Travel = Number of Properties × Travel Cost Per Client ÷ 12 × (1 + Inflation Rate)^year` | Site visits and client travel scaled by portfolio count |
| F-C-12 | `IT Licensing = Number of Properties × IT License Per Client ÷ 12 × (1 + Inflation Rate)^year` | Per-property SaaS licensing costs |
| F-C-13 | `Marketing = Total Portfolio Revenue × Marketing Rate × (1 + Inflation Rate)^year` | Revenue-linked marketing spend with inflation |
| F-C-14 | `Misc Operations = Total Portfolio Revenue × Misc Ops Rate × (1 + Inflation Rate)^year` | Miscellaneous operating costs as percentage of portfolio revenue |

### Total

| ID | Formula | Description |
|--------|---------|-------------|
| F-C-15 | `Total Expenses = Σ(F-C-04 through F-C-14)` | Sum of all management company operating expenses |

---

## Income

| ID | Formula | Description |
|--------|---------|-------------|
| F-C-16 | `Net Income = Total Revenue − Total Expenses` | Management company bottom-line profit |

---

## Cash Flow

| ID | Formula | Description |
|--------|---------|-------------|
| F-C-17 | `SAFE Funding = Tranche 1 (in scheduled month) + Tranche 2 (in scheduled month)` | Pre-revenue capital from SAFE agreements, disbursed on configured dates |
| F-C-18 | `Monthly Cash Flow = Net Income + SAFE Funding Received` | Period cash movement including external funding |
| F-C-19 | `Ending Cash = Cumulative Sum of Monthly Cash Flows` | Running cash balance from inception |
| F-C-20 | `Funding Gate: Operations cannot begin before first SAFE tranche is received` | Mandatory business rule — no expenses incurred until capital is in place |

---

## Balance Sheet

| ID | Formula | Description |
|--------|---------|-------------|
| F-C-21 | `Assets: Cash & Equivalents = Ending Cash` | Liquid assets on hand |
| F-C-22 | `Liabilities: SAFE Notes Payable = Cumulative SAFE Funding Received` | Convertible note obligation (liability until priced round conversion) |
| F-C-23 | `Equity: Retained Earnings = Cumulative Net Income` | Accumulated profits/losses from operations |
