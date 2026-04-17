import { SectionCard } from "@/components/ui/section-card";
import { ManualTable } from "@/components/ui/manual-table";
import { Callout } from "@/components/ui/callout";
import { IconSettings } from "@/components/icons";interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section08Assumptions({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="assumptions"
      title="8. Systemwide Assumptions"
      icon={IconSettings}
      variant="light"
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <p className="text-sm text-muted-foreground">
        Systemwide Assumptions are model-wide parameters that affect all properties and the management company.
        Changes here trigger a full portfolio recalculation.
      </p>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Key Parameters</h4>
        <ManualTable
          variant="light"
          headers={["Parameter", "Default Value", "Industry Source", "Typical Range"]}
          rows={[
            ["Inflation Rate (Property)", "3.0%", "CPI / Fed target", "2–4%"],
            ["Inflation Rate (Company)", "3.0%", "CPI / Fed target", "2–4%"],
            ["Property Income Tax Rate", "25%", "Blended federal + state", "21–30%"],
            ["Company Income Tax Rate", "30%", "Blended federal + state", "25–35%"],
            ["ADR Growth Rate", "3.0%", "STR / HVS trend data", "2–5%"],
            ["Starting Occupancy", "55%", "Industry ramp-up benchmarks", "40–60%"],
            ["Stabilized Occupancy", "85%", "STR upper-upscale benchmarks", "75–90%"],
            ["Stabilization Period", "36 months", "Boutique hotel consensus", "24–48 months"],
            ["Base Management Fee", "8.5% of revenue", "HVS 2024 Specialty Fee Survey", "6–10%"],
            ["Incentive Management Fee", "12% of GOP", "HVS 2024 Specialty Fee Survey", "10–20%"],
            ["Exit Cap Rate", "8.5%", "HVS / CBRE cap rate surveys", "7–10%"],
            ["Sales Commission", "5%", "Broker industry standard", "4–6%"],
            ["Land Value %", "25%", "IRS Pub 946 guidelines", "20–30%"],
            ["Depreciation Years", "39 years (US)", "Governed Model Constant — set in Admin → Model Constants", "Country-specific"],
            ["FF&E Reserve", "4% of revenue", "USALI / lender covenants", "3–5%"],
            ["Days Per Month", "30.5", "Governed Model Constant — set in Admin → Model Constants", "Universal"],
            ["Projection Horizon", "10 years", "PE underwriting standard", "5–15 years"],
            ["Staffing Tier 1", "≤3 properties → 2.5 FTE", "Early-stage mgmt co benchmarks", "2–4 FTE"],
            ["Staffing Tier 2", "≤6 properties → 4.5 FTE", "Growth-stage mgmt co benchmarks", "4–6 FTE"],
            ["Staffing Tier 3", "7+ properties → 7.0 FTE", "Scaled mgmt co benchmarks", "6–10 FTE"],
            ["Capital Raise Valuation Cap", "$2,500,000", "Early-stage hospitality (e.g. SAFE notes)", "$1.5M–$5M"],
            ["Capital Raise Discount Rate", "20%", "Standard convertible / SAFE terms", "15–25%"],
            ["Funding Interest Rate", "8%", "Convertible note market", "6–10%"],
          ]}
        />
      </div>

      <Callout variant="light" title="Value Cascade Logic">
        <p>
          Every configurable parameter follows a three-level cascade to determine its effective value:
        </p>
        <div className="bg-card/50 rounded p-2 font-mono text-xs mt-2 space-y-1">
          <div><strong>1. Property Override</strong> — value set directly on the property (highest priority)</div>
          <div><strong>2. Systemwide Assumption</strong> — value set on the Company Assumptions page</div>
          <div><strong>3. Constant Default</strong> — hard-coded fallback from shared/constants.ts (lowest priority)</div>
        </div>
        <p className="text-xs mt-2">
          If a property has its own inflation rate, that is used. Otherwise, the systemwide inflation rate applies.
          If neither is set, the constant default (3%) is used. This cascade ensures every calculation always has
          a valid input while allowing granular overrides where needed.
        </p>
      </Callout>

      <Callout variant="light" title="Governed Model Constants (separate from your assumptions)">
        <p className="text-sm">
          A small set of values are <strong>not</strong> investor assumptions — they are accounting/regulatory
          standards that apply to everyone (GAAP, IRS, USALI). Today these are <strong>Days per Month</strong>
          (30.5, universal industry convention) and <strong>Depreciation Years</strong> (39 years for US hotels
          under IRC §168, with country-specific values elsewhere).
        </p>
        <p className="text-sm mt-2">
          You can no longer edit these from the Tax or Macro sections. They are managed centrally in
          <strong> Admin → Model Defaults → Model Constants</strong>, where each value carries a badge showing its
          source: <strong>Factory</strong> (built-in default), <strong>Analyst</strong> (researched and proposed
          by The Analyst with a citation), or <strong>Manual</strong> (admin override). Whatever the admin
          confirms there is what every calculation across the portal uses — no per-property override possible.
        </p>
      </Callout>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Owner's Priority Return</h4>
        <p className="text-sm text-muted-foreground">
          Set a hurdle rate (e.g., 8%) that the owner must earn on their equity before incentive management
          fees are charged. Cumulative owner cash flow must exceed hurdle rate multiplied by equity invested
          before incentive fees begin accruing. This protects investor returns and aligns management
          compensation with performance.
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Fee Subordination</h4>
        <p className="text-sm text-muted-foreground mb-2">
          Controls what happens when cash flow cannot cover debt service. Three modes are available:
        </p>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li><strong>Full</strong> — Defers ALL management fees (base + incentive) when preliminary cash flow is less than the monthly debt payment. Fees accrue and are paid when cash flow recovers.</li>
          <li><strong>Partial</strong> — Defers only incentive management fees. Base management fees are always charged regardless of cash position.</li>
          <li><strong>None</strong> — Fees are always charged regardless of cash position. This is the default for properties without debt constraints.</li>
        </ul>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Seasonality Profile Assignment</h4>
        <p className="text-sm text-muted-foreground">
          Assign a seasonality profile to each property from the Assumptions page. The profile defines 12
          monthly multipliers (0.5–1.5) applied to both occupancy and ADR. Occupancy is capped at max
          occupancy; ADR can exceed the base rate. Properties without a profile use flat seasonality (all 1.0).
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Ramp Curve Configuration</h4>
        <p className="text-sm text-muted-foreground">
          Configure the occupancy ramp curve to define how quickly a new property reaches stabilized occupancy.
          Enter an array of percentages representing each operating year's occupancy as a fraction of
          the stabilized rate. For example, [0.60, 0.75, 0.85, 0.92, 1.0] means 60% of stabilized
          occupancy in year 1, ramping to 100% by year 5. If no custom ramp is set, the default
          step-function ramp from the stabilization period is used.
        </p>
      </div>

      <Callout variant="light">
        Individual properties can override any systemwide assumption with property-specific values.
        When a property-level value is not set, the systemwide default is used automatically.
      </Callout>
    </SectionCard>
  );
}
