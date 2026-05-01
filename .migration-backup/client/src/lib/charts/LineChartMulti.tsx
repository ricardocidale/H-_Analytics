import { CartesianGrid, Line, LineChart, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { LineChartMultiProps } from "./types";

export function LineChartMulti({
  data,
  config,
  series,
  xAxisKey = "name",
  xAxisFormatter,
  className,
}: LineChartMultiProps) {
  const defaultFormatter = (value: string) => value.slice(0, 3);

  return (
    <ChartContainer config={config} className={className}>
      <LineChart
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
          tickFormatter={xAxisFormatter ?? defaultFormatter}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel />}
        />
        {series.map((s) => (
          <Line
            key={s.dataKey}
            dataKey={s.dataKey}
            type="natural"
            stroke={s.color}
            strokeWidth={2}
            dot={{ fill: s.color, r: 4, strokeWidth: 2, stroke: s.color }}
            activeDot={{ r: 6, strokeWidth: 2 }}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
