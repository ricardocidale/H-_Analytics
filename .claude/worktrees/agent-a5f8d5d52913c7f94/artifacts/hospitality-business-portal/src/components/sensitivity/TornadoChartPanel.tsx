import { IconBarChart3 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { TornadoItem } from "./types";

interface TornadoChartPanelProps {
  tornadoData: TornadoItem[];
  tornadoMetric: "noi" | "irr";
  onMetricChange: (metric: "noi" | "irr") => void;
}

const tornadoConfig = {
  positive: {
    label: "Upside",
    color: "hsl(var(--chart-3))",
  },
  negative: {
    label: "Downside",
    color: "hsl(var(--destructive))",
  },
} satisfies ChartConfig;

export function TornadoChartPanel({ tornadoData, tornadoMetric, onMetricChange }: TornadoChartPanelProps) {
  return (
    <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <IconBarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground" data-testid="text-tornado-title">
              Sensitivity Impact
            </h3>
            <p className="text-xs text-muted-foreground">
              {tornadoMetric === "irr"
                ? "Impact on Levered IRR (percentage points)"
                : "Impact on Adjusted NOI (percentage change)"}
            </p>
          </div>
        </div>
        
        <div className="flex bg-muted/50 p-1 rounded-lg border border-border self-start sm:self-center">
          <Button
            variant={tornadoMetric === "irr" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onMetricChange("irr")}
            className={`px-3 py-1.5 text-xs font-semibold ${
              tornadoMetric === "irr" 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="button-tornado-irr"
          >
            IRR
          </Button>
          <Button
            variant={tornadoMetric === "noi" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onMetricChange("noi")}
            className={`px-3 py-1.5 text-xs font-semibold ${
              tornadoMetric === "noi" 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="button-tornado-noi"
          >
            NOI
          </Button>
        </div>
      </div>

      <div className="relative">
        {tornadoData.length > 0 ? (
          <ChartContainer config={tornadoConfig} className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={tornadoData}
                layout="vertical"
                margin={{ top: 5, right: 40, left: 10, bottom: 5 }}
                barGap={0}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                  tickFormatter={(val) => `${val > 0 ? "+" : ""}${val.toFixed(1)}${tornadoMetric === "irr" ? "pp" : "%"}`}
                  domain={["auto", "auto"]}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={140}
                  tick={{ fontSize: 12, fontWeight: 500, fill: "hsl(var(--foreground))" }}
                />
                <ChartTooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.2 }}
                  content={<ChartTooltipContent
                    formatter={(value, name) => [
                      `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}${tornadoMetric === "irr" ? "pp" : "%"}`,
                      name === "positive" ? "Upside" : "Downside",
                    ]}
                  />}
                />
                <ReferenceLine x={0} stroke="hsl(var(--foreground))" strokeWidth={1} strokeOpacity={0.2} />
                <Bar 
                  dataKey="positive" 
                  stackId="tornado" 
                  radius={[0, 4, 4, 0]} 
                  maxBarSize={24}
                >
                  {tornadoData.map((_, i) => (
                    <Cell key={`pos-${i}`} fill="hsl(var(--chart-3))" fillOpacity={0.9} />
                  ))}
                </Bar>
                <Bar 
                  dataKey="negative" 
                  stackId="tornado" 
                  radius={[4, 0, 0, 4]} 
                  maxBarSize={24}
                >
                  {tornadoData.map((_, i) => (
                    <Cell key={`neg-${i}`} fill="hsl(var(--destructive))" fillOpacity={0.9} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        ) : (
          <div className="h-[400px] flex items-center justify-center border border-dashed border-border rounded-xl bg-muted/20 text-muted-foreground text-sm">
            No sensitivity data available
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-8 mt-8 py-3 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[hsl(var(--chart-3))]" />
          <span className="text-[11px] font-medium text-muted-foreground">Upside Impact</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[hsl(var(--destructive))]" />
          <span className="text-[11px] font-medium text-muted-foreground">Downside Impact</span>
        </div>
      </div>
    </div>
  );
}
