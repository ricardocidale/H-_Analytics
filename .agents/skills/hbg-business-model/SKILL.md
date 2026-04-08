The foundational business domain skill for HBG Portal. Covers the dual-entity model, hospitality revenue streams, USALI income waterfall, management fees, company overhead, SAFE funding, intercompany elimination, ICP system, make-vs-buy analysis, and property lifecycle. Use this skill whenever working on business logic, financial assumptions, property data, or any feature that touches the investment simulation model.

## Dual-Entity Model

### Management Company (ManCo)
- The operating entity — earns fee revenue from Property SPVs (Base Fee + Incentive Fee)
- Bears corporate overhead (staffing, office, professional services, technology)
- Funded by SAFE instrument tranches during pre-profitability phase
- Does **not** own property assets directly

### Property SPVs (Special Purpose Vehicles)
- Each property is held in its own independent legal entity
- Isolates liability — one property's failure doesn't affect others
- Each SPV pays management fees to ManCo, carries its own debt, depreciation, and tax
- Revenue, expenses, and cash flows tracked independently per property
- Properties use one of three business models: **Hotel**, **Lodge**, or **VRBO/STR**

### Intercompany Elimination (ASC 810)
On consolidation, management fees paid by properties cancel against fee revenue received by ManCo. The system validates **Fees Paid = Fees Received** within tolerance.

## Business Models

Three business models are supported, set via `businessModel` field on each property:

| Model | Description | Revenue Streams | Key Differences |
|-------|-------------|----------------|-----------------|
| **Hotel** | Traditional hospitality — USALI framework | Room + F&B + Events + Other | Full departmental expenses, management fees (2-10%) |
| **Lodge** | Large vacation lodge — whole-property rental | Nightly rental + F&B | Premium amenities (gym, sauna, courts), guest meals but no full restaurant dept, no events dept, 15-25% management fee |
| **VRBO/STR** | Short-term rental — platform-based | Nightly rental rate only | Platform fees (8-16%), per-turnover cleaning, 20-35% management fee |

See `.agents/skills/research-methodology/SKILL.md` §2.2–2.3 for detailed financial profiles.

## Hospitality Revenue Streams

### Room Revenue (Primary)
```
Room Revenue = Room Count x DAYS_PER_MONTH (30.5) x ADR x Occupancy
```
- **ADR** grows annually by `adrGrowthRate`
- **Occupancy** ramps from `startOccupancy` to `maxOccupancy` via step-function
- **RevPAR** = ADR x Occupancy

### Ancillary Revenue (as % of Room Revenue)
| Stream | Default Share |
|--------|-------------|
| Events & Functions | 30% |
| Food & Beverage | 18% x (1 + Catering Boost, default 22%) |
| Other/Ancillary | 5% |

> **Note:** VRBO properties typically have 0% F&B and Events revenue shares. Lodges have significant F&B revenue (15–25% of room revenue) from breakfast, meals, drinks, and picnics, but no Events revenue.

## USALI Income Waterfall

```
Total Revenue
  - Departmental Expenses (Rooms, F&B, Events, Other)
  - Undistributed Operating Expenses (Admin, Marketing, Property Ops, Utilities, IT, Other)
  - Insurance
  = GOP (Gross Operating Profit)
  - Management Fees (Base Fee + Incentive Fee)
  = AGOP (Adjusted Gross Operating Profit)
  - Property Taxes
  = NOI (Net Operating Income)     [NOI = AGOP - expenseTaxes]
  - FF&E Reserve
  = ANOI (Adjusted Net Operating Income)
  - Interest Expense
  - Depreciation
  - Income Tax (with NOL carryforward at 80% cap per IRC section 172)
  = Net Income
```

**Engine chain:** `gop -> agop -> noi -> anoi`

### Key Metrics
| Metric | Definition |
|--------|-----------|
| **GOP** | Revenue minus all operating expenses (before management fees) |
| **AGOP** | GOP minus management fees |
| **NOI** | AGOP minus property taxes. Formula: `AGOP - expenseTaxes` (insurance is already deducted before GOP) |
| **ANOI** | NOI minus FF&E Reserve |

