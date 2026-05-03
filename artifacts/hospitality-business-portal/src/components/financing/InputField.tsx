import { InfoTooltip } from "@/components/ui/info-tooltip";

export function formatPct(val: number | null | undefined, decimals = 2): string {
  if (val == null) return "N/A";
  return `${(val * 100).toFixed(decimals)}%`;
}

export function formatRatio(val: number | null | undefined, decimals = 2): string {
  if (val == null) return "N/A";
  return `${val.toFixed(decimals)}x`;
}

export function InputField({
  label,
  value,
  onChange,
  type = "number",
  step,
  min,
  max,
  suffix,
  prefix,
  helpText,
  "data-testid": testId,
}: {
  label: string;
  value: string | number;
  onChange: (val: string) => void;
  type?: string;
  step?: string;
  min?: string;
  max?: string;
  suffix?: string;
  prefix?: string;
  helpText?: string;
  "data-testid"?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground flex items-center">
        {label}
        {helpText && <InfoTooltip text={helpText} />}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          step={step}
          min={min}
          max={max}
          data-testid={testId}
          className={`w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-gray-300 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 ${prefix ? "pl-7" : ""} ${suffix ? "pr-10" : ""}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
