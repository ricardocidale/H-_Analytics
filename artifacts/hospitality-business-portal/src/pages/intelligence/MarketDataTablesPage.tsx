import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconSparkles, IconDatabase } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type MarketDataTableSlug =
  | "hospitality-benchmarks"
  | "market-adr-index"
  | "labor-rates"
  | "fb-benchmarks"
  | "seasonal-calendars"
  | "assumption-guardrails";

interface CatalogEntry {
  name: MarketDataTableSlug;
  label: string;
  description: string;
  sourceNote: string;
  rowCount: number;
  lastUpdatedAt: string | null;
}

interface TableMeta {
  label: string;
  description: string;
  sourceNote: string;
}

interface TableRowsResponse<T> {
  table: MarketDataTableSlug;
  meta: TableMeta;
  rows: T[];
}

interface RefreshResponse {
  table: MarketDataTableSlug;
  market: string | null;
  rowsUpserted: number;
}

interface HospitalityBenchmarkRow {
  id: number;
  category: string;
  segment: string;
  metricLabel: string;
  value: number;
  unit: string;
  sourceName: string | null;
  sourceYear: number;
  country: string | null;
}
interface MarketAdrRow {
  id: number;
  market: string;
  country: string;
  quarter: string;
  avgAdr: number | null;
  boutiqueAdr: number | null;
  avgOccupancy: number | null;
  source: string | null;
}
interface LaborRateRow {
  id: number;
  market: string;
  country: string;
  role: string;
  hourlyRate: number | null;
  annualSalary: number | null;
  currency: string;
  source: string | null;
  sourceYear: number | null;
}
interface FbBenchmarkRow {
  id: number;
  market: string;
  country: string;
  propertyType: string;
  avgTicketPerPerson: number | null;
  fbCostOfGoodsPercent: number | null;
  fbLaborCostPercent: number | null;
  source: string | null;
}
interface SeasonalCalendarRow {
  id: number;
  market: string;
  country: string;
  month: number;
  seasonType: string;
  demandMultiplier: number;
  notes: string | null;
}
interface AssumptionGuardrailRow {
  id: number;
  assumptionKey: string;
  low: number;
  high: number;
  targetLow: number | null;
  targetHigh: number | null;
  unit: string;
  rationale: string | null;
  source: string | null;
  updatedAt: string | null;
}

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

