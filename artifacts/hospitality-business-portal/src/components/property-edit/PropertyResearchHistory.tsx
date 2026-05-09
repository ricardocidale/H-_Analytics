import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "@/components/icons/themed-icons";
import { cn } from "@/lib/utils";

interface ResearchRun {
  id: number;
  status: string;
  tier: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  modelPrimary: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  running: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  pending: "bg-muted text-muted-foreground",
  error: "bg-red-500/10 text-red-600 dark:text-red-400",
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

export function PropertyResearchHistory({ propertyId }: { propertyId: number }) {
  const [open, setOpen] = useState(false);

  const { data: runs, isLoading } = useQuery<ResearchRun[]>({
    queryKey: ["research-runs", "property", propertyId],
    queryFn: async () => {
      const res = await fetch(
        `/api/research/runs?entityType=property&entityId=${propertyId}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`Failed to load research history: ${res.status}`);
      return res.json();
    },
    enabled: open,
    staleTime: 30_000,
  });

  const recentRuns = (runs ?? []).slice(0, 5);

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm px-4 py-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left group">
          <div className="flex items-center gap-2">
            <ChevronDown
              className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", open ? "" : "-rotate-90")}
            />
            <span className="text-sm font-medium text-foreground">Research history</span>
          </div>
          {!open && runs && runs.length > 0 && (
            <span className="text-[11px] text-muted-foreground">{runs.length} run{runs.length !== 1 ? "s" : ""}</span>
          )}
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-3 space-y-0 divide-y divide-border/40" data-testid="research-history-list">
            {isLoading && (
              <p className="py-3 text-[11px] text-muted-foreground animate-pulse">Loading…</p>
            )}
            {!isLoading && recentRuns.length === 0 && (
              <p className="py-3 text-[11px] text-muted-foreground italic">
                No research runs yet. Use the Analyst button or ask Rebecca to trigger research.
              </p>
            )}
            {recentRuns.map((run) => (
              <div
                key={run.id}
                className="flex items-center gap-3 py-2.5 text-[11px]"
                data-testid={`research-run-${run.id}`}
              >
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] px-1.5 py-0 h-4 font-medium border-0 capitalize shrink-0",
                    STATUS_STYLES[run.status] ?? STATUS_STYLES.pending,
                  )}
                >
                  {run.status}
                </Badge>
                <span className="text-muted-foreground shrink-0">
                  Tier {run.tier}
                </span>
                <span className="flex-1 truncate text-foreground/70">
                  {formatRelative(run.startedAt)}
                </span>
                {run.durationMs != null && (
                  <span className="font-mono text-muted-foreground/60 shrink-0 tabular-nums">
                    {formatDuration(run.durationMs)}
                  </span>
                )}
                {run.error && (
                  <span
                    className="truncate text-red-500/80 max-w-[120px]"
                    title={run.error}
                  >
                    {run.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
