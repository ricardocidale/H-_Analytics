/**
 * Model Constants tab — Phase 2 Admin UI for governed constants.
 *
 * Shows every key registered in MODEL_CONSTANTS_REGISTRY at the chosen
 * country, with a three-state badge (Factory / Analyst / Manual), an
 * authority citation, and admin affordances:
 *
 *   - Override (manual) → opens a dialog requiring a note; the storage
 *     layer auto-deletes if the value matches factory.
 *   - Reset to factory → DELETE on the override row.
 *   - Regenerate via Analyst → placeholder, wired in Phase 3.
 *
 * Universal constants ignore the country selector. Country-keyed constants
 * fall back to the United States row when the selected country has no
 * factory entry (matches the resolver's behaviour).
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Section } from "./FieldHelpers";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { IconShieldCheck, IconSparkles } from "@/components/icons";
import { Loader2, AlertTriangle, RefreshCw } from "@/components/icons/themed-icons";
import { SUPPORTED_COUNTRIES } from "@shared/countryDefaults";
import type { ResolvedSource } from "@shared/get-effective-constant";

interface ConstantRow {
  key: string;
  label: string;
  locality: "universal" | "country" | "country+state";
  authority: string;
  referenceUrl?: string;
  helperText: string;
  requestedAt: { country: string | null; subdivision: string | null };
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
}

interface ApiResponse {
  country: string | null;
  subdivision: string | null;
  items: ConstantRow[];
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "string" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function ProvenanceBadge({ source }: { source: ResolvedSource }) {
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

function OverrideDialog({
  row, country, onSubmit, isPending,
}: {
  row: ConstantRow;
  country: string;
  onSubmit: (value: number, note: string) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const initial = typeof row.effectiveValue === "number" ? row.effectiveValue : 0;
  const [val, setVal] = useState<string>(String(initial));
  const [note, setNote] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setVal(String(typeof row.effectiveValue === "number" ? row.effectiveValue : 0));
      setNote("");
    }
    setOpen(next);
  };

  const handleSubmit = () => {
    const num = Number(val);
    if (!Number.isFinite(num)) return;
    if (note.trim().length === 0) return;
    onSubmit(num, note.trim());
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid={`button-override-${row.key}`}
        >
          Override…
        </Button>
      </DialogTrigger>
      <DialogContent data-testid={`dialog-override-${row.key}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Manually override {row.label}
          </DialogTitle>
          <DialogDescription>
            The Analyst strongly recommends not overriding governed constants.
            They reflect tax-authority and accounting-standard rules and a
            departure from baseline can produce non-GAAP / non-USALI outputs
            for {row.locality === "universal" ? "every property" : country}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="label-text">Authority (factory)</Label>
            <p className="text-sm text-muted-foreground mt-1">{row.authority}</p>
          </div>

          <div>
            <Label className="label-text">Factory value</Label>
            <p className="text-sm font-mono mt-1">{formatValue(row.factoryValue)}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`override-value-${row.key}`} className="label-text">New value</Label>
            <Input
              id={`override-value-${row.key}`}
              type="number"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              data-testid={`input-override-value-${row.key}`}
            />
            <p className="text-xs text-muted-foreground">
              If the new value equals the factory value, the override row is
              removed and the constant returns to baseline.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`override-note-${row.key}`} className="label-text">
              Override note <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id={`override-note-${row.key}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why are you overriding the governed baseline? (Required)"
              rows={3}
              data-testid={`input-override-note-${row.key}`}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || note.trim().length === 0}
            data-testid={`button-confirm-override-${row.key}`}
          >
            {isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Save manual override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ModelConstantsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [country, setCountry] = useState<string>("United States");

  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ["admin-model-constants", country],
    queryFn: async () => {
      const params = new URLSearchParams({ country });
      const res = await fetch(`/api/admin/model-constants?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load model constants");
      return res.json();
    },
  });

  const overrideMutation = useMutation({
    mutationFn: async (input: { row: ConstantRow; value: number; note: string }) => {
      const body = {
        country: input.row.locality === "universal" ? null : country,
        countrySubdivision: null,
        value: input.value,
        overrideNote: input.note,
      };
      const res = await fetch(`/api/admin/model-constants/${input.row.key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Override failed");
      return res.json() as Promise<{ wasFactoryEqual: boolean }>;
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-model-constants"] });
      toast({
        title: result.wasFactoryEqual ? "Reset to factory" : "Manual override saved",
        description: result.wasFactoryEqual
          ? `${vars.row.label} matched the factory value, so the override row was removed.`
          : `${vars.row.label} now overridden manually for ${vars.row.locality === "universal" ? "all countries" : country}.`,
      });
    },
    onError: (e: unknown) => {
      toast({ title: "Override failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (row: ConstantRow) => {
      const params = new URLSearchParams();
      if (row.locality !== "universal") params.set("country", country);
      const res = await fetch(`/api/admin/model-constants/${row.key}?${params}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Reset failed");
      return res.json();
    },
    onSuccess: (_d, row) => {
      queryClient.invalidateQueries({ queryKey: ["admin-model-constants"] });
      toast({
        title: "Reset to factory",
        description: `${row.label} returned to its governed baseline.`,
      });
    },
    onError: (e: unknown) => {
      toast({ title: "Reset failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    },
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const universalItems = items.filter((i) => i.locality === "universal");
  const countryItems = items.filter((i) => i.locality !== "universal");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="tab-content-model-constants">
      <div className="rounded-lg border border-accent-pop/20 bg-accent-pop/10 p-4 text-sm leading-relaxed">
        <div className="flex items-start gap-2">
          <IconShieldCheck className="w-4 h-4 text-accent-pop mt-0.5 shrink-0" />
          <div className="text-accent-pop/90">
            <strong>Governed model constants.</strong> These values come from
            tax authorities and accounting standards (GAAP / USALI), not from
            user preference. Country-varying constants fall back to the
            United States baseline when no entry exists for the selected
            country. The Analyst will research and propose new values per
            country in Phase 3; for now, you can manually override with a
            mandatory note.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
        {/* Country picker — only relevant for country-keyed constants. */}
        <Section title="Country" description="Select the jurisdiction whose constants you want to view or override.">
          <div className="space-y-2 col-span-full">
            <Label className="label-text">Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="w-full bg-card border-border" data-testid="select-model-constants-country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Universal constants below ignore this selection.
            </p>
          </div>
        </Section>

        {universalItems.length > 0 && (
          <Section title="Universal constants" description="Apply worldwide regardless of the country selection.">
            <div className="space-y-3 col-span-full">
              {universalItems.map((row) => (
                <ConstantRowCard
                  key={row.key}
                  row={row}
                  country={country}
                  onOverride={(value, note) => overrideMutation.mutate({ row, value, note })}
                  onReset={() => resetMutation.mutate(row)}
                  isOverriding={overrideMutation.isPending}
                  isResetting={resetMutation.isPending}
                />
              ))}
            </div>
          </Section>
        )}

        {countryItems.length > 0 && (
          <Section
            title={`Country-keyed constants — ${country}`}
            description="Vary by jurisdiction. Falls back to the United States baseline when not yet researched for the selected country."
          >
            <div className="space-y-3 col-span-full">
              {countryItems.map((row) => (
                <ConstantRowCard
                  key={row.key}
                  row={row}
                  country={country}
                  onOverride={(value, note) => overrideMutation.mutate({ row, value, note })}
                  onReset={() => resetMutation.mutate(row)}
                  isOverriding={overrideMutation.isPending}
                  isResetting={resetMutation.isPending}
                />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function ConstantRowCard({
  row, country, onOverride, onReset, isOverriding, isResetting,
}: {
  row: ConstantRow;
  country: string;
  onOverride: (value: number, note: string) => void;
  onReset: () => void;
  isOverriding: boolean;
  isResetting: boolean;
}) {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid={`row-model-constant-${row.key}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{row.label}</span>
            <ProvenanceBadge source={row.source} />
            {row.factoryWasFallback && row.source === "factory" && (
              <span
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                data-testid={`badge-fallback-${row.key}`}
                title={`No researched value for ${country} yet — using the United States baseline. Use the Analyst regenerate button (Phase 3) to research a country-specific value.`}
              >
                Using US baseline
              </span>
            )}
            <InfoTooltip text={row.helperText} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="font-medium text-foreground/80">Authority:</span> {row.authority}
            {row.referenceUrl && (
              <> · <a href={row.referenceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Reference</a></>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-mono text-foreground" data-testid={`value-effective-${row.key}`}>
            {formatValue(row.effectiveValue)}
          </div>
          {row.source !== "factory" && (
            <div className="text-xs text-muted-foreground">
              factory: <span className="font-mono">{formatValue(row.factoryValue)}</span>
            </div>
          )}
        </div>
      </div>

      {row.override?.overrideNote && (
        <div className="mt-2 text-xs italic text-muted-foreground border-l-2 border-amber-500/40 pl-2">
          “{row.override.overrideNote}”
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          disabled
          title="The Analyst regenerate flow ships in Phase 3."
          data-testid={`button-regenerate-${row.key}`}
        >
          <IconSparkles className="w-3.5 h-3.5 mr-1.5" />
          Regenerate via Analyst
        </Button>
        <OverrideDialog
          row={row}
          country={country}
          onSubmit={onOverride}
          isPending={isOverriding}
        />
        {row.source !== "factory" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={isResetting}
            data-testid={`button-reset-${row.key}`}
          >
            {isResetting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Reset to factory
          </Button>
        )}
      </div>
    </div>
  );
}
