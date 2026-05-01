import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { BarChartProps } from "./types";

export function BarChartCard({
  data,
  config,
  dataKey = "value",
  nameKey = "name",
  layout = "vertical",
  showLabel = true,
  barRadius = 8,
  className,
}: BarChartProps) {
  if (layout === "horizontal") {
    return (
      <ChartContainer config={config} className={className}>
        <BarChart
          accessibilityLayer
          data={data}
          layout="horizontal"
          margin={{ top: 24 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis dataKey={nameKey} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis type="number" hide />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey={dataKey} radius={barRadius}>
            {showLabel && (
              <LabelList dataKey={dataKey} position="top" className="fill-foreground" fontSize={12} />
            )}
          </Bar>
        </BarChart>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer config={config} className={className}>
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ right: 24 }}
      >
        <CartesianGrid horizontal={false} />
        <YAxis dataKey={nameKey} type="category" tickLine={false} axisLine={false} tickMargin={8} width={100} />
        <XAxis type="number" hide />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey={dataKey} layout="vertical" radius={barRadius}>
          {showLabel && (
            <LabelList dataKey={dataKey} position="right" className="fill-foreground" fontSize={12} />
          )}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
