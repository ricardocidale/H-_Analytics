---
name: proof-system
description: Automated financial proof system with ~4,191 tests across 204 files, 15-phase verification (498 checks), golden scenarios, and hand-calculated golden reference tests. Use when running verification, adding tests, debugging financial calculations, or reviewing proof coverage.
---

# Automated Financial Proof System

## Purpose
Eliminates human Excel verification. Code proves itself correct through ~4,191 automated tests (204 files) across golden scenarios, hand-calculated golden reference tests, 15-phase verification pipeline (498 checks), input-to-output pipeline verification, and magic number detection.

## Commands
```bash
npm run health             # All-in-one: tsc + tests + verification + doc harmony (~90s)
npm run test:summary       # All tests, 1-line output (~30s)
npm run verify:summary     # 15-phase financial verification only (~8s)
npm run lint:summary       # ESLint check (<10s)
npm run stats              # File/line/test counts (<5s, no vitest or tsc)
npm run audit:quick        # Code quality scan: `any`, TODO, console.log (<3s)
npm run exports:check      # Unused export detection (<5s)
npm run diff:summary       # Git status + diff stats (<1s)
npx tsx script/export-audit.ts  # 41-check export wiring validation (<2s)
```

### Workflow Weight Guide
| Workflow | Runs tsc? | Runs vitest? | Time | Use When |
|----------|-----------|-------------|------|----------|
| health | Yes | Yes (full) | ~90s | Pre-commit gate, full validation |
| test:summary | No | Yes (full) | ~30s | Quick test pass/fail check |
| verify:summary | No | Yes (15 phases) | ~8s | Financial engine changes only |
| lint:summary | No | No | <10s | ESLint quick spot-check |
| stats | No | No | <5s | Codebase metrics overview |
| audit:quick | No | No | <3s | Code smell detection |
| exports:check | No | No | <5s | Dead code detection |

## 15-Phase Verification (498 Checks)
1. **Proof Scenarios** (34) — Golden scenarios test every financial structure
2. **Hardcoded Detection** (20) — Scans finance files for magic numbers
3. **Golden Values** (27) — Hand-calculated reference value validation
4. **Reconciliation** (4) — Artifact reports with math checks
5. **Data Integrity** (6) — Shared ownership, singleton queries
6. **Portfolio Dynamics** (8) — Multi-property aggregation and consolidation
7. **Recalc Enforcement** (54) — Every financial mutation invalidates queries
8. **Rule Compliance** (22) — Domain boundaries and business rule checks
9. **Number Precision** (39) — Decimal.js arithmetic verification
10. **Decimal Boundaries** (40) — Edge case boundary testing
11. **Aggregation Xcheck** (130) — Cross-check aggregation results
12. **Snapshot Integrity** (31) — Scenario snapshot immutability
13. **Regression Snapshots** (31) — Regression detection
14. **Parity Numeric** (29) — Statement builder ↔ on-screen parity
15. **Cache Integrity** (23) — Computation cache validation

## Audit Opinion Outputs
- **UNQUALIFIED** — All checks pass. No human verification needed.
- **QUALIFIED** — Minor issues detected. Review required.
- **ADVERSE** — Critical failures. Do not ship.

Only UNQUALIFIED is acceptable for production.

## 5 Structural Golden Scenarios (tests/proof/scenarios.test.ts)

| # | Scenario | What It Proves |
|---|----------|---------------|
| 1 | Cash purchase (no debt) | Pure equity model, no loan paths active |
| 2 | Financed purchase (LTV) | Debt sizing, amortization, DSCR, debt service |
| 3 | Cash → refinance year 3 | Refi mechanics, cash-out, loan swap, payoff |
| 4 | Portfolio aggregate | Multi-property aggregation, fee linkage |
| 5 | Consolidated + eliminations | Full intercompany elimination, consolidated statements |

## 761 Hand-Calculated Golden Tests (tests/golden/, 30 files)

| File | Tests | Calculators Covered |
|------|-------|--------------------|
| `irr-edge-cases.test.ts` | 8 | IRR: single exit, monthly, near-zero, high, negative, alternating signs, 30yr, break-even |
| `dcf-npv.test.ts` | 8 | DCF/NPV: standard, zero rate, high rate, IRR cross-check, monthly, PV timeline |
| `equity-exit.test.ts` | 9 | Equity Multiple (2×, loss, break-even, multi-invest) + Exit Valuation (standard, debt-free, underwater, per-key) |
| `dscr-loan-sizing.test.ts` | 7 | DSCR: binding, LTV binding, IO, zero NOI, over-qualified, actual DSCR/implied LTV |
| `depreciation-breakeven.test.ts` | 10 | Depreciation (standard, improvements, 100% land, tax shield) + Break-Even (operating, cash flow, ancillary, sensitivity) |
| `stress-waterfall.test.ts` | 8 | Stress Test (recession, pandemic, risk score) + Waterfall (2-tier, shortfall, catch-up, zero) |
| `proforma-edge-cases.test.ts` | 15 | Full engine: all-cash, 90% LTV, zero revenue, negative tax, growth, ramp, refinance |