### Insurance
- **Property insurance**: `expenseInsurance = (totalPropertyValue / 12) × costRateInsurance × fixedCostFactor` (default 1.5%)
- Included in `totalOperatingExpenses` (before GOP), NOT in fixed charges
- **Company insurance** = `DEFAULT_BUSINESS_INSURANCE_START / 12` = $1,000/mo (`businessInsuranceStart` field)
- Key fields: `costRateInsurance` (input), `expenseInsurance` (output), `businessInsuranceStart` (company)

### Expense Categories (USALI-Aligned)
| Category | Type | Default Rate | Base |
|----------|------|-------------|------|
| Rooms (Housekeeping) | Variable | 20% | Room Revenue |
| Food & Beverage | Variable | 9% | F&B Revenue |
| Events | Variable | 65% | Events Revenue |
| Other | Variable | 60% | Other Revenue |
| Admin & General | Fixed | 8% | Total Revenue (Y1 base, escalated) |
| Marketing | Variable | 1% | Total Revenue |
| Property Ops | Fixed | 4% | Total Revenue (Y1 base, escalated) |
| Utilities | Split | 5% | 60% variable / 40% fixed |
| IT | Fixed | 0.5% | Total Revenue (Y1 base, escalated) |
| Property Taxes | Fixed | 3% | Total Property Value / 12 (escalated) |
| FF&E Reserve | Variable | 4% | Total Revenue |

## Management Fee Model

- **Base Fee:** 8.5% of Total Revenue (or granular Service Fee Categories summing to 8.5%)
- **Incentive Fee:** 12% of GOP. `max(0, GOP x incentiveFeeRate)`

### Service Fee Categories
| Category | Default Rate |
|----------|-------------|
| Marketing | 2.0% |
| Technology & Reservations | 2.5% |
| Accounting | 1.5% |
| Revenue Management | 1.0% |
| General Management | 1.5% |

## Management Company Overhead

### Fixed Costs (escalated by inflation)
| Item | Default Annual |
|------|---------------|
| Office Lease | $36,000 |
| Professional Services | $24,000 |
| Technology Infrastructure | $18,000 |

### Variable Costs
| Item | Default | Basis |
|------|---------|-------|
| Travel | $12,000/property/year | Per active property |
| IT Licensing | $3,000/property/year | Per active property |
| Marketing | 5% | Of total fee revenue |
| Miscellaneous Ops | 3% | Of total fee revenue |

### Staffing Tiers
| Tier | Max Properties | FTE | Default Salary |
|------|---------------|-----|---------------|
| Tier 1 | <= 3 | 2.5 | $75,000/year |
| Tier 2 | <= 6 | 4.5 | $75,000/year |
| Tier 3 | 7+ | 7.0 | $75,000/year |

## SAFE Funding Vehicle

- Two tranches with configurable dates, amounts, valuation cap, discount rate
- Default tranche amount: $800,000 each
- **Operational gate:** No ManCo revenue or expenses until BOTH `companyOpsStartDate` AND `safeTranche1Date` are reached

## Property Lifecycle

```
Acquisition -> Pre-Opening -> Operations -> Hold Period -> Refinance (optional) -> Exit
```

### Key Dates
- **`acquisitionDate`**: Debt and depreciation begin. Defaults to `operationsStartDate` if omitted.
- **`operationsStartDate`**: Revenue and variable expenses start. May be later than acquisition.

## Hospitality Vocabulary

| Use This | Not This |
|----------|----------|
| Properties | Items, assets |
| ADR | Average price |
| GOP | Gross margin |
| RevPAR | Revenue per unit |
| FF&E Reserve | Maintenance fund |

## Key Files

| File | Purpose |
|------|---------|
| `shared/constants.ts` | All financial default values |
| `shared/schema/` | Database schema — property, globalAssumptions, feeCategory tables (split across `properties.ts`, `config.ts`, `services.ts`) |
| `client/src/lib/financial/types.ts` | TypeScript interfaces: PropertyInput, GlobalInput, MonthlyFinancials |
| `calc/research/make-vs-buy.ts` | Make-vs-buy analysis calculator |
| `calc/research/service-fee.ts` | Service fee category calculator |
