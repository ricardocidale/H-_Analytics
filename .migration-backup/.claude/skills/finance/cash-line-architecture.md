# Cash Line Architecture — Virtual Cash Flow Tracking

Each property SPV tracks cash through separate virtual lines that map directly to GAAP statement requirements. This separation ensures that every financial item flows correctly to the Income Statement, Cash Flow Statement, and Balance Sheet without cross-contamination.

---

## Why Separate Cash Lines?

The same dollar amount can appear differently (or not at all) depending on which statement you're looking at. Tracking cash in separate virtual lines prevents the most common pro forma errors:

| Error | Cause | Prevention |
|-------|-------|-----------|
| Principal on Income Statement | Mixing debt service into operating expenses | Separate `principalPayment` line |
| Missing depreciation add-back | Not tracking non-cash expenses separately | Separate `depreciationExpense` line |
| Refinance proceeds as revenue | Mixing financing inflows with operating revenue | Separate `refinancingProceeds` line |
| Interest classified as financing | Combining interest with principal as "debt service" | Separate `interestExpense` line |

---

## Virtual Cash Lines (MonthlyFinancials)

### 1. Operating Cash Lines

These lines represent cash generated or consumed by hotel operations.

```
Revenue Lines (cash inflows from operations):
  revenueRooms          Room Revenue = Sold Rooms x ADR
  revenueFB             F&B Revenue
  revenueEvents         Events & Conference Revenue
  revenueOther          Other Revenue
  revenueTotal          Sum of all revenue

Expense Lines (cash outflows from operations):
  expenseRooms          Rooms department costs
  expenseFB             F&B department costs
  expenseEvents         Events department costs
  expenseOther          Other department costs
  expenseMarketing      Marketing & sales costs
  expensePropertyOps    Property operations & maintenance
  expenseUtilitiesVar   Variable utilities
  expenseUtilitiesFixed Fixed utilities
  expenseAdmin          Administrative & general
  expenseIT             IT & systems
  expenseInsurance      Insurance
  expenseTaxes          Property taxes
  expenseOtherCosts     Other fixed costs
  expenseFFE            FF&E Reserve (% of revenue)
  totalExpenses         Sum of all expenses

Fee Lines (deducted between GOP and NOI):
  feeBase               Base management fee (% of revenue)
  feeIncentive          Incentive management fee (% of GOP)

Profitability Lines (derived):
  gop                   Gross Operating Profit = Revenue - OpEx
  noi                   Net Operating Income = GOP - Fees - FFE
```

**Statement mapping:** All operating lines appear on the Income Statement. Cash equivalents flow to Cash Flow Statement Operating Activities.

### 2. Interest Line (separated from principal)

```
  interestExpense       Monthly interest = Remaining Balance x Monthly Rate
```

**Why separated:**
- Income Statement: YES (expense below NOI, reduces taxable income)
- Cash Flow Statement: Operating Activity (ASC 230 default for US GAAP)
- Balance Sheet: No direct effect (embedded in Net Income -> Retained Earnings)

### 3. Principal Payment Line (separated from interest)

```
  principalPayment      Monthly principal = PMT - Interest
```

**Why separated:**
- Income Statement: NEVER APPEARS (not an expense — repayment of borrowed capital)
- Cash Flow Statement: Financing Activity (cash outflow)
- Balance Sheet: Reduces Liability (debt outstanding decreases)

### 4. Combined Debt Service (derived, not a source line)

```
  debtPayment           = interestExpense + principalPayment
```

This is a convenience field only. It must never be used as a single line item on statements — always decompose back to interest and principal.

### 5. Depreciation Line (non-cash)

```
  depreciationExpense   = Depreciable Basis / 27.5 / 12
```

**Why separated:**
- Income Statement: YES (expense below NOI, reduces taxable income)
- Cash Flow Statement: Added BACK in Operating Activities (non-cash — ASC 230)
- Balance Sheet: Reduces Asset (accumulated depreciation increases)

Depreciation represents no cash movement. It is purely an accounting allocation of the property's cost over its useful life (ASC 360, IRS Pub 946). The cash left the business at acquisition.

### 6. Financing Lines

```
  refinancingProceeds   Net proceeds from cash-out refinance (ASC 470-50)
```

**Why separated:**
- Income Statement: NEVER APPEARS (not revenue — debt restructuring)
- Cash Flow Statement: Financing Activity (cash inflow)
- Balance Sheet: Changes liability structure (old debt extinguished, new debt recorded)

### 7. Tax Line

