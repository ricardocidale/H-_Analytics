# Chapter 15: Testing Methodology — The 7-Phase Verification Workflow

This chapter defines the structured, phased approach that checkers must follow to verify the correctness of all financial calculations, data flows, and system behaviors in the H+ Analytics by Norfolk AI Business Simulation Portal. It is the core of this verification manual.

---

## Core Verification Principle

Every financial output in this application is deterministic — the same inputs must always produce the same outputs. The checker's role is to independently verify that the application's outputs match hand-calculated expected results derived from the documented formulas.

Checkers should make full use of the Scenarios feature (Chapter 10) to save baseline states, apply changes, and compare results. This is the most efficient way to test multiple configurations without manually resetting assumptions each time.

---

## Verification Phases Overview

| Phase | Name | Focus |
|-------|------|-------|
| 1 | Input Verification | Assumptions, defaults, USALI benchmarks |
| 2 | Calculation Verification | Revenue, cost, and fee formula cross-validation |
| 3 | Financial Statement Reconciliation | Balance sheet, cash flow, income statement integrity |
| 4 | IRR / DCF / FCF Verification | Investment return analytics validation |
| 5 | Scenario & Stress Testing | Edge cases, boundary conditions, scenario comparison |
| 6 | Reports & Exports Completeness | Export formats, on-screen accuracy, chart rendering |
| 7 | Documentation & Sign-Off | Audit opinion, final checklist, sign-off |

---

## Standard Test Execution Protocol

For every test across all phases, follow this six-step protocol:

| Step | Action | Purpose |
|------|--------|---------|
| 1 | Document Setup | Record which assumptions were changed and their values |
| 2 | Export Baseline | Export current state to Excel/CSV before making changes |
| 3 | Make the Change | Apply the specific assumption or configuration change being tested |
| 4 | Export New State | Export the updated state to Excel/CSV |
| 5 | Compare | In a spreadsheet, compare expected results (hand-calculated) vs. actual (exported) |
| 6 | Log Results | Record pass/fail status, any discrepancies, and observations |

---

# Phase 1: Input Verification

Verify all assumptions load correctly, defaults match the documented values, and key metrics fall within USALI benchmark ranges for boutique hospitality.

## 1.1 — Default Value Verification

Every assumption field must display the correct default value. Load a fresh scenario (or reset to defaults) and verify each field against the reference tables below.

### Revenue Share Defaults

| Field | Expected Default |
|-------|-----------------|
| Revenue Share — Events | 30% |
| Revenue Share — F&B | 18% |
| Revenue Share — Other | 5% |
| Catering Boost % | 22% |

### Expense Rate Defaults

| Field | Expected Default |
|-------|-----------------|
| Event Expense Rate | 65% |
| Other Expense Rate | 60% |
| Utilities Variable Split | 60% |

### USALI Cost Rate Defaults

| Field | Expected Default | USALI Category |
|-------|-----------------|----------------|
| Cost Rate — Rooms | 20% | Rooms Department |
| Cost Rate — F&B | 9% | F&B Department |
| Cost Rate — Admin | 8% | Undistributed |
| Cost Rate — Marketing | 1% | Undistributed |
| Cost Rate — Property Ops | 4% | Undistributed |
| Cost Rate — Utilities | 5% | Undistributed |
| Cost Rate — Insurance | 2% | Fixed Charges |
| Cost Rate — Taxes | 3% | Fixed Charges |
| Cost Rate — IT | 0.5% | Undistributed |
| Cost Rate — FF&E | 4% | Reserve |
| Cost Rate — Other | 5% | Other |

### Exit and Other Defaults

| Field | Expected Default |
|-------|-----------------|
| Exit Cap Rate | 8.5% |
| Tax Rate | 25% |
| Sales Commission Rate | 5% |
| Land Value % | 25% |
| Depreciation Period | 27.5 years |
| Days Per Month | 30.5 |
| Occupancy Ramp Months | 6 |
| SAFE Valuation Cap | $2,500,000 |
| SAFE Discount Rate | 20% |

## 1.2 — USALI Benchmark Reasonableness Checks

After verifying defaults, confirm that the model's output metrics fall within industry-accepted USALI ranges for boutique hotel properties. Metrics outside these ranges should be flagged for further investigation — they are not necessarily errors, but require justification.

