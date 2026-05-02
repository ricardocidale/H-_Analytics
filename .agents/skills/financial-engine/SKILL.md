---
name: financial-engine
description: "H+ financial engine technical contract: dual-engine architecture (client PropertyEngine + CompanyEngine, server Checker), monthly pro forma pipeline stages, calc/ module taxonomy, return metrics, financial statement line items, and the invariant that the engine is deterministic — no AI approximations in any calculation path."
---

# Financial Engine

This skill defines the technical contract for the H+ financial calculation system. It covers architecture, pipeline stages, module taxonomy, return metrics, financial statement structure, and the non-negotiable invariants that govern the system. Load this skill before any task that touches calculation logic, financial output, engine inputs/outputs, or server-side verification.

---

## Dual-Engine Architecture

The financial system comprises three independent components that must never share calculation code:

- **Client-side Property Engine** (`lib/engine/`): Runs in the browser for real-time UI feedback. Accepts a `PropertyInput` and generates a 360-month pro forma (30-year horizon). Recalculates on every assumption change.
- **Client-side Company Engine**: Also runs in the browser. Aggregates all property-level outputs into the Management Company P&L. Dependent on the Property Engine completing first.
- **Server-side Calculation Checker** (`artifacts/api-server/src/`): An independent verification system. Re-derives results from first principles using its own calculation code. Never imports, calls, or references the client engine in any form.

The separation between client engine and server Checker is an invariant. Any code path that allows the server Checker to delegate to or import from the client engine is a defect.

---

## Property Engine Pipeline

The Property Engine processes each property month by month (index 0 = Month 1 of the model) through the following ordered stages:

### 1. Temporal Gating

- `acquisitionDate`: Debt service and depreciation begin on this date.
- `operationsStartDate`: Room revenue and all variable expenses begin on this date.
- Months prior to `acquisitionDate`: No financial activity.
- Months between `acquisitionDate` and `operationsStartDate`: Pre-opening period — debt service and pre-opening expenses active, no revenue.

### 2. Occupancy Ramp

Occupancy follows a step-function ramp from `startOccupancy` to `maxOccupancy` over `occupancyRampMonths`:

- Each step covers a defined number of months.
- After `occupancyRampMonths` have elapsed since `operationsStartDate`, occupancy is held at `maxOccupancy`.
- No interpolation — the ramp uses discrete steps, not linear interpolation.

### 3. Revenue Calculation

- **RevPAR** = ADR × Occupancy Rate
- **Room Revenue** = RevPAR × Rooms × Days in Month
- **Food & Beverage** = Room Revenue × F&B percentage (× Catering Boost factor if applicable)
- **Events & Functions** = Room Revenue × Events percentage
- **Other / Ancillary** = Room Revenue × Ancillary percentage
- **Total Revenue** = Sum of all revenue streams

### 4. Expense Application

- **Variable expenses**: Applied as a percentage of Total Revenue.
- **Fixed expenses**: Anchored to the Year 1 value and escalated each subsequent year by the inflation rate assumption. Month-level fixed expenses = annual fixed / 12, adjusted for the current year's inflation multiplier.

### 5. Management Fees

- **Base Fee** = Total Revenue × base fee rate
- **Incentive Fee** = GOP × incentive fee rate (subject to any threshold defined in the management contract)
- Both fees reduce GOP to produce AGOP (see `hbg-business-model` for the full USALI waterfall).

### 6. Debt Service

- Payment calculated using the standard PMT formula.
- Interest-Only (IO) periods: During IO months, the scheduled payment equals interest only; no principal amortization.
- Day count convention: ACT/360 or 30/360, as specified per loan.
- DSCR sizing: The loan is sized on the amortizing payment, even during IO periods.

### 7. Depreciation

Two methods are supported:

- **Straight-line**: Building value depreciated over 27.5 years (residential) or 39 years (commercial). Land is excluded from depreciable basis.
- **Cost segregation**: Allocates building components into buckets — 5-year, 7-year, and 15-year MACRS personal property and land improvements — with the residual depreciated on the standard real property schedule. Land is always excluded.

### 8. Income Tax

- Taxable income = ANOI − Interest − Depreciation
- Net Operating Loss (NOL) carryforward: Prior-year losses reduce current-year taxable income, subject to the 80% utilization cap per IRC §172.
- Tax = Taxable Income × applicable rate (after NOL application).

### 9. Free Cash Flow to Equity (FCFE)

```
FCFE = ANOI − Debt Service − Tax
```

FCFE is the basis for all equity return metrics and the IRR calculation.

---

## Company Engine Pipeline

The Company Engine runs after all property engines have completed and executes the following ordered stages:

1. **Gate check** (`opsGateIdx`): No ManCo revenue or expenses are recorded until both `companyOpsStartDate` and `safeTranche1Date` are reached. Months before the gate index are zeroed out.
2. **Fee revenue roll-up**: Sum of Base Fees and Incentive Fees received from all active properties in the portfolio.
3. **Staffing**: FTE count is determined by portfolio size (tier-based; see `hbg-business-model`). Staffing cost = FTE × annual salary, escalated by inflation.
4. **Fixed overhead**: Office lease, professional services, technology costs — escalated annually by inflation rate.
5. **Variable costs**: Per-client costs (travel, IT) scale with number of properties; percentage-of-revenue costs scale with fee revenue.
6. **Partner compensation**: Annual amounts from the partner compensation schedule applied in the relevant year bands.
7. **SAFE funding and interest**: SAFE tranches recorded as equity contributions. If the SAFE instrument is interest-bearing, accrued interest is expensed.
8. **EBITDA → Pre-tax income → Net Income → Cash position**: Calculated sequentially. Cash position is tracked cumulatively; shortfalls (negative cash balance) are flagged as a model warning.

