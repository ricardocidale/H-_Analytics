import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { IconInfo } from "@/components/icons";
import {
  meetsConvictionFloor,
  type DataQualitySummary,
} from "@shared/analyst-conviction";
import { ANALYST_BRAND } from "@/lib/agent-taxonomy";

interface GuidanceRecord {
  id: number;
  assumptionKey: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
  confidence: string | null;
  reasoning: string | null;
  sourceName: string | null;
  dataQuality?: DataQualitySummary | null;
}

interface AssumptionGuidancePopoverProps {
  fieldKey: string;
  guidance: GuidanceRecord[] | undefined;
  isPercent?: boolean;
  isCurrency?: boolean;
  className?: string;
}

function fmt(val: number, isPercent: boolean, isCurrency: boolean): string {
  if (isPercent) return `${(val * 100).toFixed(1)}%`;
  if (isCurrency) return `$${val.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return val.toFixed(2);
}

// Canonical chip colors mirror AnalystVerdictDisplay severity system (§11).
// high → ok (emerald), moderate → advisory (sky), low → warning (amber).
const CONFIDENCE_CHIP: Record<string, { label: string; color: string }> = {
  high:     { label: "High confidence",     color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  moderate: { label: "Moderate confidence", color: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  low:      { label: "Low confidence",      color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
};

export function AssumptionGuidancePopover({
  fieldKey,
  guidance,
  isPercent = false,
  isCurrency = false,
  className,
}: AssumptionGuidancePopoverProps) {
  if (!guidance || guidance.length === 0) return null;

  const record = guidance.find((g) => g.assumptionKey === fieldKey);
  if (!record) return null;

  const hasRange = record.valueLow != null && record.valueHigh != null;
  if (!hasRange && !record.reasoning) return null;

  const belowFloor = record.dataQuality && !meetsConvictionFloor(record.dataQuality);
  const conf = record.confidence ?? "low";
  const confConfig = CONFIDENCE_CHIP[conf] ?? CONFIDENCE_CHIP.low;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${ANALYST_BRAND} guidance for this field`}
          className={cn(
            "inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-primary/50 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className,
          )}
          data-testid={`guidance-popover-trigger-${fieldKey}`}
        >
          <IconInfo className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 p-3 text-xs space-y-2.5"
        data-testid={`guidance-popover-content-${fieldKey}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-foreground">{ANALYST_BRAND} guidance</span>
          {!belowFloor && (
            <Badge
              variant="outline"
              className={cn("text-[9px] px-1.5 py-0 h-4 font-medium border-0", confConfig.color)}
            >
              {confConfig.label}
            </Badge>
          )}
        </div>

        {belowFloor ? (
          <p className="text-muted-foreground">
            Insufficient data to make a reliable recommendation. Run research to improve coverage.
          </p>
        ) : (
          <>
            {hasRange && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Suggested range:</span>
                <span className="font-semibold tabular-nums">
                  {fmt(record.valueLow!, isPercent, isCurrency)}
                  {" – "}
                  {fmt(record.valueHigh!, isPercent, isCurrency)}
                </span>
                {record.valueMid != null && (
                  <span className="text-muted-foreground/60">
                    (mid {fmt(record.valueMid, isPercent, isCurrency)})
                  </span>
                )}
              </div>
            )}

            {record.reasoning && (
              <p className="text-muted-foreground leading-relaxed">{record.reasoning}</p>
            )}

            {record.sourceName && (
              <p className="text-muted-foreground/70 text-[10px]">Source: {record.sourceName}</p>
            )}

            {record.dataQuality?.qualityNarrative && (
              <p className="text-muted-foreground/60 text-[10px] border-t border-border/30 pt-2">
                {record.dataQuality.qualityNarrative}
              </p>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