| Metric | Acceptable Range (Boutique) | Formula |
|--------|----------------------------|---------|
| ADR (Average Daily Rate) | $150 – $600 | Property assumption input |
| Occupancy Rate | 55% – 85% | Property assumption input |
| RevPAR | $100 – $400 | ADR × Occupancy |
| GOP Margin | 30% – 55% | GOP ÷ Total Revenue |
| NOI Margin | 20% – 40% | NOI ÷ Total Revenue |
| Rooms Revenue % of Total | 55% – 75% | Room Revenue ÷ Total Revenue |
| F&B Revenue % of Total | 15% – 30% | F&B Revenue ÷ Total Revenue |

**Procedure:** For each property in the model, export the Year 1 stabilized income statement. Calculate revenue percentages and KPIs. Compare against the benchmark table above. Document any outliers with justification.

### Revenue Mix Validation

Verify the revenue composition adds up to 100% and each stream falls within reasonable bounds:

| Revenue Stream | Expected Range |
|---------------|---------------|
| Room Revenue | 55% – 75% of Total |
| Event Revenue | 15% – 30% of Total |
| F&B Revenue | 10% – 25% of Total |
| Other Revenue | 3% – 10% of Total |

## 1.3 — Inflation & Escalation Rate Verification

The model uses two distinct escalation paths. Verify that each cost category uses the correct rate.

**Path 1: Fixed Cost Escalation Rate** applies to property-level fixed operating costs and Management Company fixed overhead (admin, marketing, maintenance, insurance, tech, office lease, professional services, business insurance). The formula is: cost × (1 + fixed cost escalation rate) raised to the year index.

**Path 2: Inflation Rate** applies to Management Company variable/per-client costs and staff salary escalation (travel, IT licensing, marketing as percentage of revenue, miscellaneous operations, staff salary).

### Inflation Verification Procedure

1. Set the inflation rate to 3% and the fixed cost escalation rate to 5% (deliberately different values).
2. Export Year 1 and Year 2 financials to Excel.
3. For each fixed cost line (admin, marketing, maintenance, insurance, tech): verify Year 2 = Year 1 × 1.05.
4. For each variable cost line (travel, IT licensing): verify Year 2 = Year 1 × 1.03.
5. Reset the fixed cost escalation rate to null and verify it falls back to the inflation rate (3%).

---

# Phase 2: Calculation Verification

Cross-validate revenue, cost, and fee formulas with independent hand calculations.

## 2.1 — Single Property Revenue Verification (All-Cash / Full Equity)

Set up a single property with Full Equity (no financing) to eliminate debt complexity. Verify the following monthly calculations:

| Calculation | Formula |
|-------------|---------|
| Available Rooms | Room Count × 30.5 |
| Sold Rooms | Available Rooms × Occupancy Rate |
| Room Revenue | Sold Rooms × ADR |
| Event Revenue | Room Revenue × Event Revenue Share |
| F&B Revenue | Room Revenue × F&B Revenue Share × (1 + Catering Boost Percentage) |
| Other Revenue | Room Revenue × Other Revenue Share |
| Total Revenue | Room + Event + F&B + Other |

**Procedure:** Load the default seed scenario, set one property to Full Equity, export to Excel, manually replicate the first 3 months of calculations in a separate spreadsheet, and compare each line item.

## 2.2 — Operating Expense Verification

Using the same property, verify each expense line item:

| Calculation | Formula |
|-------------|---------|
| Rooms Expense | Room Revenue × Rooms Cost Rate (default 20%) |
| F&B Expense | F&B Revenue × F&B Cost Rate (default 9%) |
| Event Expense | Event Revenue × Event Expense Rate (default 65%) |
| Other Expense | Other Revenue × Other Expense Rate (default 60%) |
| Admin Expense | Base Revenue × Admin Cost Rate × (1 + Fixed Cost Escalation Rate)^year |
| Marketing Expense | Base Revenue × Marketing Cost Rate × (1 + Fixed Cost Escalation Rate)^year |
| Maintenance Expense | Base Revenue × Maintenance Cost Rate × (1 + Fixed Cost Escalation Rate)^year |
| Insurance Expense | Base Revenue × Insurance Cost Rate × (1 + Fixed Cost Escalation Rate)^year |
| Technology Expense | Base Revenue × IT Cost Rate × (1 + Fixed Cost Escalation Rate)^year |
| Total Operating Expenses | Sum of all departmental expenses |

