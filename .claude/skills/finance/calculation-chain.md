# Calculation Chain — Authoritative Reference

This skill documents every financial formula in the Hospitality Business engine, its authoritative source (IRS, GAAP, USALI, or industry standard), and the exact chain from assumption variables through to financial statement line items.

Any code change to the financial engine MUST be cross-referenced against this document.

---

## 1. Revenue Calculations

### Source: STR (Smith Travel Research) Industry Standards

| Formula | Definition | Source |
|---------|-----------|--------|
| Available Rooms | `roomCount × 30.5` | Industry standard (30.5 days/month) |
| Sold Rooms | `availableRooms × occupancy` | STR methodology |
| Room Revenue | `soldRooms × ADR` | STR: ADR = Total Room Revenue ÷ Rooms Sold |
| RevPAR | `ADR × occupancy` or `roomRevenue ÷ availableRooms` | STR: both methods must agree |
| F&B Revenue | `totalRevenue × revShareFB` | Hospitality Business model |
| Events Revenue | `totalRevenue × revShareEvents` | Hospitality Business model |
| Other Revenue | `totalRevenue × revShareOther` | Hospitality Business model |
| ~~F&B Revenue (DEPRECATED)~~ | ~~`roomRevenue × revShareFB × (1 + cateringBoostPercent)`~~ | ~~Old formula — catering boost removed, revenue shares now % of total~~ |
| Total Revenue | `roomRevenue / (1 - revShareFB - revShareEvents - revShareOther)` | USALI Summary Statement (algebraic derivation) |

### ADR Growth
```
currentADR = startADR × (1 + adrGrowthRate) ^ opsYear
```
Where `opsYear = floor(monthsSinceOps / 12)`. Growth compounds annually from operations start.

### Occupancy Ramp
```
occupancy = min(maxOccupancy, startOccupancy + (rampSteps × occupancyGrowthStep))
rampSteps = floor(monthsSinceOps / occupancyRampMonths)
```

### Assumption Variables → Revenue
| Assumption | Affects |
|-----------|---------|
| `startAdr` | Room Revenue, all ancillary revenues (via ratios) |
| `adrGrowthRate` | Year-over-year Room Revenue growth |
| `startOccupancy` | Sold Rooms → Room Revenue |
| `maxOccupancy` | Ceiling on occupancy ramp |
| `occupancyRampMonths` | Speed of occupancy ramp |
| `occupancyGrowthStep` | Size of each occupancy increase |
| `roomCount` | Available Rooms → capacity |
| `revShareFB` | F&B Revenue as % of Total Revenue |
| `revShareEvents` | Events Revenue as % of Total Revenue |
| `revShareOther` | Other Revenue as % of Total Revenue |
| `cateringBoostPercent` | DEPRECATED — retained for backward compat, defaults to 0 |

---

## 2. Operating Expenses

### Source: USALI 12th Edition (effective Jan 1, 2026)

USALI classifies expenses into two categories:

**Variable Costs** — scale with current revenue:
```
expenseRooms       = roomRevenue × costRateRooms
expenseFB          = fbRevenue × costRateFB
expenseEvents      = eventsRevenue × eventExpenseRate
expenseOther       = otherRevenue × otherExpenseRate
expenseMarketing   = totalRevenue × costRateMarketing
expenseUtilitiesVar = totalRevenue × (costRateUtilities × utilitiesVariableSplit)
expenseFFE         = totalRevenue × costRateFFE
```

**Fixed Costs** — anchored to Year 1 base revenue, escalate independently (per USALI):
```
baseDollar = baseMonthlyTotalRevenue × costRate
fixedCostFactor = (1 + fixedCostEscalationRate) ^ opsYear
fixedExpense = baseDollar × fixedCostFactor
```

Fixed cost line items (revenue-based): Admin, Property Ops, IT, Fixed Utilities, Other Costs.

**Property-Value-Based Costs** — anchored to total property value, escalate with inflation:
```
totalPropertyValue = purchasePrice + buildingImprovements
baseDollar = (totalPropertyValue / 12) × costRate
fixedCostFactor = (1 + fixedCostEscalationRate) ^ opsYear
fixedExpense = baseDollar × fixedCostFactor
```

Property-value-based line items: Insurance, Property Taxes.

**Total Operating Expenses** = sum of all variable + fixed expenses.

