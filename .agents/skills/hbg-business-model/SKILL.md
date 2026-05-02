---
name: hbg-business-model
description: "H+ Hospitality Business Portal foundational business domain: dual-entity model, USALI waterfall, revenue streams, management fees, ICP system, SAFE funding, property lifecycle, and hospitality vocabulary rules. Load before any task touching assumptions, labels, tooltips, or financial model structure."
---

# HBG Business Model

This skill defines the foundational business domain for the H+ Hospitality Business Portal. All labels, tooltips, section headers, financial structure, and model assumptions must conform to these definitions. Load this skill before any task that touches financial assumptions, UI labels, or the revenue/expense model.

---

## Dual-Entity Model

The portal models two distinct legal entities operating together:

- **Management Company (HBG / ManCo)**: Earns fees from Property SPVs for operating and managing hotels. Has its own profit and loss statement comprising fee revenue, overhead, staffing, and partner compensation. ManCo does not own properties.
- **Property SPVs**: Each hotel property is an independent legal entity (Special Purpose Vehicle). Properties pay management fees to ManCo and bear all property-level revenues and expenses.

These two entities must never be conflated. ManCo financials are displayed separately from property-level financials, and intercompany fees are eliminated on consolidation.

---

## Revenue Streams

All revenue is modeled in hospitality industry terms. The four streams are:

- **Room Revenue**: ADR × Occupancy Rate × Number of Rooms × Operating Days. This is the primary revenue driver and the base on which all other streams are calculated.
- **Food & Beverage (F&B)**: Modeled as a percentage of room revenue, with an optional Catering Boost factor applied when the property has significant banquet or catering capacity.
- **Events & Functions**: Modeled as a percentage of room revenue. Covers meeting rooms, event spaces, and function bookings.
- **Other / Ancillary**: Modeled as a percentage of room revenue. Covers parking, spa, retail, business center, and miscellaneous services.

---

## USALI Income Waterfall

The Uniform System of Accounts for the Lodging Industry (USALI) defines the property-level income waterfall. These definitions are financial identities — they must never be approximated, paraphrased, or reordered.

```
Total Revenue
  − Departmental Expenses
= Gross Operating Profit (GOP)
  − Management Fees (Base + Incentive)
= Adjusted Gross Operating Profit (AGOP)
  − Fixed Charges (Insurance + Property Taxes)
= Net Operating Income (NOI)
  − FF&E Reserve
= Adjusted Net Operating Income (ANOI)
  − Interest / Depreciation / Tax
= Net Income
```

**Definitions:**
- **GOP** (Gross Operating Profit): Total Revenue less all Departmental Expenses. Represents the property's operating profitability before management fees and fixed charges.
- **AGOP** (Adjusted GOP): GOP less Management Fees. Represents the return available after the management contract obligations are met.
- **NOI** (Net Operating Income): AGOP less Fixed Charges (insurance and property taxes). The standard metric used in hotel valuation and lending.
- **ANOI** (Adjusted NOI): NOI less the FF&E Reserve. Represents sustainable distributable cash before financing and tax.
- **Net Income**: ANOI less interest expense, depreciation, and income tax.

---

## Management Fee Model

### Base Fee

A percentage of Total Revenue, payable monthly regardless of property performance.

### Incentive Fee

A percentage of GOP, payable when GOP exceeds a defined threshold. Aligns ManCo compensation with property operating performance.

### Service Fee Categories

Per-category fees covering specific management services provided by ManCo to each property. Categories include: Marketing, IT, Accounting, Human Resources, Revenue Management, and Procurement (configurable).

Each service fee category is classified as one of two delivery models:

- **Direct**: Service is provided directly by ManCo staff; fee equals cost with no markup.
- **Centralized / Pass-Through**: Service is sourced from a third party or shared service center and passed through to the property. A markup waterfall applies: cost → ManCo markup → property invoice amount.

---

## Management Company Overhead

ManCo has its own cost structure independent of any individual property:

### Fixed Costs

Costs that exist regardless of portfolio size, escalated annually by the inflation rate assumption:
- Office lease
- Professional services (legal, audit, tax)
- Technology / software licenses

### Variable Costs

Costs that scale with the portfolio:
- **Per-client costs**: Travel, dedicated IT support — increase per property added.
- **Percentage-of-revenue costs**: Marketing, miscellaneous — scale with aggregate fee revenue.

### Staffing Tiers

ManCo staffing is tier-based, driven by total number of properties under management:

| Tier | Properties | FTE |
|------|-----------|-----|
| Tier 1 | ≤ 3 properties | 2.5 FTE |
| Tier 2 | ≤ 6 properties | 4.5 FTE |
| Tier 3 | 7+ properties | 7.0 FTE |

