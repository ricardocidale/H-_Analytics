---
name: funding-strategy
description: Capital strategy and SAFE funding analysis. Covers tranche modeling, cash runway projection, investor thesis generation, and FRED market rate integration. Load when working on FundingPredictor page or funding-predictor engine.
---

# Funding Strategy & SAFE Tranche Modeling

## Purpose

Documents the capital strategy system that models how the management company funds pre-profitability operations via SAFE (Simple Agreement for Future Equity) tranches, projects cash runway, and generates investor-facing narratives calibrated to live market rates.

## Key Files

| File | Purpose |
|------|---------|
| `client/src/lib/financial/funding-predictor.ts` | Pure calculation engine: cash runway, tranche sizing, breakeven, narratives |
| `client/src/pages/FundingPredictor.tsx` | Capital Strategy page with runway chart, KPI grid, tranche visualization |
| `client/src/lib/financial/types.ts` | `FundingAnalysis`, `FundingTranche`, `CashRunwayPoint` types |
| `shared/constants.ts` | 20 `DEFAULT_SAFE_*` / `DEFAULT_TRANCHE_*` / `DEFAULT_FUNDING_*` constants |
| `client/src/lib/constants.ts` | `OPERATING_RESERVE_BUFFER`, `COMPANY_FUNDING_BUFFER` |

## Architecture

```
generateCompanyProForma() → CompanyMonthlyFinancials[]
                              ↓
analyzeFundingNeeds(financials, global, marketRates)
  ├── computeCashWithoutFunding() → cumulative cash (no funding)
  ├── findBreakevenMonth() → first month with positive net income
  ├── buildTranches() → 1-3 SAFE tranches with terms
  ├── buildInvestorThesis() → narrative from asset description
  ├── buildMarketContext() → FRED rate narrative
  └── buildNarrative() → funding strategy summary
                              ↓
FundingPredictor.tsx → runway chart, KPI cards, tranche cards
```

**Read-only relationship:** The engine imports `generateCompanyProForma()` but never mutates assumptions or storage.

## Tranche Sizing Algorithm

| Condition | Tranches | Logic |
|-----------|----------|-------|
| `periodLength ≤ 18 months` OR `raise ≤ $400K` | 1 | Single tranche at ops start |
| Default | 2 | T1 covers first 45% of period (pre-revenue); T2 covers remainder |
| `periodLength > 48 months` AND `T2 > $500K` | 3 | T2 split at 75% mark into T2 + T3 |

Each tranche gets staged SAFE terms:
- **Early stage (T1):** Valuation cap × 0.80 (20% discount), discount rate + 5% premium
- **Standard (T2):** Base valuation cap, base discount rate
- **Late stage (T3):** Valuation cap × 1.20 (20% uplift), discount rate - 5%

Treasury 10-year rate adjusts all terms: >4.5% = more investor-friendly; <3.0% = more founder-friendly.

## Key Types

```typescript
interface FundingAnalysis {
  totalRaiseNeeded: number;     // Peak deficit + reserves, rounded to $50K
  breakevenMonth: number | null; // First month net income > 0
  monthlyBurnRate: number;       // Average monthly cash burn pre-breakeven
  peakCashDeficit: number;       // Worst cumulative cash position
  currentFunding: number;        // Sum of configured tranche amounts
  fundingGap: number;            // Raise needed - current funding
  tranches: FundingTranche[];    // 1-3 tranches with amounts, dates, terms
  investorThesis: string;        // Generated from asset description
  marketContext: string;          // Generated from FRED rates
  narrativeSummary: string;       // Full funding strategy narrative
  cashRunway: CashRunwayPoint[]; // Month-by-month with/without funding
  monthsOfRunway: number;
  revenueAtBreakeven: number;
  propertiesAtBreakeven: number;
}

interface FundingTranche {
  index: number;           // 1, 2, or 3
  amount: number;          // Rounded to DEFAULT_FUNDING_ROUNDING_INCREMENT ($50K)
  month: number;           // Month index in projection
  date: string;            // Calendar date
  valuationCap: number | null;
  discountRate: number | null;
  rationale: string;        // Investor-facing narrative
}
```

## Named Constants (from `shared/constants.ts`)

| Constant | Value | Purpose |
|----------|-------|---------|
| `DEFAULT_SAFE_VALUATION_CAP` | $2.5M | Base valuation cap for SAFE |
| `DEFAULT_SAFE_DISCOUNT_RATE` | 20% | Base discount rate |
| `DEFAULT_FUNDING_ROUNDING_INCREMENT` | $50K | All amounts rounded to this |
| `DEFAULT_TRANCHE1_PERIOD_RATIO` | 0.45 | T1 covers first 45% of period |
| `DEFAULT_TRANCHE1_MAX_ALLOCATION` | 0.65 | T1 never exceeds 65% of total |
| `DEFAULT_TRANCHE_BIFURCATION_MONTHS` | 48 | Min period for 3-tranche split |
| `DEFAULT_TRANCHE2_ALLOCATION_PCT` | 0.55 | T2 gets 55% when split into T2+T3 |
| `DEFAULT_VALUATION_CAP_UPLIFT` | 1.20 | T3 cap is 120% of base |
| `DEFAULT_EARLY_STAGE_CAP_DISCOUNT` | 0.20 | T1 cap is 80% of base |
| `DEFAULT_EARLY_STAGE_DISCOUNT_PREMIUM` | 0.05 | T1 discount rate +5% |
| `DEFAULT_MIN_DISCOUNT_RATE` | 10% | Floor for discount rate |
| `DEFAULT_SINGLE_TRANCHE_MAX_MONTHS` | 18 | Single tranche if ≤18 months |
| `DEFAULT_SINGLE_TRANCHE_MAX_RAISE` | $400K | Single tranche if ≤$400K |
| `DEFAULT_THREE_TRANCHE_MIN_T2` | $500K | T2 must exceed $500K to split |
| `DEFAULT_TREASURY_HIGH_RATE_THRESHOLD` | 4.5% | Above = investor-friendly terms |
| `DEFAULT_TREASURY_LOW_RATE_THRESHOLD` | 3.0% | Below = founder-friendly terms |
| `DEFAULT_RISK_FREE_RATE_FALLBACK` | 4% | Used when FRED unavailable |
| `DEFAULT_FUNDING_INTEREST_RATE` | 8% | Interest on funding balances |
| `DEFAULT_TRANCHE_BUFFER_MULTIPLIER` | 1.15 | 15% buffer on cash deficit |

## FRED Market Rate Integration

The engine queries FRED rates via `MarketRateResponse[]`:
- `fed_funds`, `sofr`, `treasury_10y`, `hotel_lending_spread`
- Treasury 10Y drives SAFE term adjustments (opportunity cost)
- Missing rates trigger fallback narrative ("terms use default benchmarks")

## Related Rules

- `.claude/rules/financial-engine.md` — Engine architecture
- `.claude/rules/no-hardcoded-values.md` — All values from constants or DB
- `.claude/rules/recalculate-on-save.md` — Invalidation on assumption changes

## Related Skills

- `.claude/skills/finance/SKILL.md` — Financial engine master
- `.claude/skills/market-intelligence/SKILL.md` — FRED service pipeline
