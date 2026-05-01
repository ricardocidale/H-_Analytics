# Financial Statement Construction & Investment Analysis — Authoritative Reference

This skill is the single source of truth for how every financial statement, DCF model, and return analysis is constructed in the Hospitality Business platform. It governs two fundamentally different entity types:

1. **Property SPVs** — Boutique hotels modeled as individual real estate investments (hospitality properties)
2. **Hospitality Management Company** — A fee-based service company that earns management fees from the properties

Any code that generates, displays, or validates financial statements MUST conform to this document.

---

## Authoritative Sources

| Source | Scope | Edition/Year |
|--------|-------|-------------|
| **USALI** (Uniform System of Accounts for the Lodging Industry) | Hotel operating statements, departmental schedules, chart of accounts | 12th Ed. (effective Jan 1, 2026) |
| **GAAP ASC 606** | Revenue recognition | Current |
| **GAAP ASC 230** | Statement of Cash Flows | Current |
| **GAAP ASC 360-10** | Property, Plant & Equipment; Depreciation | Current |
| **GAAP ASC 470** | Debt; Interest vs. Principal treatment | Current |
| **GAAP ASC 470-50** | Debt Modifications and Extinguishments (Refinance) | Current |
| **GAAP ASC 740** | Income Taxes | Current |
| **GAAP ASC 842** | Leases (for Management Company office lease) | Current |
| **IRS Publication 946** | MACRS Depreciation, 27.5-year residential rental | 2024 |
| **CFA Institute** | IRR, NPV, DCF methodology | Current |
| **STR (Smith Travel Research)** | ADR, RevPAR, Occupancy definitions | Industry Standard |

---

# PART I: ACCRUAL BASIS vs. CASH BASIS

## The Fundamental Distinction

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

# PART II: PROPERTY SPV — INCOME STATEMENT

## Source: USALI 12th Edition Summary Operating Statement

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

  Fixed Costs (anchored to Year 1 base, escalate independently per USALI):
    Administrative & General      = baseDollar × (1 + escalationRate)^year
    Property Operations           = baseDollar × (1 + escalationRate)^year
    IT & Systems                  = baseDollar × (1 + escalationRate)^year
    Insurance                     = baseDollar × (1 + escalationRate)^year
    Property Taxes                = baseDollar × (1 + escalationRate)^year
    Fixed Utilities               = baseDollar × (1 + escalationRate)^year
    Other Costs                   = baseDollar × (1 + escalationRate)^year
  ─────────────────────────────────────────────────
  TOTAL OPERATING EXPENSES        = Sum of all variable + fixed expenses
```

**USALI Classification Rules:**
- Departmental expenses (Rooms, F&B, Events, Other) are **variable** — they scale with departmental revenue
- Undistributed Operating Expenses (Admin, Property Ops, IT, Utilities, Insurance) are **fixed** — they are dollar-based, anchored to opening-year revenue, and escalate at a configurable rate independent of revenue growth
- Property Taxes are a fixed charge, escalated annually
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
  Base Management Fee             = Total Revenue × baseManagementFee
  Incentive Management Fee        = max(0, GOP × incentiveManagementFee)
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

# PART III: PROPERTY SPV — CASH FLOW STATEMENT

## Source: GAAP ASC 230 — Statement of Cash Flows (Indirect Method)

The Cash Flow Statement reconciles accrual-basis Net Income to actual cash movement. It answers: "How much cash did the property actually generate or consume?"

### Why the Indirect Method?
ASC 230 permits two methods. The **indirect method** is standard practice because:
- It starts from Net Income (already computed on the Income Statement)
- It adds back non-cash items (depreciation)
- It separates operating, investing, and financing activities
- It provides a clear audit trail from accrual to cash

### Section 1: Cash Flow from Operating Activities

```
OPERATING ACTIVITIES
  Net Income                      (from Income Statement)
  + Depreciation & Amortization   (add back non-cash expense)
  ± Working Capital Changes       (changes in receivables, payables)
  ─────────────────────────────────────────────────
  CASH FROM OPERATIONS
