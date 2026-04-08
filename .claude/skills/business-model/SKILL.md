---
name: business-model
description: Foundational business domain for HBG Portal. Covers dual-entity model, hospitality revenue streams, USALI income waterfall, management fees, company overhead, SAFE funding, intercompany elimination, and property lifecycle. Use when working on business logic or financial assumptions.
---

# HBG Business Model

The foundational business domain skill for HBG Portal. Covers the dual-entity model, hospitality revenue streams, USALI income waterfall, management fees, company overhead, SAFE funding, intercompany elimination, ICP system, make-vs-buy analysis, and property lifecycle. Use this skill whenever working on business logic, financial assumptions, property data, or any feature that touches the investment simulation model.

**Related skills:** `finance/` (calculation contracts), `proof-system/` (audit checks), `design-system/` (visual identity), `integrations/` (external services), `marcela-ai/` (AI agent), `architecture/` (server architecture), `product-vision/` (product direction)

---

## Dual-Entity Model

HBG operates a dual-entity structure common in hospitality investment:

### Management Company (ManCo)
- The operating entity — HBG itself
- Earns fee revenue from Property SPVs (Base Fee + Incentive Fee)
- Bears corporate overhead (staffing, office, professional services, technology)
- Funded by SAFE instrument tranches during pre-profitability phase
- Does **not** own property assets directly

### Property SPVs (Special Purpose Vehicles)
- Each hotel property is held in its own independent legal entity
- Isolates liability — one property's failure doesn't affect others
- Each SPV pays management fees to ManCo for operational services
- Each SPV carries its own debt, depreciation, and tax obligations
- Revenue, expenses, and cash flows are tracked independently per property

### Intercompany Elimination (ASC 810)
On consolidation, management fees paid by properties cancel against fee revenue received by ManCo. The system validates that **Fees Paid = Fees Received** within tolerance. This is required under ASC 810 (Consolidation) for accurate consolidated financial statements.

---

## Property Type Spectrum

The portfolio spans a range of hospitality property types — not exclusively boutique hotels:

| Type | Examples | Key Characteristics |
|------|----------|-------------------|
| **Boutique Hotel** | Independent lifestyle hotels, design hotels | Full service: front desk, F&B, events, staff-intensive |
| **Boutique Resort** | Wellness retreats, destination resorts | High ADR, strong events/spa revenue, seasonal |
| **Bed & Breakfast** | Inn-style properties | Owner-operated, fewer rooms, high personalization |
| **Short-Term Rental (STR)** | Airbnb, VRBO-style properties | Platform-distributed, self-service, lower staffing |
| **Hybrid / Serviced Apartment** | Extended stay with hotel-like services | Mix of STR flexibility and hotel amenity depth |

**STR-specific model adjustments:**
- Set F&B and Events ancillary rates near 0% — STR properties typically have no restaurant or event space
- Platform distribution fees (Airbnb/VRBO, ~3–5% of room revenue) are modeled as Other Operating Expenses
- Departmental labor is lower — no front desk or restaurant staff; housekeeping is contracted per-turn
- Cleaning fee revenue offset by cleaning cost is captured in Other revenue/expenses
- Dynamic pricing tools replace traditional RevPAR management — set higher ADR volatility assumptions
- Regulatory/licensing costs (STR permits, short-term rental taxes) appear as fixed operating expenses
- ManCo still earns management fees for platform management, cleaning coordination, guest communications, and revenue optimization

All revenue calculations use the same formula regardless of property type. The property type determines which ancillary revenue percentage assumptions are meaningful vs. set to near-zero.

---

## Hospitality Revenue Streams

Revenue is modeled using industry-standard hospitality metrics:

### Room Revenue (Primary)
```
Room Revenue = Room Count × DAYS_PER_MONTH (30.5) × ADR × Occupancy
```
- **ADR** (Average Daily Rate): The average price per occupied room per night. Grows annually by `adrGrowthRate`.
- **Occupancy**: Percentage of available rooms sold. Ramps from `startOccupancy` to `maxOccupancy` via step-function growth.
- **RevPAR** (Revenue Per Available Room): `ADR × Occupancy` — the single most important performance metric in hospitality.
- **Available Room Nights**: `Room Count × 30.5 days/month`

### Ancillary Revenue Streams (as % of Room Revenue)
| Stream | Default Share | Description | STR Typical |
|--------|--------------|-------------|------------|
| Events & Functions | 30% | Weddings, retreats, corporate events | 0% |
| Food & Beverage | 18% × (1 + Catering Boost) | Restaurant, bar, room service | 0–2% |
| Other/Ancillary | 5% | Spa, parking, gift shop, cleaning fees | 3–8% |

### Total Revenue
```
Total Revenue = Room Revenue + Events Revenue + F&B Revenue + Other Revenue
```

---

## USALI Income Waterfall

