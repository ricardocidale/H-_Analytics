# Mandatory Validation Identities

Every financial calculation must satisfy these identities. Failure of any identity indicates a calculation error.

---

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
