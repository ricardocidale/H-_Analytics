# Chapter 6: Cash Flow Streams

This is the most critical chapter of the verification manual. Every property SPV generates multiple interacting cash flow streams that must reconcile across the Income Statement, Balance Sheet, and Cash Flow Statement. Understanding these streams — and where they land in each financial statement — is essential for verification.

---

## Overview: Six Cash Flow Streams

Each property Special Purpose Vehicle produces six distinct cash flow streams over its projection period:

| Stream | Direction | Timing | Statement Impact |
|--------|-----------|--------|-----------------|
| A. Equity Injection | Inflow | Year 0 (acquisition) | Cash from Financing (CFF) |
| B. Acquisition Debt | Inflow (proceeds) / Outflow (service) | Year 0 proceeds; monthly service | CFF (proceeds & principal); Income Statement (interest) |
| C. Refinancing | Inflow (net proceeds) / Outflow (new service) | Post-stabilization | CFF (proceeds & principal); Income Statement (interest) |
| D. Exit / Disposition | Inflow (net sale proceeds) | Terminal year | Cash from Investing (CFI) |
| E. Management Fees | Outflow from property | Monthly | Income Statement (operating expense) |
| F. Operating Cash Flow | Net of operations | Monthly | Cash from Operations (CFO) |

---

## Stream A: Equity Injection

The equity contribution represents the sponsor's initial capital commitment to acquire and prepare the property for operations.

**Total Property Cost** comprises five components: the purchase price, building improvements, pre-opening costs, operating reserve, and closing costs.

> Total Property Cost = Purchase Price + Building Improvements + Pre-Opening Costs + Operating Reserve + Closing Costs

**Equity Invested** is then calculated as:

> Equity Invested = Total Property Cost − Loan Amount

