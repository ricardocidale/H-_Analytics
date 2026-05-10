import { RUN_TYPE_LABELS, type RunType } from "@/lib/agent-taxonomy";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronRight } from "@/components/icons/themed-icons";
import { IconCheckCircle, IconAlertCircle } from "@/components/icons/status-icons";
import { IconBot, IconBrain, IconWand2 } from "@/components/icons";
import {
  statusVariant,
  statusLabel,
  isActiveRun,
  formatRelativeTime,
  formatDuration,
  type UnifiedRun,
} from "./unified-runs-utils";

// ── Type icon ─────────────────────────────────────────────────────────────

export function RunTypeIcon({ type }: { type: RunType }) {
  if (type === "analyst") return <IconBrain className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  if (type === "iris") return <IconWand2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  return <IconBot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
}

// ── Run row ───────────────────────────────────────────────────────────────

export function RunRow({
  run,
  isSelected,
  onClick,
}: {
  run: UnifiedRun;
  isSelected: boolean;
  onClick: (id: string) => void;
}) {
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
          <Loader2 className="w-4 h-4 animate-spin text-accent-pop" />
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
          <span className="shrink-0">{RUN_TYPE_LABELS[run.type]}</span>
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

      <ChevronRight
        className={`w-3.5 h-3.5 shrink-0 mt-1 transition-colors ${
          isSelected
            ? "text-muted-foreground"
            : "text-muted-foreground/40 group-hover:text-muted-foreground"
        }`}
      />
    </button>
  );
}
