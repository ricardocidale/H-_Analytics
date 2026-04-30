---
name: Calc Module Map
description: Documents the calc/ directory structure, public API, and which functions are deterministic tools vs internal helpers.
---

# calc/ Module Map

## Directory Structure

```
calc/
├── dispatch.ts              — Tool router: maps tool names → handler functions
├── shared/                  — Shared primitives (PMT, schedule, rounding)
│   ├── index.ts             — Barrel: pmt, ioPayment, buildSchedule, roundCents, etc.
│   ├── pmt.ts               — Canonical PMT formula (single source of truth)
│   ├── schedule.ts          — Month-by-month amortization schedule builder
│   ├── utils.ts             — roundCents, sumArray, withinTolerance, variance
│   ├── types.ts             — NewLoanTerms, ScheduleEntry
│   └── schemas.ts           — Zod schemas for all tool inputs
├── research/                — AI research deterministic calculators
│   ├── index.ts             — Barrel: computePropertyMetrics, computeDepreciationBasis, computeDebtCapacity
│   ├── property-metrics.ts  — GOP, NOI, RevPAR from property inputs
│   ├── depreciation-basis.ts — IRS 27.5-year depreciation math
│   └── debt-capacity.ts     — Max supportable debt from NOI and DSCR
├── refinance/               — Refinance calculation engine
│   ├── refinance-calculator.ts — computeRefinance() entry point
│   ├── payoff.ts            — Loan payoff amount calculation
│   ├── pmt.ts               — Refinance-specific PMT (delegates to shared)
│   ├── schedule.ts          — Post-refi amortization schedule
│   ├── sizing.ts            — Refinance loan sizing
│   └── validate.ts          — Refinance input validation
├── analysis/                — Portfolio analysis tools
│   ├── consolidation.ts     — ASC 810 multi-property consolidation
│   ├── scenario-compare.ts  — Side-by-side scenario diff
│   ├── break-even.ts        — Occupancy/ADR break-even
│   ├── waterfall.ts         — LP/GP equity waterfall
│   ├── hold-vs-sell.ts      — NPV comparison
│   ├── stress-test.ts       — Adverse scenario analysis
│   ├── capex-reserve.ts     — FF&E reserve adequacy
│   └── revpar-index.ts      — RevPAR index calculation
├── financing/               — Debt analysis tools
│   ├── dscr-calculator.ts   — Debt Service Coverage Ratio
│   ├── debt-yield.ts        — Debt yield metric
│   ├── sizing.ts            — Loan sizing from constraints
│   ├── closing-costs.ts     — Acquisition/refi closing costs
│   ├── loan-comparison.ts   — Compare loan terms
│   ├── prepayment.ts        — Prepayment penalty analysis
│   ├── sensitivity.ts       — Rate sensitivity analysis
│   ├── interest-rate-swap.ts — Swap analysis
│   └── validate.ts          — Financing input validation
├── funding/                 — SAFE/equity funding engine
│   ├── funding-engine.ts    — Tranche timing and deployment
│   ├── equity-rollforward.ts — Equity balance tracking
│   ├── gates.ts             — Funding prerequisite checks
│   ├── timeline.ts          — Funding timeline builder
│   └── validate.ts          — Funding input validation
├── returns/                 — Return metric calculators
│   ├── dcf-npv.ts           — Discounted Cash Flow / NPV
│   ├── irr-vector.ts        — IRR cash flow vector builder
│   ├── equity-multiple.ts   — Total return multiple
│   └── exit-valuation.ts    — Cap rate exit value
├── services/                — Centralized service fee engine
│   ├── margin-calculator.ts — Service margin analysis
│   ├── cost-of-services.ts  — Cost allocation
│   └── dispatch-handler.ts  — Service tool dispatch
└── validation/              — Cross-cutting validation
    ├── financial-identities.ts — Math identity checks
    ├── schedule-reconcile.ts   — Loan schedule tie-out
    ├── assumption-consistency.ts — Input consistency
    ├── export-verification.ts  — Export data validation
    └── funding-gates.ts        — Funding prerequisite gates
```

## Hardcoded Detection

All `calc/**/*.ts` files are automatically scanned by `tests/proof/hardcoded-detection.test.ts` via dynamic directory walk. Files named `index.ts`, `types.ts`, `dispatch.ts`, `schemas.ts`, and files matching `journal-hooks` are excluded from the scan. New calc files are automatically covered — no manual list maintenance needed.

## Related Rules

- `.claude/rules/no-hardcoded-values.md` — all values from constants
- `.claude/skills/finance/constants-and-config.md` — constant definitions
- `.claude/rules/financial-engine.md` — calculation rules
