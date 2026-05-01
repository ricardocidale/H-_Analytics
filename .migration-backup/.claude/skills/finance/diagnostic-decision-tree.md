---
name: Financial Diagnostic Decision Tree
description: Symptom-based triage for financial calculation bugs. Maps common symptoms to root causes, files to inspect, and tests to run. Load when debugging NaN values, balance sheet imbalances, cash flow mismatches, or ADVERSE verification opinions.
---

# Financial Diagnostic Decision Tree

## Before You Grep

1. Run `npm run verify:summary` — check which identities fail
2. Run `npm run test:file -- tests/engine/operating-reserve-cash.test.ts` — 13 core guards
3. Check browser console for NaN/Infinity warnings in financial components
4. Read the ADVERSE finding text — it names the broken identity

## Symptom → Root Cause → Fix

### 1. NaN in NOI or Net Income

| Check | File | What to Look For |
|-------|------|-----------------|
| Missing property assumption | `shared/schema.ts` | Nullable field without `?? 0` fallback |
| Division by zero | `property-engine.ts` | `/ roomCount` or `/ occupancy` when property has 0 rooms or 0% |
| Undefined month index | `property-engine.ts` | Off-by-one in monthly loop (`month - 1` vs `month`) |

**Quick test:** `npm run test:file -- tests/engine/` — any NaN propagates to multiple failures.

### 2. Balance Sheet Imbalance (A ≠ L + E)

| Check | File | What to Look For |
|-------|------|-----------------|
| Retained earnings not accumulating | `property-engine.ts` | `retainedEarnings += netIncome` missing or sign-flipped |
| Debt balance drift | `loanCalculations.ts` | Principal payment not reducing outstanding balance |
| Missing equity posting | `property-engine.ts` | Initial equity contribution not posted to BS |
| Refinance not swapping debt | `property-engine.ts` | Old loan not zeroed when new loan starts |

