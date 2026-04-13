# Property SPV — Income Statement

## Source Components
- `client/src/components/YearlyIncomeStatement.tsx`
- `client/src/lib/financial/property-engine.ts` (`generatePropertyProForma`)
- `client/src/lib/yearlyAggregator.ts` (`aggregatePropertyByYear`)

---

## Accrual Basis vs. Cash Basis

All financial statements in this system use **accrual accounting** (GAAP requirement). The critical rules:

### Accrual Basis (Income Statement)
- **Revenue** is recognized when earned (guest stays in the room), not when cash is received (ASC 606)
- **Expenses** are recognized when incurred (the obligation arises), not when paid
- **Depreciation** is recorded as an expense even though no cash leaves the business (non-cash expense)
- **Interest** is recorded as an expense when it accrues, regardless of payment timing

### Cash Basis (Cash Flow Statement)
- Only actual cash movements are recorded
- Depreciation does NOT appear (it's not a cash outflow)
- Principal payments DO appear (cash leaves the business)
- The Cash Flow Statement reconciles accrual-basis Net Income back to actual cash

### Why This Matters
The same transaction appears DIFFERENTLY on different statements:

| Transaction | Income Statement | Cash Flow Statement | Balance Sheet |
|------------|-----------------|-------------------|---------------|
| **Interest Payment** | Expense (reduces Net Income) | Operating Activity (cash outflow) | No direct effect (already in NI) |
| **Principal Payment** | NOT an expense (never appears) | Financing Activity (cash outflow) | Reduces Liability (debt goes down) |
| **Depreciation** | Expense (reduces Net Income) | Added BACK (non-cash, Operating) | Reduces Asset (accumulated depreciation) |
| **Income Tax** | Expense (reduces Net Income) | Operating Activity (cash outflow) | No direct effect (already in NI) |
| **Loan Proceeds** | NOT revenue (never appears) | Financing Activity (cash inflow) | Increases Liability + Asset |
| **Refinance Proceeds** | NOT revenue (never appears) | Financing Activity (cash inflow) | Changes Liability structure |
| **Property Purchase** | NOT an expense (never appears) | Investing Activity (cash outflow) | Creates Asset |
| **Revenue Earned** | Revenue (increases Net Income) | Already in NI (Operating) | Increases Cash (Asset) |
| **Operating Expense** | Expense (reduces Net Income) | Already in NI (Operating) | Decreases Cash (Asset) |

### The Cardinal Rules (NEVER Violate)

1. **Principal payments are NEVER an expense.** They are a repayment of borrowed money — a financing activity that reduces a liability. Treating principal as an expense would double-count the cost of the asset.

2. **Depreciation is NEVER a cash outflow.** It is an accounting allocation of an asset's cost over its useful life. The cash left the business when the asset was purchased.

3. **Interest IS an expense AND a cash outflow.** It represents the cost of borrowing and is recognized on both the Income Statement (accrual) and the Cash Flow Statement (cash).

4. **Loan proceeds are NEVER revenue.** Borrowing money creates a liability, not income. It appears only on the Balance Sheet and Cash Flow Statement.

5. **Total Debt Service (Interest + Principal) appears on the Cash Flow Statement but only Interest appears on the Income Statement.**

---

## USALI Income Statement Structure

### Source: USALI 12th Edition Summary Operating Statement

The hotel Income Statement follows the USALI "waterfall" structure. Each section builds on the previous one. The order and classification are mandatory.

### Section 1: Revenue (ASC 606)
Revenue is recognized when the performance obligation is satisfied (guest occupies the room, meal is served).

```
REVENUE
  Room Revenue                    = Sold Rooms × ADR
  Total Revenue                   = Room Revenue / (1 - revShareEvents - revShareFB - revShareOther)
  Food & Beverage Revenue         = Total Revenue × revShareFB
  Events & Conference Revenue     = Total Revenue × revShareEvents
  Other Revenue                   = Total Revenue × revShareOther
  ─────────────────────────────────────────────────
  TOTAL REVENUE                   = Room Revenue + F&B + Events + Other
```

**USALI Rules:**
- Room Revenue is the primary revenue driver; ancillary revenues are expressed as percentages of total revenue
- F&B Revenue combines Food and Beverage per USALI 10th+ editions (single line on Summary Operating Statement)
- Revenue is reported GROSS (not net of commissions) per USALI guidance on gross vs. net reporting
- Available Rooms = Room Count × 30.5 days/month (industry standard)
- ADR grows annually: `currentADR = baseADR × (1 + adrGrowthRate)^opsYear`
- Occupancy ramps: `occ = min(maxOcc, startOcc + rampSteps × growthStep)`

**Key Operating Metrics (displayed as context, not financial line items):**
- ADR (Average Daily Rate)
- Occupancy %
- RevPAR (Revenue Per Available Room) = ADR × Occupancy
- Available Room Nights
- Sold Room Nights

### Section 2: Departmental Expenses (USALI Operated Departments)
Per USALI, expenses are organized by department — each operated department has its own cost structure.

```
DEPARTMENTAL / OPERATING EXPENSES
  Variable Costs (scale with current revenue):
    Rooms Expense                 = Room Revenue × costRateRooms
    F&B Expense                   = F&B Revenue × costRateFB
    Events Expense                = Events Revenue × eventExpenseRate
    Other Expense                 = Other Revenue × otherExpenseRate
    Marketing                     = Total Revenue × costRateMarketing
    Variable Utilities            = Total Revenue × (costRateUtilities × variableSplit)
    FF&E Reserve                  = Total Revenue × costRateFFE

  Fixed Costs (anchored to Year 1 base revenue, escalate independently per USALI):
    Administrative & General      = baseDollar × (1 + escalationRate)^year
    Property Operations           = baseDollar × (1 + escalationRate)^year
    IT & Systems                  = baseDollar × (1 + escalationRate)^year
    Fixed Utilities               = baseDollar × (1 + escalationRate)^year
    Other Costs                   = baseDollar × (1 + escalationRate)^year

  Property-Value-Based Costs (anchored to purchase price + improvements, escalate):
    Insurance (expenseInsurance)   = (totalPropertyValue / 12) × costRateInsurance × (1 + escalationRate)^year
    Property Taxes                = (totalPropertyValue / 12) × rate × (1 + escalationRate)^year
  ─────────────────────────────────────────────────
  TOTAL OPERATING EXPENSES        = Sum of all variable + fixed expenses
```

**USALI Classification Rules:**
- Departmental expenses (Rooms, F&B, Events, Other) are **variable** — they scale with departmental revenue
- Undistributed Operating Expenses (Admin, Property Ops, IT, Utilities) are **fixed** — they are dollar-based, anchored to opening-year revenue, and escalate at a configurable rate independent of revenue growth
- Insurance and Property Taxes are **property-value-based** — anchored to (Purchase Price + Building Improvements), escalated annually
- FF&E Reserve is a contractual/covenant obligation, treated as variable (% of Total Revenue)
- Marketing includes franchise fees per USALI 10th edition

### Section 3: Gross Operating Profit (GOP)

```
GROSS OPERATING PROFIT (GOP)      = Total Revenue − Total Operating Expenses
```

**USALI Definition:** GOP represents the profit from hotel operations before management fees and fixed charges. It is the primary measure of operational performance and is used for:
- Management company incentive fee calculations
- Owner/operator performance comparison
- Industry benchmarking (via STR, HotStats)

### Section 4: Management Fees
Per USALI, Management Fees are reported as a **separate deduction from GOP**, not as an operating expense. They appear between GOP and NOI on the Summary Operating Statement.

```
MANAGEMENT FEES
  Base Management Fee             = Total Revenue × property.baseManagementFeeRate
  Incentive Management Fee        = max(0, GOP × property.incentiveManagementFeeRate)
  ─────────────────────────────────────────────────
  TOTAL MANAGEMENT FEES           = Base + Incentive
```

**Critical USALI Rule:** Management Fees are NOT operating expenses. They are a contractual obligation to the management company. Per USALI 10th edition: "Management Fees are a separate line item on the Summary Operating Statement, and reported as a deduction from Gross Operating Profit in arriving at Income Before Fixed Charges."

**Fee Linkage:** These fees are REVENUE for the Management Company and EXPENSE for the Property. The same dollar amount must appear on both entities' statements.

### Section 5: FF&E Reserve
The FF&E Reserve is deducted after Management Fees to arrive at NOI. Per USALI, this is a reserve for Furniture, Fixtures & Equipment replacement — typically required by management agreements and lenders.

### Section 6: Net Operating Income (NOI)

```
NET OPERATING INCOME (NOI)        = GOP − Management Fees − FF&E Reserve
```

**NOI is the single most important metric in hotel real estate.** It is used for:
- Property valuation (NOI ÷ Cap Rate = Value)
- DSCR calculation (NOI ÷ Debt Service)
- Debt Yield (NOI ÷ Loan Amount)
- Comparable property analysis

**NOI is debt-independent and tax-independent.** It does not include interest, principal, depreciation, or income tax. This makes it comparable across properties regardless of capital structure.

### Section 7: Below-NOI Items (Non-Operating / Capital Structure)
These items appear below NOI because they depend on the property's capital structure, not its operations:

```
BELOW NOI
  Interest Expense                = Remaining Loan Balance × Monthly Rate
  Depreciation & Amortization     = Depreciable Basis ÷ 27.5 ÷ 12
  ─────────────────────────────────────────────────
  INCOME BEFORE TAX               = NOI − Interest − Depreciation

  Income Tax                      = max(0, Income Before Tax × Tax Rate)
  ─────────────────────────────────────────────────
  NET INCOME                      = Income Before Tax − Income Tax
```

**Why Interest is Below NOI (ASC 470):**
- Interest expense depends on the financing structure chosen by the owner
- Two identical hotels with different LTVs would have different interest expense but identical NOI
- Lenders, appraisers, and investors evaluate properties using NOI (before financing effects)

**Why Depreciation is Below NOI (ASC 360):**
- Depreciation is a non-cash accounting entry, not an operational cost
- It allocates the cost of the building over its useful life (27.5 years for residential rental per IRS Pub 946)
- It reduces taxable income but does not represent a cash outflow
- Land NEVER depreciates (IRS Pub 946, Section 3)

**Why Principal is NOT on the Income Statement (ASC 470):**
- Principal repayment is NOT an expense — it is the return of borrowed capital
- It reduces a liability (debt outstanding) on the Balance Sheet
- It appears ONLY on the Cash Flow Statement (financing activity) and Balance Sheet
- Including principal as an expense would double-count the cost of the property (already capitalized as an asset)

### Complete Income Statement Waterfall

```
┌──────────────────────────────────────────────────────────────────┐
│                     INCOME STATEMENT                             │
│              (USALI Summary Operating Statement)                 │
├──────────────────────────────────────────────────────────────────┤
│ REVENUE                                                          │
│   Room Revenue                                                   │
│   Food & Beverage Revenue                                        │
│   Events & Conference Revenue                                    │
│   Other Revenue                                                  │
│   ───────────────────────────                                    │
│   TOTAL REVENUE                                                  │
├──────────────────────────────────────────────────────────────────┤
│ DEPARTMENTAL EXPENSES                                            │
│   Rooms Expense                                                  │
│   F&B Expense                                                    │
│   Events Expense                                                 │
│   Other Expense                                                  │
├──────────────────────────────────────────────────────────────────┤
│ UNDISTRIBUTED OPERATING EXPENSES                                 │
│   Administrative & General                                       │
│   Marketing                                                      │
│   Property Operations & Maintenance                              │
│   Utilities                                                      │
│   IT & Systems                                                   │
│   Insurance                                                      │
│   Property Taxes                                                 │
│   Other Fixed Costs                                              │
│   ───────────────────────────                                    │
│   TOTAL OPERATING EXPENSES                                       │
├──────────────────────────────────────────────────────────────────┤
│ GROSS OPERATING PROFIT (GOP)  = Revenue − OpEx                   │
├──────────────────────────────────────────────────────────────────┤
│ MANAGEMENT FEES                                                  │
│   Base Management Fee          (% of Total Revenue)              │
│   Incentive Management Fee     (% of GOP)                        │
├──────────────────────────────────────────────────────────────────┤
│ FF&E RESERVE                   (% of Total Revenue)              │
├──────────────────────────────────────────────────────────────────┤
│ NET OPERATING INCOME (NOI)    = GOP − Fees − FF&E                │
├──────────────────────────────────────────────────────────────────┤
│ NON-OPERATING ITEMS (Capital Structure Dependent)                │
│   Interest Expense             (accrual: balance × rate)         │
│   Depreciation                 (non-cash: basis ÷ 27.5 ÷ 12)    │
│   ───────────────────────────                                    │
│   INCOME BEFORE TAX                                              │
│   Income Tax                   (only if taxable income > 0)      │
│   ───────────────────────────                                    │
│   NET INCOME                                                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## Common-Size Analysis (Percentage Margin Rows)

Every major subtotal on the Income Statement is followed by a `MarginRow` showing its percentage of Total Revenue. This is standard common-size analysis used by financial managers to evaluate operating efficiency.

### Displayed Margins
| After Subtotal | Margin Label | Formula |
|---------------|-------------|---------|
| Total Operating Expenses | % of Total Revenue | `(revenueTotal − gop) / revenueTotal × 100` |
| Gross Operating Profit (GOP) | % of Total Revenue | `gop / revenueTotal × 100` |
| Net Operating Income (NOI) | % of Total Revenue | `noi / revenueTotal × 100` |
| GAAP Net Income | % of Total Revenue | `netIncome / revenueTotal × 100` |

### Implementation
- Shared component: `MarginRow` from `client/src/components/financial-table-rows.tsx`
- Props: `label`, `values` (numerator array), `baseValues` (denominator array)
- Styling: `text-xs text-gray-400 italic font-mono` — visually subordinate to value rows
- Displays `XX.X%` or `—` when base is zero

### Assumption Label Clarity (CompanyAssumptions.tsx)
All percentage-based assumptions now explicitly state their calculation base in the label:
- **Base Management Fee** → `(% of Property Gross Revenue)` — per-property rate, defined on each property's edit page (default 5%, `DEFAULT_BASE_MANAGEMENT_FEE_RATE`)
- **Incentive Fee** → `(% of Property GOP)` — per-property rate, defined on each property's edit page (default 15%, `DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE`)
- **Event Expense Rate** → `(% of Event Revenue)`
- **Other Revenue Expense Rate** → `(% of Other Revenue)`
