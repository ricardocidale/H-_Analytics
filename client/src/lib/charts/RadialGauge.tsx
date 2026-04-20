import {
  Label,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
} from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { RadialGaugeProps } from "./types";

export function RadialGauge({
  data,
  config,
  dataKey = "value",
  centerValue,
  centerLabel,
  endAngle = 100,
  innerRadius = 80,
  outerRadius = 140,
  className,
}: RadialGaugeProps) {
  const resolvedCenter =
    centerValue ?? (data.length > 0 ? data[0].value.toLocaleString() : "");

  return (
    <ChartContainer
      config={config}
      className={className ?? "mx-auto aspect-square max-h-[250px]"}
    >
      <RadialBarChart
        data={data}
        endAngle={endAngle}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
      >
        <PolarGrid
          gridType="circle"
          radialLines={false}
          stroke="none"
          className="first:fill-muted last:fill-background"
          polarRadius={[innerRadius + 6, innerRadius - 6]}
        />
        <RadialBar dataKey={dataKey} background />
        <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
          <Label
            content={({ viewBox }) => {
              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                return (
                  <text
                    x={viewBox.cx}
                    y={viewBox.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    <tspan
                      x={viewBox.cx}
                      y={viewBox.cy}
                      className="fill-foreground text-4xl font-bold"
                    >
                      {resolvedCenter}
                    </tspan>
                    {centerLabel && (
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) + 24}
                        className="fill-muted-foreground"
                      >
                        {centerLabel}
                      </tspan>
                    )}
                  </text>
                );
              }
            }}
          />
        </PolarRadiusAxis>
      </RadialBarChart>
    </ChartContainer>
  );
}
