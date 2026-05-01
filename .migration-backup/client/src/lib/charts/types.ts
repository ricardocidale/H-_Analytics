import { type ChartConfig } from "@/components/ui/chart";

export type { ChartConfig };

export interface BaseChartProps {
  className?: string;
}

export interface BarChartItem {
  name: string;
  value: number;
  fill?: string;
}

export interface BarChartProps extends BaseChartProps {
  data: BarChartItem[];
  config: ChartConfig;
  dataKey?: string;
  nameKey?: string;
  layout?: "vertical" | "horizontal";
  showLabel?: boolean;
  barRadius?: number;
}

export interface LineChartDotsColorItem {
  name: string;
  value: number;
  fill: string;
}

export interface LineChartDotsColorsProps extends BaseChartProps {
  data: LineChartDotsColorItem[];
  config: ChartConfig;
  valueKey?: string;
  nameKey?: string;
  strokeColor?: string;
}

export interface LineChartMultiSeries {
  dataKey: string;
  color: string;
  label?: string;
}

export interface LineChartMultiProps extends BaseChartProps {
  data: Record<string, unknown>[];
  config: ChartConfig;
  series: LineChartMultiSeries[];
  xAxisKey?: string;
  xAxisFormatter?: (value: string) => string;
}

export interface DonutChartItem {
  name: string;
  value: number;
  fill: string;
}

export interface DonutChartProps extends BaseChartProps {
  data: DonutChartItem[];
  config: ChartConfig;
  centerValue?: string | number;
  centerLabel?: string;
  innerRadius?: number;
}

export interface DonutInteractiveProps extends BaseChartProps {
  data: DonutChartItem[];
  config: ChartConfig;
  centerLabel?: string;
  innerRadius?: number;
  id?: string;
}

export interface RadarChartItem {
  axis: string;
  value: number;
  [key: string]: string | number;
}

export interface RadarSeries {
  dataKey: string;
  color: string;
  fillOpacity?: number;
  showDots?: boolean;
}

export interface RadarChartDotsProps extends BaseChartProps {
  data: RadarChartItem[];
  config: ChartConfig;
  dataKey?: string;
  axisKey?: string;
  color?: string;
  fillOpacity?: number;
  gridType?: "polygon" | "circle";
  series?: RadarSeries[];
  showLegend?: boolean;
}

export interface RadialChartItem {
  name: string;
  value: number;
  fill: string;
}

export interface RadialChartProps extends BaseChartProps {
  data: RadialChartItem[];
  config: ChartConfig;
  dataKey?: string;
  nameKey?: string;
  startAngle?: number;
  endAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  showLabels?: boolean;
  showBackground?: boolean;
}

export interface RadialGaugeProps extends BaseChartProps {
  data: RadialChartItem[];
  config: ChartConfig;
  dataKey?: string;
  centerValue?: string | number;
  centerLabel?: string;
  endAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
}

export interface RadialStackedSeries {
  dataKey: string;
  color: string;
}

export interface RadialStackedProps extends BaseChartProps {
  data: Record<string, unknown>[];
  config: ChartConfig;
  series: RadialStackedSeries[];
  centerValue?: string | number;
  centerLabel?: string;
  endAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  cornerRadius?: number;
}

export interface BarChartHorizontalProps extends BaseChartProps {
  data: Record<string, unknown>[];
  config: ChartConfig;
  dataKey?: string;
  nameKey?: string;
  barRadius?: number;
  tickFormatter?: (value: string) => string;
}

export interface BarChartMixedItem {
  name: string;
  value: number;
  fill: string;
}

export interface BarChartMixedProps extends BaseChartProps {
  data: BarChartMixedItem[];
  config: ChartConfig;
  dataKey?: string;
  nameKey?: string;
  barRadius?: number;
  tickFormatter?: (value: string) => string;
}

export interface BarChartInteractiveSeries {
  dataKey: string;
  label: string;
}

export interface BarChartInteractiveProps extends BaseChartProps {
  data: Record<string, unknown>[];
  config: ChartConfig;
  series: BarChartInteractiveSeries[];
  xAxisKey?: string;
  xAxisFormatter?: (value: string) => string;
  tooltipLabelFormatter?: (value: string) => string;
  tooltipNameKey?: string;
  height?: number;
  defaultActiveKey?: string;
}

