import { startOfMonth, addMonths } from "date-fns";
import { pmt } from "@calc/shared/pmt";

// Re-export canonical parseLocalDate from shared — single source of truth
import { parseLocalDate } from "@shared/dates";
export { parseLocalDate };

/**
 * Determine which fiscal year a given month belongs to.
 */
export function getFiscalYearLabel(
  modelStartDate: string,
  fiscalYearStartMonth: number,
  monthIndex: number
): number {
  const startDate = startOfMonth(parseLocalDate(modelStartDate));
  const currentDate = addMonths(startDate, monthIndex);
  const currentMonth = currentDate.getMonth() + 1; // 1-12
  const currentYear = currentDate.getFullYear();
  
  if (currentMonth >= fiscalYearStartMonth) {
    return currentYear;
  } else {
    return currentYear - 1;
  }
}

/**
 * Get the fiscal year label for a model year index (0-9)
 */
export function getFiscalYearForModelYear(
  modelStartDate: string,
  fiscalYearStartMonth: number,
  yearIndex: number
): number {
  const firstMonthOfYear = yearIndex * 12;
  return getFiscalYearLabel(modelStartDate, fiscalYearStartMonth, firstMonthOfYear);
}

/**
 * Helper to calculate monthly payments (PMT)
 */
export function calculatePMT(rate: number, nper: number, pv: number): number {
  return pmt(pv, rate, nper);
}

/**
 * Format a number as USD currency. Negative values are shown in accounting
 * notation with parentheses: ($1,234) instead of -$1,234.
 */
export function formatMoney(amount: number) {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(absAmount);
  return isNegative ? `(${formatted})` : formatted;
}

/** Helper for conditional CSS styling — returns true when a value should be shown in red. */
export function isNegative(amount: number): boolean {
  return amount < 0;
}

/** Format a decimal ratio as a percentage string with one decimal place (e.g. 0.85 → "85.0%"). */
export function formatPercent(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(amount);
}
