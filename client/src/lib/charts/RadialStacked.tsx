import { Label, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { RadialStackedProps } from "./types";

export function RadialStacked({
  data,
  config,
  series,
  centerValue,
  centerLabel,
  endAngle = 180,
  innerRadius = 80,
  outerRadius = 130,
  cornerRadius = 5,
  className,
}: RadialStackedProps) {
  const resolvedCenter =
    centerValue ??
    (data.length > 0
      ? series
          .reduce((sum, s) => {
            const v = Number(data[0][s.dataKey]);
            return sum + (Number.isFinite(v) ? v : 0);
          }, 0)
          .toLocaleString()
      : "");

  return (
    <ChartContainer
      config={config}
      className={className ?? "mx-auto aspect-square w-full max-w-[250px]"}
    >
      <RadialBarChart
        data={data}
        endAngle={endAngle}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
      >
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel />}
        />
        <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
          <Label
            content={({ viewBox }) => {
              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                    <tspan
                      x={viewBox.cx}
                      y={(viewBox.cy ?? 0) - 16}
                      className="fill-foreground text-2xl font-bold"
                    >
                      {resolvedCenter}
                    </tspan>
                    {centerLabel && (
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) + 4}
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
        {series.map((s) => (
          <RadialBar
            key={s.dataKey}
            dataKey={s.dataKey}
            stackId="a"
            cornerRadius={cornerRadius}
            fill={s.color}
            className="stroke-transparent stroke-2"
          />
        ))}
      </RadialBarChart>
    </ChartContainer>
  );
}
