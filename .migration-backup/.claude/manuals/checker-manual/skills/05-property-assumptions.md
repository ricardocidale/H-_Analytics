# Chapter 5: Property-Level Assumptions

## Overview

Property-level assumptions are accessible via the Property Edit page for each individual SPV. These parameters override or supplement the global defaults, enabling heterogeneous portfolio modeling where every property can have its own unique revenue drivers, cost structure, financing terms, and exit assumptions.

The financial engine applies a three-tier fallback chain when resolving any property parameter:

1. **Property-specific value** — if explicitly set on the Property Edit page, this value takes precedence.
2. **Global assumption** — if the property value is null or undefined, the engine uses the corresponding global assumption from the Systemwide Assumptions page.
3. **System default constant** — if neither property nor global values are set, the engine uses the hardcoded default.

This chain ensures that every calculation always has a valid input, while allowing maximum configurability at any level. A single global assumption change can update all properties that have not been individually overridden, while properties with explicit values remain unaffected.

---

## Complete Property Assumptions Reference

### Identity and Classification

| Field | Definition | Default | Unit |
|-------|-----------|---------|------|
| Name | Property display name | — (required) | text |
| Location | City/region description | — (required) | text |
| Market | Geographic market classification | — (required) | "North America" or "Latin America" |
| Image URL | URL to property hero image | — (optional) | URL |
| Status | Current lifecycle stage | — (required) | "Development", "Acquisition", or "Operating" |
| Type | Capital structure at acquisition | — (required) | "Full Equity" or "Financed" |

### Timing

| Field | Definition | Default | Unit |
|-------|-----------|---------|------|
| Acquisition Date | Date the property is acquired and capital deployed | — (required) | date |
| Operations Start Date | Date hotel operations begin and revenue starts | — (required) | date |

The gap between the acquisition date and the operations start date represents the pre-opening and renovation period. During this period, no revenue is generated but capital costs are incurred.

### Capital Structure

| Field | Definition | Default | Unit |
|-------|-----------|---------|------|
| Purchase Price | Property acquisition price | $3,800,000 | $ |
| Building Improvements | Renovation and improvement budget | $1,200,000 | $ |
| Land Value Percent | Non-depreciable land allocation (per IRS Publication 946) | 25% | % |
| Pre-Opening Costs | Pre-opening expenses (staff training, soft opening, marketing) | $200,000 | $ |
| Operating Reserve | Cash reserve for initial operations | $250,000 | $ |

The depreciable basis is calculated as the sum of the purchase price and building improvements, multiplied by (1 − land value percent). The depreciation period is 27.5 years per IRS Publication 946 and ASC 360 for residential rental property.

### Revenue Drivers

| Field | Definition | Default | Unit |
|-------|-----------|---------|------|
| Room Count | Number of guest rooms | 10 | count |
| Starting ADR | Average Daily Rate at operations start | $250 | $/night |
| ADR Growth Rate | Annual ADR growth rate | 3% | % |
| Starting Occupancy | Occupancy rate at operations start | 55% | % |
| Stabilized Occupancy | Maximum occupancy after ramp-up completes | 85% | % |
| Occupancy Ramp | Months between each occupancy step-up | 6 | months |
| Occupancy Growth Step | Percentage-point increase at each step-up | 5% | absolute % |

Monthly Room Revenue is computed as: Room Count × 30.5 days × Current Occupancy × Current ADR.

ADR grows on a monthly basis using the formula: Starting ADR × (1 + ADR Growth Rate) raised to the power of (month index / 12).

Occupancy uses a **discrete step-up model** — it does not grow smoothly. Two settings work together:
- **Occupancy Ramp** (months): the interval between each step-up.
- **Occupancy Growth Step** (percentage points): the size of each jump.

Every time the ramp interval elapses, occupancy increases by the growth step until the stabilized maximum is reached. Example with starting occupancy 40%, growth step 5%, ramp interval 9 months, stabilized occupancy 72%:
- Months 0–8: 40% → Months 9–17: 45% → Months 18–26: 50% → Months 27–35: 55% → Months 36–44: 60% → Months 45–53: 65% → Months 54–62: 70% → Month 63+: 72% (capped at stabilized max).

The total months to stabilization = ceil((stabilized − starting) / growth step) × ramp interval.

### Revenue Shares (as Percentage of Room Revenue)

Ancillary revenue streams are calculated as percentages of Room Revenue:

| Field | Definition | Default |
|-------|-----------|---------|
| Event Revenue Share | Event revenue as percentage of Room Revenue | 30% |
| F&B Revenue Share | Food & Beverage revenue as percentage of Room Revenue | 18% |
| Other Revenue Share | Other revenue as percentage of Room Revenue | 5% |

Total Revenue equals Room Revenue plus Event Revenue plus F&B Revenue plus Other Revenue.

### Catering Boost

