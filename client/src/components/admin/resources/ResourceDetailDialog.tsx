/**
 * ResourceDetailDialog (Task #500) — per-resource transparency hub.
 *
 * Four sections in one modal so admins never have to leave the tab:
 *   • Overview — display name, description, kind, secret-set?, version
 *   • Consumers — every Specialist that consumes this resource, with their
 *                 latest research-quality score and required/optional flag
 *   • Workflow & Health — current band + the 25 most recent probe results
 *   • Quality & Gaps — aggregated quality across consumers + named gaps
 *
 * All data comes from `GET /api/admin/resources/:id/transparency`. Numbers
 * are real (probe results, snapshots, research_runs); nothing is mocked.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  RESOURCE_KIND_LABELS,
  type ResourcePublicView,
  type ResourceHealthStatus,
  type QualityGap,
} from "@shared/schema";
import { setAiIntelligenceSection } from "@/lib/ai-intelligence-nav";
import { SPECIALIST_SECTION_TO_ID } from "@/components/ai-intelligence/AiIntelligenceSidebar";
import type { AiIntelligenceSection } from "@/components/ai-intelligence/AiIntelligenceSidebar";
import {
  QualityHistoryChart,
  type QualityHistoryResponse,
} from "@/components/admin/quality-history-chart";

// Invert the canonical SPECIALIST_SECTION_TO_ID map so we can resolve
// "which sidebar section opens this Specialist's page?" from a snapshot
// row. Anything not in the map (e.g. an experimental Specialist not yet
// surfaced in the sidebar) falls back to no-op navigation.
const SPECIALIST_ID_TO_SECTION: Record<string, AiIntelligenceSection> = (() => {
  const out: Record<string, AiIntelligenceSection> = {};
  for (const [section, id] of Object.entries(SPECIALIST_SECTION_TO_ID)) {
    out[id] = section as AiIntelligenceSection;
  }
  return out;
})();

const BAND_CLASSES: Record<ResourceHealthStatus, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  gray: "bg-slate-400",
};
const BAND_LABELS: Record<ResourceHealthStatus, string> = {
  green: "Healthy",
  amber: "Stale or skipped",
  red: "Failing",
  gray: "Never checked",
};

interface ConsumerRow {
  specialistId: string;
  specialistName: string;
  letter: string | null;
  required: boolean;
  role: string | null;
  qualityScore: number | null;
  qualityGaps: QualityGap[];
  qualityComputedAt: string | null;
}
interface RecentCall {
  runId: number;
  specialistId: string;
  specialistName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}
interface ProbeRow {
  id: number;
  status: string;
  latencyMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  checkedAt: string;
}
interface DetailResponse {
  resource: ResourcePublicView;
  health: {
    status: ResourceHealthStatus;
    lastChecked: string | null;
    lastStatus: string | null;
    recentProbes: ProbeRow[];
  };
  consumers: ConsumerRow[];
  quality: { avg: number | null; min: number | null; criticalGaps: number };
  recentCalls: RecentCall[];
}

/**
 * ConsumerHistorySparkline (Task #536) — fetches the last ~20 quality
 * snapshots for one consumer and renders the shared QualityHistoryChart
 * compactly inline in the Consumers table. One fetch per consumer is
 * acceptable here: typical resources have a handful of consumers and
 * React Query dedupes/caches across remounts. If that ever stops being
 * true, swap this for a bulk endpoint without changing the call sites.
 */
