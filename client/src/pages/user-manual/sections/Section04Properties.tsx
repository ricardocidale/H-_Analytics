import { SectionCard } from "@/components/ui/section-card";
import { Callout } from "@/components/ui/callout";
import { IconProperties } from "@/components/icons";interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section04Properties({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="properties"
      title="4. Properties"
      icon={IconProperties}
      variant="light"
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <p className="text-sm text-muted-foreground">
        The Properties page lists all hotel properties in the portfolio. Each property is modeled as an independent
        Special Purpose Vehicle (SPV) with its own financial statements.
      </p>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Adding a Property</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li>Click the <strong>"Add Property"</strong> button on the Properties page.</li>
          <li>Fill in the property details: name, location, room count, purchase price, and operating assumptions.</li>
          <li>Click <strong>"Save"</strong> to create the property. All financial projections are calculated immediately.</li>
        </ul>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Editing a Property</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li>Click on a property card to open its detail page, then click <strong>"Edit"</strong>.</li>
          <li>Modify any assumptions — ADR, occupancy, expense rates, financing terms, etc.</li>
          <li>When you click <strong>"Save"</strong>, the entire portfolio is recalculated to reflect your changes.</li>
        </ul>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Deleting a Property</h4>
        <p className="text-sm text-muted-foreground">
          On the property edit page, scroll to the bottom and click <strong>"Delete Property"</strong>.
          This permanently removes the property and all its financial data. The portfolio recalculates automatically.
        </p>
      </div>

      <Callout variant="light">
        When editing assumptions, look for blue badges (GAAP/IRS rules) and benchmark range labels (AI-researched market ranges with a light yellow background) next to field labels.
        Hover blue badges to see the accounting standard. Click any benchmark label to auto-fill market-recommended values.
      </Callout>
    </SectionCard>
  );
}
