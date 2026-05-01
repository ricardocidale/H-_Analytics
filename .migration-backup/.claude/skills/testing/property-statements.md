# Testing: Property-Level Financial Statements

## Scope
Tests for individual property SPV financial statements — Income Statement, Cash Flow Statement, Balance Sheet — plus the underlying ledger posting, trial balance, and reconciliation mechanics.

## Entity Level
**Individual Property** — all tests operate on single-property pro forma data.

---

## Test Files

### Balance Sheet — `tests/statements/balance-sheet.test.ts` (5 tests)
Tests `extractBalanceSheet()` from `statements/balance-sheet.js`.

| Test | What It Proves |
|------|---------------|
| Produces balanced sheet for funding event | A = L + E after equity injection |
| Includes debt as liability | Loan shows on liability side |
| Includes retained earnings from net income | IS flows into equity |
| Accumulates across periods (cumulative) | Multi-period BS is cumulative |
| Classifies CLOSING_COSTS as asset | Deferred financing costs per ASC 835-30 |

**Key invariant**: `totalAssets === totalLiabilities + totalEquity` (within $1 tolerance).

### Income Statement — `tests/statements/income-statement.test.ts` (4 tests)
Tests `extractIncomeStatement()` from `statements/income-statement.js`.

| Test | What It Proves |
|------|---------------|
| Extracts expense accounts | Expenses classified correctly |
| Returns zero for empty trial balance | Graceful empty handling |
| Ignores BS accounts | Only IS accounts included |
| Calculates net income = revenue - expenses | Fundamental IS equation |

### Cash Flow Statement — `tests/statements/cash-flow.test.ts` (7 tests)
Tests `extractCashFlow()` and `computeCashDelta()` from `statements/cash-flow.js`.

| Test | What It Proves |
|------|---------------|
| Classifies financing cash inflows | Equity/debt → CFF bucket |
| Classifies operating cash outflows | OpEx → CFO bucket |
| Handles mixed buckets | Multi-category period |
| Classifies investing cash outflows | CapEx → CFI bucket |
| Computes net cash change from CASH entries | Delta calculation |
| Returns 0 for period with no cash entries | Empty period handling |
| Returns zeros for empty period | Graceful defaults |

### ASC 230 Cash Flow Identities — `tests/statements/cashflow-identities.test.ts` (8 tests)
Verifies fundamental GAAP cash flow identities hold across all transaction types.

| Test | What It Proves |
|------|---------------|
| OCF + CFI + CFF = Net Change (equity funding) | ASC 230 three-section identity |
| OCF + CFI + CFF = Net Change (acquisition + debt) | Identity holds with leverage |
| OCF + CFI + CFF = Net Change (debt service) | Identity holds for P&I payments |
| OCF + CFI + CFF = Net Change (mixed multi-period) | Identity holds through lifecycle |
| OCF + CFI + CFF = Net Change (refinancing) | Identity holds for refi events |
| A = L + E through multi-period lifecycle | BS balance every period |
| Running total of net cash changes = final cash | Cumulative cash check |

### Trial Balance — `tests/statements/trial-balance.test.ts` (7 tests)
Tests `buildTrialBalance()` and `buildCumulativeTrialBalance()`.

| Test | What It Proves |
|------|---------------|
| Aggregates debits and credits | Basic TB construction |
| Respects CREDIT normal side | Proper sign convention |
| Handles multiple accounts | Multi-account aggregation |
| Filters by period | Period isolation |
| Returns empty for no entries | Edge case |
| Accumulates across periods (cumulative) | Cumulative TB |
| Excludes entries after target period | Period boundary |

### Posting — `tests/statements/post.test.ts` (7 tests)
Tests `postEvents()` from `engine/posting/post.js`.

| Test | What It Proves |
|------|---------------|
| Posts a balanced event | Double-entry validation |
| Extracts period from date | Period classification |
| Preserves all fields | Data integrity |
| Posts multiple events | Batch processing |
| Rejects an unbalanced event | Guards A = L + E |
| Posts balanced even when unbalanced exist | Partial success |
| Returns empty for no events | Edge case |

### Event Applier — `tests/statements/event-applier.test.ts` (5 tests)
Tests `applyEvents()` — the full pipeline from events → posted entries → statements.

| Test | What It Proves |
|------|---------------|
| Returns empty for no events | Edge case |
| Processes a single funding event | Basic pipeline |
| Handles events across multiple periods | Multi-period pipeline |
| Skips unbalanced events | Error handling |
| All reconciliation checks pass | End-to-end identity verification |

### Reconciliation — `tests/statements/reconcile.test.ts` (4 tests)
Tests `reconcile()` — checks that BS balances, CF ties out, IS→RE linkage holds.

| Test | What It Proves |
|------|---------------|
| Passes for balanced scenario | Positive validation |
| Detects A ≠ L + E | BS imbalance detection |
| Detects net CF ≠ ΔCASH | CF tie-out failure detection |
| Verifies cumulative NI = retained earnings | IS-to-RE linkage |

### Golden Scenario — `tests/statements/golden.test.ts` (10 tests)
Full lifecycle: funding → acquisition → debt service through 3 periods.

| Test | What It Proves |
|------|---------------|
| Produces 3 periods | Correct period count |
| Posts all entries without errors | Clean pipeline |
| IS: only August has activity | Timing correctness |
| BS: cumulative through August | Cumulative BS |
| BS: June snapshot | Point-in-time BS |
| CF: August | Operating cash flow |
| CF: June (financing inflow) | Financing classification |
| CF: July (no cash entries) | Non-cash transactions |
| All reconciliation checks pass | Identity verification |
| Reconciliation covers all check types | Coverage completeness |

---

## Run Commands
```bash
npx vitest run tests/statements/                    # All statement tests (~52)
npx vitest run tests/statements/balance-sheet.test.ts  # Balance sheet only
npx vitest run tests/statements/income-statement.test.ts # Income statement only
npx vitest run tests/statements/cash-flow.test.ts      # Cash flow only
npx vitest run tests/statements/cashflow-identities.test.ts # ASC 230 identities
```

## Related Skills
- `.claude/skills/finance/balance-sheet.md` — Balance sheet construction rules
- `.claude/skills/finance/income-statement.md` — Income statement architecture
- `.claude/skills/finance/cash-flow-statement.md` — Cash flow statement architecture
- `.claude/skills/finance/validation-identities.md` — GAAP identity formulas
