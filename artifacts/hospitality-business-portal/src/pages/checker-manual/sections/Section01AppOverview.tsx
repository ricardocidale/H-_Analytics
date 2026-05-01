import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";

  import { IconHelp } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section01AppOverview({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="app-overview"
        title="1. Application Overview"
        icon={IconHelp}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <p className="text-muted-foreground text-sm">Two-entity architecture — Management Company (service co) + Property SPVs. All calculations client-side, no hardcoded values, configurable assumptions with centralized constants as fallbacks.</p>
        <ManualTable
          headers={["Navigation Section", "Purpose", "Route"]}
          rows={[
            ["Dashboard", "Portfolio overview with KPI cards and consolidated financials", "/"],
            ["Properties", "Individual property SPV details and financials", "/portfolio"],
            ["Management Company", "Management company financials and assumptions", "/company"],
            ["Property Finder", "Search and save prospective properties", "/property-finder"],
            ["Sensitivity Analysis", "Variable sensitivity testing", "/sensitivity"],
            ["Financing Analysis", "Debt and equity analysis tools", "/financing"],
            ["Systemwide Assumptions", "Model-wide configurable parameters", "/company/assumptions"],
            ["My Profile", "Account management", "/profile"],
            ["My Scenarios", "Save/load assumption snapshots", "/scenarios"],
            ["Admin Settings", "User management, verification, design checks", "/admin"],
            ["Help", "User Manual, Checker Manual, and Guided Tour", "/help"],
          ]}
        />
      </SectionCard>
    );
  }
  