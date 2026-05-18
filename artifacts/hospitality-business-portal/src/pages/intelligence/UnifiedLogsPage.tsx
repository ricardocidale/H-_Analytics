/**
 * UnifiedLogsPage — aggregates all agent run types and self-tests in a
 * single, filterable log. Renamed from UnifiedRunsPage (Task #1403).
 *
 * Tabs:
 *   Runs       — Analyst, Slide Factory, Iris pipeline runs (existing)
 *   Self-tests — entity self-test history (new, 30d default cadence)
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Loader2 } from "@/components/icons/themed-icons";
import { RUN_TYPE_LABELS, ANALYST_BRAND, AGENTS, ORCHESTRATORS, type RunType } from "@/lib/agent-taxonomy";
import { IconList, IconBot, IconBrain, IconWand2, IconActivity } from "@/components/icons";
import {
  statusVariant,
  statusLabel,
  isActiveRun,
  withinDateRange,
  formatRelativeTime,
  formatDuration,
  DATE_RANGE_OPTIONS,
  type DateRange,
  type UnifiedRun,
} from "./unified-runs-utils";
import { useUnifiedRuns } from "./unified-runs-hooks";
import { RunTypeIcon, RunRow } from "./UnifiedRunsRow";
import { SlideFactoryDetail } from "./UnifiedRunsDetails/SlideFactoryDetail";
import { IrisDetail } from "./UnifiedRunsDetails/IrisDetail";
import { AnalystDetail } from "./UnifiedRunsDetails/AnalystDetail";

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
                  {active && <Loader2 className="w-2.5 h-2.5 animate-spin mr-1 text-accent-pop" />}
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

// ── Self-tests tab ─────────────────────────────────────────────────────────

type SelfTestOutcome = "pass" | "warn" | "fail";

interface SelfTestLogRow {
  id: string;
  entityKind: string;
  entityId: string;
  entityName: string;
  outcome: SelfTestOutcome;
  durationMs: number | null;
  ranAt: string;
  summary?: string | null;
  details?: string;
  // Configured self-test cadence for this entity in days. null/undefined
  // means the entity is using the 30-day system default. Surfaced as a
  // tooltip on each row so admins can see the cadence at a glance.
  selfTestIntervalDays?: number | null;
}

interface SelfTestLogsResponse {
  logs: SelfTestLogRow[];
  generatedAt?: string;
  limit?: number;
}

const SELF_TEST_LOGS_POLL_MS = 30_000;
const SELF_TEST_DEFAULT_INTERVAL_DAYS = 30;

function selfTestIntervalTooltip(intervalDays: number | null | undefined): string {
  if (intervalDays == null) {
    return `Runs every ${SELF_TEST_DEFAULT_INTERVAL_DAYS} days (system default)`;
  }
  return `Runs every ${intervalDays} day${intervalDays === 1 ? "" : "s"} (per-entity override)`;
}

function useSelfTestLogs(params: { entityKind: string; outcome: string; dateRange: DateRange }) {
  const search = new URLSearchParams();
  if (params.entityKind !== "all") search.set("entityKind", params.entityKind);
  if (params.outcome !== "all") search.set("outcome", params.outcome);
  search.set("dateRange", params.dateRange);
  const qs = search.toString();
  return useQuery<SelfTestLogsResponse>({
    queryKey: ["/api/admin/intelligence/self-test-logs", params.entityKind, params.outcome, params.dateRange],
    queryFn: async () => {
      const res = await fetch(`/api/admin/intelligence/self-test-logs?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load self-test logs (${res.status})`);
      return res.json() as Promise<SelfTestLogsResponse>;
    },
    refetchInterval: SELF_TEST_LOGS_POLL_MS,
  });
}

function outcomeVariant(outcome: SelfTestOutcome): "default" | "destructive" | "outline" | "secondary" {
  if (outcome === "pass") return "default";
  if (outcome === "warn") return "outline";
  return "destructive";
}

function outcomeLabel(outcome: SelfTestOutcome): string {
  if (outcome === "pass") return "Pass";
  if (outcome === "warn") return "Warn";
  return "Fail";
}

function SelfTestsTab() {
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("30d");

  const { data, isLoading } = useSelfTestLogs({
    entityKind: kindFilter,
    outcome: outcomeFilter,
    dateRange,
  });

  const logs: SelfTestLogRow[] = data?.logs ?? [];

  const filtered = useMemo(() => {
    return logs.filter((r) => {
      if (kindFilter !== "all" && r.entityKind !== kindFilter) return false;
      if (outcomeFilter !== "all" && r.outcome !== outcomeFilter) return false;
      if (!withinDateRange(r.ranAt, dateRange)) return false;
      return true;
    });
  }, [logs, kindFilter, outcomeFilter, dateRange]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3 flex-wrap">
            <IconActivity className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-muted-foreground shrink-0">Filter:</span>

            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue placeholder="All entity kinds" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="specialist">Specialist</SelectItem>
                <SelectItem value="minion">Minion</SelectItem>
                <SelectItem value="table">Table</SelectItem>
                <SelectItem value="api">API</SelectItem>
                <SelectItem value="url">URL Link</SelectItem>
                <SelectItem value="llm">LLM</SelectItem>
                <SelectItem value="rebecca">Rebecca</SelectItem>
              </SelectContent>
            </Select>

            <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="All outcomes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                <SelectItem value="pass">Pass</SelectItem>
                <SelectItem value="warn">Warn</SelectItem>
                <SelectItem value="fail">Fail</SelectItem>
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

            {(kindFilter !== "all" || outcomeFilter !== "all" || dateRange !== "30d") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => {
                  setKindFilter("all");
                  setOutcomeFilter("all");
                  setDateRange("30d");
                }}
              >
                Clear filters
              </Button>
            )}

            <div className="ml-auto text-xs text-muted-foreground tabular-nums font-mono">
              {filtered.length} entries
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <IconActivity className="w-4 h-4 text-muted-foreground" />
            Self-test Log
            <span className="text-xs font-normal text-muted-foreground ml-1">
              — entity health probes running on a 30-day default cadence
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-accent-pop" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No self-test records found for the selected filters.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Self-tests run on a 30-day cadence by default. Admins can adjust the interval per entity.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filtered.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 py-2.5 px-1"
                  title={selfTestIntervalTooltip(log.selfTestIntervalDays)}
                  data-testid={`self-test-row-${log.id}`}
                >
                  <Badge variant={outcomeVariant(log.outcome)} className="text-[10px] h-5 px-2 shrink-0">
                    {outcomeLabel(log.outcome)}
                  </Badge>
                  <span className="text-xs font-medium truncate flex-1">{log.entityName}</span>
                  <span className="text-xs text-muted-foreground shrink-0 capitalize">{log.entityKind}</span>
                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{formatDuration(log.durationMs)}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatRelativeTime(log.ranAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Runs tab ───────────────────────────────────────────────────────────────

function RunsTab() {
  const [typeFilter, setTypeFilter] = useState<RunType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "completed" | "error">("all");
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [agentSearch, setAgentSearch] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const { runs, isLoading } = useUnifiedRuns();

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
      if (
        searchLower &&
        !r.agentName.toLowerCase().includes(searchLower) &&
        !r.agentRole.toLowerCase().includes(searchLower)
      )
        return false;
      return true;
    });
  }, [runs, typeFilter, statusFilter, dateRange, agentSearch]);

  const activeCount = runs.filter((r) => isActiveRun(r.status)).length;

  return (
    <div className="space-y-4">
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
                  <Loader2 className="w-3 h-3 animate-spin text-accent-pop" />
                  {activeCount} active
                </span>
              )}
              <span className="tabular-nums font-mono">{filtered.length} entries</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <IconList className="w-4 h-4 text-muted-foreground" />
            Run Log
            <span className="text-xs font-normal text-muted-foreground ml-1">
              — click any row to see details
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-accent-pop" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No entries found for the selected filters.
              </p>
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
                Show all entries
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

      <RunDetailPanel run={selectedRun} onClose={() => setSelectedRunId(null)} />
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function UnifiedLogsPage() {
  return (
    <div className="space-y-4" data-testid="unified-logs-page">
      <CollapsibleSection
        defaultOpenAll
        items={[
          {
            id: "runs",
            summary: (
              <span className="flex items-center gap-2">
                <IconList className="w-4 h-4 shrink-0" />
                Runs
              </span>
            ),
            expandedContent: <RunsTab />,
          },
          {
            id: "self-tests",
            summary: (
              <span className="flex items-center gap-2">
                <IconActivity className="w-4 h-4 shrink-0" />
                Self-tests
              </span>
            ),
            expandedContent: <SelfTestsTab />,
          },
        ]}
      />
    </div>
  );
}
