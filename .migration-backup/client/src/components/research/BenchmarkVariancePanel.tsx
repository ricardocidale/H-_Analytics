import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Diamond } from "lucide-react";

interface BenchmarkMetric {
  key: string;
  label: string;
  value: number | null;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  format: "percent" | "dollar" | "ratio";
  commentary?: string;
}

interface BenchmarkVariancePanelProps {
  metrics: BenchmarkMetric[];
  entityLabel?: string;
  className?: string;
  defaultOpen?: boolean;
  "data-testid"?: string;
}

function formatMetricValue(value: number | null, format: BenchmarkMetric["format"]): string {
  if (value == null) return "—";
  switch (format) {
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
    case "dollar":
      return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    case "ratio":
      return value.toFixed(2) + "x";
  }
}

function getPercentilePosition(value: number, p10: number, p90: number): number {
  if (p90 === p10) return 50;
  return Math.max(0, Math.min(100, ((value - p10) / (p90 - p10)) * 100));
}

function getPercentileColor(value: number, p25: number, p50: number): string {
  if (value >= p50) return "text-green-600 dark:text-green-400";
  if (value >= p25) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function _getBarColor(value: number, p25: number, p50: number): string {
  if (value >= p50) return "bg-green-500/20";
  if (value >= p25) return "bg-amber-500/20";
  return "bg-red-500/20";
}

function BenchmarkVariancePanel({
  metrics,
  entityLabel,
  className,
  defaultOpen = false,
  ...props
}: BenchmarkVariancePanelProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  if (!metrics.length) return null;

  return (
    <div
      className={cn("rounded-lg border border-border bg-card shadow-sm overflow-hidden", className)}
      data-testid={props["data-testid"] ?? "benchmark-variance-panel"}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-accent/30 transition-colors"
        data-testid="toggle-benchmark-panel"
      >
        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <span className="text-sm font-semibold text-foreground">Benchmark Positioning</span>
        {entityLabel && <span className="text-xs text-muted-foreground ml-1">— {entityLabel}</span>}
        <span className="text-[10px] text-muted-foreground ml-auto">{metrics.length} metrics</span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3" data-testid="benchmark-metrics-list">
          {metrics.map((metric) => (
            <PercentileBar key={metric.key} metric={metric} />
          ))}
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1 border-t border-border/50">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Above P50</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> P25–P50</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Below P25</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PercentileBar({ metric }: { metric: BenchmarkMetric }) {
  const { value, p10, p25, p50, p75, p90, format, label, commentary } = metric;
  const hasValue = value != null;
  const position = hasValue ? getPercentilePosition(value, p10, p90) : null;
  const p25Pos = getPercentilePosition(p25, p10, p90);
  const p50Pos = getPercentilePosition(p50, p10, p90);
  const p75Pos = getPercentilePosition(p75, p10, p90);

  return (
    <div data-testid={`benchmark-metric-${metric.key}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {hasValue && (
          <span className={cn("text-xs font-mono font-semibold", getPercentileColor(value, p25, p50))}>
            {formatMetricValue(value, format)}
          </span>
        )}
      </div>
      <div className="relative h-5 rounded-full bg-gradient-to-r from-red-500/10 via-amber-500/10 to-green-500/10 border border-border/40">
        <div className="absolute top-0 bottom-0 w-px bg-border/60" style={{ left: `${p25Pos}%` }} title={`P25: ${formatMetricValue(p25, format)}`} />
        <div className="absolute top-0 bottom-0 w-px bg-border/80" style={{ left: `${p50Pos}%` }} title={`P50: ${formatMetricValue(p50, format)}`} />
        <div className="absolute top-0 bottom-0 w-px bg-border/60" style={{ left: `${p75Pos}%` }} title={`P75: ${formatMetricValue(p75, format)}`} />

        <span className="absolute -top-3 text-[8px] text-muted-foreground/60" style={{ left: `${p25Pos}%`, transform: "translateX(-50%)" }}>P25</span>
        <span className="absolute -top-3 text-[8px] text-muted-foreground/80 font-medium" style={{ left: `${p50Pos}%`, transform: "translateX(-50%)" }}>P50</span>
        <span className="absolute -top-3 text-[8px] text-muted-foreground/60" style={{ left: `${p75Pos}%`, transform: "translateX(-50%)" }}>P75</span>

        {position != null && (
          <div
            className={cn("absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10", getPercentileColor(value!, p25, p50))}
            style={{ left: `${position}%` }}
            title={formatMetricValue(value, format)}
            data-testid="benchmark-marker"
          >
            <Diamond className="h-3.5 w-3.5 fill-current" />
          </div>
        )}
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px] text-muted-foreground/50">{formatMetricValue(p10, format)}</span>
        <span className="text-[9px] text-muted-foreground/50">{formatMetricValue(p90, format)}</span>
      </div>
      {commentary && (
        <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic">{commentary}</p>
      )}
    </div>
  );
}

BenchmarkVariancePanel.displayName = "BenchmarkVariancePanel";

export { BenchmarkVariancePanel };
export type { BenchmarkVariancePanelProps, BenchmarkMetric };
