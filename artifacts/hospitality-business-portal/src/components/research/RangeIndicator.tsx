import { cn } from "@/lib/utils";
import { RANGE_INDICATOR_CHART_PADDING } from "@shared/constants-benchmarks";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IconAlertCircle } from "@/components/icons";
import {
  classifyRangeQuality,
  isOutOfRange,
  type AssumptionGuardrail,
  type RangeQualityDot,
} from "@engine/analyst/minions/fabio";

interface RangeIndicatorProps {
  currentValue: number | null | undefined;
  entry?: { display: string; mid: number; source?: string; sourceName?: string; sourceDate?: string; confidence?: string | null } | null;
  isPercent?: boolean;
  showConfidence?: boolean;
  /**
   * Optional guardrail for the assumption being displayed. When provided,
   * the badge follows the SUPERSEDING contract memorized in replit.md
   * (2026-05-11): the dot's color is the Fabio range-quality verdict
   * (green/yellow/red/grey), and a separate "out of range" chip is shown
   * when the user value falls outside the guardrail bounds. The
   * deprecated "Med/Low/High" confidence tail is suppressed in this mode.
   * When omitted, the legacy hard-coded near/within/outside heuristic
   * remains active for backward compatibility with existing callsites.
   */
  guardrail?: AssumptionGuardrail | null;
  className?: string;
  "data-testid"?: string;
}

function parseRange(display: string): { low: number; high: number } | null {
  const nums = display.replace(/[$%,]/g, "").match(/[\d.]+/g);
  if (!nums || nums.length < 2) return null;
  return { low: parseFloat(nums[0]), high: parseFloat(nums[1]) };
}

type RangeStatus = "within" | "near" | "outside" | "unknown";

export function getRangeStatus(value: number, low: number, high: number): RangeStatus {
  if (low === high) return "unknown";
  if (value >= low && value <= high) return "within";
  const span = high - low;
  const margin = span * RANGE_INDICATOR_CHART_PADDING;
  if (value >= low - margin && value <= high + margin) return "near";
  return "outside";
}

const STATUS_STYLES: Record<RangeStatus, string> = {
  within: "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  near: "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-400",
  outside: "bg-red-500/15 border-red-500/30 text-red-700 dark:text-red-400",
  unknown: "bg-muted/50 border-border text-muted-foreground",
};

const STATUS_DOT: Record<RangeStatus, string> = {
  within: "bg-emerald-500",
  near: "bg-amber-500",
  outside: "bg-red-500",
  unknown: "bg-muted-foreground/40",
};

const STATUS_LABEL: Record<RangeStatus, string> = {
  within: "Within range",
  near: "Near range boundary",
  outside: "Outside suggested range",
  unknown: "No comparison available",
};

type ConfidenceLevel = "high" | "medium" | "low";

function normalizeConfidence(raw?: string | null): ConfidenceLevel | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("high")) return "high";
  if (lower.includes("med")) return "medium";
  if (lower.includes("low")) return "low";
  return null;
}

const CONFIDENCE_STYLES: Record<ConfidenceLevel, { dot: string; label: string }> = {
  high:   { dot: "bg-emerald-500", label: "High" },
  medium: { dot: "bg-amber-500",   label: "Med" },
  low:    { dot: "bg-red-400",     label: "Low" },
};

// ── Fabio range-quality dot styling (SUPERSEDING contract, 2026-05-11) ─────
const FABIO_DOT_CLASS: Record<RangeQualityDot, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  grey: "bg-muted-foreground/40",
};

const FABIO_DOT_LABEL: Record<RangeQualityDot, string> = {
  green: "Range fits guardrail target band",
  yellow: "Range plausible but outside target band",
  red: "Range outside guardrail bounds",
  grey: "No guardrail comparison available",
};

