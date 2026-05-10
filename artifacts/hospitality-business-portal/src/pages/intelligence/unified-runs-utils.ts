import { AGENTS, ORCHESTRATORS } from "@/lib/agent-taxonomy";
import type { SlideAgentResultFE, UnifiedRunStatus } from "./unified-runs-types";

export * from "./unified-runs-types";

// ── Named constants ────────────────────────────────────────────────────────

/** Poll interval while any run is in progress (ms). */
export const RUNS_POLL_MS = 8_000;

/** Number of Slide Factory runs to request. */
export const SLIDE_RUNS_LIMIT = 20;

/** Total slide count in one L+B deck. */
export const TOTAL_DECK_SLIDES = 6;

export const MS_PER_MINUTE = 60 * 1_000;
export const MS_PER_HOUR = 60 * 60 * 1_000;
export const MS_PER_DAY = 24 * 60 * 60 * 1_000;

// ── Date range ─────────────────────────────────────────────────────────────

export const DATE_RANGE_OPTIONS = [
  { value: "7d",  label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
] as const;

export type DateRange = "7d" | "30d" | "all";

// ── Helpers ───────────────────────────────────────────────────────────────

export function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "—";
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (diffMs < 0) return "just now";
  if (diffMs < MS_PER_MINUTE) return "< 1 min ago";
  if (diffMs < MS_PER_HOUR) {
    const mins = Math.floor(diffMs / MS_PER_MINUTE);
    return `${mins} min ago`;
  }
  if (diffMs < MS_PER_DAY) {
    const hours = Math.floor(diffMs / MS_PER_HOUR);
    return `${hours}h ago`;
  }
  const days = Math.floor(diffMs / MS_PER_DAY);
  return `${days}d ago`;
}

export function formatAbsoluteTime(isoString: string | null): string {
  if (!isoString) return "—";
  const d = new Date(isoString);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1_000)}s`;
}

export function normalizeStatus(raw: string): UnifiedRunStatus {
  const map: Record<string, UnifiedRunStatus> = {
    running: "running",
    completed: "completed",
    complete: "complete",
    error: "error",
    new: "new",
    brief_ready: "brief_ready",
    ingesting: "ingesting",
    ingested: "ingested",
    drafting: "drafting",
    draft_review: "draft_review",
    building: "building",
    ok: "completed",
    warn: "completed",
  };
  return map[raw] ?? "pending";
}

export function statusVariant(
  status: UnifiedRunStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed" || status === "complete") return "default";
  if (status === "error") return "destructive";
  if (
    status === "running" ||
    status === "building" ||
    status === "drafting" ||
    status === "ingesting"
  )
    return "outline";
  return "secondary";
}

export function statusLabel(status: UnifiedRunStatus): string {
  const map: Record<UnifiedRunStatus, string> = {
    running: "Running",
    completed: "Completed",
    complete: "Complete",
    error: "Error",
    pending: "Pending",
    new: "New",
    brief_ready: "Brief Ready",
    ingesting: "Ingesting",
    ingested: "Ingested",
    drafting: "Drafting",
    draft_review: "Draft Review",
    building: "Building",
  };
  return map[status] ?? status;
}

export function isActiveRun(status: UnifiedRunStatus): boolean {
  return ["running", "building", "drafting", "ingesting"].includes(status);
}

export function withinDateRange(
  isoString: string | null,
  range: DateRange,
): boolean {
  if (range === "all") return true;
  if (!isoString) return true;
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (range === "7d") return diffMs <= 7 * MS_PER_DAY;
  return diffMs <= 30 * MS_PER_DAY;
}

// ── Scheduler key classification ───────────────────────────────────────────

export const ANALYST_SCHEDULER_KEYS: Record<string, string> = {
  "research-workflows": ORCHESTRATORS.gustavo.humanName,
  "constants-refresh": "Constants Refresh",
  "specialist-quality": "Specialist Quality",
  "specialist-photos-batch": "Fernanda",
};

export const IRIS_SCHEDULER_KEYS: Record<string, string> = {
  "iris-health": AGENTS.iris.humanName,
  "iris-reindex": AGENTS.iris.humanName,
};

// ── Maya verdict display maps ──────────────────────────────────────────────

export const MAYA_VERDICT_LABEL: Record<
  NonNullable<SlideAgentResultFE["mayaVerdict"]>,
  string
> = {
  ok: "OK",
  advisory: "Advisory",
  warning: "Warning",
  block: "Block",
};

export const MAYA_VERDICT_CLASS: Record<
  NonNullable<SlideAgentResultFE["mayaVerdict"]>,
  string
> = {
  ok: "text-emerald-700 bg-emerald-50",
  advisory: "text-sky-700 bg-sky-50",
  warning: "text-amber-700 bg-amber-50",
  block: "text-red-700 bg-red-50",
};
