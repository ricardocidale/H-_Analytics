# Investment Returns — DCF, FCF, IRR, Equity Multiple Formulas

> Pure formula reference for investment return analytics.
> These formulas operate on **annual** aggregated data (not monthly).

---

## Free Cash Flow (FCF)

| ID | Formula | Description |
|--------|---------|-------------|
| F-R-01 | `FCF = NOI − Income Tax − Capital Expenditures (FF&E)` | Unlevered free cash flow — cash available before debt service; represents operating performance independent of capital structure |

---

## Free Cash Flow to Equity (FCFE)

| ID | Formula | Description |
|--------|---------|-------------|
| F-R-02 | `FCFE = FCF − Debt Service + Net Borrowings` | Levered free cash flow — cash available to equity holders after debt obligations |
| F-R-03 | `FCFE = NOI − Debt Service − Income Tax` | Equivalent formulation as After-Tax Cash Flow (ATCF) |

> **Note:** FCFE represents the actual distributable cash to equity investors in each period.

---

## Equity Invested

| ID | Formula | Description |
|--------|---------|-------------|
| F-R-04 | `Equity = Total Property Cost − Loan Amount` | Initial equity contribution required from investors |
| F-R-05 | `Total Property Cost = Purchase Price + Building Improvements + Pre-Opening Costs + Operating Reserve + Closing Costs` | All-in acquisition cost basis |

---

## IRR (Internal Rate of Return)

| ID | Formula | Description |
|--------|---------|-------------|
| F-R-06 | `Σ(FCFE_t ÷ (1 + r)^t) + Exit Proceeds_T ÷ (1 + r)^T − Equity₀ = 0` | Solve for discount rate `r` that sets NPV of all cash flows to zero |
| F-R-07 | `IRR Cash Flow Vector = [−Equity, FCFE₁, FCFE₂, ..., FCFE_N + Exit Proceeds]` | Ordered cash flow series used as input to IRR solver; Year 0 is negative (investment), terminal year includes exit |
| F-R-08 | `Solution Method: Newton-Raphson iteration` | Numerical root-finding algorithm used to solve the IRR polynomial |

> **Where:** t = 1 to T (projection years), r = IRR, Equity₀ = initial equity outlay

---

## Equity Multiple (MOIC)

| ID | Formula | Description |
|--------|---------|-------------|
| F-R-09 | `Equity Multiple = Total Distributions ÷ Total Equity Invested` | Multiple on Invested Capital — measures total return as a multiple of initial equity |
| F-R-10 | `Total Distributions = Σ(FCFE) + Refi Proceeds + Net Exit Proceeds` | All cash returned to equity investors over the hold period |

> **Interpretation:** A multiple of 2.0× means the investor doubled their money. A 3.0× means tripled.

---

## Exit Value (Terminal Disposition)

| ID | Formula | Description |
|--------|---------|-------------|
| F-R-11 | `Gross Disposition Value = Terminal Year NOI ÷ Exit Cap Rate` | Direct capitalization approach to terminal property value |
| F-R-12 | `Sales Commission = Gross Disposition Value × Commission Rate` | Broker/disposition fee (typically 5%) |
| F-R-13 | `Outstanding Debt at Exit = Amortized loan balance at terminal year` | Remaining principal on acquisition or refinanced loan |
| F-R-14 | `Net Proceeds to Equity = Gross Disposition Value − Sales Commission − Outstanding Debt` | Cash distributable to equity holders after all obligations |
| F-R-15 | `Mandatory Rule: All debt must be repaid at exit` | Business Rule #4 — system enforces full debt retirement at disposition |

---

## Portfolio IRR

| ID | Formula | Description |
|--------|---------|-------------|
| F-R-16 | `Portfolio IRR Cash Vector = [−Σ(Equity), Σ(FCFE₁), ..., Σ(FCFE_N) + Σ(Exit Proceeds)]` | Aggregated cash flows across all properties used to compute blended portfolio return |
| F-R-17 | `Portfolio IRR = Solve for r using aggregated cash flow vector` | Same Newton-Raphson method applied to portfolio-level cash flows |
