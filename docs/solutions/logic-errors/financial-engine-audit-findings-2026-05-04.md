---
title: "Financial Engine Audit: Eight Integrity Findings in Cash Flow, Debt, and Rollup Logic"
date: 2026-05-04
category: docs/solutions/logic-errors
module: lib/engine
problem_type: logic_error
component: tooling
severity: high
symptoms:
  - "CFO = NOI − interest − tax, differs from GAAP indirect CFO = netIncome + depreciation by expenseFFE"
  - "Refinance loan sized on cost basis (purchasePrice + improvements) × LTV instead of documented income-capitalization"
  - "PMT monthly rate silently capped at 5%/month (60% annual); returns wrong payment for bridge/high-rate loans"
  - "Fee subordination gate fires on pre-fee ANOI proxy, not post-debt-service cash"
  - "All fixed costs including taxes and insurance suppressed until isOperational; pre-opening carry understated"
root_cause: logic_error
resolution_type: code_fix
related_components:
  - testing_framework
tags:
  - financial-engine
  - cash-flow
  - proof-test
  - refinance
  - pmt
  - aggregation
  - noi
  - gaap
---

# Financial Engine Audit: Eight Integrity Findings in Cash Flow, Debt, and Rollup Logic

> **Status note (2026-05-09):** A code inspection session found evidence that MAJOR-2 (refinance sizing), MAJOR-3 (PMT silent cap), MAJOR-5 (pre-ops fixed-cost gating), and MINOR-7 (aggregation deduplication) appear to have been resolved in subsequent engine work. MAJOR-1, MAJOR-4, MINOR-6, and INFO-8 status is unchanged. The findings below are preserved as-documented for formal verification — do not remove findings without re-running the proof tests (`artifacts/api-server/src/tests/proof/`) to confirm resolution. This is a protected surface (CLAUDE.md §9); all verification must be done in a shell CC session.

## Problem

A systematic financial integrity audit of `lib/engine` identified eight material findings spanning
the cash-flow statement, debt calculations, fee logic, and portfolio rollup. All findings were
confirmed against source code; the five MAJOR findings are currently untested by the proof suite.
Nothing is fixed yet — this doc captures what needs addressing and what tests to add.

## Symptoms

- `cashFlowSections.ts` CFO deviates from GAAP indirect method by `expenseFFE` (FFE moved to CFI
  but no test proves CFO + CFI + CFF reconciles to actual cash change).
- Refinance proceeds printed on reports are sized from cost basis, not stabilized income value —
  potentially understating or overstating projected equity at refi.
- Very-high-rate loans (bridge debt > 60% annual) produce wrong `pmt()` output with no error or
  log — the cap is invisible to callers.
- Management fees can accrue on a property with negative post-debt cash flow when the
  subordination gate checks pre-interest ANOI rather than levered cash.
- Pre-opening carry period shows zero operating expenses, distorting equity-required projections
  for properties with significant lead times between acquisition and opening.

## What Didn't Work

- **Direct-method-only CFO (session history)**: An earlier version provided only a direct-method
  cash flow, making Net Income → Cash reconciliation impossible. The current approach shifts to a
  hybrid that moves FFE to CFI — but the reconciliation identity was never tested.
- **Feb 2026 GAAP audit (session history)**: Found 25 violations including FF&E double-count and
  land in depreciation base. Those were fixed, but CFO/CFI section semantics were not audited at
  that time.
- **Apr 2026 Ultra Audit (session history)**: Found FCF working capital hardcoded to zero and
  floating-point drift in IRR (`Math.pow` vs `dPow`). FCFE definition drift was not flagged then.
- **Consolidated summation (session history)**: Early portfolio rollup summed every field, which
  failed for acquisition-date-gated metrics and inter-company fee eliminations. The fix gated
  revenue accumulation but did not revisit NOL, which remains summed.
- **`isAcquired + isOperational` gate (session history)**: A deliberate design decision was
  documented to gate revenue on `isOperational` while letting taxes and insurance accrue from
  `isAcquired`. The current implementation applies `fixedCostFactorGated` (which requires
  `isOperational`) to **both** `expenseTaxes` and `expenseInsurance`, diverging from that intent.

## Solution

Each finding requires a targeted fix. Ordered by severity:

### MAJOR-1 · CFO identity — prove or realign

**Where**: `lib/engine/src/aggregation/cashFlowSections.ts`

The current formula:
```typescript
// Actual implementation (line ~53)
const cfo = revenueTotal - (totalExpenses - expenseFFE) - cf.interestExpense - cf.taxLiability;
// expands to: NOI − interest − tax
```

GAAP indirect method:
```typescript
// netIncome = ANOI − interest − depreciation − tax
// CFO = netIncome + depreciation = (NOI − expenseFFE) − interest − tax
const netIncome = anoi - interestExpense - depreciationExpense - incomeTax;
const cfoGaap = netIncome + depreciationExpense; // = NOI − expenseFFE − interest − tax
```