```
  incomeTax             = max(0, Taxable Income x Tax Rate)
```

**Why separated:**
- Income Statement: YES (expense, reduces Net Income)
- Cash Flow Statement: Already embedded in Net Income (Operating Activity)
- Balance Sheet: No direct effect (flows through Retained Earnings)

### 8. Cash Position Lines (cumulative tracking)

```
  cashFlow              Net cash generated this period
  operatingCashFlow     Cash from operations (NOI - Interest - Tax + Depreciation add-back)
  financingCashFlow     Cash from financing (-Principal + Refinance Proceeds)
  endingCash            Cumulative cash position (running total)
  cashShortfall         Boolean flag: true if endingCash < 0 (business rule violation)
```

### 9. Balance Sheet Lines

```
  propertyValue         Property at cost (activates post-acquisition)
  debtOutstanding       Remaining loan balance
```

---

## Yearly Aggregation (YearlyCashFlowResult)

Monthly lines roll up to yearly with additional derived metrics:

```
Operating Performance:
  noi                   Annual NOI
  interestExpense       Annual interest (sum of monthly)
  depreciation          Annual depreciation (sum of monthly)
  netIncome             NOI - Interest - Depreciation - Tax
  taxLiability          Annual income tax

GAAP Cash Flow (Indirect Method):
  operatingCashFlow     Net Income + Depreciation
  workingCapitalChange  Changes in receivables/payables (zero in pro forma)
  cashFromOperations    OCF +/- Working Capital

Free Cash Flow:
  maintenanceCapex      FF&E reserves, maintenance CapEx
  freeCashFlow          Cash from Operations - Maintenance CapEx
  freeCashFlowToEquity  FCF - Principal Payments

Financing:
  principalPayment      Annual principal (sum of monthly)
  debtService           Annual debt service (interest + principal)
  refinancingProceeds   Net refinance proceeds (year of refi only)

Capital Events:
  capitalExpenditures   Equity investment (acquisition year only)
  exitValue             Sale proceeds - outstanding debt - costs (exit year only)

Investor Returns:
  netCashFlowToInvestors  FCFE + Refinance + Exit - Equity
  cumulativeCashFlow      Running total
```

---

## ASC 230 Three-Section Mapping

The separate cash lines map directly to the Cash Flow Statement's three required sections:

```
OPERATING ACTIVITIES (from operating + interest + depreciation + tax lines):
  Net Income (from operating lines minus interest, depreciation, tax)
  + Depreciation (add back non-cash from depreciation line)
  = Cash from Operations

INVESTING ACTIVITIES (from acquisition events):
  - Property Acquisitions (equity portion at acquisition)
  - Capital Expenditures (FF&E from operating lines)
  + Sale Proceeds (at exit)
  = Cash from Investing

FINANCING ACTIVITIES (from principal + financing lines):
  + Equity Contributions (at acquisition)
  + Loan Proceeds (at acquisition)
  - Principal Payments (from principal line — NOT interest)
  + Refinance Proceeds (from financing line)
  = Cash from Financing

NET CHANGE IN CASH = Operating + Investing + Financing
```

---

## Implementation Files

| Concept | File | Key Fields |
|---------|------|-----------|
| Monthly cash lines | `client/src/lib/financial/property-engine.ts` | `MonthlyFinancials` interface |
| Yearly aggregation | `client/src/lib/loanCalculations.ts` | `YearlyCashFlowResult` interface |
| Three-section mapping | `client/src/lib/cashFlowSections.ts` | `CashFlowSections` interface |
| Income aggregation | `client/src/lib/yearlyAggregator.ts` | `aggregatePropertyByYear()` |
| Cash flow aggregation | `client/src/lib/cashFlowAggregator.ts` | `aggregateCashFlowByYear()` |
| Loan math (PMT) | `calc/shared/pmt.ts` | `pmt()` |
| Equity calculations | `client/src/lib/equityCalculations.ts` | `acquisitionLoanAmount()` |

---

## Validation Rules

1. `debtPayment` MUST equal `interestExpense + principalPayment` every month
2. `operatingCashFlow` MUST equal `netIncome + depreciationExpense`
3. `endingCash` MUST equal previous `endingCash` + current period `cashFlow`
4. `cashShortfall` MUST be `true` when `endingCash < 0`
5. Interest must appear on Income Statement; principal must NOT
6. Depreciation must appear on Income Statement AND be added back on Cash Flow
7. Refinance proceeds must appear ONLY on Cash Flow (financing), never Income Statement