```

**Why add back Depreciation?**
Net Income includes depreciation as an expense, but depreciation is not a cash outflow. The cash was spent when the property was purchased (investing activity). To get actual cash from operations, we reverse the depreciation deduction.

**Interest Treatment (ASC 230):**
Under GAAP, interest PAID is classified as an **operating activity** (default treatment). This is already embedded in Net Income, so no adjustment is needed in the indirect method. (IFRS allows classification as either operating or financing — we follow US GAAP.)

**Working Capital Changes:**
For stabilized hotel operations, working capital changes are typically minimal (no significant changes in receivables or payables month to month). Our model assumes zero working capital change, which is standard for pro forma hotel projections.

### Section 2: Cash Flow from Investing Activities

```
INVESTING ACTIVITIES
  Property Acquisitions           (cash outflow in acquisition year)
  Capital Expenditures            (ongoing CapEx, if any beyond FF&E)
  ─────────────────────────────────────────────────
  CASH FROM INVESTING
```

**Note:** The initial property purchase is an investing activity, NOT an operating expense. FF&E Reserve is already deducted in operating expenses (NOI), so additional CapEx here is only for items beyond the reserve.

### Section 3: Cash Flow from Financing Activities

```
FINANCING ACTIVITIES
  Debt Proceeds                   (loan amount at acquisition — cash inflow)
  − Principal Payments            (monthly principal portion — cash outflow)
  + Refinance Proceeds            (net cash from refinancing — cash inflow)
  − Equity Distributions          (cash returned to investors)
  ─────────────────────────────────────────────────
  CASH FROM FINANCING
```

**Why Principal is HERE (not on Income Statement):**
Principal repayment reduces the debt liability — it is a financing transaction. The borrower is returning capital to the lender, not incurring a cost. This is fundamentally different from interest, which IS a cost of using someone else's money.

**Refinance Proceeds (ASC 470-50):**
When a property is refinanced, the net proceeds (new loan − old loan balance − closing costs) flow through financing activities. This is NOT revenue and does NOT appear on the Income Statement.

### Section 4: Net Change in Cash

```
NET CHANGE IN CASH
  = Cash from Operations + Cash from Investing + Cash from Financing
  
BEGINNING CASH BALANCE
+ NET CHANGE IN CASH
= ENDING CASH BALANCE
```

### ASC 230 Reconciliation Check

The following identity MUST hold for every period:

```
Operating CF + Investing CF + Financing CF = Net Change in Cash

Expanded:
  (Net Income + Depreciation) + (−CapEx) + (−Principal + Refi Proceeds) = Net Change

Simplified (for operating periods without CapEx):
  (NOI − Interest − Dep − Tax + Dep) + (−Principal)
  = NOI − Interest − Tax − Principal
  = NOI − Total Debt Service − Tax
  = Total Cash Flow ✓