The equity injection appears as a positive inflow in Year 0 under Cash from Financing. It is recorded on the Balance Sheet as contributed equity (owners' equity). For financed properties, closing costs on the loan equal the Loan Amount multiplied by the acquisition closing cost rate.

---

## Stream B: Acquisition Financing (Debt)

Acquisition debt is constrained by the Loan-to-Value (LTV) ratio applied to the purchase price.

### Loan Sizing

The loan amount equals the purchase price multiplied by the LTV ratio. The monthly payment is calculated using the standard PMT formula:

> PMT = Loan Amount × [r × (1 + r)^n] / [(1 + r)^n − 1]

where r is the monthly interest rate (annual rate divided by 12) and n is the total number of monthly payments (amortization term in years multiplied by 12).

### GAAP Treatment (ASC 470 — Debt)

The proper accounting treatment for debt requires careful classification across statements:

- **Interest expense** appears on the Income Statement, below GOP and above Net Income.
- **Principal repayment** appears on the Cash Flow Statement only, under Cash from Financing.
- **Loan proceeds** appear on the Cash Flow Statement in Year 0, under Cash from Financing.
- **Outstanding balance** appears on the Balance Sheet as a long-term liability.

Principal repayment is never an expense on the Income Statement. It reduces the liability on the Balance Sheet and appears only in Cash from Financing. This classification is mandated by ASC 470.

### Amortization Schedule

Each monthly payment is split between interest and principal:

> Interest = Outstanding Balance × Monthly Rate
>
> Principal = Monthly Payment − Interest
>
> New Balance = Prior Balance − Principal

Interest declines over time while principal increases — standard amortization behavior.

---

## Stream C: Refinancing Post-Stabilization

### What Is Stabilization?

Stabilization is the point at which a property reaches its target occupancy level after the initial ramp-up period following acquisition or renovation. The ramp-up period is typically 12 to 24 months, during which occupancy grows incrementally from an initial rate toward the maximum sustainable occupancy.

### Why Refinance?

Once stabilized, the property's demonstrated income stream supports a higher appraised value, enabling a larger loan based on the improved valuation, potentially better interest rates reflecting a lower risk profile, and equity recapture — returning invested capital to sponsors.

### Refinance Loan Sizing

The implied property value is calculated as stabilized NOI divided by the exit cap rate. The refinance loan amount equals this implied value multiplied by the refinance LTV ratio.

### Refinance Proceeds

> Net Refi Proceeds = New Loan Amount − Old Outstanding Balance − Refi Closing Costs

Refinance closing costs equal the new loan amount multiplied by the refinance closing cost rate. If net proceeds are positive, the excess is distributed to equity investors via Cash from Financing. The new debt service (PMT on the new loan) replaces the old debt service from the refinance month forward.

### Statement Impact

New loan proceeds appear as an inflow in CFF. Payoff of the old loan appears as an outflow in CFF (netting against proceeds). Refinance closing costs are recorded as an outflow in CFF. From the refinance month forward, the new monthly interest replaces the old interest on the Income Statement, and the new monthly principal replaces the old principal in CFF.

---

## Stream D: Exit Proceeds (Cap Rate Valuation)

At the end of the projection period (typically Year 10), the property is valued and sold using direct capitalization.

### Terminal Valuation

> Gross Disposition Value = Terminal Year NOI ÷ Exit Cap Rate

### Net Proceeds Waterfall

| Step | Calculation |
|------|------------|
| Gross Value | Terminal Year NOI ÷ Exit Cap Rate |
| Less: Sales Commission | Gross Value × Sales Commission Rate (default 5%) |
| Less: Outstanding Debt | Remaining loan balance at exit |
| **Net Proceeds to Equity** | **Gross Value − Commission − Outstanding Debt** |

Exit proceeds appear as a positive inflow under Cash from Investing in the terminal year. Mandatory Business Rule #4 requires all outstanding debt to be fully repaid at disposition.

---

## Stream E: Management Fee Linkage

Management fees create a dual-entity cash flow — they are an expense at the property level and revenue at the Management Company level.

The Base Management Fee equals Total Property Revenue multiplied by the base management fee rate. The Incentive Management Fee equals the greater of zero and GOP multiplied by the incentive fee rate, ensuring no incentive fee is paid when GOP is negative.

On the property side, both fees appear as operating expenses on the Income Statement, below departmental expenses and above NOI. On the Management Company side, the same amounts appear as fee revenue (the company's top line).

The sum of all base and incentive fees across all properties must equal the Management Company's total fee revenue. Any mismatch is a reconciliation error.

---

## Stream F: Operating Cash Flow

Operating cash flow represents the net cash generated by the property's core hospitality operations after servicing debt and paying taxes.

> Operating Cash Flow = NOI − Debt Service − Income Tax

Where NOI equals Total Revenue minus Total Operating Expenses (including management fees), Debt Service equals interest plus principal, and Income Tax equals Taxable Income multiplied by the tax rate. Taxable Income is calculated as NOI minus interest expense minus depreciation.

The running cash balance is computed as:

> Ending Cash = Opening Cash + Operating Cash Flow + Financing Cash Flow

**Mandatory Business Rule #3:** The running cash balance must never go negative in any period. A negative balance indicates the property cannot meet its obligations and the model assumptions must be revised.

---

## The Five Mandatory Business Rules

These rules act as hard constraints on the financial model. Any violation indicates invalid assumptions or a calculation error.

| Rule | Description |
|------|-------------|
| **1. Equity ≥ 0** | Equity invested must be non-negative. If the loan amount exceeds Total Property Cost, the model is over-leveraged. |
| **2. DSCR Floor** | The Debt Service Coverage Ratio (NOI ÷ Debt Service) should meet lender minimums (typically ≥ 1.20×). While not a hard block in the model, the checker should flag properties below this threshold. |
| **3. Cash Never Negative** | The running cash balance must never go negative in any month or year. A negative balance means the property cannot meet its obligations. |
| **4. Debt Repaid at Exit** | All outstanding debt must be fully repaid from disposition proceeds before equity distributions. |
| **5. Balance Sheet Must Balance** | Total Assets = Total Liabilities + Owners' Equity in every period. Any imbalance signals a posting or rounding error. |

---

## Checker Verification Checklist

| Check | Method |
|-------|--------|
| Equity = Total Cost − Loan Amount | Export to Excel and verify the formula |
| PMT matches amortization schedule | Recalculate PMT independently |
| Interest + Principal = Monthly Payment | Sum columns in the amortization export |
| Refi proceeds = New Loan − Old Balance − Costs | Verify at the refinance month |
| Exit Value = Terminal NOI ÷ Exit Cap Rate | Check terminal year NOI and cap rate |
| Management fees match across entities | Compare property expense to company revenue |
| Cash balance never negative | Scan all periods in the cash flow export |
| Balance Sheet balances every period | Assets = Liabilities + Equity |
