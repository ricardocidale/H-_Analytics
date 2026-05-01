import { roundCents } from "../shared/utils.js";
import { dPow, dDiv, dSum } from "../shared/decimal.js";

export interface MIRRInput {
  cash_flow_vector: number[];
  finance_rate: number;
  reinvestment_rate: number;
}

export interface MIRROutput {
  mirr: number | null;
  is_valid: boolean;
  warnings: string[];
}

export function computeMIRR(input: MIRRInput): MIRROutput {
  const { cash_flow_vector, finance_rate, reinvestment_rate } = input;
  const warnings: string[] = [];
  const n = cash_flow_vector.length;

  if (n < 2) {
    return { mirr: null, is_valid: false, warnings: ["Need at least 2 periods for MIRR"] };
  }

  const pvNegParts: number[] = [];
  const fvPosParts: number[] = [];
  const periods = n - 1;

  for (let t = 0; t < n; t++) {
    const cf = cash_flow_vector[t];
    if (cf < 0) {
      pvNegParts.push(dDiv(cf, dPow(1 + finance_rate, t)));
    } else if (cf > 0) {
      fvPosParts.push(cf * dPow(1 + reinvestment_rate, periods - t));
    }
  }

  const pvNegative = dSum(pvNegParts);
  const fvPositive = dSum(fvPosParts);

  if (pvNegative >= 0) {
    return { mirr: null, is_valid: false, warnings: ["No negative cash flows — MIRR requires an initial investment"] };
  }
  if (fvPositive <= 0) {
    return { mirr: null, is_valid: false, warnings: ["No positive cash flows — MIRR requires returns"] };
  }
  if (!Number.isFinite(fvPositive) || !Number.isFinite(pvNegative)) {
    return { mirr: null, is_valid: false, warnings: ["MIRR computation produced non-finite intermediate values"] };
  }

  const mirr = dPow(dDiv(fvPositive, Math.abs(pvNegative)), 1 / periods) - 1;

  if (!Number.isFinite(mirr)) {
    return { mirr: null, is_valid: false, warnings: ["MIRR computation produced non-finite result"] };
  }
  return { mirr, is_valid: true, warnings };
}
