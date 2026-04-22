/**
 * Model Constants tab — Phase 4 doctrine UI (read-only).
 *
 * Locked principle (replit.md, docs/audits/constants-specialist-ownership-
 * gap.md): Constants are authority-sourced (US Fed, IRS, IMF, central
 * banks, GAAP/USALI). They are written EXCLUSIVELY by AI Intelligence
 * Specialists. Admins cannot edit Constants — each row is a read-only
 * card with a per-row "Refresh research" button that triggers the owning
 * Specialist to re-fetch from the cited authority.
 *
 * What changed in Phase 4:
 *   - The free-form Override dialog is gated behind `!row.specialistOwned`
 *     and is no longer rendered for any constant today (every key in
 *     MODEL_CONSTANTS_REGISTRY is `specialistOwned: true`).
 *   - The two-step "Regenerate via Analyst → diff → Apply" dialog is
 *     replaced by a one-click **Refresh research** flow. Clicking it
 *     calls POST /api/admin/model-constants/:key/refresh which triggers
 *     the Specialist's research run AND auto-applies the verdict in one
 *     server call. The admin sees a results panel — there is no number
 *     input and no "approve this value" step.
 *   - Each row carries an H/I/J/K Specialist letter badge identifying
 *     which Specialist owns the constant.
 *   - A History affordance opens a popover listing the most recent
 *     research runs for the row.
 *   - Reset to factory remains as the rollback escape hatch.
 *
 * The server-side guard (Phase 3, `PUT /api/admin/model-constants/:key`
 * → HTTP 422 SPECIALIST_OWNED_CONSTANT) is the actual write boundary;
 * this UI assumes it exists and refuses to render an Override affordance.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Section } from "./FieldHelpers";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { IconShieldCheck, IconSparkles, IconHistory } from "@/components/icons";
import { Loader2, AlertTriangle, RefreshCw, Clock } from "@/components/icons/themed-icons";
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
  specialistOwned: boolean;
  specialistId: string | null;
  specialistLetter: string | null;
  specialistName: string | null;
  lastRefreshedAt: string | null;
}

interface ApiResponse {
  country: string | null;
  subdivision: string | null;
  items: ConstantRow[];
}

/** POST /refresh — one-shot Specialist research + auto-apply payload. */
interface RefreshResult {
  wasFactoryEqual: boolean;
  wasNoChange: boolean;
  override: ConstantRow["override"] | null;
  proposal: {
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
  };
}

