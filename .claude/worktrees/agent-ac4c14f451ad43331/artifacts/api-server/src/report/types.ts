export interface DesignTokens {
  primary: string;
  secondary: string;
  accent: string;
  foreground: string;
  border: string;
  muted: string;
  surface: string;
  background: string;
  white: string;
  negativeRed: string;
  chart: string[];
  line: string[];
}

export interface CoverMeta {
  companyName: string;
  entityName: string;
  reportTitle: string;
  subtitle?: string;
  date: string;
}

export interface FormattedValue {
  raw: number | string;
  text: string;
  negative: boolean;
}

export interface TableRow {
  category: string;
  values: FormattedValue[];
  rawValues: (string | number)[];
  type: "header" | "data" | "total" | "subtotal";
  indent: number;
  format?: string;
}

export interface KpiMetric {
  label: string;
  value: string;
  description: string;
}

export interface ChartSeries {
  label: string;
  values: number[];
  color: string;
}

export type SectionKind = "kpi" | "table" | "chart" | "image";

export interface KpiSection {
  kind: "kpi";
  title: string;
  metrics: KpiMetric[];
}

export interface TableSection {
  kind: "table";
  title: string;
  years: string[];
  rows: TableRow[];
}

export interface ChartSection {
  kind: "chart";
  title: string;
  years: string[];
  series: ChartSeries[];
}

export interface ImageSection {
  kind: "image";
  title: string;
  dataUrl: string;
  aspectRatio?: number;
}

export type ReportSection = KpiSection | TableSection | ChartSection | ImageSection;

export interface ReportDefinition {
  cover: CoverMeta;
  tokens: DesignTokens;
  orientation: "landscape" | "portrait";
  sections: ReportSection[];
  densePagination?: boolean;
}
