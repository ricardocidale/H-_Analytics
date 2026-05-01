import { IconShieldCheck, IconSparkles } from "@/components/icons";
import { AlertTriangle } from "@/components/icons/themed-icons";

import type { ResolvedSource } from "@shared/get-effective-constant";
import type { ConstantUnit } from "@shared/model-constants-registry";

export interface LatestResearchRun {
  id: number;
  asOf: string | null;
  authority: string | null;
  value: unknown;
  sourcesCount: number;
  isDifferentFromCurrent: boolean;
}

export interface ConstantRow {
  key: string;
  label: string;
  locality: "universal" | "country" | "country+state";
  authority: string;
  referenceUrl?: string;
  helperText: string;
  requestedAt: { country: string | null; subdivision: string | null };
  scope: { locality: "universal" | "country" | "country+state"; country: string | null; subdivision: string | null };
  unit: ConstantUnit;
  factoryValue: unknown;
  factoryWasFallback: boolean;
  effectiveValue: unknown;
  source: ResolvedSource;
  resolvedAt: "subdivision" | "country" | "universal" | null;
  override: {
    id: number;
    overrideNote: string | null;
    authority: string | null;
    referenceUrl: string | null;
    createdAt: string;
  } | null;
  specialistOwned: boolean;
  specialistId: string | null;
  specialistLetter: string | null;
  specialistName: string | null;
  lastRefreshedAt: string | null;
  refreshCadenceDays: number | null;
  isStale: boolean;
  latestResearchRun: LatestResearchRun | null;
  convictionSummary: string;
}

export interface ApiResponse {
  country: string | null;
  subdivision: string | null;
  items: ConstantRow[];
}

export interface ProposalPayload {
  key: string;
  label: string;
  country: string | null;
  subdivision: string | null;
  value: unknown;
  authority: string;
  referenceUrl: string | null;
  reasoning: string;
  sources: { title: string; url: string }[];
  factoryValue: unknown;
  currentValue: unknown;
  isDifferentFromCurrent: boolean;
  researchRunId: number | null;
  specialistId: string | null;
}

export interface ResearchRun {
  id: number;
  startedAt: string;
  completedAt: string | null;
  status: string;
  durationMs: number | null;
  metadata: {
    specialistId?: string;
    specialistLetter?: string;
    proposal?: { value?: unknown; authority?: string; isDifferentFromCurrent?: boolean };
    sources?: { title: string; url: string }[];
  } | null;
}

export function formatNumber(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/\.?0+$/, "");
  if (typeof v === "string" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

export function formatWithUnit(value: unknown, unit: ConstantUnit): string {
  if (value === null || value === undefined) return "—";
  if (unit === "percent" && typeof value === "number") {
    return `${(value * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
  }
  if (unit === "years" && typeof value === "number") return `${formatNumber(value)} yrs`;
  if (unit === "days" && typeof value === "number") return `${formatNumber(value)} days`;
  return formatNumber(value);
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "Never refreshed";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  return `${mo}mo ago`;
}

export function formatAbsolute(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

export function ProvenanceBadge({ source }: { source: ResolvedSource }) {
  if (source === "manual") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
        data-testid="badge-source-manual"
      >
        <AlertTriangle className="w-3 h-3" /> Manual override
      </span>
    );
  }
  if (source === "analyst") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30"
        data-testid="badge-source-analyst"
      >
        <IconSparkles className="w-3 h-3" /> Analyst
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border"
      data-testid="badge-source-factory"
    >
      <IconShieldCheck className="w-3 h-3" /> Factory
    </span>
  );
}

export function SpecialistBadge({ letter, name }: { letter: string | null; name: string | null }) {
  if (!letter) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30"
      title={name ? `Owned by Specialist ${letter} — ${name}` : `Owned by Specialist ${letter}`}
      data-testid={`badge-specialist-${letter}`}
    >
      <IconSparkles className="w-3 h-3" /> {letter}
      {name && <span className="hidden sm:inline opacity-80">· {name}</span>}
    </span>
  );
}

export function StaleBadge({
  lastRefreshedAt,
  cadenceDays,
  testId,
}: {
  lastRefreshedAt: string | null;
  cadenceDays: number | null;
  testId: string;
}) {
  // "N days ago" copy mirrors the task spec ("Stale — last refreshed N days
  // ago"). When no refresh has ever run we say so explicitly rather than
  // showing a confusing "0d ago".
  let detail: string;
  if (!lastRefreshedAt) {
    detail = "never refreshed";
  } else {
    const ms = Date.now() - new Date(lastRefreshedAt).getTime();
    const days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
    detail = `last refreshed ${days} day${days === 1 ? "" : "s"} ago`;
  }
  const tooltip =
    cadenceDays != null
      ? `Scheduled cadence: every ${cadenceDays} day${cadenceDays === 1 ? "" : "s"}. ${detail}.`
      : detail;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
      title={tooltip}
      data-testid={testId}
    >
      <AlertTriangle className="w-3 h-3" /> Stale — {detail}
    </span>
  );
}

export function ScopeChip({ scope }: { scope: ConstantRow["scope"] }) {
  let label: string;
  if (scope.locality === "universal") label = "Universal";
  else if (scope.subdivision) label = `${scope.country ?? "?"} · ${scope.subdivision}`;
  else label = scope.country ?? "?";
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30"
      data-testid="badge-scope"
      title="Jurisdiction this row resolves to."
    >
      {label}
    </span>
  );
}

