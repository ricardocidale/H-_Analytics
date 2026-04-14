import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePanelManager } from "@/lib/panel-manager";
import { RelaxationTrailStepper, type RelaxationStep } from "./RelaxationTrailStepper";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  FileText,
  RefreshCw,
  Shield,
  TrendingUp,
  Lock,
  X as XIcon,
  Minus,
} from "lucide-react";

interface GuidanceRecord {
  id: number;
  scenarioId: number | null;
  entityType: string;
  entityId: number;
  assumptionKey: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
  confidence: string | null;
  sourceName: string | null;
  sourceDate: string | null;
  reasoning: string | null;
  comparableSet: unknown;
  relaxationLevel: number | null;
  researchRunId: number | null;
  createdAt: string;
  updatedAt: string;
}

function GuidanceSideSheet() {
  const { activePanel, guidanceContext, closeAll } = usePanelManager();
  const queryClient = useQueryClient();
  const isOpen = activePanel === "guidance" && !!guidanceContext;

  const { data: guidanceRecord, isLoading } = useQuery<GuidanceRecord | null>({
    queryKey: [
      "guidance",
      guidanceContext?.entityType,
      guidanceContext?.entityId,
      guidanceContext?.assumptionKey,
      guidanceContext?.scenarioId,
    ],
    queryFn: async () => {
      if (!guidanceContext) return null;
      const params = new URLSearchParams();
      if (guidanceContext.scenarioId) params.set("scenarioId", String(guidanceContext.scenarioId));
      const res = await apiRequest(
        "GET",
        `/api/guidance/${guidanceContext.entityType}/${guidanceContext.entityId}/${guidanceContext.assumptionKey}?${params}`
      );
      return res.json();
    },
    enabled: isOpen,
    staleTime: 30_000,
  });

  const decisionMutation = useMutation({
    mutationFn: async (params: { action: string; newValue?: number | null }) => {
      if (!guidanceRecord) return;
      const res = await apiRequest("POST", "/api/guidance/decision", {
        assumptionGuidanceId: guidanceRecord.id,
        action: params.action,
        previousValue: guidanceContext?.currentValue ?? null,
        newValue: params.newValue ?? null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guidance"] });
    },
  });

  const deepDiveMutation = useMutation({
    mutationFn: async () => {
      if (!guidanceContext) return;
      const res = await apiRequest("POST", "/api/guidance/deep-dive", {
        entityType: guidanceContext.entityType,
        entityId: guidanceContext.entityId,
        assumptionKeys: [guidanceContext.assumptionKey],
        scenarioId: guidanceContext.scenarioId ?? undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guidance"] });
    },
  });

  const fieldLabel = guidanceContext?.fieldLabel ?? guidanceContext?.assumptionKey ?? "";

  const confidenceConfig = getConfidenceConfig(guidanceRecord?.confidence);
  const freshness = guidanceRecord ? getFreshness(guidanceRecord.updatedAt) : null;

  const comps = React.useMemo(() => {
    if (!guidanceRecord?.comparableSet) return [];
    const cs = guidanceRecord.comparableSet as { properties?: Array<{ name: string; value: number; market?: string }> };
    return cs.properties ?? [];
  }, [guidanceRecord?.comparableSet]);

  const relaxationTraces: RelaxationStep[] = React.useMemo(() => {
    if (!guidanceRecord?.comparableSet) return [];
    const cs = guidanceRecord.comparableSet as { relaxationTraces?: RelaxationStep[] };
    return cs.relaxationTraces ?? [];
  }, [guidanceRecord?.comparableSet]);

  return (
    <Sheet open={isOpen} onOpenChange={(o) => { if (!o) closeAll(); }}>
      <SheetContent
        side="right"
        className="w-full sm:w-[480px] sm:max-w-[480px] p-0 flex flex-col overflow-hidden"
        data-testid="guidance-side-sheet"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/40 shrink-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold truncate" data-testid="guidance-field-label">
                {fieldLabel}
              </SheetTitle>
              <SheetDescription className="text-xs mt-0.5 flex items-center gap-2">
                <span className="capitalize">{guidanceContext?.entityType}</span>
                {freshness && (
                  <span className={cn("flex items-center gap-1", freshness.color)}>
                    <Clock className="h-3 w-3" />
                    {freshness.label}
                  </span>
                )}
              </SheetDescription>
            </div>
            <button
              type="button"
              onClick={closeAll}
              className="rounded-sm opacity-70 hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2"
              data-testid="guidance-close-button"
              aria-label="Close guidance panel"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground" data-testid="guidance-loading">
            Loading guidance...
          </div>
        ) : !guidanceRecord ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3" data-testid="guidance-empty">
            <FileText className="h-10 w-10 text-muted-foreground/30" />
            <div className="text-sm text-muted-foreground">No research guidance available for this field yet.</div>
            <button
              type="button"
              onClick={() => deepDiveMutation.mutate()}
              disabled={deepDiveMutation.isPending}
              className="text-xs font-medium text-accent-pop hover:underline disabled:opacity-50"
              data-testid="guidance-run-research"
            >
              {deepDiveMutation.isPending ? "Running..." : "Run Deep-Dive Research"}
            </button>
          </div>
        ) : (
          <>
            <Tabs defaultValue="recommendation" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="shrink-0 mx-5 mt-3 bg-muted/40 p-0.5 h-9" data-testid="guidance-tabs">
                <TabsTrigger value="recommendation" className="text-xs h-8" data-testid="tab-recommendation">
                  Range
                </TabsTrigger>
                <TabsTrigger value="peers" className="text-xs h-8" data-testid="tab-peers">
                  Peers
                </TabsTrigger>
                <TabsTrigger value="provenance" className="text-xs h-8" data-testid="tab-provenance">
                  Trail
                </TabsTrigger>
                <TabsTrigger value="impact" className="text-xs h-8" data-testid="tab-impact">
                  Impact
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <TabsContent value="recommendation" className="mt-0 space-y-4" data-testid="panel-recommendation">
                  <RecommendationTab record={guidanceRecord} confidence={confidenceConfig} />
                </TabsContent>

                <TabsContent value="peers" className="mt-0 space-y-4" data-testid="panel-peers">
                  <PeerComparisonsTab comps={comps} record={guidanceRecord} />
                </TabsContent>

                <TabsContent value="provenance" className="mt-0 space-y-4" data-testid="panel-provenance">
                  <ProvenanceTab record={guidanceRecord} traces={relaxationTraces} />
                </TabsContent>

                <TabsContent value="impact" className="mt-0 space-y-4" data-testid="panel-impact">
                  <ImpactTab record={guidanceRecord} currentValue={guidanceContext?.currentValue} />
                </TabsContent>
              </div>
            </Tabs>

            <div className="shrink-0 border-t border-border/40 px-5 py-3 bg-background" data-testid="guidance-footer">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "P25", value: guidanceRecord.valueLow, action: "apply_p25" },
                  { label: "P50", value: guidanceRecord.valueMid, action: "apply_p50" },
                  { label: "P75", value: guidanceRecord.valueHigh, action: "apply_p75" },
                ].map((btn) => (
                  <button
                    key={btn.action}
                    type="button"
                    onClick={() => decisionMutation.mutate({ action: btn.action, newValue: btn.value })}
                    disabled={decisionMutation.isPending || btn.value == null}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-accent-pop/10 text-accent-pop hover:bg-accent-pop/20 transition-colors disabled:opacity-40"
                    data-testid={`guidance-${btn.action}`}
                  >
                    Apply {btn.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => decisionMutation.mutate({ action: "pin" })}
                  disabled={decisionMutation.isPending}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-border/60 hover:bg-accent/40 transition-colors"
                  data-testid="guidance-pin"
                >
                  <Lock className="h-3 w-3 inline mr-1" />Pin
                </button>
                <button
                  type="button"
                  onClick={() => decisionMutation.mutate({ action: "dismiss" })}
                  disabled={decisionMutation.isPending}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-border/60 hover:bg-accent/40 transition-colors"
                  data-testid="guidance-dismiss"
                >
                  <Minus className="h-3 w-3 inline mr-1" />Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => deepDiveMutation.mutate()}
                  disabled={deepDiveMutation.isPending}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-accent-pop/30 text-accent-pop hover:bg-accent-pop/10 transition-colors ml-auto"
                  data-testid="guidance-refresh"
                >
                  <RefreshCw className={cn("h-3 w-3 inline mr-1", deepDiveMutation.isPending && "animate-spin")} />
                  Refresh
                </button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function RecommendationTab({ record, confidence }: { record: GuidanceRecord; confidence: ReturnType<typeof getConfidenceConfig> }) {
  const low = record.valueLow ?? 0;
  const mid = record.valueMid ?? 0;
  const high = record.valueHigh ?? 0;
  const isRate = mid < 1;

  const fmt = (v: number) => isRate ? `${(v * 100).toFixed(1)}%` : v.toLocaleString("en-US", { maximumFractionDigits: 0 });

  return (
    <>
      <div className="rounded-lg border border-border/40 p-4 bg-card" data-testid="guidance-range-card">
        <div className="text-xs text-muted-foreground mb-3 font-medium">Recommended Range</div>
        <div className="flex items-end justify-between gap-2">
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Low</div>
            <div className="text-lg font-semibold text-muted-foreground">{fmt(low)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-accent-pop mb-1 font-medium">Recommended</div>
            <div className="text-2xl font-bold text-accent-pop">{fmt(mid)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">High</div>
            <div className="text-lg font-semibold text-muted-foreground">{fmt(high)}</div>
          </div>
        </div>

        <div className="mt-4 h-2 rounded-full bg-muted/60 relative overflow-hidden">
          {high > low && (
            <div
              className="absolute inset-y-0 bg-accent-pop/25 rounded-full"
              style={{ left: "0%", right: "0%" }}
            />
          )}
          {high > low && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent-pop border-2 border-background shadow"
              style={{ left: `${((mid - low) / (high - low)) * 100}%`, transform: "translate(-50%, -50%)" }}
            />
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border/40 p-3 bg-muted/20 space-y-2" data-testid="guidance-attribution">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className={cn("h-2.5 w-2.5 rounded-full", confidence.dotColor)} />
            <span className="text-xs font-medium">{confidence.label} Confidence</span>
          </div>
          {record.relaxationLevel != null && record.relaxationLevel > 0 && (
            <span className="text-[10px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded font-medium">
              Relaxation Level {record.relaxationLevel}
            </span>
          )}
        </div>

        {record.sourceName && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="h-3 w-3 shrink-0" />
            <span className="font-medium text-foreground">{record.sourceName}</span>
            {record.sourceDate && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <Clock className="h-3 w-3 shrink-0" />
                <span>{record.sourceDate}</span>
              </>
            )}
          </div>
        )}

        {!record.sourceName && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
            <Shield className="h-3 w-3 shrink-0" />
            <span>Source attribution unavailable</span>
          </div>
        )}
      </div>

      {record.reasoning && (
        <div className="space-y-1.5" data-testid="guidance-reasoning">
          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <FileText className="h-3 w-3" />
            Methodology
          </div>
          <div className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed">
            {record.reasoning}
          </div>
        </div>
      )}
    </>
  );
}

function PeerComparisonsTab({ comps, record }: { comps: Array<{ name: string; value: number; market?: string }>; record: GuidanceRecord }) {
  const isRate = (record.valueMid ?? 0) < 1;
  const fmt = (v: number) => isRate ? `${(v * 100).toFixed(1)}%` : v.toLocaleString("en-US", { maximumFractionDigits: 0 });

  if (comps.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic py-8 text-center" data-testid="peers-empty">
        No comparable properties available
      </div>
    );
  }

  const maxVal = Math.max(...comps.map(c => c.value), record.valueHigh ?? 0);

  return (
    <div className="space-y-2" data-testid="peers-list">
      <div className="text-xs text-muted-foreground font-medium mb-3">{comps.length} Comparable Properties</div>
      {comps.map((comp, idx) => (
        <div key={idx} className="flex items-center gap-3 py-1.5" data-testid={`peer-comp-${idx}`}>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{comp.name}</div>
            {comp.market && <div className="text-xs text-muted-foreground">{comp.market}</div>}
          </div>
          <div className="w-20 h-1.5 rounded-full bg-muted/60 relative">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-accent-pop/40"
              style={{ width: `${maxVal > 0 ? (comp.value / maxVal) * 100 : 0}%` }}
            />
          </div>
          <div className="text-sm font-mono tabular-nums w-16 text-right">{fmt(comp.value)}</div>
        </div>
      ))}
    </div>
  );
}

function ProvenanceTab({ record, traces }: { record: GuidanceRecord; traces: RelaxationStep[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/40 p-3 space-y-2 text-xs" data-testid="provenance-meta">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Research Run</span>
          <span className="font-mono">#{record.researchRunId ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last Updated</span>
          <span>{new Date(record.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
        {record.sourceName && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Source</span>
            <span>{record.sourceName}</span>
          </div>
        )}
        {record.relaxationLevel != null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Relaxation Level</span>
            <span>L{record.relaxationLevel}</span>
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-medium text-muted-foreground mb-2">Relaxation Trail</div>
        <RelaxationTrailStepper traces={traces} finalLevel={record.relaxationLevel ?? 0} />
      </div>
    </div>
  );
}

function ImpactTab({ record, currentValue }: { record: GuidanceRecord; currentValue?: number | null }) {
  const mid = record.valueMid ?? 0;
  const current = currentValue ?? 0;
  const isRate = mid < 1;

  const fmt = (v: number) => isRate ? `${(v * 100).toFixed(1)}%` : v.toLocaleString("en-US", { maximumFractionDigits: 0 });

  if (!currentValue && currentValue !== 0) {
    return (
      <div className="text-sm text-muted-foreground italic py-8 text-center" data-testid="impact-no-current">
        Set a current value to see the impact analysis
      </div>
    );
  }

  const delta = mid - current;
  const deltaPct = current !== 0 ? (delta / current) * 100 : 0;
  const isPositive = delta > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/40 p-4 bg-card" data-testid="impact-delta-card">
        <div className="text-xs text-muted-foreground mb-3 font-medium">If You Apply Recommended Value</div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Current</div>
            <div className="text-base font-semibold">{fmt(current)}</div>
          </div>
          <div className="text-center flex flex-col items-center">
            <div className="text-xs text-muted-foreground mb-1">Change</div>
            <div className={cn("text-base font-semibold flex items-center gap-0.5", isPositive ? "text-green-600" : "text-red-500")}>
              {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              {deltaPct !== 0 ? `${Math.abs(deltaPct).toFixed(1)}%` : "—"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-accent-pop mb-1 font-medium">Suggested</div>
            <div className="text-base font-semibold text-accent-pop">{fmt(mid)}</div>
          </div>
        </div>
      </div>

      <div className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <TrendingUp className="h-4 w-4 shrink-0 mt-0.5 text-accent-pop" />
        <div>
          Applying the recommended value would {isPositive ? "increase" : "decrease"} this assumption
          by <strong>{fmt(Math.abs(delta))}</strong>. Downstream metrics (NOI, GOP, cash flow) will recalculate
          automatically when the value is applied.
        </div>
      </div>
    </div>
  );
}

function getConfidenceConfig(confidence: string | null | undefined) {
  switch (confidence) {
    case "high":
      return { label: "High", dotColor: "bg-green-500" };
    case "medium":
      return { label: "Medium", dotColor: "bg-amber-500" };
    case "low":
      return { label: "Low", dotColor: "bg-red-400" };
    default:
      return { label: "Unknown", dotColor: "bg-muted-foreground/40" };
  }
}

function getFreshness(updatedAt: string) {
  const age = Date.now() - new Date(updatedAt).getTime();
  const hours = age / (1000 * 60 * 60);
  if (hours < 24) return { label: "Fresh", color: "text-green-600", dot: "bg-green-500" };
  if (hours < 168) return { label: `${Math.floor(hours / 24)}d ago`, color: "text-amber-600", dot: "bg-amber-500" };
  return { label: `${Math.floor(hours / 24)}d ago`, color: "text-red-500", dot: "bg-red-400" };
}

GuidanceSideSheet.displayName = "GuidanceSideSheet";

export { GuidanceSideSheet };
export type { GuidanceRecord };
