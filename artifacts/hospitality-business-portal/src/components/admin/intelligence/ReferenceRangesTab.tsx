/**
 * ReferenceRangesTab — admin grid for the `reference_range` table.
 *
 * Lets admins filter the corpus of low/mid/high reference ranges by
 * domain, country, and year, create / edit / archive / restore rows,
 * and trigger an Analyst refresh when the server-side endpoint is
 * available.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { IconPencil, IconPlus, IconSparkles } from "@/components/icons";
import { Archive, RotateCcw } from "@/components/icons/themed-icons";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  REFERENCE_RANGE_DOMAINS,
  REFERENCE_RANGE_CONFIDENCES,
  type ReferenceRangeDomain,
  type ReferenceRangeConfidence,
} from "@shared/schema/reference-range";

type ReferenceRangeRow = {
  id: number;
  domain: string;
  metricKey: string;
  label: string;
  country: string;
  subdivision: string | null;
  market: string | null;
  segment: string | null;
  propertyType: string | null;
  year: number;
  low: number;
  mid: number;
  high: number;
  unit: string;
  sourceId: number | null;
  sourceName: string | null;
  sourceUrl: string | null;
  methodology: string | null;
  confidence: string;
  lastVerifiedAt: string | null;
  verifiedBy: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type FacetsResponse = {
  domains: { value: string; count: number }[];
  countries: { value: string; count: number }[];
  years: { value: number; count: number }[];
  totalActive: number;
  totalArchived: number;
};

const ANY = "__any__";

const FRESHNESS_BADGE: Record<"fresh" | "aging" | "stale" | "missing", string> = {
  fresh:   "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  aging:   "bg-sky-500/15 text-sky-700 border-sky-500/30",
  stale:   "bg-amber-500/15 text-amber-700 border-amber-500/30",
  missing: "bg-rose-500/15 text-rose-700 border-rose-500/30",
};

const CONFIDENCE_BADGE: Record<string, string> = {
  high:   "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  medium: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  low:    "bg-amber-500/15 text-amber-700 border-amber-500/30",
};

function freshness(lastVerifiedAt: string | null): keyof typeof FRESHNESS_BADGE {
  if (!lastVerifiedAt) return "missing";
  const ageMs = Date.now() - new Date(lastVerifiedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 90) return "fresh";
  if (ageDays <= 365) return "aging";
  return "stale";
}

function formatJurisdiction(row: ReferenceRangeRow): string {
  const parts = [row.country];
  if (row.subdivision) parts.push(row.subdivision);
  if (row.market) parts.push(row.market);
  if (row.segment) parts.push(`[${row.segment}]`);
  if (row.propertyType) parts.push(`(${row.propertyType})`);
  return parts.join(" · ");
}

function formatYear(year: number): string {
  return year === 0 ? "Evergreen" : String(year);
}

const ANALYST_STEPS: readonly string[] = [
  "The Analyst is cross-referencing live market data…",
  "Updating KPI benchmarks from AirROI…",
  "Refreshing macro indicators from FRED…",
  "Done. Ranges updated.",
] as const;

// ── Form payload shared by create + edit dialogs ──────────────────────
// Strings on the form, converted to typed values at submit time. Optional
// text fields stay empty-string in the form and are converted to `null`
// (not `undefined`) when sent to the server, matching the storage layer's
// nullable contract.
type FormState = {
  domain: ReferenceRangeDomain;
  metricKey: string;
  label: string;
  country: string;
  subdivision: string;
  market: string;
  segment: string;
  propertyType: string;
  year: string;
  low: string;
  mid: string;
  high: string;
  unit: string;
  confidence: ReferenceRangeConfidence;
  sourceName: string;
  sourceUrl: string;
  methodology: string;
};

const EMPTY_FORM: FormState = {
  domain: REFERENCE_RANGE_DOMAINS[0],
  metricKey: "",
  label: "",
  country: "GLOBAL",
  subdivision: "",
  market: "",
  segment: "",
  propertyType: "",
  year: "0",
  low: "",
  mid: "",
  high: "",
  unit: "",
  confidence: "medium",
  sourceName: "",
  sourceUrl: "",
  methodology: "",
};

function rowToForm(row: ReferenceRangeRow): FormState {
  return {
    domain: (row.domain as ReferenceRangeDomain),
    metricKey: row.metricKey,
    label: row.label,
    country: row.country,
    subdivision: row.subdivision ?? "",
    market: row.market ?? "",
    segment: row.segment ?? "",
    propertyType: row.propertyType ?? "",
    year: String(row.year),
    low: String(row.low),
    mid: String(row.mid),
    high: String(row.high),
    unit: row.unit,
    confidence: (row.confidence as ReferenceRangeConfidence),
    sourceName: row.sourceName ?? "",
    sourceUrl: row.sourceUrl ?? "",
    methodology: row.methodology ?? "",
  };
}

function formToPayload(f: FormState): Record<string, unknown> {
  const orNull = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    domain: f.domain,
    metricKey: f.metricKey.trim(),
    label: f.label.trim(),
    country: f.country.trim() || "GLOBAL",
    subdivision: orNull(f.subdivision),
    market: orNull(f.market),
    segment: orNull(f.segment),
    propertyType: orNull(f.propertyType),
    year: Number(f.year),
    low: Number(f.low),
    mid: Number(f.mid),
    high: Number(f.high),
    unit: f.unit.trim(),
    confidence: f.confidence,
    sourceName: orNull(f.sourceName),
    sourceUrl: orNull(f.sourceUrl),
    methodology: orNull(f.methodology),
  };
}

function validateForm(f: FormState): string | null {
  if (!f.metricKey.trim()) return "Metric Key is required.";
  if (!/^[a-z0-9-]+$/.test(f.metricKey.trim())) return "Metric Key must be kebab-case (a–z, 0–9, hyphen).";
  if (!f.label.trim()) return "Label is required.";
  if (!f.country.trim()) return "Country is required (use GLOBAL if not country-specific).";
  if (!f.unit.trim()) return "Unit is required.";
  if (f.year === "" || Number.isNaN(Number(f.year))) return "Year must be a number (use 0 for evergreen).";
  if (Number(f.year) < 0) return "Year cannot be negative.";
  for (const k of ["low", "mid", "high"] as const) {
    if (f[k] === "" || Number.isNaN(Number(f[k]))) return `${k[0].toUpperCase()}${k.slice(1)} must be a number.`;
  }
  const lo = Number(f.low), mi = Number(f.mid), hi = Number(f.high);
  if (!(lo <= mi && mi <= hi)) return "Range must satisfy low ≤ mid ≤ high.";
  return null;
}

type DialogMode = null | { kind: "create" } | { kind: "edit"; row: ReferenceRangeRow };

export default function ReferenceRangesTab() {
  const { toast } = useToast();
  const [domain, setDomain] = useState<string>(ANY);
  const [country, setCountry] = useState<string>(ANY);
  const [year, setYear] = useState<string>(ANY);
  const [metricSearch, setMetricSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [analystStep, setAnalystStep] = useState<number | null>(null);
  const [analystError, setAnalystError] = useState<string | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Dialog + mutation state
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ReferenceRangeRow | null>(null);

  useEffect(() => {
    return () => {
      for (const t of timeoutsRef.current) clearTimeout(t);
      timeoutsRef.current = [];
    };
  }, []);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (domain !== ANY) p.set("domain", domain);
    if (country !== ANY) p.set("country", country);
    if (year !== ANY) p.set("year", year);
    if (metricSearch.trim()) p.set("metricKey", metricSearch.trim());
    if (showArchived) p.set("includeArchived", "true");
    return p.toString();
  }, [domain, country, year, metricSearch, showArchived]);

  // Inline `queryFn` so filter values land in the URL search string.
  // The default query fn does `queryKey.join("/")`, which would turn
  // `["/api/admin/reference-ranges", "domain=macro&country=US"]` into
  // `/api/admin/reference-ranges/domain=macro&country=US` and either 404
  // or get swallowed by the `:id` route. Constructing the URL here keeps
  // the query string where the server expects it.
  const { data: rowsData, isLoading: rowsLoading } = useQuery<{ rows: ReferenceRangeRow[] }>({
    queryKey: ["/api/admin/reference-ranges", queryParams],
    queryFn: async () => {
      const url = queryParams
        ? `/api/admin/reference-ranges?${queryParams}`
        : `/api/admin/reference-ranges`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });
  const { data: facets } = useQuery<FacetsResponse>({
    queryKey: ["/api/admin/reference-ranges/facets"],
  });

  const rows = rowsData?.rows ?? [];

  const clearFilters = () => {
    setDomain(ANY);
    setCountry(ANY);
    setYear(ANY);
    setMetricSearch("");
  };

  const hasActiveFilter = domain !== ANY || country !== ANY || year !== ANY || metricSearch.trim().length > 0;

  const analystBusy = analystStep !== null && analystStep < ANALYST_STEPS.length - 1;

  const invalidateGrid = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/reference-ranges"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/reference-ranges/facets"] });
  };

  // ── Mutations ────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/admin/reference-ranges", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reference range created" });
      setDialogMode(null);
      invalidateGrid();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (/\b409\b/.test(message)) {
        setFormError("A range with that combination already exists.");
      } else {
        setFormError(message);
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (args: { id: number; payload: Record<string, unknown> }) => {
      const res = await apiRequest("PUT", `/api/admin/reference-ranges/${args.id}`, args.payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reference range updated" });
      setDialogMode(null);
      invalidateGrid();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (/\b409\b/.test(message)) {
        setFormError("A range with that combination already exists.");
      } else {
        setFormError(message);
      }
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/reference-ranges/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reference range archived" });
      setArchiveTarget(null);
      invalidateGrid();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Archive failed", description: message, variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/reference-ranges/${id}/restore`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reference range restored" });
      invalidateGrid();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Restore failed", description: message, variant: "destructive" });
    },
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogMode({ kind: "create" });
  };

  const openEdit = (row: ReferenceRangeRow) => {
    setForm(rowToForm(row));
    setFormError(null);
    setDialogMode({ kind: "edit", row });
  };

  const handleSubmit = () => {
    setFormError(null);
    const validation = validateForm(form);
    if (validation) {
      setFormError(validation);
      return;
    }
    const payload = formToPayload(form);
    if (dialogMode?.kind === "edit") {
      updateMutation.mutate({ id: dialogMode.row.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const submitting = createMutation.isPending || updateMutation.isPending;

  const askTheAnalyst = async () => {
    if (analystStep !== null) return;
    setAnalystError(null);

    for (const t of timeoutsRef.current) clearTimeout(t);
    timeoutsRef.current = [];

    // Await the refresh endpoint before starting the animation so
    // a missing or failed backend surfaces honestly instead of
    // playing a success animation over a no-op.
    try {
      const res = await apiRequest("POST", "/api/admin/reference-ranges/refresh");
      // Drain the body so the connection closes cleanly; we don't use it.
      try { await res.json(); } catch { /* empty body is fine */ }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // 404 / 405 → endpoint not deployed yet. Any other error → surface as-is.
      const notWired = /\b404\b|\b405\b|Not Found|Method Not Allowed/i.test(message);
      setAnalystError(
        notWired
          ? "Analyst refresh isn't available yet. The grid below is current as of the last manual update."
          : `Analyst refresh failed: ${message}`,
      );
      // Auto-clear the error after 6s so the UI doesn't get stuck.
      timeoutsRef.current.push(setTimeout(() => setAnalystError(null), 6000));
      return;
    }

    setAnalystStep(0);
    timeoutsRef.current.push(setTimeout(() => setAnalystStep(1), 2000));
    timeoutsRef.current.push(setTimeout(() => setAnalystStep(2), 4000));
    timeoutsRef.current.push(setTimeout(() => setAnalystStep(3), 6000));
    timeoutsRef.current.push(
      setTimeout(() => {
        invalidateGrid();
      }, 8000),
    );
    // Keep the "Done." line visible ~3s after t=6s, then clear.
    timeoutsRef.current.push(setTimeout(() => setAnalystStep(null), 9000));
  };

  return (
    <div className="space-y-4" data-testid="reference-ranges-tab">
      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Reference Ranges</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Admin-editable low / mid / high reference ranges (tax tables, macro indicators,
                hospitality KPIs, construction costs, financing terms, labor rates, risk premia,
                demand metrics).
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openCreate}
                  data-testid="button-new-range"
                >
                  <IconPlus className="h-3.5 w-3.5 mr-1.5" />
                  New Range
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={askTheAnalyst}
                  disabled={analystStep !== null}
                  data-testid="button-ask-analyst"
                >
                  <IconSparkles className="h-3.5 w-3.5 mr-1.5" />
                  Ask The Analyst
                </Button>
              </div>
              {facets && (
                <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                  <div data-testid="text-totals-active">
                    <span className="font-medium text-foreground">{facets.totalActive}</span> active
                  </div>
                  <div data-testid="text-totals-archived">
                    <span className="font-medium text-foreground">{facets.totalArchived}</span> archived
                  </div>
                </div>
              )}
            </div>
          </div>

          {analystStep !== null && (
            <div
              className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs"
              data-testid="status-analyst-step"
              role="status"
              aria-live="polite"
            >
              <IconSparkles
                className={`h-3.5 w-3.5 text-primary ${analystBusy ? "animate-pulse" : ""}`}
              />
              <span data-testid={`text-analyst-step-${analystStep}`}>
                {ANALYST_STEPS[analystStep]}
              </span>
            </div>
          )}

          {analystError !== null && analystStep === null && (
            <div
              className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
              data-testid="status-analyst-error"
              role="status"
              aria-live="polite"
            >
              <IconSparkles className="h-3.5 w-3.5 text-amber-500" />
              <span data-testid="text-analyst-error">{analystError}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger className="w-44" data-testid="select-domain">
                <SelectValue placeholder="Domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All domains</SelectItem>
                {(facets?.domains ?? []).map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.value} ({d.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="w-44" data-testid="select-country">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All countries</SelectItem>
                {(facets?.countries ?? []).map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.value} ({c.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-32" data-testid="select-year">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All years</SelectItem>
                {(facets?.years ?? []).map((y) => (
                  <SelectItem key={y.value} value={String(y.value)}>
                    {y.value === 0 ? "Evergreen" : y.value} ({y.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="search"
              placeholder="Filter by metric key…"
              value={metricSearch}
              onChange={(e) => setMetricSearch(e.target.value)}
              className="w-64"
              data-testid="input-metric-search"
            />

            <div className="flex items-center gap-2 ml-2">
              <Switch
                id="show-archived"
                checked={showArchived}
                onCheckedChange={setShowArchived}
                data-testid="switch-show-archived"
              />
              <Label htmlFor="show-archived" className="text-xs text-muted-foreground cursor-pointer">
                Show archived
              </Label>
            </div>

            {hasActiveFilter && (
              <Button
                size="sm"
                variant="ghost"
                onClick={clearFilters}
                data-testid="button-clear-filters"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {rowsLoading && (
        <div className="text-sm text-muted-foreground" data-testid="text-loading">
          Loading reference ranges…
        </div>
      )}

      {!rowsLoading && rows.length === 0 && (
        <Card className="p-6 text-center" data-testid="empty-state">
          <p className="text-sm font-medium">No reference ranges yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            {hasActiveFilter
              ? "No rows match the current filters."
              : "No reference ranges loaded yet."}
          </p>
        </Card>
      )}

      {!rowsLoading && rows.length > 0 && (
        <div className="overflow-x-auto" data-testid="table-reference-ranges">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Domain</th>
                <th className="text-left px-3 py-2">Metric</th>
                <th className="text-left px-3 py-2">Jurisdiction</th>
                <th className="text-right px-3 py-2">Year</th>
                <th className="text-right px-3 py-2">Low / Mid / High</th>
                <th className="text-left px-3 py-2">Unit</th>
                <th className="text-left px-3 py-2">Source</th>
                <th className="text-left px-3 py-2">Confidence</th>
                <th className="text-left px-3 py-2">Verified</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const fresh = freshness(row.lastVerifiedAt);
                const isArchived = row.archivedAt !== null;
                return (
                  <tr
                    key={row.id}
                    className={`border-t border-border/50 hover:bg-muted/20 ${isArchived ? "opacity-60" : ""}`}
                    data-testid={`row-reference-range-${row.id}`}
                  >
                    <td className="px-3 py-2 font-medium text-xs uppercase tracking-wide" data-testid={`text-domain-${row.id}`}>
                      {row.domain}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium" data-testid={`text-label-${row.id}`}>{row.label}</div>
                      <div className="text-xs text-muted-foreground font-mono" data-testid={`text-metric-key-${row.id}`}>
                        {row.metricKey}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs" data-testid={`text-jurisdiction-${row.id}`}>
                      {formatJurisdiction(row)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" data-testid={`text-year-${row.id}`}>
                      {formatYear(row.year)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" data-testid={`text-range-${row.id}`}>
                      {row.low} / <span className="font-medium">{row.mid}</span> / {row.high}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground" data-testid={`text-unit-${row.id}`}>
                      {row.unit}
                    </td>
                    <td className="px-3 py-2 text-xs" data-testid={`text-source-${row.id}`}>
                      {row.sourceUrl ? (
                        <a
                          href={row.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline text-primary"
                          data-testid={`link-source-${row.id}`}
                        >
                          {row.sourceName ?? row.sourceUrl}
                        </a>
                      ) : (
                        row.sourceName ?? <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-[10px] uppercase tracking-wide border rounded px-2 py-0.5 ${
                          CONFIDENCE_BADGE[row.confidence] ?? CONFIDENCE_BADGE.medium
                        }`}
                        data-testid={`badge-confidence-${row.id}`}
                      >
                        {row.confidence}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] uppercase tracking-wide border rounded px-2 py-0.5 ${FRESHNESS_BADGE[fresh]}`}
                          data-testid={`badge-freshness-${row.id}`}
                        >
                          {fresh}
                        </span>
                        <span className="text-muted-foreground" data-testid={`text-verified-at-${row.id}`}>
                          {row.lastVerifiedAt
                            ? new Date(row.lastVerifiedAt).toLocaleDateString()
                            : "—"}
                        </span>
                      </div>
                      {row.verifiedBy && (
                        <div className="text-[10px] text-muted-foreground mt-0.5" data-testid={`text-verified-by-${row.id}`}>
                          by {row.verifiedBy}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isArchived ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => restoreMutation.mutate(row.id)}
                            disabled={restoreMutation.isPending}
                            data-testid={`button-restore-${row.id}`}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            Restore
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEdit(row)}
                              aria-label="Edit"
                              data-testid={`button-edit-${row.id}`}
                            >
                              <IconPencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setArchiveTarget(row)}
                              aria-label="Archive"
                              data-testid={`button-archive-${row.id}`}
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create / Edit dialog ────────────────────────────────────── */}
      <Dialog open={dialogMode !== null} onOpenChange={(open) => { if (!open) setDialogMode(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-reference-range">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {dialogMode?.kind === "edit" ? "Edit reference range" : "New reference range"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode?.kind === "edit"
                ? "Update an existing low / mid / high reference range row."
                : "Add a new low / mid / high reference range row."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rr-domain">Domain</Label>
              <Select value={form.domain} onValueChange={(v) => setForm({ ...form, domain: v as ReferenceRangeDomain })}>
                <SelectTrigger id="rr-domain" data-testid="select-form-domain">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFERENCE_RANGE_DOMAINS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-metric-key">Metric Key</Label>
              <Input
                id="rr-metric-key"
                value={form.metricKey}
                onChange={(e) => setForm({ ...form, metricKey: e.target.value })}
                placeholder="adr-luxury"
                data-testid="input-form-metric-key"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="rr-label">Label</Label>
              <Input
                id="rr-label"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="ADR — Luxury segment"
                data-testid="input-form-label"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-country">Country</Label>
              <Input
                id="rr-country"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                placeholder="GLOBAL or US, BR, ..."
                data-testid="input-form-country"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-subdivision">Subdivision</Label>
              <Input
                id="rr-subdivision"
                value={form.subdivision}
                onChange={(e) => setForm({ ...form, subdivision: e.target.value })}
                placeholder="optional (e.g. CA)"
                data-testid="input-form-subdivision"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-market">Market</Label>
              <Input
                id="rr-market"
                value={form.market}
                onChange={(e) => setForm({ ...form, market: e.target.value })}
                placeholder="optional (e.g. Miami)"
                data-testid="input-form-market"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-segment">Segment</Label>
              <Input
                id="rr-segment"
                value={form.segment}
                onChange={(e) => setForm({ ...form, segment: e.target.value })}
                placeholder="optional (e.g. luxury)"
                data-testid="input-form-segment"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-property-type">Property Type</Label>
              <Input
                id="rr-property-type"
                value={form.propertyType}
                onChange={(e) => setForm({ ...form, propertyType: e.target.value })}
                placeholder="optional (e.g. hotel)"
                data-testid="input-form-property-type"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-year">Year (0 = evergreen)</Label>
              <Input
                id="rr-year"
                type="number"
                min="0"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                data-testid="input-form-year"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-unit">Unit</Label>
              <Input
                id="rr-unit"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="percent, usd_per_room_night, ..."
                data-testid="input-form-unit"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-low">Low</Label>
              <Input
                id="rr-low"
                type="number"
                value={form.low}
                onChange={(e) => setForm({ ...form, low: e.target.value })}
                data-testid="input-form-low"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-mid">Mid</Label>
              <Input
                id="rr-mid"
                type="number"
                value={form.mid}
                onChange={(e) => setForm({ ...form, mid: e.target.value })}
                data-testid="input-form-mid"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-high">High</Label>
              <Input
                id="rr-high"
                type="number"
                value={form.high}
                onChange={(e) => setForm({ ...form, high: e.target.value })}
                data-testid="input-form-high"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-confidence">Confidence</Label>
              <Select
                value={form.confidence}
                onValueChange={(v) => setForm({ ...form, confidence: v as ReferenceRangeConfidence })}
              >
                <SelectTrigger id="rr-confidence" data-testid="select-form-confidence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFERENCE_RANGE_CONFIDENCES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-source-name">Source Name</Label>
              <Input
                id="rr-source-name"
                value={form.sourceName}
                onChange={(e) => setForm({ ...form, sourceName: e.target.value })}
                placeholder="optional"
                data-testid="input-form-source-name"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="rr-source-url">Source URL</Label>
              <Input
                id="rr-source-url"
                type="url"
                value={form.sourceUrl}
                onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
                placeholder="optional, https://…"
                data-testid="input-form-source-url"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="rr-methodology">Methodology</Label>
              <Textarea
                id="rr-methodology"
                value={form.methodology}
                onChange={(e) => setForm({ ...form, methodology: e.target.value })}
                placeholder="optional one-line description of how the range was derived"
                rows={2}
                data-testid="input-form-methodology"
              />
            </div>
          </div>

          {formError && (
            <div
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
              data-testid="text-form-error"
              role="alert"
            >
              {formError}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)} data-testid="button-form-cancel">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} data-testid="button-form-submit">
              {submitting ? "Saving…" : dialogMode?.kind === "edit" ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Archive confirmation ───────────────────────────────────── */}
      <AlertDialog open={archiveTarget !== null} onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}>
        <AlertDialogContent data-testid="dialog-archive-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this range?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be hidden from the grid and from Specialist lookups. You can restore it later by toggling "Show archived".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-archive-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (archiveTarget) archiveMutation.mutate(archiveTarget.id); }}
              disabled={archiveMutation.isPending}
              data-testid="button-archive-confirm"
            >
              {archiveMutation.isPending ? "Archiving…" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
