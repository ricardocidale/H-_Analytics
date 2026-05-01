/**
 * calc/returns/wacc.ts — Weighted Average Cost of Capital (WACC) calculator.
 *
 * PURPOSE:
 * Computes the blended cost of capital for a property or portfolio, weighting
 * the cost of equity and the after-tax cost of debt by their respective shares
 * of the capital structure. WACC is the appropriate discount rate for DCF
 * valuation of levered real estate investments.
 *
 * THE WACC FORMULA:
 *   WACC = (E/V × Re) + (D/V × Rd × (1 − T))
 *
 * Where:
 *   E   = market value of equity
 *   D   = market value of debt
 *   V   = E + D (total capital)
 *   Re  = cost of equity (user-provided; typically 15–25% for private hospitality)
 *   Rd  = cost of debt (interest rate on borrowings)
 *   T   = corporate tax rate (tax shield on interest)
 *
 * INTERMEDIATE APPROACH (no CAPM):
 * For private hospitality companies, beta is unreliable. Users input Re directly
 * based on their required equity return, rather than deriving it via CAPM
 * (Rf + β × ERP). This is standard practice for private real estate.
 *
 * PORTFOLIO WACC:
 * For multi-property portfolios, WACC is computed as the capital-weighted
 * average across all properties. Each property contributes its equity and
 * debt to the portfolio totals, with its own cost of debt.
 *
 * HOW IT FITS THE SYSTEM:
 * Registered in calc/dispatch.ts as "compute_wacc". Output feeds into
 * calculate_dcf_npv as the discount_rate parameter for property and
 * portfolio valuation.
 */
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { rounder, RATE_ROUNDING } from "../shared/utils.js";
import { roundTo } from "../../domain/types/rounding.js";

// ── Single-property WACC ──────────────────────────────────────────────────────

export interface WACCInput {
  /** Total equity invested (E). Must be > 0 for a valid capital structure. */
  equity: number;
  /** Total debt outstanding (D). Can be 0 for all-cash purchases. */
  debt: number;
  /** Cost of equity as decimal (e.g. 0.18 = 18%). User-provided, not CAPM-derived. */
  cost_of_equity: number;
  /** Cost of debt as decimal (e.g. 0.09 = 9%). Typically the loan interest rate. */
  cost_of_debt: number;
  /** Corporate tax rate as decimal (e.g. 0.25 = 25%). For the interest tax shield. */
  tax_rate: number;
  rounding_policy: RoundingPolicy;
}

export interface WACCOutput {
  /** Weighted Average Cost of Capital as decimal. */
  wacc: number;
  /** Equity weight: E / (E + D). */
  equity_weight: number;
  /** Debt weight: D / (E + D). */
  debt_weight: number;
  /** Equity component of WACC: (E/V) × Re. */
  equity_component: number;
  /** Debt component of WACC: (D/V) × Rd × (1 − T). */
  debt_component: number;
  /** After-tax cost of debt: Rd × (1 − T). */
  after_tax_cost_of_debt: number;
  /** Total capital: E + D. */
  total_capital: number;
}

export function computeWACC(input: WACCInput): WACCOutput {
  const r = rounder(input.rounding_policy);
  const { equity, debt, cost_of_equity, cost_of_debt, tax_rate } = input;

  const totalCapital = equity + debt;

  // Edge case: no capital at all (shouldn't happen, but guard against division by zero)
  if (totalCapital <= 0) {
    return {
      wacc: 0,
      equity_weight: 0,
      debt_weight: 0,
      equity_component: 0,
      debt_component: 0,
      after_tax_cost_of_debt: 0,
      total_capital: 0,
    };
  }

  const equityWeight = equity / totalCapital;
  const debtWeight = debt / totalCapital;
  const afterTaxCostOfDebt = cost_of_debt * (1 - tax_rate);

  const equityComponent = equityWeight * cost_of_equity;
  const debtComponent = debtWeight * afterTaxCostOfDebt;
  const wacc = equityComponent + debtComponent;

  return {
    wacc: roundTo(wacc, RATE_ROUNDING),
    equity_weight: roundTo(equityWeight, RATE_ROUNDING),
    debt_weight: roundTo(debtWeight, RATE_ROUNDING),
    equity_component: roundTo(equityComponent, RATE_ROUNDING),
    debt_component: roundTo(debtComponent, RATE_ROUNDING),
    after_tax_cost_of_debt: roundTo(afterTaxCostOfDebt, RATE_ROUNDING),
    total_capital: r(totalCapital),
  };
}

