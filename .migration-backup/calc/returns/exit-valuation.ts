/**
 * calc/returns/exit-valuation.ts — Property exit (sale) valuation calculator.
 *
 * PURPOSE:
 * Computes the gross and net proceeds from selling a hotel property at the end
 * of the hold period using the Direct Capitalization method (income approach).
 *
 * DIRECT CAPITALIZATION FORMULA:
 *   Gross Sale Price = Stabilized NOI / Exit Cap Rate
 *
 * This is the most common valuation method in hospitality. The exit cap rate
 * reflects the market's required yield at the time of sale. A lower cap rate
 * means a higher valuation (investors accept less yield → pay more).
 *
 * WATERFALL FROM GROSS TO NET:
 *   Gross Sale Price
 *   − Broker Commission (typically 1–5% of gross)
 *   − Other Closing Costs (transfer taxes, legal, etc.)
 *   = Net Sale Proceeds
 *   − Debt Repayment (outstanding loan balance at exit)
 *   = Net to Equity (cash returned to equity investors)
 *
 * KEY OUTPUT — IMPLIED PRICE PER KEY:
 * Gross Sale Price / Room Count. This is the hospitality industry's standard
 * comparability metric. A full-service hotel in a gateway city might trade at
 * $400K–$800K per key, while a limited-service suburban hotel might be $60K–$150K.
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "exit_valuation" skill. The financial engine
 * uses this at the end of the projection to compute terminal value, which flows
 * into the IRR vector and the hold-vs-sell analysis.
 */
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { rounder } from "../shared/utils.js";
import { DEFAULT_COMMISSION_RATE } from "../../shared/constants.js";

export interface ExitValuationInput {
  stabilized_noi: number;
  exit_cap_rate: number;
  commission_rate?: number;
  outstanding_debt?: number;
  other_closing_costs?: number;
  room_count?: number;
  property_name?: string;
  rounding_policy: RoundingPolicy;
}

export interface ExitValuationOutput {
  gross_sale_price: number;
  implied_price_per_key: number | null;
  commission: number;
  net_sale_proceeds: number;
  debt_repayment: number;
  net_to_equity: number;
  debt_free_at_exit: boolean;
}

export function computeExitValuation(input: ExitValuationInput): ExitValuationOutput {
  const r = rounder(input.rounding_policy);
  const commissionRate = input.commission_rate ?? DEFAULT_COMMISSION_RATE;
  const outstandingDebt = input.outstanding_debt ?? 0;
  const otherClosingCosts = input.other_closing_costs ?? 0;

  const gross_sale_price = input.exit_cap_rate > 0
    ? r(input.stabilized_noi / input.exit_cap_rate)
    : 0;

  const implied_price_per_key = input.room_count && input.room_count > 0
    ? r(gross_sale_price / input.room_count)
    : null;

  const commission = r(gross_sale_price * commissionRate);
  const net_sale_proceeds = r(gross_sale_price - commission - otherClosingCosts);
  const debt_repayment = r(outstandingDebt);
  const net_to_equity = r(net_sale_proceeds - debt_repayment);

  return {
    gross_sale_price, implied_price_per_key, commission,
    net_sale_proceeds, debt_repayment, net_to_equity,
    debt_free_at_exit: net_to_equity >= 0,
  };
}
