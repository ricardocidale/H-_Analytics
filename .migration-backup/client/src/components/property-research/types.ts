/**
 * property-research/types.ts
 *
 * Shared types and color palettes for the property-level AI research view.
 *
 * SectionColorScheme defines the Tailwind classes and hex accents used to
 * visually distinguish each research category (market overview, ADR comps,
 * occupancy, events, cap rates, competitive landscape, risks, etc.).
 *
 * sectionColors is the concrete mapping: each key (e.g. "market", "adr",
 * "capRate") maps to a color scheme object. These same keys are used by the
 * company-research module so both property and company research share the
 * same SectionColorScheme interface.
 */
export interface SectionColorScheme {
  accent: string;
  bg: string;
  border: string;
  iconBg: string;
  iconText: string;
  badge: string;
}

export const sectionColors: Record<string, SectionColorScheme> = {
  market: { accent: "hsl(var(--primary))", bg: "bg-primary/10", border: "border-primary/20", iconBg: "bg-primary/15", iconText: "text-primary", badge: "bg-primary/15 text-primary" },
  adr: { accent: "hsl(var(--chart-1))", bg: "bg-chart-1/10", border: "border-chart-1/20", iconBg: "bg-chart-1/15", iconText: "text-chart-1", badge: "bg-chart-1/15 text-chart-1" },
  occupancy: { accent: "hsl(var(--chart-3))", bg: "bg-chart-3/10", border: "border-chart-3/20", iconBg: "bg-chart-3/15", iconText: "text-chart-3", badge: "bg-chart-3/15 text-chart-3" },
  events: { accent: "hsl(var(--accent-pop))", bg: "bg-accent-pop/10", border: "border-accent-pop/20", iconBg: "bg-accent-pop/15", iconText: "text-accent-pop", badge: "bg-accent-pop/15 text-accent-pop" },
  capRate: { accent: "hsl(var(--accent-pop-2))", bg: "bg-accent-pop-2/10", border: "border-accent-pop-2/20", iconBg: "bg-accent-pop-2/15", iconText: "text-accent-pop-2", badge: "bg-accent-pop-2/15 text-accent-pop-2" },
  competitive: { accent: "var(--primary)", bg: "bg-primary/5", border: "border-primary/30", iconBg: "bg-primary/20", iconText: "text-secondary", badge: "bg-primary/20 text-secondary" },
  risks: { accent: "hsl(var(--destructive))", bg: "bg-destructive/10", border: "border-destructive/20", iconBg: "bg-destructive/15", iconText: "text-destructive", badge: "bg-destructive/15 text-destructive" },
  sources: { accent: "hsl(var(--muted-foreground))", bg: "bg-muted", border: "border-border", iconBg: "bg-muted", iconText: "text-muted-foreground", badge: "bg-muted text-foreground" },
  stabilization: { accent: "hsl(var(--accent-pop))", bg: "bg-accent-pop/10", border: "border-accent-pop/20", iconBg: "bg-accent-pop/15", iconText: "text-accent-pop", badge: "bg-accent-pop/15 text-accent-pop" },
  landValue: { accent: "hsl(var(--muted-foreground))", bg: "bg-muted", border: "border-border", iconBg: "bg-muted", iconText: "text-muted-foreground", badge: "bg-muted text-foreground" },
  catering: { accent: "hsl(var(--chart-3))", bg: "bg-chart-3/10", border: "border-chart-3/20", iconBg: "bg-chart-3/15", iconText: "text-chart-3", badge: "bg-chart-3/15 text-chart-3" },
  operatingCosts: { accent: "hsl(var(--line-3))", bg: "bg-line-3/10", border: "border-line-3/20", iconBg: "bg-line-3/15", iconText: "text-line-3", badge: "bg-line-3/15 text-line-3" },
  propertyValueCosts: { accent: "hsl(var(--muted-foreground))", bg: "bg-muted", border: "border-border", iconBg: "bg-muted", iconText: "text-muted-foreground", badge: "bg-muted text-foreground" },
  managementFees: { accent: "hsl(var(--accent-pop-2))", bg: "bg-accent-pop-2/10", border: "border-accent-pop-2/20", iconBg: "bg-accent-pop-2/15", iconText: "text-accent-pop-2", badge: "bg-accent-pop-2/15 text-accent-pop-2" },
  incomeTax: { accent: "hsl(var(--destructive))", bg: "bg-destructive/10", border: "border-destructive/20", iconBg: "bg-destructive/15", iconText: "text-destructive", badge: "bg-destructive/15 text-destructive" },
};
