import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { RadarChartDotsProps } from "./types";

export function RadarChartDots({
  data,
  config,
  dataKey = "value",
  axisKey = "axis",
  color,
  fillOpacity = 0.6,
  gridType = "polygon",
  series,
  showLegend = false,
  className,
}: RadarChartDotsProps) {
  const resolvedColor = color ?? `var(--color-${dataKey})`;
  const margins = showLegend ? { top: -40, bottom: -10 } : undefined;

  return (
    <ChartContainer
      config={config}
      className={className ?? "mx-auto aspect-square max-h-[250px]"}
    >
      <RadarChart data={data} margin={margins}>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent indicator={showLegend ? "line" : undefined} />}
        />
        <PolarAngleAxis dataKey={axisKey} />
        <PolarGrid gridType={gridType} />
        {series ? (
          series.map((s) => (
            <Radar
              key={s.dataKey}
              dataKey={s.dataKey}
              fill={s.color}
              fillOpacity={s.fillOpacity ?? 0.6}
              dot={s.showDots !== false ? { r: 4, fillOpacity: 1 } : undefined}
            />
          ))
        ) : (
          <Radar
            dataKey={dataKey}
            fill={resolvedColor}
            fillOpacity={fillOpacity}
            dot={{ r: 4, fillOpacity: 1 }}
          />
        )}
        {showLegend && (
          <ChartLegend className="mt-8" content={<ChartLegendContent />} />
        )}
      </RadarChart>
    </ChartContainer>
  );
}
