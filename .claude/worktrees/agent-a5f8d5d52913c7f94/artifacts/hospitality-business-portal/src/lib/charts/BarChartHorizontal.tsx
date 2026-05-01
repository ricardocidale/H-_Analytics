import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { BarChartHorizontalProps } from "./types";

export function BarChartHorizontal({
  data,
  config,
  dataKey = "value",
  nameKey = "name",
  barRadius = 5,
  tickFormatter,
  className,
}: BarChartHorizontalProps) {
  return (
    <ChartContainer config={config} className={className}>
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ left: -20 }}
      >
        <XAxis type="number" dataKey={dataKey} hide />
        <YAxis
          dataKey={nameKey}
          type="category"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          tickFormatter={tickFormatter}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel />}
        />
        <Bar dataKey={dataKey} fill={`var(--color-${dataKey})`} radius={barRadius} />
      </BarChart>
    </ChartContainer>
  );
}