```

### Complete Cash Flow Statement Structure

```
┌──────────────────────────────────────────────────────────────────┐
│                   CASH FLOW STATEMENT                            │
│           (GAAP ASC 230 — Indirect Method)                       │
├──────────────────────────────────────────────────────────────────┤
│ ▶ OPERATING ACTIVITIES                                           │
│   Net Operating Income (NOI)                                     │
│   + Depreciation & Amortization     (non-cash add-back)          │
│   − Income Tax Paid                                              │
│   − Interest Paid                   (classified as operating)    │
│   ± Working Capital Changes                                      │
│   ───────────────────────────                                    │
│   = Cash from Operations                                         │
├──────────────────────────────────────────────────────────────────┤
│ ▶ INVESTING ACTIVITIES                                           │
│   Property Acquisitions             (equity portion, year 0)     │
│   Capital Expenditures              (beyond FF&E reserve)        │
│   ───────────────────────────                                    │
│   = Cash from Investing                                          │
├──────────────────────────────────────────────────────────────────┤
│ ▶ FINANCING ACTIVITIES                                           │
│   Debt Proceeds                     (loan at acquisition)        │
│   − Principal Payments              (monthly amortization)       │
│   + Refinance Proceeds              (net cash-out refi)          │
│   − Equity Distributions                                        │
│   ───────────────────────────                                    │
│   = Cash from Financing                                          │
├──────────────────────────────────────────────────────────────────┤
│ NET CHANGE IN CASH                  = Ops + Inv + Fin            │
│ Beginning Cash Balance                                           │
│ ENDING CASH BALANCE                 = Beginning + Net Change     │
├──────────────────────────────────────────────────────────────────┤
│ FREE CASH FLOW METRICS                                           │
│   Free Cash Flow (FCF)              = Cash from Ops − CapEx      │
│   Free Cash Flow to Equity (FCFE)   = FCF − Principal Payments   │
│   DSCR                              = NOI ÷ Annual Debt Service  │
│   Debt Yield                        = NOI ÷ Loan Amount          │
├──────────────────────────────────────────────────────────────────┤
│ BALANCE CHECK: ✓ or ⚠                                            │
└──────────────────────────────────────────────────────────────────┘
```

---

# PART IV: PROPERTY SPV — BALANCE SHEET

## Source: GAAP Fundamental Equation

```
ASSETS = LIABILITIES + EQUITY
```

This equation MUST balance at all times. Every transaction affects at least two accounts.

### Assets

```
CURRENT ASSETS
  Cash & Cash Equivalents         = Cumulative Cash Flow (ending cash)
  Accounts Receivable             = 0 (simplified for pro forma)
  ─────────────────────────────────────────────────
  Total Current Assets

FIXED ASSETS (ASC 360)
  Land                            = Purchase Price × landValuePercent
  Building & Improvements         = Purchase Price × (1 − landValuePercent) + Building Improvements
  Less: Accumulated Depreciation  = Monthly Depreciation × Months Since Acquisition
  ─────────────────────────────────────────────────
  Net Property Value              = Land + Building − Accumulated Depreciation
  ─────────────────────────────────────────────────
  TOTAL ASSETS                    = Current Assets + Net Property Value
```

**IRS / ASC 360 Rules:**
- Land NEVER depreciates (IRS Pub 946, Section 3)
- Building depreciates over 27.5 years (residential rental, straight-line)
- Building Improvements are added to the depreciable basis
- Accumulated depreciation is cumulative from acquisition date
- Property is NOT revalued to market (held at historical cost less depreciation per GAAP)

### Liabilities

```
LONG-TERM LIABILITIES
  Mortgage / Loan Outstanding     = Original Loan − Cumulative Principal Paid
  ─────────────────────────────────────────────────
  TOTAL LIABILITIES               = Debt Outstanding
```

**ASC 470 Rules:**
- Debt is recorded at face value (no fair value adjustment for pro forma)
- Each monthly payment splits into interest (expense) and principal (liability reduction)
- After refinance: old loan is extinguished, new loan balance replaces it (ASC 470-50)
- At exit: all outstanding debt must be repaid from sale proceeds

### Equity

```
EQUITY
  Initial Equity Investment       = Total Investment − Loan Amount
  Retained Earnings               = Cumulative Net Income
  ─────────────────────────────────────────────────
  TOTAL EQUITY                    = Total Assets − Total Liabilities