Default salary assumption: **$75,000 per FTE per year**, escalated by inflation.

### Partner Compensation Schedule

| Years | Annual Compensation |
|-------|-------------------|
| Y1 – Y3 | $540,000 |
| Y4 – Y5 | $600,000 |
| Y6 – Y7 | $700,000 |
| Y8 – Y9 | $800,000 |
| Y10 | $900,000 |

---

## SAFE Funding Vehicle

ManCo is capitalized using Simple Agreement for Future Equity (SAFE) instruments. Two tranches are modeled:

### Tranche Structure

Each tranche has the following parameters:
- Date of investment
- Investment amount
- Valuation cap
- Discount rate
- Optional interest rate
- Payment frequency (if interest-bearing)

### Operational Gate

ManCo revenues and expenses do not begin until **both** of the following conditions are met:
1. `companyOpsStartDate` has been reached
2. `safeTranche1Date` has been reached

Neither condition alone is sufficient. This gate must be enforced at every point in the Company Engine pipeline.

---

## Intercompany Elimination

On consolidation, management fees create a matching pair of transactions:
- Properties record management fees as an **operating expense**
- ManCo records management fees as **revenue**

Per ASC 810 (Consolidation), these must be eliminated when presenting consolidated financials. The system validates that:

```
Sum of Fees Paid (across all properties) = ManCo Fee Revenue
```

within a defined tolerance (typically ±$1). Any discrepancy is a reconciliation error and must be flagged.

---

## ICP (Ideal Customer Profile)

The ICP system defines the acquisition target parameters used by ManCo to find new properties. Parameters include:

### Physical Parameters

- Number of rooms (range)
- Land area (sq ft)
- Building square footage

### Amenity Priorities

Each amenity is classified into one of four priority tiers:
- **Must Have**: Required for acquisition consideration
- **Major Plus**: Significantly preferred
- **Nice to Have**: Preferred but not required
- **Exclude**: Disqualifying — property will not be considered if present

### Financial Targets

- ADR range (min / target / max)
- Occupancy range (min / target / max)
- RevPAR range
- Target IRR
- Target equity multiple

### Location Definitions

Geographic filters defining target markets (metro areas, submarkets, states, distance parameters).

### AI Research Integration

ICP parameters drive the prompts used by the AI research agent when scanning for acquisition candidates. The ICP must be kept current; the AI agent reads ICP assumptions directly to scope its property search and analysis.

---

## Property Lifecycle

Every property in the portfolio progresses through a defined lifecycle. Lifecycle stage determines which engine calculations are active:

```
Acquisition → Pre-Opening → Operations → Hold Period → Refinance (optional) → Exit / Disposition
```

- **Acquisition**: Property purchase; sets acquisition date, purchase price, equity invested, and initial loan.
- **Pre-Opening**: Period from acquisition to operations start; includes pre-opening expenses and no room revenue.
- **Operations**: Revenue-generating period; full USALI waterfall active.
- **Hold Period**: Strategic holding of the asset; ongoing operations.
- **Refinance** (optional): Loan payoff, new loan origination, equity extraction event; resets debt service schedule.
- **Exit / Disposition**: Sale of the property; triggers exit cash flows, capital gains calculation, and return metrics finalization.

---

## Hospitality Vocabulary Rules

All labels, tooltips, section headers, navigation items, form field labels, error messages, and button text MUST use industry-standard hospitality vocabulary. Generic software terms are never acceptable.

| Use This | Never Use |
|----------|-----------|
| Properties | Items; Assets (except in formal financial/legal context) |
| Rooms | Units |
| Average Daily Rate (ADR) | Average Price |
| Occupancy | Utilization; Utilization Rate |
| Guests | Users (when referring to hotel customers) |
| Gross Operating Profit (GOP) | Gross Margin |
| Housekeeping | Cleaning Costs |
| Food & Beverage (F&B) | Dining |
| Pre-Opening | Setup Period |
| Hold Period | Duration |
| Disposition | Sale (in formal financial contexts) |
| Capital Improvements | Upgrades |
| RevPAR | Revenue per Room (spell out on first use per page) |
| Management Fees | Service Fees (unless referring specifically to the service fee category system) |

These rules apply without exception across every UI surface. Violations are considered bugs, not style preferences.

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `financial-engine` | Technical implementation of the USALI waterfall and all calculations described here |
| `verification-system` | Server-side validation of financial identities defined in this skill |
| `hbg-design-philosophy` | Visual presentation of all hospitality domain data |
| `hbg-product-vision` | Product-level decisions that depend on this domain model |
