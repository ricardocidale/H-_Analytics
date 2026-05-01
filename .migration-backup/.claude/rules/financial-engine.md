# Financial Engine Rules

> Full reference (calculation flow, formulas, configurable parameters): `.claude/skills/finance/SKILL.md`

## Core Files

| File | Purpose |
|------|---------|
| `client/src/lib/financial/property-engine.ts` | Single-property pro-forma engine (`generatePropertyProForma`) |
| `client/src/lib/financial/company-engine.ts` | Management-company pro-forma engine (`generateCompanyProForma`) |
| `client/src/lib/financialEngine.ts` | Re-export shim (backward compat) |
| `client/src/lib/financial/loanCalculations.ts` | Loan amortization, PMT |
| `client/src/lib/constants.ts` | Named constants and defaults |
| `server/calculationChecker.ts` | Independent server-side recalculation |

## Immutable Constants

| Constant | Value | Source |
|----------|-------|--------|
| `DEPRECIATION_YEARS` | 27.5 | IRS Pub 946 / ASC 360 — never change |
| `DAYS_PER_MONTH` | 30.5 | Industry standard (365/12) — never change |

## Mandatory Business Rules

### 1. Income Statement Shows Interest Only — Never Principal
- Net Income = NOI - Interest Expense - Depreciation - Income Tax
- Principal is a **financing activity** (ASC 470), NOT an income statement expense

### 2. Debt-Free at Exit
- Exit waterfall: Gross Value - Commission - Outstanding Debt = Net Proceeds to Equity
- No property may carry debt beyond the projection period

### 3. No Over-Distribution / No Negative Cash
- Cash balances must never go negative (flag as funding shortfall, not a calc error)
- Distributions must not exceed available cash

### 4. Capital Structure on Separate Lines
- Equity, loan proceeds, and refinancing proceeds must appear as **separate line items**
- Never lump equity and debt/refi together in reports, cash flow statements, or exports

### 5. Management Company Funding Gate
- Operations cannot begin before SAFE funding is received

### 6. Property Activation Gate
- Revenue and expenses only begin after `acquisitionDate` and `operationsStartDate`
