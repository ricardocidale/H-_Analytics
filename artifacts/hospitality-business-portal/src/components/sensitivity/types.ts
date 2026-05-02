export interface SensitivityVariable {
  id: string;
  label: string;
  unit: "%" | "$" | "x";
  step: number;
  range: [number, number];
  defaultValue: number;
  description: string;
  tooltip?: string;
}

export interface ScenarioResult {
  totalRevenue: number;
  totalNOI: number;
  totalCashFlow: number;
  avgNOIMargin: number;
  exitValue: number;
  irr: number;
  /**
   * Audit Task #967 — true equity multiple (MOIC) for the scenario.
   * Mirrors `SensitivityScenarioResult.equityMultipleValue` from
   * `@shared/sensitivity-types` so the heatmap fallback path on the client
   * has the same field as the server response.
   */
  equityMultipleValue: number;
}

export interface TornadoItem {
  name: string;
  positive: number;
  negative: number;
  spread: number;
  upLabel: string;
  downLabel: string;
}