**Identity:** `Total Assets = Total Liabilities + Total Equity` (Identity #11)
**Quick test:** `npm run test:file -- tests/proof/golden-values.test.ts`

### 3. Cash Flow ≠ Change in Cash

| Check | File | What to Look For |
|-------|------|-----------------|
| Principal on income statement | `property-engine.ts` | Principal must be financing activity only (ASC 470) |
| Depreciation not added back | `property-engine.ts` | Operating CF = Net Income + Depreciation |
| Missing refinance proceeds | `property-engine.ts` | Refi proceeds must appear in financing CF |
| Operating reserve not seeded | `property-engine.ts` | Reserve seeds ending cash at acquisition month |

**Identity:** `Operating CF + Financing CF = Total Cash Flow` (Identity #9)
**Quick test:** `npm run test:file -- tests/engine/operating-reserve-cash.test.ts`

### 4. Wrong Management Fees

| Check | File | What to Look For |
|-------|------|-----------------|
| Fee rate from wrong source | `property-engine.ts` | Must use `property.managementFeeRate ?? DEFAULT_*` |
| Incentive fee threshold | `property-engine.ts` | Only applies above GOP threshold |
| Zero-sum violation | `property-engine.ts` / `company-engine.ts` | Σ(property fee expense) must = company fee revenue |

**Identity:** `Σ(Property Fee Expense) = Management Company Fee Revenue` (Identity #18)
**Quick test:** `npm run test:file -- tests/engine/per-property-fees.test.ts`

### 5. Negative Cash Balance

| Check | File | What to Look For |
|-------|------|-----------------|
| Pre-ops debt payments | `property-engine.ts` | Gap between acquisition and operations start |
| Operating reserve missing | `property-engine.ts` | Reserve must cover pre-revenue debt service |
| Funding gate skipped | `funding-predictor.ts` | Company ops can't start before SAFE funding |

**Quick test:** `npm run test:file -- tests/engine/operating-reserve-cash.test.ts`

### 6. IRR Returns Infinity or NaN

| Check | File | What to Look For |
|-------|------|-----------------|
| Zero equity invested | `property-engine.ts` | Equity = 0 makes IRR undefined |
| No sign change in cash flows | `property-engine.ts` | IRR needs negative then positive flows |
| Exit value missing | `property-engine.ts` | Exit proceeds not added to final period |

**Identity:** `NPV at IRR = 0` (Identity #22)
**Quick test:** `npm run test:file -- tests/engine/` (IRR tests)

### 7. FCFE Direct ≠ FCFE Indirect

| Check | File | What to Look For |
|-------|------|-----------------|
| Depreciation mismatch | `property-engine.ts` | Direct: NOI − DS − Tax + Refi; Indirect: NI + Dep − Princ + Refi |
| Tax calculation | `property-engine.ts` | Tax = max(0, taxable income × rate) — NOL may differ |
| Refinance double-count | `property-engine.ts` | Refi proceeds in both paths but only once each |

**Identity:** FCFE Direct = FCFE Indirect (Identity #19 = #20)
**Quick test:** `npm run test:file -- tests/proof/reconciliation-report.test.ts`

### 8. Verification Shows ADVERSE

| Finding Text | Root Cause | Fix |
|-------------|-----------|-----|
| "Balance sheet does not balance" | See Symptom #2 | Fix A=L+E identity |
| "Cash flow does not reconcile" | See Symptom #3 | Fix CF = ΔCash |
| "FCFE methods diverge" | See Symptom #7 | Reconcile direct/indirect |
| "Hardcoded value detected" | Literal in calc path | Replace with `DEFAULT_*` constant |
| "Fee zero-sum violation" | See Symptom #4 | Fix intercompany elimination |
| "Recalculation not triggered" | Missing `invalidateAllFinancialQueries` | Add to mutation's `onSuccess` |

### 9. Hardcoded Value Detected

| Check | File | What to Look For |
|-------|------|-----------------|
| Literal in engine | `property-engine.ts` / `company-engine.ts` | Raw number instead of `DEFAULT_*` constant |
| Missing constant | `shared/constants.ts` | Value exists in code but not as named constant |
| Fallback without constant | Any calc file | `?? 0.03` instead of `?? DEFAULT_INFLATION_RATE` |

**Exceptions:** Only `DEPRECIATION_YEARS (27.5)` and `DAYS_PER_MONTH (30.5)` are allowed literals.
**Quick test:** `npm run test:file -- tests/proof/hardcoded-detection.test.ts`

### 10. Refinance Math Wrong

| Check | File | What to Look For |
|-------|------|-----------------|
| Old loan not retired | `property-engine.ts` | Outstanding balance must zero at refi month |
| Pass 2 not rebuilding | `property-engine.ts` | Refi triggers full recalc from refi month |
| Reserve not re-seeded | `property-engine.ts` | Operating reserve re-seeds at acquisition month in Pass 2 |
| Per-property fields | `property-engine.ts` | Must use `property.refiInterestRate`, not `debtAssumptions.*` |

**Quick test:** `npm run test:file -- tests/engine/operating-reserve-cash.test.ts`

## Diagnostic Commands

```bash
# Full verification (shows which identities fail)
npm run verify:summary

# All engine tests (fastest broad check)
npm run test:file -- tests/engine/

# All proof tests (invariant enforcement)
npm run test:file -- tests/proof/

# Specific guard tests
npm run test:file -- tests/engine/operating-reserve-cash.test.ts  # 13 core guards
npm run test:file -- tests/engine/per-property-fees.test.ts       # Fee zero-sum
npm run test:file -- tests/proof/golden-values.test.ts            # Golden scenarios
npm run test:file -- tests/proof/hardcoded-detection.test.ts      # No literals
npm run test:file -- tests/proof/recalculation-enforcement.test.ts # Invalidation

# Full health check (TS + tests + verify + doc harmony)
npm run health
```

## Key Files Reference

| File | Lines | Role |
|------|-------|------|
| `client/src/lib/financial/property-engine.ts` | ~601 | Single-property pro-forma engine (`generatePropertyProForma`) |
| `client/src/lib/financial/company-engine.ts` | ~361 | Management-company pro-forma engine (`generateCompanyProForma`) |
| `client/src/lib/financialEngine.ts` | ~6 | Re-export shim (backward compatibility) |
| `client/src/lib/loanCalculations.ts` | ~200 | Loan amortization, PMT |
| `client/src/lib/financialAuditor.ts` | ~300 | Audit orchestrator |
| `server/calculation-checker/index.ts` | ~400 | Independent server-side recalc |
| `shared/constants.ts` | ~200 | All named constants |
| `client/src/lib/constants.ts` | ~50 | Client-only constants |
