import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RangeIndicatorProps {
  currentValue: number | null | undefined;
  entry?: { display: string; mid: number; source?: string; sourceName?: string; sourceDate?: string; confidence?: string | null } | null;
  isPercent?: boolean;
  showConfidence?: boolean;
  className?: string;
  "data-testid"?: string;
}

function parseRange(display: string): { low: number; high: number } | null {
  const nums = display.replace(/[$%,]/g, "").match(/[\d.]+/g);
  if (!nums || nums.length < 2) return null;
  return { low: parseFloat(nums[0]), high: parseFloat(nums[1]) };
}

type RangeStatus = "within" | "near" | "outside" | "unknown";

function getRangeStatus(value: number, low: number, high: number): RangeStatus {
  if (value >= low && value <= high) return "within";
  const span = high - low || 1;
  const margin = span * 0.2;
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

function RangeIndicator({ currentValue, entry, isPercent, showConfidence = true, className, ...props }: RangeIndicatorProps) {
  if (!entry || !entry.display) return null;

  const range = parseRange(entry.display);
  const compareValue = currentValue != null
    ? (isPercent ? currentValue * 100 : currentValue)
    : null;

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
