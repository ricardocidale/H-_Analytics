import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { rounder } from "../shared/utils.js";

export interface NaNSweepInput {
  label: string;
  values: Record<string, unknown>[];
  fields: string[];
  rounding_policy: RoundingPolicy;
}

export interface NaNSweepOutput {
  passed: boolean;
  nanCount: number;
  details: Array<{ row: number; field: string }>;
}

export function sweepNaN(input: NaNSweepInput): NaNSweepOutput {
  const details: Array<{ row: number; field: string }> = [];
  for (let i = 0; i < input.values.length; i++) {
    const row = input.values[i];
    for (const field of input.fields) {
      const v = row[field];
      if (typeof v === "number" && isNaN(v)) {
        details.push({ row: i, field });
      }
    }
  }
  return { passed: details.length === 0, nanCount: details.length, details };
}

export interface FeeZeroSumInput {
  propertyFeesPaid: number;
  companyFeesReceived: number;
  tolerance?: number;
  rounding_policy: RoundingPolicy;
}

export interface FeeZeroSumOutput {
  passed: boolean;
  propertyFeesPaid: number;
  companyFeesReceived: number;
  difference: number;
}

export function checkFeeZeroSum(input: FeeZeroSumInput): FeeZeroSumOutput {
  const r = rounder(input.rounding_policy);
  const tol = input.tolerance ?? 0.01;
  const diff = Math.abs(input.propertyFeesPaid - input.companyFeesReceived);
  return {
    passed: diff <= tol,
    propertyFeesPaid: r(input.propertyFeesPaid),
    companyFeesReceived: r(input.companyFeesReceived),
    difference: r(diff),
  };
}

export interface DebtRollForwardInput {
  balances: number[];
  principalPayments: number[];
  tolerance?: number;
  rounding_policy: RoundingPolicy;
}

export interface DebtRollForwardOutput {
  passed: boolean;
  errorCount: number;
  details: Array<{ month: number; expected: number; actual: number; gap: number }>;
}

export function checkDebtRollForward(input: DebtRollForwardInput): DebtRollForwardOutput {
  const r = rounder(input.rounding_policy);
  const tol = input.tolerance ?? 1.0;
  const details: Array<{ month: number; expected: number; actual: number; gap: number }> = [];

  for (let i = 1; i < input.balances.length; i++) {
    const expected = input.balances[i - 1] - input.principalPayments[i];
    const actual = input.balances[i];
    const gap = Math.abs(expected - actual);
    if (gap > tol) {
      details.push({ month: i, expected: r(expected), actual: r(actual), gap: r(gap) });
    }
  }

  return { passed: details.length === 0, errorCount: details.length, details };
}
