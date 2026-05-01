# Property SPV — Cash Flow Statement

## Source Components
- `client/src/components/YearlyCashFlowStatement.tsx`
- `client/src/lib/cashFlowAggregator.ts` (`aggregateCashFlowByYear`)
- `client/src/lib/cashFlowSections.ts` (`computeCashFlowSections`)

---

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

## Common-Size Analysis (Percentage Margin Rows)

Cash flow subtotals include percentage rows showing their relationship to Total Revenue for quick operating efficiency assessment.

### Displayed Margins
| After Subtotal | Margin Label | Formula |
|---------------|-------------|---------|
| Net Cash from Operating Activities | % of Total Revenue | `cashFromOperations / revenueTotal × 100` |
| Free Cash Flow (FCF) | % of Total Revenue | `fcf / revenueTotal × 100` |
| Free Cash Flow to Equity (FCFE) | % of Total Revenue | `fcfe / revenueTotal × 100` |

### Implementation
- Uses shared `MarginRow` component from `financial-table-rows.tsx`
- Same styling as Income Statement margins: `text-xs text-gray-400 italic font-mono`
