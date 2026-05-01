# Testing: DCF, FCF, and FCFE Analysis

## Scope
Tests for Free Cash Flow (FCF) computation, FCFE two-method reconciliation, and cash flow derivation from ledger entries.

## Entity Level
**Individual Property** — FCF/FCFE computed from single-property posted entries and statement data.

---

## Test Files

### FCF Computation — `tests/analytics/fcf.test.ts` (5 tests)
Tests `computeFCF()` from `analytics/fcf/compute-fcf.js`.

| Test | What It Proves |
|------|---------------|
| FCFE for funding event (no IS activity) | Pure financing FCF |
| FCFE for interest + principal payment | Debt service FCF |
| Identifies capex from property purchase | Investment classification |
| Sums totals across periods | Multi-period aggregation |
| Returns empty for no data | Edge case |

### FCFE Two-Method Reconciliation — `tests/analytics/fcfe-reconciliation.test.ts` (8 tests)
Verifies that FCFE computed two different ways produces identical results.

**Method 1 (Direct)**: `FCFE = CFO + CFI + CFF`
**Method 2 (From NI)**: `FCFE = NI + Depreciation - CapEx - ΔWorkingCapital + Net Borrowing`

| Test | What It Proves |
|------|---------------|
| Direct = From NI for operating period | Standard reconciliation |
| Methods agree with zero debt (cash purchase) | No-leverage variant |
| Methods agree with high leverage | High-debt variant |
| Methods agree with negative taxable income (tax shield) | Tax shield handling |
| Methods agree with refinancing proceeds | Refi impact |
| FCFE for operating period with interest + depreciation | Ledger-derived values |
| FCFF = NI + Depreciation + Interest - CapEx | FCFF formula verification |
| FCFE = FCFF - Interest + Net Borrowing | FCFE from FCFF formula |

**Key identity**: `FCFE_direct ≡ FCFE_from_NI` (must match within rounding tolerance)

### Analytics Golden — `tests/analytics/golden.test.ts` (6 tests)
Full pipeline: events → statements → FCF → return metrics.

| Test | What It Proves |
|------|---------------|
| All events post without errors | Clean pipeline |
| BS balanced through exit | Identity through lifecycle |
| FCF: derives correct values per period | FCF accuracy |
| Returns: IRR from FCFE cash flow array | IRR computation |
| Returns: MOIC from FCFE | MOIC computation |
| Returns: full metrics output structure | Complete output |

---

## FCF Formulas Tested

```
FCFF (Free Cash Flow to Firm):
  = Net Income + Depreciation + Interest Expense - Capital Expenditures
  = NOI - Tax + Depreciation (for stabilized property)

FCFE (Free Cash Flow to Equity):
  = FCFF - Interest Expense + Net Borrowing
  = NOI - Debt Service - Tax (Direct method)
  = NI + Depreciation - CapEx + Net Borrowing (From-NI method)

Both methods MUST produce identical results.
```

## Run Commands
```bash
npx vitest run tests/analytics/fcf.test.ts               # FCF computation (5 tests)
npx vitest run tests/analytics/fcfe-reconciliation.test.ts # FCFE reconciliation (8 tests)
npx vitest run tests/analytics/golden.test.ts             # Full pipeline golden (6 tests)
```

## Related Skills
- `.claude/skills/finance/dcf-analysis.md` — DCF methodology and terminal value
- `.claude/skills/finance/cross-statement-reference.md` — How IS/BS/CF flow into FCF
- `.claude/skills/testing/analysis-returns.md` — IRR/MOIC tests that consume FCF output
