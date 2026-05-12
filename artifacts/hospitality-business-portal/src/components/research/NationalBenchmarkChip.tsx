/**
 * NationalBenchmarkChip.tsx — Inline benchmark chip for ICP cost / markup
 * fields. Renders the latest national value from the Pietro research feeds
 * (vendor pass-through costs OR Mgmt Co markup factors) with two
 * independent signals from Fabio (`lib/engine/src/analyst/minions/fabio.ts`):
 *
 *   1. **Range-quality dot** at the right edge — green/amber/red — owned
 *      entirely by Fabio on the server using the `assumption_guardrails`
 *      table. Indicates whether the *benchmark itself* is plausible per
 *      the DB-stored guardrail [low, high] band. Grey = no guardrail
 *      defined for this assumption key.
 *
 *   2. Separate terse **"out of range"** chip — rendered only when the
 *      user-entered value falls outside the same guardrail [low, high]
 *      bounds returned by the server. Per the range-badge contract
 *      memorized in `replit.md`: one `AlertCircle` icon + the lowercase
 *      words "out of range", no severity word, no second dot.
 *
 * Renders nothing when no benchmark row is available — graceful
 * empty-state (Task #1414 Done-criterion #3).
 */
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IconAlertCircle } from "@/components/icons";
import type { RangeQualityDot } from "@/lib/api/national-benchmarks";

const PERCENT_DECIMALS = 2;
const DAYS_IN_MONTH = 30;
const HOURS_IN_DAY = 24;
const MINUTES_IN_HOUR = 60;
const SECONDS_IN_MINUTE = 60;
const MS_IN_SECOND = 1000;

export type BenchmarkKind = "vendor-cost" | "markup";

interface NationalBenchmarkChipProps {
  kind: BenchmarkKind;
  /** User-entered value as a decimal fraction of revenue (e.g. 0.03 = 3%). */
  currentValue: number | null | undefined;
  /** National benchmark value as a decimal fraction of revenue. */
  benchmarkValue: number | null | undefined;
  /** Range-quality dot color computed by Fabio on the server. */
  dot: RangeQualityDot;
  /** Guardrail bounds Fabio used; null when no guardrail row exists. */
  guardrail: { low: number; high: number } | null;
  source?: string | null;
  period?: string | null;
  fetchedAt?: string | null;
  className?: string;
}

const DOT_STYLE: Record<RangeQualityDot, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  grey: "bg-muted-foreground/40",
};

const DOT_LABEL: Record<RangeQualityDot, string> = {
  green: "Within plausible guardrail range",
  yellow: "Near the edge of the plausible guardrail range",
  red: "Outside the plausible guardrail range",
  grey: "No guardrail defined for this assumption",
};

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(PERCENT_DECIMALS)}%`;
}

function fmtAge(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const msPerDay = HOURS_IN_DAY * MINUTES_IN_HOUR * SECONDS_IN_MINUTE * MS_IN_SECOND;
  const days = Math.floor((Date.now() - d.getTime()) / msPerDay);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < DAYS_IN_MONTH) return `${days} days ago`;
  const months = Math.floor(days / DAYS_IN_MONTH);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function isOutOfRange(
  value: number | null | undefined,
  guardrail: { low: number; high: number } | null,
): boolean {
  if (value == null || !Number.isFinite(value)) return false;
  if (!guardrail) return false;
  return value < guardrail.low || value > guardrail.high;
}

export function NationalBenchmarkChip({
  kind,
  currentValue,
  benchmarkValue,
  dot,
  guardrail,
  source,
  period,
  fetchedAt,
  className,
}: NationalBenchmarkChipProps) {
  if (benchmarkValue == null || !Number.isFinite(benchmarkValue)) return null;

  const label = kind === "vendor-cost" ? "National vendor cost" : "National Mgmt Co markup";

  const tooltipParts: string[] = [
    `${label}: ${fmtPct(benchmarkValue)} of revenue`,
  ];
  if (guardrail) {
    tooltipParts.push(`Guardrail band: ${fmtPct(guardrail.low)}–${fmtPct(guardrail.high)}`);
  }
  if (source) tooltipParts.push(`Source: ${source}`);
  if (period) tooltipParts.push(`Period: ${period}`);
  if (fetchedAt) {
    const age = fmtAge(fetchedAt);
    if (age) tooltipParts.push(`Refreshed ${age}`);
  }
  tooltipParts.push(DOT_LABEL[dot]);

  const outOfRange = isOutOfRange(currentValue, guardrail);

  return (
    <TooltipProvider delayDuration={200}>
      <span className={cn("inline-flex items-center gap-1", className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium rounded-md border bg-muted/40 border-border px-1.5 py-0.5 cursor-default"
              data-testid={`national-benchmark-chip-${kind}`}
            >
              <span className="text-muted-foreground uppercase tracking-wider">Nat'l</span>
              <span className="font-mono text-foreground">{fmtPct(benchmarkValue)}</span>
              <span
                className={cn("h-1.5 w-1.5 rounded-full shrink-0", DOT_STYLE[dot])}
                data-testid={`national-benchmark-dot-${kind}`}
                aria-label={DOT_LABEL[dot]}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-72">
            <p>{tooltipParts.join(". ")}</p>
          </TooltipContent>
        </Tooltip>

        {outOfRange && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium rounded-md border bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400 px-1.5 py-0.5"
            data-testid={`national-benchmark-out-of-range-${kind}`}
          >
            <IconAlertCircle className="h-3 w-3" />
            out of range
          </span>
        )}
      </span>
    </TooltipProvider>
  );
}
