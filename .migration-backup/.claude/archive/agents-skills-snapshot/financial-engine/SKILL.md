---
name: financial-engine
description: Technical contract for the deterministic financial calculation engines. Covers dual-engine architecture, pipeline stages, calc module taxonomy, return metrics, financial statements, and type contracts. Use when working on financial calculations or pro forma generation.
---

The technical contract for the deterministic financial calculation engines. Covers the dual-engine architecture (Property Engine + Company Engine), pipeline stages, calc module taxonomy, return metrics, financial statements, consolidated reporting, and TypeScript type contracts. Use this skill whenever working on financial calculations, engine inputs/outputs, pro forma generation, or return metric computation.

## Architecture

Dual-engine system producing GAAP-compliant (ASC 230, ASC 360, ASC 470) monthly/yearly projections with IRS depreciation rules.

### Property Engine (`client/src/lib/financial/property-engine.ts`)
Single-property monthly pro forma. Processes each month sequentially through an 8-step pipeline producing `MonthlyFinancials[]`.

### Company Engine (`client/src/lib/financial/company-engine.ts`)
Management company P&L, cash flow, and balance sheet. Consumes fee linkage from all property SPVs.

### Independent Verification (`server/calculationChecker.ts`)
Server-side checker reimplements all financial math from scratch. Never imports from client engines. Both producing same results = accuracy confirmed.

## Engine Chain

```
gop -> agop -> noi -> anoi
```

### USALI Income Waterfall
```
Total Revenue
  - Departmental Expenses (Rooms, F&B, Events, Other)
  - Undistributed Operating Expenses (Admin, Marketing, Property Ops, Utilities, IT)
  = GOP (Gross Operating Profit)
  - Management Fees (Base Fee + Incentive Fee)
  = AGOP (Adjusted Gross Operating Profit)
  - Property Taxes
  = NOI (Net Operating Income)         [NOI = AGOP - expenseTaxes]
  - FF&E Reserve
  = ANOI (Adjusted Net Operating Income)
  - Interest Expense
  - Depreciation
  - Income Tax (NOL carryforward at 80% cap per IRC section 172)
  = Net Income
```

## Revenue Computation

```
Room Revenue = roomCount x DAYS_PER_MONTH (30.5) x ADR x Occupancy
```

- **ADR:** Compounds at `adrGrowthRate` annually, flat within each year
- **Occupancy:** Ramps from `startOccupancy` in steps, capped at `maxOccupancy`
- **Events Revenue:** `roomRevenue x eventsRevenueShare` (default 30%)
- **F&B Revenue:** `roomRevenue x fbRevenueShare x (1 + cateringBoostPercent)` (default 18% x 1.22)
- **Other Revenue:** `roomRevenue x otherRevenueShare` (default 5%)

## Expense Categories

### Variable Costs (revenue-based)
| Expense | Default Rate | Base |
|---------|-------------|------|
| Rooms (Housekeeping) | 20% | Room Revenue |
| F&B | 9% | F&B Revenue |
| Events | 65% | Events Revenue |
| Other | 60% | Other Revenue |
| Marketing | 1% | Total Revenue |
| FF&E Reserve | 4% | Total Revenue |

### Fixed Costs (Year 1 base, escalated annually)
| Expense | Default Rate | Base |
|---------|-------------|------|
| Admin & General | 8% | Total Revenue |
| Property Ops | 4% | Total Revenue |
| Utilities | 5% (60% variable/40% fixed) | Total Revenue |
| IT | 0.5% | Total Revenue |
| Property Taxes | 3% | Total Property Value / 12 |

Fixed cost escalation: anchored to Year 1 base, escalated by `fixedCostEscalationRate`. Supports annual or monthly compounding via `escalationMethod`.

## Debt Service

- **PMT calculation:** Standard amortization formula from `loanCalculations.ts`
- Interest = balance x monthly rate
- Principal = PMT - Interest
- Loan balance decremented each month
- 100% equity (LTV=0): no debt, no PMT, financing CF = 0

