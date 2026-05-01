/**
 * MetricCard.tsx — Small KPI badge for a single research metric.
 *
 * Renders a compact pill showing a label and value (e.g. "Avg ADR: $185")
 * inside a SectionCard. The background and text colors are derived from
 * the parent section's SectionColorScheme so metrics visually belong to
 * their category.
 */
import type { SectionColorScheme } from "./types";
import { ConfidenceBadge } from "./ConfidenceBadge";

export function MetricCard({ label, value, source, color, confidence }: { label: string; value: string; source?: string; color: SectionColorScheme; confidence?: string }) {
  return (
    <div className={`rounded-xl p-4 border ${color.border} ${color.bg}`}>
      <p className="text-xs font-medium uppercase tracking-wider mb-1.5 text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-base font-semibold text-foreground">{value}</p>
        <ConfidenceBadge confidence={confidence} />
      </div>
      {source && <p className="text-[11px] text-muted-foreground mt-1.5 leading-tight">{source}</p>}
    </div>
  );
}
