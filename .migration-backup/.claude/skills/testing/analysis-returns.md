# Testing: Returns Analysis (IRR, NPV, MOIC, Sensitivity)

## Scope
Tests for investment return calculations — IRR solver, NPV cross-validation, MOIC/DPI metrics, portfolio IRR, refi/exit vectors, and sensitivity analysis.

## Entity Level
**Property + Portfolio** — individual property returns and portfolio-level aggregated returns.

---

## Test Files

### IRR Solver — `tests/analytics/irr.test.ts` (13 tests)
Tests `computeIRR()` from `analytics/returns/irr.js`.

| Test | What It Proves |
|------|---------------|
| Solves simple two-cashflow case | Basic IRR convergence |
| Solves classic investment case | Standard investment pattern |
| Solves break-even case | IRR = 0 detection |
| Handles high-return case | Large return convergence |
| Handles negative return (loss) | Negative IRR detection |
| Handles multi-period with delayed returns | J-curve pattern |
| Annualizes monthly IRR | Monthly → annual conversion |
| Annual periods: periodic = annualized | Identity for annual periods |
| Returns null for all-negative | No solution detection |
| Returns null for all-positive | No solution detection |
| Returns null for single cash flow | Insufficient data |
| Returns null for empty array | Edge case |

### NPV-IRR Cross-Validation — `tests/analytics/npv-irr-crosscheck.test.ts` (17 tests)
Verifies `NPV = 0` at the computed IRR rate for multiple scenarios.

| Test | What It Proves |
|------|---------------|
| NPV ≈ 0 at IRR for each scenario | Fundamental finance identity |
| Annualized IRR consistent with periodic IRR | Conversion correctness |
| IRR increases when returns increase | Monotonicity property |
| IRR independent of cash flow scale | Homogeneity property |
| Very small positive IRR (near break-even) | Boundary precision |
| Very small negative IRR (slight loss) | Boundary precision |
| Long duration (20-year) stream | Convergence stability |
| Multiple sign changes still converges | Non-conventional cash flows |

**Key identity**: `Σ(CF_t / (1 + IRR)^t) = 0`

### Return Metrics — `tests/analytics/metrics.test.ts` (8 tests)
Tests `computeReturnMetrics()` from `analytics/returns/metrics.js`.

| Test | What It Proves |
|------|---------------|
| MOIC for 2x return | Multiple on invested capital |
| MOIC for partial loss | Loss scenario |
| DPI same as MOIC for fully realized | DPI/MOIC equivalence |
| Cash-on-cash yield | Annual yield calculation |
| IRR included in metrics | Complete output |
| Handles zero investment | Edge case |
| Handles no distributions | Edge case |
| Monthly periods for annualized IRR | Period conversion |

### Portfolio IRR — `tests/analytics/portfolio-irr.test.ts` (7 tests)
Tests portfolio-level return aggregation across multiple properties.

| Test | What It Proves |
|------|---------------|
| Two properties acquired simultaneously | Simultaneous acquisition |
| Staggered acquisitions | Time-offset aggregation |
| Three properties different years | Multi-timing portfolio |
| Portfolio MOIC = total dist / total invested | MOIC identity |
| Portfolio IRR between individual IRRs | Diversification bound |
| Net profit identity | Profit = distributions - invested |
| DPI = MOIC for fully realized | Equivalence for realized |

### Refinancing & Exit Vectors — `tests/analytics/refi-exit-vectors.test.ts` (8 tests)
Tests how refinancing and exit events affect return metrics.

| Test | What It Proves |
|------|---------------|
| Cash-out refi adds positive cash in refi year only | Timing isolation |
| Refi improves IRR vs no-refi scenario | Return enhancement |
| Refi improves MOIC | Multiple improvement |
| Refi through pipeline preserves ASC 230 | GAAP compliance |
| Exit proceeds dominate IRR | Terminal value impact |
| Exit value = stabilized NOI / cap rate | Cap rate formula |
| Higher exit cap rate reduces IRR | Inverse relationship |
| Exit through pipeline produces correct FCFE | Pipeline integration |

### Sensitivity Analysis — `tests/analytics/sensitivity.test.ts` (4 tests)
Tests `runSensitivity()` from `analytics/returns/sensitivity.js`.

| Test | What It Proves |
|------|---------------|
| Computes metrics for multiple scenarios | Multi-scenario execution |
| Upside has higher IRR than downside | Directional correctness |
| Handles empty scenarios array | Edge case |
| Preserves labels | Label passthrough |

### Hotel Scenario Golden — `tests/analytics/hotel-scenario-golden.test.ts` (14 tests)
Realistic 10-year hotel scenario testing full assumptions-through-IRR pipeline.

| Test | What It Proves |
|------|---------------|
| Equity invested correctly calculated | Sources & uses |
| Annual debt service positive and reasonable | Debt sizing |
| DSCR > 1.0 for all operating years | Debt coverage |
| FCFE = NOI - Debt Service - Tax each year | FCFE identity |
| FCFE direct = FCFE from-NI for every year | Two-method reconciliation |
| IRR converges and NPV=0 | IRR validity |
| IRR in realistic hotel range (8-25%) | Reasonableness |
| MOIC > 1.0 | Profitable investment |
| Exit cap rate sensitivity | Lower cap = higher IRR |
| Debt yield > 10% in stabilized years | Lender threshold |
| Cash-on-cash positive after ramp-up | Operating viability |
| Cash purchase: FCFE = NOI - Tax | No-debt variant |
| Cash purchase IRR converges | No-debt IRR |

---

## Run Commands
```bash
npx vitest run tests/analytics/                       # All analytics (101 tests)
npx vitest run tests/analytics/irr.test.ts            # IRR solver only
npx vitest run tests/analytics/npv-irr-crosscheck.test.ts  # NPV-IRR cross-validation
npx vitest run tests/analytics/metrics.test.ts        # Return metrics
npx vitest run tests/analytics/portfolio-irr.test.ts  # Portfolio IRR
npx vitest run tests/analytics/refi-exit-vectors.test.ts   # Refi/exit vectors
npx vitest run tests/analytics/sensitivity.test.ts    # Sensitivity analysis
npx vitest run tests/analytics/hotel-scenario-golden.test.ts # Hotel golden scenario
```

## Related Skills
- `.claude/skills/finance/irr-analysis.md` — IRR calculation methodology
- `.claude/skills/finance/dcf-analysis.md` — DCF/terminal value methodology
- `.claude/skills/testing/analysis-dcf-fcf.md` — FCF/FCFE test coverage
- `.claude/skills/testing/golden-scenarios.md` — 269 hand-calculated golden tests (IRR edge cases, DCF/NPV, DSCR, equity multiple, exit valuation, depreciation, break-even, stress test, waterfall, pro-forma edge cases, full statements, company aggregation)
