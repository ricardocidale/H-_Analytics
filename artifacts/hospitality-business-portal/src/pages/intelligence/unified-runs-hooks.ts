import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AGENTS, ORCHESTRATORS } from "@/lib/agent-taxonomy";
import type { RunType } from "@/lib/agent-taxonomy";
import {
  RUNS_POLL_MS,
  SLIDE_RUNS_LIMIT,
  normalizeStatus,
  isActiveRun,
  ANALYST_SCHEDULER_KEYS,
  IRIS_SCHEDULER_KEYS,
} from "./unified-runs-utils";
import type {
  IrisStatus,
  SlideFactoryRun,
  SchedulerRunRow,
  UnifiedRun,
  SlideAgentResultFE,
  FailedSlide,
} from "./unified-runs-types";

export function useIrisRun() {
  return useQuery<IrisStatus>({
    queryKey: ["iris", "status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/iris/status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch Iris status");
      return res.json() as Promise<IrisStatus>;
    },
    refetchInterval: (query) =>
      query.state.data?.lastRun?.status === "running" ? RUNS_POLL_MS : false,
  });
}

export function useSlideFactoryRuns() {
  return useQuery<SlideFactoryRun[]>({
    queryKey: ["factory-run-list-all"],
    queryFn: async () => {
      const r = await fetch(
        `/api/lb-slides/factory/runs?limit=${SLIDE_RUNS_LIMIT}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error("Failed to load factory runs");
      return r.json() as Promise<SlideFactoryRun[]>;
    },
    refetchInterval: RUNS_POLL_MS,
  });
}

export function useSchedulerRuns() {
  return useQuery<SchedulerRunRow[]>({
    queryKey: ["/api/admin/scheduler-runs"],
    queryFn: async () => {
      const r = await fetch("/api/admin/scheduler-runs", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load scheduler runs");
      const data = await r.json() as { runs?: SchedulerRunRow[] };
      return data.runs ?? [];
    },
  });
}

/**
 * Aggregates iris, slide factory, and scheduler data into a single sorted
 * UnifiedRun array. Active runs are sorted first, then by startedAt desc.
 */
export function useUnifiedRuns(): { runs: UnifiedRun[]; isLoading: boolean } {
  const { data: irisStatus, isLoading: irisLoading } = useIrisRun();
  const { data: slideRuns = [], isLoading: slideLoading } = useSlideFactoryRuns();
  const { data: schedulerRuns = [], isLoading: schedulerLoading } = useSchedulerRuns();

  const isLoading = irisLoading || slideLoading || schedulerLoading;

  const runs = useMemo<UnifiedRun[]>(() => {
    const out: UnifiedRun[] = [];

    // Iris run
    if (irisStatus?.lastRun) {
      const lr = irisStatus.lastRun;
      out.push({
        id: `iris-${lr.id}`,
        type: "iris",
        agentName: AGENTS.iris.humanName,
        agentRole: AGENTS.iris.role,
        status: normalizeStatus(lr.status),
        startedAt: lr.runAt,
        completedAt: lr.status === "completed" ? lr.runAt : null,
        durationMs: lr.durationMs,
        meta: {
          chunksIndexed: lr.chunksIndexed,
          errorsEncountered: lr.errorsEncountered,
          trigger: lr.trigger,
          modelUsed: lr.modelUsed,
          healthSummary: lr.healthSummary,
        },
      });
    }

    // Slide Factory runs
    for (const run of slideRuns) {
      const agentResults = run.agentResults ?? {};
      const failedSlides: FailedSlide[] = Object.entries(agentResults)
        .filter(([, r]) => (r as SlideAgentResultFE).status === "rejected")
        .map(([key, r]) => ({
          num: parseInt(key.replace("slide", ""), 10),
          reason: (r as SlideAgentResultFE).errorMessage,
        }))
        .sort((a, b) => a.num - b.num);

      out.push({
        id: `slide-${run.id}`,
        type: "slide",
        agentName: ORCHESTRATORS.marco.humanName,
        agentRole: ORCHESTRATORS.marco.role,
        status: normalizeStatus(run.status),
        startedAt: run.startedAt ?? run.createdAt,
        completedAt: run.completedAt,
        durationMs:
          run.completedAt && run.startedAt
            ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
            : null,
        slideFactoryRunId: run.id,
        failedSlides: failedSlides.length > 0 ? failedSlides : undefined,
        meta: run.briefFilename ? { brief: run.briefFilename } : undefined,
      });
    }

    // Scheduler runs — only include keys with a known taxonomy type (analyst or iris)
    for (const row of schedulerRuns) {
      const analystName = ANALYST_SCHEDULER_KEYS[row.schedulerKey];
      const irisName = IRIS_SCHEDULER_KEYS[row.schedulerKey];
      const agentName = analystName ?? irisName;
      const runType: RunType | null = analystName ? "analyst" : irisName ? "iris" : null;

      if (!runType || !agentName) continue;

      const agentRole = runType === "analyst" ? "Analyst" : AGENTS.iris.role;

      if (row.recentRuns && row.recentRuns.length > 0) {
        for (const run of row.recentRuns) {
          out.push({
            id: `scheduler-${row.schedulerKey}-${run.ranAt}`,
            type: runType,
            agentName,
            agentRole,
            status: normalizeStatus(run.status),
            startedAt: run.ranAt,
            completedAt: run.ranAt,
            durationMs: run.durationMs,
            schedulerKey: row.schedulerKey,
            meta: {
              notes: run.notes,
              considered: run.considered,
              succeeded: run.succeeded,
              failed: run.failed,
            },
          });
        }
      } else if (row.lastRunAt) {
        out.push({
          id: `scheduler-${row.schedulerKey}`,
          type: runType,
          agentName,
          agentRole,
          status: normalizeStatus(row.status ?? "completed"),
          startedAt: row.lastRunAt,
          completedAt: row.lastRunAt,
          durationMs: row.durationMs,
          schedulerKey: row.schedulerKey,
          meta: { notes: row.notes },
        });
      }
    }

    // Sort: active first, then by startedAt desc
    return out.sort((a, b) => {
      const aActive = isActiveRun(a.status) ? 1 : 0;
      const bActive = isActiveRun(b.status) ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      const aTime = a.startedAt ?? "";
      const bTime = b.startedAt ?? "";
      return bTime.localeCompare(aTime);
    });
  }, [irisStatus, slideRuns, schedulerRuns]);

  return { runs, isLoading };
}
