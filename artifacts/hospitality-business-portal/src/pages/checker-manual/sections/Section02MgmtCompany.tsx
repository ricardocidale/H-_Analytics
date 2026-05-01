import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";
  import { Callout } from "@/components/ui/callout";
  import { IconBriefcase } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section02MgmtCompany({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="mgmt-company"
        title="2. Management Company"
        icon={IconBriefcase}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <p className="text-muted-foreground text-sm">Service company, NOT a property owner. Revenue: Base Fee (% of Total Revenue) + Incentive Fee (% of GOP). Funded via capital notes (Capital Raise 1 gates operations — Business Rule #1). Uses company inflation rate if set, otherwise global default.</p>
        <ManualTable
          headers={["Expense Category", "Calculation", "Escalation"]}
          rows={[
            ["Partner Compensation", "partnerCompYearN × partnerCount / 12", "Per-year schedule"],
            ["Staff Compensation", "headcountYearN × avgStaffSalary / 12", "Per-year schedule"],
            ["Office Lease", "Annual / 12 × (1 + inflation)^year", "Fixed cost / Company inflation"],
            ["Professional Services", "Annual / 12 × (1 + inflation)^year", "Fixed cost / Company inflation"],
            ["Tech Infrastructure", "Annual / 12 × (1 + inflation)^year", "Fixed cost / Company inflation"],
            ["Travel", "Properties × cost/client / 12 × (1 + inflation)^year", "Company inflation"],
            ["IT Licensing", "Properties × cost/client / 12 × (1 + inflation)^year", "Company inflation"],
            ["Marketing", "Portfolio Revenue × rate × (1 + inflation)^year", "Company inflation"],
            ["Misc Operations", "Portfolio Revenue × rate × (1 + inflation)^year", "Company inflation"],
          ]}
        />
        <Callout>Management fees appear as REVENUE for the Management Company and as EXPENSES for each Property SPV.</Callout>
      </SectionCard>
    );
  }
  