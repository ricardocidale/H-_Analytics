# Financial Verification & Audit System

## Overview

The verification system provides independent verification of all financial calculations against GAAP standards. It operates at two levels: client-side formula and compliance checking, and server-side independent recalculation.

## Architecture

```
Verification System
│
├── CLIENT-SIDE (runs in browser)
│   ├── financialAuditor.ts    → GAAP audit with ASC references
│   ├── formulaChecker.ts      → Formula integrity validation
│   ├── gaapComplianceChecker.ts → Cash flow & compliance checks
│   └── runVerification.ts     → Orchestrator that runs all checkers
│
├── SERVER-SIDE (runs on server)
│   └── calculationChecker.ts  → Independent recalculation engine
│       │
│       └── Completely separate implementation of financial math
│           (does NOT import from financial/property-engine.ts or company-engine.ts)
│
└── AI-POWERED (optional)
    └── LLM methodology review via /api/admin/ai-verification
```

## GAAP Standards Referenced

| Standard | Topic | Where Applied |
|----------|-------|---------------|
| ASC 230 | Statement of Cash Flows | Cash flow classification (operating/investing/financing) |
| ASC 360 | Property, Plant & Equipment | Depreciation calculation and asset valuation |
| ASC 470 | Debt | Loan amortization, interest/principal separation |
| ASC 606 | Revenue Recognition | Revenue timing and calculation verification |
| USALI | Uniform System of Accounts for Lodging Industry | Hospitality-specific expense categorization |
| FASB Conceptual Framework | General | Balance sheet equation, double-entry integrity |

## Client-Side Verification

### Financial Auditor (`financialAuditor.ts`)

Performs detailed GAAP compliance audits on each property's financial data.

**Audit Sections**:
1. **Timing Rules** - Verifies revenue/expenses only appear after operations start
2. **Depreciation** - Validates straight-line calculation matches expected values
3. **Loan Amortization** - Checks PMT formula, interest/principal split accuracy
4. **Income Statement** - Validates revenue, expense, and NOI calculations
5. **Balance Sheet** - Confirms Assets = Liabilities + Equity for every period
6. **Cash Flow Statement** - Verifies indirect method classification
7. **Management Fees** - Checks base and incentive fee calculations

### Formula Checker (`formulaChecker.ts`)

Validates mathematical relationships:
- Revenue = sum of component revenues
- GOP = Revenue - Operating Expenses
- NOI = GOP - Undistributed Expenses - Management Fees - FF&E
- Net Income = NOI - Interest - Depreciation
- Cash Flow = NOI - Total Debt Service

### GAAP Compliance Checker (`gaapComplianceChecker.ts`)

Specific compliance validations:
- Cash flow statement classification (operating vs financing vs investing)
- Principal payments correctly classified as financing activities (ASC 470)
- Depreciation add-back in operating cash flow (ASC 230)
- Revenue recognition timing (ASC 606)

## Server-Side Verification

### Calculation Checker (`server/calculationChecker.ts`)

A completely independent recalculation engine that does NOT import from the client-side financial engine. This ensures true independence of verification.

**Key Design Principle**: The server-side checker reimplements all financial math from scratch, using only the raw property data and global assumptions as inputs. If both the client engine and server checker produce the same results, we have high confidence in accuracy.

**What It Checks** (dynamic count based on properties — approximately 18 checks per property plus company and consolidated checks):

| Category | Check | GAAP Reference |
|----------|-------|----------------|
| Revenue | Room revenue = rooms × ADR × occupancy × 30.5 | ASC 606 |
| Revenue | Year 1 and last year total revenue | Industry |
| Depreciation | Monthly depreciation = buildingValue / 27.5 / 12 | ASC 360 |
| Depreciation | Only after acquisition date | ASC 360 |
| Loan | PMT calculation matches formula | ASC 470 |
| Loan | Interest = balance × monthly rate | ASC 470 |
| Loan | Principal = PMT - Interest | ASC 470 |
| Balance Sheet | Assets = Liabilities + Equity (every month) | FASB |
| Cash Flow | Operating CF = Net Income + Depreciation | ASC 230 |
| Reasonableness | NOI margin between 15-45% | Industry |
| Reasonableness | Revenue growth is positive | Industry |
| Cash Flow | No negative cash balance (per property) | Business Rule (info only) |
| Management Co | No negative cash balance (company) | Business Rule (info only) |

