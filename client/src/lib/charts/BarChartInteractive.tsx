import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { BarChartInteractiveProps } from "./types";

export function BarChartInteractive({
  data,
  config,
  series,
  xAxisKey = "date",
  xAxisFormatter,
  tooltipLabelFormatter,
  tooltipNameKey,
  height = 250,
  defaultActiveKey,
  className,
}: BarChartInteractiveProps) {
  const [activeChart, setActiveChart] = useState(defaultActiveKey || series[0]?.dataKey || "");

  const totals = useMemo(() => {
    const result: Record<string, number> = {};
    for (const s of series) {
      result[s.dataKey] = data.reduce(
        (acc, curr) => acc + (Number(curr[s.dataKey]) || 0),
        0
      );
    }
    return result;
  }, [data, series]);

  return (
    <div className={className}>
      <div className="flex flex-col items-stretch border-b sm:flex-row">
        <div className="flex">
          {series.map((s) => (
            <Button
              key={s.dataKey}
              variant="ghost"
              data-active={activeChart === s.dataKey}
              data-testid={`chart-toggle-${s.dataKey}`}
              className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-6 h-auto rounded-none"
              onClick={() => setActiveChart(s.dataKey)}
            >
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className="text-lg leading-none font-bold sm:text-3xl">
                {totals[s.dataKey]?.toLocaleString("en-US")}
              </span>
            </Button>
          ))}
        </div>
      </div>
      <div className="px-2 pt-4 sm:p-6">
        <ChartContainer config={config} className={`aspect-auto w-full`} style={{ height }}>
          <BarChart
            accessibilityLayer
            data={data}
            margin={{ left: 12, right: 12 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey={xAxisKey}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={xAxisFormatter}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  className="w-[150px]"
                  nameKey={tooltipNameKey}
                  labelFormatter={tooltipLabelFormatter}
                />
              }
            />
            <Bar dataKey={activeChart} fill={`var(--color-${activeChart})`} />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
