# Balance Sheet Identity Rule (A = L + E)

**Every balance sheet — property-level AND consolidated — MUST balance within $1.**

## The Identity

```
Total Assets = Total Liabilities + Total Equity
```

If this identity is violated by more than $1, the financial model is **WRONG**. There is no acceptable tolerance beyond rounding.

## Cash Formula — Use ANOI, Never NOI

The engine defines:
```
cashFlow = ANOI - debtPayment - incomeTax      (property-engine.ts line 224)
```

Any component deriving cash from monthly pro-forma data **MUST** use `m.anoi`, never `m.noi`:
```typescript
// CORRECT
const cumulativeCash = months.reduce((sum, m) => sum + m.anoi, 0);

// WRONG — overstates cash by cumulative FF&E reserve
const cumulativeCash = months.reduce((sum, m) => sum + m.noi, 0);
```

NOI vs ANOI: `ANOI = NOI - FF&E Reserve`. The FF&E reserve is a real cash outflow. Using NOI instead of ANOI inflates the asset side by the entire cumulative FF&E reserve.

## Files That Derive Balance Sheet Cash

These files compute cash from monthly engine output and MUST use `m.anoi`:

| File | Function |
|------|----------|
| `client/src/components/statements/ConsolidatedBalanceSheet.tsx` | Consolidated portfolio balance sheet |
| `client/src/components/dashboard/dashboardExports.ts` | Balance sheet chart data + Excel/PDF exports |

## Verification Checklist

Before merging any change to financial engine, balance sheet, or cash flow components:

1. Open the Dashboard → Balance Sheet tab → confirm no red variance warning
2. Open each property detail → Balance Sheet → confirm no red variance warning
3. Run `npm run verify:summary` → must show UNQUALIFIED
4. Run `npm run test:summary` → all tests must pass
5. Check: `Total Assets` − (`Total Liabilities` + `Total Equity`) ≤ $1

## Root Cause Pattern

The most common balance sheet bug: using the wrong income metric for cash derivation.
- `NOI` = before FF&E (not all cash has left)
- `ANOI` = after FF&E (actual cash available)
- `netIncome` = after depreciation, interest, tax (accrual basis, used for equity/retained earnings)
- `cashFlow` = ANOI − debt service − income tax (the engine's own cash field)

When in doubt, use `m.cashFlow` directly or `m.anoi` with explicit deductions.
