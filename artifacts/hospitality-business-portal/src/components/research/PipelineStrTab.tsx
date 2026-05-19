/**
 * Pipeline & STR — Submarket Supply Pipeline + STR Restriction Trends panels.
 *
 * Two side-by-side panels backed by the `/api/market-signals/:propertyId/*`
 * endpoints. Both surfaces are Specialist-supplied (Risk Intelligence /
 * property.risk-intelligence) — no scrapers — so the data lifecycle is
 * always: read → render → trigger Analyst-led refresh on demand. Conviction
 * + last-refreshed chips are rendered at the row level so reviewers know
 * how much to trust each signal at a glance.
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  IconBuilding,
  IconShieldCheck,
  IconShieldAlert,
  IconTrendingUp,
  IconTrendingDown,
  IconArrowRightLeft,
  IconExternalLink,
  IconCheckCircle,
} from "@/components/icons";
import { card, stagger, fadeUp, EmptySection } from "./research-chart-shared";
import { AnalystButton } from "@/components/intelligence/AnalystButton";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  SubmarketSupplyProject,
  StrOrdinanceEvent,
  SignalConviction,
} from "@shared/schema";
import type {
  PipelinePressureResult,
  RevparDragResult,
  StrTrendResult,
} from "@shared/market-intelligence-pipeline";

interface PipelineApiResponse {
  projects: SubmarketSupplyProject[];
  pressure: PipelinePressureResult;
  drag: RevparDragResult | null;
  existingInventory: number;
}

interface StrApiResponse {
  events: StrOrdinanceEvent[];
  trend: StrTrendResult;
  strExempt: boolean;
}

const PRESSURE_BAND_STYLE: Record<PipelinePressureResult["band"], string> = {
  green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  red:   "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
};

const STATUS_LABEL: Record<string, string> = {
  announced:          "Announced",
  planned:            "Planned",
  under_construction: "Under Construction",
  opened_recent:      "Opened (24mo)",
};

const CONVICTION_STYLE: Record<SignalConviction, string> = {
  high:   "bg-primary/15 text-primary border-primary/30",
  medium: "bg-muted text-muted-foreground border-border",
  low:    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
};

interface PipelineStrTabProps {
  propertyId: number;
  baselineRevpar?: number;
}

export function PipelineStrTab({ propertyId, baselineRevpar }: PipelineStrTabProps) {
  const baselineParam = baselineRevpar && baselineRevpar > 0 ? `?baselineRevpar=${baselineRevpar}` : "";

  const pipelineQuery = useQuery<PipelineApiResponse>({
    queryKey: ["/api/market-signals", propertyId, "supply-pipeline", baselineRevpar ?? null],
    queryFn: async () => {
      const r = await fetch(`/api/market-signals/${propertyId}/supply-pipeline${baselineParam}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load supply pipeline");
      return r.json();
    },
  });

  const strQuery = useQuery<StrApiResponse>({
    queryKey: ["/api/market-signals", propertyId, "str-events"],
    queryFn: async () => {
      const r = await fetch(`/api/market-signals/${propertyId}/str-events`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load STR events");
      return r.json();
    },
  });

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SupplyPipelinePanel
          propertyId={propertyId}
          data={pipelineQuery.data}
          loading={pipelineQuery.isLoading}
          onRefresh={() => pipelineQuery.refetch()}
        />
        <StrTrendsPanel
          propertyId={propertyId}
          data={strQuery.data}
          loading={strQuery.isLoading}
          onRefresh={() => strQuery.refetch()}
        />
      </div>
    </motion.div>
  );
}

// ── Supply Pipeline panel ────────────────────────────────────────────────────

function SupplyPipelinePanel({
  propertyId,
  data,
  loading,
  onRefresh,
}: {
  propertyId: number;
  data: PipelineApiResponse | undefined;
  loading: boolean;
  onRefresh: () => void;
}) {
  const projects = data?.projects ?? [];
  const pressure = data?.pressure;
  const drag = data?.drag;

  return (
    <motion.div
      variants={fadeUp}
      className={`${card} p-6 space-y-4`}
      data-testid={`panel-supply-pipeline-${propertyId}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <IconBuilding className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">Submarket Supply Pipeline</h3>
            <p className="text-xs text-muted-foreground">Specialist-supplied — Risk Intelligence</p>
          </div>
        </div>
        <AnalystButton
          onClick={onRefresh}
          isRunning={loading}
          size="sm"
          dataTestId={`button-analyst-supply-pipeline-${propertyId}`}
          tooltip="Refresh pipeline research"
        />
      </div>

      {pressure && (
        <div
          className={`rounded-xl border px-4 py-3 flex items-center justify-between ${PRESSURE_BAND_STYLE[pressure.band]}`}
          data-testid={`gauge-pipeline-pressure-${propertyId}`}
        >
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider opacity-80">Pipeline Pressure</p>
            <p className="text-2xl font-bold">{(pressure.pressureRatio * 100).toFixed(1)}%</p>
            <p className="text-xs opacity-80">
              {pressure.weightedNewKeys.toFixed(0)} weighted new keys ÷ {pressure.existingInventory.toLocaleString()} existing
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs uppercase tracking-wider opacity-80">Band</p>
            <p className="text-2xl font-bold capitalize">{pressure.band}</p>
            <p className="text-xs opacity-80">Score {pressure.score}/100</p>
          </div>
        </div>
      )}

      {drag && (
        <div
          className="rounded-xl border border-primary/10 bg-primary/[0.02] px-4 py-3"
          data-testid={`text-revpar-drag-${propertyId}`}
        >
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Modeled RevPAR Drag at Stabilization</p>
          <p className="text-base font-semibold mt-1">
            −{(drag.dragRate * 100).toFixed(1)}% &nbsp;
            <span className="text-sm font-normal text-muted-foreground">
              (~${drag.revparHaircut.toFixed(0)} haircut → ${drag.modeledRevpar.toFixed(0)} modeled)
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{drag.narrative}</p>
        </div>
      )}

      {projects.length === 0 ? (
        <EmptySection />
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {projects.map((p) => (
            <SupplyProjectRow key={p.id} project={p} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function SupplyProjectRow({ project }: { project: SubmarketSupplyProject }) {
  const conviction = (project.conviction ?? "medium") as SignalConviction;
  return (
    <div
      className="rounded-lg border border-primary/10 bg-white/40 dark:bg-white/[0.02] px-3 py-2.5 hover:bg-white/60 dark:hover:bg-white/[0.04] transition-colors"
      data-testid={`row-supply-project-${project.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" data-testid={`text-project-name-${project.id}`}>
            {project.name}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {[project.brand, project.segment, project.openingYear].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold tabular-nums" data-testid={`text-project-keys-${project.id}`}>
            {(project.keyCount ?? 0).toLocaleString()} keys
          </p>
          <Badge variant="outline" className="text-[10px] mt-0.5">
            {STATUS_LABEL[project.status] ?? project.status}
          </Badge>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0"><ConvictionChip conviction={conviction} /></div>
        <div className="shrink-0"><LastUpdatedChip ts={project.lastRefreshedAt} source={project.source} sourceUrl={project.sourceUrl} /></div>
      </div>
    </div>
  );
}

// ── STR Trends panel ─────────────────────────────────────────────────────────

const TREND_STYLE: Record<StrTrendResult["direction"], { icon: typeof IconArrowRightLeft; cls: string; label: string }> = {
  tightening: { icon: IconTrendingUp,     cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",       label: "Tightening" },
  loosening:  { icon: IconTrendingDown,   cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", label: "Loosening" },
  stable:     { icon: IconArrowRightLeft, cls: "bg-muted text-muted-foreground border-border",                              label: "Stable" },
};

function StrTrendsPanel({
  propertyId,
  data,
  loading,
  onRefresh,
}: {
  propertyId: number;
  data: StrApiResponse | undefined;
  loading: boolean;
  onRefresh: () => void;
}) {
  const events = data?.events ?? [];
  const trend = data?.trend;
  const strExempt = data?.strExempt ?? false;
  const trendStyle = trend ? TREND_STYLE[trend.direction] : TREND_STYLE.stable;
  const TrendIcon = trendStyle.icon;

  return (
    <motion.div
      variants={fadeUp}
      className={`${card} p-6 space-y-4`}
      data-testid={`panel-str-trends-${propertyId}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            {strExempt ? <IconShieldCheck className="w-5 h-5 text-emerald-500" /> : <IconShieldAlert className="w-5 h-5 text-rose-500" />}
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">STR Restriction Trends</h3>
            <p className="text-xs text-muted-foreground">Specialist-supplied — Risk Intelligence</p>
          </div>
        </div>
        <AnalystButton
          onClick={onRefresh}
          isRunning={loading}
          size="sm"
          dataTestId={`button-analyst-str-trends-${propertyId}`}
          tooltip="Refresh STR ordinance research"
        />
      </div>

      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={
            strExempt
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
              : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
          }
          data-testid={`badge-str-exempt-${propertyId}`}
        >
          {strExempt ? "Exempt" : "Exposed"}
        </Badge>
        {trend && (
          <Badge variant="outline" className={trendStyle.cls} data-testid={`badge-str-trend-${propertyId}`}>
            <TrendIcon className="w-3 h-3 mr-1 inline" />
            {trendStyle.label}
          </Badge>
        )}
        {trend && (
          <span className="text-xs text-muted-foreground">
            {trend.consideredCount} event{trend.consideredCount === 1 ? "" : "s"} · trailing {trend.windowMonths}mo
          </span>
        )}
      </div>

      {trend && (
        <p className="text-xs text-muted-foreground leading-relaxed" data-testid={`text-str-narrative-${propertyId}`}>
          {trend.narrative}
        </p>
      )}

      {events.length === 0 ? (
        <EmptySection />
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {events.map((e) => (
            <StrEventRow key={e.id} event={e} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function StrEventRow({ event }: { event: StrOrdinanceEvent }) {
  const conviction = (event.conviction ?? "medium") as SignalConviction;
  const dirStyle = TREND_STYLE[event.direction as StrTrendResult["direction"]] ?? TREND_STYLE.stable;
  return (
    <div
      className="rounded-lg border border-primary/10 bg-white/40 dark:bg-white/[0.02] px-3 py-2.5"
      data-testid={`row-str-event-${event.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" data-testid={`text-event-title-${event.id}`}>
            {event.title}
          </p>
          <p className="text-xs text-muted-foreground">
            {event.eventDate} · {event.eventType.replace(/_/g, " ")}
          </p>
        </div>
        <Badge variant="outline" className={`${dirStyle.cls} text-[10px] shrink-0`}>
          {dirStyle.label}
        </Badge>
      </div>
      {event.summary && (
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-3">{event.summary}</p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0"><ConvictionChip conviction={conviction} /></div>
        <div className="shrink-0"><LastUpdatedChip ts={event.lastRefreshedAt} source={event.source} sourceUrl={event.sourceUrl} /></div>
      </div>
    </div>
  );
}

// ── Shared chip primitives ───────────────────────────────────────────────────

function ConvictionChip({ conviction }: { conviction: SignalConviction }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${CONVICTION_STYLE[conviction]}`}
            data-testid={`chip-conviction-${conviction}`}
          >
            <IconCheckCircle className="w-3 h-3" />
            {conviction === "high" ? "High conviction" : conviction === "medium" ? "Medium conviction" : "Low conviction"}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Specialist's confidence in this signal. High = primary-source-confirmed.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function LastUpdatedChip({
  ts,
  source,
  sourceUrl,
}: {
  ts: Date | string | null;
  source: string | null;
  sourceUrl: string | null;
}) {
  const label = formatRelativeTimestamp(ts);
  const inner = (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className="opacity-80">Updated {label}</span>
      {source && <span className="opacity-60">· {source}</span>}
    </span>
  );
  if (sourceUrl) {
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 hover:text-primary transition-colors"
        data-testid="link-source"
      >
        {inner}
        <IconExternalLink className="w-3 h-3 text-muted-foreground" />
      </a>
    );
  }
  return inner;
}

function formatRelativeTimestamp(ts: Date | string | null): string {
  if (!ts) return "—";
  const t = typeof ts === "string" ? Date.parse(ts) : ts.getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}
