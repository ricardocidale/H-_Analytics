# Testing: Golden Scenarios — Hand-Calculated Reference Values

## Scope
65 tests across 7 files in `tests/golden/` that pin every financial calculator to hand-calculated reference values. Each test includes the expected value derived from first principles (not computed by the engine), so any regression is caught immediately.

## Entity Level
**All Levels** — standalone calculators (IRR, NPV, DSCR, depreciation, break-even, stress test, waterfall, exit valuation, equity multiple) and full pro-forma engine edge cases.

## Run Commands
```bash
npx vitest run tests/golden/                          # All 65 golden tests (~3s)
npx vitest run tests/golden/irr-edge-cases.test.ts    # IRR edge cases (8 tests)
npx vitest run tests/golden/dcf-npv.test.ts           # DCF/NPV (8 tests)
npx vitest run tests/golden/equity-exit.test.ts       # Equity Multiple + Exit Valuation (9 tests)
npx vitest run tests/golden/dscr-loan-sizing.test.ts  # DSCR loan sizing (7 tests)
npx vitest run tests/golden/depreciation-breakeven.test.ts  # Depreciation + Break-Even (10 tests)
npx vitest run tests/golden/stress-waterfall.test.ts  # Stress Test + Waterfall (8 tests)
npx vitest run tests/golden/proforma-edge-cases.test.ts     # Pro-Forma engine edge cases (15 tests)
```

---

## File 1: IRR Edge Cases — `irr-edge-cases.test.ts` (8 tests)
Tests `computeIRR()` from `analytics/returns/irr.ts` (Newton-Raphson solver).

| # | Scenario | Cash Flows | Expected IRR | What It Proves |
|---|----------|-----------|-------------|----------------|
| 1 | Single large exit | [-1M, 0, 0, 0, 0, 2M] | 14.87% = (2)^(1/5)−1 | Delayed payoff convergence |
| 2 | Monthly annualized | [-1200, 10×24, 1300] | Monthly → annual via (1+r)^12−1 | Annualization correctness |
| 3 | Near-zero return | [-1000, 1001] | 0.1% | Boundary precision near zero |
| 4 | Very high return | [-100, 500] | 400% | Extreme upside convergence |
| 5 | Large negative return | [-1000, 100] | −90% | Deep loss convergence |
| 6 | Alternating signs | [-500, 300, −200, 600] | Converged, NPV≈0 | Non-conventional cash flows |
| 7 | 30-year hold | [-1M, 80k×29, 1.2M] | Converged, NPV≈0 | Long-duration stability |
| 8 | Break-even | [-100, 20, 20, 20, 20, 20] | 0% | Exact break-even detection |

All scenarios include NPV cross-check: `NPV(flows, IRR) ≈ 0`.

---

## File 2: DCF/NPV — `dcf-npv.test.ts` (8 tests)
Tests `computeDCF()` from `calc/returns/dcf-npv.ts`.

| # | Scenario | Discount Rate | Expected NPV | What It Proves |
|---|----------|--------------|-------------|----------------|
| 1 | Simple 3-year at 10% | 10% | Hand-calc'd PV per period | Standard DCF |
| 2 | Zero discount rate | 0% | Sum of cash flows | No-discounting identity |
| 3 | High discount rate | 50% | Near-initial-investment only | Heavy discounting |
| 4 | IRR cross-check | IRR value | ≈ 0 | NPV=0 at IRR identity |
| 5 | Single period | 5% | 110/1.05 − 100 = 4.76 | Basic time-value |
| 6 | 10-year hotel with exit | 8% | Full PV timeline verified | Complex multi-year |
| 7 | Monthly with annualization | Monthly rate | Annualized rate verified | Period conversion |
| 8 | PV timeline formula | Various | CF_t / (1+r)^t per entry | Formula correctness |

---

## File 3: Equity Multiple & Exit Valuation — `equity-exit.test.ts` (9 tests)
Tests `computeEquityMultiple()` and `computeExitValuation()`.

