import { SectionCard } from "@/components/ui/section-card";
import { ManualTable } from "@/components/ui/manual-table";
import { IconBriefcase } from "@/components/icons";interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section07ManagementCompany({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="management-company"
      title="7. Management Company"
      icon={IconBriefcase}
      variant="light"
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <p className="text-sm text-muted-foreground">
        The Management Company page models the service company that manages all properties in the portfolio.
        It is not a property owner — it earns revenue through management fees charged to each property.
      </p>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Revenue</h4>
        <ManualTable
          variant="light"
          headers={["Fee Type", "How It Works"]}
          rows={[
            ["Base Fee", "A percentage of each property's total revenue, paid monthly"],
            ["Incentive Fee", "A percentage of each property's Gross Operating Profit, rewarding operational efficiency"],
          ]}
        />
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Expenses</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li><strong>Partner Compensation</strong> — configurable per-year schedule</li>
          <li><strong>Staff Compensation</strong> — based on headcount that scales with property count</li>
          <li><strong>Fixed Costs</strong> — office lease, professional services, tech infrastructure</li>
          <li><strong>Variable Costs</strong> — travel, IT licensing, marketing, miscellaneous (scale with portfolio size)</li>
        </ul>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Editing Assumptions</h4>
        <p className="text-sm text-muted-foreground">
          Click <strong>"Edit Assumptions"</strong> on the Management Company page to adjust fee rates, staffing levels,
          compensation schedules, and overhead costs. Click <strong>"Save"</strong> to recalculate all financials.
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Funding Instrument</h4>
        <p className="text-sm text-muted-foreground">
          The management company is initially funded through capital tranches that provide working capital until
          management fee revenue covers operating expenses. These appear as cash inflows but are recorded as
          future equity, not revenue.
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Capital Stack Discipline</h4>
        <p className="text-sm text-muted-foreground mb-2">
          Four admin-level thresholds consumed exclusively by the <strong>Funding Specialist</strong> when
          it evaluates a capital-raise plan against live benchmarks. Admins configure these under{" "}
          <strong>Admin → App Defaults → Management Company → Capital Stack Discipline</strong>.
        </p>
        <ManualTable
          variant="light"
          headers={["Threshold", "What It Controls"]}
          rows={[
            ["Runway Buffer", "Minimum months of runway past the operations start date. Raises leaving less than this cushion are flagged as undersized."],
            ["Sizing Overshoot", "Minimum headroom (% of the raise) over the modeled cash need. Covers plan slippage."],
            ["Revenue Ramp Delay", "Estimated months between operations start and first material property revenue. Sizes the operating reserve."],
            ["Burn Flex-Down", "Discretionary portion of the burn plan that can be cut without breaking operations. Measures slack before a covenant or runway tripwire fires."],
          ]}
        />
      </div>
    </SectionCard>
  );
}
