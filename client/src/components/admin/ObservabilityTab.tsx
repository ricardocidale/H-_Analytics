import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { IconAlertTriangle, IconRefreshCw } from "@/components/icons";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface StorageDriftSweepResponse {
  lastRun: {
    finishedAt: string;
    exitCode: number;
    status: "ok" | "partial" | "error";
    rewroteCount: number;
    copiedCount: number;
    skippedCount: number;
    failedCount: number;
    residualCount: number;
    runId: string | null;
    runUrl: string | null;
    trigger: string | null;
    triggerReason: string | null;
    notes: string | null;
    isStale: boolean;
  } | null;
  staleAfterMs: number;
}

interface SchedulerRecentRun {
  ranAt: string;
  status: "ok" | "warn" | "error";
  considered: number;
  succeeded: number;
  failed: number;
  durationMs: number | null;
  notes: string | null;
}

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
  recentRuns: SchedulerRecentRun[];
}

interface SchedulerRunsResponse {
  runs: SchedulerRunRow[];
  staleMultiplier: number;
  recentRunsLimit: number;
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

function recentDotClass(status: "ok" | "warn" | "error"): string {
  switch (status) {
    case "ok":    return "bg-emerald-500";
    case "warn":  return "bg-amber-500";
    case "error": return "bg-destructive";
  }
}

function RecentRunsStrip({ runs, schedulerKey }: { runs: SchedulerRecentRun[]; schedulerKey: string }) {
  if (runs.length === 0) {
    return (
      <span
        className="text-xs text-muted-foreground"
        data-testid={`text-recent-runs-empty-${schedulerKey}`}
      >
        No history yet
      </span>
    );
  }
  // listSchedulerRunHistory returns DESC; render oldest → newest left-to-right
  // so the most recent cycle is the right-most dot (matches "now" intuition).
  const ordered = [...runs].reverse();
  return (
    <div
      className="flex items-center gap-0.5"
      data-testid={`strip-recent-runs-${schedulerKey}`}
    >
      {ordered.map((r, idx) => {
        const ranAtLabel = new Date(r.ranAt).toLocaleString();
        const counts = `${r.succeeded}/${r.considered} ok, ${r.failed} failed`;
        const duration = r.durationMs != null ? ` · ${r.durationMs}ms` : "";
        const note = r.notes ? ` · ${r.notes}` : "";
        return (
          <span
            key={`${r.ranAt}-${idx}`}
            title={`${r.status.toUpperCase()} · ${ranAtLabel} · ${counts}${duration}${note}`}
            className={`inline-block h-2.5 w-2.5 rounded-full ${recentDotClass(r.status)}`}
            data-testid={`dot-recent-run-${schedulerKey}-${idx}`}
          />
        );
      })}
    </div>
  );
}

function sweepStatusVariant(status: "ok" | "partial" | "error"): "default" | "secondary" | "destructive" {
  switch (status) {
    case "ok":      return "secondary";
    case "partial": return "default";
    case "error":   return "destructive";
  }
}

function formatStaleAfter(ms: number): string {
  const hours = Math.round(ms / 3_600_000);
  return hours >= 24 ? `${Math.round(hours / 24)}d` : `${hours}h`;
}

function StorageDriftSweepCard() {
  const { data, isLoading, error } = useQuery<StorageDriftSweepResponse>({
    queryKey: ["/api/admin/storage-drift-sweep"],
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-storage-drift-sweep-loading">
        <CardHeader>
          <CardTitle>Storage Drift Sweep</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground" data-testid="text-storage-drift-sweep-loading">
            Loading last sweep result…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" data-testid="alert-storage-drift-sweep-error">
        <IconAlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load storage drift sweep</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : String(error)}</AlertDescription>
      </Alert>
    );
  }

  const lastRun = data?.lastRun ?? null;
  const staleAfter = data?.staleAfterMs ?? 36 * 60 * 60 * 1000;

  return (
    <Card data-testid="card-storage-drift-sweep">
      <CardHeader>
        <CardTitle>Storage Drift Sweep</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!lastRun && (
          <Alert variant="destructive" data-testid="alert-storage-drift-sweep-never">
            <IconAlertTriangle className="h-4 w-4" />
            <AlertTitle>No sweep recorded yet</AlertTitle>
            <AlertDescription>
              The nightly storage-reconcile auto-remediation workflow has not yet recorded a run in
              this database. Confirm the workflow is enabled in GitHub Actions and that the
              recording step has run at least once.
            </AlertDescription>
          </Alert>
        )}

        {lastRun?.isStale && (
          <Alert variant="destructive" data-testid="alert-storage-drift-sweep-stale">
            <IconAlertTriangle className="h-4 w-4" />
            <AlertTitle>Last sweep is stale</AlertTitle>
            <AlertDescription>
              The nightly sweep should run every ~24h. The last recorded run is older than{" "}
              {formatStaleAfter(staleAfter)} — the GitHub Actions scheduler may be paused. Check the
              workflow's Actions page.
            </AlertDescription>
          </Alert>
        )}