const cardClass =
  "bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-primary/10 rounded-2xl shadow-lg overflow-hidden";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatTimestamp(value: string | null): string {
  if (!value) return "Never";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatNumber(value: number | null | undefined, fractionDigits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${formatNumber(value, 1)}%`;
}

function formatValueWithUnit(value: number, unit: string): string {
  switch (unit) {
    case "usd":
      return `$${formatNumber(value, 2)}`;
    case "percent":
      return `${formatNumber(value, 2)}%`;
    case "ratio":
      return formatNumber(value, 3);
    case "years":
      return `${formatNumber(value, 1)} yr`;
    default:
      return formatNumber(value, 2);
  }
}

function monthLabel(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

function HospitalityBenchmarkTable({ rows }: { rows: HospitalityBenchmarkRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead>Segment</TableHead>
          <TableHead>Metric</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead>Source</TableHead>
          <TableHead className="text-right">Year</TableHead>
          <TableHead>Country</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} data-testid={`row-hospitality-benchmarks-${r.id}`}>
            <TableCell>{r.category}</TableCell>
            <TableCell>{r.segment}</TableCell>
            <TableCell>{r.metricLabel}</TableCell>
            <TableCell className="text-right font-medium">
              {formatValueWithUnit(r.value, r.unit)}
            </TableCell>
            <TableCell className="text-muted-foreground">{r.sourceName ?? "—"}</TableCell>
            <TableCell className="text-right text-muted-foreground">{r.sourceYear}</TableCell>
            <TableCell>{r.country ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MarketAdrTable({ rows }: { rows: MarketAdrRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Market</TableHead>
          <TableHead>Country</TableHead>
          <TableHead>Quarter</TableHead>
          <TableHead className="text-right">Avg ADR</TableHead>
          <TableHead className="text-right">Boutique ADR</TableHead>
          <TableHead className="text-right">Avg Occupancy</TableHead>
          <TableHead>Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} data-testid={`row-market-adr-index-${r.id}`}>
            <TableCell>{r.market}</TableCell>
            <TableCell>{r.country}</TableCell>
            <TableCell>{r.quarter}</TableCell>
            <TableCell className="text-right font-medium">
              {r.avgAdr !== null ? `$${formatNumber(r.avgAdr, 2)}` : "—"}
            </TableCell>
            <TableCell className="text-right">
              {r.boutiqueAdr !== null ? `$${formatNumber(r.boutiqueAdr, 2)}` : "—"}
            </TableCell>
            <TableCell className="text-right">{formatPercent(r.avgOccupancy)}</TableCell>
            <TableCell className="text-muted-foreground">{r.source ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LaborRatesTable({ rows }: { rows: LaborRateRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Market</TableHead>
          <TableHead>Country</TableHead>
          <TableHead>Role</TableHead>
          <TableHead className="text-right">Hourly</TableHead>
          <TableHead className="text-right">Annual</TableHead>
          <TableHead>Currency</TableHead>
          <TableHead>Source</TableHead>
          <TableHead className="text-right">Year</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} data-testid={`row-labor-rates-${r.id}`}>
            <TableCell>{r.market}</TableCell>
            <TableCell>{r.country}</TableCell>
            <TableCell>{r.role}</TableCell>
            <TableCell className="text-right font-medium">
              {r.hourlyRate !== null ? formatNumber(r.hourlyRate, 2) : "—"}
            </TableCell>
            <TableCell className="text-right">
              {r.annualSalary !== null ? formatNumber(r.annualSalary, 0) : "—"}
            </TableCell>
            <TableCell>{r.currency}</TableCell>
            <TableCell className="text-muted-foreground">{r.source ?? "—"}</TableCell>
            <TableCell className="text-right text-muted-foreground">{r.sourceYear ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function FbBenchmarksTable({ rows }: { rows: FbBenchmarkRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Market</TableHead>
          <TableHead>Country</TableHead>
          <TableHead>Property Type</TableHead>
          <TableHead className="text-right">Avg Ticket / Person</TableHead>
          <TableHead className="text-right">F&B COGS %</TableHead>
          <TableHead className="text-right">F&B Labor %</TableHead>
          <TableHead>Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} data-testid={`row-fb-benchmarks-${r.id}`}>
            <TableCell>{r.market}</TableCell>
            <TableCell>{r.country}</TableCell>
            <TableCell>{r.propertyType}</TableCell>
            <TableCell className="text-right font-medium">
              {r.avgTicketPerPerson !== null ? `$${formatNumber(r.avgTicketPerPerson, 2)}` : "—"}
            </TableCell>
            <TableCell className="text-right">{formatPercent(r.fbCostOfGoodsPercent)}</TableCell>
            <TableCell className="text-right">{formatPercent(r.fbLaborCostPercent)}</TableCell>
            <TableCell className="text-muted-foreground">{r.source ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SeasonalCalendarsTable({ rows }: { rows: SeasonalCalendarRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Market</TableHead>
          <TableHead>Country</TableHead>
          <TableHead>Month</TableHead>
          <TableHead>Season</TableHead>
          <TableHead className="text-right">Demand Multiplier</TableHead>
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} data-testid={`row-seasonal-calendars-${r.id}`}>
            <TableCell>{r.market}</TableCell>
            <TableCell>{r.country}</TableCell>
            <TableCell>{monthLabel(r.month)}</TableCell>
            <TableCell>
              <Badge variant="outline" className="capitalize">{r.seasonType}</Badge>
            </TableCell>
            <TableCell className="text-right font-medium">
              {formatNumber(r.demandMultiplier, 2)}×
            </TableCell>
            <TableCell className="text-muted-foreground text-xs max-w-[28rem] truncate" title={r.notes ?? ""}>
              {r.notes ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AssumptionGuardrailsTable({ rows }: { rows: AssumptionGuardrailRow[] }) {
  function formatBound(value: number, unit: string): string {
    if (unit === "fraction_of_revenue" || unit === "fraction") {
      return `${(value * 100).toFixed(2)}%`;
    }
    return formatNumber(value, 4);
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Assumption Key</TableHead>
          <TableHead className="text-right">Low</TableHead>
          <TableHead className="text-right">High</TableHead>
          <TableHead className="text-right">Target Low</TableHead>
          <TableHead className="text-right">Target High</TableHead>
          <TableHead>Unit</TableHead>
          <TableHead>Rationale</TableHead>
          <TableHead>Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} data-testid={`row-assumption-guardrails-${r.id}`}>
            <TableCell className="font-mono text-xs">{r.assumptionKey}</TableCell>
            <TableCell className="text-right font-medium">{formatBound(r.low, r.unit)}</TableCell>
            <TableCell className="text-right font-medium">{formatBound(r.high, r.unit)}</TableCell>
            <TableCell className="text-right text-muted-foreground">
              {r.targetLow !== null ? formatBound(r.targetLow, r.unit) : "—"}
            </TableCell>
            <TableCell className="text-right text-muted-foreground">
              {r.targetHigh !== null ? formatBound(r.targetHigh, r.unit) : "—"}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">{r.unit}</TableCell>
            <TableCell className="text-xs text-muted-foreground max-w-[24rem]">
              {r.rationale ?? "—"}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">{r.source ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function renderRows(slug: MarketDataTableSlug, rows: unknown[]) {
  switch (slug) {
    case "hospitality-benchmarks":
      return <HospitalityBenchmarkTable rows={rows as HospitalityBenchmarkRow[]} />;
    case "market-adr-index":
      return <MarketAdrTable rows={rows as MarketAdrRow[]} />;
    case "labor-rates":
      return <LaborRatesTable rows={rows as LaborRateRow[]} />;
    case "fb-benchmarks":
      return <FbBenchmarksTable rows={rows as FbBenchmarkRow[]} />;
    case "seasonal-calendars":
      return <SeasonalCalendarsTable rows={rows as SeasonalCalendarRow[]} />;
    case "assumption-guardrails":
      return <AssumptionGuardrailsTable rows={rows as AssumptionGuardrailRow[]} />;
  }
}

interface TableSectionProps {
  entry: CatalogEntry;
  isExpanded: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  refreshDisabled: boolean;
}

function TableSection({ entry, isExpanded, onRefresh, isRefreshing, refreshDisabled }: TableSectionProps) {
  // Guardrails are read-only and code-seeded — no per-row refresh path.
  const isReadOnly = entry.name === "assumption-guardrails";
  const queryKey = isReadOnly
    ? `/api/admin/assumption-guardrails`
    : `/api/admin/market-data-tables/${entry.name}`;
  const { data, isLoading, error } = useQuery<TableRowsResponse<unknown>>({
    queryKey: [queryKey],
    enabled: isExpanded,
  });

  return (
    <AccordionItem
      value={entry.name}
      data-testid={`table-section-${entry.name}`}
      className="border-b-0"
    >
      <div className="flex items-stretch gap-2 px-5">
        <AccordionTrigger className="flex-1 hover:no-underline py-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <IconDatabase className="size-4 text-primary" />
            </div>
            <div className="text-left min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="font-display font-semibold text-foreground"
                  data-testid={`text-label-${entry.name}`}
                >
                  {entry.label}
                </span>
                <Badge
                  variant="secondary"
                  className="text-[11px]"
                  data-testid={`badge-row-count-${entry.name}`}
                >
                  {entry.rowCount.toLocaleString()} {entry.rowCount === 1 ? "row" : "rows"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {entry.description}
              </p>
              <p
                className="text-[11px] text-muted-foreground/80 mt-0.5"
                data-testid={`text-last-updated-${entry.name}`}
              >
                Last refreshed: {formatTimestamp(entry.lastUpdatedAt)}
              </p>
            </div>
          </div>
        </AccordionTrigger>
        <div className="flex items-center pl-2">
          {isReadOnly ? (
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wider"
              data-testid={`badge-read-only-${entry.name}`}
            >
              Read-only · code-seeded
            </Badge>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRefresh}
              disabled={refreshDisabled}
              data-testid={`button-refresh-${entry.name}`}
              className="gap-1.5"
            >
              {isRefreshing ? (
                <Loader2 className="size-3.5 animate-spin text-accent-pop" />
              ) : (
                <IconSparkles className="size-3.5" />
              )}
              Analyst
            </Button>
          )}
        </div>
      </div>
      <AccordionContent className="px-5 pb-5 pt-0">
        {isRefreshing && (
          <div
            className="mb-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary flex items-center gap-2"
            data-testid={`text-pending-${entry.name}`}
          >
            <Loader2 className="size-3.5 animate-spin text-accent-pop" />
            Analyst taking a look at current market data…
          </div>
        )}

        {error && (
          <div
            className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            data-testid={`text-error-${entry.name}`}
          >
            {error instanceof Error ? error.message : "Failed to load rows"}
          </div>
        )}

        {isLoading && !data ? (
          <div className="space-y-2" data-testid={`loader-${entry.name}`}>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : data && data.rows.length > 0 ? (
          <div className="rounded-xl border border-border/60 bg-background/40 overflow-hidden">
            {renderRows(entry.name, data.rows)}
          </div>
        ) : data ? (
          <div
            className="rounded-xl border border-dashed border-border/60 bg-background/40 px-4 py-8 text-center text-sm text-muted-foreground"
            data-testid={`text-empty-${entry.name}`}
          >
            No rows yet. Click <span className="font-medium text-foreground">Analyst</span> to populate this table.
          </div>
        ) : null}

        <p
          className="mt-3 text-[11px] italic text-muted-foreground"
          data-testid={`text-source-note-${entry.name}`}
        >
          Source: {entry.sourceNote}
        </p>
      </AccordionContent>
    </AccordionItem>
  );
}

export default function MarketDataTablesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [pendingTable, setPendingTable] = useState<MarketDataTableSlug | null>(null);

  const catalogQuery = useQuery<CatalogEntry[]>({
    queryKey: ["/api/admin/market-data-tables"],
  });

  const refreshMutation = useMutation({
    mutationFn: async (table: MarketDataTableSlug): Promise<RefreshResponse> => {
      const res = await apiRequest(
        "POST",
        `/api/admin/market-data-tables/${table}/refresh`,
        { market: null },
      );
      return res.json();
    },
    onSuccess: (result) => {
      toast({
        title: `Updated — ${result.rowsUpserted.toLocaleString()} rows refreshed`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/market-data-tables"] });
      queryClient.invalidateQueries({
        queryKey: [`/api/admin/market-data-tables/${result.table}`],
      });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Refresh failed",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setPendingTable(null);
    },
  });

  function handleRefresh(table: MarketDataTableSlug) {
    setPendingTable(table);
    setExpandedSections((prev) => (prev.includes(table) ? prev : [...prev, table]));
    refreshMutation.mutate(table);
  }

  return (
    <div className="space-y-6" data-testid="page-market-data-tables">
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="space-y-4"
      >
        {catalogQuery.isLoading && (
          <div className="space-y-3" data-testid="loader-catalog">
            {[0, 1, 2, 3, 4].map((i) => (
              <Card key={i} className={cardClass}>
                <CardContent className="p-5">
                  <Skeleton className="h-5 w-1/3 mb-3" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {catalogQuery.error && (
          <Card className={cardClass}>
            <CardContent className="p-5 text-sm text-destructive" data-testid="text-catalog-error">
              {catalogQuery.error instanceof Error
                ? catalogQuery.error.message
                : "Failed to load market data catalog"}
            </CardContent>
          </Card>
        )}

        {catalogQuery.data && catalogQuery.data.length > 0 && (
          <Accordion
            type="multiple"
            value={expandedSections}
            onValueChange={setExpandedSections}
            className="space-y-4"
          >
            {catalogQuery.data.map((entry, i) => (
              <motion.div key={entry.name} variants={fadeUp} custom={i}>
                <Card className={cardClass}>
                  <TableSection
                    entry={entry}
                    isExpanded={expandedSections.includes(entry.name)}
                    isRefreshing={
                      pendingTable === entry.name && refreshMutation.isPending
                    }
                    refreshDisabled={refreshMutation.isPending}
                    onRefresh={() => handleRefresh(entry.name)}
                  />
                </Card>
              </motion.div>
            ))}
          </Accordion>
        )}
      </motion.div>
    </div>
  );
}
