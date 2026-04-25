/**
 * ResourceAssignmentsTab — READ-ONLY view of every resource the Specialist
 * is wired to in the catalog. Doctrine: there is NO UI affordance to relink
 * an assignment from this page; the "Edit in Resources →" link is the only
 * escape hatch.
 *
 * Task #500: prepended a Quality & Gaps card mirroring the same data the
 * Resources detail page shows, so admins can read the Specialist's score
 * and live gap list without leaving the Specialist page. Quality auto-
 * recomputes on read when older than the server-side TTL.
 */
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Tooltip,
  YAxis,
  Cell,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconLayers } from "@/components/icons";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { QualityGap } from "@shared/schema";
import type { SpecialistAssignmentView } from "../types";
import { HEALTH_BAND, RESOURCE_KIND_TO_SECTION, navigateToResources, navigateToResourceDetail } from "../constants";

interface QualityResponse {
  specialistId: string;
  score: number;
  gaps: QualityGap[];
  signals: Record<string, unknown>;
  computedAt: string;
}

interface QualityHistoryPoint {
  score: number;
  computedAt: string;
}

interface QualityHistoryResponse {
  specialistId: string;
  points: QualityHistoryPoint[];
}

// Score-band colors mirror the ScorePill above so the chart and pill
// agree at a glance: ≥80 emerald, ≥60 amber, otherwise rose.
function scoreBarColor(score: number): string {
  if (score >= 80) return "hsl(160 84% 39%)"; // emerald-500
  if (score >= 60) return "hsl(38 92% 50%)"; // amber-500
  return "hsl(347 77% 50%)"; // rose-500
}

