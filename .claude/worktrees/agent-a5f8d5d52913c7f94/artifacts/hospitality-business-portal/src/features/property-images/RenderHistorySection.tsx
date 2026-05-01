import { useState } from "react";
import { ChevronDown, ChevronRight, History, Loader2, AlertCircle, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usePropertyRenderHistory, type SpecialistRenderCall } from "@/lib/api";

interface RenderHistorySectionProps {
  propertyId: number;
  className?: string;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatExactTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function styleLabel(call: SpecialistRenderCall): string {
  const meta = (call.metadata ?? {}) as Record<string, unknown>;
  const style = typeof meta.style === "string" ? meta.style : null;
  if (style && style.length > 0) return style;
  if (call.modelPrimary) return call.modelPrimary;
  return "—";
}

function originLabel(call: SpecialistRenderCall): string {
  const meta = (call.metadata ?? {}) as Record<string, unknown>;
  const origin = typeof meta.originatedFrom === "string" ? meta.originatedFrom : null;
  switch (origin) {
    case "album": return "Album";
    case "specialist-page": return "Specialist page";
    case "legacy": return "Legacy";
    default: return "—";
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <Badge variant="outline" className="h-5 gap-1 text-[10px] font-medium text-emerald-700 border-emerald-200 bg-emerald-50 dark:text-emerald-300 dark:border-emerald-900 dark:bg-emerald-950/40">
        <CheckCircle2 className="w-3 h-3" />
        Completed
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="h-5 gap-1 text-[10px] font-medium text-red-700 border-red-200 bg-red-50 dark:text-red-300 dark:border-red-900 dark:bg-red-950/40">
        <XCircle className="w-3 h-3" />
        Failed
      </Badge>
    );
  }
  if (status === "running" || status === "pending") {
    return (
      <Badge variant="outline" className="h-5 gap-1 text-[10px] font-medium text-amber-700 border-amber-200 bg-amber-50 dark:text-amber-300 dark:border-amber-900 dark:bg-amber-950/40">
        <Loader2 className="w-3 h-3 animate-spin" />
        {status === "running" ? "Running" : "Pending"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="h-5 text-[10px] font-medium">
      {status}
    </Badge>
  );
}

export function RenderHistorySection({ propertyId, className }: RenderHistorySectionProps) {
  const [open, setOpen] = useState(false);
  const { data: runs = [], isLoading, isFetching, error, refetch } = usePropertyRenderHistory(propertyId, open);

  return (
    <div className={cn("rounded-lg border border-border bg-card/40", className)} data-testid="section-render-history">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        data-testid="button-toggle-render-history"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <History className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Render history</span>
          {open && runs.length > 0 && (
            <span className="text-xs text-muted-foreground" data-testid="text-render-count">
              ({runs.length})
            </span>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {open ? "Hide" : "Show AI runs for this property"}
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2 space-y-2" data-testid="render-history-body">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Most recent Photos &amp; Renders specialist runs scoped to this property.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] gap-1"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-render-history"
            >
              <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground" data-testid="state-render-history-loading">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading render history…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 py-3 text-xs text-red-600" data-testid="state-render-history-error">
              <AlertCircle className="w-3.5 h-3.5" />
              {error instanceof Error ? error.message : "Failed to load render history"}
            </div>
          ) : runs.length === 0 ? (
            <div className="py-3 text-xs text-muted-foreground" data-testid="state-render-history-empty">
              No render jobs have been logged for this property yet.
            </div>
          ) : (
            <ul className="divide-y divide-border" data-testid="list-render-history">
              {runs.map((call) => (
                <li
                  key={call.id}
                  className="py-2 flex flex-col gap-1"
                  data-testid={`row-render-${call.id}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={call.status} />
                      <span className="text-xs font-medium text-foreground" data-testid={`text-render-style-${call.id}`}>
                        {styleLabel(call)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        from <span data-testid={`text-render-origin-${call.id}`}>{originLabel(call)}</span>
                      </span>
                    </div>
                    <span
                      className="text-[11px] text-muted-foreground tabular-nums"
                      title={formatExactTime(call.startedAt)}
                      data-testid={`text-render-when-${call.id}`}
                    >
                      {relativeTime(call.startedAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground flex-wrap">
                    <span data-testid={`text-render-by-${call.id}`}>
                      by {call.triggeredBy?.name ?? "Unknown"}
                    </span>
                    {typeof call.durationMs === "number" && (
                      <span className="tabular-nums">{(call.durationMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                  {call.status === "failed" && call.error && (
                    <p className="text-[11px] text-red-600 line-clamp-2" data-testid={`text-render-error-${call.id}`}>
                      {call.error}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
