/**
 * constants-company-benchmarks.ts — Cached benchmark ranges for the Analyst
 * watchdog on the Company (management-company defaults) surface.
 *
 * Mirrors `constants-overhead-benchmarks.ts`, `constants-compensation-benchmarks.ts`,
 * and `constants-revenue-benchmarks.ts`: named LOW/MID/HIGH exports per
 * dimension, assembled into a band-object by reference (no inline literals).
 *
 * Persona scope: boutique-luxury hospitality management companies operating
 *   3–25 properties, US-based, founder-led to institutional-scale.
 *
 * Four tracked dimensions, all rate-based (%):
 *   1. baseManagementFee          — % of total property revenue
 *   2. incentiveManagementFee     — % of Gross Operating Profit (GOP)
 *   3. companyTaxRate             — effective corporate income tax rate (US)
 *   4. costOfEquity               — WACC equity-return component / DCF Re
 *
 * Sources:
 * - Base mgmt fee: AHLA/HLA operator survey + CBRE Hotel Management Fee
 *   Study (4%–12% range, boutique-luxury median 6%–8%; full-service
 *   branded upper bracket reaches 10%).
 * - Incentive fee: HVS Management Contract Study + STR/AHLA operator terms
 *   (8%–12% of GOP; boutique-luxury median near 10%).
 * - Company tax rate: IRS corporate rates + AICPA combined federal + state
 *   benchmarks for privately held hospitality operators (21%–30%; low end
 *   = pure federal; high end = California-class combined).
 * - Cost of equity: CBRE Investor Survey + Damodaran hospitality beta + KPMG
 *   WACC benchmarks for lodging/hospitality (15%–22%; founder-seed at low
 *   end, institutional-LP carry at high end).
 *
 * ─── Naming convention ───
 *
 * Per `.claude/rules/no-hardcoded-values.md`, every benchmark value is
 * exported as a named `DEFAULT_*_BENCHMARK_{LOW,MID,HIGH}` constant.
 * The band-object assembles them by reference — no inline numeric literals.
 * Benchmark MID values intentionally differ from the `DEFAULT_*` user-seed
 * values in `shared/constants.ts` — those are conservative tenant-creation
 * defaults; benchmark mids are industry midpoints for calibration.
 *
 * Used by `engine/watchdog/companyEvaluator.ts`.
 */

// ─── Base Management Fee — % of total property revenue ──────────────────────
export const DEFAULT_BASE_MGMT_FEE_BENCHMARK_LOW  = 0.04;
export const DEFAULT_BASE_MGMT_FEE_BENCHMARK_MID  = 0.08;
export const DEFAULT_BASE_MGMT_FEE_BENCHMARK_HIGH = 0.10;

// ─── Incentive Management Fee — % of Gross Operating Profit ─────────────────
export const DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_LOW  = 0.08;
export const DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_MID  = 0.10;
export const DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_HIGH = 0.12;

// ─── Company Income Tax Rate — effective combined federal + state ─────────────
export const DEFAULT_COMPANY_TAX_RATE_BENCHMARK_LOW  = 0.21;
export const DEFAULT_COMPANY_TAX_RATE_BENCHMARK_MID  = 0.26;
export const DEFAULT_COMPANY_TAX_RATE_BENCHMARK_HIGH = 0.30;

// ─── Cost of Equity — WACC Re / DCF discount rate ────────────────────────────
export const DEFAULT_COST_OF_EQUITY_BENCHMARK_LOW  = 0.15;
export const DEFAULT_COST_OF_EQUITY_BENCHMARK_MID  = 0.18;
export const DEFAULT_COST_OF_EQUITY_BENCHMARK_HIGH = 0.22;

// ─── Band shape ──────────────────────────────────────────────────────────────

export interface CompanyBenchmarkBand {
  low:  number;
  mid:  number;
  high: number;
}

export interface CompanyBenchmarks {
  baseManagementFee:     CompanyBenchmarkBand;
  incentiveManagementFee: CompanyBenchmarkBand;
  companyTaxRate:        CompanyBenchmarkBand;
  costOfEquity:          CompanyBenchmarkBand;
}

export const DEFAULT_COMPANY_BENCHMARKS: CompanyBenchmarks = {
  baseManagementFee: {
    low:  DEFAULT_BASE_MGMT_FEE_BENCHMARK_LOW,
    mid:  DEFAULT_BASE_MGMT_FEE_BENCHMARK_MID,
    high: DEFAULT_BASE_MGMT_FEE_BENCHMARK_HIGH,
  },
  incentiveManagementFee: {
    low:  DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_LOW,
    mid:  DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_MID,
    high: DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_HIGH,
  },
  companyTaxRate: {
    low:  DEFAULT_COMPANY_TAX_RATE_BENCHMARK_LOW,
    mid:  DEFAULT_COMPANY_TAX_RATE_BENCHMARK_MID,
    high: DEFAULT_COMPANY_TAX_RATE_BENCHMARK_HIGH,
  },
  costOfEquity: {
    low:  DEFAULT_COST_OF_EQUITY_BENCHMARK_LOW,
    mid:  DEFAULT_COST_OF_EQUITY_BENCHMARK_MID,
    high: DEFAULT_COST_OF_EQUITY_BENCHMARK_HIGH,
  },
};

/** Base management fee rate for the live US Market Anchor comparable row (boutique-luxury independent operator). */
export const LIVE_ANCHOR_BASE_MGMT_FEE_RATE = 0.03;
