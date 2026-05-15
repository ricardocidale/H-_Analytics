/**
 * NationalBenchmarkBreakdown.tsx
 *
 * Shows the per-service-line national benchmark numbers that drive the
 * effective serviceMarkup for a centralized service template.  For each
 * contributing service line (from TEMPLATE_TO_SERVICE_LINES) it shows:
 *
 *   • Vendor cost %  — fetched from the Pietro / Gaetano feed, or
 *                      hardcoded anchor fallback.
 *   • Mgmt Co markup % — fetched from the Pietro / Renato feed, or
 *                         hardcoded anchor fallback.
 *   • Source badge ("feed" with fetchedAt vs "anchor").
 *
 * A footer row shows the derived cost-plus markup that the engine would
 * apply to the template if the national-benchmark overlay is active.
 *
 * Renders nothing for direct-model templates (no vendor cost component).
 */
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TEMPLATE_TO_SERVICE_LINES,
  NATIONAL_VENDOR_COST_ANCHORS,
  NATIONAL_MARKUP_FACTOR_ANCHORS,
} from "@calc/services/national-anchors";
import type { NationalBenchmarksResponse, NationalBenchmarkRow } from "@/lib/api/national-benchmarks";

const DAYS_THRESHOLD = 30;
const HOURS_IN_DAY = 24;
const MINUTES_IN_HOUR = 60;
const SECONDS_IN_MINUTE = 60;
const MS_IN_SECOND = 1000;

function fmtPct(v: number, decimals = 2): string {
  return `${(v * 100).toFixed(decimals)}%`;
}

function fmtAge(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const msPerDay = HOURS_IN_DAY * MINUTES_IN_HOUR * SECONDS_IN_MINUTE * MS_IN_SECOND;
  const days = Math.floor((Date.now() - d.getTime()) / msPerDay);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < DAYS_THRESHOLD) return `${days} days ago`;
  const months = Math.floor(days / DAYS_THRESHOLD);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

interface ServiceLineRow {
  line: string;
  costPct: number;
  costFromFeed: boolean;
  costRow: NationalBenchmarkRow | null;
  markupPct: number;
  markupFromFeed: boolean;
  markupRow: NationalBenchmarkRow | null;
}

interface NationalBenchmarkBreakdownProps {
  templateName: string;
  serviceModel: "centralized" | "direct";
  benchmarks: NationalBenchmarksResponse | undefined;
  className?: string;
}

