import { LabelList, RadialBar, RadialBarChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { RadialChartProps } from "./types";

export function RadialChart({
  data,
  config,
  dataKey = "value",
  nameKey = "name",
  startAngle = -90,
  endAngle = 380,
  innerRadius = 30,
  outerRadius = 110,
  showLabels = true,
  showBackground = true,
  className,
}: RadialChartProps) {
  return (
    <ChartContainer
      config={config}
      className={className ?? "mx-auto aspect-square max-h-[250px]"}
    >
      <RadialBarChart
        data={data}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
      >
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel nameKey={nameKey} />}
        />
        <RadialBar dataKey={dataKey} background={showBackground}>
          {showLabels && (
            <LabelList
              position="insideStart"
              dataKey={nameKey}
              className="fill-white capitalize mix-blend-luminosity"
              fontSize={11}
            />
          )}
        </RadialBar>
      </RadialBarChart>
    </ChartContainer>
  );
}
