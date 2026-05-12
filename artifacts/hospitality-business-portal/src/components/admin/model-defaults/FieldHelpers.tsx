import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import EditableValue from "@/components/company-assumptions/EditableValue";
export { ResearchRangeLabel } from "@/components/ui/research-range-label";
import { ResearchRangeLabel } from "@/components/ui/research-range-label";
import { RangeIndicator } from "@/components/research/RangeIndicator";
import { useAssumptionGuardrail } from "@/hooks/useAssumptionGuardrail";

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Parse a display range string like "6%–10%" or "5%–9%" to extract the
 * midpoint value in display units (percentage points, not fractions).
 * Returns null when the string cannot be parsed.
 */
function parseMidFromRange(display: string): number | null {
  const nums = display.replace(/[$%,]/g, "").match(/[\d.]+/g);
  if (!nums || nums.length < 2) return null;
  const low = parseFloat(nums[0]);
  const high = parseFloat(nums[1]);
  if (isNaN(low) || isNaN(high)) return null;
  return (low + high) / 2;
}

export function PctField({ label, tooltip, value, fallback, onChange, min, max, step, sliderMax, testId, researchRange, guardrailKey }: {
  label: string;
  tooltip: string;
  value: number | null | undefined;
  fallback: number;
  onChange: (field: string, v: number) => void;
  min: number;
  max: number;
  step: number;
  sliderMax?: number;
  testId: string;
  researchRange?: string;
  guardrailKey?: string;
}) {
  const current = value ?? fallback;
  const guardrail = useAssumptionGuardrail(guardrailKey ?? null);

  const rangeEntry =
    researchRange && guardrail
      ? (() => {
          const mid = parseMidFromRange(researchRange);
          if (mid === null) return null;
          return { display: researchRange, mid };
        })()
      : null;

  return (
    <div className="flex flex-col" data-testid={testId}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <Label className="flex items-center flex-wrap gap-1 text-foreground label-text min-w-0">
          {label}
          <InfoTooltip text={tooltip} />
          {researchRange && !rangeEntry && <ResearchRangeLabel text={researchRange} />}
          {rangeEntry && (
            <RangeIndicator
              currentValue={current}
              entry={rangeEntry}
              isPercent
              guardrail={guardrail}
            />
          )}
        </Label>
        <EditableValue
          value={current}
          onChange={(v) => onChange(testId.replace("field-", ""), v)}
          format="percent"
          min={min}
          max={max}
          step={step}
        />
      </div>
      <div className="mt-auto pt-2">
        <Slider
          value={[current * 100]}
          onValueChange={([v]) => onChange(testId.replace("field-", ""), v / 100)}
          min={min * 100}
          max={(sliderMax ?? max) * 100}
          step={step * 100}
        />
      </div>
    </div>
  );
}

export function DollarField({ label, tooltip, value, fallback, onChange, min, max, step, testId, researchRange }: {
  label: string;
  tooltip: string;
  value: number | null | undefined;
  fallback: number;
  onChange: (field: string, v: number) => void;
  min: number;
  max: number;
  step: number;
  testId: string;
  researchRange?: string;
}) {
  const current = value ?? fallback;
  return (
    <div className="flex flex-col" data-testid={testId}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <Label className="flex items-center flex-wrap gap-1 text-foreground label-text min-w-0">
          {label}
          <InfoTooltip text={tooltip} />
          {researchRange && <ResearchRangeLabel text={researchRange} />}
        </Label>
        <EditableValue
          value={current}
          onChange={(v) => onChange(testId.replace("field-", ""), v)}
          format="dollar"
          min={min}
          max={max}
          step={step}
        />
      </div>
      <div className="mt-auto pt-2">
        <Slider
          value={[current]}
          onValueChange={([v]) => onChange(testId.replace("field-", ""), v)}
          min={min}
          max={max}
          step={step}
        />
      </div>
    </div>
  );
}

export function NumberField({ label, tooltip, value, fallback, onChange, min, max, step, testId, researchRange }: {
  label: string;
  tooltip: string;
  value: number | null | undefined;
  fallback: number;
  onChange: (field: string, v: number) => void;
  min: number;
  max: number;
  step: number;
  testId: string;
  researchRange?: string;
}) {
  const current = value ?? fallback;
  return (
    <div className="flex flex-col" data-testid={testId}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <Label className="flex items-center flex-wrap gap-1 text-foreground label-text min-w-0">
          {label}
          <InfoTooltip text={tooltip} />
          {researchRange && <ResearchRangeLabel text={researchRange} />}
        </Label>
        <EditableValue
          value={current}
          onChange={(v) => onChange(testId.replace("field-", ""), v)}
          format="number"
          min={min}
          max={max}
          step={step}
        />
      </div>
      <div className="mt-auto pt-2">
        <Slider
          value={[current]}
          onValueChange={([v]) => onChange(testId.replace("field-", ""), v)}
          min={min}
          max={max}
          step={step}
        />
      </div>
    </div>
  );
}

export function TabBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export type Draft = Record<string, any>;