### Equity Multiple (4 tests)

| # | Scenario | Invested | Returned | Multiple | What It Proves |
|---|----------|---------|---------|----------|----------------|
| 1 | Simple 2× | $500k | $1M | 2.0× | Standard profitable exit |
| 2 | Loss | $1M | $500k | 0.5× | Below-cost recovery |
| 3 | Break-even | $100 | $100 | 1.0× | Exact parity |
| 4 | Multiple investments | $800 | $1,000 | 1.25× | Aggregated outflows |

### Exit Valuation (5 tests)

| # | Scenario | NOI / Cap | Key Formula | What It Proves |
|---|----------|----------|------------|----------------|
| 1 | Standard with debt | 740k / 7.5% | Gross=9,866,667; Net=equity after commission+debt | Full waterfall |
| 2 | Debt-free | 500k / 8% | No debt repayment line | Simplest case |
| 3 | Zero cap rate | Any / 0% | Returns 0 | Division-by-zero guard |
| 4 | Underwater | Low NOI / high debt | Net-to-equity < 0 | High leverage failure |
| 5 | Price per key | 50 rooms | Gross / 50 | Hospitality comparability metric |

---

## File 4: DSCR Loan Sizing — `dscr-loan-sizing.test.ts` (7 tests)
Tests `computeDSCR()` from `calc/financing/dscr-calculator.ts`.

| # | Scenario | NOI | Rate | DSCR | Expected Binding | What It Proves |
|---|----------|-----|------|------|-----------------|----------------|
| 1 | DSCR binding | $500k | 7% | 1.25× | DSCR | Max DS=400k, reverse PMT |
| 2 | LTV binding | $500k | 7% | 1.25× | LTV | LTV < DSCR loan |
| 3 | Full IO | $500k | 7% | 1.25× | IO formula | Loan = NOI/(DSCR×rate) |
| 4 | IO + amortizing | $600k | 6.5% | 1.20× | Amortizing sizing | Worst-case DS used |
| 5 | Zero NOI | $0 | 7% | 1.25× | Zero loan | Edge: no income |
| 6 | Very high NOI | $2M | 7% | 1.25× | LTV | Over-qualified borrower |
| 7 | Output verification | Various | Various | Various | actual_dscr, implied_ltv | Derived metric accuracy |

---

## File 5: Depreciation & Break-Even — `depreciation-breakeven.test.ts` (10 tests)
Tests `computeDepreciationBasis()` and `computeBreakEven()`.

### Depreciation (4 tests)

| # | Scenario | Purchase | Land % | Improvements | Annual Dep | What It Proves |
|---|----------|---------|--------|-------------|-----------|----------------|
| 1 | Standard | $2M | 25% | $0 | $54,545.45 | IRS Pub 946 (27.5yr SL) |
| 2 | With improvements | $1M | 20% | $200k | $36,363.64 | Improvements added to basis |
| 3 | 100% land | $500k | 100% | $0 | $0 | Non-depreciable edge |
| 4 | Tax shield | $2M | 25% | $0 | At 25%: $13,636.36 | Shield = dep × rate |

### Break-Even (6 tests)

| # | Scenario | Rooms | ADR | What It Proves |
|---|----------|-------|-----|----------------|
| 1 | Operating BE | 50 | $200 | NOI=0 occupancy threshold |
| 2 | Cash flow BE | 50 | $200 | Including debt service + tax |
| 3 | Ancillary revenue | 50 | $200 | Ancillary lowers required occ |
| 4 | ADR sensitivity | 50 | $180 (−10%) | BE occupancy increases |
| 5 | Fixed cost sensitivity | 50 | $200 | +10% fixed → higher BE |
| 6 | Zero rooms / neg margin | 0 | Any | Returns 100% (impossible) |

---

## File 6: Stress Test & Waterfall — `stress-waterfall.test.ts` (8 tests)

### Stress Test (4 tests)
Tests `computeStressTest()` from `calc/analysis/stress-test.ts`.

