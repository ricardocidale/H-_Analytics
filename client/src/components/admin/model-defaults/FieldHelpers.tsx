import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import EditableValue from "@/components/company-assumptions/EditableValue";

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function Section({ title, description, children, grid }: { title: string; description?: string; children: React.ReactNode; grid?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm h-full">
      <div className="relative h-full">
        <div className="space-y-6 h-full">
          <div>
            <h3 className="text-lg font-display text-foreground flex items-center gap-2">{title}</h3>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
          {grid ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-x-6 gap-y-4">
              {children}
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}

export function ResearchRangeLabel({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <span className="text-xs font-medium rounded-md px-1.5 py-0.5 text-accent-pop bg-accent-pop/10 border border-accent-pop/20 whitespace-nowrap">
      {text}
    </span>
  );
}

export function PctField({ label, tooltip, value, fallback, onChange, min, max, step, sliderMax, testId, researchRange }: {
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
}) {
  const current = value ?? fallback;
  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex items-center justify-between">
        <Label className="flex items-center flex-wrap gap-1 text-foreground label-text min-w-0">
          {label}
          <InfoTooltip text={tooltip} />
          {researchRange && <ResearchRangeLabel text={researchRange} />}
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
      <Slider
        value={[current * 100]}
        onValueChange={([v]) => onChange(testId.replace("field-", ""), v / 100)}
        min={min * 100}
        max={(sliderMax ?? max) * 100}
        step={step * 100}
      />
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
    <div className="space-y-3" data-testid={testId}>
      <div className="flex items-center justify-between">
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
      <Slider
        value={[current]}
        onValueChange={([v]) => onChange(testId.replace("field-", ""), v)}
        min={min}
        max={max}
        step={step}
      />
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
    <div className="space-y-3" data-testid={testId}>
      <div className="flex items-center justify-between">
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
      <Slider
        value={[current]}
        onValueChange={([v]) => onChange(testId.replace("field-", ""), v)}
        min={min}
        max={max}
        step={step}
      />
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