**Dynamic Configuration**: The checker respects `global.projectionYears` for projection length, falling back to the default constant of 10 years.

### Underfunding vs. Calculation Errors

**Underfunding (negative cash balance) is NOT a calculation error.** It is a business condition — the property or management company has insufficient operating reserves or funding. This is treated as an informational notification (`severity: "info"`), not a material or critical finding. It does NOT affect the audit opinion.

A property going negative simply means it needs more capital. The calculation itself is correct — the model is accurately reflecting the cash shortfall. This should surface as a business alert/notification to the user, not as a verification failure.

### Check Result Structure

```typescript
interface CheckResult {
  metric: string;         // "Room Revenue (First Operational Month)"
  category: string;       // "Revenue"
  gaapRef: string;        // "ASC 606"
  formula: string;        // "10 rooms × $330 ADR × 70% occ × 30.5 days"
  expected: number;       // 70,455
  actual: number;         // 70,455
  variance: number;       // absolute difference
  variancePct: number;    // percentage difference
  passed: boolean;        // true
  severity: "critical" | "material" | "minor" | "info";
}
```

### Audit Opinions

Based on check results, the system issues one of three opinions:

| Opinion | Criteria | Meaning |
|---------|----------|---------|
| **UNQUALIFIED** | 0 critical, 0 material issues | Clean opinion - all calculations verified |
| **QUALIFIED** | 0 critical, some material issues | Minor discrepancies found |
| **ADVERSE** | Any critical issues | Significant errors requiring attention |

**Overall Status**: Separate from audit opinion, uses `"PASS"`, `"FAIL"`, or `"WARNING"` with the same thresholds (critical → FAIL, material → WARNING).

**Tolerance**: 1% variance allowed for floating point comparison differences (`TOLERANCE = 0.01`). The `withinTolerance()` function compares expected vs actual values.

## AI-Powered Verification

### Endpoint
```
POST /api/admin/ai-verification
Authorization: Admin or Checker role
```

### Process
1. Server runs the independent verification to generate a report
2. The full verification report is sent to an AI model (configurable provider)
3. AI reviews the methodology, identifies potential issues, and provides commentary
4. Response is streamed back via Server-Sent Events (SSE)

### AI Providers Supported
- **Anthropic Claude** (default - Claude Sonnet 4.5)
- **OpenAI** (GPT models)
- **Google Gemini**

## Running Verification

### From the UI
Navigate to **Admin > Verification** tab. Click "Run Verification" to see all checks with pass/fail status and audit opinion.

### From the API
```bash
# Login first
curl -c cookies.txt -X POST /api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin","password":"..."}'

# Run verification
curl -b cookies.txt /api/admin/run-verification
```

### CLI Verification Phases (`npm run verify:summary`)

The CLI verification runs 7 independent proof phases:

| Phase | Test File | What It Checks |
|-------|-----------|----------------|
| Proof Scenarios | `tests/proof/scenarios.test.ts` | GAAP financial identities, loan amortization, fee structures, consolidation |
| Hardcoded Detection | `tests/proof/hardcoded-detection.test.ts` | No magic numbers in finance code; all values from constants (dynamic calc/ scan) |
| Reconciliation | `tests/proof/reconciliation-report.test.ts` | Sources & Uses, NOI→FCF bridge, cash bridge, debt recon |
| Data Integrity | `tests/proof/data-integrity.test.ts` | Shared row uniqueness, all properties userId=NULL, no duplicates |
| Portfolio Dynamics | `tests/proof/portfolio-dynamics.test.ts` | Dynamic property count, fee zero-sum, staffing tiers, empty portfolio |
| Recalc Enforcement | `tests/proof/recalculation-enforcement.test.ts` | All mutations call invalidateAllFinancialQueries, no bypasses |
| Rule Compliance | `tests/proof/rule-compliance.test.ts` | Admin config literals, constants parity, parseLocalDate single source, no raw Date() |

