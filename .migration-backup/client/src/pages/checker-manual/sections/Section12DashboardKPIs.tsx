import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";

  import { IconDashboard } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section12DashboardKPIs({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="dashboard-kpis"
        title="12. Dashboard & KPIs"
        icon={IconDashboard}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <ManualTable
          headers={["KPI", "Source", "Formula Reference"]}
          rows={[
            ["Total Portfolio Revenue", "Σ property revenue", "F-X-01"],
            ["Gross Operating Profit", "Σ property GOP", "F-X-03"],
            ["Adjusted NOI (ANOI)", "Σ property ANOI", "F-X-04"],
            ["Portfolio Cash", "Σ property ending cash", "F-X-06"],
          ]}
        />
        <p className="text-muted-foreground text-sm mt-3">Tabs: Overview, Income Statement, Cash Flow, Balance Sheet, Investment Analysis. Each tab shows aggregated yearly data computed from generatePropertyProForma + aggregation.</p>
      </SectionCard>
    );
  }
  