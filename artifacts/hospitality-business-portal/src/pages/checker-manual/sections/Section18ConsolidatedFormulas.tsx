import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";
  import { Callout } from "@/components/ui/callout";
  import { IconAnalysis } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section18ConsolidatedFormulas({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="consolidated-formulas"
        title="18. Consolidated Portfolio Formulas"
        icon={IconAnalysis}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <ManualTable
          headers={["Ref ID", "Name", "Formula / Logic"]}
          rows={[
            ["F-X-01", "Consolidated Revenue", "Σ propertyTotalRevenue (Company fees eliminated)"],
            ["F-X-02", "Consolidated Expenses", "Σ propertyExpenses (Company fees eliminated) + Company OpEx"],
            ["F-X-03", "Consolidated GOP", "Σ propertyGOP"],
            ["F-X-04", "Consolidated NOI", "Σ propertyNOI + companyFees (Internal transfer elimination)"],
            ["F-X-05", "Elimination Entry", "Property Mgmt Fee Expense + Company Fee Revenue = 0"],
            ["F-X-06", "Ending Portfolio Cash", "Σ propertyEndingCash + companyEndingCash"],
          ]}
        />
        <Callout>Consolidation requires ELIMINATION of internal management fees to avoid double-counting revenue and expenses at the portfolio level.</Callout>
      </SectionCard>
    );
  }
  