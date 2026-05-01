# Funding, Financing & Refinancing Formulas

> Pure formula reference for debt structuring, equity requirements, refinancing mechanics, and SAFE funding.
> Loan amortization operates on a **monthly** schedule; summaries are annualized for reporting.

---

## Acquisition Financing

| ID | Formula | Description |
|--------|---------|-------------|
| F-F-01 | `Loan Amount = Purchase Price × Acquisition LTV` | Senior debt sized as percentage of purchase price |
| F-F-02 | `Closing Costs = Loan Amount × Acquisition Closing Cost Rate` | Origination fees, legal, title, and lender costs |
| F-F-03 | `Monthly Rate (r) = Annual Interest Rate ÷ 12` | Periodic interest rate for amortization schedule |
| F-F-04 | `PMT = Loan Amount × [r(1 + r)^n] ÷ [(1 + r)^n − 1]` | Fixed monthly payment (principal + interest); where r = monthly rate, n = term years × 12 |
| F-F-05 | `Interest Expense(month) = Outstanding Balance × Monthly Rate` | Monthly interest accrual on remaining principal |
| F-F-06 | `Principal Payment(month) = PMT − Interest Expense` | Monthly principal reduction (amortization) |
| F-F-07 | `Outstanding Balance(month) = Previous Balance − Principal Payment` | Declining loan balance after each payment |

---

## Equity Requirement

| ID | Formula | Description |
|--------|---------|-------------|
| F-F-08 | `Total Property Cost = Purchase Price + Building Improvements + Pre-Opening Costs + Operating Reserve + Closing Costs` | All-in acquisition cost basis including soft costs |
| F-F-09 | `Equity Invested = Total Property Cost − Loan Amount` | Residual capital required from equity investors after debt |

---

## Refinancing (Post-Stabilization)

| ID | Formula | Description |
|--------|---------|-------------|
| F-F-10 | `Stabilization: Property reaches target occupancy` | Typically 12–24 months after operations start (configurable via `stabilizationMonths`) |
| F-F-11 | `Refinance triggers after stabilizationMonths + refinance period` | Calendar-based trigger point for refinancing event |
| F-F-12 | `Refi Appraised Value = Stabilized NOI ÷ Exit Cap Rate` | Income capitalization approach to determine current market value |
| F-F-13 | `Refi Loan Amount = min(Refi Appraised Value × Refi LTV, available capacity)` | New senior debt sized against stabilized value |
| F-F-14 | `Refi Closing Costs = Refi Loan Amount × Refi Closing Cost Rate` | Origination and transaction costs on new loan |
| F-F-15 | `Net Refi Proceeds = Refi Loan Amount − Previous Outstanding Balance − Refi Closing Costs` | Cash-out amount after retiring existing debt and paying costs |
| F-F-16 | `If Net Refi Proceeds > 0: distributed to equity investors` | Partial return of capital — reduces effective equity basis |
| F-F-17 | `New Monthly Payment = PMT(new loan amount, new rate, new term)` | Recalculated amortization using F-F-04 with refinanced terms |
| F-F-18 | `Debt service switches to new terms from refi month forward` | All subsequent periods use refinanced loan parameters |

---

## SAFE Funding (Management Company)

| ID | Formula | Description |
|--------|---------|-------------|
| F-F-19 | `SAFE = Simple Agreement for Future Equity (Y Combinator standard)` | Pre-revenue convertible instrument for management company capitalization |
| F-F-20 | `Tranche 1: Fixed amount on scheduled date` | First capital injection — gates company operations (see F-C-20) |
| F-F-21 | `Tranche 2: Fixed amount on scheduled date (optional)` | Second capital injection for growth phase |
| F-F-22 | `Valuation Cap and Discount Rate define conversion terms at future priced round` | SAFE converts to equity at the lesser of (a) price implied by valuation cap or (b) next-round price × (1 − discount rate) |
| F-F-23 | `SAFE is recorded as liability until conversion event` | Per ASC 480 — classified as obligation, not equity, until priced round triggers conversion |

---

## Debt-Free at Exit Rule

| ID | Formula | Description |
|--------|---------|-------------|
| F-F-24 | `At terminal year: Outstanding Debt must equal 0` | Mandatory Business Rule #4 — no residual leverage at disposition |
| F-F-25 | `Exit proceeds first repay any outstanding loan balance` | Waterfall priority: debt retirement before equity distributions |
| F-F-26 | `Net to Equity = Gross Disposition Value − Commission − Outstanding Debt` | Final equity distribution after all obligations are satisfied |
| F-F-27 | `System enforces this as Mandatory Business Rule #4` | Automated validation check — model will flag violations |
