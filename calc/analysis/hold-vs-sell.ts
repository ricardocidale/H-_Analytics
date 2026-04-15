/**
 * calc/analysis/hold-vs-sell.ts — Hold vs. Sell decision analysis for hotel properties.
 *
 * PURPOSE:
 * Compares the NPV of continuing to hold a hotel property (collecting operating
 * cash flows and eventually selling) against selling immediately at current market
 * value. This is THE core strategic decision in real estate private equity: "Should
 * we keep this asset or take our chips off the table?"
 *
 * HOLD SCENARIO:
 *   1. Project NOI forward at the assumed growth rate for the remaining hold period.
 *   2. Compute annual Free Cash Flow (FCF) = NOI − CapEx − Debt Service.
 *   3. Compute terminal value: NOI in final year × (1 + growth) / exit cap rate.
 *   4. Net terminal proceeds = terminal value − commission − remaining debt.
 *   5. NPV = sum of discounted FCFs + discounted terminal proceeds.
 *
 * SELL SCENARIO:
 *   1. Gross sale price = current market value.
 *   2. Deductions: broker commission, debt repayment, capital gains tax,
 *      depreciation recapture tax.
 *   3. Net after-tax proceeds = what the investor actually takes home today.
 *
 * TAX TREATMENT:
 *   - Capital Gains Tax: Applied to the gain above the adjusted cost basis
 *     (original cost − accumulated depreciation). Default rate: 20%.
 *   - Depreciation Recapture (IRC §1250): When selling, previously deducted
 *     depreciation is "recaptured" at a higher rate (default: 25%). This is
 *     because depreciation deductions reduced taxable income in prior years.
 *   - Adjusted Basis = Original Cost − Accumulated Depreciation.
 *
 * RECOMMENDATION LOGIC:
 *   - "hold" if NPV of holding exceeds net sell proceeds by > 2% of market value.
 *   - "sell" if NPV of holding is < net sell proceeds by > 2% of market value.
 *   - "indifferent" if the difference is within the 2% dead zone.
 *
 * KEY OUTPUTS:
 *   - npv_advantage_hold: Positive means holding creates more value.
 *   - implied_exit_yield: Current NOI / Current market value (going-in cap rate).
 *   - breakeven_noi_growth: The NOI growth rate at which hold NPV = sell proceeds.
 *   - opportunity_cost_of_hold: What the sell proceeds could earn if reinvested.
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "hold_vs_sell" skill. Presented in the
 * investment analysis dashboard to guide disposition timing decisions.
 */
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";
import { rounder, RATIO_ROUNDING, sumArray } from "../shared/utils.js";
import {
  DEFAULT_COMMISSION_RATE,
  DEFAULT_CAPITAL_GAINS_RATE,
  DEFAULT_DEP_RECAPTURE_RATE,
  HOLD_VS_SELL_INDIFFERENCE_PCT,
  DEPRECIATION_YEARS,
} from "../../shared/constants.js";
import { dPow, dDiv, dSum } from "../shared/decimal.js";

export interface HoldVsSellInput {
  property_name?: string;
  current_noi: number;
  noi_growth_rate: number;
  current_market_value: number;
  exit_cap_rate: number;
  future_exit_cap_rate?: number;
  remaining_hold_years: number;
  discount_rate: number;
  outstanding_debt?: number;
  commission_rate?: number;
  annual_capex?: number;
  annual_debt_service?: number;
  original_cost_basis?: number;
  capital_gains_rate?: number;
  depreciation_recapture_rate?: number;
  accumulated_depreciation?: number;
  rounding_policy: RoundingPolicy;
}

export interface HoldScenario {
  projected_noi: number[];
  projected_fcf: number[];
  terminal_noi: number;
  terminal_value: number;
  net_terminal_proceeds: number;
  npv_hold: number;
  total_cash_flow_hold: number;
  hold_irr_approx: number;
}

export interface SellScenario {
  gross_sale_price: number;
  commission: number;
  net_sale_proceeds: number;
  debt_repayment: number;
  capital_gains_tax: number;
  depreciation_recapture_tax: number;
  net_after_tax_proceeds: number;
}

export interface HoldVsSellOutput {
  hold: HoldScenario;
  sell: SellScenario;
  recommendation: "hold" | "sell" | "indifferent";
  npv_advantage_hold: number;
  implied_exit_yield: number;
  opportunity_cost_of_hold: number;
  breakeven_noi_growth: number;
}

