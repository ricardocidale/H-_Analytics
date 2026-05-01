/**
 * CashFlowRiver.tsx — Stacked area chart for visualizing cash flow over time.
 *
 * Renders multiple data series as stacked/layered areas (the "river" metaphor).
 * Commonly used to show revenue streams, expense categories, or cumulative
 * cash flows across projection years. Each series can have a custom color
 * or defaults to the platform palette.
 */
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CHART_COLORS, formatCompact } from "../formatters";
import { motion } from "framer-motion";

export interface RiverSeries {
  dataKey: string;
  name: string;
  color?: string;
}

interface CashFlowRiverProps {
  data: Record<string, unknown>[];
  series: RiverSeries[];
  title?: string;
  subtitle?: string;
  xAxisKey?: string;
  height?: number;
  stacked?: boolean;
  formatValue?: (v: number) => string;
  className?: string;
  "data-testid"?: string;
}

function CustomTooltip({ active, payload, label, formatValue }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>; label?: string; formatValue: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-xl text-sm max-w-xs">
      <p className="font-semibold text-foreground mb-2 border-b pb-1">{label}</p>
      {payload.map((entry, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
          </span>
          <span className="font-mono font-medium text-foreground">{formatValue(entry.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export function CashFlowRiver({ data, series, title, subtitle, xAxisKey = "year", height = 320, stacked = true, formatValue, className, ...props }: CashFlowRiverProps) {
  const fmt = formatValue || formatCompact;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm ${className || ""}`}
      data-testid={props["data-testid"]}
    >
      {title && <h3 className="text-lg font-display text-foreground mb-1">{title}</h3>}
      {subtitle && <p className="text-sm text-muted-foreground mb-4 label-text">{subtitle}</p>}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              {series.map((s, i) => {
                const color = s.color || CHART_COLORS.palette[i % CHART_COLORS.palette.length];
                return (
                  <linearGradient key={s.dataKey} id={`river-${s.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.05} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridStroke} vertical={false} />
            <XAxis dataKey={xAxisKey} stroke={CHART_COLORS.axisStroke} fontSize={12} tickLine={false} axisLine={{ stroke: CHART_COLORS.gridStroke }} />
            <YAxis stroke={CHART_COLORS.axisStroke} fontSize={12} tickLine={false} axisLine={{ stroke: CHART_COLORS.gridStroke }} tickFormatter={fmt} />
            <Tooltip content={<CustomTooltip formatValue={fmt} />} />
            <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
            {series.map((s, i) => {
              const color = s.color || CHART_COLORS.palette[i % CHART_COLORS.palette.length];
              return (
                <Area
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey}
                  name={s.name}
                  stackId={stacked ? "stack" : undefined}
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#river-${s.dataKey})`}
                  animationBegin={i * 100}
                  animationDuration={1000}
                  animationEasing="ease-out"
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