```

### Balance Sheet Check

```
TOTAL ASSETS = TOTAL LIABILITIES + TOTAL EQUITY
```

If this does not balance within rounding tolerance ($1), there is a calculation error.

---

# PART V: MANAGEMENT COMPANY — FINANCIAL STATEMENTS

The Management Company is a **service company** — it has NO real estate assets, NO depreciation, NO debt (it is SAFE-funded). Its financial statements are fundamentally simpler.

## Management Company Income Statement

```
┌──────────────────────────────────────────────────────────────────┐
│            MANAGEMENT COMPANY INCOME STATEMENT                   │
│                   (Service Company)                              │
├──────────────────────────────────────────────────────────────────┤
│ REVENUE                                                          │
│   Base Management Fee Revenue   = Σ(Property Revenue) × baseFee  │
│   Incentive Fee Revenue         = max(0, Σ(Property GOP) × fee)  │
│   ───────────────────────────                                    │
│   TOTAL REVENUE                                                  │
├──────────────────────────────────────────────────────────────────┤
│ OPERATING EXPENSES                                               │
│   Partner Compensation          (yearly schedule ÷ 12)           │
│   Staff Compensation            (FTE × salary × escalation ÷ 12)│
│   Office Lease                  (fixed, escalated)               │
│   Professional Services         (fixed, escalated)               │
│   Technology Infrastructure     (fixed, escalated)               │
│   Business Insurance            (fixed, escalated)               │
│   Travel Costs                  (per property, variable)         │
│   IT Licensing                  (per property, variable)         │
│   Marketing                     (% of revenue)                   │
│   Miscellaneous Operations      (% of revenue)                   │
│   ───────────────────────────                                    │
│   TOTAL EXPENSES                                                 │
├──────────────────────────────────────────────────────────────────┤
│ NET INCOME                      = Revenue − Expenses             │
├──────────────────────────────────────────────────────────────────┤
│ SAFE FUNDING                    (not revenue — capital inflow)   │
│ CASH FLOW                      = Net Income + SAFE Funding       │
└──────────────────────────────────────────────────────────────────┘
```

**Key Differences from Property SPV:**
- No depreciation (no real estate assets)
- No interest expense (no debt — funded by SAFE agreements)
- No principal payments
- No NOI concept (NOI is a real estate metric)
- SAFE funding is NOT revenue — it is equity capital (classified as financing activity)
- Expenses begin only AFTER company operations start (Funding Gate rule)
- Revenue begins only when properties are operational and generating fees

**Fee Linkage Rule:** The Management Company's revenue MUST exactly match the sum of Management Fee expenses across all properties. This is a mandatory cross-entity validation.

**Expense Categories:**
- **Fixed costs** (escalate at `fixedCostEscalationRate`): Partner comp, staff comp, office lease, professional services, tech infra, business insurance
- **Variable costs** (escalate at `inflationRate`): Travel (per active property), IT licensing (per active property)
- **Revenue-linked**: Marketing (% of revenue), Misc Ops (% of revenue)

**Staffing Tiers:** Staff FTE is determined by active property count:
- Tier 1: ≤ N properties → X FTE
- Tier 2: ≤ M properties → Y FTE
- Tier 3: > M properties → Z FTE

---

# PART VI: DCF ANALYSIS (Discounted Cash Flow)

## Source: CFA Institute, Corporate Finance Institute

DCF analysis values a property based on the present value of its expected future cash flows.

### Property-Level DCF

The DCF for each property SPV follows the standard real estate investment analysis framework:

```
Year 0 (Acquisition):
  CF₀ = −Equity Investment
      = −(Purchase Price + Improvements + Pre-Opening + Reserve − Loan Amount)

Years 1–N (Operating Period):
  CFₜ = Free Cash Flow to Equity (FCFE)
      = NOI − Total Debt Service − Income Tax
      = Net Income + Depreciation − Principal Payment
  
  (Both formulas MUST produce the same result)

Year N (Exit / Disposition):
  Exit CF = Sale Proceeds − Outstanding Debt − Selling Costs
  where:
    Sale Proceeds = Stabilized NOI ÷ Exit Cap Rate
    Selling Costs = Sale Proceeds × Commission Rate
    Outstanding Debt = Remaining loan balance at exit
```

### FCFE — Two Methods That Must Agree

**Method 1 (Direct):**
```
FCFE = NOI − Total Debt Service − Income Tax + Refinance Proceeds
     = NOI − (Interest + Principal) − Tax + Refi
```

**Method 2 (From Net Income, per Corporate Finance Institute):**
```
FCFE = Net Income + Depreciation − CapEx − Principal + Net Borrowing
     = (NOI − Interest − Depreciation − Tax) + Depreciation − 0 − Principal + Refi
     = NOI − Interest − Tax − Principal + Refi
```

Both methods produce identical results. This is a mandatory validation check.

### Net Present Value (NPV)

```
NPV = Σ [CFₜ / (1 + r)ᵗ]   for t = 0 to N

