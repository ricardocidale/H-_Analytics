/**
 * RadarChart.tsx — Multi-axis radar (spider) chart for property comparison.
 *
 * Plots multiple properties on a shared set of dimensions (e.g. ADR,
 * Occupancy, RevPAR, NOI margin, Room Count) so the user can visually
 * compare strengths and weaknesses across the portfolio. Values are
 * normalized to the max within each dimension so all axes share the
 * same 0-100% scale.
 */
import {
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { CHART_COLORS } from "../graphics/formatters";

interface RadarChartProps {
  properties: { name: string; metrics: Record<string, number> }[];
  dimensions: string[];
  title?: string;
}

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

export default function RadarChart({ properties, dimensions, title }: RadarChartProps) {
  const maxPerDimension: Record<string, number> = {};
  for (const dim of dimensions) {
    let max = 0;
    for (const prop of properties) {
      const val = prop.metrics[dim] ?? 0;
      if (val > max) max = val;
    }
    maxPerDimension[dim] = max || 1;
  }

  const data = dimensions.map((dim) => {
    const point: Record<string, string | number> = { dimension: dim };
    for (const prop of properties) {
      const raw = prop.metrics[dim] ?? 0;
      point[prop.name] = Math.round((raw / maxPerDimension[dim]) * 100);
    }
    return point;
  });

  return (
    <div
      data-testid="radar-chart"
      className="bg-card rounded-xl border border-border shadow-sm p-6"
    >
      {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
      <ResponsiveContainer width="100%" height={400}>
        <RechartsRadarChart data={data}>
          <PolarGrid stroke={CHART_COLORS.gridStroke} />
          <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12 }} />
          <PolarRadiusAxis tick={false} />
          <Tooltip />
          {properties.map((prop, i) => (
            <Radar
              key={prop.name}
              name={prop.name}
              dataKey={prop.name}
              stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
          <Legend
            verticalAlign="bottom"
            wrapperStyle={{ fontSize: 12 }}
          />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
}
