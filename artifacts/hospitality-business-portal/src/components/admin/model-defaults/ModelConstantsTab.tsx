/**
 * Model Constants tab — Phase 4 doctrine UI (read-only with Apply/Discard).
 *
 * Locked principle (replit.md, docs/audits/constants-specialist-ownership-
 * gap.md): Constants are authority-sourced (US Fed, IRS, IMF, central
 * banks, GAAP/USALI). They are written EXCLUSIVELY by Intelligence
 * Specialists. Admins cannot type a value. The two paths supported on
 * each row are:
 *
 *   1. **Refresh research** → Specialist re-fetches from authority
 *      (POST /:key/refresh, preview only — no DB write). Admin sees a
 *      Previous / New diff with the Specialist's reasoning + sources,
 *      and a unit-aware value display. They click **Apply** to write
 *      (POST /:key/apply-proposal with the researchRunId — no value in
 *      the body) or **Discard** to dismiss the proposal.
 *
 *   2. **Reset to factory** — rollback escape hatch (DELETE).
 *
 * The legacy free-form Override dialog is gated behind
 * `!row.specialistOwned`. Today every key in the registry is
 * `specialistOwned: true`, so the Override path never renders — but
 * the gate remains so non-authority constants registered in the future
 * (e.g. internal calibration defaults) can keep an admin-edit affordance.
 *
 * The server-side guard (Phase 3, `PUT /api/admin/model-constants/:key`
 * → HTTP 422 SPECIALIST_OWNED_CONSTANT) is the actual write boundary;
 * this UI only renders the Override affordance when the server would
 * accept it.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useFocusFieldFromUrl } from "@/lib/analyst-focus-field";
import { Section } from "@/components/ui/field-section";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { IconShieldCheck } from "@/components/icons";
import { Loader2, AlertTriangle, RefreshCw, Clock } from "@/components/icons/themed-icons";
import { SUPPORTED_COUNTRIES, SUPPORTED_US_STATES } from "@shared/countryDefaults";
import {
  formatWithUnit, formatRelative, formatAbsolute,
  ProvenanceBadge, SpecialistBadge, StaleBadge, ScopeChip,
  type ConstantRow, type ApiResponse,
} from "./constants/_shared";
import { RefreshResearchPopover } from "./constants/RefreshResearchPopover";
import { HistoryButton } from "./constants/HistoryButton";
import { OverrideDialog } from "./constants/OverrideDialog";

interface ScheduledFailure {
  id: number;
  key: string;
  country: string | null;
  subdivision: string | null;
  specialistLetter: string | null;
  completedAt: string | null;
  error: string | null;
}

interface ScheduledFailuresResponse {
  count: number;
  since: string;
  lastVisitedAt: string | null;
  failures: ScheduledFailure[];
}

function ScheduledRefreshFailuresBanner() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery<ScheduledFailuresResponse>({
    queryKey: ["admin-model-constants-scheduled-failures"],
    queryFn: async () => {
      const res = await fetch("/api/admin/model-constants/scheduled-failures", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load scheduled refresh failures");
      return res.json();
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/model-constants/scheduled-failures/dismiss", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to dismiss");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-model-constants-scheduled-failures"] });
      toast({ title: "Dismissed", description: "Scheduled-refresh failures cleared." });
    },
  });

  if (!data || data.count === 0) return null;

  const sample = data.failures.slice(0, 3);
  return (
    <div
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm leading-relaxed"
      data-testid="banner-scheduled-refresh-failures"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1 text-destructive">
          <strong data-testid="text-scheduled-failures-count">
            {data.count} scheduled Constants refresh{data.count === 1 ? "" : "es"} failed since your last visit.
          </strong>
          <ul className="mt-2 list-disc list-inside space-y-0.5 text-xs">
            {sample.map((f) => {
              const loc = `${f.country ?? "universal"}${f.subdivision ? ` / ${f.subdivision}` : ""}`;
              return (
                <li key={f.id} data-testid={`text-scheduled-failure-${f.id}`}>
                  <strong>{f.key}</strong> ({loc}){f.error ? ` — ${f.error.slice(0, 120)}` : ""}
                </li>
              );
            })}
            {data.count > sample.length && (
              <li className="text-muted-foreground">…and {data.count - sample.length} more.</li>
            )}
          </ul>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => dismissMutation.mutate()}
            disabled={dismissMutation.isPending}
            data-testid="button-dismiss-scheduled-failures"
          >
            {dismissMutation.isPending ? "Dismissing…" : "Dismiss"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ModelConstantsTab() {
  // Honour `?focus=<key>` deep links produced by the Analyst verdict
  // mount-point resolver. Constants slugs (`defaults/constants`) route
  // here via `ADMIN_DEFAULTS_SECTION_MAP` in `analyst-mount-points.ts`,
  // and each `ConstantRowCard` exposes `data-testid="field-<key>"` so
  // the focus hook can scroll/focus the matching row on mount
  // (task #783).
  useFocusFieldFromUrl();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [country, setCountry] = useState<string>("United States");
  /**
   * Optional US-state subdivision selector. Only meaningful for
   * `country+state` keys (`taxRate`, `costRateTaxes`) when the selected
   * country is the United States. The server folds subdivision to NULL
   * for country-only and universal keys, so leaving this set while
   * viewing a country-only constant doesn't pollute its row.
   *
   * Sentinel value `__none__` means "no state — country baseline" (e.g.
   * federal-only US tax). Any real state name resolves to the matching
   * `US_STATE_DEFAULTS` overlay row in the registry.
   */
  const STATE_SENTINEL_NONE = "__none__";
  const [subdivision, setSubdivision] = useState<string>(STATE_SENTINEL_NONE);
  const subdivisionParam = country === "United States" && subdivision !== STATE_SENTINEL_NONE
    ? subdivision
    : null;

  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ["admin-model-constants", country, subdivisionParam],
    queryFn: async () => {
      const params = new URLSearchParams({ country });
      if (subdivisionParam) params.set("subdivision", subdivisionParam);
      const res = await fetch(`/api/admin/model-constants?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load model constants");
      return res.json();
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (row: ConstantRow) => {
      const params = new URLSearchParams();
      if (row.locality !== "universal") params.set("country", country);
      // Only country+state rows accept a subdivision; passing one to a
      // country-only key would 400 from the server's locality validator.
      if (row.locality === "country+state" && subdivisionParam) {
        params.set("subdivision", subdivisionParam);
      }
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
      toast({
        title: "Reset failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const universalItems = items.filter((i) => i.locality === "universal");
  const countryItems = items.filter((i) => i.locality !== "universal");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-pop" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="tab-content-model-constants">
      <ScheduledRefreshFailuresBanner />
      <div className="rounded-lg border border-accent-pop/20 bg-accent-pop/10 p-4 text-sm leading-relaxed">
        <div className="flex items-start gap-2">
          <IconShieldCheck className="w-4 h-4 text-accent-pop mt-0.5 shrink-0" />
          <div className="text-accent-pop/90">
            <strong>Authority-sourced constants — read only.</strong> These
            values come from tax authorities, central banks, and accounting
            standards (GAAP / USALI). They are written exclusively by the AI
            Intelligence Specialists shown on each row. Click <em>Refresh
            research</em> to ask the owning Specialist to re-fetch from its
            cited authority, then Apply or Discard the proposal.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
        <Section title="Locality" description="Select the jurisdiction whose constants you want to view.">
          <div className="space-y-2 col-span-full">
            <Label className="label-text">Country</Label>
            <Select
              value={country}
              onValueChange={(c) => {
                setCountry(c);
                // A US-state selection is meaningless for any other
                // country, so reset the subdivision when the country
                // changes away from US.
                if (c !== "United States") setSubdivision(STATE_SENTINEL_NONE);
              }}
            >
              <SelectTrigger className="w-full bg-card border-border" data-testid="select-model-constants-country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {country === "United States" && (
              <>
                <Label className="label-text mt-3">US state (optional)</Label>
                <Select value={subdivision} onValueChange={setSubdivision}>
                  <SelectTrigger
                    className="w-full bg-card border-border"
                    data-testid="select-model-constants-subdivision"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={STATE_SENTINEL_NONE}>
                      No state — federal baseline
                    </SelectItem>
                    {SUPPORTED_US_STATES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Only applies to country+state constants (income tax, property tax). Other rows resolve at the country level.
                </p>
              </>
            )}
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
                  subdivision={null}
                  onReset={() => resetMutation.mutate(row)}
                  isResetting={resetMutation.isPending}
                />
              ))}
            </div>
          </Section>
        )}

        {countryItems.length > 0 && (
          <Section
            title={`Country-keyed constants — ${country}${subdivisionParam ? ` · ${subdivisionParam}` : ""}`}
            description="Vary by jurisdiction. Falls back to the United States baseline when not yet researched for the selected country."
          >
            <div className="space-y-3 col-span-full">
              {countryItems.map((row) => (
                <ConstantRowCard
                  key={row.key}
                  row={row}
                  country={country}
                  // Only forward the state selection to country+state
                  // rows; country-only rows must always reset/refresh
                  // at the country scope.
                  subdivision={row.locality === "country+state" ? subdivisionParam : null}
                  onReset={() => resetMutation.mutate(row)}
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
  row, country, subdivision, onReset, isResetting,
}: {
  row: ConstantRow;
  country: string;
  subdivision: string | null;
  onReset: () => void;
  isResetting: boolean;
}) {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid={`row-model-constant-${row.key}`}
      // `data-field` is the highest-priority marker for
      // `useFocusFieldFromUrl()`'s field-element discovery (see
      // `analyst-focus-field.ts`). Adding it here lets a
      // `defaults/constants` Analyst deep-link with `?focus=<key>` scroll
      // and focus the matching constant row without renaming the
      // long-standing `row-model-constant-*` test id that the
      // read-only-doctrine browser tests already rely on (task #783).
      data-field={row.key}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{row.label}</span>
            <ProvenanceBadge source={row.source} />
            <SpecialistBadge letter={row.specialistLetter} name={row.specialistName} />
            <ScopeChip scope={row.scope} />
            {row.factoryWasFallback && row.source === "factory" && (
              <span
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                data-testid={`badge-fallback-${row.key}`}
                title={`No researched value for ${country} yet — using the United States baseline.`}
              >
                Using US baseline
              </span>
            )}
            <InfoTooltip text={row.helperText} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="font-medium text-foreground/80">Authority:</span> {row.authority}
            {row.referenceUrl && (
              <>
                {" · "}
                <a href={row.referenceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                  Reference
                </a>
              </>
            )}
          </p>
          <p
            className="text-xs text-muted-foreground mt-1 flex items-center gap-1"
            data-testid={`text-conviction-${row.key}`}
          >
            <IconShieldCheck className="w-3 h-3" />
            {row.convictionSummary}
          </p>
          <p
            className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap"
            data-testid={`text-last-refreshed-${row.key}`}
          >
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Refreshed {formatRelative(row.lastRefreshedAt)}
            </span>
            {row.latestResearchRun?.asOf && (
              <span data-testid={`text-as-of-${row.key}`}>
                As of {formatAbsolute(row.latestResearchRun.asOf)}
              </span>
            )}
            {row.isStale && (
              <StaleBadge
                lastRefreshedAt={row.lastRefreshedAt}
                cadenceDays={row.refreshCadenceDays}
                testId={`badge-stale-${row.key}`}
              />
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div
            className="text-lg font-mono text-foreground"
            data-testid={`value-effective-${row.key}`}
          >
            {formatWithUnit(row.effectiveValue, row.unit)}
          </div>
          {row.source !== "factory" && (
            <div className="text-xs text-muted-foreground">
              factory: <span className="font-mono">{formatWithUnit(row.factoryValue, row.unit)}</span>
            </div>
          )}
        </div>
      </div>

      {row.override?.overrideNote && (
        <div className="mt-2 text-xs italic text-muted-foreground border-l-2 border-yellow-500/40 pl-2">
          “{row.override.overrideNote}”
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <RefreshResearchPopover row={row} country={country} subdivision={subdivision} />
        <HistoryButton row={row} country={country} subdivision={subdivision} />
        {row.source !== "factory" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={isResetting}
            data-testid={`button-reset-${row.key}`}
          >
            {isResetting
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-accent-pop" />
              : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Reset to factory
          </Button>
        )}
        {/*
          Phase 4: Override path is gated behind the doctrine flag. For
          every key currently in the registry `specialistOwned === true`,
          so this branch never renders. It exists so a future non-
          authority constant (e.g. an internal calibration default) can
          re-introduce a manual edit affordance without changing this
          file.
        */}
        {!row.specialistOwned && (
          <OverrideDialog row={row} country={country} />
        )}
      </div>
    </div>
  );
}

/**
 * Phase 4 — Refresh research preview + Apply / Discard.
 *
 * Two-stage flow:
 *   Stage A (preview): trigger Specialist research → POST /:key/refresh
 *     → render Previous / New diff with reasoning + sources. NO write.
 *   Stage B (apply):   admin clicks Apply → POST /:key/apply-proposal
 *     with the researchRunId from stage A. Only the server-known
 *     proposal is written; admin never supplies a value.
 *   Discard: admin clicks Discard → popover closes, no write.
 */