## Depreciation

- **Building:** Straight-line over 27.5 years (IRS residential rental)
- **Monthly:** `buildingValue / 27.5 / 12`
- Only starts after `acquisitionDate`
- Building value = `purchasePrice - landValue` (or `purchasePrice * (1 - landValuePercent)`)

## Refinance

Post-processing step when `willRefinance` is true and `refinanceDate` is within projection:
- New valuation: `stabilized NOI / capRate`
- New loan: `valuation x refi LTV`
- Proceeds = gross loan - closing costs - old balance payoff
- Old loan schedule replaced from refi month forward

## Three Financial Statements

### Income Statement
Revenue through Net Income with all USALI line items.

### Balance Sheet (A = L + E every month)
- **Assets:** Cash, Net Property (building - accumulated depreciation)
- **Liabilities:** Loan balance
- **Equity:** Initial equity + retained earnings

### Cash Flow Statement (Indirect Method per ASC 230)
- **Operating:** Net Income + Depreciation (non-cash add-back)
- **Investing:** Property acquisition (negative), improvements
- **Financing:** Loan proceeds, principal payments, refi proceeds
- **Net Change:** Sum of all three activities

## Return Metrics

| Metric | Computation |
|--------|------------|
| **IRR** | Newton-Raphson on equity cash flows (initial investment + annual BTCF + exit proceeds) |
| **NPV** | DCF of same cash flows at discount rate |
| **Equity Multiple** | Total distributions / total equity invested |
| **Cash-on-Cash** | Annual BTCF / total equity invested |
| **Cap Rate** | NOI / property value |
| **DSCR** | NOI / annual debt service |

## Consolidated Reporting

Portfolio aggregation with intercompany elimination per ASC 810:
- Sum all SPV financials by calendar month (not relative month)
- Add ManCo financials
- Eliminate management fees (fees paid by SPVs = fees received by ManCo)
- Validate elimination nets to zero within tolerance

## Calc Module Taxonomy (`calc/`)

76 TypeScript files across 9 subdirectories (`analysis`, `financing`, `funding`, `refinance`, `research`, `returns`, `services`, `shared`, `validation`). Research modules registered in `calc/dispatch.ts`:

### `calc/research/` — Deterministic Research Tools

| Module | Purpose |
|--------|---------|
| `property-metrics.ts` | RevPAR, revenue, GOP, NOI, margins, valuation |
| `depreciation-basis.ts` | IRS depreciable basis, monthly/annual depreciation |
| `debt-capacity.ts` | Max loan from NOI, DSCR target |
| `occupancy-ramp.ts` | Occupancy ramp schedule |
| `adr-projection.ts` | ADR growth projection |
| `cap-rate-valuation.ts` | Property valuation from NOI and cap rate |
| `cost-benchmarks.ts` | Dollar-amount cost benchmarks |
| `validate-research.ts` | Post-LLM validation against deterministic math |

### `calc/returns/` — Return Metrics

| Module | Purpose |
|--------|---------|
| `irr-vector.ts` | Newton-Raphson IRR computation on equity cash flows |
| `dcf-npv.ts` | DCF analysis, NPV at discount rate |
| `mirr.ts` | Modified IRR (finance rate + reinvestment rate) |
| `equity-multiple.ts` | Total distributions / total equity |
| `exit-valuation.ts` | Terminal value via cap rate or growth models |
| `wacc.ts` | Weighted average cost of capital |

### `calc/analysis/` — Scenario & Portfolio Analysis

| Module | Purpose |
|--------|---------|
| `scenario-compare.ts` | Side-by-side scenario comparison, working capital & day-count |
| `break-even.ts` | Break-even occupancy/ADR analysis |
| `stress-test.ts` | Monte Carlo stress testing |
| `hold-vs-sell.ts` | Hold vs sell decision analysis |
| `consolidation.ts` | Portfolio-level consolidation |
| `capex-reserve.ts` | Capital expenditure reserve modeling |
| `revpar-index.ts` | RevPAR index benchmarking |
| `waterfall.ts` | Equity waterfall distribution |

