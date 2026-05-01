import { MONTHS_PER_YEAR } from "@shared/constants";
import type { YearMonth } from "./types";

const TOLERANCE = 0.001;

export function withinTolerance(expected: number, actual: number): boolean {
  if (expected === 0 && actual === 0) return true;
  if (expected === 0) return Math.abs(actual) < TOLERANCE;
  return Math.abs((expected - actual) / expected) < TOLERANCE;
}

export function parseYearMonth(isoDate: string): YearMonth {
  const [year, month] = isoDate.split('-').map(Number);
  return { year, month: month - 1 };
}

export function addMonthsYM(ym: YearMonth, n: number): YearMonth {
  const totalMonths = ym.year * MONTHS_PER_YEAR + ym.month + n;
  return { year: Math.floor(totalMonths / MONTHS_PER_YEAR), month: totalMonths % MONTHS_PER_YEAR };
}

export function diffMonthsYM(a: YearMonth, b: YearMonth): number {
  return (a.year * MONTHS_PER_YEAR + a.month) - (b.year * MONTHS_PER_YEAR + b.month);
}

export function ymNotBefore(a: YearMonth, b: YearMonth): boolean {
  return diffMonthsYM(a, b) >= 0;
}