export function computeHoldVsSell(input: HoldVsSellInput): HoldVsSellOutput {
  const r = rounder(input.rounding_policy);
  const ratio = (v: number) => roundTo(v, RATIO_ROUNDING);

  const commRate = input.commission_rate ?? DEFAULT_COMMISSION_RATE;
  const debt = input.outstanding_debt ?? 0;
  const capex = input.annual_capex ?? 0;
  const debtService = input.annual_debt_service ?? 0;
  const futureExitCap = input.future_exit_cap_rate ?? input.exit_cap_rate;
  const cgRate = input.capital_gains_rate ?? DEFAULT_CAPITAL_GAINS_RATE;
  const depRecapRate = input.depreciation_recapture_rate ?? DEFAULT_DEP_RECAPTURE_RATE;
  const accDepreciation = input.accumulated_depreciation ?? 0;
  const costBasis = input.original_cost_basis ?? input.current_market_value;

  const projected_noi: number[] = [];
  const projected_fcf: number[] = [];
  let noi = input.current_noi;

  for (let y = 0; y < input.remaining_hold_years; y++) {
    noi = y === 0 ? noi : r(noi * (1 + input.noi_growth_rate));
    projected_noi.push(r(noi));
    projected_fcf.push(r(noi - capex - debtService));
  }

  const terminal_noi = projected_noi.length > 0
    ? r(projected_noi[projected_noi.length - 1] * (1 + input.noi_growth_rate))
    : r(input.current_noi); // Zero hold period: use current NOI, no growth

  const terminal_value = futureExitCap > 0 ? r(terminal_noi / futureExitCap) : 0;
  const terminalCommission = r(terminal_value * commRate);
  const holdYearsDepreciation = r(accDepreciation + (costBasis / DEPRECIATION_YEARS) * input.remaining_hold_years);
  const terminalAdjBasis = r(Math.max(0, costBasis - holdYearsDepreciation));
  const terminalGain = r(Math.max(0, terminal_value - terminalCommission - terminalAdjBasis));
  const terminalDepRecapTax = r(Math.min(terminalGain, holdYearsDepreciation) * depRecapRate);
  const terminalCapGain = r(Math.max(0, terminalGain - holdYearsDepreciation));
  const terminalCapGainsTax = r(terminalCapGain * cgRate);
  const net_terminal_proceeds = r(terminal_value - terminalCommission - debt - terminalDepRecapTax - terminalCapGainsTax);

  const holdCashFlows = [...projected_fcf];
  if (holdCashFlows.length > 0) {
    holdCashFlows[holdCashFlows.length - 1] += net_terminal_proceeds;
  }

  const npvParts: number[] = [];
  for (let t = 0; t < holdCashFlows.length; t++) {
    npvParts.push(dDiv(holdCashFlows[t], dPow(1 + input.discount_rate, t + 1)));
  }
  let npv_hold = r(dSum(npvParts));

  const total_cash_flow_hold = r(sumArray(projected_fcf) + net_terminal_proceeds);

  const initialInvestment = input.current_market_value;
  let hold_irr_approx = 0;
  if (initialInvestment > 0 && input.remaining_hold_years > 0) {
    hold_irr_approx = ratio(
      dPow(total_cash_flow_hold / initialInvestment, 1 / input.remaining_hold_years) - 1
    );
  }

  const gross_sale_price = input.current_market_value;
  const commission = r(gross_sale_price * commRate);
  const net_sale_proceeds = r(gross_sale_price - commission);
  const debt_repayment = r(debt);
  const netAfterDebt = r(net_sale_proceeds - debt_repayment);

  const adjustedBasis = r(costBasis - accDepreciation);
  const gain = r(Math.max(0, net_sale_proceeds - adjustedBasis));
  const depreciation_recapture_tax = r(Math.min(gain, accDepreciation) * depRecapRate);
  const capitalGain = r(Math.max(0, gain - accDepreciation));
  const capital_gains_tax = r(capitalGain * cgRate);
  const net_after_tax_proceeds = r(netAfterDebt - capital_gains_tax - depreciation_recapture_tax);

  const npv_advantage_hold = r(npv_hold - net_after_tax_proceeds);

  const implied_exit_yield = input.current_market_value > 0
    ? ratio(input.current_noi / input.current_market_value)
    : 0;

  const opportunity_cost_of_hold = r(net_after_tax_proceeds * input.discount_rate * input.remaining_hold_years);

  let breakeven_noi_growth = 0;
  if (input.remaining_hold_years > 0 && input.current_noi > 0) {
    const computeHoldNPV = (g: number): number => {
      const nois: number[] = [];
      let n = input.current_noi;
      for (let y = 0; y < input.remaining_hold_years; y++) {
        n = y === 0 ? n : n * (1 + g);
        nois.push(n);
      }
      const termNOI = nois[nois.length - 1] * (1 + g);
      const termVal = futureExitCap > 0 ? termNOI / futureExitCap : 0;
      const termComm = termVal * commRate;
      const termProceeds = termVal - termComm - debt;
      const fcfs = nois.map(ni => ni - capex - debtService);
      if (fcfs.length > 0) fcfs[fcfs.length - 1] += termProceeds;
      let npv = 0;
      for (let t = 0; t < fcfs.length; t++) {
        npv += fcfs[t] / dPow(1 + input.discount_rate, t + 1);
      }
      return npv;
    };
    const BISECT_LO = -0.5;
    const BISECT_HI = 2.0;
    let lo = BISECT_LO, hi = BISECT_HI;
    for (let iter = 0; iter < 60; iter++) {
      const mid = (lo + hi) / 2;
      if (computeHoldNPV(mid) < net_after_tax_proceeds) lo = mid;
      else hi = mid;
    }
    breakeven_noi_growth = ratio((lo + hi) / 2);
  }

  let recommendation: "hold" | "sell" | "indifferent";
  const threshold = input.current_market_value * HOLD_VS_SELL_INDIFFERENCE_PCT;
  if (npv_advantage_hold > threshold) recommendation = "hold";
  else if (npv_advantage_hold < -threshold) recommendation = "sell";
  else recommendation = "indifferent";

  return {
    hold: {
      projected_noi,
      projected_fcf,
      terminal_noi,
      terminal_value,
      net_terminal_proceeds,
      npv_hold,
      total_cash_flow_hold,
      hold_irr_approx,
    },
    sell: {
      gross_sale_price,
      commission,
      net_sale_proceeds,
      debt_repayment,
      capital_gains_tax,
      depreciation_recapture_tax,
      net_after_tax_proceeds,
    },
    recommendation,
    npv_advantage_hold,
    implied_exit_yield,
    opportunity_cost_of_hold,
    breakeven_noi_growth,
  };
}