interface ResearchRun {
  id: number;
  startedAt: string;
  completedAt: string | null;
  status: string;
  durationMs: number | null;
  metadata: {
    specialistId?: string;
    specialistLetter?: string;
    proposal?: {
      value?: unknown;
      authority?: string;
      isDifferentFromCurrent?: boolean;
    };
    sources?: { title: string; url: string }[];
  } | null;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "string" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function formatRelative(iso: string | null): string {
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

/**
 * Letter badge identifying the AI Intelligence Specialist that owns
 * this Constant. The `letter` (H, I, J, K, …) is the stable identifier
 * declared in `engine/analyst/registry/specialist-catalog.ts` — the same
 * letters surfaced everywhere else in the AI Intelligence UI.
 */
function SpecialistBadge({ letter, name }: { letter: string | null; name: string | null }) {
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
            <strong>Authority-sourced constants — read only.</strong> These
            values come from tax authorities, central banks, and accounting
            standards (GAAP / USALI). They are written exclusively by the AI
            Intelligence Specialists shown on each row. Admins cannot edit
            values directly — click <em>Refresh research</em> to ask the
            owning Specialist to re-fetch from its cited authority.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
        <Section title="Country" description="Select the jurisdiction whose constants you want to view.">
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
                  onReset={() => resetMutation.mutate(row)}
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
  row, country, onReset, isResetting,
}: {
  row: ConstantRow;
  country: string;
  onReset: () => void;
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
            <SpecialistBadge letter={row.specialistLetter} name={row.specialistName} />
            {row.factoryWasFallback && row.source === "factory" && (
              <span
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                data-testid={`badge-fallback-${row.key}`}
                title={`No researched value for ${country} yet — using the United States baseline. Click Refresh research to ask the owning Specialist for a country-specific value.`}
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
          <p
            className="text-xs text-muted-foreground mt-1 flex items-center gap-1"
            data-testid={`text-last-refreshed-${row.key}`}
          >
            <Clock className="w-3 h-3" />
            Last refreshed: {formatRelative(row.lastRefreshedAt)}
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
        <div className="mt-2 text-xs italic text-muted-foreground border-l-2 border-yellow-500/40 pl-2">
          “{row.override.overrideNote}”
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <RefreshResearchButton row={row} country={country} />
        <HistoryButton row={row} country={country} />
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

/**
 * Phase 4 — one-click Refresh research.
 *
 * Trigger → Specialist runs grounded research → server auto-applies the
 * verdict (no admin diff, no admin "approve this value" step) → results
 * panel shows the new value, authority, evidence, and source list. The
 * admin's only choices are "Done" (acknowledge) or to use the Reset to
 * factory button on the row if they want to roll back.
 */
function RefreshResearchButton({ row, country }: { row: ConstantRow; country: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<RefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useMutation({
    mutationFn: async (): Promise<RefreshResult> => {
      const params = new URLSearchParams();
      if (row.locality !== "universal") params.set("country", country);
      const res = await fetch(`/api/admin/model-constants/${row.key}/refresh?${params}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Refresh failed (HTTP ${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-model-constants"] });
      queryClient.invalidateQueries({ queryKey: ["admin-model-constants-history", row.key] });
      toast({
        title: data.wasNoChange
          ? "Value confirmed"
          : data.wasFactoryEqual
            ? "Reset to factory"
            : "Constant refreshed",
        description: data.wasNoChange
          ? `${row.label}: ${data.proposal.authority}`
          : `${row.label} now sourced from ${data.proposal.authority}.`,
      });
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Unknown error");
      setResult(null);
    },
  });

  const handleClick = () => {
    setOpen(true);
    setResult(null);
    setError(null);
    refresh.mutate();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClick}
          title="Ask the owning Specialist to re-fetch from the cited authority."
          data-testid={`button-refresh-research-${row.key}`}
        >
          {refresh.isPending
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            : <IconSparkles className="w-3.5 h-3.5 mr-1.5" />}
          Refresh research
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
            Refresh research — {row.label}
          </div>

          {refresh.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
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

          {result && !refresh.isPending && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-border bg-muted/30 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Previous</div>
                  <div className="text-base font-mono" data-testid={`refresh-previous-${row.key}`}>
                    {formatValue(result.proposal.currentValue)}
                  </div>
                </div>
                <div className={`rounded-md border p-2.5 ${result.proposal.isDifferentFromCurrent ? "border-yellow-500/40 bg-yellow-500/5" : "border-border bg-muted/30"}`}>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">New</div>
                  <div className="text-base font-mono" data-testid={`refresh-new-${row.key}`}>
                    {formatValue(result.proposal.value)}
                  </div>
                </div>
              </div>

              {!result.proposal.isDifferentFromCurrent && (
                <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-2 text-xs text-blue-700 dark:text-blue-300">
                  Specialist confirmed the current value is correct. No change applied.
                </div>
              )}

              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Authority</div>
                <div className="text-xs">{result.proposal.authority}</div>
                {result.proposal.referenceUrl && (
                  <a
                    href={result.proposal.referenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] underline text-muted-foreground hover:text-foreground break-all"
                  >
                    {result.proposal.referenceUrl}
                  </a>
                )}
              </div>

              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Evidence</div>
                <p className="text-xs text-foreground/90 leading-relaxed">{result.proposal.reasoning}</p>
              </div>

              {result.proposal.sources.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Sources ({result.proposal.sources.length})
                  </div>
                  <ul className="space-y-1 text-[11px]">
                    {result.proposal.sources.slice(0, 5).map((s, i) => (
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

              <div className="flex justify-end pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpen(false)}
                  data-testid={`button-acknowledge-refresh-${row.key}`}
                >
                  Done
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
 * `research_runs` for this Constant so admins can see the chain of
 * Specialist proposals (when, by whom, what was applied, with what
 * evidence count).
 */
function HistoryButton({ row, country }: { row: ConstantRow; country: string }) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useQuery<{ runs: ResearchRun[] }>({
    queryKey: ["admin-model-constants-history", row.key, country, row.locality],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (row.locality !== "universal") params.set("country", country);
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
                    {formatValue(run.metadata?.proposal?.value)}
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
