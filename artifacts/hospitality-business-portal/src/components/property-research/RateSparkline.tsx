import { ResponsiveContainer, AreaChart, Area, Tooltip } from "recharts";

interface SparklineProps {
  data: { date: string; value: number }[];
  color?: string;
  height?: number;
  showTooltip?: boolean;
}

export function RateSparkline({
  data,
  color = "hsl(var(--primary))",
  height = 40,
  showTooltip = true,
}: SparklineProps) {
  if (!data || data.length < 2) {
    return (
      <div
        data-testid="sparkline-empty"
        className="flex items-center justify-center text-[10px] text-muted-foreground"
        style={{ height }}
      >
        No history
      </div>
    );
  }

  const sampled = data.length > 60
    ? data.filter((_, i) => i % Math.ceil(data.length / 60) === 0 || i === data.length - 1)
    : data;

  return (
    <div data-testid="sparkline-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={sampled} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={`sparkGrad-${color.replace(/[^a-zA-Z0-9]/g, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#sparkGrad-${color.replace(/[^a-zA-Z0-9]/g, "")})`}
            dot={false}
            isAnimationActive={false}
          />
          {showTooltip && (
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;
                return (
                  <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-lg border border-primary/15 shadow-xl px-3 py-1.5 text-[10px]">
                    <p className="font-medium text-foreground">{p.date}</p>
                    <p className="text-muted-foreground">{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</p>
                  </div>
                );
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
