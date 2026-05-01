/**
 * company-research/types.ts
 *
 * Color palette for company-level AI research section cards.
 * Re-uses the SectionColorScheme interface from property-research/types.ts
 * but defines its own color mapping keyed by company research categories:
 *   • feeStructure  – management fee benchmarks
 *   • gaap          – accounting standards
 *   • opex          – operating expense ratios
 *   • compensation  – salary benchmarks
 *   • contracts     – management agreement terms
 *   • sources       – citation references
 */
import type { SectionColorScheme } from "../property-research/types";

export type { SectionColorScheme };

export const companySectionColors: Record<string, SectionColorScheme> = {
  fees: { accent: "hsl(var(--primary))", bg: "bg-primary/10", border: "border-primary/20", iconBg: "bg-primary/15", iconText: "text-primary", badge: "bg-primary/15 text-primary" },
  gaap: { accent: "hsl(var(--chart-1))", bg: "bg-chart-1/10", border: "border-chart-1/20", iconBg: "bg-chart-1/15", iconText: "text-chart-1", badge: "bg-chart-1/15 text-chart-1" },
  benchmarks: { accent: "hsl(var(--chart-3))", bg: "bg-chart-3/10", border: "border-chart-3/20", iconBg: "bg-chart-3/15", iconText: "text-chart-3", badge: "bg-chart-3/15 text-chart-3" },
  compensation: { accent: "hsl(var(--accent-pop))", bg: "bg-accent-pop/10", border: "border-accent-pop/20", iconBg: "bg-accent-pop/15", iconText: "text-accent-pop", badge: "bg-accent-pop/15 text-accent-pop" },
  contracts: { accent: "hsl(var(--accent-pop-2))", bg: "bg-accent-pop-2/10", border: "border-accent-pop-2/20", iconBg: "bg-accent-pop-2/15", iconText: "text-accent-pop-2", badge: "bg-accent-pop-2/15 text-accent-pop-2" },
  sources: { accent: "hsl(var(--muted-foreground))", bg: "bg-muted", border: "border-border", iconBg: "bg-muted", iconText: "text-muted-foreground", badge: "bg-muted text-foreground" },
};
