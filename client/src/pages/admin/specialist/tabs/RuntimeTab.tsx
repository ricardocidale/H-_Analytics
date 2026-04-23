/**
 * RuntimeTab — free-form JSON object passed to the Specialist evaluator
 * at runtime. Includes a sibling CadenceCard (exported separately because
 * it's only rendered for Constants Specialists) for the per-Specialist
 * scheduled-refresh cadence override.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SpecialistConfigView } from "../types";

export function RuntimeTab({ specialistId, config }: { specialistId: string; config: SpecialistConfigView }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState(JSON.stringify(config.runtimeConfig ?? {}, null, 2));
  const [summary, setSummary] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      let runtimeConfig: Record<string, unknown>;
      try { runtimeConfig = JSON.parse(text); } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Invalid JSON";
        setParseError(msg);
        throw new Error(msg);
      }
      setParseError(null);
      const res = await apiRequest("PUT", `/api/admin/specialists/${specialistId}/runtime`, {
        runtimeConfig,
        changeSummary: summary || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Runtime updated" });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}`] });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/audit`] });
      setSummary("");
    },
    onError: (e: unknown) => toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Runtime</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Free-form JSON object passed to the Specialist evaluator at runtime.
        </p>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} className="font-mono text-sm" data-testid="textarea-runtime-json" />
        {parseError && <p className="text-xs text-destructive" data-testid="text-runtime-parse-error">{parseError}</p>}
        <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Change summary (optional, recorded in audit)" data-testid="input-change-summary-runtime" />
        <div className="flex justify-end">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-save-runtime">
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── CadenceCard ────────────────────────────────────────────────────────
// Per-Specialist override for the scheduled Constants refresh cadence.
// Only rendered for Constants Specialists (those whose catalog entry
// owns one or more registry keys). Passing a blank value or clicking
// "Reset to default" clears the override and the scheduler falls back
// to the catalog default.
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
