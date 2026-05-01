import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { BarChartMixedProps } from "./types";

export function BarChartMixed({
  data,
  config,
  dataKey = "value",
  nameKey = "name",
  barRadius = 5,
  tickFormatter,
  className,
}: BarChartMixedProps) {
  const resolvedTickFormatter =
    tickFormatter ||
    ((value: string) => config[value as keyof typeof config]?.label as string ?? value);

  return (
    <ChartContainer config={config} className={className}>
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ left: 0 }}
      >
        <YAxis
          dataKey={nameKey}
          type="category"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          tickFormatter={resolvedTickFormatter}
        />
        <XAxis dataKey={dataKey} type="number" hide />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel />}
        />
        <Bar dataKey={dataKey} layout="vertical" radius={barRadius} />
      </BarChart>
    </ChartContainer>
  );
}
