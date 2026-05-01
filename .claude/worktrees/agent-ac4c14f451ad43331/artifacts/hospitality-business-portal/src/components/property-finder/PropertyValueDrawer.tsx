import { formatMoney } from "@/lib/financialEngine";
import { usePropertyValue } from "@/lib/api";
import type { PropertyValueHistory } from "@/lib/api/types";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconTrendingUp } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useId, useMemo } from "react";

interface Props {
  propertyId: string;
  address: string;
  onClose: () => void;
}

function hasUsableData(h: PropertyValueHistory): boolean {
  return h.currentEstimate != null || h.estimates.length > 0;
}

export function PropertyValueDrawer({ propertyId, address, onClose }: Props) {
  const { data: history, isLoading, error } = usePropertyValue(propertyId);
  const showEmpty = !isLoading && !error && (!history || !hasUsableData(history));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      data-testid="drawer-property-value"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card rounded-t-2xl sm:rounded-2xl shadow-xl border border-border max-h-[85vh] overflow-y-auto">
        <div className="h-1 bg-gradient-to-r from-primary via-primary/60 to-primary/30 rounded-t-2xl" />
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <IconTrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-bold text-foreground text-sm">Value History</h3>
                <p className="text-xs text-muted-foreground truncate max-w-[280px]">{address}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} data-testid="btn-close-value-drawer">
              <span className="text-lg leading-none">×</span>
            </Button>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">Unable to load value history</p>
              <p className="text-xs text-muted-foreground/60 mt-1">This property may not have Cotality estimates available.</p>
            </div>
          )}

          {showEmpty && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No value history available</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Cotality estimates not found for this property.</p>
            </div>
          )}

          {history && hasUsableData(history) && <ValueContent history={history} />}

          <div className="text-[10px] text-muted-foreground/60 text-right">
            Source: Cotality (CoreLogic) via US Real Estate API
          </div>
        </div>
      </div>
    </div>
  );
}

function ValueContent({ history }: { history: PropertyValueHistory }) {
  const chartData = useMemo(() => {
    const valid = [...history.estimates]
      .filter((e) => Number.isFinite(e.estimate))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (valid.length < 2) return null;

    const min = Math.min(...valid.map((e) => e.estimate));
    const max = Math.max(...valid.map((e) => e.estimate));
    const range = max - min || 1;

    return { sorted: valid, min, max, range };
  }, [history.estimates]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <ValueMetric
          label="Current Estimate"
          value={history.currentEstimate != null ? formatMoney(history.currentEstimate) : "—"}
          testId="text-current-estimate"
        />
        <ValueMetric
          label="12-Mo Change"
          value={history.appreciation12mo != null ? `${history.appreciation12mo > 0 ? "+" : ""}${history.appreciation12mo.toFixed(1)}%` : "—"}
          color={history.appreciation12mo != null ? (history.appreciation12mo >= 0 ? "text-emerald-600" : "text-red-500") : undefined}
          testId="text-appreciation-12mo"
        />
        <ValueMetric
          label="24-Mo Change"
          value={history.appreciation24mo != null ? `${history.appreciation24mo > 0 ? "+" : ""}${history.appreciation24mo.toFixed(1)}%` : "—"}
          color={history.appreciation24mo != null ? (history.appreciation24mo >= 0 ? "text-emerald-600" : "text-red-500") : undefined}
          testId="text-appreciation-24mo"
        />
      </div>

      {chartData && (
        <div className="bg-muted/30 rounded-xl p-4" data-testid="chart-value-history">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Estimated Value Trend
          </p>
          <MiniChart data={chartData.sorted} min={chartData.min} max={chartData.max} range={chartData.range} />
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>{formatDate(chartData.sorted[0].date)}</span>
            <span>{formatDate(chartData.sorted[chartData.sorted.length - 1].date)}</span>
          </div>
        </div>
      )}

      {history.estimates.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Recent Estimates
          </p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {history.estimates.slice(0, 12).map((est, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs bg-muted/30 rounded px-3 py-1.5"
                data-testid={`row-estimate-${i}`}
              >
                <span className="text-muted-foreground">{formatDate(est.date)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/60">{est.source}</span>
                  <span className="font-medium text-foreground">{formatMoney(est.estimate)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniChart({
  data,
  min,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  max,
  range,
}: {
  data: Array<{ date: string; estimate: number }>;
  min: number;
  max: number;
  range: number;
}) {
  const gradientId = useId().replace(/:/g, "_");
  const w = 400;
  const h = 100;
  const pad = 4;

  const points = data.map((d, i) => {
    const x = pad + ((w - 2 * pad) * i) / Math.max(data.length - 1, 1);
    const y = h - pad - ((h - 2 * pad) * (d.estimate - min)) / range;
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${h} L${points[0].x.toFixed(1)},${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3" fill="hsl(var(--primary))" />
    </svg>
  );
}

function ValueMetric({
  label,
  value,
  color,
  testId,
}: {
  label: string;
  value: string;
  color?: string;
  testId: string;
}) {
  return (
    <div className="bg-muted/30 rounded-md p-3 text-center">
      <div className={`text-base font-bold font-display ${color ?? "text-foreground"}`} data-testid={testId}>
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
