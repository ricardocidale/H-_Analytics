import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconCheckCircle, IconAlertCircle } from "@/components/icons/status-icons";
import {
  formatAbsoluteTime,
  formatDuration,
  type UnifiedRun,
  type SchedulerLastRun,
} from "../unified-runs-utils";

/** Analyst / scheduler run detail: shows notes, considered/succeeded/failed counts, and timing.
 *
 * Task #1142 — also fetches /api/admin/scheduler-runs/:key/last-run to surface
 * probe result notes and per-workflow error messages inline, so admins don't
 * have to navigate to a separate Specialist admin page.
 */
export function AnalystDetail({ run }: { run: UnifiedRun }) {
  const meta = run.meta ?? {};
  const hasCounts =
    meta.considered != null || meta.succeeded != null || meta.failed != null;

  const { data: lastRun, isLoading: lastRunLoading } = useQuery<SchedulerLastRun>({
    queryKey: ["scheduler-last-run", run.schedulerKey],
    queryFn: async () => {
      const r = await fetch(
        `/api/admin/scheduler-runs/${run.schedulerKey}/last-run`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error("Failed to fetch run detail");
      return r.json() as Promise<SchedulerLastRun>;
    },
    enabled: !!run.schedulerKey,
    staleTime: 30_000,
  });

  const failedWorkflows =
    lastRun?.workflows?.filter(
      (w) => w.lastRunStatus === "failed" || w.lastRunError,
    ) ?? [];
  const allWorkflows = lastRun?.workflows ?? [];

  return (
    <div className="space-y-4 mt-2">
      {/* Metadata */}
      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 space-y-1.5 text-xs">
        <div className="flex gap-2">
          <span className="text-muted-foreground w-28 shrink-0">Agent</span>
          <span className="text-foreground font-medium">{run.agentName}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-muted-foreground w-28 shrink-0">Role</span>
          <span className="text-foreground">{run.agentRole}</span>
        </div>
        {run.schedulerKey && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Scheduler key</span>
            <span className="font-mono text-foreground">{run.schedulerKey}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="text-muted-foreground w-28 shrink-0">Ran at</span>
          <span className="font-mono">
            {formatAbsoluteTime(run.startedAt ?? run.completedAt)}
          </span>
        </div>
        {run.durationMs != null && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Duration</span>
            <span className="font-mono tabular-nums">{formatDuration(run.durationMs)}</span>
          </div>
        )}
      </div>

      {/* Cycle result counts */}
      {hasCounts && (
        <div className="grid grid-cols-3 gap-2">
          {meta.considered != null && (
            <div className="rounded-md border border-border/60 bg-muted/10 px-2 py-2 text-center">
              <p className="text-xl font-semibold tabular-nums text-foreground">
                {meta.considered}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Considered</p>
            </div>
          )}
          {meta.succeeded != null && (
            <div className="rounded-md border border-border/60 bg-muted/10 px-2 py-2 text-center">
              <p className="text-xl font-semibold tabular-nums text-foreground">
                {meta.succeeded}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Succeeded</p>
            </div>
          )}
          {meta.failed != null && (
            <div className={`rounded-md border px-2 py-2 text-center ${
              Number(meta.failed) > 0
                ? "border-destructive/40 bg-destructive/5"
                : "border-border/60 bg-muted/10"
            }`}>
              <p className={`text-xl font-semibold tabular-nums ${
                Number(meta.failed) > 0 ? "text-destructive" : "text-foreground"
              }`}>
                {meta.failed}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Failed</p>
            </div>
          )}
        </div>
      )}

      {/* Probe notes / cycle result */}
      {meta.notes && (
        <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2.5">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Cycle notes</p>
          <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap break-words">
            {String(meta.notes)}
          </p>
        </div>
      )}

      {/* Per-run detail from /scheduler-runs/:key/last-run */}
      {run.schedulerKey && (
        <>
          {lastRunLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin text-accent-pop" />
              Loading probe detail…
            </div>
          )}

          {/* Cycle-level error notes from the server (when not already shown via meta.notes) */}
          {!lastRunLoading &&
            lastRun?.notes &&
            lastRun.notes !== String(meta.notes ?? "") && (
              <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Probe notes</p>
                <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap break-words">
                  {lastRun.notes}
                </p>
              </div>
            )}

          {/* Failed workflow details */}
          {!lastRunLoading && failedWorkflows.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Failed workflows ({failedWorkflows.length})
              </p>
              {failedWorkflows.map((w) => (
                <div
                  key={w.workflowKey}
                  className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5"
                >
                  <div className="flex items-start gap-2 mb-1">
                    <IconAlertCircle
                      weight="fill"
                      className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5"
                    />
                    <p className="text-xs font-medium text-destructive leading-tight">
                      {w.name}
                    </p>
                    {w.lastRunDurationMs != null && (
                      <span className="ml-auto text-[10px] font-mono text-destructive/70 tabular-nums shrink-0">
                        {formatDuration(w.lastRunDurationMs)}
                      </span>
                    )}
                  </div>
                  {w.lastRunError && (
                    <p className="text-xs text-destructive/90 break-words font-mono leading-relaxed pl-5">
                      {w.lastRunError}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* All workflow statuses (when all passed) */}
          {!lastRunLoading &&
            allWorkflows.length > 0 &&
            failedWorkflows.length === 0 && (
              <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Workflow results
                </p>
                <div className="divide-y divide-border/50">
                  {allWorkflows.map((w) => {
                    const isOk =
                      w.lastRunStatus === "completed" ||
                      w.lastRunStatus === "running";
                    return (
                      <div key={w.workflowKey} className="flex items-center gap-2 py-1.5">
                        {isOk ? (
                          <IconCheckCircle
                            weight="fill"
                            className="w-3 h-3 text-success shrink-0"
                          />
                        ) : (
                          <div className="w-3 h-3 rounded-full border-2 border-border shrink-0" />
                        )}
                        <span className="text-xs text-foreground flex-1 min-w-0 truncate">
                          {w.name}
                        </span>
                        {w.lastRunStatus && (
                          <span className="text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground uppercase tracking-wide leading-none shrink-0">
                            {w.lastRunStatus}
                          </span>
                        )}
                        {w.lastRunDurationMs != null && (
                          <span className="text-[10px] font-mono text-muted-foreground/70 tabular-nums shrink-0">
                            {formatDuration(w.lastRunDurationMs)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Mixed state: some failed, show all for context */}
          {!lastRunLoading &&
            allWorkflows.length > failedWorkflows.length &&
            failedWorkflows.length > 0 && (
              <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground mb-2">All workflows</p>
                <div className="divide-y divide-border/50">
                  {allWorkflows.map((w) => {
                    const failed =
                      w.lastRunStatus === "failed" || !!w.lastRunError;
                    return (
                      <div key={w.workflowKey} className="flex items-center gap-2 py-1.5">
                        {!failed ? (
                          <IconCheckCircle
                            weight="fill"
                            className="w-3 h-3 text-success shrink-0"
                          />
                        ) : (
                          <IconAlertCircle
                            weight="fill"
                            className="w-3 h-3 text-destructive shrink-0"
                          />
                        )}
                        <span
                          className={`text-xs flex-1 min-w-0 truncate ${
                            failed ? "text-destructive" : "text-foreground"
                          }`}
                        >
                          {w.name}
                        </span>
                        {w.lastRunStatus && (
                          <span className="text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground uppercase tracking-wide leading-none shrink-0">
                            {w.lastRunStatus}
                          </span>
                        )}
                        {w.lastRunDurationMs != null && (
                          <span className="text-[10px] font-mono text-muted-foreground/70 tabular-nums shrink-0">
                            {formatDuration(w.lastRunDurationMs)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Fallback when no detail data available */}
          {!lastRunLoading &&
            !lastRun?.notes &&
            allWorkflows.length === 0 &&
            !hasCounts &&
            !meta.notes && (
              <div className="text-xs text-muted-foreground bg-muted/20 rounded-md border border-border/60 px-3 py-2.5">
                No probe detail recorded for this run. Check the Specialist admin pages for more information.
              </div>
            )}
        </>
      )}

      {/* Fallback when no schedulerKey (non-scheduler analyst runs) */}
      {!run.schedulerKey && !meta.notes && !hasCounts && (
        <div className="text-xs text-muted-foreground bg-muted/20 rounded-md border border-border/60 px-3 py-2.5">
          No probe detail recorded for this run.
        </div>
      )}
    </div>
  );
}