### Assumption Variables → Expenses
| Assumption | Affects |
|-----------|---------|
| `costRateRooms` | Rooms department expense |
| `costRateFB` | F&B department expense |
| `costRateAdmin` | Admin expense (fixed) |
| `costRateMarketing` | Marketing expense (variable) |
| `costRatePropertyOps` | Property operations (fixed) |
| `costRateUtilities` | Utilities expense (split variable/fixed) |
| `costRateInsurance` | Insurance expense (property-value-based) |
| `costRateTaxes` | Property tax expense (property-value-based) |
| `costRateIT` | IT expense (fixed) |
| `costRateFFE` | FF&E reserve (variable) |
| `costRateOther` | Other costs (fixed) |
| `utilitiesVariableSplit` | Split between variable/fixed utilities |
| `fixedCostEscalationRate` | Annual escalation for fixed costs |
| `inflationRate` | Fallback escalation rate |
| `eventExpenseRate` | Events department expense rate |
| `otherExpenseRate` | Other department expense rate |

---

## 3. Profitability Metrics

### Source: USALI 12th Edition

```
GOP = Total Revenue − Total Operating Expenses
```

GOP = Gross Operating Profit = "Income Before Fixed Charges" per USALI.

```
NOI = GOP − Base Management Fee − Incentive Management Fee − FF&E Reserve
```

Where:
- `baseMgmtFee = totalRevenue × property.baseManagementFeeRate`
- `incentiveMgmtFee = max(0, GOP × property.incentiveManagementFeeRate)`
- FF&E Reserve = `totalRevenue × costRateFFE`

**Note on USALI alignment:** The engine combines management fees and FF&E in the NOI calculation. Per strict USALI, NOI = GOP − Mgmt Fees − Fixed Charges. Our engine treats FF&E as an operating expense deducted at the NOI level, which is acceptable for pro forma modeling (FF&E is not a GAAP expense but a contractual/covenant item).

### Assumption Variables → Profitability
| Assumption | Affects | Scope |
|-----------|---------|-------|
| `property.baseManagementFeeRate` | Base fee deducted from GOP → NOI | Per-property (default 5% via `DEFAULT_BASE_MANAGEMENT_FEE_RATE`) |
| `property.incentiveManagementFeeRate` | Incentive fee deducted from GOP → NOI | Per-property (default 15% via `DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE`) |

---

## 4. Depreciation

### Source: IRS Publication 946 (2024), ASC 360-10

**Method:** MACRS straight-line, 27.5-year recovery period for residential rental property.

**Convention:** Mid-month convention required by IRS.

```
depreciableBasis = purchasePrice × (1 − landValuePercent) + buildingImprovements
monthlyDepreciation = depreciableBasis / 27.5 / 12
```

**Land never depreciates** (IRS Publication 946, Section 3). Land is separated using `landValuePercent` (default 25%).

**Current engine simplification:** Uses simple straight-line (`basis / 27.5 / 12`) for every month post-acquisition. The IRS mid-month convention would prorate the first and last year based on month placed in service. This is a known simplification acceptable for pro forma modeling but would need adjustment for tax filing.

### IRS Mid-Month Convention First-Year Rates (27.5-year residential):
| Month Placed in Service | Year 1 Rate |
|------------------------|-------------|
| January | 3.485% |
| February | 3.182% |
| March | 2.879% |
| April | 2.576% |
| May | 2.273% |
| June | 1.970% |
| July | 1.667% |
| August | 1.364% |
| September | 1.061% |
| October | 0.758% |
| November | 0.455% |
| December | 0.152% |
| Years 2–27 | 3.636% |
| Year 28 | Remainder |

### Assumption Variables → Depreciation
| Assumption | Affects |
|-----------|---------|
| `purchasePrice` | Depreciable basis |
| `landValuePercent` | Non-depreciable portion (default 25%) |
| `buildingImprovements` | Added to depreciable basis |
| `acquisitionDate` | When depreciation starts |

---

## 5. Debt Service (Loan Amortization)

### Source: ASC 470 (Debt), Standard Amortization Formula

**Monthly Payment (PMT):**
```
PMT = P × [r(1+r)^n] / [(1+r)^n − 1]

Where:
  P = loan amount (purchasePrice × LTV for financed properties)
  r = annual interest rate / 12
  n = term in years × 12
```

**For zero interest rate:** `PMT = P / n` (straight-line principal reduction).

