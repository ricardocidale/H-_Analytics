import { Fragment, useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  RESOURCE_KIND_LABELS,
  type ResourceKind,
  type ResourcePublicView,
  type ResourceHealthStatus,
} from "@shared/schema";
import { TestButton } from "./health-bits";

// Slugs that have a registered Pietro minion — Regenerate is enabled for these only.
const PIETRO_MINION_SLUGS = new Set([
  "fred-extended",
  "fmp-reit",
  "daloopa-reit",
  "booking-rates",
  "expedia-rates",
]);

function RegenerateButton({ resourceId, slug }: { resourceId: number; slug: string }) {
  const { toast } = useToast();
  const regenerate = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/resources/${resourceId}/regenerate`),
    onSuccess: (data: unknown) => {
      const r = data as { rowsUpserted?: number; errors?: string[] };
      if (r.errors && r.errors.length > 0) {
        toast({ title: "Regenerated with errors", description: r.errors[0], variant: "destructive" });
      } else {
        toast({ title: "Regenerated", description: `${r.rowsUpserted ?? 0} rows upserted` });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Regenerate failed", description: err.message, variant: "destructive" });
    },
  });

  if (!PIETRO_MINION_SLUGS.has(slug)) return null;

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={regenerate.isPending}
      onClick={() => regenerate.mutate()}
      data-testid={`button-regenerate-${resourceId}`}
    >
      {regenerate.isPending ? "Refreshing…" : "Regenerate"}
    </Button>
  );
}
import { ConnectedToCell } from "./ConnectedToCell";
import {
  CreateResourceDialog, EditResourceDialog, VersionHistoryDialog, DeleteResourceDialog,
} from "./resource-dialogs";
import LeticiaToolbox from "./LeticiaToolbox";
import { ResourceDetailDialog } from "./ResourceDetailDialog";
import { formatLastBuilt, useSpecialistTools, type ToolView } from "./specialist-tools-shared";
import { SPECIALIST_SECTION_TO_ID } from "@/components/intelligence/IntelligenceSidebar";
import { setIntelligenceSection } from "@/lib/intelligence-nav";

const KIND_BLURBS: Record<ResourceKind, string> = {
  api: "Live external HTTP services (FRED, vendor proxies, etc.). Each row is wired to Specialists in code via the catalog.",
  source: "Bulk data sources and scrapers — periodic ingestion that lands in `data_sources` and downstream tables.",
  table: "Internal warehouse tables Specialists query. Health probe verifies the table exists in the schema.",
  benchmark: "Hospitality benchmark slugs (ADR, RevPAR, occupancy, etc.). Health probe verifies a snapshot is ingested.",
  model: "LLM model rows. Health probe verifies provider + secret wiring without firing a billable inference.",
  llm_slot: "Named usage slots that map a feature (e.g. 'vision', 'risk-brief') to a model row. Edit to swap models without a deploy.",
  mcp: "MCP server connections managed by Pietro. Data-fetching rows have a registered minion that pre-populates a DB cache table on a schedule; discovery-only rows (e.g. Context7) are never dispatched.",
  search_url: "Curated research URLs for hospitality market data, REIT filings, and macro indicators. Used by Rebecca and research specialists.",
  research_prompt: "Prompt templates for structured research workflows (cap rate benchmarking, REIT comps, competitive set analysis).",
  parameter: "Ops-tunable behavioral constants (conviction thresholds, regress limits, pixel-diff gates). Edit values without a code deploy.",
};

const WORKING_PILL: Record<ResourceHealthStatus, { label: string; cls: string }> = {
  green: { label: "Working",  cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  amber: { label: "Stale",    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  red:   { label: "Failing",  cls: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30" },
  gray:  { label: "Untested", cls: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-400/30" },
};

interface ConsumerStub {
  specialistId: string;
  specialistName: string;
  letter: string | null;
  qualityScore: number | null;
}
interface TransparencyRow {
  resource: ResourcePublicView;
  consumers: ConsumerStub[];
  consumerCount: number;
  requiredAnywhere: boolean;
  health: {
    status: ResourceHealthStatus;
    lastChecked: string | null;
    lastStatus: string | null;
    lastFailureCode: string | null;
    lastFailureMessage: string | null;
  };
  quality: { avg: number | null; min: number | null; scoredCount: number };
}
interface GapsResponse {
  kind: ResourceKind | null;
  resources: {
    total: number; failing: number; amber: number; unprobed: number; orphans: number;
    failingList: Array<{ id: number; slug: string; displayName: string; kind: string }>;
    orphanList: Array<{ id: number; slug: string; displayName: string; kind: string }>;
  };
  specialists: {
    missingHealthy: number;
    missingHealthyList: Array<{
      specialistId: string; specialistName: string; resourceId: number;
      resourceSlug: string; role: string | null; status: "red" | "gray";
    }>;
  };
  quality: {
    avg: number | null; below70: number; total: number;
    below70List: Array<{ specialistId: string; specialistName: string; score: number }>;
  };
}

function ScorePill({ score, testId }: { score: number | null; testId?: string }) {
  if (score === null) return <span className="text-muted-foreground text-xs" data-testid={testId}>—</span>;
  const tone = score >= 80 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : score >= 60 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
    : "bg-rose-500/15 text-rose-700 dark:text-rose-400";
  return (
    <span data-testid={testId} className={cn("inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded text-xs font-mono font-medium", tone)}>
      {score}
    </span>
  );
}

function GapsBanner({
  kind,
  onJumpToResource,
  onJumpToSpecialist,
}: {
  kind: ResourceKind;
  onJumpToResource: (id: number) => void;
  onJumpToSpecialist: (specialistId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<GapsResponse>({
    queryKey: [`/api/admin/resources/gaps`, kind],
    queryFn: async () => {
      const res = await fetch(`/api/admin/resources/gaps?kind=${kind}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });
  const recompute = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/specialists/quality/recompute-all`);
      return res.json();
    },
    onSuccess: (r: { updated: number }) => {
      toast({ title: `Recomputed ${r.updated} specialist quality scores` });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/gaps`, kind] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/transparency`, kind] });
    },
    onError: (err: unknown) => {
      toast({ title: "Recompute failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  if (isLoading || !data) return null;
  const { resources, specialists, quality } = data;
  const allGreen = resources.failing === 0 && resources.amber === 0 && resources.unprobed === 0
    && resources.orphans === 0 && specialists.missingHealthy === 0
    && (quality.avg === null || quality.below70 === 0);
  const hasCritical = resources.failing > 0 || specialists.missingHealthy > 0 || (quality.below70 ?? 0) > 0;
  const tone = hasCritical
    ? "border-rose-500/40 bg-rose-500/5"
    : resources.amber > 0 || resources.unprobed > 0 || resources.orphans > 0
    ? "border-amber-500/40 bg-amber-500/5"
    : "border-emerald-500/40 bg-emerald-500/5";

  return (
    <div className={cn("rounded border px-3 py-2 text-sm space-y-2", tone)} data-testid={`gaps-banner-${kind}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {allGreen ? (
            <span data-testid="gaps-banner-clean">All {resources.total} {RESOURCE_KIND_LABELS[kind].toLowerCase()} healthy and quality looks good.</span>
          ) : (
            <>
              {resources.failing > 0 && <span data-testid="gaps-failing"><strong>{resources.failing}</strong> failing</span>}
              {resources.amber > 0 && <span data-testid="gaps-amber"><strong>{resources.amber}</strong> stale</span>}
              {resources.unprobed > 0 && <span data-testid="gaps-unprobed"><strong>{resources.unprobed}</strong> never tested</span>}
              {resources.orphans > 0 && <span data-testid="gaps-orphans"><strong>{resources.orphans}</strong> unused</span>}
              {specialists.missingHealthy > 0 && (
                <span data-testid="gaps-missing-healthy" className="text-rose-700 dark:text-rose-400">
                  <strong>{specialists.missingHealthy}</strong> specialist{specialists.missingHealthy === 1 ? "" : "s"} blind on a required resource
                </span>
              )}
              {quality.avg !== null && (
                <span data-testid="gaps-quality">Avg specialist quality: <strong>{quality.avg}</strong> · <strong>{quality.below70}</strong> below 70</span>
              )}
            </>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={() => recompute.mutate()} disabled={recompute.isPending} data-testid="button-recompute-quality">
          {recompute.isPending ? "Recomputing…" : "Recompute quality"}
        </Button>
      </div>
      {/* Actionable jump targets — clicking opens the resource detail dialog. */}
      {(resources.failingList.length > 0 || resources.orphanList.length > 0 || specialists.missingHealthyList.length > 0) && (
        <div className="flex flex-col gap-1 text-xs">
          {resources.failingList.length > 0 && (
            <div data-testid="gaps-failing-list">
              <span className="opacity-70 mr-1">Failing:</span>
              {resources.failingList.map((r, i) => (
                <Button
                  key={r.id}
                  variant="ghost"
                  onClick={() => onJumpToResource(r.id)}
                  className="underline underline-offset-2 hover:text-rose-700 mr-2 h-auto p-0 text-xs inline"
                  data-testid={`gaps-jump-failing-${r.id}`}
                >
                  {r.slug}{i < resources.failingList.length - 1 ? "," : ""}
                </Button>
              ))}
            </div>
          )}
          {resources.orphanList.length > 0 && (
            <div data-testid="gaps-orphan-list">
              <span className="opacity-70 mr-1">Unused:</span>
              {resources.orphanList.map((r, i) => (
                <Button
                  key={r.id}
                  variant="ghost"
                  onClick={() => onJumpToResource(r.id)}
                  className="underline underline-offset-2 hover:text-amber-700 mr-2 h-auto p-0 text-xs inline"
                  data-testid={`gaps-jump-orphan-${r.id}`}
                >
                  {r.slug}{i < resources.orphanList.length - 1 ? "," : ""}
                </Button>
              ))}
            </div>
          )}
          {specialists.missingHealthyList.length > 0 && (
            <div data-testid="gaps-missing-healthy-list">
              <span className="opacity-70 mr-1">Blind specialists:</span>
              {specialists.missingHealthyList.map((m, i) => (
                <Button
                  key={`${m.specialistId}-${m.resourceId}`}
                  variant="ghost"
                  onClick={() =>
                    // Unbound required slots have no resource to open, so
                    // jump to the specialist's page where they can pick a
                    // resource. Bound failures still open the resource.
                    m.resourceId > 0 ? onJumpToResource(m.resourceId) : onJumpToSpecialist(m.specialistId)
                  }
                  className="underline underline-offset-2 hover:text-rose-700 mr-2 h-auto p-0 text-xs inline"
                  data-testid={`gaps-jump-missing-${m.specialistId}-${m.resourceId}`}
                  title={`${m.specialistName} → ${m.resourceSlug}${m.role ? ` (${m.role})` : ""}`}
                >
                  {m.specialistName} → {m.resourceSlug}{i < specialists.missingHealthyList.length - 1 ? "," : ""}
                </Button>
              ))}
            </div>
          )}
          {quality.below70List.length > 0 && (
            <div data-testid="gaps-below70-list">
              <span className="opacity-70 mr-1">Low-quality specialists:</span>
              {quality.below70List.map((q, i) => (
                <Button
                  key={q.specialistId}
                  variant="ghost"
                  onClick={() => onJumpToSpecialist(q.specialistId)}
                  className="underline underline-offset-2 hover:text-rose-700 mr-2 h-auto p-0 text-xs inline"
                  data-testid={`gaps-jump-below70-${q.specialistId}`}
                  title={`Open ${q.specialistName}'s page (score ${q.score})`}
                >
                  {q.specialistName} · {q.score}{i < quality.below70List.length - 1 ? "," : ""}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ResourcesTabProps {
  kind: ResourceKind;
}

export default function ResourcesTab({ kind }: ResourcesTabProps) {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ResourcePublicView | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ResourcePublicView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResourcePublicView | null>(null);
  // Detail is URL-addressable (`?resource=<id>`) so deep links, browser
  // back/forward and shareable links all work. The dialog is just the UX
  // wrapper around that route.
  const [, setLocation] = useLocation();
  const urlSearch = useSearch();
  const detailId = (() => {
    const params = new URLSearchParams(urlSearch);
    const raw = params.get("resource");
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  function openDetail(id: number) {
    const params = new URLSearchParams(urlSearch);
    params.set("resource", String(id));
    setLocation(`/intelligence?${params.toString()}`);
  }
  function closeDetail() {
    const params = new URLSearchParams(urlSearch);
    params.delete("resource");
    const qs = params.toString();
    setLocation(qs ? `/intelligence?${qs}` : "/intelligence");
  }
  function jumpToSpecialist(specialistId: string) {
    closeDetail();
    // Ask the Intelligence sidebar to switch to this Specialist's
    // section — looked up via the canonical SPECIALIST_SECTION_TO_ID map.
    const section = (Object.entries(SPECIALIST_SECTION_TO_ID) as Array<[string, string]>).find(([, id]) => id === specialistId)?.[0];
    if (section) {
      setIntelligenceSection(section as Parameters<typeof setIntelligenceSection>[0]);
      // Encode the target section into the URL so a refresh / share / back
      // lands on the same Specialist instead of falling back to the default.
      setLocation(`/intelligence?section=${encodeURIComponent(section)}`);
    }
  }

  const { data: rows = [], isLoading, isError } = useQuery<TransparencyRow[]>({
    queryKey: [`/api/admin/resources/transparency`, kind],
    queryFn: async () => {
      const res = await fetch(`/api/admin/resources/transparency?kind=${kind}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    refetchInterval: 60_000,
  });

  // Per-row tool strip — for each admin_resources slug, find every
  // SPECIALIST_TOOLS entry that declares it in `resourceSlugs`. The
  // request is shared (deduped) with `LeticiaToolbox`'s query.
  const { data: toolData } = useSpecialistTools();
  const toolsBySlug = useMemo(() => {
    const map = new Map<string, ToolView[]>();
    for (const t of toolData?.tools ?? []) {
      for (const slug of t.resourceSlugs) {
        const list = map.get(slug);
        if (list) list.push(t); else map.set(slug, [t]);
      }
    }
    return map;
  }, [toolData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(({ resource: r }) =>
      r.slug.toLowerCase().includes(q)
      || r.displayName.toLowerCase().includes(q)
      || (r.description ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <div className="space-y-4">
      <LeticiaToolbox />
      <GapsBanner kind={kind} onJumpToResource={openDetail} onJumpToSpecialist={jumpToSpecialist} />
      <Card data-testid={`resources-tab-${kind}`}>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>{RESOURCE_KIND_LABELS[kind]}</CardTitle>
              <CardDescription>{KIND_BLURBS[kind]}</CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)} data-testid={`button-create-${kind}`}>
              + New {kind}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <Input
              placeholder={`Search ${RESOURCE_KIND_LABELS[kind].toLowerCase()}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid={`input-search-${kind}`}
            />
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="text-sm text-rose-600">Failed to load resources.</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {rows.length === 0 ? `No ${kind} resources yet — click "New ${kind}" to add one.` : "No matches for your search."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[88px]">Working</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Display name</TableHead>
                  <TableHead>Used by</TableHead>
                  <TableHead>Quality</TableHead>
                  <TableHead>Secret</TableHead>
                  <TableHead>Version</TableHead>
                  {/* "Connected to" (Task #496) — admin-editable specialist/analyst
                      links. Only shown for source-relevant kinds (Tables/APIs/
                      Sources); benchmarks/models render an n/a placeholder so
                      the column doesn't suggest editability where it's out of
                      scope. */}
                  <TableHead>Connected to</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(({ resource: r, consumers, consumerCount, requiredAnywhere, health, quality }) => {
                  const pill = WORKING_PILL[health.status];
                  // Surface the last-failure code/message in the Working
                  // pill tooltip so admins can diagnose without opening the
                  // detail dialog. Healthy rows get the plain label.
                  const lastCheckedSuffix = health.lastChecked
                    ? ` · last checked ${new Date(health.lastChecked).toLocaleString()}`
                    : "";
                  const failureSuffix = health.lastFailureCode || health.lastFailureMessage
                    ? `\nLast failure: ${[health.lastFailureCode, health.lastFailureMessage].filter(Boolean).join(" — ")}`
                    : "";
                  const pillTitle = `${pill.label}${lastCheckedSuffix}${failureSuffix}`;
                  // Per-row strip — every SPECIALIST_TOOLS entry that
                  // declares this row's slug in `resourceSlugs` shows up
                  // as a "Built by … · last refreshed … · called by …"
                  // line beneath the row. Empty list ⇒ no strip rendered.
                  const matchingTools = toolsBySlug.get(r.slug) ?? [];
                  return (
                    <Fragment key={r.id}>
                    <TableRow
                      data-testid={`row-resource-${r.id}`}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => openDetail(r.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <span
                          data-testid={`working-pill-${r.id}`}
                          data-status={health.status}
                          title={pillTitle}
                          aria-label={pillTitle}
                          className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border", pill.cls)}
                        >
                          {pill.label}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs" data-testid={`text-slug-${r.id}`}>{r.slug}</TableCell>
                      <TableCell data-testid={`text-display-${r.id}`}>
                        <div className="font-medium">{r.displayName}</div>
                        {r.description && <div className="text-xs text-muted-foreground line-clamp-1">{r.description}</div>}
                      </TableCell>
                      <TableCell data-testid={`used-by-${r.id}`}>
                        {consumerCount === 0 ? (
                          <Badge variant="outline" className="text-xs" data-testid={`used-by-none-${r.id}`}>unused</Badge>
                        ) : (
                          <div className="flex items-center gap-1 flex-wrap">
                            <Badge variant={requiredAnywhere ? "default" : "secondary"} className="text-xs">
                              {consumerCount} specialist{consumerCount === 1 ? "" : "s"}
                            </Badge>
                            <span className="text-xs text-muted-foreground line-clamp-1 max-w-[14rem]">
                              {consumers.slice(0, 3).map((c) => c.specialistName).join(", ")}
                              {consumers.length > 3 ? ` +${consumers.length - 3}` : ""}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <ScorePill score={quality.avg} testId={`quality-${r.id}`} />
                      </TableCell>
                      <TableCell>
                        {r.hasSecret
                          ? <Badge variant="secondary" data-testid={`badge-secret-${r.id}`}>set</Badge>
                          : <Badge variant="outline" data-testid={`badge-secret-${r.id}`}>—</Badge>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">v{r.version}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {kind === "table" || kind === "api" || kind === "source" ? (
                          <ConnectedToCell resourceId={r.id} />
                        ) : (
                          <span
                            className="text-xs text-muted-foreground italic"
                            data-testid={`connected-to-na-${r.id}`}
                          >
                            n/a
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          <TestButton resourceId={r.id} kindLabel={RESOURCE_KIND_LABELS[kind]} />
                          <RegenerateButton resourceId={r.id} slug={r.slug} />
                          <Button size="sm" variant="ghost" data-testid={`button-edit-${r.id}`} onClick={() => setEditTarget(r)}>Edit</Button>
                          <Button size="sm" variant="ghost" data-testid={`button-history-${r.id}`} onClick={() => setHistoryTarget(r)}>History</Button>
                          <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700" data-testid={`button-delete-${r.id}`} onClick={() => setDeleteTarget(r)}>Delete</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {matchingTools.length > 0 && (
                      <TableRow
                        data-testid={`row-tool-strip-${r.id}`}
                        className="bg-muted/20 border-t-0 hover:bg-muted/20 cursor-default"
                      >
                        <TableCell colSpan={9} className="py-1.5 px-3">
                          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                            {matchingTools.map((t) => {
                              const ownerLabel = t.owner.specialistId === "resources.builder"
                                ? "Letícia"
                                : t.owner.humanName;
                              const calledByLabel = t.calledBy.length === 0
                                ? "no Specialists yet"
                                : t.calledBy.map((c) => c.humanName).join(", ");
                              return (
                                <li
                                  key={t.id}
                                  data-testid={`tool-strip-line-${r.id}-${t.id}`}
                                >
                                  <span className="font-medium text-foreground">{t.displayName}</span>
                                  <span className="opacity-60"> — Built by </span>
                                  <span data-testid={`tool-strip-owner-${r.id}-${t.id}`}>{ownerLabel}</span>
                                  <span className="opacity-60"> · last refreshed </span>
                                  <span data-testid={`tool-strip-freshness-${r.id}-${t.id}`}>
                                    {formatLastBuilt(t.lastBuiltAt, t.lastBuiltSource.kind)}
                                  </span>
                                  <span className="opacity-60"> · called by </span>
                                  <span data-testid={`tool-strip-called-by-${r.id}-${t.id}`}>{calledByLabel}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>

        <CreateResourceDialog kind={kind} open={createOpen} onOpenChange={setCreateOpen} />
        <EditResourceDialog resource={editTarget} open={editTarget !== null} onOpenChange={(o) => !o && setEditTarget(null)} />
        <VersionHistoryDialog resource={historyTarget} open={historyTarget !== null} onOpenChange={(o) => !o && setHistoryTarget(null)} />
        <DeleteResourceDialog resource={deleteTarget} open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)} />
        <ResourceDetailDialog resourceId={detailId} onOpenChange={(o) => !o && closeDetail()} />
      </Card>
    </div>
  );
}
