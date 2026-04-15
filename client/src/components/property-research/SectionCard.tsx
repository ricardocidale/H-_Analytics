/**
 * SectionCard.tsx — Reusable card wrapper for a research category section.
 *
 * Renders a collapsible card with an icon, title, and accent-colored border
 * based on the SectionColorScheme (see types.ts). Used by ResearchSections
 * to wrap each AI-generated research category (market overview, ADR comps,
 * occupancy benchmarks, risk factors, etc.).
 *
 * Children are rendered inside the card body, typically as a mix of
 * narrative paragraphs and MetricCard KPI badges.
 */
import type { SectionColorScheme } from "./types";

export function SectionCard({ icon: Icon, title, color, children }: { icon: any; title: string; color: SectionColorScheme; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border" style={{ borderLeftWidth: 4, borderLeftColor: color.accent }}>
        <div className={`w-9 h-9 rounded-lg ${color.iconBg} flex items-center justify-center`}>
          <Icon className={`w-[18px] h-[18px] ${color.iconText}`} />
        </div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-6">
        {children}
        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-end">
          <span className="text-[10px] tracking-wide text-muted-foreground/40 uppercase" data-testid="badge-norfolk-ai">Powered by Norfolk AI</span>
        </div>
      </div>
    </div>
  );
}