**Monthly Interest/Principal Split:**
```
interestExpense = remainingBalance × monthlyRate
principalPayment = PMT − interestExpense
newBalance = remainingBalance − principalPayment
```

### ASC 470 Treatment (GAAP)
- **Interest expense** → Income Statement (operating expense)
- **Principal payment** → Balance Sheet (liability reduction) + Cash Flow Statement (financing activity)
- Interest and principal are NEVER combined as a single expense on the Income Statement

### Assumption Variables → Debt Service
| Assumption | Affects |
|-----------|---------|
| `acquisitionLTV` | Loan amount = purchasePrice × LTV |
| `acquisitionInterestRate` | Monthly interest and PMT calculation |
| `acquisitionTermYears` | Loan amortization period |
| `type` ("Financed" vs "Cash") | Whether debt service applies at all |

---

## 6. Net Income

### Source: GAAP Income Statement

```
taxableIncome = NOI − interestExpense − depreciationExpense
incomeTax = max(0, taxableIncome × taxRate)
netIncome = NOI − interestExpense − depreciationExpense − incomeTax
```

**Key GAAP rules:**
- Only interest expense hits the Income Statement (ASC 470)
- Depreciation is a non-cash expense on the Income Statement (ASC 360)
- Income tax only applies when taxable income is positive
- Principal payment does NOT appear on Income Statement

### Assumption Variables → Net Income
| Assumption | Affects |
|-----------|---------|
| `taxRate` | Income tax calculation |
| All revenue/expense assumptions | Through NOI |
| All debt assumptions | Through interest expense |
| All depreciation assumptions | Through depreciation expense |

---

## 7. Cash Flow Statement

### Source: ASC 230 — Statement of Cash Flows (Indirect Method)

```
Operating Cash Flow = Net Income + Depreciation
  (add back non-cash depreciation expense)

Financing Cash Flow = −Principal Payment + Refinancing Proceeds
  (principal is a financing activity, not operating)

Total Cash Flow = NOI − Total Debt Payment − Income Tax
  (direct calculation for verification)

Verification: Operating CF + Financing CF = Total Cash Flow
  i.e., (NI + Dep) + (−Principal + Refi) = NOI − DebtPayment − Tax + Refi
```

**Cumulative Cash:**
```
endingCash[month] = endingCash[month−1] + cashFlow[month]
```

### Key ASC 230 Requirements
1. Must start from Net Income (not NOI or operating income)
2. Add back all non-cash items (depreciation)
3. Interest paid classified as operating activity (default GAAP)
4. Principal payments classified as financing activity
5. Refinancing proceeds classified as financing activity

---

## 8. Balance Sheet

### Source: GAAP Fundamental Equation

```
Assets = Liabilities + Equity
```

**Assets:**
```
propertyValue = landValue + (buildingValue − accumulatedDepreciation)
  where landValue = purchasePrice × landValuePercent
  where buildingValue = purchasePrice × (1 − landValuePercent) + buildingImprovements
  where accumulatedDepreciation = monthlyDepreciation × monthsSinceAcquisition
totalAssets = propertyValue + endingCash
```

**Liabilities:**
```
totalLiabilities = debtOutstanding
```

**Equity:**
```
totalEquity = totalAssets − totalLiabilities
```

---

## 9. Financing Analysis Calculators

### DSCR (Debt Service Coverage Ratio)
**Source:** JP Morgan CRE Lending, Industry Standard
```
DSCR = Annual NOI ÷ Annual Debt Service
```
- Minimum for hotels: 1.30–1.50x
- Debt service includes both principal and interest

### Max Loan from DSCR
```
maxAnnualDebtService = NOI ÷ requiredDSCR
maxLoanAmount = PV(monthlyRate, termMonths, −maxMonthlyPayment)
```

### Debt Yield
**Source:** Wall Street Prep, CRE Lending Standards
```
debtYield = NOI ÷ loanAmount × 100
```
- Minimum for most lenders: 10%
- Rate-independent and term-independent risk measure

### Max Loan from Debt Yield
```
maxLoan = NOI ÷ requiredDebtYield
```

---

## 10. Refinance

### Source: ASC 470-50 (Debt Modifications/Extinguishments)