The Uniform System of Accounts for the Lodging Industry (USALI) defines the standard profit waterfall for hotel operations. Every line item in the portal follows this hierarchy:

```
Total Revenue
  − Departmental Expenses (Rooms, F&B, Events, Other)
  − Undistributed Operating Expenses (Admin, Marketing, Property Ops, Utilities, IT, Other)
  ─────────────────────────────────────────
  = GOP (Gross Operating Profit)
  − Management Fees (Base Fee + Incentive Fee)
  ─────────────────────────────────────────
  = AGOP (Adjusted Gross Operating Profit)
  − Property Taxes (fixed charge, escalated annually)
  ─────────────────────────────────────────
  = NOI (Net Operating Income)
  − FF&E Reserve
  ─────────────────────────────────────────
  = ANOI (Adjusted Net Operating Income)
  − Interest Expense
  − Depreciation
  − Income Tax (with NOL carryforward at 80% cap per IRC §172)
  ─────────────────────────────────────────
  = Net Income
```

### Key Metrics Defined
| Metric | Definition | Significance |
|--------|-----------|--------------|
| **GOP** | Revenue minus all operating expenses (before management fees) | Measures property operational efficiency |
| **AGOP** | GOP minus management fees | What the property retains after paying ManCo |
| **NOI** | AGOP minus property taxes | The standard metric for property valuation (NOI / Cap Rate = Value) |
| **ANOI** | NOI minus FF&E Reserve | Cash available before debt service and taxes |
| **Net Income** | ANOI minus interest, depreciation, and income tax | Bottom-line GAAP profit |

### Expense Categories (USALI-Aligned)
| Category | Type | Default Rate | Base |
|----------|------|-------------|------|
| Rooms (Housekeeping) | Variable | 20% | Room Revenue |
| Food & Beverage | Variable | 9% | F&B Revenue |
| Events | Variable | 65% | Events Revenue |
| Other | Variable | 60% | Other Revenue |
| Admin & General | Fixed | 8% | Total Revenue (Y1 base, escalated) |
| Marketing | Variable | 1% | Total Revenue |
| Property Ops & Maintenance | Fixed | 4% | Total Revenue (Y1 base, escalated) |
| Utilities | Split | 5% | 60% variable / 40% fixed |
| IT | Fixed | 0.5% | Total Revenue (Y1 base, escalated) |
| Property Taxes | Fixed | 3% | Total Property Value / 12 (escalated) |
| FF&E Reserve | Variable | 4% | Total Revenue |
| Other Operating | Fixed | 5% | Total Revenue (Y1 base, escalated) |

**Fixed cost escalation:** Fixed expenses are anchored to Year 1 base revenue and escalated annually by the `fixedCostEscalationRate` (defaults to inflation rate). Supports annual or monthly compounding via `escalationMethod`.

---

## Management Fee Model

### Base Fee
- Default: **8.5% of Total Revenue**
- Compensates ManCo for day-to-day property management
- Can be replaced by granular **Service Fee Categories**

### Incentive Fee
- Default: **12% of GOP**
- Rewards ManCo when the property performs well operationally
- Only positive amounts apply: `max(0, GOP × incentiveFeeRate)`

### Service Fee Categories (Granular Breakdown)
Instead of a flat base fee, each property can break fees into specific service categories. Default categories sum to 8.5% to match the flat base rate:

| Category | Default Rate | Description |
|----------|-------------|-------------|
| Marketing | 2.0% | Brand, digital campaigns, channel management |
| Technology & Reservations | 2.5% | PMS, booking engine, CRS |
| Accounting | 1.5% | Bookkeeping, reporting, audit prep |
| Revenue Management | 1.0% | Dynamic pricing, demand forecasting |
| General Management | 1.5% | Executive oversight, HR |

Each category supports **Direct vs Centralized/Pass-Through** delivery models with a markup waterfall for cost-of-services analysis.

---

## Management Company Overhead

### Fixed Costs (escalated by inflation annually)
| Item | Default Annual | Notes |
|------|---------------|-------|
| Office Lease | $36,000 | Physical office space |
| Professional Services | $24,000 | Legal, accounting, audit |
| Technology Infrastructure | $18,000 | Cloud hosting, SaaS tools |

### Variable Costs
| Item | Default | Basis |
|------|---------|-------|
| Travel | $12,000/property/year | Per active property |
| IT Licensing | $3,000/property/year | Per active property |
| Marketing | 5% | Of total fee revenue |
| Miscellaneous Ops | 3% | Of total fee revenue |

### Staffing Tiers
Headcount scales with portfolio size:

| Tier | Max Properties | FTE | Default Salary |
|------|---------------|-----|---------------|
| Tier 1 | ≤ 3 | 2.5 | $75,000/year |
| Tier 2 | ≤ 6 | 4.5 | $75,000/year |
| Tier 3 | 7+ | 7.0 | $75,000/year |