export function NationalBenchmarkBreakdown({
  templateName,
  serviceModel,
  benchmarks,
  className,
}: NationalBenchmarkBreakdownProps) {
  if (serviceModel !== "centralized") return null;

  const serviceLines = TEMPLATE_TO_SERVICE_LINES[templateName];
  if (!serviceLines || serviceLines.length === 0) return null;

  const rows: ServiceLineRow[] = serviceLines.map((line) => {
    const costRow =
      benchmarks?.vendorCosts.find((r) => r.serviceLine === line) ?? null;
    const markupRow =
      benchmarks?.markupFactors.find((r) => r.serviceLine === line) ?? null;

    return {
      line,
      costPct: costRow?.value ?? NATIONAL_VENDOR_COST_ANCHORS[line] ?? 0,
      costFromFeed: costRow !== null,
      costRow,
      markupPct: markupRow?.value ?? NATIONAL_MARKUP_FACTOR_ANCHORS[line] ?? 0,
      markupFromFeed: markupRow !== null,
      markupRow,
    };
  });

  const totalCost = rows.reduce((s, r) => s + r.costPct, 0);
  const totalMarkupPct = rows.reduce((s, r) => s + r.markupPct, 0);
  const derivedMarkup = totalCost > 0 ? totalMarkupPct / totalCost : 0;

  const anyFromFeed = rows.some((r) => r.costFromFeed || r.markupFromFeed);
  const allFromFeed = rows.every((r) => r.costFromFeed && r.markupFromFeed);
  const sourceLabel = allFromFeed
    ? "national feed"
    : anyFromFeed
    ? "partial feed + anchor"
    : "anchor fallback";

  const lastFetchedAt =
    benchmarks?.vendorCostsLastFetchedAt ?? benchmarks?.markupFactorsLastFetchedAt ?? null;

  return (
    <div className={cn("rounded-lg border border-border/60 bg-muted/20 overflow-hidden", className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/30">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground min-w-0">
          National Benchmark Derivation
        </span>
        <span className="shrink-0">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-medium rounded-md border px-1.5 py-0.5 cursor-default",
                  allFromFeed
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                    : anyFromFeed
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
                    : "bg-muted/50 border-border text-muted-foreground",
                )}
                data-testid="national-benchmark-source-badge"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0",
                    allFromFeed
                      ? "bg-emerald-500"
                      : anyFromFeed
                      ? "bg-amber-500"
                      : "bg-muted-foreground/40",
                  )}
                />
                {sourceLabel}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-64">
              <p>
                {allFromFeed
                  ? `Markup derived from live national research data (Gaetano + Renato feeds).${lastFetchedAt ? ` Last refreshed ${fmtAge(lastFetchedAt)}.` : ""}`
                  : anyFromFeed
                  ? "Some service lines come from the live feed; others use hardcoded anchor values (STR HOST 2024 / CBRE 2024 / HVS 2024)."
                  : "No live feed data available. Using hardcoded anchor values sourced from STR HOST 2024, CBRE Hotels Americas Research 2024, and HVS 2024."}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        </span>
      </div>

      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-border/40">
            <th className="text-left px-3 py-1.5 font-medium text-muted-foreground uppercase tracking-wider">
              Service line
            </th>
            <th className="text-right px-3 py-1.5 font-medium text-muted-foreground uppercase tracking-wider">
              Vendor cost %
            </th>
            <th className="text-right px-3 py-1.5 font-medium text-muted-foreground uppercase tracking-wider">
              ManCo markup %
            </th>
            <th className="text-right px-3 py-1.5 font-medium text-muted-foreground uppercase tracking-wider">
              Source
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.line} className="border-b border-border/20 last:border-0">
              <td className="px-3 py-1.5 font-mono text-foreground capitalize">
                {r.line.replace(/_/g, " ")}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-foreground tabular-nums">
                {fmtPct(r.costPct)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-foreground tabular-nums">
                {fmtPct(r.markupPct)}
              </td>
              <td className="px-3 py-1.5 text-right">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 rounded px-1 py-0.5 cursor-default font-medium",
                          r.costFromFeed || r.markupFromFeed
                            ? "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
                            : "text-muted-foreground bg-muted/30",
                        )}
                      >
                        {r.costFromFeed || r.markupFromFeed ? "feed" : "anchor"}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="text-xs max-w-56">
                      {r.costFromFeed || r.markupFromFeed ? (
                        <p>
                          Live data from Pietro research feeds.
                          {r.costRow?.source && ` Source: ${r.costRow.source}.`}
                          {r.costRow?.period && ` Period: ${r.costRow.period}.`}
                          {r.costRow?.fetchedAt && ` Fetched ${fmtAge(r.costRow.fetchedAt)}.`}
                        </p>
                      ) : (
                        <p>
                          Hardcoded anchor: STR HOST 2024, CBRE Hotels Americas Research 2024, HVS 2024.
                          Run the Pietro minions (Gaetano + Renato) to populate live data.
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/40 border-t border-border/60">
            <td className="px-3 py-1.5 font-semibold text-muted-foreground uppercase tracking-wider">
              Totals → derived markup
            </td>
            <td className="px-3 py-1.5 text-right font-mono font-semibold text-foreground tabular-nums">
              {fmtPct(totalCost)}
            </td>
            <td className="px-3 py-1.5 text-right font-mono font-semibold text-foreground tabular-nums">
              {fmtPct(totalMarkupPct)}
            </td>
            <td className="px-3 py-1.5 text-right">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono font-semibold text-primary cursor-default"
                      data-testid="national-benchmark-derived-markup"
                    >
                      ={fmtPct(derivedMarkup, 0)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs max-w-64">
                    <p>
                      Derived cost-plus markup ={" "}
                      {fmtPct(totalMarkupPct)} ManCo markup ÷ {fmtPct(totalCost)} vendor
                      cost = {fmtPct(derivedMarkup, 1)}.{" "}
                      This is the markup the engine applies when the national-benchmark
                      overlay is active for this template.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
