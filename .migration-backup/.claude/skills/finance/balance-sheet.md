# Property SPV — Balance Sheet

## Source Components
- `client/src/components/ConsolidatedBalanceSheet.tsx`

---

## Source: GAAP Fundamental Equation

```
ASSETS = LIABILITIES + EQUITY
```

This equation MUST balance at all times. Every transaction affects at least two accounts.

### Assets

```
CURRENT ASSETS
  Cash & Cash Equivalents         = Cumulative Cash Flow (ending cash)
  Accounts Receivable             = 0 (simplified for pro forma)
  ─────────────────────────────────────────────────
  Total Current Assets

FIXED ASSETS (ASC 360)
  Land                            = Purchase Price × landValuePercent
  Building & Improvements         = Purchase Price × (1 − landValuePercent) + Building Improvements
  Less: Accumulated Depreciation  = Monthly Depreciation × Months Since Acquisition
  ─────────────────────────────────────────────────
  Net Property Value              = Land + Building − Accumulated Depreciation
  ─────────────────────────────────────────────────
  TOTAL ASSETS                    = Current Assets + Net Property Value
```

**IRS / ASC 360 Rules:**
- Land NEVER depreciates (IRS Pub 946, Section 3)
- Building depreciates over 27.5 years (residential rental, straight-line)
- Building Improvements are added to the depreciable basis
- Accumulated depreciation is cumulative from acquisition date
- Property is NOT revalued to market (held at historical cost less depreciation per GAAP)

### Liabilities

```
LONG-TERM LIABILITIES
  Mortgage / Loan Outstanding     = Original Loan − Cumulative Principal Paid
  ─────────────────────────────────────────────────
  TOTAL LIABILITIES               = Debt Outstanding
```

**ASC 470 Rules:**
- Debt is recorded at face value (no fair value adjustment for pro forma)
- Each monthly payment splits into interest (expense) and principal (liability reduction)
- After refinance: old loan is extinguished, new loan balance replaces it (ASC 470-50)
- At exit: all outstanding debt must be repaid from sale proceeds

### Equity

```
EQUITY
  Initial Equity Investment       = Total Investment − Loan Amount
  Retained Earnings               = Cumulative Net Income
  ─────────────────────────────────────────────────
  TOTAL EQUITY                    = Total Assets − Total Liabilities
```

### Balance Sheet Check

```
TOTAL ASSETS = TOTAL LIABILITIES + TOTAL EQUITY
```

If this does not balance within rounding tolerance ($1), there is a calculation error.

---

## Financial Ratios

After the Grand Total row, the Balance Sheet displays two key leverage ratios when total assets > 0:

| Ratio | Formula | Purpose |
|-------|---------|---------|
| Debt-to-Assets | `totalLiabilities / totalAssets × 100` | Measures financial leverage — what percentage of assets are financed by debt |
| Equity-to-Assets | `totalEquity / totalAssets × 100` | Measures owner's stake — what percentage of assets are financed by equity |

These always sum to 100% (since Assets = Liabilities + Equity).

### Implementation
- Inline `<tr>` elements in `ConsolidatedBalanceSheet.tsx` (not using MarginRow since BS is single-year, 2-column layout)
- Styling matches MarginRow: `text-xs text-gray-400 italic font-mono`
- Only rendered when `totalAssets > 0`

---

---
name: balance-sheet-integrity
description: Guard the accounting identity Assets = Liabilities + Equity across all balance sheet views. Covers per-property, consolidated portfolio, and management company balance sheets. Use when modifying balance sheet calculations or views.
---

# Balance Sheet Integrity Skill

## Purpose

Guard the fundamental accounting identity `Assets = Liabilities + Equity` across all balance sheet views in the application: per-property, consolidated portfolio, and management company.

## When to Use

Activate this skill whenever:
- Modifying any file that computes or renders a balance sheet
- Changing financial engine output fields (`noi`, `anoi`, `cashFlow`, `netIncome`, `debtOutstanding`, etc.)
- Adding new asset, liability, or equity line items
- Modifying cash derivation logic
- Working on financial exports (Excel, PDF) that include balance sheet data

## The Golden Rule

```
Total Assets = Total Liabilities + Total Equity   (variance ≤ $1)
```

Any violation means a calculation error exists. Never suppress or increase the tolerance.

## Cash Derivation — The Most Dangerous Calculation

Cash on the balance sheet is derived from cumulative pro-forma data. The correct formula:

```
Cash = Operating Reserve + Cumulative(ANOI − Debt Service − Income Tax) + Refinancing Proceeds
```

**CRITICAL**: Always use `m.anoi` (Adjusted NOI = NOI − FF&E Reserve), never `m.noi`.

### Why This Matters

| Metric | Includes FF&E? | Use For |
|--------|---------------|---------|
| `m.noi` | No (before FF&E) | Income statement display only |
| `m.anoi` | Yes (after FF&E) | Cash derivation, cash flow statements |
| `m.netIncome` | Yes + depreciation + interest + tax | Retained earnings (equity side) |
| `m.cashFlow` | Full cash basis | Direct cash verification |

Using `m.noi` instead of `m.anoi` for cash overstates assets by the cumulative FF&E reserve — typically $3-5M over a 10-year projection with 6 properties.

## Affected Files

### Balance Sheet Components
- `client/src/components/statements/ConsolidatedBalanceSheet.tsx` — Portfolio consolidated BS
- `client/src/components/dashboard/dashboardExports.ts` — BS chart data + exports
- `client/src/components/company/CompanyBalanceSheet.tsx` — Management company BS

### Financial Engine (Source of Truth)
- `client/src/lib/financial/property-engine.ts` — Lines 215, 224:
  ```
  netIncome = anoi - interestExpense - depreciationExpense - incomeTax
  cashFlow = anoi - debtPayment - incomeTax
  ```

### Equity Calculations
- `client/src/lib/financial/equityCalculations.ts` — Equity invested, loan amounts

## Verification Steps

After any change to the above files:

1. **Automated**: `npm run test:summary` — all 3,328+ tests must pass
2. **Automated**: `npm run verify:summary` — must show UNQUALIFIED
3. **Visual**: Dashboard → Balance Sheet tab → no red variance banner
4. **Visual**: Any property detail → no red variance banner
5. **Manual spot-check**: `Total Assets` minus `(Total Liabilities + Total Equity)` ≤ $1

## Common Bugs and Fixes

### Bug: Cash overstated by cumulative FF&E
- **Symptom**: Variance ≈ cumulative FF&E reserve across all properties
- **Cause**: Using `m.noi` instead of `m.anoi` in cash derivation
- **Fix**: Replace `m.noi` with `m.anoi` in the reduce

### Bug: Retained earnings don't match cumulative net income
- **Symptom**: Equity side is wrong, assets are correct
- **Cause**: Missing pre-opening cost deduction from retained earnings (ASC 720-15)
- **Fix**: `adjustedRetainedEarnings = cumulativeNetIncome - preOpeningCosts`

### Bug: Debt outstanding doesn't match amortization schedule
- **Symptom**: Liability side is wrong
- **Cause**: Using wrong month index for `debtOutstanding` lookup
- **Fix**: Use `proForma[lastMonthIdx].debtOutstanding` where `lastMonthIdx = year * 12 - 1`

## Regression Prevention

The rule `.claude/rules/balance-sheet-identity.md` enforces this check. Any agent working on financial code must verify balance sheet integrity before marking work complete.
