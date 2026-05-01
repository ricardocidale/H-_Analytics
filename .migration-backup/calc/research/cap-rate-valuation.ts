/**
 * cap-rate-valuation.ts — Deterministic Cap Rate Valuation
 *
 * Computes implied property value from NOI and cap rate, plus a
 * sensitivity table at ±50bps increments.
 */
import { roundCents } from "../shared/utils.js";
import { CAP_RATE_SENSITIVITY_STEP } from "../../shared/constants.js";

interface CapRateValuationInput {
  annual_noi: number;
  cap_rate: number;             // 0-1 decimal (e.g., 0.085 for 8.5%)
  purchase_price?: number;      // optional: compute spread and yield
  sensitivity_steps?: number;   // number of ±50bps steps (default 4)
}

interface SensitivityRow {
  cap_rate: number;
  cap_rate_pct: string;
  implied_value: number;
  delta_from_base?: number;
  delta_pct?: string;
}

interface CapRateValuationOutput {
  implied_value: number;
  cap_rate: number;
  cap_rate_pct: string;
  annual_noi: number;
  spread_to_purchase?: number;
  spread_pct?: string;
  sensitivity: SensitivityRow[];
}

export function computeCapRateValuation(input: CapRateValuationInput): CapRateValuationOutput {
  const {
    annual_noi,
    cap_rate,
    purchase_price,
    sensitivity_steps = 4,
  } = input;

  if (cap_rate <= 0) {
    throw new Error(`Invalid cap_rate: ${cap_rate} — must be positive for valuation`);
  }
  const impliedValue = Math.round(annual_noi / cap_rate);

  // Sensitivity table: ±50bps increments
  const sensitivity: SensitivityRow[] = [];
  for (let i = -sensitivity_steps; i <= sensitivity_steps; i++) {
    const rate = cap_rate + i * CAP_RATE_SENSITIVITY_STEP;
    if (rate <= 0) continue;
    const value = Math.round(annual_noi / rate);
    const row: SensitivityRow = {
      cap_rate: roundCents(rate * 100) / 100,
      cap_rate_pct: (Math.round(rate * 1000) / 10).toFixed(1) + "%",
      implied_value: value,
    };
    if (impliedValue > 0) {
      row.delta_from_base = value - impliedValue;
      row.delta_pct = Math.round(((value - impliedValue) / impliedValue) * 1000) / 10 + "%";
    }
    sensitivity.push(row);
  }

  const result: CapRateValuationOutput = {
    implied_value: impliedValue,
    cap_rate: roundCents(cap_rate * 100) / 100,
    cap_rate_pct: (Math.round(cap_rate * 1000) / 10).toFixed(1) + "%",
    annual_noi,
    sensitivity,
  };

  if (purchase_price !== undefined && purchase_price > 0) {
    result.spread_to_purchase = impliedValue - purchase_price;
    result.spread_pct = Math.round(((impliedValue - purchase_price) / purchase_price) * 1000) / 10 + "%";
  }

  return result;
}