---

## calc/ Module Taxonomy

Calculation logic is organized into modules under `lib/calc/src/`. Each subdirectory has a specific scope:

### `financing/`
Loan-level calculations:
- DSCR (Debt Service Coverage Ratio)
- Debt yield
- Loan sizing
- Prepayment penalties
- Interest rate swap analysis
- Loan comparison utilities

### `refinance/`
Refinance event calculations:
- New loan sizing
- Existing loan payoff
- Amortization schedule update
- Refinance validation (proceeds vs. payoff, equity extracted)

### `funding/`
Equity and SAFE calculations:
- SAFE engine (tranche recording, conversion modeling)
- Equity rollforward (invested → distributions → ending balance)
- Funding gates (operational gate enforcement)
- Investment timeline

### `returns/`
Investor return metrics:
- IRR: XIRR algorithm on equity cash flow vector
- Equity multiple (MOIC)
- DCF / NPV at specified discount rate
- MIRR (Modified IRR)
- WACC
- Exit valuation (cap rate method, comparable sales)

### `research/`
Underwriting and market research utilities:
- Property-level operating metrics
- ADR projection models
- Occupancy ramp validation
- Cap rate valuation
- Construction and renovation cost benchmarks
- Service fee and markup waterfall calculations
- Depreciation basis allocation (cost segregation)
- Make-vs-buy analysis (direct vs. outsourced services)
- Research assumption validation

### `analysis/`
Portfolio and scenario tools:
- Consolidation (aggregate properties + ManCo − intercompany eliminations)
- Sensitivity analysis and stress testing
- Scenario comparison
- Break-even analysis
- Hold-vs-sell analysis
- Waterfall equity distribution (preferred return, promote)
- RevPAR index (property vs. competitive set)
- CapEx reserve modeling

### `validation/`
Financial integrity checks:
- Financial identity verification (USALI waterfall balances)
- Schedule reconciliation (amortization, depreciation)
- Funding gate enforcement
- Assumption consistency checks (e.g., LTV vs. loan amount)
- Export verification (output matches displayed values)

---

## Key Return Metrics

All return metrics are computed on equity cash flows (FCFE), not total project cash flows.

| Metric | Definition |
|--------|-----------|
| **IRR** | Internal rate of return; computed using XIRR on the equity cash flow vector (initial investment as negative, distributions as positive, exit proceeds as positive) |
| **MOIC** (or Equity Multiple) | Total Distributions + Exit Proceeds / Total Equity Invested |
| **Cash-on-Cash** | Average Annual FCFE / Total Equity Invested |
| **Cap Rate** | NOI / Property Value (used for entry and exit valuation) |
| **Debt Yield** | NOI / Loan Amount (lender underwriting metric) |
| **DSCR** | NOI / Amortizing Debt Service — sized on the amortizing payment even during Interest-Only periods |

---

## TypeScript Types

The engine contract is expressed through four primary types:

- **`PropertyInput`**: All assumptions for a single property — acquisition parameters, physical characteristics, operating assumptions (ADR, occupancy, revenue streams, expenses), debt terms, depreciation method, and exit assumptions.
- **`GlobalInput`**: ManCo-level assumptions — overhead costs, staffing parameters, partner compensation, SAFE tranche terms, inflation rate, and tax rate.
- **`MonthlyFinancials`**: Per-month output object from the Property Engine. Contains all USALI line items, debt service, depreciation, tax, and FCFE for a single calendar month.
- **`YearlyAggregated`**: Annual rollup derived from 12 months of `MonthlyFinancials`. Used for display tables, charts, and return metric calculations.

---

## Critical Invariant: Determinism

The financial engine is deterministic and authoritative. Given identical inputs, the engine must always produce identical outputs.

- **No AI approximations** are permitted anywhere in any calculation path. No rounding shortcuts, no estimated intermediate values, no stochastic elements.
- The **server Checker** must re-derive all results independently. It must never import, call, wrap, or delegate to the client engine code. Shared calculation logic — even utility functions — between client engine and server Checker is a defect.
- If the server Checker produces a result that differs from the client engine (beyond floating-point tolerance), this is a verification failure that must be surfaced to the user.

---

## Financial Statement Structure

### Property-Level Statements

Each property produces three standard financial statements:

- **Income Statement**: Revenue → GOP → NOI → Net Income (USALI waterfall; see `hbg-business-model` for exact definitions)
- **Balance Sheet**: Assets (property, equipment, accumulated depreciation, cash) = Liabilities (loan balance) + Equity (invested capital + retained earnings)
- **Cash Flow Statement**: Presented using the **indirect method** per ASC 230. Starts from Net Income, adds back non-cash items (depreciation), adjusts for working capital changes, then shows investing and financing activities separately.

### Consolidated Statements

Consolidated financials follow a three-step process:

1. **Aggregate properties**: Sum all property-level statements line by line.
2. **Add ManCo**: Combine with the Company Engine P&L and balance sheet.
3. **Eliminate intercompany fees**: Remove the management fees that appear both as property expense and ManCo revenue. After elimination: **Assets = Liabilities + Equity** must hold exactly.

Any consolidated statement that does not satisfy the balance sheet identity after intercompany elimination is a calculation error.

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `hbg-business-model` | Business domain definitions underlying all engine inputs and outputs |
| `verification-system` | Server-side Checker architecture and validation protocol |
| `api-backend-contract` | API endpoints that expose engine outputs and accept Checker results |