// ── Portfolio WACC (capital-weighted across properties) ───────────────────────

export interface PortfolioPropertyWACC {
  /** Property name (for labeling). */
  name: string;
  equity: number;
  debt: number;
  cost_of_equity: number;
  cost_of_debt: number;
}

export interface PortfolioWACCInput {
  properties: PortfolioPropertyWACC[];
  /** Corporate tax rate applied uniformly across properties. */
  tax_rate: number;
  rounding_policy: RoundingPolicy;
}

export interface PropertyWACCDetail {
  name: string;
  wacc: number;
  equity_weight: number;
  debt_weight: number;
  capital_share: number;
}

export interface PortfolioWACCOutput {
  /** Portfolio-level WACC (capital-weighted average). */
  portfolio_wacc: number;
  /** Total equity across all properties. */
  total_equity: number;
  /** Total debt across all properties. */
  total_debt: number;
  /** Total capital across all properties. */
  total_capital: number;
  /** Portfolio-level equity weight. */
  portfolio_equity_weight: number;
  /** Portfolio-level debt weight. */
  portfolio_debt_weight: number;
  /** Per-property WACC breakdown. */
  property_details: PropertyWACCDetail[];
}

export function computePortfolioWACC(input: PortfolioWACCInput): PortfolioWACCOutput {
  const r = rounder(input.rounding_policy);
  const { properties, tax_rate } = input;

  if (properties.length === 0) {
    return {
      portfolio_wacc: 0,
      total_equity: 0,
      total_debt: 0,
      total_capital: 0,
      portfolio_equity_weight: 0,
      portfolio_debt_weight: 0,
      property_details: [],
    };
  }

  let totalEquity = 0;
  let totalDebt = 0;

  // First pass: compute totals
  for (const p of properties) {
    totalEquity += p.equity;
    totalDebt += p.debt;
  }
  const totalCapital = totalEquity + totalDebt;

  if (totalCapital <= 0) {
    return {
      portfolio_wacc: 0,
      total_equity: 0,
      total_debt: 0,
      total_capital: 0,
      portfolio_equity_weight: 0,
      portfolio_debt_weight: 0,
      property_details: [],
    };
  }

  // Second pass: compute per-property WACC and capital-weighted portfolio WACC
  let weightedWaccSum = 0;
  const details: PropertyWACCDetail[] = [];

  for (const p of properties) {
    const propCapital = p.equity + p.debt;
    const capitalShare = propCapital / totalCapital;

    const propResult = computeWACC({
      equity: p.equity,
      debt: p.debt,
      cost_of_equity: p.cost_of_equity,
      cost_of_debt: p.cost_of_debt,
      tax_rate,
      rounding_policy: input.rounding_policy,
    });

    const rawEquityWeight = p.equity / propCapital;
    const rawDebtWeight = p.debt / propCapital;
    const rawWacc = (rawEquityWeight * p.cost_of_equity)
      + (rawDebtWeight * p.cost_of_debt * (1 - tax_rate));
    weightedWaccSum += rawWacc * capitalShare;

    details.push({
      name: p.name,
      wacc: propResult.wacc,
      equity_weight: propResult.equity_weight,
      debt_weight: propResult.debt_weight,
      capital_share: roundTo(capitalShare, RATE_ROUNDING),
    });
  }

  return {
    portfolio_wacc: roundTo(weightedWaccSum, RATE_ROUNDING),
    total_equity: r(totalEquity),
    total_debt: r(totalDebt),
    total_capital: r(totalCapital),
    portfolio_equity_weight: roundTo(totalEquity / totalCapital, RATE_ROUNDING),
    portfolio_debt_weight: roundTo(totalDebt / totalCapital, RATE_ROUNDING),
    property_details: details,
  };
}