### `calc/financing/` — Debt & Financing

| Module | Purpose |
|--------|---------|
| `dscr-calculator.ts` | Debt service coverage ratio |
| `debt-yield.ts` | Debt yield computation, working capital metrics |
| `sizing.ts` | Loan sizing from DSCR/LTV constraints |
| `loan-comparison.ts` | Multi-loan comparison |
| `sensitivity.ts` | Rate sensitivity analysis |
| `closing-costs.ts` | Closing cost estimation |
| `prepayment.ts` | Prepayment penalty modeling |
| `interest-rate-swap.ts` | Swap analysis |
| `financing-calculator.ts` | Composite financing analysis |

### Engine Features: Cost Segregation & Working Capital

- **Cost segregation:** Enabled via `costSegEnabled` boolean; split percentages `costSeg5yrPct`, `costSeg7yrPct`, `costSeg15yrPct` allocate building value into accelerated depreciation classes (5/7/15/27.5-year). Tracked in `MonthlyFinancials`, aggregated in yearly output.
- **Working capital:** Modeled in cash flow aggregator. Net working capital changes flow through operating cash flow per ASC 230.
- **Day-count conventions:** `DAYS_PER_MONTH` (30.5) used for revenue; actual-day methods available in `scenario-compare.ts`.

## Edge Cases

### Temporal
- Month 0 / Pre-acquisition: everything zero
- Operations start != Acquisition: debt/depreciation at acquisition, revenue at operations start
- Always use `parseLocalDate()` to prevent timezone shift
- `projectionYears >= 2` required

### Financial
- 100% equity (LTV=0): no debt paths
- Zero occupancy/ADR: valid during ramp-up, fixed costs still accrue
- Negative taxable income: `incomeTax = max(0, taxableIncome x taxRate)`
- Cash going negative: valid business condition, NOT a calculation error

### Balance Sheet
- A = L + E every single month, no exceptions
- Accumulated depreciation capped at building value

## Key Files

| File | Purpose |
|------|---------|
| `client/src/lib/financial/property-engine.ts` | Property calculation engine |
| `client/src/lib/financial/company-engine.ts` | Company calculation engine |
| `client/src/lib/financial/types.ts` | TypeScript interfaces |
| `shared/constants.ts` | Named constants and defaults |
| `calc/` | 76 files, typed dispatch across 8 subdirectories |
| `client/src/lib/audits/` | 9-module audit system |
| `server/calculationChecker.ts` | Independent verification engine |

## 21 Sub-Skills (in `.claude/skills/finance/`)

| File | Coverage |
|------|----------|
| `income-statement.md` | Revenue, expenses, NOI, net income |
| `cash-flow-statement.md` | Operating, investing, financing activities |
| `balance-sheet.md` | Assets, liabilities, equity |
| `irr-analysis.md` | IRR, NPV, equity multiple, sensitivity |
| `dcf-analysis.md` | DCF, FCF, FCFE reconciliation |
| `fee-linkage.md` | Management/incentive fee calculations |
| `consolidation.md` | Portfolio aggregation, eliminations |
| `management-company-statements.md` | ManCo pro forma |
| `centralized-services.md` | Cost-plus markup, vendor costs |
| `calc-module-map.md` | Calc module taxonomy and dispatch |
| `calculation-chain.md` | Engine pipeline stages |
| `cash-line-architecture.md` | Cash line item structure |
| `consolidated-formula-helpers.md` | Consolidated report helpers |
| `constants-and-config.md` | Constants governance |
| `cross-statement-reference.md` | Cross-statement field mapping |
| `diagnostic-decision-tree.md` | Debugging financial issues |
| `fb-revenue-costs.md` | F&B revenue and cost calculations |
| `financial-statements-construction.md` | Statement construction patterns |
| `statement-separation-rules.md` | Statement separation logic |
| `timing-activation-rules.md` | Temporal activation and timing rules |
| `validation-identities.md` | GAAP identity checks |