        {lastRun && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge
                variant={sweepStatusVariant(lastRun.status)}
                data-testid="badge-storage-drift-sweep-status"
              >
                {lastRun.status}
              </Badge>
              <span className="text-muted-foreground">exit</span>
              <span data-testid="text-storage-drift-sweep-exit-code">{lastRun.exitCode}</span>
              <span className="text-muted-foreground">·</span>
              <span data-testid="text-storage-drift-sweep-finished-at">
                {formatRelative(lastRun.finishedAt)} ({new Date(lastRun.finishedAt).toLocaleString()})
              </span>
              {lastRun.trigger && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span data-testid="text-storage-drift-sweep-trigger">{lastRun.trigger}</span>
                </>
              )}
              {lastRun.runUrl && (
                <a
                  href={lastRun.runUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-primary underline"
                  data-testid="link-storage-drift-sweep-run"
                >
                  View on GitHub →
                </a>
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rewrote</TableHead>
                  <TableHead>Copied</TableHead>
                  <TableHead>Skipped</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Residual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell data-testid="text-storage-drift-sweep-rewrote">
                    {lastRun.rewroteCount}
                  </TableCell>
                  <TableCell data-testid="text-storage-drift-sweep-copied">
                    {lastRun.copiedCount}
                  </TableCell>
                  <TableCell data-testid="text-storage-drift-sweep-skipped">
                    {lastRun.skippedCount}
                  </TableCell>
                  <TableCell data-testid="text-storage-drift-sweep-failed">
                    {lastRun.failedCount}
                  </TableCell>
                  <TableCell data-testid="text-storage-drift-sweep-residual">
                    {lastRun.residualCount > 0 ? (
                      <span className="text-destructive font-medium">{lastRun.residualCount}</span>
                    ) : (
                      lastRun.residualCount
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            {lastRun.notes && (
              <div
                className="text-xs text-muted-foreground font-mono"
                data-testid="text-storage-drift-sweep-notes"
              >
                {lastRun.notes}
              </div>
            )}
            {lastRun.triggerReason && (
              <div
                className="text-xs text-muted-foreground"
                data-testid="text-storage-drift-sweep-trigger-reason"
              >
                Reason: {lastRun.triggerReason}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function ObservabilityTab() {
  const { data, isLoading, error } = useQuery<SchedulerRunsResponse>({
    queryKey: ["/api/admin/scheduler-runs"],
    refetchInterval: 30_000,
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Track which scheduler keys we've kicked off in the last few seconds so
  // the button can show a transient "Running…" state until the next refetch
  // surfaces the new last-run row.
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const runNowMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest("POST", `/api/admin/scheduler-runs/${key}/run`);
      return (await res.json()) as { accepted: boolean; schedulerKey: string; schedulerLabel: string };
    },
    onMutate: (key: string) => {
      setPendingKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    },
    onSuccess: (result) => {
      toast({
        title: "Scheduler kicked off",
        description: `${result.schedulerLabel} is running in the background. The last-run row will refresh shortly.`,
      });
      // Long-running cycles (e.g. specialist-quality, ~minutes) won't be
      // reflected on the very next refetch. Poll the runs query a couple
      // of times so the new row appears without requiring the admin to
      // hit refresh, then drop the spinner state.
      const key = result.schedulerKey;
      const refetch = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/scheduler-runs"] });
      setTimeout(refetch, 1_500);
      setTimeout(refetch, 5_000);
      setTimeout(() => {
        refetch();
        setPendingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, 15_000);
    },
    onError: (err: unknown, key) => {
      setPendingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      toast({
        title: "Failed to start scheduler",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
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

      <StorageDriftSweepCard />

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
                <TableHead>Recent Runs</TableHead>
                <TableHead>Interval</TableHead>
                <TableHead>Considered</TableHead>
                <TableHead>Succeeded</TableHead>
                <TableHead>Failed</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
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
                  <TableCell>
                    <RecentRunsStrip runs={run.recentRuns} schedulerKey={run.schedulerKey} />
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
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pendingKeys.has(run.schedulerKey) || runNowMutation.isPending}
                      onClick={() => runNowMutation.mutate(run.schedulerKey)}
                      data-testid={`button-run-scheduler-${run.schedulerKey}`}
                    >
                      <IconRefreshCw
                        className={`mr-1 h-3.5 w-3.5 ${pendingKeys.has(run.schedulerKey) ? "animate-spin" : ""}`}
                      />
                      {pendingKeys.has(run.schedulerKey) ? "Running…" : "Run now"}
                    </Button>
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
