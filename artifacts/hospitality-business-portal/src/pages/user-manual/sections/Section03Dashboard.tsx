import { SectionCard } from "@/components/ui/section-card";
import { ManualTable } from "@/components/ui/manual-table";
import { Callout } from "@/components/ui/callout";
import { IconDashboard } from "@/components/icons";interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section03Dashboard({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="dashboard"
      title="3. Dashboard"
      icon={IconDashboard}
      variant="light"
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <p className="text-sm text-muted-foreground">
        The Dashboard provides a high-level overview of the entire portfolio. It shows key performance indicators (KPIs),
        consolidated financial statements, and summary cards for each property.
      </p>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">KPI Cards</h4>
        <ManualTable
          variant="light"
          headers={["KPI", "Description"]}
          rows={[
            ["Portfolio IRR", "The internal rate of return across all properties combined"],
            ["Portfolio Equity Multiple", "Total distributions and exit proceeds divided by total equity invested"],
            ["Total Revenue", "Consolidated annual revenue across all properties"],
            ["Portfolio ANOI", "Adjusted NOI for the entire portfolio"],
            ["Weighted Avg Occupancy", "Average occupancy weighted by room count across properties"],
            ["Total Equity Invested", "Sum of all equity contributions across the portfolio"],
          ]}
        />
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Consolidated Income Statement</h4>
        <p className="text-sm text-muted-foreground mb-2">
          The dashboard includes a full consolidated income statement following the USALI (Uniform System of Accounts for the Lodging Industry) waterfall:
        </p>
        <ManualTable
          variant="light"
          headers={["Line Item", "Calculation"]}
          rows={[
            ["Total Revenue", "= Rooms + Events + F&B + Other"],
            ["Operating Expenses", "= Sum of departmental + undistributed expenses"],
            ["Gross Operating Profit (GOP)", "= Total Revenue − Operating Expenses"],
            ["Fixed Charges", "= Property Taxes"],
            ["Net Operating Income (NOI)", "= GOP − Fixed Charges"],
            ["Management Fees", "= Base Fee (% of Revenue) + Incentive Fee (% of GOP)"],
            ["FF&E Reserve", "= Reserve for Furniture, Fixtures & Equipment"],
            ["Adjusted NOI (ANOI)", "= NOI − Management Fees − FF&E Reserve"],
          ]}
        />
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Operational Metrics</h4>
        <ManualTable
          variant="light"
          headers={["Metric", "Calculation"]}
          rows={[
            ["ADR (Effective)", "= Room Revenue ÷ Sold Rooms"],
            ["Occupancy", "= Sold Rooms ÷ Available Rooms"],
            ["RevPAR", "= Room Revenue ÷ Available Rooms (cross-check: ADR × Occupancy)"],
          ]}
        />
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Consolidated Cash Flow Statement</h4>
        <ManualTable
          variant="light"
          headers={["Section", "Calculation"]}
          rows={[
            ["Cash Flow from Operations (CFO)", "= ANOI − Debt Service (Principal + Interest)"],
            ["Cash Flow from Investing (CFI)", "= Capital Expenditures + Exit Proceeds (if final year)"],
            ["Cash Flow from Financing (CFF)", "= Refinancing Proceeds − Principal Payments"],
            ["Net Change in Cash", "= CFO + CFI + CFF"],
          ]}
        />
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Formula Rows</h4>
        <p className="text-sm text-muted-foreground">
          Every calculated subtotal in the income statement and cash flow statement has a clickable
          "Formula" row. Click the chevron to reveal the exact calculation used to derive that number.
          This provides full transparency into how every figure is computed.
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Charts & Visualizations</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li><strong>Revenue & ANOI Trend</strong> — year-over-year revenue and ANOI across the portfolio</li>
          <li><strong>Cash Flow Waterfall</strong> — visualizes how cash flows from revenue to distributions</li>
          <li><strong>Property Comparison</strong> — side-by-side metrics for each property</li>
        </ul>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Property Cards</h4>
        <p className="text-sm text-muted-foreground">
          Each property is shown as a summary card with its name, location, room count, ADR, occupancy, and key financial metrics.
          Click any property card to navigate to its detail page.
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Research Status</h4>
        <p className="text-sm text-muted-foreground">
          Research freshness indicators have moved from the Dashboard to the <strong>sidebar footer</strong>.
          A compact Research panel with four colored dots (Property, Operations, Marketing, Industry) is always
          visible at the bottom of the navigation sidebar. Green = current, Red = stale or missing.
          Click the panel to navigate to the Research Hub and regenerate any stale research.
        </p>
      </div>

      <Callout variant="light">
        All consolidated figures aggregate data across the entire portfolio. Individual property breakdowns
        are available by expanding any row to see per-property values.
      </Callout>
    </SectionCard>
  );
}
