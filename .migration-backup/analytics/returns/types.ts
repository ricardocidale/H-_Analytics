/** Result of IRR computation. */
export interface IRRResult {
  irr_periodic: number | null;
  irr_annualized: number | null;
  converged: boolean;
  iterations: number;
}

/** Comprehensive return metrics from an equity cash flow series. */
export interface ReturnMetrics {
  irr: IRRResult;
  moic: number;
  cash_on_cash: number;
  dpi: number;
  total_invested: number;
  total_distributions: number;
  net_profit: number;
}

/** A single sensitivity scenario result. */
export interface SensitivityPoint {
  label: string;
  metrics: ReturnMetrics;
}