function ConsumerHistorySparkline({ specialistId }: { specialistId: string }) {
  const { data, isLoading, isError } = useQuery<QualityHistoryResponse>({
    queryKey: [`/api/admin/specialists/${specialistId}/quality/history`],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/specialists/${specialistId}/quality/history`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-muted-foreground border rounded h-[36px] w-[120px]"
        data-testid={`consumer-history-loading-${specialistId}`}
      >
        Loading…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-muted-foreground border rounded h-[36px] w-[120px]"
        data-testid={`consumer-history-error-${specialistId}`}
      >
        Unavailable
      </div>
    );
  }
  return (
    <div className="w-[120px]">
      <QualityHistoryChart
        points={data.points}
        height={36}
        showBands={false}
        testIdPrefix={`consumer-history-${specialistId}`}
      />
    </div>
  );
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground text-xs">—</span>;
  const tone = score >= 80 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : score >= 60 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
    : "bg-rose-500/15 text-rose-700 dark:text-rose-400";
  return (
    <span className={cn("inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded text-xs font-mono font-medium", tone)} data-testid={`quality-score-pill-${score}`}>
      {score}
    </span>
  );
}

type FlowTone = "slate" | "emerald" | "amber" | "rose";
const FLOW_TONE: Record<FlowTone, string> = {
  slate:   "border-slate-300 dark:border-slate-700 bg-background",
  emerald: "border-emerald-500/40 bg-emerald-500/5",
  amber:   "border-amber-500/40 bg-amber-500/5",
  rose:    "border-rose-500/40 bg-rose-500/5",
};

function FlowNode({
  title, subtitle, footer, tone = "slate", testId,
}: {
  title: string; subtitle?: string; footer?: string; tone?: FlowTone; testId?: string;
}) {
  return (
    <div
      className={cn("flex-1 min-w-[10rem] rounded border p-2.5 text-xs", FLOW_TONE[tone])}
      data-testid={testId}
    >
      <div className="font-semibold text-sm leading-tight line-clamp-2">{title}</div>
      {subtitle && <div className="text-muted-foreground mt-1 line-clamp-2">{subtitle}</div>}
      {footer && <div className="mt-2 font-mono text-[10px] opacity-70 line-clamp-1">{footer}</div>}
    </div>
  );
}

function FlowArrow() {
  return <div className="self-center text-muted-foreground select-none px-0.5">→</div>;
}

/**
 * ConsumerHistoryRow — fetches and renders one consumer Specialist's
 * recent quality-score history (~30 days) using the same endpoint and
 * chart component as the Specialist page (Task #540, #552). Each
 * consumer gets its own row so ops users triaging a flagged resource
 * can see, at a glance, whether the score is trending up or down before
 * pivoting to the Specialist view.
 */
function ConsumerHistoryRow({
  specialistId,
  specialistName,
  qualityScore,
}: {
  specialistId: string;
  specialistName: string;
  qualityScore: number | null;
}) {
  const { data, isLoading, isError } = useQuery<QualityHistoryResponse>({
    queryKey: [`/api/admin/specialists/${specialistId}/quality/history`],
    queryFn: async () => {
      // Request 30 — nightly recompute appends one row per day, so this
      // covers the last ~30 days of scores per Task #540.
      const res = await fetch(
        `/api/admin/specialists/${specialistId}/quality/history?limit=30`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });
  const points = data?.points ?? [];
  return (
    <div className="rounded border p-2.5" data-testid={`consumer-history-${specialistId}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-sm font-medium">{specialistName}</div>
        <ScorePill score={qualityScore} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
        <span>Score history — last {points.length} day{points.length === 1 ? "" : "s"}</span>
        <span className="font-mono">green ≥ 80 · amber ≥ 60 · red &lt; 60</span>
      </div>
      {isLoading ? (
        <div
          className="flex items-center justify-center text-xs text-muted-foreground border rounded h-[72px]"
          data-testid={`consumer-history-loading-${specialistId}`}
        >
          Loading history…
        </div>
      ) : isError ? (
        <div
          className="flex items-center justify-center text-xs text-rose-600 border rounded h-[72px]"
          data-testid={`consumer-history-error-${specialistId}`}
        >
          Failed to load history.
        </div>
      ) : (
        <QualityHistoryChart points={points} testIdPrefix={`consumer-history-row-${specialistId}`} />
      )}
    </div>
  );
}

function GapPill({ gap }: { gap: QualityGap }) {
  const tone = gap.severity === "critical" ? "border-rose-500/40 text-rose-700 dark:text-rose-400 bg-rose-500/5"
    : gap.severity === "warning" ? "border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/5"
    : "border-slate-400/40 text-slate-600 dark:text-slate-400 bg-slate-500/5";
  return (
    <li className={cn("rounded border px-2 py-1.5 text-xs", tone)} data-testid={`gap-${gap.code}`}>
      <span className="uppercase tracking-wide font-semibold opacity-70 mr-2">{gap.severity}</span>
      {gap.label}
    </li>
  );
}

interface Props {
  resourceId: number | null;
  onOpenChange: (open: boolean) => void;
}

export function ResourceDetailDialog({ resourceId, onOpenChange }: Props) {
  const open = resourceId !== null;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery<DetailResponse>({
    queryKey: [`/api/admin/resources/${resourceId}/transparency`],
    enabled: open,
  });

  const testNow = useMutation({
    mutationFn: async () => {
      if (resourceId === null) throw new Error("no resource selected");
      const res = await apiRequest("POST", `/api/admin/resources/${resourceId}/test`);
      return res.json();
    },
    onSuccess: (r: { status?: string; latencyMs?: number; errorCode?: string | null }) => {
      const ok = r.status === "ok";
      toast({
        title: ok ? "Probe succeeded" : `Probe ${r.status ?? "completed"}`,
        description: r.latencyMs != null
          ? `${r.latencyMs}ms${r.errorCode ? ` · ${r.errorCode}` : ""}`
          : r.errorCode ?? undefined,
        variant: ok ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/${resourceId}/transparency`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/transparency`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/gaps`] });
    },
    onError: (err: unknown) => {
      toast({ title: "Probe failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  function jumpToSpecialist(specialistId: string) {
    const section = SPECIALIST_ID_TO_SECTION[specialistId];
    if (!section) {
      toast({ title: "No sidebar entry for this Specialist", variant: "destructive" });
      return;
    }
    setAiIntelligenceSection(section);
    setLocation("/ai-intelligence");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto" data-testid="resource-detail-dialog">
        {isLoading || !data ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {isError ? "Failed to load resource detail." : "Loading…"}
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className={cn("inline-block w-2.5 h-2.5 rounded-full", BAND_CLASSES[data.health.status])} title={BAND_LABELS[data.health.status]} />
                {data.resource.displayName}
                <Badge variant="outline" className="font-mono text-xs">{data.resource.slug}</Badge>
                <Badge variant="secondary">{RESOURCE_KIND_LABELS[data.resource.kind]}</Badge>
              </DialogTitle>
              {data.resource.description && (
                <DialogDescription>{data.resource.description}</DialogDescription>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testNow.mutate()}
                  disabled={testNow.isPending}
                  data-testid="button-test-now"
                >
                  {testNow.isPending ? "Probing…" : "Test now"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Runs the canonical health probe and refreshes the dialog.
                </span>
              </div>
            </DialogHeader>

            <Tabs defaultValue="overview" className="mt-2">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
                <TabsTrigger value="consumers" data-testid="tab-consumers">
                  Consumers <span className="ml-1.5 text-xs opacity-60">{data.consumers.length}</span>
                </TabsTrigger>
                <TabsTrigger value="workflow" data-testid="tab-workflow">Workflow & Health</TabsTrigger>
                <TabsTrigger value="quality" data-testid="tab-quality">
                  Quality & Gaps {data.quality.criticalGaps > 0 && <Badge variant="destructive" className="ml-1.5 px-1.5 py-0 text-[10px]">{data.quality.criticalGaps}</Badge>}
                </TabsTrigger>
              </TabsList>

              {/* OVERVIEW ────────────────────────────────────────────── */}
              <TabsContent value="overview" className="space-y-3 pt-3">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-muted-foreground text-xs">Kind</dt><dd className="font-mono">{data.resource.kind}</dd></div>
                  <div><dt className="text-muted-foreground text-xs">Slug</dt><dd className="font-mono">{data.resource.slug}</dd></div>
                  <div><dt className="text-muted-foreground text-xs">Version</dt><dd className="font-mono">v{data.resource.version}</dd></div>
                  <div><dt className="text-muted-foreground text-xs">Secret</dt><dd>{data.resource.hasSecret ? <Badge variant="secondary">set</Badge> : <Badge variant="outline">—</Badge>}</dd></div>
                  <div><dt className="text-muted-foreground text-xs">Health</dt><dd className="flex items-center gap-2"><span className={cn("inline-block w-2 h-2 rounded-full", BAND_CLASSES[data.health.status])} />{BAND_LABELS[data.health.status]}</dd></div>
                  <div><dt className="text-muted-foreground text-xs">Last checked</dt><dd className="font-mono text-xs">{data.health.lastChecked ? new Date(data.health.lastChecked).toLocaleString() : "Never"}</dd></div>
                  <div><dt className="text-muted-foreground text-xs">Consumers</dt><dd>{data.consumers.length} specialist{data.consumers.length === 1 ? "" : "s"}</dd></div>
                  <div><dt className="text-muted-foreground text-xs">Avg consumer quality</dt><dd><ScorePill score={data.quality.avg} /></dd></div>
                </dl>
                {Object.keys(data.resource.config ?? {}).length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Config</h4>
                    <pre className="text-xs bg-muted/40 rounded p-2 overflow-x-auto">{JSON.stringify(data.resource.config, null, 2)}</pre>
                  </div>
                )}
              </TabsContent>

              {/* CONSUMERS ──────────────────────────────────────────── */}
              <TabsContent value="consumers" className="pt-3">
                {data.consumers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No Specialist consumes this resource. Wire it up in the catalog and run the sync.
                  </p>
                ) : (
                  <div className="rounded border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-left">
                        <tr>
                          <th className="p-2">Specialist</th>
                          <th className="p-2">Role</th>
                          <th className="p-2">Required</th>
                          <th className="p-2 text-right">Quality</th>
                          <th className="p-2 text-right">History</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.consumers.map((c) => {
                          const linkable = !!SPECIALIST_ID_TO_SECTION[c.specialistId];
                          return (
                            <tr key={c.specialistId} className="border-t" data-testid={`consumer-row-${c.specialistId}`}>
                              <td className="p-2">
                                {linkable ? (
                                  <button
                                    type="button"
                                    className="text-left underline-offset-2 hover:underline"
                                    onClick={() => jumpToSpecialist(c.specialistId)}
                                    data-testid={`consumer-link-${c.specialistId}`}
                                  >
                                    <div className="font-medium">{c.specialistName} →</div>
                                    <div className="text-xs text-muted-foreground font-mono">{c.specialistId}</div>
                                  </button>
                                ) : (
                                  <>
                                    <div className="font-medium">{c.specialistName}</div>
                                    <div className="text-xs text-muted-foreground font-mono">{c.specialistId}</div>
                                  </>
                                )}
                              </td>
                              <td className="p-2 font-mono text-xs">{c.role ?? "—"}</td>
                              <td className="p-2">{c.required ? <Badge>required</Badge> : <Badge variant="outline">optional</Badge>}</td>
                              <td className="p-2 text-right"><ScorePill score={c.qualityScore} /></td>
                              <td className="p-2">
                                <div className="flex justify-end">
                                  <ConsumerHistorySparkline specialistId={c.specialistId} />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* WORKFLOW & HEALTH ──────────────────────────────────── */}
              <TabsContent value="workflow" className="pt-3 space-y-4">
                {/* Left-to-right flow: Request → This resource → Specialist consumers → Output */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Workflow</h4>
                  <div className="rounded border p-3 bg-muted/20" data-testid="workflow-strip">
                    <div className="flex items-stretch gap-2 overflow-x-auto">
                      <FlowNode
                        title="Request"
                        subtitle="Triggered by Specialist run"
                        tone="slate"
                      />
                      <FlowArrow />
                      <FlowNode
                        title={data.resource.displayName}
                        subtitle={`${RESOURCE_KIND_LABELS[data.resource.kind]} · ${data.resource.slug}`}
                        tone={data.health.status === "green" ? "emerald" : data.health.status === "amber" ? "amber" : data.health.status === "red" ? "rose" : "slate"}
                        footer={data.health.lastChecked
                          ? `${BAND_LABELS[data.health.status]} · ${new Date(data.health.lastChecked).toLocaleTimeString()}`
                          : "Never probed"}
                        testId="flow-resource"
                      />
                      <FlowArrow />
                      <FlowNode
                        title={data.consumers.length === 0
                          ? "No consumers"
                          : `${data.consumers.length} Specialist${data.consumers.length === 1 ? "" : "s"}`}
                        subtitle={data.consumers.slice(0, 3).map((c) => c.specialistName).join(", ") || "—"}
                        tone={data.consumers.length === 0 ? "amber" : "slate"}
                        footer={data.quality.avg !== null ? `Avg quality ${data.quality.avg}` : "No quality scored yet"}
                        testId="flow-consumers"
                      />
                      <FlowArrow />
                      <FlowNode
                        title="Output"
                        subtitle={data.recentCalls[0]
                          ? `Latest run ${data.recentCalls[0].status}`
                          : "No runs yet"}
                        tone={data.recentCalls[0]?.status === "completed" ? "emerald"
                          : data.recentCalls[0]?.status === "failed" ? "rose" : "slate"}
                        footer={data.recentCalls[0]
                          ? new Date(data.recentCalls[0].startedAt).toLocaleString()
                          : ""}
                        testId="flow-output"
                      />
                    </div>
                  </div>
                </div>

                <div className="text-sm">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Recent probes</h4>
                  {data.health.recentProbes.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No probe history yet — press <em>Test</em> on the row to run one.</p>
                  ) : (
                    <ul className="space-y-1">
                      {data.health.recentProbes.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 text-xs font-mono" data-testid={`probe-${p.id}`}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", p.status === "ok" ? "bg-emerald-500" : p.status === "fail" ? "bg-rose-500" : "bg-amber-500")} />
                          <span>{new Date(p.checkedAt).toLocaleString()}</span>
                          <span className="opacity-70">{p.latencyMs}ms</span>
                          <span className="uppercase">{p.status}</span>
                          {p.errorCode && (
                            <span
                              className="text-rose-600 truncate max-w-[28rem]"
                              title={p.errorMessage ?? p.errorCode}
                              data-testid={`probe-error-${p.id}`}
                            >
                              {p.errorCode}{p.errorMessage ? ` — ${p.errorMessage}` : ""}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Recent specialist research calls</h4>
                  {data.recentCalls.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No research runs attributed to consumers of this resource yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {data.recentCalls.slice(0, 12).map((r) => (
                        <li key={r.runId} className="text-xs font-mono flex items-center gap-2" data-testid={`recent-call-${r.runId}`}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", r.status === "completed" ? "bg-emerald-500" : r.status === "failed" ? "bg-rose-500" : "bg-amber-500")} />
                          <span>{new Date(r.startedAt).toLocaleString()}</span>
                          <span className="opacity-70">{r.specialistName}</span>
                          <span className="uppercase">{r.status}</span>
                          {r.durationMs !== null && <span className="opacity-70">{r.durationMs}ms</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </TabsContent>

              {/* QUALITY & GAPS ─────────────────────────────────────── */}
              <TabsContent value="quality" className="pt-3 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded border p-3">
                    <div className="text-xs text-muted-foreground">Avg quality</div>
                    <div className="mt-1"><ScorePill score={data.quality.avg} /></div>
                  </div>
                  <div className="rounded border p-3">
                    <div className="text-xs text-muted-foreground">Worst consumer</div>
                    <div className="mt-1"><ScorePill score={data.quality.min} /></div>
                  </div>
                  <div className="rounded border p-3">
                    <div className="text-xs text-muted-foreground">Critical gaps</div>
                    <div className="mt-1 font-mono text-lg">{data.quality.criticalGaps}</div>
                  </div>
                </div>
                {/*
                  Per-consumer quality history (Task #552). Mirrors the
                  sparkline on each Specialist page so ops users land
                  on the Resources detail with the same trend before
                  deciding whether to pivot to the Specialist view.
                */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Score history per consumer
                  </h4>
                  {data.consumers.length === 0 ? (
                    <p className="text-sm text-muted-foreground" data-testid="consumer-history-empty">
                      No Specialist consumes this resource yet, so there is no history to chart.
                    </p>
                  ) : (
                    <div className="space-y-2" data-testid="consumer-history-list">
                      {data.consumers.map((c) => (
                        <ConsumerHistoryRow
                          key={c.specialistId}
                          specialistId={c.specialistId}
                          specialistName={c.specialistName}
                          qualityScore={c.qualityScore}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Gaps across consumers</h4>
                  {data.consumers.every((c) => c.qualityGaps.length === 0) ? (
                    <p className="text-sm text-muted-foreground">No gaps reported. Quality looks healthy across all consumers.</p>
                  ) : (
                    <div className="space-y-2">
                      {data.consumers.filter((c) => c.qualityGaps.length > 0).map((c) => (
                        <div key={c.specialistId} className="rounded border p-2" data-testid={`gap-group-${c.specialistId}`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="text-sm font-medium">{c.specialistName}</div>
                            <ScorePill score={c.qualityScore} />
                          </div>
                          <ul className="space-y-1">
                            {c.qualityGaps.map((g) => (<GapPill key={g.code} gap={g} />))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-detail">Close</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