| # | Scenario | Shock | Expected Severity | What It Proves |
|---|----------|-------|------------------|----------------|
| 1 | Mild Recession | ADR−5%, Occ−10%, Exp+3% | Low/moderate | Standard downturn impact |
| 2 | Pandemic Shock | ADR−30%, Occ−50%, Exp−10% | Critical, NOI<0 | Extreme stress, negative NOI |
| 3 | No debt service | Same shocks | DSCR = null | Null DSCR when unlevered |
| 4 | Risk score formula | Mixed severities | Computed score | Weighted severity formula |

### Waterfall (4 tests)
Tests `computeWaterfall()` from `calc/analysis/waterfall.ts`.

| # | Scenario | Equity | Distributable | What It Proves |
|---|----------|--------|-------------|----------------|
| 1 | Simple 2-tier | $1M (90/10) | $1.5M | ROC→Pref→Tier split |
| 2 | Pref shortfall | $1M | $900k | Insufficient for full pref |
| 3 | GP catch-up | $1M | $2M | 100% catch-up mechanics |
| 4 | Zero cash | $1M | $0 | All outputs = 0 |

---

## File 7: Pro-Forma Engine Edge Cases — `proforma-edge-cases.test.ts` (15 tests)
Tests `generatePropertyProForma()` from `client/src/lib/financial/property-engine.ts`.

| # | Scenario | Config | Tests | What It Proves |
|---|----------|--------|-------|----------------|
| 1 | All-Cash Luxury Hotel | $5M, 20 rooms, Full Equity | 5 | Zero debt, NOI formula, tax floor, ATCF, monotonic cash |
| 2 | High-Leverage (90% LTV) | $2M, Financed, 90% LTV | 3 | Debt sizing, interest magnitude, negative early CF |
| 3 | Zero Revenue | 0% occupancy | 2 | Zero rev/exp, debt service continues |
| 4 | Negative Taxable Income | High dep + interest | 1 | Tax = 0 (no NOL carryforward) |
| 5 | ADR + Inflation Growth | 3% ADR, 3% inflation | 1 | Year-over-year escalation |
| 6 | Occupancy Ramp | 30%→90% over 12 months | 1 | Step-based gradual ramp |
| 7 | Refinance | Refi at month 36 | 2 | Debt swap, refiProceeds > 0 |

---

## Design Principles

1. **Hand-calculated values only** — every expected value in these tests was computed manually (not by the engine). Comments show the derivation.
2. **Penny-exact precision** — financial values use `toBeCloseTo(value, 2)` (nearest cent). Rates use `toBeCloseTo(value, 4)` or higher.
3. **NPV cross-check everywhere** — IRR tests always verify NPV(flows, IRR) ≈ 0 as an independent check.
4. **Edge cases first** — zero inputs, negative inputs, boundary conditions, and impossible scenarios are prioritized because those are where bugs hide.
5. **No engine dependency** — calculator tests import only the calculator being tested, not the full engine. Pro-forma tests use the engine but verify structural properties, not specific dollar amounts (which depend on constants).

## Relationship to Other Test Suites

| Suite | Purpose | Complementary To |
|-------|---------|------------------|
| `tests/proof/` | GAAP identity enforcement | Golden scenarios prove the *formulas* are right |
| `tests/analytics/` | IRR/NPV/MOIC solver correctness | Golden adds edge cases and hand-calcs |
| `tests/financing/` | Acquisition loan golden | Golden adds DSCR sizing edge cases |
| `tests/refinance/` | Refi golden | Golden adds pro-forma refi integration |
| `tests/engine/` | Pro-forma regression | Golden adds extreme edge cases |

## Maintenance Rules

1. **Never change expected values without re-deriving by hand** — if a test breaks, fix the engine, not the test
2. **Add new golden tests for every new calculator** — the calculator must have at least one hand-calculated reference
3. **Run `npx vitest run tests/golden/` after any financial engine change** — fast (3s), catches regressions immediately
4. **Keep derivation comments** — the `/*  ... */` block above each test IS the documentation
