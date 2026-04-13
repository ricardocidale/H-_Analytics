---
name: Testing & Proof System
description: Documents the full 4,536+-test automated verification system. Every financial statement, analysis, and engine calculation has dedicated tests that prove correctness without manual Excel verification.
---

# Testing & Proof System — Master Skill

## Purpose
Documents the full 4,536+-test automated verification system (187+ files). Every financial statement, analysis, and engine calculation has dedicated tests that prove correctness without manual Excel verification.

## Commands
```bash
npm test                              # Run all 4,536+ tests
npm run verify                        # Full 7-phase verification (UNQUALIFIED = pass)
npx vitest run tests/statements/      # Statement tests only
npx vitest run tests/analytics/       # Analytics/returns tests only
npx vitest run tests/engine/          # Engine (property + company pro forma) tests only
npx vitest run tests/financing/       # Acquisition financing tests only
npx vitest run tests/refinance/       # Refinancing tests only
npx vitest run tests/funding/         # Funding instrument tests only
npx vitest run tests/proof/           # Proof system (scenarios + hardcoded detection)
npx vitest run tests/golden/          # Golden hand-calculated scenarios (207 tests, ~3s)
npx vitest run tests/calc/validation/ # Validation tests only
npx vitest run tests/auth/            # Auth utility tests only
```

## Test Suite Map (187+ files, 4,536+ tests)

### By Domain

| Domain | Directory | Files | Tests | What It Proves |
|--------|-----------|-------|-------|----------------|
| Statements | `tests/statements/` | 9 | ~52 | BS, IS, CF extraction, trial balance, reconciliation, ASC 230 identities |
| Analytics | `tests/analytics/` | 10 | ~101 | IRR, NPV, MOIC, FCF, FCFE, sensitivity, portfolio IRR, refi/exit vectors |
| Engine | `tests/engine/` | 10 | ~589 | Property pro forma golden, company pro forma golden, per-property fees, formatters, loan calculations, edge cases, cash flow aggregator, yearly aggregator, equity calculations, GAAP compliance |
| Financing | `tests/financing/` | 4 | ~20 | Acquisition loan sizing, closing costs, amort schedules, journal hooks |
| Refinancing | `tests/refinance/` | 6 | ~35 | Refi sizing, schedule, flags, payoff, calculator, golden |
| Funding | `tests/funding/` | 5 | ~25 | Funding engine, gates, timeline, equity rollforward, golden |
| Proof | `tests/proof/` | 4 | ~140 | 5 golden scenarios, input verification, hardcoded detection, reconciliation |
| **Golden** | **`tests/golden/`** | **13** | **269** | **Hand-calculated reference values: IRR edge cases, DCF/NPV, equity multiple, exit valuation, DSCR, depreciation, break-even, stress test, waterfall, pro-forma edge cases, full statements, pre-ops gap, multi-property, company aggregation** |
| Validation | `tests/calc/validation/` | 3 | ~212 | Assumption consistency, funding gates, export verification |
| Auth | `tests/auth/` | 1 | ~1 | Auth utility functions |

### By Entity Level

| Entity Level | Relevant Test Files | What's Covered |
|-------------|---------------------|----------------|
| **Individual Property** | `engine/proforma-golden`, `proof/scenarios` (1-3), `proof/input-verification`, `statements/*`, `financing/*`, `refinance/*` | Revenue, expenses, NOI, debt service, cash flow, BS balance, depreciation, refi mechanics |
| **Consolidated Portfolio** | `proof/scenarios` (4-5), `analytics/portfolio-irr`, `proof/reconciliation-report` | Multi-property aggregation, intercompany eliminations, portfolio IRR, consolidated BS |
| **Management Company** | `engine/company-proforma` | Fee linkage (base + incentive), staffing tiers, fixed costs, partner compensation, SAFE funding, cash balance |

## Sub-Skills

| Skill | Path | Scope |
|-------|------|-------|
| Property Statements | `testing/property-statements.md` | Property-level IS, CF, BS tests |
| Consolidated Statements | `testing/consolidated-statements.md` | Portfolio aggregation, elimination, consolidated identity tests |
| Management Company | `testing/management-company.md` | Company pro forma, fee linkage, funding tests |
| Analysis: Returns | `testing/analysis-returns.md` | IRR, NPV, MOIC, sensitivity, portfolio IRR, refi/exit vectors |
| Analysis: DCF/FCF | `testing/analysis-dcf-fcf.md` | FCF, FCFE computation and two-method reconciliation |
| Financing & Refinancing | `testing/financing-refinance-funding.md` | Debt sizing, closing costs, refi schedules, funding instruments |
| **Golden Scenarios** | **`testing/golden-scenarios.md`** | **269 hand-calculated reference tests across 13 files: IRR, DCF, DSCR, depreciation, break-even, stress, waterfall, exit, equity, pro-forma edge cases, full statements, pre-ops gap, multi-property, company aggregation** |

## Key Invariants (All Tested)

| Identity | GAAP Reference | Test Location |
|----------|---------------|---------------|
| A = L + E | ASC 210 | `statements/balance-sheet`, `statements/cashflow-identities`, `proof/scenarios` |
| OCF = NI + Depreciation | ASC 230-10-45 | `proof/scenarios` |
| NI = NOI - Interest - Depreciation - Tax | ASC 220 | `proof/scenarios` |
| CFF = -Principal + Refi Proceeds | ASC 230-10-45-15 | `statements/cashflow-identities` |
| Ending Cash = Beginning + Net Change | ASC 230-10-45-24 | `statements/cashflow-identities`, `proof/scenarios` |
| FCFE (Direct) = FCFE (From NI) | Valuation identity | `analytics/fcfe-reconciliation` |
| NPV = 0 at IRR | Finance identity | `analytics/npv-irr-crosscheck` |
| Σ(SPV fees) = OpCo revenue | Intercompany | `proof/scenarios` (5), `engine/company-proforma` |
| Consolidated eliminations = 0 | ASC 810 | `proof/scenarios` (5) |

## 5 Golden Scenarios (tests/proof/scenarios.test.ts)

| # | Name | Tests | Entity Level |
|---|------|-------|-------------|
| 1 | Cash Purchase (Full Equity) | ~12 | Property |
| 2 | Financed Purchase (LTV) | ~12 | Property |
| 3 | Cash → Refinance Year 3 | ~12 | Property |
| 4 | Portfolio Aggregate | ~8 | Consolidated |
| 5 | Consolidated + Eliminations | ~8 | Consolidated + Mgmt Co |

## Maintenance Rules

1. **All 4,536+ tests must pass before any merge** — run `npm test`
2. **New financial calculations require new tests** — add to the appropriate domain directory
3. **New calculators require golden tests** — add hand-calculated reference values in `tests/golden/`
4. **New constants go in `shared/constants.ts`** — never inline magic numbers
5. **Hardcoded detection scans 8 finance files** — `proof/hardcoded-detection.test.ts`
6. **Update this skill and sub-skills when adding test suites**
7. **Only UNQUALIFIED audit opinion is acceptable** — run `npm run verify`