They differ by `expenseFFE`. Since FFE is currently placed in CFI
(`cfi = −acqCost − expenseFFE + exitValue`), the presentation choice can be defended as
"FFE is capex, not operating cash" — **but only if CFO + CFI + CFF reconciles to actual cash
change**. Add this test first:

```typescript
it('CFO + CFI + CFF reconciles to net cash change', () => {
  const yearly = aggregateByYear(monthly);
  for (const yr of yearly) {
    const sections = buildCashFlowSections(yr, assumptions, loan);
    const netFromSections = sections.cfo + sections.cfi + sections.cff;
    // endingCash delta approximation
    const netFromEngine = yr.endingCash - priorYearEndingCash;
    expect(netFromSections).toBeCloseTo(netFromEngine, 0);
  }
});
```

If the test fails, align the formula to GAAP indirect and move FFE back to CFO.

### MAJOR-2 · Refinance sizing — cost basis vs. income capitalization

**Where**: `lib/engine/src/debt/loanCalculations.ts` line ~258

```typescript
// Current: cost basis
const costBasisValue = (property.purchasePrice ?? 0) + (property.buildingImprovements ?? 0);
const refiLoanAmount = costBasisValue * refiLTV;

// Documented intent (module header): income capitalization
const stabilizedNOI = /* Year-N NOI from engine output */;
const marketValue = stabilizedNOI / exitCapRate;
const refiLoanAmount = marketValue * refiLTV;
```

**Decision needed**: If income-capitalization is the correct method, update `calculateRefinanceParams`
to use the engine's projected NOI at the refinance year divided by exit cap rate. If cost basis is
intentionally conservative for boutique-hotel underwriting, update the module comment and add a
flag to expose the choice in the UI assumptions panel.

Add a golden test pinning refi proceeds for a known NOI / cap rate / LTV triple regardless of
which method is chosen.

### MAJOR-3 · PMT rate cap — silent wrong result

**Where**: `lib/calc/src/shared/pmt.ts` line 37

```typescript
// Current: silently caps at 5%/month (60% APR)
const safeRate = Math.min(monthlyRate, 0.05);
```

Options:
1. Remove the cap and let callers validate input range (preferred — fail loudly).
2. Replace with `throw` or `console.error` when `monthlyRate > 0.05`.
3. Keep cap but add a test that the uncapped path is never reached in practice.

```typescript
// Add to engine-edge-cases.test.ts:
it('pmt throws or logs for monthly rate above 5%', () => {
  expect(() => pmt(500_000, 0.06, 360)).toThrow(); // or check logger
});

// Add accuracy test for rates just below the cap:
it('pmt is accurate at 4.9% monthly rate', () => {
  const payment = pmt(100_000, 0.049, 12);
  // Analytical: P*r*(1+r)^n / ((1+r)^n - 1)
  const r = 0.049, n = 12, P = 100_000;
  const expected = P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  expect(payment).toBeCloseTo(expected, 2);
});
```

### MAJOR-4 · Fee subordination gate ignores interest

**Where**: `lib/engine/src/property/property-engine.ts` (lines ~182–196)

The subordination check fires on an ANOI-derived proxy **before** interest expense is deducted.
A property with `ANOI > threshold` but `ANOI − interest < 0` still pays management fees,
contradicting the subordination intent (fees deferred when cash is insufficient after debt).

Fix: compute `prelimCashBeforeFeesAfterDebt = ANOI - interestExpense` and gate on that value.

```typescript
// Test case to add:
it('subordinated fees are zero when post-debt cash is negative', () => {
  // Construct a property: high interest expense, moderate ANOI
  // ANOI = 50_000, interest = 60_000 → post-debt = -10_000
  // Fee should be $0 despite positive ANOI
  const monthly = runEngine(highInterestAssumptions);
  const feeMonths = monthly.filter(m => m.effectiveFeeBase > 0);
  expect(feeMonths.length).toBe(0);
});
```

### MAJOR-5 · Pre-ops fixed-cost gating

**Where**: `lib/engine/src/property/property-engine.ts`

```typescript
// Taxes and insurance — both currently use fixedCostFactorGated (isOperational)
expenseTaxes     = ctx.totalPropertyValueDiv12 * costRateTaxes    * fixedCostFactorGated;
expenseInsurance = ctx.totalPropertyValueDiv12 * costRateInsurance * fixedCostFactorGated;
```

The design decision (session history) was for taxes and insurance to accrue from `isAcquired`,
not `isOperational`. The implementation diverged. Fix:

```typescript
// Use fixedCostFactorAcquired (gates on isAcquired, not isOperational)
expenseTaxes     = ctx.totalPropertyValueDiv12 * costRateTaxes    * fixedCostFactorAcquired;
expenseInsurance = ctx.totalPropertyValueDiv12 * costRateInsurance * fixedCostFactorAcquired;
// Admin, IT, propertyOps remain gated on isOperational — these are staffing costs
```

Add a proof test asserting nonzero `expenseTaxes` in a month that is post-acquisition but
pre-operations.

### MINOR-6 · FCFE nonstandard definition

