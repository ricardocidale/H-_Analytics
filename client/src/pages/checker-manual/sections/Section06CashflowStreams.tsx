import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";

  import { IconCashFlow } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section06CashflowStreams({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="cashflow-streams"
        title="6. Cash Flow Streams"
        icon={IconCashFlow}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <p className="text-muted-foreground text-sm">Each property SPV generates multiple interacting cash flow streams that must reconcile across Income Statement, Balance Sheet, and Cash Flow Statement.</p>
        <ManualTable
          headers={["Stream", "When", "Formula Reference", "Impact"]}
          rows={[
            ["A. Equity Injection", "Year 0 (acquisition)", "F-F-09", "CFF — Total Cost minus Loan Amount"],
            ["B. Acquisition Financing", "Year 0 proceeds; monthly service", "F-F-01 to F-F-07", "CFF (proceeds & principal); IS (interest)"],
            ["C. Post-Stabilization Refinancing", "After stabilization period", "F-F-10 to F-F-14", "CFF (net proceeds); IS (new interest)"],
            ["D. Exit / Disposition", "Terminal year", "F-R-05, F-R-06", "CFI — NOI / Cap Rate, net of commission and debt"],
            ["E. Management Fee Linkage", "Monthly", "F-C-01, F-C-02", "Dual-entry: property expense ↔ company revenue"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Mandatory Business Rules</h3>
        <ManualTable
          headers={["Rule #", "Name", "Description"]}
          rows={[
            ["BR-1", "Funding Gate", "Capital Raise 1 must be received before Management Company can begin operations"],
            ["BR-2", "Fee Linkage", "Management fees appear as expense on Property IS and revenue on Company IS — must net to zero in consolidated view"],
            ["BR-3", "Stabilization Prerequisite", "Refinancing cannot occur until property reaches stabilized occupancy"],
            ["BR-4", "Balance Sheet Identity", "Assets = Liabilities + Equity must hold every period for every property"],
            ["BR-5", "Cash Reconciliation", "Beginning Cash + Net Change = Ending Cash must hold every period"],
          ]}
        />
      </SectionCard>
    );
  }
  