import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";
  import { Callout } from "@/components/ui/callout";
  import { IconIncomeStatement } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section07FinancialStatements({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="financial-statements"
        title="7. Financial Statements"
        icon={IconIncomeStatement}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <ManualTable
          headers={["Statement", "Entity", "Key Line Items", "GAAP Reference"]}
          rows={[
            ["Income Statement", "Property", "Revenue, Expenses, GOP, NOI, Net Income", "ASC 606"],
            ["Balance Sheet", "Property", "Assets, Liabilities, Equity", "ASC 360"],
            ["Cash Flow", "Property", "CFO, CFI, CFF, Net Change", "ASC 230"],
            ["Income Statement", "Company", "Fee Revenue, OpEx, Net Income", "—"],
            ["Cash Flow", "Company", "Net Income, Funding", "—"],
            ["Consolidated IS", "Portfolio", "Sum across all properties", "ASC 810"],
            ["Consolidated CF", "Portfolio", "Aggregated cash flows", "ASC 810"],
            ["Investment Analysis", "Both", "FCF, FCFE, IRR, MOIC", "—"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-6 mb-2">Calculation Transparency</h3>
        <p className="text-muted-foreground text-sm mb-2">Two on/off toggles in Settings {">"} Other tab control the visibility of formula details across all financial reports. One toggle controls Management Company reports, the other controls all Property reports. Default: ON.</p>
        <ManualTable
          headers={["Toggle", "Scope", "Default", "Controls"]}
          rows={[
            ["Management Company Reports", "Company income statement & cash flow", "ON", "Expandable formula rows + help icons on the Company page"],
            ["Property Reports", "All property income statements, cash flows & balance sheets", "ON", "Expandable formula rows + help icons on every property page"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Expandable Formula Rows</h3>
        <p className="text-muted-foreground text-sm mb-2">When Calculation Transparency is ON, line items in financial tables show a chevron. Click to expand and reveal step-by-step calculation breakdowns.</p>
        <ManualTable
          headers={["Component", "Purpose", "Behavior"]}
          rows={[
            ["Chevron (▸)", "Indicates an expandable row", "Click to toggle formula details"],
            ["Formula Detail Row", "Shows base value × rate × escalation × 12", "Appears below the parent line item"],
            ["Help Icon (?)", "Tooltip explaining the line item", "Hover to see definition; may include link to this manual"],
          ]}
        />
        <Callout>When Calculation Transparency is OFF, financial tables display clean numbers only — no chevrons, no formula rows, no help icons. Ideal for investor presentations. The export dialog has a separate checkbox to include formula details in exported files.</Callout>
      </SectionCard>
    );
  }
  