where r = discount rate (required rate of return)
```

If NPV > 0, the investment exceeds the required return.
If NPV = 0, the investment exactly meets the required return (IRR = discount rate).
If NPV < 0, the investment falls short.

---

# PART VII: IRR ANALYSIS (Internal Rate of Return)

## Source: CFA Institute

IRR is the discount rate that makes the NPV of all cash flows equal to zero:

```
0 = Σ [CFₜ / (1 + IRR)ᵗ]   for t = 0 to N
```

### Solution Method: Newton-Raphson

IRR cannot be solved algebraically for multi-period cash flows. We use the Newton-Raphson iterative method:

```
1. Initial guess: r₀ = (total positive CFs / |total negative CFs|)^(1/N) − 1
2. Iterate: rₙ₊₁ = rₙ − NPV(rₙ) / NPV'(rₙ)
   where NPV'(r) = Σ [−t × CFₜ / (1 + r)^(t+1)]
3. Converge when |NPV(rₙ)| < tolerance (1e-8)
4. Guard: clamp rate to [-0.99, 100] to prevent divergence
```

### Cash Flow Array Construction for IRR

```
cashFlows[0] = −Equity Investment           (negative: cash outflow)
cashFlows[1] = Year 1 FCFE                  (positive if profitable)
cashFlows[2] = Year 2 FCFE
...
cashFlows[N] = Year N FCFE + Exit Proceeds  (terminal value included)
```

### Portfolio-Level IRR

For the consolidated portfolio:
```
cashFlows[0] = −Σ(all property equity investments)
cashFlows[t] = Σ(all property FCFE for year t)
cashFlows[N] += Σ(all property exit values)
```

### IRR Interpretation for Hotels

| IRR Range | Assessment |
|-----------|-----------|
| < 8% | Below institutional threshold |
| 8–12% | Core/Core-Plus (stabilized, low-risk) |
| 12–18% | Value-Add (repositioning opportunity) |
| 18–25% | Opportunistic (significant upside) |
| > 25% | Exceptional (verify assumptions) |

---

# PART VIII: CROSS-STATEMENT ITEM TREATMENT REFERENCE

This is the definitive reference for how every financial item flows across all three statements.

## Interest Expense (ASC 470)

| Statement | Treatment | Reason |
|-----------|----------|--------|
| **Income Statement** | EXPENSE (below NOI) | Cost of borrowing money; reduces taxable income |
| **Cash Flow Statement** | OPERATING ACTIVITY (embedded in NI) | GAAP default: interest paid is operating (ASC 230.27) |
| **Balance Sheet** | No direct effect | Already reflected through Net Income → Retained Earnings |

## Principal Payment (ASC 470)

| Statement | Treatment | Reason |
|-----------|----------|--------|
| **Income Statement** | **DOES NOT APPEAR** | Not an expense — repayment of borrowed capital |
| **Cash Flow Statement** | FINANCING ACTIVITY (cash outflow) | Returns capital to lender |
| **Balance Sheet** | REDUCES LIABILITY (debt outstanding decreases) | Balance goes down each month |

## Depreciation (ASC 360, IRS Pub 946)

| Statement | Treatment | Reason |
|-----------|----------|--------|
| **Income Statement** | EXPENSE (below NOI, non-cash) | Allocates asset cost over useful life |
| **Cash Flow Statement** | ADDED BACK in Operating Activities | Non-cash expense; cash was spent at acquisition |
| **Balance Sheet** | REDUCES ASSET (accumulated depreciation) | Net property value decreases each period |

## Income Tax (ASC 740)

| Statement | Treatment | Reason |
|-----------|----------|--------|
| **Income Statement** | EXPENSE (reduces Net Income) | Only when taxable income > 0 |
| **Cash Flow Statement** | Already in NI (Operating Activity) | Cash outflow when paid |
| **Balance Sheet** | No direct effect | Reflected through Net Income → Retained Earnings |

## FF&E Reserve

| Statement | Treatment | Reason |
|-----------|----------|--------|
| **Income Statement** | Deducted in NOI calculation | Contractual reserve (% of revenue) |
| **Cash Flow Statement** | Already in NOI (Operating) | Cash is set aside for future capital needs |
| **Balance Sheet** | Part of Cash (could be segregated) | Accumulates as restricted cash |

## Loan Proceeds (at Acquisition)

| Statement | Treatment | Reason |
|-----------|----------|--------|
| **Income Statement** | **DOES NOT APPEAR** | Not revenue — creates an obligation |
| **Cash Flow Statement** | FINANCING ACTIVITY (cash inflow) | Borrowing money |
| **Balance Sheet** | INCREASES LIABILITY + ASSET | Debt goes up, Cash/Property goes up |

## Refinance Proceeds (ASC 470-50)

| Statement | Treatment | Reason |
|-----------|----------|--------|
| **Income Statement** | **DOES NOT APPEAR** | Not revenue — debt restructuring |
| **Cash Flow Statement** | FINANCING ACTIVITY (cash inflow) | Net proceeds from new loan |
| **Balance Sheet** | CHANGES LIABILITY structure | Old debt replaced by new debt |

## Property Purchase

| Statement | Treatment | Reason |
|-----------|----------|--------|
| **Income Statement** | **DOES NOT APPEAR** | Not an expense — creates an asset |
| **Cash Flow Statement** | INVESTING ACTIVITY (cash outflow) | Acquisition of long-term asset |
| **Balance Sheet** | CREATES ASSET (property value) | Land + Building at cost |

## SAFE Funding (Management Company)

| Statement | Treatment | Reason |
|-----------|----------|--------|
| **Income Statement** | **DOES NOT APPEAR** | Not revenue — equity capital |
| **Cash Flow Statement** | FINANCING ACTIVITY (cash inflow) | Equity investment received |
| **Balance Sheet** | INCREASES EQUITY + CASH | Equity goes up, Cash goes up |

---

# PART IX: MANDATORY VALIDATION IDENTITIES

Every financial calculation must satisfy these identities. Failure of any identity indicates a calculation error.

## Income Statement Identities

```
1. Total Revenue = Room Revenue + F&B + Events + Other
2. GOP = Total Revenue − Total Operating Expenses
3. NOI = GOP − Base Fee − Incentive Fee − FF&E Reserve
4. Taxable Income = NOI − Interest Expense − Depreciation
5. Income Tax = max(0, Taxable Income × Tax Rate)
6. Net Income = NOI − Interest − Depreciation − Income Tax
```

## Cash Flow Statement Identities

```
7. Operating CF = Net Income + Depreciation
8. Financing CF = −Principal Payment + Refinance Proceeds
9. Total Cash Flow = Operating CF + Financing CF  (must reconcile)
10. Total Cash Flow = NOI − Total Debt Service − Income Tax  (direct method check)
```

## Balance Sheet Identity

```
11. Total Assets = Total Liabilities + Total Equity
12. Net Property Value = Land + (Building − Accumulated Depreciation)
13. Land Value = Purchase Price × landValuePercent (land NEVER depreciates)
```

## Debt Service Identities

```
14. Total Debt Service = Interest Expense + Principal Payment
15. Interest = Remaining Balance × Monthly Rate
16. Principal = PMT − Interest
17. New Balance = Old Balance − Principal (monotonically decreasing)
```

## Cross-Entity Identity

```
18. Σ(Property Management Fee Expense) = Management Company Fee Revenue
```

## DCF / IRR Identities

```
19. FCFE (direct) = NOI − Debt Service − Tax + Refi Proceeds
20. FCFE (indirect) = Net Income + Depreciation − Principal + Refi Proceeds
21. Identity 19 must equal Identity 20 for every period
22. NPV at IRR = 0 (within convergence tolerance)
```

---

# PART X: TIMING AND ACTIVATION RULES

## Property Activation

```
Pre-Operations (before operationsStartDate):
  - Revenue = 0
  - Operating Expenses = 0
  - GOP = 0, NOI = 0
  - No management fees generated

