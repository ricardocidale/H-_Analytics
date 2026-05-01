import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IconHistory } from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { formatRelative, formatWithUnit, type ConstantRow, type ResearchRun } from "./_shared";

export function HistoryButton({
  row, country, subdivision,
}: {
  row: ConstantRow;
  country: string;
  /**
   * Optional US-state subdivision. Forwarded only for `country+state`
   * rows so the history popover stays scoped to the same locality the
   * card was rendered at (e.g. `taxRate` for Texas vs federal).
   */
  subdivision: string | null;
}) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useQuery<{ runs: ResearchRun[] }>({
    queryKey: ["admin-model-constants-history", row.key, country, subdivision, row.locality],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (row.locality !== "universal") params.set("country", country);
      if (row.locality === "country+state" && subdivision) params.set("subdivision", subdivision);
      const res = await fetch(
        `/api/admin/model-constants/${row.key}/research-history?${params}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load history");
      return res.json();
    },
    enabled: open,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          title="Show recent research runs for this constant."
          data-testid={`button-history-${row.key}`}
        >
          <IconHistory className="w-3.5 h-3.5 mr-1.5" />
          History
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 max-h-[24rem] overflow-y-auto"
        align="start"
        data-testid={`popover-history-${row.key}`}
      >
        <div className="text-sm font-medium mb-2">Research history — {row.label}</div>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        )}
        {error && !isLoading && (
          <div className="text-xs text-destructive">Failed to load history.</div>
        )}
        {data && !isLoading && data.runs.length === 0 && (
          <div className="text-xs text-muted-foreground italic py-2">
            No prior research runs recorded for this constant.
          </div>
        )}
        {data && !isLoading && data.runs.length > 0 && (
          <ul className="space-y-2">
            {data.runs.map((run) => (
              <li
                key={run.id}
                className="rounded-md border border-border bg-muted/30 p-2 text-xs"
                data-testid={`history-run-${run.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono">
                    {formatWithUnit(run.metadata?.proposal?.value, row.unit)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelative(run.startedAt)}
                  </span>
                </div>
                {run.metadata?.proposal?.authority && (
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {run.metadata.proposal.authority}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  {run.metadata?.specialistLetter && (
                    <span>Specialist {run.metadata.specialistLetter}</span>
                  )}
                  <span>· {(run.metadata?.sources ?? []).length} sources</span>
                  <span>· {run.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Gated free-form Override dialog (Phase 4). Renders ONLY when
 * `row.specialistOwned === false`. Today this branch never renders
 * (every registry entry is specialistOwned), but it remains so a
 * future non-authority constant can re-enable manual edits without
 * a UI change. The server-side guard rejects the matching
 * `source = 'manual'` PUT for any specialistOwned key with HTTP 422,
 * so even if this affordance leaked, the write would be denied.
 */