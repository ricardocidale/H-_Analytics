import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";
  import { Callout } from "@/components/ui/callout";
  import { IconSettings } from "@/components/icons";
  import { DEFAULT_COMPANY_OPS_START_DATE } from "@shared/constants";
interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section04GlobalAssumptions({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="global-assumptions"
        title="4. Global Assumptions"
        icon={IconSettings}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <p className="text-muted-foreground text-sm mb-2">Model-wide parameters accessible via Settings page. Changing any global assumption triggers instant client-side recalculation of every financial statement.</p>
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Model Parameters</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit", "Affects"]}
          rows={[
            ["companyName", "Display name for management company", "Hospitality Business Company", "text", "Both"],
            ["companyLogo", "URL to uploaded company logo", "null", "URL", "Both"],
            ["propertyLabel", "Label for property type throughout UI", "Boutique Hotel", "text", "Both"],
            ["modelStartDate", "First month of the financial model", "2026-04-01", "date", "Both"],
            ["projectionYears", "Number of years to project", "10", "count", "Both"],
            ["companyOpsStartDate", "Date Management Company begins operations", DEFAULT_COMPANY_OPS_START_DATE, "date", "Mgmt Co."],
            ["fiscalYearStartMonth", "Month number when fiscal year begins (1=Jan)", "1", "count (1–12)", "Both"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Inflation & Escalation (3-Tier Cascade)</h3>
        <p className="text-xs text-muted-foreground mb-2">Inflation follows a hierarchical fallback: 1. Per-Property/Company rate → 2. Global company rate → 3. Global inflation rate.</p>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit", "Affects"]}
          rows={[
            ["inflationRate", "Global default annual inflation rate (base fallback)", "3%", "%", "Both"],
            ["companyInflationRate", "Management Company specific inflation rate", "null", "%", "Mgmt Co."],
            ["fixedCostEscalationRate", "Specific override for fixed overhead escalation", "null", "%", "Both"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Management Fees (Per-Property)</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit", "Affects"]}
          rows={[
            ["baseManagementFeeRate", "Base fee as % of property Total Revenue (set per property)", "5%", "%", "Both"],
            ["incentiveManagementFeeRate", "Incentive fee as % of property GOP (set per property)", "15%", "%", "Both"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Funding Instrument</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit", "Affects"]}
          rows={[
            ["fundingSourceLabel", "Label for funding instrument type", "Funding Vehicle", "text", "Mgmt Co."],
            ["capitalRaise1Amount", "Amount of first funding tranche", "$1,000,000", "$", "Mgmt Co."],
            ["capitalRaise1Date", "Disbursement date for first tranche", "2026-06-01", "date", "Mgmt Co."],
            ["capitalRaise2Amount", "Amount of second funding tranche", "$1,000,000", "$", "Mgmt Co."],
            ["capitalRaise2Date", "Disbursement date for second tranche", "2027-04-01", "date", "Mgmt Co."],
            ["capitalRaiseValuationCap", "Max pre-money valuation for funding conversion", "$2,500,000", "$", "Mgmt Co."],
            ["capitalRaiseDiscountRate", "Discount rate for funding equity conversion", "20%", "%", "Mgmt Co."],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Partner Compensation (per year)</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit", "Affects"]}
          rows={[
            ["partnerCompYear1–3", "Annual comp pool (years 1–3)", "$540,000", "$/year", "Mgmt Co."],
            ["partnerCompYear4–5", "Annual comp pool (years 4–5)", "$600,000", "$/year", "Mgmt Co."],
            ["partnerCompYear6–7", "Annual comp pool (years 6–7)", "$700,000", "$/year", "Mgmt Co."],
            ["partnerCompYear8–9", "Annual comp pool (years 8–9)", "$800,000", "$/year", "Mgmt Co."],
            ["partnerCompYear10", "Annual comp pool (year 10)", "$900,000", "$/year", "Mgmt Co."],
            ["partnerCountYear1–10", "Partner headcount each year", "3", "count", "Mgmt Co."],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Staffing</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit", "Affects"]}
          rows={[
            ["staffSalary", "Average annual salary per staff FTE", "$75,000", "$/year", "Mgmt Co."],
            ["staffTier1MaxProperties", "Max properties for Tier 1 staffing", "3", "count", "Mgmt Co."],
            ["staffTier1Fte", "FTE headcount at Tier 1", "2.5", "FTE", "Mgmt Co."],
            ["staffTier2MaxProperties", "Max properties for Tier 2 staffing", "6", "count", "Mgmt Co."],
            ["staffTier2Fte", "FTE headcount at Tier 2", "4.5", "FTE", "Mgmt Co."],
            ["staffTier3Fte", "FTE headcount at Tier 3 (>6 properties)", "7.0", "FTE", "Mgmt Co."],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Fixed Overhead (Management Company)</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit", "Affects"]}
          rows={[
            ["officeLeaseStart", "Annual office lease cost (Year 1)", "$36,000", "$/year", "Mgmt Co."],
            ["professionalServicesStart", "Annual legal/accounting/advisory (Year 1)", "$24,000", "$/year", "Mgmt Co."],
            ["techInfraStart", "Annual technology infrastructure (Year 1)", "$18,000", "$/year", "Mgmt Co."],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Variable Costs (Management Company)</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit", "Affects"]}
          rows={[
            ["travelCostPerClient", "Annual travel cost per managed property", "$12,000", "$/property/yr", "Mgmt Co."],
            ["itLicensePerClient", "Annual IT licensing per managed property", "$3,000", "$/property/yr", "Mgmt Co."],
            ["marketingRate", "Marketing spend as % of portfolio revenue", "5%", "%", "Mgmt Co."],
            ["miscOpsRate", "Misc operations as % of portfolio revenue", "3%", "%", "Mgmt Co."],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Revenue Variables (Property Expense Rates)</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit", "Affects"]}
          rows={[
            ["eventExpenseRate", "Expense rate applied to Event Revenue", "65%", "%", "Properties"],
            ["otherExpenseRate", "Expense rate applied to Other Revenue", "60%", "%", "Properties"],
            ["utilitiesVariableSplit", "Portion of utilities treated as variable", "60%", "%", "Properties"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Exit & Sale</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit", "Affects"]}
          rows={[
            ["exitCapRate", "Cap rate for terminal value calculation", "8.5%", "%", "Properties"],
            ["salesCommissionRate", "Broker commission at disposition (per-property, set on each property)", "5%", "%", "Per Property"],
            ["companyTaxRate", "Company income tax rate for Mgmt Co.", "30%", "%", "Mgmt Co."],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Debt Assumptions</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit", "Affects"]}
          rows={[
            ["interestRate", "Default loan interest rate (acquisition)", "9%", "%", "Properties"],
            ["amortizationYears", "Default loan amortization period", "25", "years", "Properties"],
            ["acqLTV", "Default acquisition loan-to-value ratio", "75%", "%", "Properties"],
            ["acqClosingCostRate", "Closing costs as % of acquisition loan", "2%", "%", "Properties"],
            ["refiLTV", "Default refinance loan-to-value ratio", "75%", "%", "Properties"],
            ["refiClosingCostRate", "Closing costs as % of refinance loan", "3%", "%", "Properties"],
            ["refiInterestRate", "Interest rate on refinance loan", "—", "%", "Properties"],
            ["refiAmortizationYears", "Amortization for refinance loan", "—", "years", "Properties"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Development & CapEx</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit", "Affects"]}
          rows={[
            ["purchasePrice", "Default property purchase price", "$2,300,000", "$", "Properties"],
            ["improvementCosts", "Renovation/CapEx budget", "$300,000", "$", "Properties"],
            ["preOpeningCosts", "Pre-launch operational budget", "$50,000", "$", "Properties"],
            ["operatingReserve", "Working capital reserve", "$75,000", "$", "Properties"],
            ["developmentMonths", "Duration from acquisition to operations", "6", "months", "Properties"],
            ["landValuePercent", "Land allocation for depreciation", "20%", "%", "Properties"],
            ["ffEReserveRate", "Annual FF&E reserve accrual", "4%", "%", "Properties"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Seasonality & Ramp Curves</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit", "Affects"]}
          rows={[
            ["seasonalityProfile", "Array of 12 monthly multipliers (0.5–1.5) for occupancy and ADR", "[1.0 × 12]", "multiplier[]", "Properties"],
            ["rampCurve", "Array of year-by-year occupancy ramp as fractions of stabilized occupancy", "null (uses step-function)", "fraction[]", "Properties"],
            ["maxOccupancy", "Hard cap on seasonal occupancy (prevents >100%)", "95%", "%", "Properties"],
          ]}
        />
        <Callout>
          Verification: Seasonality multipliers must have exactly 12 entries. Each must be between 0.5 and 1.5.
          The average of all 12 multipliers should approximate 1.0 (tolerance ±0.15) to avoid systematically
          inflating or deflating annual projections. Ramp curve entries must be between 0.0 and 1.0, and the
          final entry should be 1.0 (fully stabilized).
        </Callout>
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Fee Subordination & Priority Return</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit", "Affects"]}
          rows={[
            ["feeSubordination", "Controls fee deferral when cash < debt service: 'full', 'partial', or 'none'", "none", "enum", "Properties"],
            ["ownerPriorityReturn", "Hurdle rate on equity before incentive fees are charged", "0%", "%", "Properties"],
            ["cumulativeOwnerCashFlow", "Running total of owner distributions (tracked by engine)", "computed", "$", "Properties"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-4 mb-2">Asset Definition</h3>
        <ManualTable
          headers={["Variable", "Description", "Default", "Unit"]}
          rows={[
            ["minRooms / maxRooms", "Room count range", "10 – 80", "count"],
            ["hasFB / hasEvents / hasWellness", "Amenity flags", "true", "boolean"],
            ["minAdr / maxAdr", "Target ADR range", "$150 – $600", "$"],
            ["level", "Service level classification", "luxury", "enum"],
            ["eventLocations", "Number of distinct event spaces", "2", "count"],
            ["maxEventCapacity", "Maximum event guest capacity", "150", "count"],
            ["acreage", "Minimum property acreage", "10", "acres"],
            ["privacyLevel", "Guest privacy classification", "high", "enum"],
            ["parkingSpaces", "Minimum parking spaces", "50", "count"],
          ]}
        />
      </SectionCard>
    );
  }
  