function RangeIndicator({ currentValue, entry, isPercent, showConfidence = true, guardrail, className, ...props }: RangeIndicatorProps) {
  if (!entry || !entry.display) return null;

  const range = parseRange(entry.display);
  const compareValue = currentValue != null
    ? (isPercent ? currentValue * 100 : currentValue)
    : null;

  // ── Fabio mode (guardrail provided) ──────────────────────────────────────
  // Per replit.md (2026-05-11): two independent signals on a range badge —
  //   (1) range-quality dot at the right edge, colored by Fabio against the
  //       guardrail row for this assumption key;
  //   (2) a separate terse "out of range" chip with one icon, no severity
  //       word, when the user value falls outside the guardrail bounds.
  // The Med/Low/High tail is deprecated in this mode.
  if (guardrail) {
    // Guardrail bounds are decimal fractions (e.g. 0.06 → 6%). The benchmark
    // mid `entry.mid` is already in display units (percent for fractions),
    // so normalize back to the guardrail's unit for an apples-to-apples
    // classification.
    const normalizedMid = isPercent ? entry.mid / 100 : entry.mid;
    const normalizedValue =
      compareValue != null ? (isPercent ? compareValue / 100 : compareValue) : null;
    const dot: RangeQualityDot = classifyRangeQuality(normalizedMid, guardrail);
    const outOfRange = isOutOfRange(normalizedValue, guardrail);

    const tooltipParts: string[] = [
      `Research suggests ${entry.display}, mid ${isPercent ? `${entry.mid}%` : entry.mid}`,
    ];
    if (entry.sourceName) tooltipParts.push(`Source: ${entry.sourceName}`);
    tooltipParts.push(FABIO_DOT_LABEL[dot]);

    return (
      <span className="inline-flex items-center gap-1.5">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-medium rounded-md px-1.5 py-0.5 border cursor-default",
                  "bg-muted/40 border-border text-foreground/80",
                  className,
                )}
                data-testid={props["data-testid"] ?? "range-indicator"}
              >
                <span>{entry.display}</span>
                <span
                  className={cn("h-1.5 w-1.5 rounded-full shrink-0", FABIO_DOT_CLASS[dot])}
                  data-testid="fabio-range-quality-dot"
                  title={FABIO_DOT_LABEL[dot]}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-72">
              <p>{tooltipParts.join(". ")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {outOfRange && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium rounded-md px-1.5 py-0.5 border bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400"
            data-testid="range-out-of-range-chip"
          >
            <IconAlertCircle className="h-2.5 w-2.5" />
            out of range
          </span>
        )}
      </span>
    );
  }

  // ── Legacy mode (no guardrail) — deprecated; kept for backward compat ───
  const status: RangeStatus = (compareValue != null && range)
    ? getRangeStatus(compareValue, range.low, range.high)
    : "unknown";

  const confidence = normalizeConfidence(entry.confidence ?? entry.source);

  const tooltipParts: string[] = [`Research suggests ${entry.display}, mid ${isPercent ? `${entry.mid}%` : entry.mid}`];
  if (entry.sourceName) tooltipParts.push(`Source: ${entry.sourceName}`);
  if (confidence) tooltipParts.push(`Confidence: ${CONFIDENCE_STYLES[confidence].label}`);
  else if (entry.source) tooltipParts.push(`Confidence: ${entry.source}`);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-medium rounded-md px-1.5 py-0.5 border cursor-default",
              STATUS_STYLES[status],
              className,
            )}
            data-testid={props["data-testid"] ?? "range-indicator"}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT[status])} />
            {STATUS_LABEL[status]}
            {showConfidence && confidence && (
              <>
                <span className="text-muted-foreground/40 mx-0.5">·</span>
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", CONFIDENCE_STYLES[confidence].dot)} data-testid="confidence-indicator" />
                <span className="opacity-75">{CONFIDENCE_STYLES[confidence].label}</span>
              </>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-72">
          <p>{tooltipParts.join(". ")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

RangeIndicator.displayName = "RangeIndicator";

export { RangeIndicator };
export type { RangeIndicatorProps };
