# Timing and Activation Rules

---

## Property Activation

```
Pre-Operations (before operationsStartDate):
  - Revenue = 0
  - Operating Expenses = 0
  - GOP = 0, NOI = 0
  - No management fees generated (no revenue for base fee, no GOP for incentive fee)

Pre-Acquisition (before acquisitionDate):
  - Depreciation = 0
  - Debt Service = 0
  - Property Value = 0 on Balance Sheet
  - No debt outstanding

Post-Acquisition, Pre-Operations:
  - Depreciation begins (asset is placed in service)
  - Debt service begins (loan is active)
  - Revenue = 0 (not yet operational)
  - Management fees = $0 (no revenue yet, fee rates defined per property)
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
