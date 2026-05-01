# DCF Analysis (Discounted Cash Flow)

## Source
- CFA Institute, Corporate Finance Institute methodology
- `client/src/components/InvestmentAnalysis.tsx`

---

DCF analysis values a property based on the present value of its expected future cash flows.

## Property-Level DCF

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

## FCFE — Two Methods That Must Agree

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

## Net Present Value (NPV)

```
NPV = Σ [CFₜ / (1 + r)ᵗ]   for t = 0 to N

where r = discount rate (required rate of return)
```

If NPV > 0, the investment exceeds the required return.
If NPV = 0, the investment exactly meets the required return (IRR = discount rate).
If NPV < 0, the investment falls short.
