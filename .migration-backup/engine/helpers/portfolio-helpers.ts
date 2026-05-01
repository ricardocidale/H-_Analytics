import type { MonthlyFinancials } from "../types";
import { MONTHS_PER_YEAR } from "@/lib/constants";

type NumericKeys<T> = {
  [K in keyof T]: T[K] extends number ? K : never;
}[keyof T];

export function sumMonthlyField(
  months: MonthlyFinancials[],
  field: NumericKeys<MonthlyFinancials>,
): number {
  return months.reduce((sum, m) => sum + m[field], 0);
}

export function yearEndSlice(
  financials: MonthlyFinancials[],
  yearIdx: number,
): MonthlyFinancials[] {
  return financials.slice(0, (yearIdx + 1) * MONTHS_PER_YEAR);
}

export function lastMonthOfYear(
  financials: MonthlyFinancials[],
  yearIdx: number,
): MonthlyFinancials | undefined {
  const endMonth = (yearIdx + 1) * MONTHS_PER_YEAR - 1;
  return endMonth < financials.length ? financials[endMonth] : undefined;
}

export function propertyPPE(
  purchasePrice: number,
  buildingImprovements: number | null | undefined,
): number {
  return purchasePrice + (buildingImprovements ?? 0);
}
