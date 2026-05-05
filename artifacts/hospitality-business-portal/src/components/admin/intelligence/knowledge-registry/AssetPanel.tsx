import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { adminFetch } from "@/components/admin/hooks";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { AnalystActionButton } from "@/components/analyst";
import AnalystRefreshTheater from "../AnalystRefreshTheater";
import ReferenceBrandsGrid, { type BrandSummary } from "../ReferenceBrandsGrid";
import { FreshnessBadge } from "./FreshnessBadge";
import { VectorChunkViewer } from "./VectorChunkViewer";
import { ChevronDown, ChevronRight } from "@/components/icons/themed-icons";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegistryEntry {
  id: string;
  displayName: string;
  description: string;
  howBuilt: string;
  sourceDescription: string;
  renewalMechanism: string;
  assetType: string;
  assetRef: string;
  lastRefreshedAt: string | null;
  liveCount: number | null;
}

interface Range {
  dimensionKey: string;
  label: string;
  unit: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
}

interface AnalystTableRow {
  id: string;
  label: string;
  ranges: Range[];
  brands?: BrandSummary[];
}

interface CountryRow {
  countryCode: string;
  countryName: string;
  inflationRate: string | null;
  fxRateToUsd: string | null;
  gdpGrowthRate: string | null;
  interestRate: string | null;
  sourcedAt: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: string | null | undefined): string {
  if (n == null) return "—";
  const v = parseFloat(n);
  return isNaN(v) ? "—" : v.toFixed(2);
}

function fmtPct(n: string | null | undefined): string {
  if (n == null) return "—";
  const v = parseFloat(n);
  return isNaN(v) ? "—" : `${v.toFixed(2)}%`;
}

