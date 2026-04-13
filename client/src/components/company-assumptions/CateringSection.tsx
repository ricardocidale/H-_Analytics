/**
 * CateringSection.tsx — Placeholder section for catering / F&B revenue config.
 *
 * Currently renders a "coming soon" placeholder. When implemented, this section
 * will let users configure company-level defaults for catering and event
 * revenue assumptions — the percentage of F&B revenue attributed to
 * weddings, corporate events, and banquets, which can significantly boost
 * a property's ancillary income (especially for resorts and boutique venues).
 */
export default function CateringSection() {
  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
      <div className="relative">
      <div className="space-y-4">
        <h3 className="text-lg font-display text-foreground flex items-center gap-2">
          Catering Revenue Model
        </h3>
        <p className="text-sm text-muted-foreground">
          Catering boost is deprecated. F&B share now directly represents the target percentage of total revenue. Revenue shares are configured per property on the Property Assumptions page. There are no systemwide catering assumptions.
        </p>
        <div className="p-3 bg-primary/10 rounded-lg text-sm text-foreground">
          <p className="font-medium mb-1">Formula:</p>
          <p>Total F&B Revenue = Total Revenue × F&B Share (catering boost is deprecated — F&B share directly represents target mix)</p>
        </div>
      </div>
    </div></div>
  );
}
