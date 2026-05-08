/**
 * UnifiedRunsPage — aggregates all agent run types in a single, filterable log.
 *
 * Run types surfaced:
 *   - Analyst runs    (specialist research runs via /api/admin/iris/status stub +
 *                      scheduler runs from /api/admin/scheduler-runs)
 *   - Slide Factory   (/api/lb-slides/factory/runs)
 *   - Iris runs       (/api/admin/iris/status → lastRun)
 *
 * Filters: type (Analyst / Slide / Iris), status, date range (last 7d / 30d / all).
 *
 * Out of scope: DB schema changes. This page reads from existing endpoints only.
 */

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconCheckCircle, IconAlertCircle } from "@/components/icons/status-icons";
import { IconList, IconBot, IconBrain, IconWand2 } from "@/components/icons";
import { ChevronRight } from "@/components/icons/themed-icons";
import {
  RUN_TYPE_LABELS,
  ANALYST_BRAND,
  AGENTS,
  ORCHESTRATORS,
  SLIDE_AGENT_NAMES,
  SLIDE_TEAM_TAGS,
  type RunType,
} from "@/lib/agent-taxonomy";

// ── Named constants ────────────────────────────────────────────────────────

/** Poll interval while any run is in progress (ms). */
const RUNS_POLL_MS = 8_000;

/** Number of Slide Factory runs to request. */
const SLIDE_RUNS_LIMIT = 20;

/** Total slide count in one L+B deck. */
const TOTAL_DECK_SLIDES = 6;


const MS_PER_MINUTE = 60 * 1_000;
const MS_PER_HOUR = 60 * 60 * 1_000;
const MS_PER_DAY = 24 * 60 * 60 * 1_000;

// ── Types ─────────────────────────────────────────────────────────────────

type UnifiedRunStatus = "running" | "completed" | "complete" | "error" | "pending" | "new" | "brief_ready" | "ingesting" | "ingested" | "drafting" | "draft_review" | "building";

/** Health summary stored in iris_runs.health_summary (JSONB). */
interface IrisHealthSummary {
  summary?: string;
  toolsInvoked?: number | string[];
  runId?: string;
  error?: string;
  /** Individual error messages collected during the run. */
  errors?: string[];
}

/** A single failed slide entry for display in the run list row. */
interface FailedSlide {
  num: number;
  reason: string | null;
}


interface UnifiedRun {
  id: string;
  type: RunType;
  agentName: string;
  agentRole: string;
  status: UnifiedRunStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  /** Raw numeric ID for slide factory runs — used to fetch detail. */
  slideFactoryRunId?: number;
  /** Scheduler key for analyst/iris scheduler runs. */
  schedulerKey?: string;
  /**
   * Rejected slides for Slide Factory error runs. Populated directly from
   * the agentResults in the list response — no extra fetch required.
   */
  failedSlides?: FailedSlide[];
  meta?: {
    chunksIndexed?: number | null;
    errorsEncountered?: number | null;
    trigger?: string | null;
    modelUsed?: string | null;
    brief?: string | null;
    /** Iris health summary — text from the agent's final report or error string. */
    healthSummary?: IrisHealthSummary | null;
    /** Notes from the scheduler cycle (Analyst runs). */
    notes?: string | null;
    /** Items considered this cycle. */
    considered?: number | null;
    /** Items succeeded this cycle. */
    succeeded?: number | null;
    /** Items failed this cycle. */
    failed?: number | null;
    [k: string]: string | number | null | undefined | IrisHealthSummary;
  };
}

interface IrisLastRun {
  id: number;
  trigger: string;
  status: string;
  modelUsed: string | null;
  chunksIndexed: number;
  errorsEncountered: number;
  durationMs: number | null;
  runAt: string;
  healthSummary: IrisHealthSummary | null;
}

interface IrisStatus {
  lastRun: IrisLastRun | null;
  gapsCount: number;
}

interface SlideAgentResultFE {
  status: "pending" | "running" | "approved" | "rejected";
  pixelDiffPct: number | null;
  mayaVerdict: "ok" | "advisory" | "warning" | "block" | null;
  mayaNotes: string | null;
  approvedAt: string | null;
  errorMessage: string | null;
}

type FactoryStatus =
  | "new" | "brief_ready" | "ingesting" | "ingested"
  | "drafting" | "draft_review" | "building" | "complete" | "error";

