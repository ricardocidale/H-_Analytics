# Release Audit Checklist

Comprehensive checklist for major releases. Covers all 7 audit dimensions plus integration boundary verification. Every item must PASS or have a documented exception before release.

## Pre-Audit Gate

- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm test` — all tests pass, no skipped
- [ ] `git status` — clean working tree (no uncommitted changes)
- [ ] Verify compliance with all `.claude/rules/` (no-hardcoded-assumptions, no-hardcoded-admin-config, recalculate-on-save, and all others)
- [ ] Scan recently changed files for rule violations (grep for hardcoded literals, check mutation onSuccess handlers)

---

## Dimension 1: Formula & Math Correctness

### Revenue
- [ ] Room revenue = roomCount × ADR × occupancy × 30.5
- [ ] Event revenue = totalRevenue × revShareEvents
- [ ] F&B revenue = totalRevenue × revShareFB
- [ ] Other revenue = totalRevenue × revShareOther
- [ ] Total revenue = sum of all 4 streams
- [ ] Revenue = 0 before operationsStartDate

### Occupancy & ADR
- [ ] Occupancy starts at startOccupancy, ramps by occupancyGrowthStep every occupancyRampMonths
- [ ] Occupancy never exceeds maxOccupancy
- [ ] ADR grows at adrGrowthRate compounding annually

### Expenses
- [ ] Department costs = revenue × costRate (rooms, F&B, events, other)
- [ ] Fixed costs escalate at fixedCostEscalationRate annually
- [ ] Variable costs escalate at inflationRate annually
- [ ] Management fees: base = revenue × baseManagementFee, incentive = GOP × incentiveManagementFee

### Depreciation (ASC 360)
- [ ] Monthly depreciation = depreciableBasis / 27.5 / 12
- [ ] Depreciable basis = purchasePrice × (1 - landValuePercent) + buildingImprovements
- [ ] Depreciation starts only after acquisition date
- [ ] 27.5-year useful life is immutable (IRS Pub 946)

### Debt Service (ASC 470)
- [ ] PMT = canonical `pmt()` from `calc/shared/pmt.ts`
- [ ] Interest = outstandingBalance × monthlyRate
- [ ] Principal = PMT - Interest
- [ ] Interest + Principal = PMT every month
- [ ] Interest decreases, principal increases over time (amortization)
- [ ] Debt outstanding decreases each month
- [ ] No debt before acquisition date

### Refinance
- [ ] Refinance uses `computeRefinance()` from `calc/refinance/`
- [ ] NOI is debt-independent (Pass 1 values unchanged)
- [ ] Proceeds flow into cash only in refinance month
- [ ] New debt schedule replaces old from refinance month onward

### Net Income & Tax
- [ ] Net Income = NOI - Interest - Depreciation - Income Tax
- [ ] Principal is NEVER in net income (ASC 470)
- [ ] Income tax = max(0, taxableIncome × taxRate)
- [ ] Taxable income = NOI - Interest - Depreciation

### Cash Flow (ASC 230)
- [ ] Operating CF = Net Income + Depreciation (indirect method)
- [ ] Financing CF = -Principal + Refinance Proceeds
- [ ] cashFlow = NOI - debtPayment - incomeTax
- [ ] endingCash = cumulative cashFlow
- [ ] Operating CF + Financing CF = cashFlow

---

## Dimension 2: Data Lineage & Traceability

- [ ] Every reported number traces to: assumptions → engine → statements → exports
- [ ] No orphan values that bypass the calculation graph
- [ ] Yearly aggregation uses `yearlyAggregator.ts` (single source of truth)
- [ ] Cash flow aggregation uses `cashFlowAggregator.ts` (single source of truth)
- [ ] PMT uses canonical `calc/shared/pmt.ts` (except independent `calculationChecker.ts`)
- [ ] Equity invested uses `equityCalculations.ts` (single source of truth)
- [ ] Formatting uses `formatters.ts` formatMoney/formatPercent
- [ ] No inline re-implementations of shared utilities

---

## Dimension 3: Assumptions & Variables Integrity

- [ ] All financial constants live in `shared/constants.ts` or `client/src/lib/constants.ts`
- [ ] No hardcoded magic numbers in calculation paths
- [ ] Fallback pattern enforced: property → global → DEFAULT constant
- [ ] Dynamic config: `projectionYears = global?.projectionYears ?? PROJECTION_YEARS`
- [ ] No duplicate variables representing the same concept
- [ ] Immutable constants unchanged: `DEPRECIATION_YEARS = 27.5`, `DAYS_PER_MONTH = 30.5`

---

## Dimension 4: Workflow Correctness

### Property Lifecycle
- [ ] Create property → set assumptions → acquire → operate → refinance → exit
- [ ] Revenue only after operationsStartDate
- [ ] Debt only after acquisitionDate
- [ ] Balance sheet entries only after acquisition
- [ ] Exit waterfall: Gross Value - Commission - Outstanding Debt = Net Proceeds

### Company Lifecycle
- [ ] Company ops gated on SAFE funding receipt AND companyOpsStartDate
- [ ] SAFE tranches credited in correct month
- [ ] Management fees derived from property-level revenue/GOP

### Scenario Operations
- [ ] Save scenario captures global + properties snapshot
- [ ] Load scenario restores and recalculates deterministically
- [ ] Clone creates independent copy
- [ ] Export/import roundtrips without data loss
- [ ] Cannot delete "Base" scenario

### Funding Gates
- [ ] Management company cannot operate before SAFE funding
- [ ] Properties cannot operate before acquisition/funding

---

## Dimension 5: Reporting & Presentation Correctness

### Consistency
- [ ] Tables, charts, and exports all use the same underlying data
- [ ] Income statement, balance sheet, and cash flow statement use engine data
- [ ] Export formats (PDF, Excel, CSV, PPTX, PNG) match on-screen values
- [ ] Fiscal year labels consistent across all views

### Balance Sheet
- [ ] Assets = Liabilities + Equity every period (runtime validation active)
- [ ] Variance > $1 triggers visible warning
- [ ] Property value = Land + Building - Accumulated Depreciation
- [ ] Cash = Cumulative operating cash flow + reserves + refinance proceeds

### Definitions
- [ ] ADR, RevPAR, GOP, NOI, FCF definitions consistent in UI labels/tooltips
- [ ] Capital sources on separate lines (equity, debt, refinance)
- [ ] No negative cash displayed without shortfall flag

---

## Dimension 6: Code Quality & Risk Controls

### Architecture
- [ ] Pure calculations isolated from UI state and network calls
- [ ] `financial/property-engine.ts` and `financial/company-engine.ts` have no side effects
- [ ] `calculationChecker.ts` is fully independent (no imports from client engine)
- [ ] Feature modules self-contained in `client/src/features/`

### Type Safety
- [ ] No `any` types in financial calculation paths
- [ ] Shared types from `shared/schema.ts` used consistently
- [ ] No `as unknown as` casts in financial data flow

### Dead Code
- [ ] No unused exports (grep for unused function names)
- [ ] No commented-out code blocks
- [ ] No unreachable code paths

### Test Coverage
- [ ] Auth utilities tested (rate limiting, password validation, sessions)
- [ ] Property pro forma golden scenario tested (Full Equity + Financed)
- [ ] Company pro forma golden scenario tested (fees, staffing, SAFE gate)
- [ ] Formatting utilities tested
- [ ] Finance Skills 1-6 tested
- [ ] All tests pass: `npm test`

---

## Dimension 7: GAAP & Industry Compliance

### ASC 230 (Cash Flows)
- [ ] Operating activities: Net Income + Depreciation add-back
- [ ] Financing activities: -Principal + Debt Proceeds + Refinance Proceeds
- [ ] Cash flow statement reconciles to change in cash

### ASC 360 (PP&E)
- [ ] Straight-line depreciation over 27.5 years
- [ ] Depreciable basis excludes land
- [ ] Property value = cost - accumulated depreciation

### ASC 470 (Debt)
- [ ] Principal payments are financing activities, never expenses
- [ ] Interest is on income statement, principal is NOT
- [ ] Net Income formula: NOI - Interest - Depreciation - Tax

### ASC 606 (Revenue)
- [ ] Revenue recognized only after operations start
- [ ] Revenue streams computed from room revenue base
- [ ] No revenue before property is operational

### FASB Conceptual Framework
- [ ] Balance sheet balances every period (A = L + E)
- [ ] Double-entry integrity maintained

### Industry Standards
- [ ] 30.5 days/month for room revenue
- [ ] USALI-aligned departmental expense structure
- [ ] NOI margin reasonableness: 15-45% for stabilized hotel

---

## Integration Boundaries

### Schema → Storage
- [ ] Every schema table has corresponding storage CRUD methods
- [ ] Insert schemas match storage method parameters
- [ ] No `any` types in storage method signatures
- [ ] Cascading deletes work correctly (user → sessions, scenarios, properties)

### Storage → Routes
- [ ] Every storage method called correctly from routes
- [ ] Request body validation via Zod schemas before storage calls
- [ ] Error responses use consistent `{ error: string }` format
- [ ] Auth middleware applied to all protected routes

### Routes → Client API
- [ ] Every route has corresponding client API function (or documented exception)
- [ ] Request/response types match between client and server
- [ ] Cache invalidation covers all related entities
- [ ] SSE streaming endpoints have documented message contracts

### Schema → Engine Types
- [ ] PropertyInput includes all required schema fields
- [ ] GlobalInput includes all required schema fields
- [ ] No nullable mismatches (schema NOT NULL but engine allows null)
- [ ] No missing fields (schema has field, engine ignores it)

---

## Independent Verification

- [ ] Run `/verify` skill — UNQUALIFIED opinion
- [ ] Server-side `calculationChecker.ts` agrees with client engine
- [ ] Tolerance: 1% variance allowed for floating-point comparison
- [ ] All check categories pass: Revenue, Depreciation, Loan, Balance Sheet, Cash Flow, Reasonableness

---

## Dimension 8: Edge Case Coverage

### Financial Engine Edge Cases
- [ ] 100% equity property (LTV = 0) — no debt, no PMT, no refinance. Cash flow = NOI - Tax.
- [ ] 0% initial occupancy — revenue = 0, fixed costs accrue, negative cash flow is valid.
- [ ] Occupancy capped at maxOccupancy — growth stops, never exceeds 100%.
- [ ] Zero ADR — all revenue streams = 0 (room, F&B, events, other).
- [ ] Refinance beyond projection horizon — ignored, no crash.
- [ ] Negative taxable income — tax = max(0, ...), never negative.
- [ ] projectionYears = 2 — minimum valid, revenue growth checks work.
- [ ] Pre-acquisition month — all values zero, balance sheet balances at zero.
- [ ] Operations start ≠ Acquisition — debt/depreciation at acquisition, revenue at operations start.
- [ ] Timezone dates — parseLocalDate() used, no June 30 bug on "2027-07-01".

### Consolidated Edge Cases
- [ ] Single property portfolio — consolidated = property, no divide-by-zero in weighted averages.
- [ ] Empty portfolio (0 properties) — shows empty state, no NaN/Infinity.
- [ ] Mixed equity/financed — debt metrics only count financed properties.
- [ ] Properties with different start dates — aligned by calendar month, not relative month.

### UI Edge Cases (Premium Design Rule)
- [ ] Empty states — beautiful placeholders with CTAs, not blank pages or raw "No data."
- [ ] Loading states — skeleton layouts matching page structure, not centered spinners.
- [ ] Error states — styled error cards with retry, not raw error strings.
- [ ] NaN/Infinity in display — shows "—" with tooltip, never raw NaN.
- [ ] $0 values — displayed as "$0", not hidden or blank.
- [ ] Negative values — red/warning color with parentheses or minus sign.
- [ ] Very long names — truncate with ellipsis and hover tooltip.
- [ ] Reduced motion — respects prefers-reduced-motion media query.

---

## Final Sign-Off

| Item | Status | Date | Notes |
|------|--------|------|-------|
| TypeScript clean | | | `npx tsc --noEmit` |
| All tests pass | | | `npm test` — count: ___ |
| Verification | | | Opinion: ___ |
| Reviewer | | | Name: ___ |
