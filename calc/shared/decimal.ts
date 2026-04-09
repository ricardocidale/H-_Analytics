import Decimal from "decimal.js";

const DECIMAL_PRECISION = 20;
Decimal.set({ precision: DECIMAL_PRECISION, rounding: Decimal.ROUND_HALF_UP });

export function dSum(values: number[]): number {
  let acc = new Decimal(0);
  for (const v of values) {
    if (!Number.isFinite(v)) return v;
    acc = acc.plus(new Decimal(v));
  }
  return acc.toNumber();
}

export function dMul(a: number, b: number): number {
  return new Decimal(a).times(new Decimal(b)).toNumber();
}

export function dDiv(a: number, b: number): number {
  if (b === 0) return 0;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return new Decimal(a).dividedBy(new Decimal(b)).toNumber();
}

export function dRound(value: number, decimals: number): number {
  return new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toNumber();
}

export function dPow(base: number, exponent: number): number {
  return new Decimal(base).pow(new Decimal(exponent)).toNumber();
}

export function assertFinite(n: number, label: string): number {
  if (!Number.isFinite(n)) {
    throw new Error(`Non-finite value in ${label}: ${n}`);
  }
  return n;
}
