# Testing: Consolidated / Portfolio-Level Statements

## Scope
Tests for multi-property portfolio aggregation, intercompany eliminations, and consolidated financial statements.

## Entity Level
**Consolidated Portfolio** — tests operate on multi-property aggregated data with intercompany elimination logic.

---

## Test Files

### Golden Scenario 4: Portfolio Aggregate — `tests/proof/scenarios.test.ts`
Tests multi-property aggregation without eliminations.

| Test | What It Proves |
|------|---------------|
| Portfolio revenue = Σ(property revenues) | Aggregation correctness |
| Portfolio NOI = Σ(property NOIs) | Expense aggregation |
| Portfolio debt = Σ(property debts) | Liability aggregation |
| Portfolio BS: A = L + E | Consolidated identity |
| Financial identities pass for every year-end | Periodic verification |

### Golden Scenario 5: Consolidated + Eliminations — `tests/proof/scenarios.test.ts`
Full consolidation with management company and intercompany elimination.

| Test | What It Proves |
|------|---------------|
| Σ(SPV management fees) = OpCo management fee revenue | Fee linkage identity |
| Intercompany elimination entries net to zero | ASC 810 elimination |
| Consolidated revenue = sum - eliminations | Net revenue after elimination |
| Consolidated BS balances after elimination | A = L + E post-elimination |

### Portfolio IRR — `tests/analytics/portfolio-irr.test.ts` (7 tests)
Tests portfolio-level return metrics across multiple properties.

| Test | What It Proves |
|------|---------------|
| Two properties acquired simultaneously | Simultaneous acquisition IRR |
| Staggered acquisitions (Property B in Year 2) | Time-offset aggregation |
| Three properties with different acquisition years | Multi-timing portfolio |
| Portfolio MOIC = total distributions / total invested | MOIC identity |
| Portfolio IRR between individual property IRRs | Diversification bound |
| Net profit = total distributions - total invested | Profit identity |
| DPI = MOIC for fully realized investment | DPI/MOIC equivalence |

### Reconciliation Reports — `tests/proof/reconciliation-report.test.ts` (~6 tests)
Generates and validates reconciliation artifacts for all 5 golden scenarios.

| Test | What It Proves |
|------|---------------|
| Each scenario generates report with all checks passing | Per-scenario validation |
| Consolidated elimination report generated | Elimination artifact |

---

## Key Consolidated Identities

```
Consolidated Revenue = Σ(Property Revenue) + OpCo Revenue - Intercompany Fees
Consolidated Expenses = Σ(Property Expenses) + OpCo Expenses - Intercompany Fees
Consolidated Assets = Σ(Property Assets) + OpCo Assets - Intercompany Receivables
Consolidated Liabilities = Σ(Property Liabilities) + OpCo Liabilities - Intercompany Payables
Elimination entries always net to zero (debit = credit)
```

## Run Commands
```bash
npx vitest run tests/proof/scenarios.test.ts           # All 5 golden scenarios
npx vitest run tests/analytics/portfolio-irr.test.ts   # Portfolio IRR tests
npx vitest run tests/proof/reconciliation-report.test.ts # Reconciliation artifacts
```

## Related Skills
- `.claude/skills/finance/consolidation.md` — Consolidation rules and elimination logic
- `.claude/skills/finance/fee-linkage.md` — Intercompany fee linkage identity
- `.claude/skills/finance/validation-identities.md` — GAAP identity formulas
