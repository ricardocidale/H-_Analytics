import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";

  import { IconProperties } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section03PropertyPortfolio({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="property-portfolio"
        title="3. Property Portfolio (SPVs)"
        icon={IconProperties}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <p className="text-muted-foreground text-sm">Each property is an independent SPV with its own financials. Investor returns come from: FCF distributions, refinancing proceeds, and exit proceeds.</p>
        <p className="text-muted-foreground text-sm mt-2">View the current property portfolio in the <strong className="text-foreground/80">Properties</strong> page. Each property card shows its name, location, room count, ADR, financing type, and lifecycle status.</p>
        <ManualTable
          headers={["Field", "Description", "Where to Find"]}
          rows={[
            ["Name / Location", "Property identity and geographic market", "Property card header"],
            ["Room Count", "Number of guest rooms (drives revenue)", "Property details"],
            ["Starting ADR", "Initial Average Daily Rate", "Property assumptions"],
            ["Financing Type", "Full Equity or Financed (debt + equity)", "Property assumptions"],
            ["Status", "Lifecycle stage: Acquisition, Development, Operating", "Property card"],
          ]}
        />
      </SectionCard>
    );
  }
  