**Where**: `lib/engine/src/aggregation/cashFlowSections.ts` lines ~78–82

```typescript
// Current
const fcf  = cfo - (i === acquisitionYear ? loan.equityInvested : 0);
const fcfe = fcf - cf.principalPayment;
```

Standard FCFE = `netIncome + depreciation − capex − ΔWC − principalRepayment`. The current
definition embeds acquisition-year equity as the only "capex," which is nonstandard and
conflates equity outflow with ongoing capital expenditure. Either:
- Rename the metric (e.g., `leveragedCashFlow`) to avoid comparison confusion.
- Align to standard FCFE and pin it in a golden test with arithmetic derivation.

### MINOR-7 · Aggregation loop duplication

**Where**: `lib/engine/src/aggregation/yearlyAggregator.ts`

`aggregatePropertyByYear` and the income-statement accumulation portion of `aggregateUnifiedByYear`
share ~50 lines of nearly identical accumulation logic. `aggregateUnifiedByYear` adds an
`operationalMonthsInYear` counter not present in `aggregatePropertyByYear`.

Risk: a field added to one function silently missing from the other. Mitigation:

```typescript
// Extract shared accumulation into a helper
function accumulateMonthlyIS(acc: YearlyIS, m: MonthlyFinancials): void {
  acc.revenueRooms += m.revenueRooms;
  acc.revenueTotal += m.revenueTotal;
  // ... all ~25 shared fields
}
// Both aggregatePropertyByYear and aggregateUnifiedByYear call accumulateMonthlyIS
```

Until refactored, add a cross-check test that runs both functions on the same monthly array and
asserts matching IS totals.

### INFO-8 · Consolidated NOL summed

**Where**: `lib/engine/src/aggregation/consolidation.ts`

```typescript
target.nolBalance += src.nolBalance; // Not meaningful at portfolio level
```

NOL is entity-specific (per-SPV); portfolio-level sum has no tax authority. The value is used for
display only — confirm no downstream consumer treats consolidated `nolBalance` as authoritative
for a portfolio-level tax calculation. Add a comment to `consolidation.ts`:

```typescript
// nolBalance: summed for display only — not economically meaningful at portfolio level.
// Entity-level NOL (per property) is the authoritative figure. See NOL_UTILIZATION_CAP.
target.nolBalance += src.nolBalance;
```

## Why This Works

The root causes cluster into three patterns:

1. **Documentation/implementation drift**: Module headers document one method (income-cap refi,
   taxes from acquisition), code implements another. These drift silently because no test pins the
   formula against an analytical derivation.

2. **Missing section-level identity tests**: The proof suite tests field-level waterfall identities
   (GOI → GOP → NOI → ANOI) but not section-level cash flow identities (CFO + CFI + CFF = ΔCash).
   Section misattribution (FFE in CFO vs CFI) is invisible without the reconciliation test.

3. **Silent safety guards**: `Math.min(monthlyRate, 0.05)` and `fixedCostFactorGated` are
   conservative defaults that produce wrong results in edge cases (high rates, pre-ops carry)
   without any logging or test assertion.

Fixing these requires (a) analytical proof tests that pin each formula with arithmetic derivation,
(b) reconciliation identity tests across section boundaries, and (c) removing or loud-failing
silent guards.

## Prevention

- **Every cash-flow section must have a reconciliation test**: CFO + CFI + CFF = ΔendingCash.
  Add to `aggregation-crosscheck.test.ts`.
- **Module header comments are contracts**: If the header says "income-capitalization," the
  implementation must match or the comment must be updated with an explicit rationale for
  the deviation.
- **No silent rate caps**: Safety guards in financial math must either throw, log at WARN, or
  be covered by an out-of-range test that asserts the guard fires and what it returns.
- **Algebraic pin provenance**: Every analytical proof pin must include the derivation inline as a
  comment (e.g., `// soldRooms: 10 rooms × 30.5 days/month × 12 months = 3,660`). See
  `.agents/skills/hplus-proof-test-standards/SKILL.md` for the full pin provenance standard.
- **Shared accumulation helpers**: Any loop body used in two places must be extracted into a
  shared helper so fixes propagate to both paths. Enforced by the aggregation-crosscheck test.
- **Pre-ops cost gating audit on every new fixed-cost line**: New fixed costs added to the engine
  must explicitly declare whether they gate on `isAcquired` or `isOperational`, matching the
  cost's real-world accrual trigger.

## Related Issues

- `.agents/skills/hplus-proof-test-standards/SKILL.md` — pin provenance and analytical vs.
  snapshot pin classification
- `artifacts/api-server/src/tests/proof/` — full proof suite (105 tests, 8 files)
- `docs/solutions/logic-errors/reference-brands-dropped-from-llm-prompt-2026-05-02.md`
- `docs/solutions/architecture-patterns/lb-deck-composite-payload-architecture-2026-05-04.md` —
  uses `aggregateUnifiedByYear`; may surface incorrect CFO if MAJOR-1 is confirmed a bug