## 2.3 — Profitability Chain Verification

| Calculation | Formula |
|-------------|---------|
| GOP | Total Revenue − Total Operating Expenses |
| Base Management Fee | Total Revenue × Base Management Fee Rate (default 8.5%) |
| Incentive Management Fee | max(0, GOP × Incentive Fee Rate) (default 12%) |
| FF&E Reserve | Total Revenue × FF&E Cost Rate (default 4%) |
| NOI | GOP − Base Management Fee − Incentive Management Fee − FF&E Reserve |

## 2.4 — Management Fee Linkage Verification

With a single property active, verify that the Management Company's fee revenue equals the property's fee expense:

| Property Side (Expense) | Company Side (Revenue) | Must Match? |
|------------------------|----------------------|-------------|
| Base Management Fee paid | Base Management Fee earned | Exact match |
| Incentive Management Fee paid | Incentive Management Fee earned | Exact match |
| Total Fees paid | Total Fee Revenue | Exact match |

## 2.5 — Acquisition Financing Verification

Change a property from Full Equity to Financed. Configure LTV, interest rate, and term.

| Calculation | Formula |
|-------------|---------|
| Loan Amount | Purchase Price × LTV |
| Monthly Payment (PMT) | PMT(rate/12, term×12, −loanAmount) |
| Interest Component | Outstanding Balance × (rate / 12) |
| Principal Component | PMT − Interest |
| Outstanding Balance | Prior Balance − Principal |
| Equity Invested | Total Property Cost − Loan Amount |
| Closing Costs | Loan Amount × Closing Cost Rate |

**Verify:** Amortization schedule sums — total interest + total principal = total payments over term.

## 2.6 — Refinancing Event Verification

Enable refinancing on a property (Will Refinance = "Yes").

| Calculation | Formula |
|-------------|---------|
| Refi Loan Amount | Property Value at Refi Date × Refi LTV |
| Net Refi Proceeds | Refi Loan − Payoff of Original Debt − Refi Closing Costs |
| New Monthly PMT | PMT(refiRate/12, refiTerm×12, −refiLoanAmount) |

**Verify:** After the refinance date, debt service switches from the original loan schedule to the new refi schedule. Net refi proceeds appear as a CFF inflow.

## 2.7 — Multiple Properties Consolidation

Add 2–3 properties with different assumptions. Verify:

| Check | Expected Result |
|-------|----------------|
| Consolidated Revenue | Sum of individual property revenues (per year) |
| Consolidated GOP | Sum of individual property GOPs |
| Consolidated NOI | Sum of individual property NOIs |
| Management Company Total Fee Revenue | Sum of all property management fee expenses |
| Dashboard KPI totals | Match consolidated statement totals exactly |
| Inter-company fee elimination | Property fee expense = Company fee revenue (net to zero in consolidation) |

---

# Phase 3: Financial Statement Reconciliation

Verify balance sheet balances, cash flow statement reconciles per ASC 230, and income statement ties to downstream statements.

## 3.1 — Balance Sheet: Assets = Liabilities + Equity

For every property and every period, verify the fundamental accounting equation:

| Check | Formula | Tolerance | Severity |
|-------|---------|-----------|----------|
| Assets = Liabilities + Equity | Total Assets == Total Liabilities + Total Equity | ±$0.01 | CRITICAL |
| Accumulated Depreciation Monotonic | AccumDepr(t) >= AccumDepr(t−1) | $0 | CRITICAL |
| Cash Non-Negative | Ending Cash >= 0 for all periods | $0 | CRITICAL |
| Debt Outstanding Non-Negative | Debt Outstanding >= 0 for all periods | $0 | CRITICAL |

### Balance Sheet Component Verification

| Component | Formula |
|-----------|---------|
| Land Value | Purchase Price × Land Value Percentage |
| Depreciable Basis | Purchase Price × (1 − Land Value Percentage) + Building Improvements |
| Monthly Depreciation | Depreciable Basis ÷ 27.5 ÷ 12 |
| Total Assets | Land + (Depreciable Basis − Accumulated Depreciation) + Cash |
| Total Liabilities | Outstanding Debt |
| Total Equity | Total Assets − Total Liabilities |

### Management Company Balance Sheet

