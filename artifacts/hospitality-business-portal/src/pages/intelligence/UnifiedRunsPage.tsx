/**
 * UnifiedRunsPage — aggregates all agent run types in a single, filterable log.
 * Run types: Analyst, Slide Factory, Iris. Out of scope: DB schema changes.
 */

import { useState, useMemo } from "react";
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
import { RUN_TYPE_LABELS, ANALYST_BRAND, AGENTS, ORCHESTRATORS, type RunType } from "@/lib/agent-taxonomy";
import { IconList, IconBot, IconBrain, IconWand2 } from "@/components/icons";
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

// ── Main page ──────────────────────────────────────────────────────────────

export default function UnifiedRunsPage() {
  const [typeFilter, setTypeFilter] = useState<RunType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "completed" | "error">("all");
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [agentSearch, setAgentSearch] = useState("");
  /**
   * ID of the selected run. Derived from the live `runs` array so the panel
   * reflects real-time updates without a separate fetch.
   */
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
                  <Loader2 className="w-3 h-3 animate-spin text-accent-pop" />
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
                No runs found for the selected filters.
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