interface SlideFactoryRun {
  id: number;
  status: FactoryStatus;
  briefFilename: string | null;
  agentResults: Record<string, SlideAgentResultFE> | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SchedulerRecentRun {
  ranAt: string;
  status: "ok" | "warn" | "error";
  durationMs: number | null;
  notes: string | null;
  considered: number;
  succeeded: number;
  failed: number;
}

interface SchedulerRunRow {
  schedulerKey: string;
  schedulerLabel: string | null;
  lastRunAt: string | null;
  status: string | null;
  durationMs: number | null;
  notes: string | null;
  recentRuns: SchedulerRecentRun[];
}

/** Per-workflow detail returned by GET /api/admin/scheduler-runs/:key/last-run */
interface WorkflowRunDetail {
  workflowKey: string;
  name: string;
  lastRunStatus: string | null;
  lastRunError: string | null;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
}

interface SchedulerLastRun {
  schedulerKey: string;
  schedulerLabel: string | null;
  lastRunAt: string | null;
  status: string | null;
  notes: string | null;
  durationMs: number | null;
  considered: number | null;
  succeeded: number | null;
  failed: number | null;
  /** Only present for research-workflows key */
  workflows?: WorkflowRunDetail[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "—";
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (diffMs < 0) return "just now";
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

function formatAbsoluteTime(isoString: string | null): string {
  if (!isoString) return "—";
  const d = new Date(isoString);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1_000)}s`;
}

function normalizeStatus(raw: string): UnifiedRunStatus {
  const map: Record<string, UnifiedRunStatus> = {
    running: "running",
    completed: "completed",
    complete: "complete",
    error: "error",
    new: "new",
    brief_ready: "brief_ready",
    ingesting: "ingesting",
    ingested: "ingested",
    drafting: "drafting",
    draft_review: "draft_review",
    building: "building",
    ok: "completed",
    warn: "completed",
  };
  return map[raw] ?? "pending";
}

function statusVariant(status: UnifiedRunStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed" || status === "complete") return "default";
  if (status === "error") return "destructive";
  if (status === "running" || status === "building" || status === "drafting" || status === "ingesting") return "outline";
  return "secondary";
}

function statusLabel(status: UnifiedRunStatus): string {
  const map: Record<UnifiedRunStatus, string> = {
    running: "Running",
    completed: "Completed",
    complete: "Complete",
    error: "Error",
    pending: "Pending",
    new: "New",
    brief_ready: "Brief Ready",
    ingesting: "Ingesting",
    ingested: "Ingested",
    drafting: "Drafting",
    draft_review: "Draft Review",
    building: "Building",
  };
  return map[status] ?? status;
}

function isActiveRun(status: UnifiedRunStatus): boolean {
  return ["running", "building", "drafting", "ingesting"].includes(status);
}

const DATE_RANGE_OPTIONS = [
  { value: "7d",  label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
] as const;

type DateRange = "7d" | "30d" | "all";

function withinDateRange(isoString: string | null, range: DateRange): boolean {
  if (range === "all") return true;
  if (!isoString) return true;
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (range === "7d") return diffMs <= 7 * MS_PER_DAY;
  return diffMs <= 30 * MS_PER_DAY;
}

// ── Scheduler key classification ───────────────────────────────────────────

const ANALYST_SCHEDULER_KEYS: Record<string, string> = {
  "research-workflows": ORCHESTRATORS.gustavo.humanName,
  "constants-refresh": "Constants Refresh",
  "specialist-quality": "Specialist Quality",
  "specialist-photos-batch": "Fernanda",
};

const IRIS_SCHEDULER_KEYS: Record<string, string> = {
  "iris-health": AGENTS.iris.humanName,
  "iris-reindex": AGENTS.iris.humanName,
};

// ── Maya verdict display maps ──────────────────────────────────────────────

const MAYA_VERDICT_LABEL: Record<NonNullable<SlideAgentResultFE["mayaVerdict"]>, string> = {
  ok: "OK",
  advisory: "Advisory",
  warning: "Warning",
  block: "Block",
};

const MAYA_VERDICT_CLASS: Record<NonNullable<SlideAgentResultFE["mayaVerdict"]>, string> = {
  ok: "text-emerald-700 bg-emerald-50",
  advisory: "text-sky-700 bg-sky-50",
  warning: "text-amber-700 bg-amber-50",
  block: "text-red-700 bg-red-50",
};

// ── Type icon ─────────────────────────────────────────────────────────────

function RunTypeIcon({ type }: { type: RunType }) {
  if (type === "analyst") return <IconBrain className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  if (type === "iris") return <IconWand2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  return <IconBot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
}

// ── Run row ───────────────────────────────────────────────────────────────

function RunRow({ run, isSelected, onClick }: { run: UnifiedRun; isSelected: boolean; onClick: (id: string) => void }) {
  const active = isActiveRun(run.status);
  const timeStr = run.startedAt ?? run.completedAt;

  return (
    <button
      type="button"
      className={`w-full text-left flex items-start gap-3 py-3 border-b border-border/50 last:border-0 rounded transition-colors cursor-pointer group ${
        isSelected ? "bg-muted/50" : "hover:bg-muted/30"
      }`}
      data-testid={`run-row-${run.id}`}
      onClick={() => onClick(run.id)}
    >
      <div className="mt-0.5 shrink-0">
        {run.status === "completed" || run.status === "complete" ? (
          <IconCheckCircle weight="fill" className="w-4 h-4 text-success" />
        ) : run.status === "error" ? (
          <IconAlertCircle weight="fill" className="w-4 h-4 text-destructive" />
        ) : active ? (
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        ) : (
          <div className="w-4 h-4 rounded-full border-2 border-border" />
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <RunTypeIcon type={run.type} />
          <span className="text-sm font-medium text-foreground truncate">
            {run.agentName}
          </span>
          <span className="text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground uppercase tracking-wide leading-none">
            {run.agentRole}
          </span>
          <Badge
            variant={statusVariant(run.status)}
            className="text-[10px] h-4 px-1.5"
          >
            {statusLabel(run.status)}
          </Badge>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="shrink-0">
            {RUN_TYPE_LABELS[run.type]}
          </span>
          {timeStr && (
            <span className="shrink-0">{formatRelativeTime(timeStr)}</span>
          )}
          {run.durationMs != null && (
            <span className="font-mono tabular-nums shrink-0">
              {formatDuration(run.durationMs)}
            </span>
          )}
          {run.meta?.chunksIndexed != null && (
            <span className="shrink-0">
              {run.meta.chunksIndexed} chunks indexed
            </span>
          )}
        </div>

        {/* Per-slide failure summary — shown inline on error rows so admins
            can triage without opening the detail panel. */}
        {run.status === "error" && run.failedSlides && run.failedSlides.length > 0 && (
          <div className="flex flex-col gap-1 mt-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-medium text-destructive/80 uppercase tracking-wide leading-none">
                {run.failedSlides.length === 1
                  ? `Slide ${run.failedSlides[0].num} rejected`
                  : `Slides ${run.failedSlides.map((s) => s.num).join(", ")} rejected`}
              </span>
            </div>
            {run.failedSlides.map((s) =>
              s.reason ? (
                <p
                  key={s.num}
                  className="text-[10px] text-destructive/70 leading-tight truncate max-w-xs"
                  title={s.reason}
                >
                  Slide {s.num}: {s.reason}
                </p>
              ) : null,
            )}
          </div>
        )}
      </div>

      <ChevronRight className={`w-3.5 h-3.5 shrink-0 mt-1 transition-colors ${
        isSelected ? "text-muted-foreground" : "text-muted-foreground/40 group-hover:text-muted-foreground"
      }`} />
    </button>
  );
}

// ── Detail panel sub-components ────────────────────────────────────────────

/** Slide Factory detail: fetches full run to show per-slide agent results. */
function SlideFactoryDetail({ runId }: { runId: number }) {
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
      return s === "building" || s === "drafting" || s === "ingesting" ? RUNS_POLL_MS : false;
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
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <p className="text-sm text-destructive py-4">
        Failed to load run details.
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
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
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
            const result = agentResults[key] ?? null;
            const slotStatus = result?.status ?? (isBuilding ? "pending" : null);

            return (
              <div key={key} className="flex items-start gap-3 py-2.5">
                <div className="mt-0.5 shrink-0">
                  {slotStatus === "approved" ? (
                    <IconCheckCircle weight="fill" className="w-3.5 h-3.5 text-success" />
                  ) : slotStatus === "rejected" ? (
                    <IconAlertCircle weight="fill" className="w-3.5 h-3.5 text-destructive" />
                  ) : slotStatus === "running" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
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

/** Iris detail: shows chunksIndexed, errorsEncountered, trigger, modelUsed, and health summary. */
function IrisDetail({ run }: { run: UnifiedRun }) {
  const meta = run.meta ?? {};
  const hasErrors = (meta.errorsEncountered ?? 0) > 0;
  const health = meta.healthSummary as IrisHealthSummary | null | undefined;
  const isError = run.status === "error";

  return (
    <div className="space-y-4 mt-2">
      {/* Metadata */}
      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 space-y-1.5 text-xs">
        {meta.trigger && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Trigger</span>
            <span className="text-foreground capitalize">{String(meta.trigger)}</span>
          </div>
        )}
        {meta.modelUsed && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Model</span>
            <span className="font-mono">{String(meta.modelUsed)}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="text-muted-foreground w-28 shrink-0">Started</span>
          <span className="font-mono">{formatAbsoluteTime(run.startedAt)}</span>
        </div>
        {run.durationMs != null && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Duration</span>
            <span className="font-mono tabular-nums">{formatDuration(run.durationMs)}</span>
          </div>
        )}
        {health?.toolsInvoked != null && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Tools invoked</span>
            <span className="font-mono tabular-nums">
              {Array.isArray(health.toolsInvoked)
                ? health.toolsInvoked.length
                : health.toolsInvoked}
            </span>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2.5 text-center">
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {meta.chunksIndexed ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Chunks indexed</p>
        </div>
        <div className={`rounded-md border px-3 py-2.5 text-center ${
          hasErrors ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-muted/10"
        }`}>
          <p className={`text-2xl font-semibold tabular-nums ${hasErrors ? "text-destructive" : "text-foreground"}`}>
            {meta.errorsEncountered ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Errors encountered</p>
        </div>
      </div>

      {/* Error message from healthSummary */}
      {isError && health?.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <div className="flex items-start gap-2 mb-1.5">
            <IconAlertCircle weight="fill" className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs font-medium text-destructive">Error details</p>
          </div>
          <p className="text-xs text-destructive/90 break-words font-mono leading-relaxed pl-5">
            {health.error}
          </p>
        </div>
      )}

      {/* Agent summary from healthSummary (on success) */}
      {!isError && health?.summary && (
        <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2.5">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Agent summary</p>
          <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap break-words">
            {health.summary}
          </p>
        </div>
      )}

      {/* Individual error list (preferred when available) */}
      {hasErrors && !health?.error && health?.errors && health.errors.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-2 mb-1">
            <IconAlertCircle weight="fill" className="w-3.5 h-3.5 text-destructive shrink-0" />
            <p className="text-xs font-medium text-destructive">
              {health.errors.length} error{health.errors.length !== 1 ? "s" : ""} during indexing
            </p>
          </div>
          <ul className="space-y-1 pl-5">
            {health.errors.map((msg, i) => (
              <li key={i} className="text-xs text-destructive/90 font-mono leading-relaxed break-words">
                {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fallback: error count with no individual messages (older runs or caught exceptions) */}
      {hasErrors && !health?.error && (!health?.errors || health.errors.length === 0) && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <IconAlertCircle weight="fill" className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">
            {meta.errorsEncountered} error{Number(meta.errorsEncountered) !== 1 ? "s" : ""} were encountered during indexing.
          </p>
        </div>
      )}
    </div>
  );
}

/** Analyst / scheduler run detail: shows notes, considered/succeeded/failed counts, and timing.
 *
 * Task #1142 — also fetches /api/admin/scheduler-runs/:key/last-run to surface
 * probe result notes and per-workflow error messages inline, so admins don't
 * have to navigate to a separate Specialist admin page.
 */
function AnalystDetail({ run }: { run: UnifiedRun }) {
  const meta = run.meta ?? {};
  const hasCounts = meta.considered != null || meta.succeeded != null || meta.failed != null;

  const { data: lastRun, isLoading: lastRunLoading } = useQuery<SchedulerLastRun>({
    queryKey: ["scheduler-last-run", run.schedulerKey],
    queryFn: async () => {
      const r = await fetch(`/api/admin/scheduler-runs/${run.schedulerKey}/last-run`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to fetch run detail");
      return r.json() as Promise<SchedulerLastRun>;
    },
    enabled: !!run.schedulerKey,
    staleTime: 30_000,
  });

  const failedWorkflows = lastRun?.workflows?.filter(
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
          <span className="font-mono">{formatAbsoluteTime(run.startedAt ?? run.completedAt)}</span>
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
              <p className="text-xl font-semibold tabular-nums text-foreground">{meta.considered}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Considered</p>
            </div>
          )}
          {meta.succeeded != null && (
            <div className="rounded-md border border-border/60 bg-muted/10 px-2 py-2 text-center">
              <p className="text-xl font-semibold tabular-nums text-foreground">{meta.succeeded}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Succeeded</p>
            </div>
          )}
          {meta.failed != null && (
            <div className={`rounded-md border px-2 py-2 text-center ${
              Number(meta.failed) > 0 ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-muted/10"
            }`}>
              <p className={`text-xl font-semibold tabular-nums ${Number(meta.failed) > 0 ? "text-destructive" : "text-foreground"}`}>
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
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading probe detail…
            </div>
          )}

          {/* Cycle-level error notes from the server (when not already shown via meta.notes) */}
          {!lastRunLoading && lastRun?.notes && lastRun.notes !== String(meta.notes ?? "") && (
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
                    <IconAlertCircle weight="fill" className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                    <p className="text-xs font-medium text-destructive leading-tight">{w.name}</p>
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

          {/* All workflow statuses (when research-workflows, show full list) */}
          {!lastRunLoading && allWorkflows.length > 0 && failedWorkflows.length === 0 && (
            <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground mb-2">Workflow results</p>
              <div className="divide-y divide-border/50">
                {allWorkflows.map((w) => {
                  const isOk = w.lastRunStatus === "completed" || w.lastRunStatus === "running";
                  return (
                    <div key={w.workflowKey} className="flex items-center gap-2 py-1.5">
                      {isOk ? (
                        <IconCheckCircle weight="fill" className="w-3 h-3 text-success shrink-0" />
                      ) : (
                        <div className="w-3 h-3 rounded-full border-2 border-border shrink-0" />
                      )}
                      <span className="text-xs text-foreground flex-1 min-w-0 truncate">{w.name}</span>
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

          {/* Mixed state: some workflows failed, show all for context */}
          {!lastRunLoading && allWorkflows.length > failedWorkflows.length && failedWorkflows.length > 0 && (
            <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground mb-2">All workflows</p>
              <div className="divide-y divide-border/50">
                {allWorkflows.map((w) => {
                  const failed = w.lastRunStatus === "failed" || !!w.lastRunError;
                  return (
                    <div key={w.workflowKey} className="flex items-center gap-2 py-1.5">
                      {!failed ? (
                        <IconCheckCircle weight="fill" className="w-3 h-3 text-success shrink-0" />
                      ) : (
                        <IconAlertCircle weight="fill" className="w-3 h-3 text-destructive shrink-0" />
                      )}
                      <span className={`text-xs flex-1 min-w-0 truncate ${failed ? "text-destructive" : "text-foreground"}`}>
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
          {!lastRunLoading && !lastRun?.notes && allWorkflows.length === 0 && !hasCounts && !meta.notes && (
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

// ── Run detail panel ───────────────────────────────────────────────────────

function RunDetailPanel({
  run,
  onClose,
}: {
  run: UnifiedRun | null;
  onClose: () => void;
}) {
  const active = run ? isActiveRun(run.status) : false;
  const timeStr = run?.startedAt ?? run?.completedAt ?? null;

  return (
    <Sheet open={run != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        className="w-full sm:max-w-[520px] overflow-y-auto"
        aria-describedby="run-detail-desc"
      >
        {run && (
          <>
            <SheetHeader className="pr-6">
              <div className="flex items-center gap-2">
                <RunTypeIcon type={run.type} />
                <SheetTitle className="text-base leading-tight">{run.agentName}</SheetTitle>
                <Badge
                  variant={statusVariant(run.status)}
                  className="text-[10px] h-4 px-1.5 ml-1"
                >
                  {active && <Loader2 className="w-2.5 h-2.5 animate-spin mr-1" />}
                  {statusLabel(run.status)}
                </Badge>
              </div>
              <SheetDescription id="run-detail-desc" className="text-xs">
                {run.agentRole} · {RUN_TYPE_LABELS[run.type]}
                {timeStr ? ` · ${formatRelativeTime(timeStr)}` : ""}
                {run.durationMs != null ? ` · ${formatDuration(run.durationMs)}` : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4">
              {run.type === "slide" && run.slideFactoryRunId != null ? (
                <SlideFactoryDetail runId={run.slideFactoryRunId} />
              ) : run.type === "iris" ? (
                <IrisDetail run={run} />
              ) : (
                <AnalystDetail run={run} />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Data hooks ─────────────────────────────────────────────────────────────

function useIrisRun() {
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

function useSlideFactoryRuns() {
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

function useSchedulerRuns() {
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

// ── Main page ──────────────────────────────────────────────────────────────

export default function UnifiedRunsPage() {
  const [typeFilter, setTypeFilter] = useState<RunType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "completed" | "error">("all");
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [agentSearch, setAgentSearch] = useState("");
  /**
   * ID of the selected run. We store just the ID and derive the full
   * UnifiedRun from the latest `runs` memo so the panel stays live as
   * queries refresh (real-time updates without a separate fetch).
   */
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

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
      // Derive rejected slides from agentResults so the row can display them
      // without an extra API call — the list endpoint returns the full row.
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
          meta: {
            notes: row.notes,
          },
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

  // Derive the selected run from the live runs array so the panel reflects
  // the latest state whenever queries refresh (real-time for all run types).
  const selectedRun = useMemo(
    () => (selectedRunId ? (runs.find((r) => r.id === selectedRunId) ?? null) : null),
    [selectedRunId, runs],
  );


  const filtered = useMemo(() => {
    const searchLower = agentSearch.trim().toLowerCase();
    return runs.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (statusFilter === "running" && !isActiveRun(r.status)) return false;
      if (statusFilter === "completed" && r.status !== "completed" && r.status !== "complete") return false;
      if (statusFilter === "error" && r.status !== "error") return false;
      if (!withinDateRange(r.startedAt, dateRange)) return false;
      if (searchLower && !r.agentName.toLowerCase().includes(searchLower) && !r.agentRole.toLowerCase().includes(searchLower)) return false;
      return true;
    });
  }, [runs, typeFilter, statusFilter, dateRange, agentSearch]);

  const activeCount = runs.filter((r) => isActiveRun(r.status)).length;

  return (
    <div className="space-y-6" data-testid="unified-runs-page">
      {/* Filter bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3 flex-wrap">
            <IconList className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-muted-foreground shrink-0">Filter:</span>

            <Input
              placeholder="Search agent…"
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
              className="h-8 w-[160px] text-xs"
            />

            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as RunType | "all")}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="analyst">{RUN_TYPE_LABELS.analyst}</SelectItem>
                <SelectItem value="slide">{RUN_TYPE_LABELS.slide}</SelectItem>
                <SelectItem value="iris">{RUN_TYPE_LABELS.iris}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="running">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>

            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(typeFilter !== "all" || statusFilter !== "all" || dateRange !== "30d" || agentSearch !== "") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => {
                  setTypeFilter("all");
                  setStatusFilter("all");
                  setDateRange("30d");
                  setAgentSearch("");
                }}
              >
                Clear filters
              </Button>
            )}

            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              {activeCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {activeCount} active
                </span>
              )}
              <span className="tabular-nums font-mono">{filtered.length} runs</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Run list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <IconList className="w-4 h-4 text-muted-foreground" />
            Run Log
            <span className="text-xs font-normal text-muted-foreground ml-1">— click any row to see details</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No runs found for the selected filters.</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs"
                onClick={() => {
                  setTypeFilter("all");
                  setStatusFilter("all");
                  setDateRange("all");
                }}
              >
                Show all runs
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filtered.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  isSelected={run.id === selectedRunId}
                  onClick={setSelectedRunId}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-x-6 gap-y-2 flex-wrap text-xs text-muted-foreground px-1">
        <span className="flex items-center gap-1.5">
          <IconBrain className="w-3.5 h-3.5" />
          {ANALYST_BRAND} — research Specialist runs
        </span>
        <span className="flex items-center gap-1.5">
          <IconBot className="w-3.5 h-3.5" />
          {RUN_TYPE_LABELS.slide} — {ORCHESTRATORS.marco.humanName} orchestrated deck builds
        </span>
        <span className="flex items-center gap-1.5">
          <IconWand2 className="w-3.5 h-3.5" />
          {AGENTS.iris.humanName} — knowledge base maintenance runs
        </span>
      </div>

      {/* Run detail panel — derives run from live runs array for real-time updates */}
      <RunDetailPanel run={selectedRun} onClose={() => setSelectedRunId(null)} />
    </div>
  );
}