Assets consist of ending cash. Liabilities consist of cumulative SAFE funding received. Equity consists of cumulative net income (retained earnings).

### Consolidated Balance Sheet (ASC 810)

Total Portfolio Assets = sum of all property total assets. Total Portfolio Liabilities = sum of all property total liabilities. Total Portfolio Equity = sum of all property total equity, which must equal Total Portfolio Assets minus Total Portfolio Liabilities.

## 3.2 — Cash Flow Reconciliation (ASC 230 Indirect Method)

For every property and every period, verify the three-section cash flow statement:

| Check | Formula | Severity |
|-------|---------|----------|
| Three-section sum | CFO + CFI + CFF == Net Change in Cash | CRITICAL |
| Opening cash continuity | Opening Cash(t) == Closing Cash(t−1) | CRITICAL |
| Closing cash derivation | Closing Cash == Opening Cash + Net Change | CRITICAL |
| Interest classification | Interest expense reduces CFO only (not CFI or CFF) | HIGH |
| Principal classification | Principal payments appear in CFF only (not CFO) | HIGH |
| Depreciation add-back | Depreciation is added back in CFO (non-cash charge) | HIGH |

### Cash Flow Component Formulas

| Component | Formula |
|-----------|---------|
| CFO (Operating) | Net Income + Depreciation |
| CFI (Investing) | −Total Property Cost (acquisition year only) |
| CFF (Financing) | Loan Proceeds − Principal Payments + Equity Invested + Refi Proceeds |
| Net Change in Cash | CFO + CFI + CFF |
| Ending Cash | Opening Cash + Net Change in Cash |

## 3.3 — Income Statement Ties

Verify that income statement bottom-line flows through to balance sheet and cash flow:

| Check | Verification |
|-------|-------------|
| Net Income → Cash Flow | Net Income on Income Statement = Net Income starting line in CFO |
| Net Income → Balance Sheet | Cumulative Net Income = Retained Earnings on Balance Sheet |
| Depreciation Consistency | Depreciation on Income Statement = Depreciation add-back in CFO = Period increase in Accumulated Depreciation on Balance Sheet |
| Tax Consistency | Income Tax = max(0, Taxable Income × Tax Rate) — verify no negative tax |

### Income Statement Formulas

| Component | Formula |
|-----------|---------|
| Taxable Income | NOI − Interest Expense − Depreciation |
| Income Tax | max(0, Taxable Income × Tax Rate) |
| GAAP Net Income | NOI − Interest − Depreciation − Income Tax |

---

# Phase 4: IRR / DCF / FCF Verification

Validate investment return analytics: NPV ≈ 0 at calculated IRR, FCF derivation, DCF terminal value.

## 4.1 — Free Cash Flow (FCF) Verification

| Check | Formula |
|-------|---------|
| Unlevered FCF | NOI − Income Tax − Capital Expenditures (FF&E) |
| Levered FCFE | FCF − Debt Service + Net Borrowings |
| Alternative FCFE | NOI − Debt Service − Income Tax (must equal the above) |

**Verification:** Calculate both FCFE formulas independently. They must produce the same result within rounding tolerance (±$0.01).

## 4.2 — IRR (NPV ≈ 0) Test

The IRR is the discount rate that makes NPV equal to zero. To verify:

1. Extract the IRR value displayed in the application for a given property.
2. Extract the FCFE cash flow vector: [−Equity₀, FCFE₁, FCFE₂, ..., FCFE_N + Exit Proceeds].
3. Discount each cash flow: PV_t = CF_t ÷ (1 + IRR)^t.
4. Sum all present values: NPV = Σ(PV_t).
5. Verify: |NPV| < $1.00 (should be approximately zero).

The IRR is computed using Newton-Raphson iteration. NPV at the calculated IRR should be within ±$1.00 of zero. Larger deviations indicate an IRR solver convergence issue.

## 4.3 — Equity Multiple (MOIC) Verification

The Equity Multiple equals Total Distributions divided by Total Equity Invested, where Total Distributions includes the sum of all FCFE payments plus refinance proceeds plus net exit proceeds. A multiple of 2.0× means the investor doubled their money.

## 4.4 — Exit / Terminal Value Verification