```
propertyValue = stabilizedNOI ÷ exitCapRate
newLoanAmount = propertyValue × refinanceLTV
closingCosts = newLoanAmount × closingCostRate
netProceeds = newLoanAmount − closingCosts − existingDebtBalance
cashToEquity = max(0, netProceeds)
```

Post-refinance: new loan amortization schedule replaces old schedule from refinance month onward. NOI is debt-independent, so Pass 1 values for revenue/expenses/NOI remain correct.

---

## 11. IRR (Internal Rate of Return)

### Source: CFA Institute, Wall Street Prep

```
0 = Σ [CFt / (1 + IRR)^t] − C0
```

Solved iteratively (Newton-Raphson or bisection method).

For real estate:
- CF0 = −(equity investment) = −(purchasePrice − loanAmount + closingCosts)
- CF1..n = annual FCFE (free cash flow to equity)
- CFn includes exit proceeds: salePrice − outstandingDebt − sellingCosts

### FCFE (Free Cash Flow to Equity)
**Source:** Corporate Finance Institute
```
FCFE = Net Income + Depreciation − CapEx − Principal Repayment + Net Borrowing
```
For our model (no CapEx or working capital changes):
```
FCFE = Cash Flow = NOI − Total Debt Service − Income Tax
```

---

## 12. Management Company

### Revenue
```
baseFeeRevenue = Σ(property[i].totalRevenue × property[i].baseManagementFeeRate)
incentiveFeeRevenue = Σ(max(0, property[i].GOP × property[i].incentiveManagementFeeRate))
totalRevenue = baseFeeRevenue + incentiveFeeRevenue
```
Fee rates are per-property (not a single global rate). Each property may have its own `baseManagementFeeRate` and `incentiveManagementFeeRate`, defaulting to 5% and 15% respectively via `DEFAULT_BASE_MANAGEMENT_FEE_RATE` and `DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE` from `shared/constants.ts`.

### Expenses (after company operations start)
Fixed costs escalate at `fixedCostEscalationRate`:
- Partner compensation (yearly schedule, divided by 12)
- Staff compensation (FTE × salary × escalation / 12)
- Office lease, professional services, tech infrastructure, business insurance

Variable costs escalate at `inflationRate`:
- Travel costs (per active property)
- IT licensing (per active property)

Revenue-linked:
- Marketing = totalRevenue × marketingRate
- Misc Ops = totalRevenue × miscOpsRate

### Net Income
```
netIncome = totalRevenue − totalExpenses
cashFlow = netIncome + safeFunding
```

---

## Cross-Reference: Assumption → Statement Mapping

| Assumption Category | Income Statement | Cash Flow | Balance Sheet |
|-------------------|-----------------|-----------|---------------|
| Revenue (ADR, Occ, rooms) | Total Revenue, GOP, NOI, Net Income | Operating CF, Total CF | Ending Cash |
| Cost Rates | Operating Expenses, GOP, NOI | Operating CF, Total CF | Ending Cash |
| Management Fees | Fee Expense, NOI | Operating CF, Total CF | Ending Cash |
| Debt (LTV, rate, term) | Interest Expense, Net Income | Financing CF, Total CF | Debt Outstanding |
| Depreciation (price, land%) | Depreciation, Net Income | Operating CF (add-back) | Property Value |
| Tax Rate | Income Tax, Net Income | Total CF | Ending Cash |
| Refinance params | Interest (post-refi), Net Income | Refi Proceeds, Financing CF | Debt Outstanding |

---

## Mandatory Validation Rules

1. **Revenue Identity:** `totalRevenue = roomRevenue + fbRevenue + eventsRevenue + otherRevenue`
2. **GOP Identity:** `GOP = totalRevenue − totalOperatingExpenses`
3. **NOI Identity:** `NOI = GOP − baseFee − incentiveFee − ffeReserve`
4. **Net Income Identity:** `netIncome = NOI − interestExpense − depreciation − incomeTax`
5. **Cash Flow Identity:** `cashFlow = NOI − debtPayment − incomeTax` (direct method)
6. **Cash Flow Reconciliation:** `operatingCF + financingCF = cashFlow` (indirect method)
7. **Balance Sheet:** `propertyValue + endingCash = debtOutstanding + equity`
8. **Debt Service Split:** `debtPayment = interestExpense + principalPayment`
9. **No Negative Cash:** `endingCash >= 0` for every month
10. **Timing:** No revenue/expense before `operationsStartDate`; no debt/depreciation before `acquisitionDate`