function QualityHistoryChart({ points }: { points: QualityHistoryPoint[] }) {
  if (points.length === 0) {
    return (
      <div
        data-testid="quality-history-empty"
        className="flex items-center justify-center text-xs text-muted-foreground border rounded h-[72px]"
      >
        No history yet — recompute to record the first snapshot.
      </div>
    );
  }
  if (points.length === 1) {
    // One bar would render as a misleading "flat trend"; show the value
    // and prompt for more data instead.
    return (
      <div
        data-testid="quality-history-single"
        className="flex items-center justify-center gap-2 text-xs text-muted-foreground border rounded h-[72px]"
      >
        <span>Only one snapshot so far ({points[0].score}). History appears after the next recompute.</span>
      </div>
    );
  }

  // Recharts Bar payload needs the score field by name; we keep the
  // ISO timestamp on each datum so the tooltip can format it locally.
  return (
    <div data-testid="quality-history-chart" className="w-full" style={{ height: 72 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
          <YAxis hide domain={[0, 100]} />
          <ReferenceLine y={70} stroke="hsl(var(--border))" strokeDasharray="2 2" />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as QualityHistoryPoint;
              return (
                <div
                  data-testid="quality-history-tooltip"
                  className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-lg border border-primary/15 shadow-xl px-3 py-1.5 text-xs"
                >
                  <p className="font-mono font-semibold text-foreground">Score {p.score}</p>
                  <p className="text-muted-foreground">{new Date(p.computedAt).toLocaleString()}</p>
                </div>
              );
            }}
          />
          <Bar dataKey="score" isAnimationActive={false} radius={[2, 2, 0, 0]}>
            {points.map((p, i) => (
              <Cell key={i} fill={scoreBarColor(p.score)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  const tone = score >= 80 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : score >= 60 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
    : "bg-rose-500/15 text-rose-700 dark:text-rose-400";
  return (
    <span data-testid="quality-score" className={cn("inline-flex items-center justify-center min-w-[3rem] px-2.5 py-1 rounded text-base font-mono font-semibold", tone)}>
      {score}
    </span>
  );
}

function QualityCard({ specialistId }: { specialistId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const qKey = [`/api/admin/specialists/${specialistId}/quality`];
  const historyKey = [`/api/admin/specialists/${specialistId}/quality/history`];
  const { data, isLoading } = useQuery<QualityResponse>({
    queryKey: qKey,
    queryFn: async () => {
      const res = await fetch(`/api/admin/specialists/${specialistId}/quality`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });
  const { data: history } = useQuery<QualityHistoryResponse>({
    queryKey: historyKey,
    queryFn: async () => {
      const res = await fetch(`/api/admin/specialists/${specialistId}/quality/history`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });
  const recompute = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/specialists/${specialistId}/quality/recompute`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      queryClient.invalidateQueries({ queryKey: historyKey });
      toast({ title: "Quality recomputed" });
    },
    onError: (err: unknown) => {
      toast({ title: "Recompute failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  return (
    <Card data-testid="specialist-quality-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconLayers className="w-4 h-4" />
          Research Quality & Gaps
          <Badge variant="outline" className="ml-2">live</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Loading quality snapshot…</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-4 flex-wrap">
              <ScorePill score={data.score} />
              <div className="text-xs text-muted-foreground">
                Computed {new Date(data.computedAt).toLocaleString()} ·
                {" "}derived from probe health, missing fields, run freshness, and run history.
              </div>
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => recompute.mutate()} disabled={recompute.isPending} data-testid="button-recompute-quality-specialist">
                {recompute.isPending ? "Recomputing…" : "Recompute"}
              </Button>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Score history (last {history?.points.length ?? 0})</span>
                <span className="font-mono">pass ≥ 70</span>
              </div>
              <QualityHistoryChart points={history?.points ?? []} />
            </div>
            {data.gaps.length === 0 ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-400">No gaps detected. Research inputs look healthy.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.gaps.map((g) => {
                  const tone = g.severity === "critical" ? "border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-400"
                    : g.severity === "warning" ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                    : "border-slate-400/40 bg-slate-500/5 text-slate-600 dark:text-slate-400";
                  return (
                    <li key={g.code} className={cn("rounded border px-2.5 py-1.5 text-sm", tone)} data-testid={`quality-gap-${g.code}`}>
                      <span className="uppercase tracking-wide font-semibold opacity-70 mr-2 text-xs">{g.severity}</span>
                      {g.label}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ResourceAssignmentsTab({ specialistId, assignments }: { specialistId: string; assignments: SpecialistAssignmentView[] }) {
  const [, setLocation] = useLocation();
  if (assignments.length === 0) {
    return (
      <div className="space-y-4">
        <QualityCard specialistId={specialistId} />
        <Card><CardContent className="py-8 text-sm text-muted-foreground">No Resource assignments declared.</CardContent></Card>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <QualityCard specialistId={specialistId} />
      <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconLayers className="w-4 h-4" />
          Resource Assignments
          <Badge variant="outline" className="ml-2">read-only</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Assignments are wired in code via the Specialist catalog. To change them, edit the
          catalog and ship a deploy. For incident reroute, use the Resources break-glass flow.
        </p>
        <div className="overflow-hidden rounded-md border" data-testid="assignments-table">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-2">Health</th>
                <th className="p-2">Kind</th>
                <th className="p-2">Slug</th>
                <th className="p-2">Role</th>
                <th className="p-2">Required</th>
                <th className="p-2">Resource</th>
                <th className="p-2">Last checked</th>
                <th className="p-2 text-right">Edit</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const band = HEALTH_BAND[a.health.status];
                return (
                  <tr key={`${a.kind}:${a.slug}:${a.role ?? ""}`} className="border-t" data-testid={`assignment-row-${a.kind}-${a.slug}`}>
                    <td className="p-2">
                      <span title={band.label} aria-label={band.label}
                        className={`inline-block w-2.5 h-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10 ${band.cls}`}
                        data-testid={`assignment-health-${a.kind}-${a.slug}`}
                        data-status={a.health.status}
                      />
                    </td>
                    <td className="p-2 font-mono text-xs">{a.kind}</td>
                    <td className="p-2 font-mono text-xs">{a.slug}</td>
                    <td className="p-2">{a.role ?? "—"}</td>
                    <td className="p-2">{a.required ? "Yes" : "No"}</td>
                    <td className="p-2">
                      {a.resource ? (
                        <button
                          type="button"
                          onClick={() => navigateToResourceDetail(setLocation, RESOURCE_KIND_TO_SECTION[a.kind], a.resource!.id)}
                          className="underline-offset-2 hover:underline text-left"
                          data-testid={`assignment-resource-${a.kind}-${a.slug}`}
                          title="Open this resource's transparency detail"
                        >
                          {a.resource.displayName ?? a.resource.slug} →
                        </button>
                      ) : (
                        <Badge variant="destructive" data-testid={`assignment-unbound-${a.kind}-${a.slug}`}>Unbound</Badge>
                      )}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {a.health.lastChecked ? new Date(a.health.lastChecked).toLocaleString() : "—"}
                    </td>
                    <td className="p-2 text-right">
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => a.resource
                          ? navigateToResourceDetail(setLocation, RESOURCE_KIND_TO_SECTION[a.kind], a.resource.id)
                          : navigateToResources(setLocation, RESOURCE_KIND_TO_SECTION[a.kind])}
                        data-testid={`link-edit-resource-${a.kind}-${a.slug}`}
                      >
                        Open detail →
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