| Check | Formula |
|-------|---------|
| Gross Disposition Value | Terminal Year NOI ÷ Exit Cap Rate |
| Sales Commission | Gross Disposition Value × Commission Rate (default 5%) |
| Outstanding Debt at Exit | Amortized loan balance at terminal year |
| Net Proceeds to Equity | Gross Value − Commission − Outstanding Debt |
| Debt-Free Rule | All debt must be repaid at exit |

### DCF Terminal Value Reasonableness

| Reasonableness Check | Expected Range |
|---------------------|---------------|
| Terminal Value as % of Total NPV | 40% – 70% (typical for 10-year holds) |
| Exit Cap Rate vs. Entry Cap Rate | Exit cap rate ≥ entry cap rate (conservative) |
| Terminal NOI growth implied | Should not exceed inflation + 1–2% |

## 4.5 — Portfolio IRR Verification

The Portfolio Cash Vector is constructed as: [−Sum of all Equity, Sum of all FCFE₁, ..., Sum of all FCFE_N + Sum of all Exit Proceeds]. The Portfolio IRR is solved using this aggregated vector.

---

# Phase 5: Scenario & Stress Testing

Test edge cases, boundary conditions, and extreme configurations. Create saved scenarios to systematically compare results.

## 5.1 — Scenario Persistence Verification

1. Save the current state as a named scenario.
2. Make significant changes (add/remove properties, alter assumptions).
3. Load the saved scenario.
4. Verify all assumptions, properties, and financials revert to the saved state exactly.

## 5.2 — Global Assumption Cascade

Change a global assumption (e.g., inflation rate or base management fee rate). Verify:

| Check | Expected Behavior |
|-------|-------------------|
| All property cost escalation | Operating costs adjust by the new rate in subsequent years |
| All property fee expenses | Recalculate using the new management fee rate |
| Management Company revenue | Updates to reflect new fee rates across all properties |
| Dashboard totals | Reflect the cascading changes immediately |
| Instant recalculation | All downstream statements update without page reload |

## 5.3 — Edge Case Matrix

| Test | Scenario | Expected Behavior |
|------|----------|-------------------|
| 5.3.1 | Zero revenue months (pre-operations) | Revenue = $0 for months before operations start; expenses begin at operations start |
| 5.3.2 | 100% LTV acquisition (zero equity) | Loan Amount = Purchase Price; Equity = Building Improvements + Pre-Opening + Reserve + Closing Costs only |
| 5.3.3 | Very high cap rate (15%+) | Exit value decreases significantly; IRR may turn negative; no system error |
| 5.3.4 | Very low cap rate (2%–3%) | Exit value increases dramatically; no overflow or rendering issues |
| 5.3.5 | Negative NOI scenario | Revenue < Expenses; NOI goes negative; cash balance may deplete; no division-by-zero in ratios |
| 5.3.6 | Mid-year property acquisition | Property appears in consolidated financials only for operational months; partial-year revenue |
| 5.3.7 | Fiscal year crossover | If fiscal year start month ≠ January, monthly-to-annual bucketing aligns correctly |
| 5.3.8 | Maximum projection period (10 years) | All arrays sized correctly; no index errors; charts render all 10 years |
| 5.3.9 | Remove all properties | Management Company fee revenue = $0; Dashboard KPIs = $0; consolidated statements show zeros |
| 5.3.10 | Simultaneous refinance and exit year | Refinance occurs in same fiscal year as terminal exit; both cash flows captured |
| 5.3.11 | Zero room count | Revenue = $0; all percentage-based calculations produce $0 (not errors) |
| 5.3.12 | Zero ADR | Revenue = $0; downstream calculations gracefully handle zero revenue base |

## 5.4 — Business Constraint Enforcement

Verify the five Mandatory Business Rules:

| Rule | Verification Method |
|------|-------------------|
| Funding Gate | Set company operations start date before SAFE Tranche 1 date — system must block or flag |
| Property Activation Gate | Set operations start date before acquisition date — system must block or flag |
| No Negative Cash | Reduce revenue to cause cash depletion — ending cash ≥ 0 must hold |
| Debt-Free at Exit | Verify outstanding loan balance is repaid from sale proceeds at disposition |
| No Over-Distribution | Verify distributions cannot exceed available cash |

## 5.5 — Stress Test Scenarios (Save as Named Scenarios)

Create and save the following stress test scenarios for comparison:

