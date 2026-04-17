# Management Company — Financial Statements

## Source Components
- `client/src/lib/financial/company-engine.ts` (`generateCompanyProForma`)
- `client/src/pages/Company.tsx`

---

The Management Company is a **service company** — it has NO real estate assets, NO depreciation, NO debt (it is SAFE-funded). Its financial statements are fundamentally simpler.

## Management Company Income Statement

```
┌──────────────────────────────────────────────────────────────────┐
│            MANAGEMENT COMPANY INCOME STATEMENT                   │
│                   (Service Company)                              │
├──────────────────────────────────────────────────────────────────┤
│ REVENUE                                                          │
│   Base Management Fee Revenue   = Σ(Property[i].Revenue × Property[i].baseManagementFeeRate)  │
│   Incentive Fee Revenue         = Σ(max(0, Property[i].GOP × Property[i].incentiveManagementFeeRate))  │
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
│   Marketing                     (% of mgmt fee revenue)          │
│   Miscellaneous Operations      (% of mgmt fee revenue)          │
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
- **No exit cap rate** — see "Terminal Value" rule below
- SAFE funding is NOT revenue — it is equity capital (classified as financing activity)
- Expenses begin only AFTER company operations start (Funding Gate rule)
- Revenue begins only when properties are operational and generating fees

---

## CANONICAL RULE — Management Company Has No Exit Cap Rate

The Management Company is an **operating service business**, not a real-estate asset. Cap-rate exit valuation (Value = NOI ÷ cap rate) is a real-estate concept and **MUST NOT be applied** to the Management Company under any circumstance.

If a terminal/exit value for the Management Company is ever required, the **only** acceptable methods are:
1. **Discounted Free Cash Flow (DCF)** — discount projected FCF at `costOfEquity` (the WACC Re input already in the model)
2. **EBITDA multiple** — service-business comparables

**Never** use `exitCapRate`, `salesCommissionRate`, or `dispositionCommission` on the Management Company entity.

### Where these fields actually belong
The fields `exitCapRate`, `salesCommissionRate` and `dispositionCommission` are **property defaults**. In the engine they are read as `property.exitCapRate ?? global?.exitCapRate ?? DEFAULT_EXIT_CAP_RATE` inside `engine/aggregation/cashFlowAggregator.ts` and `engine/aggregation/yearlyAggregator.ts` — they cascade from the global/company defaults bag into each property's last-year exit valuation. The `global` bag is a **defaults carrier**, not a statement of company-level exit. Putting these fields on a "Tax & Exit" tab of the Company page was a UX mis-categorization, not a financial statement.

### Company-level fields that ARE legitimate
- `costOfEquity` — required equity return (Re). Used as the WACC Re input for property DCF and as the discount rate for any Management Company DCF.
- `companyTaxRate` — corporate tax rate applied to the Management Company's taxable income.

### Engine-side enforcement contract
`generateCompanyProForma` in `client/src/lib/financial/company-engine.ts` MUST NOT:
- Read `exitCapRate`, `salesCommissionRate`, or `dispositionCommission` from the company entity
- Compute a terminal/exit value for the Management Company via cap rate
- Add a "sale of company" line to the Management Company cash flow statement

If a future requirement adds a Management Company terminal value, it must be implemented as a separate FCF/DCF module and clearly labeled as such in both code and UI.

**Fee Linkage Rule:** The Management Company's revenue MUST exactly match the sum of Management Fee expenses across all properties. This is a mandatory cross-entity validation.

**Expense Categories:**
- **Fixed costs** (escalate at `fixedCostEscalationRate`): Partner comp, staff comp, office lease, professional services, tech infra, business insurance
- **Variable costs** (escalate at `inflationRate`): Travel (per active property), IT licensing (per active property)
- **Revenue-linked**: Marketing (% of mgmt fee revenue), Misc Ops (% of mgmt fee revenue)

**Staffing Tiers:** Staff FTE is determined by active property count:
- Tier 1: ≤ N properties → X FTE
- Tier 2: ≤ M properties → Y FTE
- Tier 3: > M properties → Z FTE

**SAFE Funding Treatment:**
- SAFE (Simple Agreement for Future Equity) tranches are capital contributions, NOT revenue
- They appear on the Cash Flow Statement as financing activities
- They increase the company's cash position but do not affect Net Income
- The Funding Gate rule prevents expenses from being incurred before SAFE capital is received

---

## Common-Size Analysis (Percentage Rows)

### Income Statement
- **OpEx % of Revenue** row after operating expenses — shows `totalExpenses / totalRevenue × 100`
- Styled as italic gray inline row (not using shared MarginRow due to different table structure)

### Cash Flow Statement
- **% of Revenue** row after Net Cash from Operating Activities — shows `cashFromOps / totalRevenue × 100`
- Same inline styling pattern

### Assumption Label Clarity
Labels in CompanyAssumptions.tsx now specify the exact revenue base:
- **Marketing** → `(% of Mgmt Fee Revenue)` — percentage of total management fee revenue (base + incentive)
- **Misc Operations** → `(% of Mgmt Fee Revenue)` — same base as marketing
- **Base Management Fee** → `(% of Property Gross Revenue)` — per-property rate, defined on each property's edit page (default 5%, `DEFAULT_BASE_MANAGEMENT_FEE_RATE`)
- **Incentive Fee** → `(% of Property GOP)` — per-property rate, defined on each property's edit page (default 15%, `DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE`)
