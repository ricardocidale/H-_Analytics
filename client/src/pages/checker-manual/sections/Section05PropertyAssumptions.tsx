import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";
  import { Callout } from "@/components/ui/callout";
  import { IconSettingsGear } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section05PropertyAssumptions({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="property-assumptions"
        title="5. Property-Level Assumptions"
        icon={IconSettingsGear}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <p className="text-muted-foreground text-sm mb-2">Fallback chain: Property-specific value → Global assumption → DEFAULT constant from shared/constants.ts</p>
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Identity & Timing</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit"]}
          rows={[
            ["name", "Property display name", "— (required)", "text"],
            ["location", "City/region description", "— (required)", "text"],
            ["market", "Geographic market classification", "— (required)", "text"],
            ["status", "Current lifecycle stage", "— (required)", "text"],
            ["type", "Capital structure (Full Equity / Financed)", "— (required)", "text"],
            ["acquisitionDate", "Date property is acquired", "— (required)", "date"],
            ["operationsStartDate", "Date hotel operations begin", "— (required)", "date"],
            ["inflationRate", "Per-property annual inflation override (null = global default)", "null", "%"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Capital Structure</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit"]}
          rows={[
            ["purchasePrice", "Property acquisition price", "$2,300,000", "$"],
            ["buildingImprovements", "Renovation / improvement budget", "$800,000", "$"],
            ["landValuePercent", "Non-depreciable land allocation", "25%", "%"],
            ["preOpeningCosts", "Pre-opening expenses", "$150,000", "$"],
            ["operatingReserve", "Cash reserve for initial operations", "$200,000", "$"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Revenue Drivers</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit"]}
          rows={[
            ["roomCount", "Number of guest rooms", "10", "count"],
            ["startAdr", "Average nightly rate per occupied room at opening", "$250", "$/night"],
            ["adrGrowthRate", "Annual compounding ADR increase", "3%", "%"],
            ["startOccupancy", "Occupancy rate in the first month of operations", "55%", "%"],
            ["maxOccupancy", "Maximum occupancy after ramp-up completes", "85%", "%"],
            ["occupancyRampMonths", "Months between each occupancy step-up", "6", "months"],
            ["occupancyGrowthStep", "Percentage-point jump at each step-up", "5%", "%"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Inline Badges</h3>
        <p className="text-muted-foreground text-sm mb-2">Assumption fields display two types of inline badges next to their labels: GAAP/IRS badges and benchmark range labels.</p>
        <ManualTable
          headers={["Badge", "Color", "Purpose", "Interaction"]}
          rows={[
            ["GAAP/IRS Badge (ⓘ)", "Blue circle, white icon", "Shows the GAAP or IRS rule governing this field", "Hover to see the accounting standard and its implications"],
            ["Benchmark Range Label", "Light yellow pill", "Shows AI-researched market range for this assumption (e.g., 55%-70%)", "Hover to see source and date; click to auto-fill the recommended value"],
          ]}
        />
        <h4 className="text-foreground text-xs font-semibold mt-3 mb-2">GAAP/IRS Rules by Field</h4>
        <ManualTable
          headers={["Field", "Standard", "Rule Summary"]}
          rows={[
            ["Purchase Price", "ASC 805", "Acquisition cost = fair value of consideration transferred; depreciable basis excludes land"],
            ["Building Improvements", "ASC 360 / IRS Pub 946", "Capitalized and depreciated over 39 years straight-line; not expensed immediately"],
            ["Land Value %", "IRS Pub 946", "Land is NOT depreciable; higher land % = lower depreciation deduction"],
            ["LTV", "ASC 470", "Debt separated into interest (IS expense) and principal (BS/CFF); only interest reduces taxable income"],
            ["Closing Costs", "ASC 310-20", "Loan origination costs capitalized and amortized over loan term; shown as reduction of loan liability"],
            ["Exit Cap Rate", "ASC 360 / IRC §1250", "Terminal value for impairment testing; depreciation recapture taxed at up to 25%"],
            ["Income Tax Rate", "IRC §168", "Taxable income = NOI − Interest − Depreciation; 39-year depreciation shelters cash flow"],
            ["Events Revenue", "ASC 606", "Point-in-time recognition when event occurs; deposits = deferred revenue"],
            ["F&B Revenue", "ASC 606", "Revenue at point of sale; bundled packages allocated to standalone selling prices"],
            ["FF&E Reserve", "USALI", "Deducted below GOP to arrive at NOI; actual replacements capitalized 5–7 years"],
            ["Property Taxes", "IRC §164", "Fully deductible operating expense; based on assessed value, not market value"],
            ["Sale Commission", "IRC §1001", "Reduces amount realized on sale; deducted from gross proceeds"],
          ]}
        />
        <h4 className="text-foreground text-xs font-semibold mt-3 mb-2">Benchmark Range Label Fields</h4>
        <ManualTable
          headers={["Field", "Generic Range", "Source"]}
          rows={[
            ["Starting ADR", "Market-dependent", "AI property research (adrAnalysis)"],
            ["Starting Occupancy", "Market-dependent", "AI property research (occupancyAnalysis)"],
            ["ADR Annual Growth", "3–5%", "AI property research (adrAnalysis)"],
            ["Occupancy Growth Step", "4–6%", "AI property research (occupancyAnalysis)"],
            ["Events Revenue Share", "20–35%", "AI property research"],
            ["F&B Revenue Share", "15–25%", "AI property research"],
            ["Other Revenue Share", "3–8%", "AI property research"],
            ["Sale Commission", "4–6%", "AI property research"],
            ["Exit Cap Rate", "Market-dependent", "AI property research (capRateAnalysis)"],
          ]}
        />
        <Callout>Benchmark range labels only appear when AI market research has been run for the property. GAAP badges are always visible.</Callout>
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Revenue Shares & Cost Rates</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit"]}
          rows={[
            ["revShareEvents", "Event revenue as % of Total Revenue", "18%", "%"],
            ["revShareFB", "F&B revenue as % of Total Revenue", "30%", "%"],
            ["revShareOther", "Other revenue as % of Total Revenue", "3%", "%"],
            ["cateringBoostPercent", "Deprecated — catering boost no longer used in revenue calc", "0%", "%"],
            ["costRateRooms", "Rooms Department expense", "36%", "% of Revenue"],
            ["costRateFB", "F&B Department expense", "32%", "% of Revenue"],
            ["costRateAdmin", "Administrative & General", "8%", "% of Revenue"],
            ["costRateMarketing", "Sales & Marketing", "5%", "% of Revenue"],
            ["costRatePropertyOps", "Property Operations & Maintenance", "4%", "% of Revenue"],
            ["costRateUtilities", "Utilities", "5%", "% of Revenue"],
            ["costRateTaxes", "Property Taxes", "3%", "% of Property Value"],
            ["costRateIT", "Information Technology", "2%", "% of Revenue"],
            ["costRateFFE", "FF&E Reserve", "4%", "% of Revenue"],
            ["costRateOther", "Other / Miscellaneous", "5%", "% of Revenue"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Financing (Acquisition + Refi)</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit"]}
          rows={[
            ["acquisitionLTV", "Loan-to-value at acquisition", "75%", "%"],
            ["acquisitionInterestRate", "Interest rate on acquisition loan", "9%", "%"],
            ["acquisitionTermYears", "Amortization period", "25", "years"],
            ["acquisitionClosingCostRate", "Closing costs as % of loan", "2%", "%"],
            ["willRefinance", "Whether property will refinance", "null", "Yes/No"],
            ["refinanceDate", "Target date for refinance", "null", "date"],
            ["refinanceLTV", "LTV at refinance", "75%", "%"],
            ["refinanceInterestRate", "Interest rate on refi loan", "9%", "%"],
            ["refinanceTermYears", "Amortization for refi loan", "25", "years"],
            ["refinanceClosingCostRate", "Closing costs as % of refi loan", "3%", "%"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Exit & Tax</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit"]}
          rows={[
            ["exitCapRate", "Cap rate for terminal value", "8.5%", "%"],
            ["taxRate", "Income / capital gains tax rate", "25%", "%"],
          ]}
        />
      </SectionCard>
    );
  }
  