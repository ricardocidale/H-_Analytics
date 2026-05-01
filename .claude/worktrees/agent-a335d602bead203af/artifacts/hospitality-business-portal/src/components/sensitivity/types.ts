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
}

export interface TornadoItem {
  name: string;
  positive: number;
  negative: number;
  spread: number;
  upLabel: string;
  downLabel: string;
}
