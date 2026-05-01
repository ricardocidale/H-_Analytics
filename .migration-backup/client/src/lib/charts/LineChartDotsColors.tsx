import { CartesianGrid, Dot, Line, LineChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { LineChartDotsColorsProps } from "./types";

export function LineChartDotsColors({
  data,
  config,
  valueKey = "value",
  nameKey = "name",
  strokeColor,
  className,
}: LineChartDotsColorsProps) {
  const resolvedStroke = strokeColor ?? `var(--color-${valueKey})`;

  return (
    <ChartContainer config={config} className={className}>
      <LineChart
        accessibilityLayer
        data={data}
        margin={{ top: 24, left: 24, right: 24 }}
      >
        <CartesianGrid vertical={false} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="line"
              nameKey={valueKey}
              hideLabel
            />
          }
        />
        <Line
          dataKey={valueKey}
          type="natural"
          stroke={resolvedStroke}
          strokeWidth={2}
          dot={({ payload, ...props }) => (
            <Dot
              key={payload[nameKey]}
              r={5}
              cx={props.cx}
              cy={props.cy}
              fill={payload.fill}
              stroke={payload.fill}
            />
          )}
        />
      </LineChart>
    </ChartContainer>
  );
}
