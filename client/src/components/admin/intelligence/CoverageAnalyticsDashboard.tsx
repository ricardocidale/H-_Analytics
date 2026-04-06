import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useScenarios } from "@/lib/api/scenarios";
import { cn } from "@/lib/utils";

interface CoverageSummary {
  totalMapped: number;
  freshCount: number;
  staleCount: number;
  missingCount: number;
  freshPct: number;
}

interface CoverageEntity {
  entityType: string;
  entityId: number;
  name: string;
  totalFields: number;
  freshCount: number;
  staleCount: number;
  coveragePct: number;
  lastUpdated: string | null;
}

interface CoverageResponse {
  summary: CoverageSummary;
  entities: CoverageEntity[];
}

interface EntityDetail {
  entityType: string;
  entityId: number;
  totalFields: number;
  freshCount: number;
  staleCount: number;
  fields: Array<{
    id: number;
    assumptionKey: string;
    status: "fresh" | "stale";
    confidence: string | null;
    valueLow: number | null;
    valueMid: number | null;
    valueHigh: number | null;
    sourceName: string | null;
    updatedAt: string;
  }>;
  lastRun: {
    id: number;
    tier: number;
    status: string;
    startedAt: string;
    completedAt: string | null;
    tokensUsed: number | null;
  } | null;
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border border-border/80 bg-card p-5" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn("text-2xl font-bold mt-1", color)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function StatusDot({ status }: { status: "fresh" | "stale" | "missing" }) {
  const colors = {
    fresh: "bg-emerald-500",
    stale: "bg-amber-500",
    missing: "bg-zinc-300 dark:bg-zinc-600",
  };
  return <span className={cn("inline-block w-2 h-2 rounded-full", colors[status])} />;
}

