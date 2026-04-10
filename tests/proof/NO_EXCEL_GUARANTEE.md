# No-Excel Guarantee Checklist

Every item below is enforced by automated tests. If any check fails, the build is blocked.

## Enforced by `npm test` (4,463 tests)

| # | Guarantee | Enforcing Test |
|---|-----------|---------------|
| 1 | All calculations flow from assumptions → constants → calculators → statements (no ad-hoc math) | `tests/proof/hardcoded-detection.test.ts` |
| 2 | No magic numbers in 8 finance-critical files (only `constants.ts` or assumptions) | `tests/proof/hardcoded-detection.test.ts` |
| 3 | Balance sheet balances every period (Assets = Liabilities + Equity) | `tests/proof/scenarios.test.ts` |
| 4 | Cash flow statement ties to change in cash every period | `tests/proof/scenarios.test.ts` |
| 5 | Debt roll-forward ties to debt schedule | `tests/proof/scenarios.test.ts` |
| 6 | Equity roll-forward ties to contributions/distributions | `tests/proof/scenarios.test.ts` |
| 7 | Intercompany matching: management fee revenue = property fee expense per period | `tests/proof/scenarios.test.ts` |
| 8 | Consolidated eliminations: intercompany amounts net to zero | `tests/proof/scenarios.test.ts` |
| 9 | Monthly → yearly rollup correctness | `tests/engine/proforma-golden.test.ts` |
| 10 | Depreciation follows 39-year straight-line per IRC §168(e)(2)(A) | `tests/engine/proforma-golden.test.ts` |
| 11 | Loan amortization matches PMT formula | `tests/financing/sizing.test.ts` |
| 12 | Refinance payoff and sizing calculations correct | `tests/refinance/payoff.test.ts`, `tests/refinance/sizing.test.ts` |
| 13 | IRR computation via Newton-Raphson matches expected values | `tests/analytics/irr.test.ts` |
| 14 | FCF derivation from NOI is correct | `tests/analytics/fcf.test.ts` |
| 15 | Income statement line items tie to engine outputs | `tests/statements/income-statement.test.ts` |
| 16 | Cash flow statement sections reconcile | `tests/statements/cash-flow.test.ts` |
| 17 | Cross-statement reconciliation passes | `tests/statements/reconcile.test.ts` |
| 18 | Revenue independently recomputed: rooms × ADR × occupancy × DAYS_PER_MONTH | `tests/proof/input-verification.test.ts` |
| 19 | Events, F&B, Other revenue = room revenue × share rates | `tests/proof/input-verification.test.ts` |
| 20 | Variable costs = revenue × cost rate (rooms, F&B, events, marketing, utilities, FF&E) | `tests/proof/input-verification.test.ts` |
| 21 | Fixed costs anchored to Year 1 base revenue × cost rate × escalation factor | `tests/proof/input-verification.test.ts` |
| 22 | Fixed cost escalation compounds annually at fixedCostEscalationRate | `tests/proof/input-verification.test.ts` |
| 23 | Escalation rate independent from inflation rate when both are set | `tests/proof/input-verification.test.ts` |
| 24 | Zero escalation = flat fixed costs | `tests/proof/input-verification.test.ts` |
| 25 | ADR compounds at adrGrowthRate annually, flat within each year | `tests/proof/input-verification.test.ts` |
| 26 | Occupancy ramps from startOccupancy in steps every rampMonths, capped at maxOccupancy | `tests/proof/input-verification.test.ts` |
| 27 | Refi loan sized from NOI-cap valuation × LTV | `tests/proof/input-verification.test.ts` |
| 28 | Refi proceeds = gross loan − closing costs | `tests/proof/input-verification.test.ts` |
| 29 | Consolidated BS uses engine-computed property values (not hand-picked) | `tests/proof/scenarios.test.ts` |
| 30 | Portfolio NOI independently verified: GOP − fees − FF&E | `tests/proof/scenarios.test.ts` |
| 31 | Debt reconciliation actually verified (beginning − payments = ending) | `tests/proof/reconciliation-report.test.ts` |

## Golden Scenario Coverage

| Scenario | What It Proves |
|----------|---------------|
| Cash purchase (no debt ever) | Pure equity model, no loan paths active |
| Financed purchase (LTV binding) | Debt sizing, amortization, DSCR, debt service |
| Cash purchase → refinance year 3 | Refi mechanics, cash-out, loan swap, payoff |
| Portfolio aggregate (no eliminations) | Multi-property aggregation, fee linkage without consolidation |
| Consolidated with eliminations | Full intercompany elimination, consolidated statements |

## Input-to-Output Pipeline Verification

| Input | Verification |
|-------|-------------|
| roomCount, startAdr, startOccupancy | Revenue recomputed from scratch for every month |
| adrGrowthRate | ADR compounding verified at year boundaries |
| occupancyRampMonths, occupancyGrowthStep, maxOccupancy | Ramp steps verified at 10 checkpoints |
| costRate* (rooms, F&B, marketing, etc.) | Each variable cost = revenue × rate |
| fixedCostEscalationRate | Fixed costs = base × (1 + rate)^year, tested at Years 1, 2, 5, 10 |
| inflationRate vs fixedCostEscalationRate | Separate scenario proves independence |
| refinanceLTV, refinanceClosingCostRate | Loan amount and proceeds verified against NOI-cap |

## Reconciliation Artifacts

For every golden scenario, `test-artifacts/` contains:
- **JSON**: Machine-readable reconciliation data
- **Markdown**: Human-readable proof report covering:
  - Sources & Uses at acquisition
  - NOI → FCF bridge
  - Begin Cash → End Cash bridge
  - Debt schedule reconciliation (actually verified, not hardcoded)
  - Intercompany elimination summary

## Commands

```bash
npm test                  # Run all 4,463 tests
npm run verify            # Full 4-phase verification (UNQUALIFIED = pass)
npx vitest run --watch    # Watch mode for development
```

## Audit Opinion

The verification runner (`npm run verify`) outputs one of:
- **UNQUALIFIED** — All checks pass. No human verification needed.
- **QUALIFIED** — Minor issues detected. Review required.
- **ADVERSE** — Critical failures. Do not ship.

Only UNQUALIFIED is acceptable for production.