Pre-Acquisition (before acquisitionDate):
  - Depreciation = 0
  - Debt Service = 0
  - Property Value = 0 on Balance Sheet
  - No debt outstanding

Post-Acquisition, Pre-Operations:
  - Depreciation begins (asset is placed in service)
  - Debt service begins (loan is active)
  - Revenue = 0 (not yet operational)
  - NOI is negative (only fixed costs, no revenue)
```

## Management Company Activation

```
Pre-Funding (before SAFE tranche date):
  - Cash = 0 (no capital received)
  - Cannot incur expenses (Funding Gate)

Pre-Operations (before companyOpsStartDate):
  - No expenses incurred
  - Revenue may accrue if properties are already operating

Post-Operations:
  - All expense categories activate
  - Revenue = fees from operational properties
```

---

# PART XI: USALI CHART OF ACCOUNTS REFERENCE

Based on USALI 12th Edition and Intuit Hospitality COA:

```
REVENUE ACCOUNTS (4000 series)
  4000  Room Revenue
  4100  Food & Beverage Revenue
  4200  Events & Conference Revenue
  4300  Other Operated Revenue
  4400  Rental & Other Income

DEPARTMENTAL EXPENSE ACCOUNTS (5000 series)
  5000  Rooms Division Expenses
  5100  Food & Beverage Expenses
  5200  Events Expenses
  5300  Other Operated Expenses

