import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { IconAlertTriangle } from "@/components/icons";

interface SchedulerRunRow {
  schedulerKey: string;
  schedulerLabel: string;
  lastRunAt: string | null;
  considered: number | null;
  succeeded: number | null;
  failed: number | null;
  status: "ok" | "warn" | "error" | null;
  notes: string | null;
  cycleIntervalMs: number;
  durationMs: number | null;
  isStale: boolean;
}

interface SchedulerRunsResponse {
  runs: SchedulerRunRow[];
  staleMultiplier: number;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function formatInterval(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 60 * 60_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 24 * 60 * 60_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

function statusVariant(status: SchedulerRunRow["status"]): "default" | "secondary" | "destructive" {
  switch (status) {
    case "ok":    return "secondary";
    case "warn":  return "default";
    case "error": return "destructive";
    default:      return "secondary";
  }
}

export default function ObservabilityTab() {
  const { data, isLoading, error } = useQuery<SchedulerRunsResponse>({
    queryKey: ["/api/admin/scheduler-runs"],
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground" data-testid="text-observability-loading">
        Loading scheduler runs…
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="m-6" data-testid="alert-observability-error">
        <IconAlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load scheduler runs</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : String(error)}</AlertDescription>
      </Alert>
    );
  }

  const runs = data?.runs ?? [];
  const staleCount = runs.filter((r) => r.isStale).length;

  return (
    <div className="space-y-6 p-6">
      {staleCount > 0 && (
        <Alert variant="destructive" data-testid="alert-stale-schedulers">
          <IconAlertTriangle className="h-4 w-4" />
          <AlertTitle>{staleCount} scheduler{staleCount === 1 ? "" : "s"} appear stale</AlertTitle>
          <AlertDescription>
            A scheduler is flagged stale when its last run is older than {data?.staleMultiplier ?? 2}× its
            cycle interval. Check server logs for the affected scheduler{staleCount === 1 ? "" : "s"}.
          </AlertDescription>
        </Alert>
      )}

      <Card data-testid="card-scheduler-runs">
        <CardHeader>
          <CardTitle>Background Schedulers</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scheduler</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Run</TableHead>
                <TableHead>Interval</TableHead>
                <TableHead>Considered</TableHead>
                <TableHead>Succeeded</TableHead>
                <TableHead>Failed</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow
                  key={run.schedulerKey}
                  className={run.isStale ? "bg-destructive/10" : undefined}
                  data-testid={`row-scheduler-${run.schedulerKey}`}
                >
                  <TableCell className="font-medium" data-testid={`text-scheduler-label-${run.schedulerKey}`}>
                    {run.schedulerLabel}
                  </TableCell>
                  <TableCell>
                    {run.status ? (
                      <Badge variant={statusVariant(run.status)} data-testid={`badge-status-${run.schedulerKey}`}>
                        {run.status}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell data-testid={`text-last-run-${run.schedulerKey}`}>
                    <div className="flex flex-col">
                      <span>{formatRelative(run.lastRunAt)}</span>
                      {run.isStale && (
                        <span className="text-xs text-destructive" data-testid={`text-stale-${run.schedulerKey}`}>
                          stale
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell data-testid={`text-interval-${run.schedulerKey}`}>
                    {formatInterval(run.cycleIntervalMs)}
                  </TableCell>
                  <TableCell>{run.considered ?? "—"}</TableCell>
                  <TableCell>{run.succeeded ?? "—"}</TableCell>
                  <TableCell>{run.failed ?? "—"}</TableCell>
                  <TableCell>{run.durationMs != null ? `${run.durationMs}ms` : "—"}</TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground" data-testid={`text-notes-${run.schedulerKey}`}>
                    {run.notes ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