### Expected Results
When properly configured, all checks should pass with an **UNQUALIFIED** audit opinion. The total check count varies based on the number of properties (approximately 18 per property, plus company and consolidated checks). Any failures indicate a calculation discrepancy between the client-side engine and the independent server-side checker.

## Edge Cases & Boundary Conditions

These edge cases MUST be handled correctly and should be verified during any financial engine changes:

### Temporal Edge Cases
- **Month 0 / Pre-acquisition** — No revenue, no expenses, no debt, no depreciation, no balance sheet entries. Everything must be zero before the property's acquisitionDate.
- **Operations start ≠ Acquisition** — A property can be acquired months before operations begin. Debt and depreciation start at acquisition; revenue starts at operationsStartDate.
- **Mid-month transitions** — Operations starting mid-month still count the full month (30.5 days convention).
- **Timezone-sensitive dates** — Always use `parseLocalDate()` (appends `T00:00:00`) to prevent `new Date("2027-07-01")` from shifting to June 30 in Western timezones.
- **Year boundary crossings** — Fiscal year aggregation must correctly handle properties acquired mid-year (partial first year).
- **projectionYears = 2** — Minimum valid value. Revenue growth direction checks require at least 2 years. Must never be < 2.

### Financial Edge Cases
- **100% equity (LTV = 0)** — No debt, no PMT, no interest, no principal, no refinance. Financing CF = 0. Cash flow = NOI - Tax.
- **0% occupancy initial** — Valid during ramp-up. Revenue = 0, but fixed costs still accrue. Property will show negative cash flow.
- **Occupancy at max cap** — Once maxOccupancy is reached, growth stops. Must not exceed 100%.
- **Zero ADR** — Revenue = 0 for all streams (room, F&B, events, other all derive from room revenue).
- **Refinance in month 1** — Edge case: refinance occurs same month as acquisition. Old loan immediately replaced.
- **Refinance after projection end** — If refinanceDate is beyond projection horizon, no refinance occurs. willRefinance flag is ignored.
- **Negative taxable income** — incomeTax = max(0, taxableIncome × taxRate). Tax is never negative (no tax refunds modeled).
- **Exit in Year 1** — Exit waterfall must still compute correctly with minimal data.
- **Very large purchase prices** — Floating point precision at $100M+. Use tolerance-based comparison (1% variance).

### Balance Sheet Edge Cases
- **A = L + E every single month** — No exceptions. Even month 0 before operations must balance (all zeros).
- **Accumulated depreciation > building value** — Cannot happen with 27.5-year straight line, but verify the cap is respected.
- **Loan balance reaching zero** — After full amortization, principal and interest are both zero. No negative balance.
- **Cash going negative** — Valid business condition (underfunding), NOT a calculation error. Severity = info only.

### Consolidated / Portfolio Edge Cases
- **Single property portfolio** — Consolidated = property values. Weighted averages = property averages. No division by zero.
- **Empty portfolio (0 properties)** — Must not crash. Show empty states, not NaN or Infinity.
- **Properties with different start dates** — Consolidated statements must align by calendar month, not by relative month from acquisition.
- **Mixed equity/financed properties** — Consolidated debt metrics should only count financed properties for DSCR, debt yield calculations.

### Management Company Edge Cases
- **Pre-SAFE funding** — Company operations gated until SAFE funding received. No fee revenue before gate opens.
- **Zero properties assigned** — Company has no fee income. Fixed costs still accrue.
- **All properties pre-operational** — Revenue = 0, but company G&A still runs.

### Rounding & Precision
- **Tolerance = 1%** — withinTolerance() uses 0.01 for floating-point comparisons between client and server engines.
- **Currency display** — Always format to 2 decimal places for display. Internal calculations use full precision.
- **Percentage inputs** — User enters 70 for 70%. Internal storage may be 0.70 or 70 depending on field. Verify conversion consistency.
