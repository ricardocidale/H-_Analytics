/**
 * IrisPanel — admin panel for the Iris Resource Maintainer backstage agent.
 *
 * Provides:
 *   - Action buttons: Run Health Check, Run Full Reindex
 *   - Knowledge Base status row (status dot + last indexed time + Sync button)
 *   - Retrieval gaps count + Clear Gaps button
 *   - Last run details card
 *
 * Polls every IRIS_STATUS_POLL_INTERVAL_MS when a run is in progress.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "@/components/icons/themed-icons";
import { AgentThinkingState } from "@/components/agent-animations";

// ─── Named constants (no magic numbers) ───────────────────────────────────────

/** Poll interval while an Iris run is in progress (ms). */
const IRIS_STATUS_POLL_INTERVAL_MS = 3_000;

// Relative-time thresholds (derived from unit conversions: 60s/min, 60min/hr, 24hr/day)
const MS_PER_MINUTE = 60 * 1_000;    // 60 seconds × 1000 ms
const MS_PER_HOUR   = 60 * 60 * 1_000; // 60 minutes × 60 seconds × 1000 ms
const MS_PER_DAY    = 24 * 60 * 60 * 1_000; // 24 hours × 60 minutes × 60 seconds × 1000 ms

// ─── Types ────────────────────────────────────────────────────────────────────

interface IrisLastRun {
  id: number;
  trigger: string;
  status: string; // "running" | "completed" | "error"
  modelUsed: string | null;
  chunksIndexed: number;
  errorsEncountered: number;
  durationMs: number | null;
  runAt: string;
  healthSummary: unknown | null;
}

interface IrisStatus {
  lastRun: IrisLastRun | null;
  gapsCount: number;
}

type IrisTrigger = "manual" | "scheduled-health" | "scheduled-reindex" | "gap-signal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (diffMs < MS_PER_MINUTE) return "< 1 min ago";
  if (diffMs < MS_PER_HOUR) {
    const mins = Math.floor(diffMs / MS_PER_MINUTE);
    return `${mins} min ago`;
  }
  if (diffMs < MS_PER_DAY) {
    const hours = Math.floor(diffMs / MS_PER_HOUR);
    return `${hours}h ago`;
  }
  const days = Math.floor(diffMs / MS_PER_DAY);
  return `${days}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type StatusDotColor = "green" | "red" | "gray" | "blue";

function StatusDot({ color }: { color: StatusDotColor }) {
  const classMap: Record<StatusDotColor, string> = {
    green: "bg-green-500",
    red:   "bg-red-500",
    gray:  "bg-gray-400",
    blue:  "bg-blue-500 animate-pulse",
  };
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${classMap[color]}`} />;
}

function resolveStatusDotColor(status: string | null | undefined): StatusDotColor {
  if (status === "completed") return "green";
  if (status === "error") return "red";
  if (status === "running") return "blue";
  return "gray";
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function IrisPanel() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery<IrisStatus>({
    queryKey: ["iris", "status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/iris/status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch Iris status");
      return res.json() as Promise<IrisStatus>;
    },
    refetchInterval: (query) =>
      query.state.data?.lastRun?.status === "running"
        ? IRIS_STATUS_POLL_INTERVAL_MS
        : false,
  });

  const runMutation = useMutation({
    mutationFn: async (trigger: IrisTrigger) => {
      const res = await fetch("/api/admin/iris/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ trigger }),
      });
      if (!res.ok) throw new Error("Failed to start Iris run");
      return res.json() as Promise<{ runId: number; status: string }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["iris", "status"] });
    },
  });

  const clearGapsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/iris/gaps", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to clear gaps");
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["iris", "status"] });
    },
  });

  const isRunning = status?.lastRun?.status === "running" || runMutation.isPending;
  const dotColor = resolveStatusDotColor(status?.lastRun?.status);

  return (
    <div className="space-y-6" data-testid="iris-panel">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-display font-bold text-foreground">Iris</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Resource Maintainer</p>
        </div>
        {isRunning && (
          <AgentThinkingState
            persona="iris"
            phase="thinking"
            size="md"
            showLabel
            aria-label="Iris is running"
            className="mt-1 shrink-0"
          />
        )}
      </div>

      {/* Action buttons */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={isRunning}
              onClick={() => runMutation.mutate("scheduled-health")}
              data-testid="iris-btn-health-check"
            >
              {isRunning && runMutation.variables === "scheduled-health" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Running…
                </>
              ) : (
                "Run Health Check"
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={isRunning}
              onClick={() => runMutation.mutate("manual")}
              data-testid="iris-btn-full-reindex"
            >
              {isRunning && runMutation.variables === "manual" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Running…
                </>
              ) : (
                "Run Full Reindex"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Knowledge Base status row */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">Knowledge Base</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-accent-pop" />
              Loading status…
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <StatusDot color={dotColor} />
                <span className="text-sm font-medium text-foreground">Knowledge Base</span>
                {status?.lastRun?.runAt ? (
                  <span
                    className="text-sm text-muted-foreground"
                    title={status.lastRun.runAt}
                  >
                    — Last indexed: {formatRelativeTime(status.lastRun.runAt)}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">— Never indexed</span>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={isRunning}
                onClick={() => runMutation.mutate("manual")}
                data-testid="iris-btn-sync"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Running…
                  </>
                ) : (
                  "Sync"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Retrieval gaps */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">Retrieval Gaps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-foreground">
              Retrieval Gaps:{" "}
              <span className="font-mono tabular-nums font-semibold">
                {isLoading ? "…" : (status?.gapsCount ?? 0)}
              </span>
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={clearGapsMutation.isPending || isLoading}
              onClick={() => clearGapsMutation.mutate()}
              data-testid="iris-btn-clear-gaps"
            >
              {clearGapsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Clearing…
                </>
              ) : (
                "Clear Gaps"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Last run card */}
      {status?.lastRun && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base">Last Run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
              <div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground/60">Trigger</span>
                <p className="font-medium text-foreground capitalize">
                  {status.lastRun.trigger}
                </p>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground/60">Model</span>
                <p className="font-medium text-foreground font-mono text-xs">
                  {status.lastRun.modelUsed ?? "—"}
                </p>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground/60">Chunks</span>
                <p className="font-mono tabular-nums font-semibold text-foreground">
                  {status.lastRun.chunksIndexed}
                </p>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground/60">Errors</span>
                <p className={`font-mono tabular-nums font-semibold ${status.lastRun.errorsEncountered > 0 ? "text-red-500" : "text-foreground"}`}>
                  {status.lastRun.errorsEncountered}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 pt-1">
              <div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground/60">Duration</span>
                <p className="font-mono tabular-nums text-foreground">
                  {status.lastRun.durationMs != null ? `${status.lastRun.durationMs}ms` : "—"}
                </p>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground/60">Run at</span>
                <p
                  className="text-foreground"
                  title={status.lastRun.runAt}
                >
                  {formatRelativeTime(status.lastRun.runAt)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
