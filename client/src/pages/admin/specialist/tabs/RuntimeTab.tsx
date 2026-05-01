/**
 * RuntimeTab — read-only display of the per-Specialist runtime config
 * JSON. Per `.claude/rules/specialists-are-dev-defined-only.md` §3,
 * admins cannot edit Specialist runtime configuration at runtime — the
 * catalog (and the Specialist's evaluator code) are the source of truth.
 *
 * The previous JSON Textarea editor, change-summary Input, save Button,
 * and the PUT mutation have all been removed. The current effective
 * config is rendered as a pretty-printed `<pre>` block.
 *
 * The sibling CadenceCard is exported separately and intentionally
 * RETAINED as editable: per-Specialist scheduled-refresh cadence is a
 * scheduling knob (not persona, prompts, models, field requirements,
 * or routing) so it falls outside the dev-defined-only rule.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SpecialistAuditEntry, SpecialistConfigView } from "../types";

export function RuntimeTab({ config }: { specialistId: string; config: SpecialistConfigView }) {
  const pretty = JSON.stringify(config.runtimeConfig ?? {}, null, 2);
  const isEmpty = !config.runtimeConfig || Object.keys(config.runtimeConfig).length === 0;

  return (
    <div className="space-y-4">
      <Alert data-testid="runtime-readonly-banner">
        <AlertTitle>Read-only — dev-defined</AlertTitle>
        <AlertDescription>
          Runtime config is set in code. This view is read-only — edits
          are forbidden per <code>specialists-are-dev-defined-only.md</code>.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader><CardTitle>Runtime</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Free-form JSON object passed to the Specialist evaluator at runtime.
          </p>
          {isEmpty ? (
            <p className="text-sm text-muted-foreground italic" data-testid="text-runtime-empty">
              No runtime config set — the Specialist runs with evaluator defaults.
            </p>
          ) : (
            <pre
              className="text-xs font-mono bg-muted/40 border rounded-md p-3 overflow-auto max-h-96 whitespace-pre"
              data-testid="text-runtime-json"
            >
              {pretty}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── CadenceCard ────────────────────────────────────────────────────────
// Per-Specialist override for the scheduled Constants refresh cadence.
// Only rendered for Constants Specialists (those whose catalog entry
// owns one or more registry keys). Scheduling cadence is OUTSIDE the
// dev-defined-only rule (which scopes to persona, prompts, models,
// field requirements, and routing) so this remains admin-editable.
export function CadenceCard({ specialistId, config }: { specialistId: string; config: SpecialistConfigView }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string>(
    config.refreshCadenceOverridden ? String(config.refreshCadenceDays ?? "") : "",
  );
  const [summary, setSummary] = useState("");

  const mutation = useMutation({
    mutationFn: async (refreshCadenceDays: number | null) => {
      const res = await apiRequest("PUT", `/api/admin/specialists/${specialistId}/cadence`, {
        refreshCadenceDays,
        changeSummary: summary || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Refresh cadence updated" });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}`] });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/audit`] });
      qc.invalidateQueries({ queryKey: ["/api/admin/model-constants"] });
      setSummary("");
    },
    onError: (e: unknown) =>
      toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  });

  const parsed = draft.trim() === "" ? null : Number(draft);
  const invalid = draft.trim() !== "" && (!Number.isInteger(parsed) || (parsed as number) < 1 || (parsed as number) > 3650);

  const {
    data: auditEntries,
    isLoading: isAuditLoading,
    isError: isAuditError,
  } = useQuery<SpecialistAuditEntry[]>({
    queryKey: [`/api/admin/specialists/${specialistId}/audit`],
  });
  const lastCadenceEdit = (auditEntries ?? []).find((e) => e.section === "cadence");

  return (
    <Card data-testid="card-refresh-cadence">
      <CardHeader>
        <CardTitle>Scheduled refresh cadence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          How often the scheduler re-runs this Specialist across the Constants it owns.
          Leave blank to use the catalog default of{" "}
          <span className="font-mono" data-testid="text-cadence-default">
            {config.defaultRefreshCadenceDays ?? "—"}
          </span>{" "}
          days.
        </p>
        <p className="text-xs text-muted-foreground" data-testid="text-cadence-last-changed">
          {isAuditLoading ? (
            <span data-testid="text-cadence-last-changed-loading">Loading change history…</span>
          ) : isAuditError ? (
            <span className="text-destructive" data-testid="text-cadence-last-changed-error">
              Could not load change history
            </span>
          ) : lastCadenceEdit ? (
            <>
              Last changed{" "}
              <span data-testid="text-cadence-last-changed-when">
                {new Date(lastCadenceEdit.changedAt).toLocaleString()}
              </span>{" "}
              by{" "}
              <span className="font-mono" data-testid="text-cadence-last-changed-by">
                {lastCadenceEdit.changedByUserId != null
                  ? `user #${lastCadenceEdit.changedByUserId}`
                  : "system"}
              </span>
              {lastCadenceEdit.changeSummary ? (
                <>
                  {" — "}
                  <span data-testid="text-cadence-last-changed-summary">
                    {lastCadenceEdit.changeSummary}
                  </span>
                </>
              ) : null}
            </>
          ) : (
            <span data-testid="text-cadence-never-changed">
              Catalog default — never changed
            </span>
          )}
        </p>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Days between refreshes</label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={3650}
              step={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                config.defaultRefreshCadenceDays != null
                  ? `Default: ${config.defaultRefreshCadenceDays}`
                  : "e.g. 30"
              }
              className="w-40"
              data-testid="input-refresh-cadence-days"
            />
          </div>
          <div className="text-xs text-muted-foreground pb-2">
            Effective:{" "}
            <span className="font-mono" data-testid="text-cadence-effective">
              {config.refreshCadenceDays ?? "—"}
            </span>{" "}
            day{config.refreshCadenceDays === 1 ? "" : "s"}
            {config.refreshCadenceOverridden && (
              <Badge variant="outline" className="ml-2" data-testid="badge-cadence-override">
                Override
              </Badge>
            )}
          </div>
        </div>
        {invalid && (
          <p className="text-xs text-destructive" data-testid="text-cadence-invalid">
            Enter a whole number of days between 1 and 3650, or leave blank to use the default.
          </p>
        )}
        <Input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Change summary (optional, recorded in audit)"
          data-testid="input-change-summary-cadence"
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setDraft("");
              mutation.mutate(null);
            }}
            disabled={mutation.isPending || !config.refreshCadenceOverridden}
            data-testid="button-reset-cadence"
          >
            Reset to default
          </Button>
          <Button
            onClick={() => mutation.mutate(parsed === null ? null : Number(parsed))}
            disabled={mutation.isPending || invalid}
            data-testid="button-save-cadence"
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