function coverageColor(pct: number): string {
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function coverageBgColor(pct: number): string {
  if (pct >= 80) return "bg-emerald-500/10 border-emerald-500/20";
  if (pct >= 50) return "bg-amber-500/10 border-amber-500/20";
  return "bg-red-500/10 border-red-500/20";
}

export default function CoverageAnalyticsDashboard() {
  const [scenarioId, setScenarioId] = useState<number | undefined>(undefined);
  const [selectedEntity, setSelectedEntity] = useState<{ type: string; id: number } | null>(null);
  const { data: scenarios } = useScenarios();

  const { data, isLoading, isError } = useQuery<CoverageResponse>({
    queryKey: ["admin-coverage", scenarioId],
    queryFn: async () => {
      const url = scenarioId
        ? `/api/admin/coverage?scenarioId=${scenarioId}`
        : "/api/admin/coverage";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch coverage");
      return res.json();
    },
  });

  const { data: detail, isLoading: detailLoading, isError: detailError } = useQuery<EntityDetail>({
    queryKey: ["admin-coverage-detail", selectedEntity?.type, selectedEntity?.id, scenarioId],
    queryFn: async () => {
      if (!selectedEntity) return null;
      const url = scenarioId
        ? `/api/admin/coverage/${selectedEntity.type}/${selectedEntity.id}?scenarioId=${scenarioId}`
        : `/api/admin/coverage/${selectedEntity.type}/${selectedEntity.id}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch entity coverage");
      return res.json();
    },
    enabled: !!selectedEntity,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="coverage-loading">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3" data-testid="coverage-error">
        <span className="text-3xl">⚠️</span>
        <p className="text-sm text-muted-foreground">Failed to load coverage analytics. Please try again.</p>
      </div>
    );
  }

  const summary = data?.summary;
  const entities = data?.entities ?? [];

  return (
    <div className="space-y-6" data-testid="coverage-analytics-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Research coverage across all entities. Green = fresh ({"<"}7d), amber = stale, gray = no data.
          </p>
        </div>
        <select
          value={scenarioId ?? ""}
          onChange={e => setScenarioId(e.target.value ? Number(e.target.value) : undefined)}
          className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground"
          data-testid="select-scenario"
        >
          <option value="">All Scenarios</option>
          {scenarios?.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Mapped" value={summary.totalMapped} sub="assumption fields" color="text-foreground" />
          <StatCard label="Fresh" value={`${summary.freshPct}%`} sub={`${summary.freshCount} fields`} color="text-emerald-600 dark:text-emerald-400" />
          <StatCard label="Stale" value={summary.staleCount} sub="> 7 days old" color="text-amber-600 dark:text-amber-400" />
          <StatCard label="Missing" value={summary.missingCount} sub="no research data" color="text-red-600 dark:text-red-400" />
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Entity Coverage Heatmap</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {entities.map(entity => {
            const isSelected = selectedEntity?.type === entity.entityType && selectedEntity?.id === entity.entityId;
            return (
              <button
                key={`${entity.entityType}-${entity.entityId}`}
                onClick={() => setSelectedEntity({ type: entity.entityType, id: entity.entityId })}
                data-testid={`coverage-entity-${entity.entityType}-${entity.entityId}`}
                className={cn(
                  "text-left rounded-xl border p-4 transition-all duration-150 cursor-pointer",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : cn("hover:border-primary/40", coverageBgColor(entity.coveragePct))
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase">
                    {entity.entityType === "company" ? "Company" : "Property"}
                  </span>
                  <span className={cn("text-sm font-bold", coverageColor(entity.coveragePct))}>
                    {entity.coveragePct}%
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground truncate">{entity.name}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><StatusDot status="fresh" /> {entity.freshCount}</span>
                  <span className="flex items-center gap-1"><StatusDot status="stale" /> {entity.staleCount}</span>
                  <span className="flex items-center gap-1"><StatusDot status="missing" /> {Math.max(0, (entity.entityType === "company" ? 20 : 53) - entity.totalFields)}</span>
                </div>
                {entity.lastUpdated && (
                  <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                    Updated {new Date(entity.lastUpdated).toLocaleDateString()}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedEntity && (
        <div className="rounded-xl border border-border/80 bg-card p-5" data-testid="coverage-detail-panel">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {entities.find(e => e.entityType === selectedEntity.type && e.entityId === selectedEntity.id)?.name ?? "Entity"}
              </h3>
              <p className="text-xs text-muted-foreground">Assumption-level coverage detail</p>
            </div>
            <button
              onClick={() => setSelectedEntity(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
              data-testid="button-close-detail"
            >
              Close
            </button>
          </div>

          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : detailError ? (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2" data-testid="coverage-detail-error">
              <p className="text-sm text-muted-foreground">Failed to load entity details.</p>
            </div>
          ) : detail ? (
            <div className="space-y-4">
              {detail.lastRun && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  <span>Last run: Tier {detail.lastRun.tier}</span>
                  <span>Status: {detail.lastRun.status}</span>
                  {detail.lastRun.tokensUsed && <span>Tokens: {detail.lastRun.tokensUsed.toLocaleString()}</span>}
                  {detail.lastRun.completedAt && (
                    <span>{new Date(detail.lastRun.completedAt).toLocaleString()}</span>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[400px] overflow-y-auto scrollbar-thin">
                {detail.fields.map(field => (
                  <div
                    key={field.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted/50 text-xs"
                    data-testid={`field-${field.assumptionKey}`}
                  >
                    <StatusDot status={field.status} />
                    <span className="font-mono text-muted-foreground flex-1 truncate">{field.assumptionKey}</span>
                    {field.confidence && (
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-medium",
                        field.confidence === "high" ? "bg-emerald-500/10 text-emerald-600" :
                        field.confidence === "medium" ? "bg-amber-500/10 text-amber-600" :
                        "bg-red-500/10 text-red-600"
                      )}>
                        {field.confidence}
                      </span>
                    )}
                    {field.valueMid != null && (
                      <span className="text-foreground font-medium">{field.valueMid.toFixed(2)}</span>
                    )}
                  </div>
                ))}
                {detail.fields.length === 0 && (
                  <p className="col-span-2 text-sm text-muted-foreground text-center py-4">No assumption guidance data for this entity yet.</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
