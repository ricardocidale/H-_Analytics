import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IconSparkles } from "@/components/icons";
import { Loader2, RefreshCw } from "@/components/icons/themed-icons";
import { formatWithUnit, type ConstantRow, type ProposalPayload } from "./_shared";

export function RefreshResearchPopover({
  row, country, subdivision,
}: {
  row: ConstantRow;
  country: string;
  /**
   * Optional US-state subdivision. Forwarded only when the row is
   * registered as `country+state` (today: `taxRate`, `costRateTaxes`).
   * For country-only and universal rows, the server folds subdivision
   * to NULL — passing one would 400 from the locality validator.
   */
  subdivision: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [proposal, setProposal] = useState<ProposalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const localityParams = () => {
    const p = new URLSearchParams();
    if (row.locality !== "universal") p.set("country", country);
    if (row.locality === "country+state" && subdivision) p.set("subdivision", subdivision);
    return p;
  };

  const refresh = useMutation({
    mutationFn: async (): Promise<{ proposal: ProposalPayload }> => {
      const res = await fetch(
        `/api/admin/model-constants/${row.key}/refresh?${localityParams()}`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Refresh failed (HTTP ${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setProposal(data.proposal);
      setError(null);
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Unknown error");
      setProposal(null);
    },
  });

  const apply = useMutation({
    mutationFn: async (): Promise<{ wasFactoryEqual: boolean }> => {
      if (!proposal?.researchRunId) {
        throw new Error("Cannot apply: missing research run id.");
      }
      const res = await fetch(
        `/api/admin/model-constants/${row.key}/apply-proposal?${localityParams()}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ researchRunId: proposal.researchRunId }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Apply failed (HTTP ${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-model-constants"] });
      queryClient.invalidateQueries({ queryKey: ["admin-model-constants-history", row.key] });
      toast({
        title: data.wasFactoryEqual ? "Reset to factory" : "Applied",
        description: `${row.label}: ${proposal?.authority ?? ""}`,
      });
      setOpen(false);
      setProposal(null);
    },
    onError: (e) => {
      toast({
        title: "Apply failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setProposal(null);
      setError(null);
    }
  };

  const handleClick = () => {
    setOpen(true);
    setProposal(null);
    setError(null);
    refresh.mutate();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClick}
          title="Have the Analyst re-fetch this constant from the cited authority. Preview before applying."
          data-testid={`button-analyst-${row.key}`}
        >
          {refresh.isPending
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-accent-pop" />
            : <IconSparkles className="w-3.5 h-3.5 mr-1.5" />}
          {refresh.isPending ? "Studying…" : "Analyst"}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 max-h-[28rem] overflow-y-auto"
        align="start"
        data-testid={`popover-refresh-research-${row.key}`}
      >
        <div className="space-y-3">
          <div className="text-sm font-medium flex items-center gap-2">
            <IconSparkles className="w-4 h-4 text-yellow-500" />
            Analyst — {row.label}
          </div>

          {refresh.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin text-accent-pop" />
              {row.specialistName ?? "Specialist"} is researching the authority…
            </div>
          )}

          {error && !refresh.isPending && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              <div className="font-medium mb-1">Refresh failed</div>
              <div className="opacity-90">{error}</div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => refresh.mutate()}
                data-testid={`button-retry-refresh-${row.key}`}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
              </Button>
            </div>
          )}

          {proposal && !refresh.isPending && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-border bg-muted/30 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Previous</div>
                  <div className="text-base font-mono" data-testid={`refresh-previous-${row.key}`}>
                    {formatWithUnit(proposal.currentValue, row.unit)}
                  </div>
                </div>
                <div className={`rounded-md border p-2.5 ${proposal.isDifferentFromCurrent ? "border-yellow-500/40 bg-yellow-500/5" : "border-border bg-muted/30"}`}>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">New</div>
                  <div className="text-base font-mono" data-testid={`refresh-new-${row.key}`}>
                    {formatWithUnit(proposal.value, row.unit)}
                  </div>
                </div>
              </div>

              {!proposal.isDifferentFromCurrent && (
                <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-2 text-xs text-blue-700 dark:text-blue-300">
                  Specialist confirmed the current value is correct. Apply will record this confirmation in the audit trail.
                </div>
              )}

              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Authority</div>
                <div className="text-xs">{proposal.authority}</div>
                {proposal.referenceUrl && (
                  <a
                    href={proposal.referenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] underline text-muted-foreground hover:text-foreground break-all"
                  >
                    {proposal.referenceUrl}
                  </a>
                )}
              </div>

              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Evidence</div>
                <p className="text-xs text-foreground/90 leading-relaxed">{proposal.reasoning}</p>
              </div>

              {proposal.sources.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Sources ({proposal.sources.length})
                  </div>
                  <ul className="space-y-1 text-[11px]">
                    {proposal.sources.slice(0, 5).map((s, i) => (
                      <li key={`${s.url}-${i}`} className="truncate">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-muted-foreground hover:text-foreground"
                          title={s.title}
                        >
                          [{i + 1}] {s.title || s.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="text-[11px] italic text-muted-foreground">
                  No grounded web sources available; Specialist answered from training data.
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenChange(false)}
                  disabled={apply.isPending}
                  data-testid={`button-discard-refresh-${row.key}`}
                >
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={() => apply.mutate()}
                  disabled={apply.isPending || !proposal.researchRunId}
                  data-testid={`button-apply-refresh-${row.key}`}
                >
                  {apply.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-accent-pop" />}
                  Apply
                </Button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Per-row research history popover. Lists the most recent
 * `research_runs` for this Constant.
 */