### Partner Compensation (10-Year Fixed Schedule)
| Years | Annual Compensation (Total) |
|-------|---------------------------|
| Y1–Y3 | $540,000 |
| Y4–Y5 | $600,000 |
| Y6–Y7 | $700,000 |
| Y8–Y9 | $800,000 |
| Y10 | $900,000 |

---

## SAFE Funding Vehicle

The management company is funded during its pre-profitability phase through a SAFE (Simple Agreement for Future Equity) instrument:

- **Two tranches** with configurable dates, amounts, valuation cap, and discount rate
- Default tranche amount: $800,000 each
- Optional interest rate with configurable payment frequency (accrues only, quarterly, or annually)
- **Operational gate rule:** No ManCo revenue or expenses accrue until BOTH `companyOpsStartDate` AND `safeTranche1Date` are reached. This is a strict gate — even one day early returns zero.

---

## Ideal Customer Profile (ICP) System

The ICP defines what properties HBG targets for acquisition:

### Physical Parameters
- Room count range, land area, total square footage
- Property type preferences (boutique hotel, resort, bed & breakfast)

### Amenity Priorities
- **Must Have** — non-negotiable (e.g., wellness spa, event space)
- **Major Plus** — strongly preferred
- **Nice to Have** — desirable but not required
- **Exclude** — deal-breakers

### Financial Targets
- ADR range, Occupancy range, RevPAR range
- Target IRR, equity multiple
- Purchase price range

### Location Definitions
- Geographic markets with radius search
- Proximity requirements (airports, comparable hotels, amenities)

The ICP drives AI-powered company research prompts — physical parameters, amenity priorities, and financial targets are formatted into system prompts that guide LLM property research.

---

## Make-vs-Buy Analysis

For each service fee category, the system computes:
```
Total In-House Cost = Internal FTE × Salary + Overhead
Total Vendor Cost = External service provider quote + Management overhead
Savings = Total In-House Cost − Total Vendor Cost
```
A savings threshold recommendation helps ManCo decide whether to deliver services in-house or outsource to specialized vendors.

**Key file:** `calc/research/make-vs-buy.ts`

---

## Property Lifecycle

Every property moves through a defined investment lifecycle:

```
Acquisition → Pre-Opening → Operations → Hold Period → Refinance (optional) → Exit/Disposition
```

| Stage | Description | Financial Impact |
|-------|-------------|-----------------|
| **Acquisition** | Property purchased, debt begins | `acquisitionDate` starts debt service and depreciation |
| **Pre-Opening** | Renovation/construction before hotel opens | Debt service accrues with no revenue (cash burn) |
| **Operations** | Hotel is open for guests | Revenue begins at `operationsStartDate`; occupancy ramps |
| **Hold Period** | Active operations during investment horizon | Default 10-year projection (120 months) |
| **Refinance** | Optional new loan replaces acquisition debt | Based on stabilized NOI / cap rate × refi LTV |
| **Exit/Disposition** | Property sold at end of hold period | Exit Value = (Terminal NOI / Cap Rate) − Commission − Outstanding Debt |

### Key Dates
- **`acquisitionDate`**: When the property is purchased. Debt and depreciation begin. Defaults to `operationsStartDate` if omitted.
- **`operationsStartDate`**: When the hotel opens for business. Revenue and variable expenses start. May be later than `acquisitionDate`.

---

## Hospitality Vocabulary Rules

Always use hospitality industry terminology throughout the application:

| Use This | Not This |
|----------|----------|
| Properties | Items, assets (except financial context) |
| Rooms | Units |
| ADR (Average Daily Rate) | Average price |
| Occupancy | Utilization, utilization rate |
| Guests | Users (when referring to hotel customers) |
| Gross Operating Profit (GOP) | Gross margin |
| Housekeeping | Cleaning costs |
| Food & Beverage | Dining |
| Pre-Opening | Setup period |
| Hold Period | Duration |
| Disposition | Sale (in formal contexts) |
| Capital Improvements | Upgrades |
| RevPAR | Revenue per unit |
| FF&E Reserve | Maintenance fund |
| Property Operations | Facility management |

---

## Key Files

| File | Purpose |
|------|---------|
| `shared/constants.ts` | All financial default values (USALI rates, fee defaults, staffing tiers) |
| `client/src/lib/constants.ts` | Client-side constants + re-exports from shared |
| `shared/schema.ts` | Database schema — property, globalAssumptions, feeCategory tables |
| `client/src/lib/financial/types.ts` | TypeScript interfaces: PropertyInput, GlobalInput, MonthlyFinancials |
| `calc/research/make-vs-buy.ts` | Make-vs-buy analysis calculator |
| `calc/research/service-fee.ts` | Service fee category calculator |
| `calc/research/markup-waterfall.ts` | Markup waterfall for cost-of-services |