UNDISTRIBUTED OPERATING EXPENSES (6000 series)
  6000  Administrative & General
  6100  Sales & Marketing
  6200  Property Operations & Maintenance
  6300  Utilities
  6400  Information & Telecommunications

FIXED CHARGES (7000 series)
  7000  Management Fees
  7100  Property Taxes
  7200  Insurance
  7300  FF&E Reserve

CAPITAL ITEMS (below NOI)
  8000  Interest Expense
  8100  Depreciation & Amortization
  8200  Income Tax Provision

ASSET ACCOUNTS (1000 series)
  1000  Cash & Cash Equivalents
  1100  Accounts Receivable
  1500  Land
  1510  Building & Improvements
  1520  FF&E
  1530  Accumulated Depreciation (contra-asset)

LIABILITY ACCOUNTS (2000 series)
  2000  Accounts Payable
  2500  Mortgage / Loan Payable

EQUITY ACCOUNTS (3000 series)
  3000  Owner's Equity / Paid-in Capital
  3100  Retained Earnings
```

---

# PART XII: ENGINE IMPLEMENTATION MAPPING

This section maps the authoritative rules above to actual code files and functions.

| Concept | Code Location | Function/Field |
|---------|--------------|----------------|
| Monthly pro forma engine | `client/src/lib/financial/property-engine.ts` | `generatePropertyProForma()` |
| Management company pro forma | `client/src/lib/financial/company-engine.ts` | `generateCompanyProForma()` |
| Loan calculations (PMT, balance) | `client/src/lib/loanCalculations.ts` | `calculateLoanParams()` |
| Yearly cash flows & FCFE | `client/src/lib/loanCalculations.ts` | `calculatePropertyYearlyCashFlows()` |
| IRR solver | `analytics/returns/irr.ts` | `computeIRR()` (Newton-Raphson) |
| Shared PMT function | `calc/shared/pmt.ts` | `pmt()` |
| DSCR calculator | `calc/financing/dscr-calculator.ts` | `computeDSCR()` |
| Debt yield calculator | `calc/financing/debt-yield.ts` | `computeDebtYield()` |
| Sensitivity analysis | `calc/financing/sensitivity.ts` | `computeSensitivity()` |
| Refinance calculator | `calc/refinance/` | `computeRefinance()` |
| Prepayment calculator | `calc/financing/prepayment.ts` | `computePrepayment()` |
| Cross-calculator validation | `client/src/lib/crossCalculatorValidation.ts` | `crossValidateFinancingCalculators()` |
| Financial auditor | `client/src/lib/financialAuditor.ts` | `runFullAudit()` |
| Verification suite | `client/src/lib/runVerification.ts` | `runFullVerification()` |
| Income Statement component | `client/src/components/YearlyIncomeStatement.tsx` | React component |
| Cash Flow Statement component | `client/src/components/YearlyCashFlowStatement.tsx` | React component |
| Balance Sheet component | `client/src/components/ConsolidatedBalanceSheet.tsx` | React component |
| Constants (defaults) | `client/src/lib/constants.ts` | All `DEFAULT_*` values |
