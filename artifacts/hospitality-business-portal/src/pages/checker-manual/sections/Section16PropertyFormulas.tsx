import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";
  import { Callout } from "@/components/ui/callout";
  import { IconCalculator } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section16PropertyFormulas({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="property-formulas"
        title="16. Property Financial Formulas"
        icon={IconCalculator}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <Callout>
          Each formula follows the engine's income statement waterfall:
          Revenue → Operating Expenses → GOP → Management Fees → AGOP → Property Taxes → NOI → FF&E → ANOI.
          Industry ranges are drawn from USALI 12th Edition, HVS 2024 specialty/wellness fee surveys,
          IRS Publication 946, and Global Wellness Institute benchmarks.
        </Callout>
        <ManualTable
          headers={["Ref ID", "Name", "Formula / Logic", "Industry Basis"]}
          rows={[
            ["F-P-01", "Days in Month", "Default 30.5 (365 ÷ 12, rounded); configurable per model", "Industry convention (365 ÷ 12 ≈ 30.42, rounded to 30.5)"],
            ["F-P-02", "Available Rooms", "roomCount × daysInMonth", "—"],
            ["F-P-03", "Room Revenue", "availableRooms × occupancyRate × currentADR", "USALI 12th Ed. Rooms Dept; ADR benchmarks vary by market"],
            ["F-P-04", "Events Revenue", "totalRevenue × revShareEvents", "Global Wellness Institute 2024: wellness retreats generate 25–35% of total revenue from events/programming"],
            ["F-P-05", "F&B Revenue", "totalRevenue × revShareFB", "USALI 12th Ed. F&B Dept; F&B share represents target % of total revenue (catering boost absorbed)"],
            ["F-P-06", "Other Revenue", "totalRevenue × revShareOther", "USALI 12th Ed. Other Operated Depts; typically 2–6% of total revenue"],
            ["F-P-07", "Total Revenue", "roomRevenue / (1 − ancillaryShare); ancillaryShare = events + fb + other", "USALI 12th Ed. Total Revenue line; room share derived as remainder"],
            ["F-P-08", "Operating Expenses", "Σ (departmental + undistributed expenses + insurance); excludes property taxes and FF&E", "USALI 12th Ed. departmental expense categories; typical total 45–65% of revenue"],
            ["F-P-09", "Gross Operating Profit (GOP)", "Total Revenue − Operating Expenses", "USALI 12th Ed. GOP line; healthy boutique range 35–55% margin"],
            ["F-P-09a", "Adjusted GOP (AGOP)", "GOP − Base Management Fee − Incentive Management Fee", "USALI 12th Ed.; AGOP isolates property performance after management compensation"],
            ["F-P-10", "Net Operating Income (NOI)", "AGOP − Property Taxes", "USALI 12th Ed. NOI; property taxes per IRC §164, based on assessed value"],
            ["F-P-11", "Adjusted NOI (ANOI)", "NOI − FF&E Reserve", "USALI 12th Ed.; FF&E reserve typically 3–5% of revenue per lender covenants"],
            ["F-P-12a", "Base Management Fee", "Total Revenue × baseMgmtFeeRate (or Σ service category rates)", "HVS 2024 Specialty: 6–10% of revenue for wellness/boutique operators; default 8.5%"],
            ["F-P-12b", "Incentive Management Fee", "max(0, GOP) × incentiveMgmtFeeRate", "HVS 2024 Specialty: 12–20% of GOP; only charged when GOP > 0"],
            ["F-P-12c", "Fixed Charges", "Property Taxes + FF&E Reserve. In this engine, insurance is included in operating expenses (before GOP) rather than as a fixed charge. Property taxes are subtracted after AGOP; FF&E after NOI.", "USALI 12th Ed. Fixed Charges; property taxes per IRC §164 (1.5–4% of assessed value); FF&E 3–5% of revenue per lender covenants"],
            ["F-P-13", "Depreciable Basis", "(Purchase Price + Improvements) × (1 − Land Value %)", "IRS Pub 946; land is non-depreciable; typical land allocation 20–30%"],
            ["F-P-14", "Depreciation", "Depreciable Basis / 39 / 12 (monthly straight-line)", "IRS Pub 946 / IRC §168: MACRS 39-year nonresidential real property (hotels)"],
            ["F-P-15", "Interest Expense", "Beginning Loan Balance × Monthly Interest Rate", "ASC 835 Interest Imputation; only interest shown on income statement"],
            ["F-P-16", "Net Income", "ANOI − Interest Expense − Depreciation − Income Tax", "GAAP income statement; tax per property-level rate (default 25%)"],
            ["F-P-16a", "Income Tax", "max(0, Taxable Income) × incomeTaxRate; NOL carried forward", "IRC §172: Net Operating Loss carryforward; no carryback in this model"],
            ["F-P-17", "Cash from Ops (CFO)", "netIncome + depreciation", "ASC 230 indirect method; depreciation is a non-cash add-back"],
            ["F-P-18", "Cash from Investing (CFI)", "−acquisitionCosts + exitProceeds", "ASC 230 investing activities"],
            ["F-P-19", "Cash from Financing (CFF)", "equityInjection + loanProceeds − principalRepayment − distributions", "ASC 230 financing activities"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-6 mb-2">Revenue Model — Ancillary Share Derivation</h3>
        <Callout>
          Total Revenue = Room Revenue / (1 − eventsShare − fbShare − otherShare). Each non-room stream
          is a percentage of TOTAL revenue, not room revenue. Room revenue is the anchor; ancillary shares
          are solved algebraically so that Events + F&B + Other + Rooms = 100% of Total Revenue.
        </Callout>
        <ManualTable
          headers={["Ref ID", "Name", "Formula / Logic", "Industry Basis"]}
          rows={[
            ["F-P-07a", "Ancillary Share", "ancillaryShare = revShareEvents + revShareFB + revShareOther", "USALI 12th Ed.; ancillary typically 30–50% for boutique/wellness"],
            ["F-P-07b", "Room Share (derived)", "roomShare = 1 − ancillaryShare", "Remainder after ancillary allocation"],
            ["F-P-07c", "Total Revenue (expanded)", "roomRevenue / roomShare = roomRevenue / (1 − ancillaryShare)", "Ensures all shares sum to exactly 100%"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-6 mb-2">Seasonality Adjustments</h3>
        <Callout>
          Monthly financials apply seasonality multipliers to both occupancy (capped at maxOccupancy) and
          ADR (uncapped). A multiplier of 1.0 means no adjustment; values below 1.0 reduce and above 1.0
          increase the metric for that month.
        </Callout>
        <ManualTable
          headers={["Ref ID", "Name", "Formula / Logic", "Industry Basis"]}
          rows={[
            ["F-P-20", "Seasonal Occupancy", "min(baseOccupancy × seasonalMultiplier[month], maxOccupancy)", "STR seasonal patterns; capped to prevent >100% occupancy"],
            ["F-P-21", "Seasonal ADR", "baseADR × seasonalMultiplier[month]", "STR seasonal patterns; no cap — peak seasons can exceed base ADR"],
            ["F-P-22", "Seasonal Room Revenue", "availableRooms × seasonalOccupancy × seasonalADR", "Derived from F-P-20 and F-P-21"],
          ]}
        />
        <h3 className="text-foreground text-sm font-semibold mt-6 mb-2">Fee Subordination Rules</h3>
        <Callout>
          Fee subordination determines whether management fees are deferred when cash flow cannot cover
          debt service. This protects lenders and aligns management incentives with debt covenants.
        </Callout>
        <ManualTable
          headers={["Ref ID", "Name", "Formula / Logic", "Industry Basis"]}
          rows={[
            ["F-P-23", "Fee Subordination (Full)", "If feeSubordination = 'full': when preliminaryCash < monthlyDebtPayment, defer ALL management fees (base + incentive). Deferred fees accrue and are paid when cash recovers.", "Common in leveraged hospitality acquisitions; protects DSCR covenant"],
            ["F-P-24", "Fee Subordination (Partial)", "If feeSubordination = 'partial': when preliminaryCash < monthlyDebtPayment, defer ONLY incentive management fees. Base fee is always charged.", "HVS 2024: partial subordination is the most common structure"],
            ["F-P-25", "Fee Subordination (None)", "If feeSubordination = 'none': all fees charged regardless of cash position. No deferral mechanism.", "Default for unlevered or low-leverage properties"],
            ["F-P-26", "Owner Priority Return", "Incentive fees only charged when cumulative owner cash flow > (hurdleRate × equityInvested). Tracks cumulative shortfall.", "PE waterfall structures; typical hurdle 6–10%"],
          ]}
        />
      </SectionCard>
    );
  }
