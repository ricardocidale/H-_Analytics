import { IconCheckCircle, IconAlertTriangle, IconClock, IconRefreshCw } from "@/components/icons";
import { ThinkingRing, NeuralGlow } from "@/components/ui/ai-loader";
import { AnalystButton } from "@/components/intelligence/AnalystButton";
import { cn } from "@/lib/utils";

export type FreshnessStatus = "current" | "stale" | "very_stale" | "missing" | "running";

const STALE_THRESHOLD_DAYS = 30;
const VERY_STALE_THRESHOLD_DAYS = 90;

function safeTimestamp(val: string | Date | null | undefined): number | null {
  if (!val) return null;
  const ts = new Date(val).getTime();
  return Number.isFinite(ts) ? ts : null;
}

export function computeFreshnessStatus(opts: {
  researchUpdatedAt: string | Date | null | undefined;
  lastAssumptionChangeAt: string | Date | null | undefined;
  isGenerating: boolean;
}): { status: FreshnessStatus; reason: string; daysAgo: number | null } {
  if (opts.isGenerating) {
    return { status: "running", reason: "The Analyst is studying your assumptions", daysAgo: null };
  }

  const updatedAt = safeTimestamp(opts.researchUpdatedAt);
  if (updatedAt === null) {
    return { status: "missing", reason: "The Analyst hasn't reviewed these assumptions yet", daysAgo: null };
  }

  const daysAgo = Math.max(0, Math.floor((Date.now() - updatedAt) / (1000 * 60 * 60 * 24)));

  const assumptionTs = safeTimestamp(opts.lastAssumptionChangeAt);
  if (assumptionTs !== null && assumptionTs > updatedAt) {
    return { status: "stale", reason: "Assumptions changed since last review", daysAgo };
  }

  if (daysAgo >= VERY_STALE_THRESHOLD_DAYS) {
    return { status: "very_stale", reason: `Last reviewed ${daysAgo} days ago — overdue for review`, daysAgo };
  }

  if (daysAgo >= STALE_THRESHOLD_DAYS) {
    return { status: "stale", reason: "Due for review — analyst guidance may be outdated", daysAgo };
  }

  return { status: "current", reason: "Analyst review is current", daysAgo };
}

const STATUS_CONFIG: Record<FreshnessStatus, {
  bg: string;
  border: string;
  text: string;
  icon: typeof IconCheckCircle;
  label: string;
}> = {
  current: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-700 dark:text-emerald-400",
    icon: IconCheckCircle,
    label: "Up to date",
  },
  stale: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-700 dark:text-amber-400",
    icon: IconClock,
    label: "Due for review",
  },
  very_stale: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-700 dark:text-red-400",
    icon: IconAlertTriangle,
    label: "Overdue",
  },
  missing: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-700 dark:text-blue-400",
    icon: IconAlertTriangle,
    label: "Not yet reviewed",
  },
  running: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-700 dark:text-blue-400",
    icon: IconRefreshCw,
    label: "Reviewing",
  },
};

interface IntelligenceStatusBarProps {
  researchUpdatedAt: string | Date | null | undefined;
  lastAssumptionChangeAt: string | Date | null | undefined;
  isGenerating: boolean;
  onRunResearch: () => void;
  className?: string;
}

export function IntelligenceStatusBar({
  researchUpdatedAt,
  lastAssumptionChangeAt,
  isGenerating,
  onRunResearch,
  className,
}: IntelligenceStatusBarProps) {
  const { status, reason, daysAgo } = computeFreshnessStatus({
    researchUpdatedAt,
    lastAssumptionChangeAt,
    isGenerating,
  });

  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  const timeLabel = daysAgo !== null
    ? daysAgo === 0 ? "today" : daysAgo === 1 ? "1 day ago" : `${daysAgo} days ago`
    : null;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border",
        config.bg, config.border,
        className,
      )}
      data-testid="intelligence-status-bar"
      data-status={status}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {status === "running" ? (
          <ThinkingRing size={16} className="flex-shrink-0" />
        ) : status === "missing" ? (
          <NeuralGlow size={20} className="flex-shrink-0" />
        ) : (
          <StatusIcon className={cn("w-4 h-4 flex-shrink-0", config.text)} />
        )}
        <span className={cn("text-sm font-medium", config.text)} data-testid="status-label">
          {config.label}
        </span>
        <span className="text-sm text-muted-foreground truncate">
          {reason}
          {timeLabel && status !== "missing" && ` · Last reviewed ${timeLabel}`}
        </span>
      </div>
      {(status === "stale" || status === "very_stale" || status === "missing") && (
        <AnalystButton
          onClick={onRunResearch}
          size="sm"
          variant="ghost"
          className={cn("flex-shrink-0", config.text)}
          dataTestId="button-regenerate-research"
        />
      )}
    </div>
  );
}
