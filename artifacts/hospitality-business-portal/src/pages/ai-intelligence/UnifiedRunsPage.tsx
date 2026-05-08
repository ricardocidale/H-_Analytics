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
import { useQuery } from "@tanstack/react-query";
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
import { Loader2 } from "@/components/icons/themed-icons";
import { IconCheckCircle, IconAlertCircle } from "@/components/icons/status-icons";
import { IconList, IconBot, IconBrain, IconWand2 } from "@/components/icons";
import {
  RUN_TYPE_LABELS,
  ANALYST_BRAND,
  AGENTS,
  ORCHESTRATORS,
  type RunType,
} from "@/lib/agent-taxonomy";

// ── Named constants ────────────────────────────────────────────────────────

/** Poll interval while any run is in progress (ms). */
const RUNS_POLL_MS = 8_000;

/** Number of Slide Factory runs to request. */
const SLIDE_RUNS_LIMIT = 20;

const MS_PER_MINUTE = 60 * 1_000;
const MS_PER_HOUR = 60 * 60 * 1_000;
const MS_PER_DAY = 24 * 60 * 60 * 1_000;

// ── Types ─────────────────────────────────────────────────────────────────

type UnifiedRunStatus = "running" | "completed" | "complete" | "error" | "pending" | "new" | "brief_ready" | "ingesting" | "ingested" | "drafting" | "draft_review" | "building";

interface UnifiedRun {
  id: string;
  type: RunType;
  agentName: string;
  agentRole: string;
  status: UnifiedRunStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  detailLink?: string;
  meta?: Record<string, string | number | null>;
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
}

interface IrisStatus {
  lastRun: IrisLastRun | null;
  gapsCount: number;
}

interface SlideFactoryRun {
  id: number;
  status: string;
  briefFilename: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SchedulerRecentRun {
  ranAt: string;
  status: "ok" | "warn" | "error";
  durationMs: number | null;
}

interface SchedulerRunRow {
  schedulerKey: string;
  schedulerLabel: string | null;
  lastRunAt: string | null;
  status: string | null;
  durationMs: number | null;
  recentRuns: SchedulerRecentRun[];
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
// Only a subset of scheduler keys represent agent runs in the taxonomy.
// Keys not listed here are infra/maintenance cycles and are excluded from
// the unified run log.

/**
 * Scheduler keys that represent Analyst-tier runs (specialist research cycles).
 * Maps schedulerKey → user-facing agent name.
 */
const ANALYST_SCHEDULER_KEYS: Record<string, string> = {
  "research-workflows": ORCHESTRATORS.gustavo.humanName,
  "constants-refresh": "Constants Refresh",
  "specialist-quality": "Specialist Quality",
  "specialist-photos-batch": "Fernanda",
};

/**
 * Scheduler keys that represent Iris-tier runs.
 * Maps schedulerKey → user-facing agent name.
 */
const IRIS_SCHEDULER_KEYS: Record<string, string> = {
  "iris-health": AGENTS.iris.humanName,
  "iris-reindex": AGENTS.iris.humanName,
};

// ── Type icon ─────────────────────────────────────────────────────────────

function RunTypeIcon({ type }: { type: RunType }) {
  if (type === "analyst") return <IconBrain className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  if (type === "iris") return <IconWand2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  return <IconBot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
}

// ── Run row ───────────────────────────────────────────────────────────────

function RunRow({ run }: { run: UnifiedRun }) {
  const active = isActiveRun(run.status);
  const timeStr = run.startedAt ?? run.completedAt;
  const Wrapper = run.detailLink
    ? ({ children }: { children: React.ReactNode }) => (
        <a
          href={run.detailLink}
          className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0 hover:bg-muted/30 rounded transition-colors cursor-pointer"
          data-testid={`run-row-${run.id}`}
        >
          {children}
        </a>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <div
          className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0"
          data-testid={`run-row-${run.id}`}
        >
          {children}
        </div>
      );

  return (
    <Wrapper>
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
      </div>
    </Wrapper>
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
        },
      });
    }

    // Slide Factory runs
    for (const run of slideRuns) {
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
        detailLink: `/lb-slides`,
        meta: run.briefFilename ? { brief: run.briefFilename } : undefined,
      });
    }

    // Scheduler runs — only include keys with a known taxonomy type (analyst or iris)
    for (const row of schedulerRuns) {
      const analystName = ANALYST_SCHEDULER_KEYS[row.schedulerKey];
      const irisName = IRIS_SCHEDULER_KEYS[row.schedulerKey];
      const agentName = analystName ?? irisName;
      const runType: RunType | null = analystName ? "analyst" : irisName ? "iris" : null;

      // Skip scheduler keys that are infra/maintenance cycles (not agent-taxonomy runs)
      if (!runType || !agentName) continue;

      const agentRole = runType === "analyst" ? "Analyst" : AGENTS.iris.role;

      if (row.recentRuns && row.recentRuns.length > 0) {
        // Use the per-run history so this is a real log, not just a snapshot
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
          });
        }
      } else if (row.lastRunAt) {
        // Fallback: no run history strip — use the last-run snapshot
        out.push({
          id: `scheduler-${row.schedulerKey}`,
          type: runType,
          agentName,
          agentRole,
          status: normalizeStatus(row.status ?? "completed"),
          startedAt: row.lastRunAt,
          completedAt: row.lastRunAt,
          durationMs: row.durationMs,
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
                <RunRow key={run.id} run={run} />
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
    </div>
  );
}
