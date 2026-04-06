import { SectionCard } from "@/components/ui/section-card";
import { ManualTable } from "@/components/ui/manual-table";
import { Callout } from "@/components/ui/callout";
import { IconAnalysis } from "@/components/icons";interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section10Analysis({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="analysis"
      title="10. Analysis Tools"
      icon={IconAnalysis}
      variant="light"
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <p className="text-sm text-muted-foreground">
        The Simulation and Analysis page provides four specialized modeling tools for testing assumptions,
        comparing properties, visualizing investment timelines, and sizing debt. Each tool is accessible via
        its own tab and animates smoothly between views.
      </p>

      {/* Sensitivity Tab */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Sensitivity Analysis</h4>
        <p className="text-sm text-muted-foreground mb-3">
          Tests how changing one variable at a time affects portfolio returns. Use the sliders to adjust
          each assumption and instantly see the impact on IRR, ANOI, and exit value.
        </p>
        <ManualTable
          variant="light"
          headers={["Slider", "Range", "What It Adjusts"]}
          rows={[
            ["Occupancy", "−20% to +20%", "Adjusts maximum occupancy rate for the selected property or portfolio"],
            ["ADR Growth Rate", "−5% to +5%", "Annual growth rate applied to the Average Daily Rate"],
            ["Expense Escalation", "−3% to +5%", "Annual escalation rate on fixed operating costs"],
            ["Exit Cap Rate", "−3% to +3%", "Cap rate used to compute the exit (sale) valuation"],
            ["Inflation Rate", "−3% to +5%", "General inflation rate affecting variable costs"],
            ["Interest Rate", "−3% to +5%", "Debt financing interest rate adjustment"],
          ]}
        />
        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium">KPI Strip (4 cards)</p>
          <ManualTable
            variant="light"
            headers={["Card", "Description"]}
            rows={[
              ["Base IRR", "Baseline internal rate of return, with delta to the adjusted scenario"],
              ["Base ANOI", "Baseline Adjusted Net Operating Income (NOI minus management fees minus FF&E reserve) with percent change under current scenario"],
              ["Exit Value", "Baseline exit proceeds with percent change under current scenario"],
              ["Adjusted IRR", "IRR under the current slider settings — green if higher than base, red if lower"],
            ]}
          />
        </div>
        <div className="mt-3">
          <p className="text-sm font-medium mb-1">Tornado Chart</p>
          <p className="text-sm text-muted-foreground">
            Ranks all six variables by their total impact (spread between upside and downside). Toggle between
            <strong> IRR impact</strong> (percentage points) and <strong>ANOI impact</strong> (percent change).
            The variable with the widest spread appears at the top — this is your highest-risk assumption.
          </p>
        </div>
      </div>

      {/* Compare Tab */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Compare</h4>
        <p className="text-sm text-muted-foreground mb-3">
          Side-by-side comparison of up to four properties across key investment metrics. Select properties
          using the chip cards at the top, then review the radar chart, winner summary, and detailed table.
        </p>
        <ManualTable
          variant="light"
          headers={["Element", "Description"]}
          rows={[
            ["Property Chips", "Click to toggle a property in or out — up to 4 at a time. Each chip shows name, location, and status badge."],
            ["Winner Summary Bar", "Trophy icon showing the performance leader, with win-distribution bars indicating what percentage of key metrics each property wins."],
            ["Radar Chart", "5-axis comparison: ADR, Occupancy, Rooms, ADR Growth, Max Occupancy. One colored line per selected property."],
            ["Comparison Table", "10 metrics including location, status, room count, ADR, growth rate, occupancy, purchase price, improvements, and financing type. Best value in each column is highlighted with a green badge."],
            ["Donut Charts", "Room distribution and total investment distribution by property."],
          ]}
        />
        <Callout variant="light">
          Best-value highlighting is direction-aware — highest ADR is best, lowest purchase price is also recognized where relevant.
        </Callout>
      </div>

      {/* Timeline Tab */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Timeline</h4>
        <p className="text-sm text-muted-foreground mb-3">
          A horizontal Gantt-style visualization showing when each property is acquired and when operations begin.
          Useful for understanding capital deployment sequencing and pre-operations gaps.
        </p>
        <ManualTable
          variant="light"
          headers={["Element", "Description"]}
          rows={[
            ["Gantt Bars", "Colored bars spanning from acquisition date to operations start date for each property. Staggered vertically to prevent overlap."],
            ["Acquisition Node", "Blue circle on the timeline — hover to see purchase price and acquisition date."],
            ["Operations Node", "Green circle on the timeline — hover to see room count, ADR, and operations start date."],
            ["Event Log", "Card grid below the chart listing all events chronologically: date, property name, location, and key detail."],
            ["Legend", "Color key for acquisition events, operations events, and pre-ops gap spans. Shows total timeline span in months."],
          ]}
        />
      </div>

      {/* Financing Tab */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Financing Analysis</h4>
        <p className="text-sm text-muted-foreground mb-3">
          Four sub-tabs for debt structuring and stress testing. Each sub-tab includes an explanation panel
          describing the metric and its lender thresholds before displaying the analysis.
        </p>
        <ManualTable
          variant="light"
          headers={["Sub-Tab", "What It Shows"]}
          rows={[
            ["DSCR Sizing", "Calculates the maximum supportable loan based on Debt Service Coverage Ratio. Lenders typically require 1.20×–1.35× minimum. Shows a gauge with pass/fail threshold markers."],
            ["Debt Yield", "Debt Yield = Adjusted Net Operating Income (ANOI) ÷ Loan Amount. Measures how quickly a lender recovers principal at foreclosure. Minimum 8–10% typically required. Identifies whether DSCR or LTV is the binding constraint."],
            ["Stress Test", "A matrix showing Debt Service Coverage Ratio (DSCR) at every combination of interest rate change (in basis points) and ANOI change (%). Cells turn red when DSCR falls below the minimum threshold — reveals the breaking point."],
            ["Prepayment", "Calculates the cost of early loan payoff using three industry-standard methods: Yield Maintenance (compensates lender for lost interest income), Step-Down 5-4-3-2-1 (penalty percentage declines each year), and Defeasance (replace loan collateral with treasury securities)."],
          ]}
        />
      </div>

      <Callout variant="light">
        All four tabs support full exports: PDF, Excel, CSV, PowerPoint, Chart PNG, and Table PNG via the Export button in the top-right corner of each tab.
      </Callout>
    </SectionCard>
  );
}
