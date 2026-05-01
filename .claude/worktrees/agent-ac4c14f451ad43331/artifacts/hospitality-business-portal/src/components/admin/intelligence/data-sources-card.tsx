import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { IconSettingsGear, IconTrash, IconCheckCircle, IconXCircle, IconAlertTriangle } from "@/components/icons";
import type { SourceEntry, TestResult } from "./data-sources-types";
import { getStatus, formatLatency, formatRelativeTime } from "./data-sources-types";

export function StatusBadge({ status }: { status: "healthy" | "degraded" | "error" | "inactive" }) {
  const config = {
    healthy: { label: "Healthy", className: "border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-950/30" },
    degraded: { label: "Degraded", className: "border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:bg-amber-950/30" },
    error: { label: "Unreliable", className: "border-red-300 text-red-700 bg-red-50 dark:border-red-700 dark:text-red-400 dark:bg-red-950/30" },
    inactive: { label: "Inactive", className: "border-gray-300 text-gray-500 bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:bg-gray-900/30" },
  };
  const c = config[status];
  return <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", c.className)}>{c.label}</Badge>;
}

export function HealthBadge({ successRate }: { successRate: number | null }) {
  if (successRate === null) return null;
  if (successRate >= 90) return null;
  if (successRate < 80) {
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-300 text-red-700 bg-red-50 dark:border-red-700 dark:text-red-400 dark:bg-red-950/30">
      <IconAlertTriangle className="w-2.5 h-2.5 mr-0.5" /> Unreliable
    </Badge>;
  }
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:bg-amber-950/30">
    <IconAlertTriangle className="w-2.5 h-2.5 mr-0.5" /> Warning
  </Badge>;
}

export function DataSourceCard({
  source,
  onToggle,
  onConfigure,
  onDelete,
  onTest,
  onLogs,
  testResult,
  isTesting,
}: {
  source: SourceEntry;
  onToggle: (id: number, isActive: boolean) => void;
  onConfigure: (source: SourceEntry) => void;
  onDelete: (source: SourceEntry) => void;
  onTest: (source: SourceEntry) => void;
  onLogs: (source: SourceEntry) => void;
  testResult: TestResult | null;
  isTesting: boolean;
}) {
  const status = getStatus(source);

  return (
    <Card
      data-testid={`data-source-card-${source.serviceKey}`}
      className={cn(
        "transition-all duration-200 hover:shadow-md",
        !source.isActive && "opacity-60"
      )}
    >
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className="text-sm font-semibold text-foreground truncate">{source.name}</h4>
              <StatusBadge status={status} />
              <HealthBadge successRate={source.isActive ? source.successRate : null} />
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">{source.description ?? source.sourceType}</p>
          </div>
          <Switch
            checked={source.isActive}
            onCheckedChange={(checked) => onToggle(source.id, checked)}
            data-testid={`toggle-${source.serviceKey}`}
            className="ml-2 shrink-0"
          />
        </div>

        {source.isActive && (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
              {source.lastHealthCheck && (
                <div>
                  <span className="text-muted-foreground">Last Check</span>
                  <p className="font-medium text-foreground">{formatRelativeTime(source.lastHealthCheck)}</p>
                </div>
              )}
              {source.successRate !== null && (
                <div>
                  <span className="text-muted-foreground">Success Rate</span>
                  <p className={cn(
                    "font-medium",
                    source.successRate >= 95 ? "text-emerald-600" : source.successRate >= 90 ? "text-amber-600" : "text-red-600"
                  )}>{source.successRate}%</p>
                </div>
              )}
              {source.avgLatencyMs !== null && (
                <div>
                  <span className="text-muted-foreground">Avg Latency</span>
                  <p className="font-medium text-foreground">{formatLatency(source.avgLatencyMs)}</p>
                </div>
              )}
              {source.costPerCall && (
                <div>
                  <span className="text-muted-foreground">Cost/Call</span>
                  <p className="font-medium text-foreground">{source.costPerCall}</p>
                </div>
              )}
            </div>

            {source.dataProvided && source.dataProvided.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {source.dataProvided.map((d) => (
                  <Badge key={d} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">{d}</Badge>
                ))}
              </div>
            )}

            {testResult && (
              <div className={cn(
                "flex items-center gap-2 text-xs px-2 py-1.5 rounded-md mb-3",
                testResult.healthy
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                  : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
              )} data-testid={`test-result-${source.serviceKey}`}>
                {testResult.healthy
                  ? <><IconCheckCircle className="w-3.5 h-3.5" /> Connected — {testResult.latencyMs}ms</>
                  : <><IconXCircle className="w-3.5 h-3.5" /> Failed — {testResult.error ?? "Unknown error"}</>
                }
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/60">
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" data-testid={`configure-${source.serviceKey}`} onClick={() => onConfigure(source)}>
            <IconSettingsGear className="w-3 h-3 mr-1" />
            Configure
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" data-testid={`test-${source.serviceKey}`} onClick={() => onTest(source)} disabled={isTesting}>
            {isTesting ? "Testing…" : "Test"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" data-testid={`logs-${source.serviceKey}`} onClick={() => onLogs(source)}>
            Logs
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-destructive hover:text-destructive" data-testid={`delete-${source.serviceKey}`} onClick={() => onDelete(source)}>
            <IconTrash className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
