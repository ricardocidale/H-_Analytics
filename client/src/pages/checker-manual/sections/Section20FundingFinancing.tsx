import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";

  import { IconCashFlow } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section20FundingFinancing({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="funding-financing"
        title="20. Funding, Financing & Refinancing"
        icon={IconCashFlow}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <ManualTable
          headers={["Ref ID", "Name", "Formula / Logic"]}
          rows={[
            ["F-F-01", "Loan Amount", "purchasePrice × LTV"],
            ["F-F-02", "Closing Costs", "loanAmount × closingCostRate"],
            ["F-F-03", "Total Project Cost", "purchasePrice + improvements + preOpening + reserve + closingCosts"],
            ["F-F-04", "Monthly Payment (PMT)", "P × [r(1+r)^n / ((1+r)^n − 1)]"],
            ["F-F-05", "Principal Component", "PMT − (balance × r)"],
            ["F-F-06", "New Refi Loan", "propertyValueAtRefi × refiLTV"],
            ["F-F-07", "Net Refi proceeds", "newLoan − existingBalance − refiClosingCosts"],
            ["F-F-08", "Funding Conversion", "investment / min(valuationCap, conversionValuation) — applies when valuation cap is configured"],
            ["F-F-09", "Equity Required", "totalProjectCost − loanAmount"],
            ["F-F-10", "Tranche Funding", "Fixed disbursement on configured date (gates operations)"],
          ]}
        />
      </SectionCard>
    );
  }
  