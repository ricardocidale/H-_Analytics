import * as React from "react";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatMoney } from "@/lib/financialEngine";

export interface ChartSeries {
  dataKey: string;
  name?: string;
  color: string;
  gradientTo?: string;
}

const PRESET_SERIES: Record<string, ChartSeries> = {
  revenue: { dataKey: "Revenue", name: "Revenue — Total Revenue", color: "hsl(var(--line-1))" },
  gop: { dataKey: "GOP", name: "GOP — Gross Operating Profit", color: "hsl(var(--line-2))" },
  agop: { dataKey: "AGOP", name: "AGOP — Adjusted Gross Operating Profit", color: "hsl(var(--line-3))" },
  noi: { dataKey: "NOI", name: "NOI — Net Operating Income", color: "hsl(var(--line-4))" },
  anoi: { dataKey: "ANOI", name: "ANOI — Adjusted Net Operating Income", color: "hsl(var(--line-5))" },
  expenses: { dataKey: "Expenses", name: "Expenses — Total Expenses", color: "hsl(var(--line-2))" },
  operatingIncome: { dataKey: "OperatingIncome", name: "EBITDA — Operating Income", color: "hsl(var(--line-3))" },
  netIncome: { dataKey: "NetIncome", name: "Net Income", color: "hsl(var(--line-5))" },
  cashFlow: { dataKey: "CashFlow", name: "Cash Flow — After Debt Service", color: "hsl(var(--line-3))" },
  endingCash: { dataKey: "EndingCash", name: "Ending Cash Position", color: "hsl(var(--line-4))" },
  fcfe: { dataKey: "FCFE", name: "FCFE — Free Cash Flow to Equity", color: "hsl(var(--line-5))" },
  btcf: { dataKey: "BTCF", name: "BTCF — Before-Tax Cash Flow", color: "hsl(var(--line-2))" },
  atcf: { dataKey: "ATCF", name: "ATCF — After-Tax Cash Flow", color: "hsl(var(--line-5))" },
  baseFees: { dataKey: "BaseFees", name: "Service Fees — Base Management Fees", color: "hsl(var(--line-2))" },
  incentiveFees: { dataKey: "IncentiveFees", name: "Incentive Fees — Performance-Based Fees", color: "hsl(var(--line-3))" },
  funding: { dataKey: "Funding", name: "Funding Received — Capital Raise", color: "hsl(var(--line-2))" },
};

export interface FinancialChartProps {
  data: Record<string, unknown>[];
  series: (ChartSeries | string)[];
  title?: string;
  subtitle?: string;
  height?: number;
  xAxisKey?: string;
  yAxisFormatter?: (value: number) => string;
  tooltipFormatter?: (value: number) => string;
  className?: string;
  chartRef?: React.Ref<HTMLDivElement>;
  id?: string;
}

function defaultYFormatter(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function FinancialChart({
  data,
  series,
  title,
  subtitle,
  height = 300,
  xAxisKey = "year",
  yAxisFormatter = defaultYFormatter,
  tooltipFormatter,
  className,
  chartRef,
}: FinancialChartProps) {
  const resolvedSeries = series.map((s) => {
    if (typeof s === "string") {
      return PRESET_SERIES[s] || { dataKey: s, color: "hsl(var(--muted-foreground))" };
    }
    return s;
  });

  return (
    <div
      ref={chartRef}
      className={cn(
        "rounded-lg p-5 bg-card border border-border shadow-sm",
        className
      )}
    >
      {title && (
        <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      )}
      {subtitle && (
        <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>
      )}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey={xAxisKey}
              stroke="hsl(var(--foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              stroke="hsl(var(--foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={yAxisFormatter}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                fontSize: "13px",
                color: "hsl(var(--foreground))",
              }}
              labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600, fontSize: "13px" }}
              formatter={(value: number, name: string) => [
                tooltipFormatter ? tooltipFormatter(value) : formatMoney(value),
                name,
              ]}
            />
            <Legend wrapperStyle={{ color: "hsl(var(--muted-foreground))", fontSize: "12px" }} iconType="circle" />
            {resolvedSeries.map((s) => (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                stroke={s.color}
                strokeWidth={2}
                name={s.name || s.dataKey}
                dot={{ fill: s.color, stroke: "hsl(var(--card))", strokeWidth: 2, r: 3.5 }}
                activeDot={{ r: 5.5, fill: s.color, stroke: "hsl(var(--card))", strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export { FinancialChart, PRESET_SERIES };
