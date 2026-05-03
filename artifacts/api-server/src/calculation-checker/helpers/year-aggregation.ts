/** Minimal shape for monthly P&L metrics used by IndependentMonthlyResult */
export interface MonthlyMetrics {
  revenueTotal: number;
  gop: number;
  agop: number;
  noi: number;
  anoi: number;
}

export interface YearMetrics {
  revenue: number;
  gop: number;
  agop: number;
  noi: number;
  anoi: number;
}

/**
 * Aggregate the five key P&L metrics across a slice of monthly results.
 * Replaces the repeated `slice() + 5× reduce()` pattern in index.ts.
 */
export function aggregateYearMetrics(months: MonthlyMetrics[]): YearMetrics {
  return {
    revenue: months.reduce((s, m) => s + m.revenueTotal, 0),
    gop:     months.reduce((s, m) => s + m.gop, 0),
    agop:    months.reduce((s, m) => s + m.agop, 0),
    noi:     months.reduce((s, m) => s + m.noi, 0),
    anoi:    months.reduce((s, m) => s + m.anoi, 0),
  };
}
