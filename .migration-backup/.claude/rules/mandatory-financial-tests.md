# Mandatory Financial Integrity Tests

**These tests MUST pass before any financial code change is complete.**

## Critical Test File

`tests/engine/operating-reserve-cash.test.ts` — 13 tests guarding operating reserve, per-property financing, and refinance cash reconciliation.

## Quick Command

```bash
npm run test:file -- tests/engine/operating-reserve-cash.test.ts
```

## What They Guard

1. **Operating reserve** — seeds ending cash at acquisition month; flows through cumulative cash
2. **Per-property financing** — engine uses `acquisitionInterestRate` / `acquisitionTermYears`, NOT legacy `debtAssumptions.*`
3. **Refinance path** — Pass 2 rebuild re-seeds operating reserve at acquisition month index
4. **Pre-ops gap** — debt payments during gap; reserve covers them (no negative cash)

## When to Run

After ANY change to: `financial/property-engine.ts`, `financial/company-engine.ts`, `financialAuditor.ts`, `calculationChecker.ts`, `runVerification.ts`, `loanCalculations.ts`, `cashFlowAggregator.ts`, seed data, or financial fields in `shared/schema.ts`. Also runs automatically with `npm run test:summary`.

## If Tests Fail

**STOP.** Check: (1) reserve seeded at acquisition month index, (2) per-property fields used not legacy `debtAssumptions`, (3) `convertToAuditInput()` passes all required fields. Then run `npm run verify:summary`.
