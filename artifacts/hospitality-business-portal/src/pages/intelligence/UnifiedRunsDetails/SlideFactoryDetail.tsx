import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconCheckCircle, IconAlertCircle } from "@/components/icons/status-icons";
import { ORCHESTRATORS, SLIDE_AGENT_NAMES, SLIDE_TEAM_TAGS } from "@/lib/agent-taxonomy";
import {
  RUNS_POLL_MS,
  TOTAL_DECK_SLIDES,
  MAYA_VERDICT_CLASS,
  MAYA_VERDICT_LABEL,
  formatAbsoluteTime,
  type SlideFactoryRun,
  type SlideAgentResultFE,
} from "../unified-runs-utils";

/** Slide Factory detail: fetches full run to show per-slide agent results. */
export function SlideFactoryDetail({ runId }: { runId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRetriggering, setIsRetriggering] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const { data: run, isLoading, error } = useQuery<SlideFactoryRun>({
    queryKey: ["factory-run-detail", runId],
    queryFn: async () => {
      const r = await fetch(`/api/lb-slides/factory/runs/${runId}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to fetch run details");
      return r.json() as Promise<SlideFactoryRun>;
    },
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "building" || s === "drafting" || s === "ingesting"
        ? RUNS_POLL_MS
        : false;
    },
  });

  async function handleRetrigger() {
    setIsRetriggering(true);
    try {
      const r = await fetch(`/api/lb-slides/factory/runs/${runId}/trigger-build`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server error ${r.status}`);
      }
      toast({ title: "Build re-triggered", description: "Marco is rebuilding failed slides." });
      await queryClient.invalidateQueries({ queryKey: ["factory-run-detail", runId] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Re-trigger failed", description: msg, variant: "destructive" });
    } finally {
      setIsRetriggering(false);
    }
  }

  async function handleCancel() {
    setIsCancelling(true);
    try {
      const r = await fetch(`/api/lb-slides/factory/runs/${runId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server error ${r.status}`);
      }
      toast({ title: "Build cancelled", description: "The in-progress build has been stopped." });
      await queryClient.invalidateQueries({ queryKey: ["factory-run-detail", runId] });
      await queryClient.invalidateQueries({ queryKey: ["factory-run-list-all"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Cancel failed", description: msg, variant: "destructive" });
    } finally {
      setIsCancelling(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2 py-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/2" />
        <div className="h-20 bg-muted rounded" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Couldn't load run details.
      </p>
    );
  }

  const agentResults = run.agentResults ?? {};
  const isBuilding = run.status === "building";
  const isComplete = run.status === "complete";
  const isError = run.status === "error";

  return (
    <div className="space-y-4 mt-2">
      {/* Run metadata */}
      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 space-y-1 text-xs">
        {run.briefFilename && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Brief</span>
            <span className="text-foreground font-medium truncate">{run.briefFilename}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="text-muted-foreground w-24 shrink-0">Started</span>
          <span className="font-mono">{formatAbsoluteTime(run.startedAt ?? run.createdAt)}</span>
        </div>
        {run.completedAt && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Completed</span>
            <span className="font-mono">{formatAbsoluteTime(run.completedAt)}</span>
          </div>
        )}
      </div>

      {/* Cancel button — only shown while build is in progress */}
      {isBuilding && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-3 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Build in progress. Cancel to stop Marco and mark this run as failed.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
            disabled={isCancelling}
            onClick={handleCancel}
          >
            {isCancelling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : null}
            Cancel build
          </Button>
        </div>
      )}

      {/* Re-trigger button — only shown when build failed */}
      {isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <IconAlertCircle weight="fill" className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive/90">
              One or more slides failed. Re-trigger to rebuild from the last approved draft.
            </p>
          </div>
          <Button
            size="sm"
            variant="destructive"
            className="shrink-0"
            disabled={isRetriggering}
            onClick={handleRetrigger}
          >
            {isRetriggering ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : null}
            Re-trigger build
          </Button>
        </div>
      )}

      {/* Per-slide agent results */}
      <div>
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/60">
          {isBuilding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-pop shrink-0" />
          ) : isComplete ? (
            <IconCheckCircle weight="fill" className="w-3.5 h-3.5 text-success shrink-0" />
          ) : (
            <IconAlertCircle weight="fill" className="w-3.5 h-3.5 text-destructive shrink-0" />
          )}
          <span className="text-xs font-semibold text-foreground">
            {ORCHESTRATORS.marco.swarmHeader}
          </span>
          <span className="text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground uppercase tracking-wide leading-none ml-auto">
            Orchestrator
          </span>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          {isBuilding
            ? "6 teams building — polling for updates…"
            : isComplete
            ? "All slides built and verified."
            : "Build pipeline — per-slide results below."}
        </p>

        <div className="divide-y divide-border/60">
          {Array.from({ length: TOTAL_DECK_SLIDES }, (_, i) => {
            const slideNum = i + 1;
            const key = `slide${slideNum}`;
            const result = agentResults[key] as SlideAgentResultFE | undefined ?? null;
            const slotStatus = result?.status ?? (isBuilding ? "pending" : null);

            return (
              <div key={key} className="flex items-start gap-3 py-2.5">
                <div className="mt-0.5 shrink-0">
                  {slotStatus === "approved" ? (
                    <IconCheckCircle weight="fill" className="w-3.5 h-3.5 text-success" />
                  ) : slotStatus === "rejected" ? (
                    <IconAlertCircle weight="fill" className="w-3.5 h-3.5 text-destructive" />
                  ) : slotStatus === "running" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-pop" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-border" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium">
                      {SLIDE_AGENT_NAMES[slideNum]} — Slide {slideNum}
                    </span>
                    <span className="text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground uppercase tracking-wide leading-none">
                      {SLIDE_TEAM_TAGS[slideNum]}
                    </span>
                    {result?.mayaVerdict && (
                      <span
                        className={`text-[10px] px-1.5 py-px rounded leading-none font-medium ${MAYA_VERDICT_CLASS[result.mayaVerdict]}`}
                      >
                        Maya: {MAYA_VERDICT_LABEL[result.mayaVerdict]}
                      </span>
                    )}
                    {result?.pixelDiffPct != null && (
                      <span className="text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground leading-none">
                        Dino: {result.pixelDiffPct.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  {result?.errorMessage && (
                    <p className="text-xs text-destructive mt-0.5 break-words">
                      {result.errorMessage}
                    </p>
                  )}
                  {result?.mayaNotes && result.mayaVerdict !== "ok" && (
                    <p className="text-xs text-muted-foreground mt-0.5 break-words">
                      {result.mayaNotes}
                    </p>
                  )}
                  {result?.approvedAt && (
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5 font-mono">
                      Approved {formatAbsoluteTime(result.approvedAt)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