The catering boost percentage (default: 22%) represents the uplift applied to base F&B revenue from catering operations. The adjusted F&B Revenue equals the base F&B Revenue multiplied by (1 + catering boost percentage). This reflects the blended catering uplift across all event types — fully catered, partially catered, and non-catered. The boost is applied before computing F&B departmental expenses.

### Operating Cost Rates (Revenue-Based)

These USALI-aligned departmental and undistributed expense allocations determine operating costs for each property:

| Field | Definition | Default | USALI Reference |
|-------|-----------|---------|-----------------|
| Rooms Department Expense | Rooms department cost rate | 20% | USALI Schedule 1 — Rooms |
| F&B Department Expense | F&B department cost rate | 9% | USALI Schedule 2 — Food & Beverage |
| Administrative & General | A&G expense rate | 8% | USALI Schedule 8 — A&G |
| Sales & Marketing | S&M expense rate | 1% | USALI Schedule 9 — S&M |
| Property Operations & Maintenance | POM expense rate | 4% | USALI Schedule 10 — POM |
| Utilities | Utilities expense rate | 5% | USALI Schedule 11 — Utilities |
| Information Technology | IT expense rate | 0.5% | USALI Schedule 12 — IT |
| FF&E Reserve | Furniture, fixtures, and equipment reserve | 4% | Industry standard reserve |
| Other / Miscellaneous | Other expense rate | 5% | Undistributed — Other |

### Operating Cost Rates (Property-Value-Based)

Insurance and Property Taxes are calculated as a percentage of total property value (Purchase Price + Building Improvements), not revenue. Formula: `(totalPropertyValue / 12) × rate × fixedCostFactor × fixedGate`.

| Field | Definition | Default | Basis |
|-------|-----------|---------|-------|
| Property Insurance | Insurance expense rate | 2% | % of Property Value |
| Property Taxes | Tax expense rate | 3% | % of Property Value |

Total Operating Expenses equal the sum of revenue-based costs plus property-value-based costs, plus management fees and depreciation.

### Financing — Acquisition (Financed Properties Only)

| Field | Definition | Default |
|-------|-----------|---------|
| Acquisition LTV | Loan-to-value ratio at acquisition | 75% |
| Acquisition Interest Rate | Annual interest rate on acquisition loan | 9% |
| Acquisition Term | Amortization period for acquisition loan | 25 years |
| Acquisition Closing Cost Rate | Closing costs as percentage of loan amount | 2% |

These fields are only relevant when the property type is "Financed." For Full Equity properties, these fields are null.

### Financing — Refinance

| Field | Definition | Default |
|-------|-----------|---------|
| Will Refinance | Whether property will pursue refinance | null |
| Refinance Date | Target date for refinance closing | null |
| Refinance LTV | Loan-to-value at refinance | 75% |
| Refinance Interest Rate | Interest rate on refinance loan | 9% |
| Refinance Term | Amortization period for refinance loan | 25 years |
| Refinance Closing Cost Rate | Closing costs as percentage of refinance loan | 3% |

### Exit and Tax

| Field | Definition | Default |
|-------|-----------|---------|
| Exit Cap Rate | Capitalization rate for terminal value | 8.5% |
| Tax Rate | Income / capital gains tax rate | 25% |

---

## GAAP-Standardized Fields

The following property-level fields are governed by authoritative standards and should have narrow acceptable ranges:

| Field | Standard | Authority |
|-------|----------|-----------|
| Land value exclusion from depreciation | Land value percent × purchase price is non-depreciable | IRS Publication 946 / ASC 360 |
| Depreciation period | 27.5 years, straight-line | IRS Publication 946 |
| Loan amortization | 20–30 years | Market convention |
| Closing costs | 1–3% of loan amount | Market convention |

---

## Checker Verification Points

| Check | What to Verify |
|-------|---------------|
| Fallback chain | When a property field is null, the global value is used; when global is null, the system default is used |
| Revenue drivers | Room Count × 30.5 × Occupancy × ADR = Room Revenue for each month |
| ADR growth | ADR compounds monthly at the configured annual growth rate |
| Occupancy ramp | Occupancy increases by the growth step at each ramp interval until maximum occupancy is reached |
| Revenue shares | Event, F&B, and Other revenue equal their respective shares multiplied by Room Revenue |
| Catering boost | Reported F&B Revenue = base F&B × (1 + catering boost percentage) |
| Cost rates | Each departmental expense = cost rate × Total Revenue |
| Depreciation | Monthly depreciation = (Purchase Price + Improvements) × (1 − Land Value Percent) ÷ (27.5 × 12) |
| Financing | Loan Amount = LTV × (Purchase Price + Building Improvements); PMT uses standard amortization |
| Balance Sheet | Assets = Liabilities + Equity every period |
| Exit | Terminal Value = Trailing NOI ÷ Exit Cap Rate |