See `.claude/skills/testing/golden-scenarios.md` for full documentation of every scenario with hand-calculated derivations.

## 31 Enforced Guarantees
See `tests/proof/NO_EXCEL_GUARANTEE.md` for the full checklist mapping each guarantee to its enforcing test file.

## Key Test Files
```
tests/proof/
├── scenarios.test.ts           # 5 golden scenario tests
├── input-verification.test.ts  # 29 input-to-output pipeline tests
├── hardcoded-detection.test.ts # Magic number scanner (8 finance files)
├── reconciliation-report.test.ts # Artifact generator + debt reconciliation
├── verify-runner.ts            # 4-phase orchestrator
└── NO_EXCEL_GUARANTEE.md       # 31-item guarantee checklist
```

## Input-to-Output Pipeline Coverage
- Revenue: rooms × ADR × occupancy × DAYS_PER_MONTH (recomputed from scratch)
- ADR: compounds at adrGrowthRate annually, flat within each year
- Occupancy: ramps from startOccupancy in steps, capped at maxOccupancy
- Variable costs: revenue × costRate (rooms, F&B, events, marketing, utilities, FF&E)
- Fixed costs: Year 1 base × costRate × (1 + escalationRate)^year
- Refi: NOI-cap valuation × LTV, proceeds = gross − closing costs

## Artifacts
`test-artifacts/` contains per-scenario JSON + Markdown reconciliation reports:
- Sources & Uses at acquisition
- NOI → FCF bridge
- Begin Cash → End Cash bridge
- Debt schedule reconciliation
- Intercompany elimination summary

## Key Invariants Tested
- Balance Sheet: A = L + E (ASC 210)
- OCF = NI + Depreciation (ASC 230-10-45)
- NI = NOI - Interest - Depreciation - Tax (ASC 220)
- CFF = -Principal + Refi Proceeds (ASC 230-10-45-15)
- Ending Cash = Beginning Cash + Net Cash Change (ASC 230-10-45-24)
- Fee Linkage: Σ(SPV fees) = OpCo revenue (intercompany)
- Consolidated eliminations net to zero
- FCFE Direct ≡ FCFE From-NI (two-method reconciliation)
- NPV = 0 at computed IRR (cross-validation)

## Hardcoded Value Detection
- Scans: `financial/property-engine.ts`, `financial/company-engine.ts`, `refinance-calculator.ts`, `financial-identities.ts`, `schedule-reconcile.ts`, `consolidation.ts`
- Safe numbers: 0, 1, -1, 2, 12, 100
- Context exceptions: loop counters, array indices, Math functions, string literals

## Detailed Testing Skills
For per-statement and per-analysis test coverage, see:

| Skill | Path | Scope |
|-------|------|-------|
| Property Statements | `.claude/skills/testing/property-statements.md` | IS, CF, BS at property level |
| Consolidated Statements | `.claude/skills/testing/consolidated-statements.md` | Portfolio aggregation, eliminations |
| Management Company | `.claude/skills/testing/management-company.md` | OpCo pro forma, fee linkage, funding |
| Analysis: Returns | `.claude/skills/testing/analysis-returns.md` | IRR, NPV, MOIC, sensitivity |
| Analysis: DCF/FCF | `.claude/skills/testing/analysis-dcf-fcf.md` | FCF, FCFE reconciliation |
| Financing & Refinancing | `.claude/skills/testing/financing-refinance-funding.md` | Debt, refi, funding instruments |
| **Golden Scenarios** | **`.claude/skills/testing/golden-scenarios.md`** | **761 hand-calculated tests (30 files): IRR, DCF, DSCR, depreciation, break-even, stress, waterfall, exit, equity multiple, pro-forma edge cases** |

## Maintenance
1. Run `npm test` — all ~4,191 tests must pass
2. Run `npm run verify` — all 15 phases (498 checks) must pass with UNQUALIFIED opinion
3. Run `npx vitest run tests/golden/` — hand-calculated tests must pass
4. Check `test-artifacts/*.md` for UNQUALIFIED opinions
5. New constants go in `shared/constants.ts` (never inline magic numbers)
6. New calculators require golden tests with hand-calculated reference values
7. Update testing skills when adding new test suites