| Scenario Name | Configuration | Key Metric to Watch |
|--------------|--------------|-------------------|
| "Baseline" | Default seed assumptions | Reference point for all comparisons |
| "Bear Case" | ADR −20%, Occupancy 55%, Inflation 5% | NOI margin, cash runway, IRR |
| "Bull Case" | ADR +20%, Occupancy 85%, Inflation 2% | IRR, equity multiple, exit value |
| "High Leverage" | LTV 90%, Interest Rate 11% | DSCR, cash-after-debt, negative NOI risk |
| "Zero Debt" | All properties Full Equity | Unlevered IRR, FCF vs FCFE convergence |
| "Rapid Expansion" | 5+ properties, staggered acquisition dates | Consolidation accuracy, fee linkage |

---

# Phase 6: Reports & Exports Completeness

Verify all export formats generate correctly, exported values match on-screen display, and charts render properly.

## 6.1 — Export Format Verification

| Export Format | Verify |
|--------------|--------|
| Excel (.xlsx) | File generates without error; all sheets present; values match on-screen |
| CSV (.csv) | File generates; column headers correct; data parseable |
| PDF | Renders correctly; page breaks clean; all sections included |
| PNG (Charts) | Image captures complete chart; no clipping; labels readable |
| PowerPoint (.pptx) | Slides generate; data matches source |

## 6.2 — Value Accuracy Checks

| Check | Method |
|-------|--------|
| Revenue totals | Compare exported Year 1 Total Revenue to on-screen value |
| NOI | Compare exported NOI to on-screen NOI for each property |
| IRR | Compare exported IRR to on-screen IRR |
| Balance sheet equation | In exported data: verify Assets = Liabilities + Equity |
| Monthly → Annual aggregation | Sum exported monthly values; compare to exported annual totals |

## 6.3 — Chart Rendering Verification

| Chart Type | Verify |
|-----------|--------|
| Revenue waterfall | All revenue streams present; bars sum to total |
| Cash flow timeline | CFO, CFI, CFF sections visible; net change line accurate |
| IRR sensitivity | Axes labeled; data points match underlying sensitivity table |
| Portfolio comparison | All properties represented; correct color coding |
| Occupancy ramp | Ramp curve matches configured ramp months and start/max occupancy |

## 6.4 — Excel Export Deep Verification

| Check | Expected Result |
|-------|----------------|
| Column headers | Align with fiscal years (not calendar years if fiscal year ≠ January) |
| Monthly detail sheets | If exported, monthly values aggregate correctly to annual totals |
| Cell formatting | Currency cells formatted as currency; percentage cells as percentage |
| Multiple properties | Each property on a separate sheet or clearly labeled section |
| Management Company | Separate sheet with fee revenue matching property fee expenses |

---

# Phase 7: Documentation & Sign-Off

Formalize the audit opinion, complete the final checklist, and sign off on the verification.

## 7.1 — Audit Opinion Framework

After completing Phases 1–6, the checker must issue one of three opinions:

### Unqualified (Clean Opinion)

All calculations verified. All financial statements reconcile. All business rules enforced. No material discrepancies found.

**Criteria:**
- All Phase 1 defaults match documented values ✅
- All Phase 2 hand calculations match application output within ±$0.01 ✅
- All Phase 3 balance sheet and cash flow checks pass ✅
- Phase 4 IRR NPV test passes (|NPV| < $1.00 at calculated IRR) ✅
- All Phase 5 edge cases handled without errors ✅
- All Phase 6 exports generate correctly with matching values ✅

### Qualified (Clean with Exceptions)

Calculations are materially correct, but specific exceptions were identified that do not invalidate the overall model.

**Criteria:**
- One or more tests failed but the failure is immaterial (< 1% variance)
- Rounding differences between IEEE 754 and Excel-style rounding
- Cosmetic issues in exports that do not affect numerical accuracy
- Edge cases that produce warnings but not errors

**Required:** List each exception with test ID, expected value, actual value, and variance percentage.

### Adverse (Material Misstatement)

Material calculation errors were found that affect the reliability of the financial model.

**Criteria:**
- Any Phase 2 calculation differs by > 1% from hand-calculated expectation
- Any Phase 3 balance sheet fails to balance (|A − (L + E)| > $0.01)
- Phase 4 IRR NPV test fails (|NPV| > $100 at calculated IRR)
- Any Phase 5 business constraint is not enforced
- Exported values differ from on-screen values

