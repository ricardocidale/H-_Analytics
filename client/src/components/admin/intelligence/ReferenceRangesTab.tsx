/**
 * ReferenceRangesTab — Phase 1 read-only admin grid for the
 * `reference_range` table.
 *
 * Phase 2 will add inline edit / archive / new-row dialogs and Phase 4
 * will add an "Analyst" affordance that triggers a deep-research seed.
 * For now this surface just lets admins inspect the corpus — it sets
 * the expectation for layout and confirms the API + sidebar wiring.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

export default function ReferenceRangesTab() {
  const [domain, setDomain] = useState<string>(ANY);
  const [country, setCountry] = useState<string>(ANY);
  const [year, setYear] = useState<string>(ANY);
  const [metricSearch, setMetricSearch] = useState("");

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (domain !== ANY) p.set("domain", domain);
    if (country !== ANY) p.set("country", country);
    if (year !== ANY) p.set("year", year);
    if (metricSearch.trim()) p.set("metricKey", metricSearch.trim());
    return p.toString();
  }, [domain, country, year, metricSearch]);

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
                demand metrics). Phase 1: read-only grid. Edit, deep-research seed, and Specialist
                wiring land in Phases 2–4.
              </p>
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
                    {y.value} ({y.count})
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
              : "Phase 4 will populate this corpus via a deep-research seed; admins will be able to add rows manually once the Phase 2 edit UX ships."}
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
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const fresh = freshness(row.lastVerifiedAt);
                return (
                  <tr
                    key={row.id}
                    className="border-t border-border/50 hover:bg-muted/20"
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
                      {row.year}
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
