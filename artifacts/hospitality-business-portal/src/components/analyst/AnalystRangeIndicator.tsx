import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  meetsConvictionFloor,
  insufficientDataMessage,
  type DataQualitySummary,
} from "@shared/analyst-conviction";
import { ANALYST_BRAND } from "@/lib/agent-taxonomy";
import { useAssumptionGuardrail } from "@/hooks/useAssumptionGuardrail";
import { classifyRangeQuality, isOutOfRange } from "@engine/analyst/minions/fabio";

interface GuidanceRecord {
  assumptionKey: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
  confidence: string | null;
  reasoning: string | null;
  sourceName: string | null;
  dataQuality?: DataQualitySummary | null;
}

interface AnalystRangeIndicatorProps {
  fieldKey: string;
  currentValue: number | undefined | null;
  guidance: GuidanceRecord[] | undefined;
  isPercent?: boolean;
  isCurrency?: boolean;
  /**
   * Explicit guardrail key for the Fabio range-quality dot. When provided,
   * overrides `fieldKey` for the guardrail lookup — use when the Analyst
   * `fieldKey` (e.g. "exitRevenueMultiple") differs from the canonical key
   * in `assumption_guardrails`. When omitted, the hook falls back to
   * `fieldKey`. If neither resolves to a row, the dot is suppressed.
   */
  guardrailKey?: string;
}

function formatRangeValue(val: number, isPercent: boolean, isCurrency: boolean): string {
  if (isPercent) return `${(val * 100).toFixed(1)}%`;
  if (isCurrency) return `$${val.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return val.toFixed(1);
}

const DOT_COLORS = {
  green: "bg-green-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  grey: "bg-muted-foreground/30",
} as const;

export function AnalystRangeIndicator({ fieldKey, currentValue, guidance, isPercent = false, isCurrency = false, guardrailKey }: AnalystRangeIndicatorProps) {
  const resolvedGuardrailKey = guardrailKey ?? fieldKey;
  const guardrail = useAssumptionGuardrail(resolvedGuardrailKey);

  if (!guidance || guidance.length === 0) return null;

  const record = guidance.find(g => g.assumptionKey === fieldKey);
  if (!record || record.valueLow == null || record.valueHigh == null) return null;

  // Conviction floor: if quality is too low, withhold range and prompt for research
  if (record.dataQuality && !meetsConvictionFloor(record.dataQuality)) {
    const message = insufficientDataMessage(fieldKey, record.dataQuality);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid={`analyst-insufficient-${fieldKey}`}
            className="inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 cursor-help bg-amber-500/10 text-amber-700 dark:text-amber-400"
          >
            <svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a1 1 0 011 1v3a1 1 0 11-2 0V5a1 1 0 011-1zm0 8a1 1 0 100 2 1 1 0 000-2z" /></svg>
            Insufficient data — needs research
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-semibold mb-1">{ANALYST_BRAND} is withholding advice</p>
          <p className="text-muted-foreground">{message}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const low = record.valueLow;
  const high = record.valueHigh;
  const mid = record.valueMid ?? (low + high) / 2;
  const hasValue = currentValue != null && Number.isFinite(currentValue);
  const isWithin = hasValue && currentValue >= low && currentValue <= high;
  const verdict = !hasValue ? "no_value" : isWithin ? "within" : currentValue < low ? "below" : "above";

  const rangeStr = `${formatRangeValue(low, isPercent, isCurrency)}–${formatRangeValue(high, isPercent, isCurrency)}`;
  const confidenceLabel = record.confidence === "high" ? "High" : record.confidence === "moderate" ? "Moderate" : "Low";

  const dotColor = guardrail ? classifyRangeQuality(mid, guardrail) : "grey";
  const outOfRange = isOutOfRange(currentValue, guardrail);

  return (
    <span className="inline-flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid={`analyst-range-${fieldKey}`}
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 cursor-help transition-colors",
              verdict === "within" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
              verdict === "above" && "bg-red-500/10 text-red-600 dark:text-red-400",
              verdict === "below" && "bg-red-500/10 text-red-600 dark:text-red-400",
              verdict === "no_value" && "bg-gray-500/10 text-gray-500",
            )}
          >
            {verdict === "within" ? (
              <svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" /></svg>
            ) : verdict !== "no_value" ? (
              <svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 11a1 1 0 100 2 1 1 0 000-2z" /></svg>
            ) : null}
            {rangeStr}
            {guardrail && dotColor !== "grey" && (
              <span
                data-testid={`fabio-dot-${fieldKey}`}
                className={cn("h-[5px] w-[5px] rounded-full shrink-0", DOT_COLORS[dotColor])}
                title={`Range quality: ${dotColor}`}
              />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-semibold mb-1">{ANALYST_BRAND} suggests {rangeStr}</p>
          <p className="text-muted-foreground">Confidence: {confidenceLabel}</p>
          {record.sourceName && <p className="text-muted-foreground">Source: {record.sourceName}</p>}
          {record.reasoning && <p className="mt-1 text-muted-foreground">{record.reasoning}</p>}
        </TooltipContent>
      </Tooltip>

      {outOfRange && (
        <span
          data-testid={`out-of-range-${fieldKey}`}
          className="inline-flex items-center gap-0.5 text-[10px] font-medium rounded px-1.5 py-0.5 bg-red-500/10 text-red-600 dark:text-red-400"
        >
          <svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 11a1 1 0 100 2 1 1 0 000-2z" /></svg>
          out of range
        </span>
      )}
    </span>
  );
}