**Required:** Detailed finding report for each material misstatement with reproduction steps.

## 7.2 — Final Sign-Off Checklist

| Phase | Check | Status |
|-------|-------|--------|
| **Phase 1** | | |
| 1.1 | All defaults match documented values | ☐ |
| 1.2 | USALI benchmark ranges reviewed; outliers documented | ☐ |
| 1.3 | Inflation escalation paths verified (fixed vs. variable) | ☐ |
| **Phase 2** | | |
| 2.1 | Single property revenue formulas verified | ☐ |
| 2.2 | Operating expense formulas verified | ☐ |
| 2.3 | Profitability chain (GOP → NOI) verified | ☐ |
| 2.4 | Management fee linkage verified (property expense = company revenue) | ☐ |
| 2.5 | Acquisition financing (PMT, amortization schedule) verified | ☐ |
| 2.6 | Refinancing event verified | ☐ |
| 2.7 | Multi-property consolidation verified | ☐ |
| **Phase 3** | | |
| 3.1 | Balance sheet A = L + E for all properties and periods | ☐ |
| 3.2 | Cash flow CFO + CFI + CFF = Net Change for all periods | ☐ |
| 3.3 | Income statement ties to balance sheet and cash flow | ☐ |
| **Phase 4** | | |
| 4.1 | FCF and FCFE formulas verified | ☐ |
| 4.2 | IRR NPV ≈ 0 test passed | ☐ |
| 4.3 | Equity multiple verified | ☐ |
| 4.4 | Exit/terminal value verified | ☐ |
| 4.5 | Portfolio IRR verified | ☐ |
| **Phase 5** | | |
| 5.1 | Scenario save/load integrity verified | ☐ |
| 5.2 | Global assumption cascade verified | ☐ |
| 5.3 | Edge cases (5.3.1–5.3.12) tested | ☐ |
| 5.4 | Business constraints enforced | ☐ |
| 5.5 | Stress test scenarios saved and compared | ☐ |
| **Phase 6** | | |
| 6.1 | All export formats generate without errors | ☐ |
| 6.2 | Exported values match on-screen display | ☐ |
| 6.3 | Charts render correctly | ☐ |
| 6.4 | Excel export deep verification completed | ☐ |
| **Phase 7** | | |
| 7.1 | Audit opinion issued (Unqualified / Qualified / Adverse) | ☐ |
| 7.2 | This checklist completed and signed | ☐ |

## 7.3 — Discrepancy Resolution Protocol

If a test fails (actual ≠ expected):

| Step | Action |
|------|--------|
| 1 | Re-verify hand calculation using the formulas documented in this manual |
| 2 | Check assumption values — were defaults applied where you expected user values? |
| 3 | Check fiscal year alignment — is the month bucketed into the correct year? |
| 4 | Check rounding — the engine uses IEEE 754 double-precision; Excel may round differently |
| 5 | Check escalation rate used — was the fixed cost escalation rate applied when the inflation rate was expected, or vice versa? |
| 6 | If confirmed bug: document test ID, input values, expected output, actual output, and the function involved |

## 7.4 — Sign-Off Record

```
Checker Name:     ____________________________
Date:             ____________________________
Audit Opinion:    ☐ UNQUALIFIED  ☐ QUALIFIED  ☐ ADVERSE
Exceptions (if QUALIFIED):
  1. ___________________________________________
  2. ___________________________________________
  3. ___________________________________________
Material Findings (if ADVERSE):
  1. ___________________________________________
  2. ___________________________________________

Signature:        ____________________________
```

---

## Appendix: Research Validation Test Coverage

The deterministic validation layer described in Chapter 13 is covered by dedicated automated tests:

| Test File | Tests | Coverage |
|-----------|-------|---------|
| `tests/calc/validate-research.test.ts` | 24 | Bounds checking (ADR, occupancy, cap rate ranges), cross-validation (NOI margin reasonableness, valuation consistency), warning/failure counts in validation summary |
| `tests/calc/research-tools-phase2.test.ts` | 24 | Occupancy ramp projections, ADR growth projections, cap rate valuation calculations, cost benchmark derivations |

These tests ensure that the research-to-assumption pipeline rejects or flags values outside the documented bound constraints and that deterministic tools (`compute_property_metrics`, `compute_cap_rate_valuation`) produce correct outputs for the cross-validation checks.
