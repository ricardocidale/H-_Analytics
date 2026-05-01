---
name: verification-system
description: Three-tier financial verification and audit opinion system. Covers server-side calculation checker, property/company/consolidated verification, GAAP compliance checks, audit opinions, and workpaper generation. Use when working on verification or audit features.
---

The three-tier financial verification and audit opinion system. Covers the independent server-side calculation checker, property/company/consolidated verification tiers, GAAP compliance checks, audit opinions, workpaper generation, and the AI review panel. Use this skill when working on verification, audit, financial validation, or checker-related features.

## Architecture

```
Verification System
|
+-- CLIENT-SIDE (runs in browser)
|   +-- financialAuditor.ts     -> GAAP audit with ASC references
|   +-- formulaChecker.ts       -> Formula integrity validation
|   +-- gaapComplianceChecker.ts -> Cash flow & compliance checks
|   +-- runVerification.ts      -> Orchestrator
|
+-- SERVER-SIDE (runs on server)
|   +-- calculationChecker.ts   -> Independent recalculation engine
|       (does NOT import from property-engine.ts or company-engine.ts)
|
+-- AI-POWERED (optional)
    +-- LLM methodology review via /api/verification/ai-review
```

**Key Design Principle:** The server-side checker reimplements all financial math from scratch, using only raw property data and global assumptions. If both engines produce the same results, accuracy is confirmed.

## GAAP Standards Referenced

| Standard | Topic | Where Applied |
|----------|-------|---------------|
| ASC 230 | Cash Flows | Cash flow classification |
| ASC 360 | PP&E | Depreciation, asset valuation |
| ASC 470 | Debt | Loan amortization, interest/principal |
| ASC 606 | Revenue | Revenue timing verification |
| USALI | Lodging Accounts | Hospitality expense categorization |
| FASB | General | Balance sheet equation, double-entry |

## Client-Side Verification

### Financial Auditor (`financialAuditor.ts`)
Audit sections: Timing Rules, Depreciation, Loan Amortization, Income Statement, Balance Sheet (A=L+E), Cash Flow Statement, Management Fees.

### Formula Checker (`formulaChecker.ts`)
Validates: Revenue = sum of components, GOP = Revenue - OpEx, NOI = AGOP - expenseTaxes, Net Income = NOI - Interest - Depreciation.

### GAAP Compliance Checker (`gaapComplianceChecker.ts`)
Cash flow classification (ASC 230), principal as financing (ASC 470), depreciation add-back (ASC 230), revenue timing (ASC 606).

## Server-Side Verification

### Calculation Checker (`server/calculationChecker.ts`)

**Completely independent** — does NOT import from client-side financial engine.

| Category | Check | GAAP Ref |
|----------|-------|----------|
| Revenue | Room revenue = rooms x ADR x occupancy x 30.5 | ASC 606 |
| Depreciation | Monthly = buildingValue / 27.5 / 12, only after acquisition | ASC 360 |
| Loan | PMT matches formula, Interest = balance x monthly rate | ASC 470 |
| Insurance | `expenseInsurance` = (totalPropertyValue / 12) × `costRateInsurance` × fixedCostFactor; company uses `businessInsuranceStart` / 12 | USALI |
| Balance Sheet | Assets = Liabilities + Equity (every month) | FASB |
| Cash Flow | Operating CF = Net Income + Depreciation | ASC 230 |
| Reasonableness | NOI margin 15-45%, positive revenue growth | Industry |

### Underfunding vs. Calculation Errors
**Negative cash balance is NOT a calculation error.** It is a business condition (insufficient reserves). Treated as `severity: "info"`, does NOT affect audit opinion.

## Audit Opinions

| Opinion | Criteria | Meaning |
|---------|----------|---------|
| **UNQUALIFIED** | 0 critical, 0 material | Clean — all calculations verified |
| **QUALIFIED** | 0 critical, some material | Minor discrepancies |
| **ADVERSE** | Any critical issues | Significant errors |

**Tolerance:** 1% variance for floating point comparison (`TOLERANCE = 0.01`).

## 7-Phase CLI Verification (`npm run verify:summary`)

| Phase | Test File | What It Checks |
|-------|-----------|----------------|
| Proof Scenarios | `tests/proof/scenarios.test.ts` | GAAP identities, loan amort, fees, consolidation |
| Hardcoded Detection | `tests/proof/hardcoded-detection.test.ts` | No magic numbers in finance code |
| Reconciliation | `tests/proof/reconciliation-report.test.ts` | Sources & Uses, NOI->FCF bridge, cash bridge |
| Data Integrity | `tests/proof/data-integrity.test.ts` | Shared row uniqueness, userId=NULL |
| Portfolio Dynamics | `tests/proof/portfolio-dynamics.test.ts` | Dynamic property count, fee zero-sum |
| Recalc Enforcement | `tests/proof/recalculation-enforcement.test.ts` | All mutations call invalidateAllFinancialQueries |
| Rule Compliance | `tests/proof/rule-compliance.test.ts` | Admin config literals, constants parity |

## 5 Structural Golden Scenarios

| # | Scenario | What It Proves |
|---|----------|---------------|
| 1 | Cash purchase | Pure equity model, no loan paths |
| 2 | Financed purchase (LTV) | Debt sizing, amortization, DSCR |
| 3 | Cash -> refinance year 3 | Refi mechanics, cash-out, loan swap |
| 4 | Portfolio aggregate | Multi-property aggregation, fee linkage |
| 5 | Consolidated + eliminations | Full intercompany elimination |

## Key Invariants Tested

- Balance Sheet: A = L + E (ASC 210)
- OCF = NI + Depreciation (ASC 230)
- NI = NOI - Interest - Depreciation - Tax (ASC 220)
- CFF = -Principal + Refi Proceeds (ASC 230)
- Fee Linkage: sum(SPV fees) = OpCo revenue (intercompany)
- Consolidated eliminations net to zero
- NPV = 0 at computed IRR (cross-validation)

## AI-Powered Verification

**Endpoint:** `POST /api/admin/ai-verification` (Admin/Checker role)

Server runs independent verification, sends full report to AI (configurable: Anthropic/OpenAI/Gemini), AI reviews methodology and provides commentary via SSE stream.

## Running Verification

- **UI:** Admin > Verification tab > "Run Verification"
- **API:** `GET /api/admin/run-verification` (requires auth)
- **CLI:** `npm run verify:summary` (7-phase orchestrator)

## Key Test Files

```
tests/proof/
+-- scenarios.test.ts            # 5 golden scenario tests
+-- input-verification.test.ts   # Input-to-output pipeline tests
+-- hardcoded-detection.test.ts  # Magic number scanner
+-- reconciliation-report.test.ts # Artifact generator + debt recon
+-- verify-runner.ts             # 7-phase orchestrator
```

```
tests/golden/
+-- irr-edge-cases.test.ts, dcf-npv.test.ts, equity-exit.test.ts,
    dscr-loan-sizing.test.ts, depreciation-breakeven.test.ts,
    stress-waterfall.test.ts, proforma-edge-cases.test.ts
```