function fmtCount(liveCount: number | null, assetType: string): string {
  if (liveCount == null) return "—";
  if (assetType === "vector_namespace") return `${liveCount.toLocaleString()} chunks`;
  return `${liveCount.toLocaleString()} rows`;
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

// Asset refs that have no batch regeneration path
const NO_BATCH_REFRESH = new Set(["assumption-guidance", "comparables"]);

function hasRefreshButton(entry: RegistryEntry): boolean {
  if (entry.assetType === "vector_namespace") return !NO_BATCH_REFRESH.has(entry.assetRef);
  return entry.assetType === "benchmark_table" || entry.assetType === "benchmark_brands" || entry.assetType === "country_data";
}

function regenerateUrl(entry: RegistryEntry): string {
  return `/api/admin/knowledge-registry/${entry.id}/regenerate`;
}

// ── Type-specific content viewers ─────────────────────────────────────────────

function RangesGrid({ ranges }: { ranges: Range[] }) {
  if (ranges.length === 0) {
    return <p className="text-sm text-muted-foreground">No ranges available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-1.5 pr-4 font-medium">Dimension</th>
            <th className="text-right py-1.5 px-2 font-medium">Low</th>
            <th className="text-right py-1.5 px-2 font-medium">Mid</th>
            <th className="text-right py-1.5 px-2 font-medium">High</th>
            <th className="text-right py-1.5 pl-2 font-medium">Unit</th>
          </tr>
        </thead>
        <tbody>
          {ranges.map((r) => (
            <tr key={r.dimensionKey} className="border-b border-border/50">
              <td className="py-1.5 pr-4 text-foreground/90">{r.label}</td>
              <td className="text-right py-1.5 px-2 tabular-nums">
                {r.valueLow != null ? r.valueLow.toLocaleString() : "—"}
              </td>
              <td className="text-right py-1.5 px-2 tabular-nums font-medium">
                {r.valueMid != null ? r.valueMid.toLocaleString() : "—"}
              </td>
              <td className="text-right py-1.5 px-2 tabular-nums">
                {r.valueHigh != null ? r.valueHigh.toLocaleString() : "—"}
              </td>
              <td className="text-right py-1.5 pl-2 text-muted-foreground">{r.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompactCountryTable({ rows }: { rows: CountryRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No country data available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-1.5 pr-4 font-medium">Country</th>
            <th className="text-right py-1.5 px-2 font-medium">Inflation</th>
            <th className="text-right py-1.5 px-2 font-medium">FX / USD</th>
            <th className="text-right py-1.5 px-2 font-medium">GDP Growth</th>
            <th className="text-right py-1.5 pl-2 font-medium">Interest</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.countryCode} className="border-b border-border/50">
              <td className="py-1.5 pr-4">
                <span className="font-mono text-[10px] text-muted-foreground mr-1">{r.countryCode}</span>
                {r.countryName}
              </td>
              <td className="text-right py-1.5 px-2 tabular-nums">{fmtPct(r.inflationRate)}</td>
              <td className="text-right py-1.5 px-2 tabular-nums">{fmt(r.fxRateToUsd)}</td>
              <td className="text-right py-1.5 px-2 tabular-nums">{fmtPct(r.gdpGrowthRate)}</td>
              <td className="text-right py-1.5 pl-2 tabular-nums">{fmtPct(r.interestRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── TypeSpecificViewer ────────────────────────────────────────────────────────

// Maps knowledge_registry.assetRef → analyst-tables id
const BENCHMARK_TABLE_ID: Record<string, string> = {
  "capital-raise": "capital_raise_benchmarks",
  "exit-multiples": "exit_multiples",
  "reference-brands": "reference_brands",
};

function TypeSpecificViewer({ entry }: { entry: RegistryEntry }) {
  if (entry.assetType === "vector_namespace") {
    return <VectorChunkViewer entryId={entry.id} />;
  }

  if (entry.assetType === "benchmark_table" || entry.assetType === "benchmark_brands") {
    const tableId = BENCHMARK_TABLE_ID[entry.assetRef];
    return <BenchmarkViewer tableId={tableId} assetType={entry.assetType} />;
  }

  if (entry.assetType === "country_data") {
    return <CountryDataViewer />;
  }

  return null;
}

function BenchmarkViewer({ tableId, assetType }: { tableId: string; assetType: string }) {
  const { data: tables, isLoading, isError } = useQuery<AnalystTableRow[]>({
    queryKey: ["/api/admin/analyst-tables"],
    queryFn: adminFetch<AnalystTableRow[]>("/api/admin/analyst-tables", "Failed to load analyst tables"),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Loading…</p>;
  if (isError) return <p className="text-xs text-destructive py-2">Failed to load benchmark data.</p>;

  const table = tables?.find((t) => t.id === tableId);
  if (!table) return <p className="text-xs text-muted-foreground py-2">No data.</p>;

  if (assetType === "benchmark_brands" && table.brands != null) {
    return <ReferenceBrandsGrid brands={table.brands} />;
  }

  return <RangesGrid ranges={table.ranges} />;
}

function CountryDataViewer() {
  const { data: rows, isLoading, isError } = useQuery<CountryRow[]>({
    queryKey: ["/api/admin/knowledge-registry/country-economic-data"],
    queryFn: adminFetch<CountryRow[]>("/api/admin/knowledge-registry/country-economic-data", "Failed to load country economic data"),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Loading…</p>;
  if (isError) return <p className="text-xs text-destructive py-2">Failed to load country economic data.</p>;
  return <CompactCountryTable rows={rows ?? []} />;
}

// ── AssetPanel ─────────────────────────────────────────────────────────────────

interface Props {
  entry: RegistryEntry;
}

export function AssetPanel({ entry }: Props) {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", regenerateUrl(entry), {});
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-registry"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-registry/country-economic-data"] });
      toast({ title: `${entry.displayName} refreshed` });
    },
    onError: (err: Error) => {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      setRefreshing(false);
    },
  });

  function handleAnalystClick() {
    setRefreshing(true);
    regenerateMutation.mutate();
  }

  return (
    <>
      {refreshing && (
        <AnalystRefreshTheater
          tableLabel={entry.displayName}
          onCancel={() => {
            setRefreshing(false);
            regenerateMutation.reset();
          }}
        />
      )}

      <Card className="overflow-hidden">
        <Collapsible open={open} onOpenChange={setOpen}>
          {/* Summary row */}
          <CollapsibleTrigger asChild>
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              data-testid={`panel-trigger-${entry.id}`}
            >
              {open
                ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              }
              <span className="font-medium text-sm flex-1 min-w-0">{entry.displayName}</span>
              <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                <FreshnessBadge
                  lastRefreshedAt={entry.lastRefreshedAt}
                  liveCount={entry.liveCount}
                />
                {entry.liveCount != null && (
                  <span className="text-xs text-muted-foreground tabular-nums hidden sm:block">
                    {fmtCount(entry.liveCount, entry.assetType)}
                  </span>
                )}
                {entry.lastRefreshedAt && (
                  <span className="text-xs text-muted-foreground hidden md:block">
                    {relativeTime(entry.lastRefreshedAt)}
                  </span>
                )}
                {hasRefreshButton(entry) && (
                  <span onClick={(e) => e.stopPropagation()}>
                    <AnalystActionButton
                      onClick={handleAnalystClick}
                      running={regenerateMutation.isPending}
                      testIdSuffix={entry.id}
                    />
                  </span>
                )}
              </div>
            </button>
          </CollapsibleTrigger>

          {/* Expanded content */}
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-2 border-t space-y-4">
              {/* Type-specific viewer */}
              <TypeSpecificViewer entry={entry} />

              {/* Metadata footer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 pt-2 border-t text-xs text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground/70">About: </span>
                  {entry.description}
                </div>
                <div>
                  <span className="font-medium text-foreground/70">How built: </span>
                  {entry.howBuilt}
                </div>
                <div>
                  <span className="font-medium text-foreground/70">Sources: </span>
                  {entry.sourceDescription}
                </div>
                <div>
                  <span className="font-medium text-foreground/70">Renewal: </span>
                  {entry.renewalMechanism}
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </>
  );
}
