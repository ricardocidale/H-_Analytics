import { SectionCard } from "@/components/ui/section-card";
import { ManualTable } from "@/components/ui/manual-table";
import { IconExport } from "@/components/icons";interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section12Exports({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="exports"
      title="12. Exports & Reports"
      icon={IconExport}
      variant="light"
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <p className="text-sm text-muted-foreground">
        The portal supports multiple export formats for sharing financial data with investors, lenders, and advisors.
      </p>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Available Formats</h4>
        <ManualTable
          variant="light"
          headers={["Format", "Best For"]}
          rows={[
            ["Excel (.xlsx)", "Detailed financial analysis — all statements, monthly data, formulas. Best for accountants and analysts"],
            ["PDF", "Polished presentation-ready reports with branded headers and charts"],
            ["PowerPoint (.pptx)", "Investor pitch decks with portfolio overview slides"],
            ["CSV", "Raw data export for custom analysis in any spreadsheet tool"],
          ]}
        />
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Export Types</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li><strong>Property-level exports</strong> — available on each property detail page.</li>
          <li><strong>Portfolio-level exports</strong> — available on the Dashboard for consolidated reports.</li>
          <li><strong>Executive Summary</strong> — a one-page overview combining key metrics from all properties.</li>
        </ul>
      </div>
    </SectionCard>
  );
}
