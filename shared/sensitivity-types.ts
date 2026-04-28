/**
 * shared/sensitivity-types.ts — Wire-format types for the sensitivity analysis API.
 *
 * These types define the contract between POST /api/finance/sensitivity (server)
 * and SensitivityAnalysis.tsx (client). Do NOT put UI-component types here —
 * those live in client/src/components/sensitivity/types.ts.
 */

export interface SensitivityScenarioResult {
  totalRevenue: number;
  totalNOI: number;
  totalCashFlow: number;
  avgNOIMargin: number;
  exitValue: number;
  irr: number;
}

export interface SensitivityTornadoItem {
  name: string;
  variableId: string;
  /** IRR percentage-point delta from base (positive = above base) */
  irrPositive: number;
  irrNegative: number;
  irrSpread: number;
  /** NOI percentage delta from base */
  noiPositive: number;
  noiNegative: number;
  noiSpread: number;
  upLabel: string;
  downLabel: string;
}

export interface SensitivityTornadoVariable {
  name: string;
  variableId: string;
  upsideIrr: number;
  downsideIrr: number;
  upsideNoi: number;
  downsideNoi: number;
  upsideLabel: string;
  downsideLabel: string;
}

export interface SensitivityHeatMapCell {
  row: number;
  col: number;
  rowLabel: string;
  colLabel: string;
  irrValue: number;
  noiValue: number;
  equityMultipleValue: number;
}

/**
 * Reverse-solved breakeven target for a single hospitality variable.
 * Wire format mirrors {@link import("@calc/analysis/breakeven-targets").BreakevenRow}
 * so the calc module remains the single source of truth.
 */
export interface SensitivityBreakevenRow {
  key: "adr" | "occupancy" | "revpar" | "goingInCap" | "debtRate" | "terminalCap";
  current: number;
  breakeven: number | null;
  gap: number | null;
  status: "above" | "below" | "close" | "unsolvable";
  reason?: string;
}

export interface SensitivityBreakevenBundle {
  rows: SensitivityBreakevenRow[];
  meta: {
    targetDscrFloor: number;
    proximityRatio: number;
    annualDebtService: number;
    baseAnoiAnnual: number;
  };
}

export interface SensitivityResponse {
  base: SensitivityScenarioResult;
  /** Sorted by irrSpread descending */
  tornado: SensitivityTornadoItem[];
  tornadoVariables: SensitivityTornadoVariable[];
  heatmap: {
    cells: SensitivityHeatMapCell[];
    rowLabels: string[];
    colLabels: string[];
  };
  /**
   * Breakeven targets for the selected single property. Null when the panel is
   * not applicable (e.g. "all properties" selected, no debt on the deal, etc.).
   */
  breakeven: SensitivityBreakevenBundle | null;
  projectionYears: number;
  computedAt: string;
}
