import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { GovernedFieldWrapper } from "@/components/ui/governed-field";
import EditableValue from "@/components/company-assumptions/EditableValue";
import { Section, PctField, DollarField, NumberField, TabBanner, type Draft } from "./FieldHelpers";
import {
  DEFAULT_START_ADR,
  DEFAULT_ADR_GROWTH_RATE,
  DEFAULT_START_OCCUPANCY,
  DEFAULT_MAX_OCCUPANCY,
  DEFAULT_OCCUPANCY_RAMP_MONTHS,
  DEFAULT_ROOM_COUNT,
  DEFAULT_REV_SHARE_FB,
  DEFAULT_REV_SHARE_EVENTS,
  DEFAULT_REV_SHARE_OTHER,
  DEFAULT_CATERING_BOOST_PCT,
  DEFAULT_COST_RATE_ROOMS,
  DEFAULT_COST_RATE_FB,
  DEFAULT_COST_RATE_ADMIN,
  DEFAULT_COST_RATE_MARKETING,
  DEFAULT_COST_RATE_PROPERTY_OPS,
  DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_COST_RATE_TAXES,
  DEFAULT_COST_RATE_IT,
  DEFAULT_COST_RATE_FFE,
  DEFAULT_COST_RATE_OTHER,
  DEFAULT_COST_RATE_INSURANCE,
  DEFAULT_PROPERTY_TAX_RATE,
  DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_PROPERTY_INFLATION_RATE,
} from "@shared/constants";

export function PropertyUnderwritingTab({ draft, onChange }: { draft: Draft; onChange: (field: string, value: any) => void }) {
  const acq = draft.standardAcqPackage ?? {};
  const debt = draft.debtAssumptions ?? {};

  const onAcq = (field: string, value: number) => {
    onChange("standardAcqPackage", { ...acq, [field]: value });
  };
  const onDebt = (field: string, value: number) => {
    onChange("debtAssumptions", { ...debt, [field]: value });
  };

  return (
    <div className="space-y-5">
      <TabBanner>
        Template values applied when creating new properties. Existing properties retain their current values. NULL fields fall back to system constants.
      </TabBanner>

      <Section grid title="Revenue Assumptions" description="Default revenue parameters pre-filled when adding a new hotel to the portfolio.">
        <DollarField
          label="Starting ADR"
          tooltip="Average Daily Rate at property opening. This is the base rate before any growth adjustments."
          value={draft.defaultStartAdr}
          fallback={DEFAULT_START_ADR}
          onChange={(_, v) => onChange("defaultStartAdr", v)}
          min={50} max={1500} step={25}
          testId="field-defaultStartAdr"
          researchRange="$150–$500"
        />
        <PctField
          label="ADR Annual Growth"
          tooltip="Annual rate at which ADR increases year-over-year, typically tracking inflation plus market premiums."
          value={draft.defaultAdrGrowthRate}
          fallback={DEFAULT_ADR_GROWTH_RATE}
          onChange={(_, v) => onChange("defaultAdrGrowthRate", v)}
          min={0} max={0.15} step={0.005}
          testId="field-defaultAdrGrowthRate"
          researchRange="2%–5%"
        />
        <PctField
          label="Starting Occupancy"
          tooltip="Occupancy rate at property opening, before ramp-up to stabilization. Typically 50-60% for new boutique hotels."
          value={draft.defaultStartOccupancy}
          fallback={DEFAULT_START_OCCUPANCY}
          onChange={(_, v) => onChange("defaultStartOccupancy", v)}
          min={0.1} max={1} step={0.01}
          testId="field-defaultStartOccupancy"
          researchRange="50%–65%"
        />
        <PctField
          label="Stabilized Occupancy"
          tooltip="Target occupancy after ramp-up period. Luxury boutique hotels typically stabilize at 75-85%."
          value={draft.defaultMaxOccupancy}
          fallback={DEFAULT_MAX_OCCUPANCY}
          onChange={(_, v) => onChange("defaultMaxOccupancy", v)}
          min={0.3} max={1} step={0.01}
          testId="field-defaultMaxOccupancy"
          researchRange="70%–85%"
        />
        <NumberField
          label="Occupancy Ramp"
          tooltip="Number of months to ramp from starting occupancy to stabilized occupancy. Typically 3-12 months for boutique properties."
          value={draft.defaultOccupancyRampMonths}
          fallback={DEFAULT_OCCUPANCY_RAMP_MONTHS}
          onChange={(_, v) => onChange("defaultOccupancyRampMonths", Math.round(v))}
          min={0} max={24} step={1}
          testId="field-defaultOccupancyRampMonths"
          researchRange="3–12 mo"
        />
        <NumberField
          label="Room Count"
          tooltip="Number of keys (rooms) for a new property. Boutique hotels are typically 10-100 rooms."
          value={draft.defaultRoomCount}
          fallback={DEFAULT_ROOM_COUNT}
          onChange={(_, v) => onChange("defaultRoomCount", Math.round(v))}
          min={1} max={500} step={1}
          testId="field-defaultRoomCount"
          researchRange="10–100 keys"
        />
        <PctField
          label="F&B Revenue Share"
          tooltip="Food & Beverage revenue as a percentage of total room revenue. Varies by hotel concept and restaurant program."
          value={draft.defaultRevShareFb}
          fallback={DEFAULT_REV_SHARE_FB}
          onChange={(_, v) => onChange("defaultRevShareFb", v)}
          min={0} max={0.5} step={0.01}
          testId="field-defaultRevShareFb"
          researchRange="15%–30%"
        />
        <PctField
          label="Events Revenue Share"
          tooltip="Events/banquet revenue as a percentage of total room revenue. Higher for properties with dedicated event spaces."
          value={draft.defaultRevShareEvents}
          fallback={DEFAULT_REV_SHARE_EVENTS}
          onChange={(_, v) => onChange("defaultRevShareEvents", v)}
          min={0} max={0.5} step={0.01}
          testId="field-defaultRevShareEvents"
          researchRange="5%–15%"
        />
        <PctField
          label="Other Revenue Share"
          tooltip="Miscellaneous revenue (spa, parking, retail) as a percentage of total revenue."
          value={draft.defaultRevShareOther}
          fallback={DEFAULT_REV_SHARE_OTHER}
          onChange={(_, v) => onChange("defaultRevShareOther", v)}
          min={0} max={0.3} step={0.005}
          testId="field-defaultRevShareOther"
          researchRange="3%–10%"
        />
        <PctField
          label="Catering Boost"
          tooltip="Additional catering revenue uplift applied to events revenue. Represents incremental F&B from event catering."
          value={draft.defaultCateringBoostPct}
          fallback={DEFAULT_CATERING_BOOST_PCT}
          onChange={(_, v) => onChange("defaultCateringBoostPct", v)}
          min={0} max={0.5} step={0.01}
          testId="field-defaultCateringBoostPct"
          researchRange="5%–20%"
        />
      </Section>

      <Section grid title="USALI Operating Cost Rates" description="Uniform System of Accounts for the Lodging Industry — expense rates as a percentage of total revenue.">
        <PctField
          label="Housekeeping"
          tooltip="Housekeeping, front desk, guest supplies, linens. USALI Dept 1."
          value={draft.defaultCostRateRooms}
          fallback={DEFAULT_COST_RATE_ROOMS}
          onChange={(_, v) => onChange("defaultCostRateRooms", v)}
          min={0} max={0.4} step={0.005}
          testId="field-defaultCostRateRooms"
          researchRange="18%–25%"
        />
        <PctField
          label="F&B"
          tooltip="F&B cost of goods sold plus labor. USALI Dept 2."
          value={draft.defaultCostRateFb}
          fallback={DEFAULT_COST_RATE_FB}
          onChange={(_, v) => onChange("defaultCostRateFb", v)}
          min={0} max={0.4} step={0.005}
          testId="field-defaultCostRateFb"
          researchRange="5%–12%"
        />
        <PctField
          label="Admin & General"
          tooltip="General & Administrative expenses — accounting, HR, legal, office supplies. USALI undistributed."
          value={draft.defaultCostRateAdmin}
          fallback={DEFAULT_COST_RATE_ADMIN}
          onChange={(_, v) => onChange("defaultCostRateAdmin", v)}
          min={0} max={0.2} step={0.005}
          testId="field-defaultCostRateAdmin"
          researchRange="7%–10%"
        />
        <PctField
          label="Marketing"
          tooltip="Advertising, OTA commissions, sales team costs, loyalty programs."
          value={draft.defaultCostRateMarketing}
          fallback={DEFAULT_COST_RATE_MARKETING}
          onChange={(_, v) => onChange("defaultCostRateMarketing", v)}
          min={0} max={0.15} step={0.005}
          testId="field-defaultCostRateMarketing"
          researchRange="5%–8%"
        />
        <PctField
          label="Property Ops"
          tooltip="Building maintenance, grounds, engineering, repairs. USALI POM."
          value={draft.defaultCostRatePropertyOps}
          fallback={DEFAULT_COST_RATE_PROPERTY_OPS}
          onChange={(_, v) => onChange("defaultCostRatePropertyOps", v)}
          min={0} max={0.15} step={0.005}
          testId="field-defaultCostRatePropertyOps"
          researchRange="4%–7%"
        />
        <PctField
          label="Utilities"
          tooltip="Electric, water, gas, internet, telecom. Split between fixed base load and variable occupancy-driven costs."
          value={draft.defaultCostRateUtilities}
          fallback={DEFAULT_COST_RATE_UTILITIES}
          onChange={(_, v) => onChange("defaultCostRateUtilities", v)}
          min={0} max={0.15} step={0.005}
          testId="field-defaultCostRateUtilities"
          researchRange="3%–6%"
        />
        <PctField
          label="Property Taxes"
          tooltip="Real estate / property taxes as a rate of total revenue."
          value={draft.defaultCostRateTaxes}
          fallback={DEFAULT_COST_RATE_TAXES}
          onChange={(_, v) => onChange("defaultCostRateTaxes", v)}
          min={0} max={0.1} step={0.005}
          testId="field-defaultCostRateTaxes"
          researchRange="2%–4%"
        />
        <PctField
          label="IT"
          tooltip="PMS, POS, WiFi infrastructure, IT support, cybersecurity."
          value={draft.defaultCostRateIt}
          fallback={DEFAULT_COST_RATE_IT}
          onChange={(_, v) => onChange("defaultCostRateIt", v)}
          min={0} max={0.05} step={0.001}
          testId="field-defaultCostRateIt"
          researchRange="1%–3%"
        />
        <PctField
          label="FF&E Reserve"
          tooltip="Furniture, Fixtures & Equipment replacement reserve. Industry standard 4% of revenue for ongoing capital replacement."
          value={draft.defaultCostRateFfe}
          fallback={DEFAULT_COST_RATE_FFE}
          onChange={(_, v) => onChange("defaultCostRateFfe", v)}
          min={0} max={0.1} step={0.005}
          testId="field-defaultCostRateFfe"
          researchRange="3%–5%"
        />
        <PctField
          label="Insurance"
          tooltip="Property insurance — liability, property, business interruption coverage."
          value={draft.defaultCostRateInsurance}
          fallback={DEFAULT_COST_RATE_INSURANCE}
          onChange={(_, v) => onChange("defaultCostRateInsurance", v)}
          min={0} max={0.05} step={0.001}
          testId="field-defaultCostRateInsurance"
          researchRange="1%–2%"
        />
        <PctField
          label="Other"
          tooltip="Miscellaneous operating costs not captured in other categories."
          value={draft.defaultCostRateOther}
          fallback={DEFAULT_COST_RATE_OTHER}
          onChange={(_, v) => onChange("defaultCostRateOther", v)}
          min={0} max={0.15} step={0.005}
          testId="field-defaultCostRateOther"
          researchRange="1%–3%"
        />
      </Section>

      <Section grid title="Revenue Stream Expense Rates" description="Direct expense rates tied to specific ancillary revenue streams.">
        <PctField
          label="Event Expense Rate"
          tooltip="Cost ratio for event revenue (catering, staffing, setup)."
          value={draft.eventExpenseRate}
          fallback={0.5}
          onChange={onChange}
          min={0} max={1} step={0.01}
          testId="field-eventExpenseRate"
          researchRange="40%–60%"
        />
        <PctField
          label="Other Revenue Expense Rate"
          tooltip="Cost ratio for miscellaneous other revenue streams."
          value={draft.otherExpenseRate}
          fallback={0.3}
          onChange={onChange}
          min={0} max={1} step={0.01}
          testId="field-otherExpenseRate"
          researchRange="20%–40%"
        />
        <PctField
          label="Utilities Variable Split"
          tooltip="Percentage of utilities that vary with occupancy (vs. fixed base load)."
          value={draft.utilitiesVariableSplit}
          fallback={0.4}
          onChange={onChange}
          min={0} max={1} step={0.01}
          testId="field-utilitiesVariableSplit"
          researchRange="30%–50%"
        />
      </Section>

      <Section grid title="Acquisition Financing" description="Default loan terms applied when adding a new financed property.">
        <PctField
          label="LTV"
          tooltip="Loan-to-value ratio for acquisition debt."
          value={debt.acqLTV}
          fallback={0.75}
          onChange={(_, v) => onDebt("acqLTV", v)}
          min={0} max={1} step={0.01}
          testId="field-acqLTV"
          researchRange="60%–80%"
        />
        <PctField
          label="Interest Rate"
          tooltip="Annual interest rate for acquisition financing."
          value={debt.interestRate}
          fallback={0.09}
          onChange={(_, v) => onDebt("interestRate", v)}
          min={0} max={0.2} step={0.0025}
          testId="field-acqInterestRate"
          researchRange="6%–10%"
        />
        <NumberField
          label="Loan Term"
          tooltip="Loan amortization period in years."
          value={debt.amortizationYears}
          fallback={25}
          onChange={(_, v) => onDebt("amortizationYears", Math.round(v))}
          min={1} max={40} step={1}
          testId="field-acqTerm"
          researchRange="20–30 yrs"
        />
        <PctField
          label="Closing Costs"
          tooltip="Transaction costs as a percentage of purchase price."
          value={debt.acqClosingCostRate}
          fallback={0.02}
          onChange={(_, v) => onDebt("acqClosingCostRate", v)}
          min={0} max={0.1} step={0.0025}
          testId="field-acqClosingCost"
          researchRange="1%–3%"
        />
      </Section>

      <Section grid title="Refinance Terms" description="Default terms applied when modeling a property refinance event.">
        <PctField
          label="Refinance LTV"
          tooltip="Loan-to-value ratio for refinanced debt."
          value={debt.refiLTV}
          fallback={0.75}
          onChange={(_, v) => onDebt("refiLTV", v)}
          min={0} max={1} step={0.01}
          testId="field-refiLTV"
          researchRange="60%–80%"
        />
        <PctField
          label="Refinance Interest Rate"
          tooltip="Annual interest rate for refinanced loans."
          value={debt.refiInterestRate}
          fallback={0.09}
          onChange={(_, v) => onDebt("refiInterestRate", v)}
          min={0} max={0.2} step={0.0025}
          testId="field-refiInterestRate"
          researchRange="5%–9%"
        />
        <NumberField
          label="Refinance Term"
          tooltip="Amortization period for refinanced loans."
          value={debt.refiAmortizationYears}
          fallback={25}
          onChange={(_, v) => onDebt("refiAmortizationYears", Math.round(v))}
          min={1} max={40} step={1}
          testId="field-refiTerm"
          researchRange="20–30 yrs"
        />
        <PctField
          label="Refinance Closing Costs"
          tooltip="Transaction costs for refinancing as a percentage of new loan amount."
          value={debt.refiClosingCostRate}
          fallback={0.02}
          onChange={(_, v) => onDebt("refiClosingCostRate", v)}
          min={0} max={0.1} step={0.0025}
          testId="field-refiClosingCost"
          researchRange="0.5%–2%"
        />
      </Section>

      <Section grid title="Depreciation & Tax" description="Tax-related defaults for property underwriting.">
        <div className="col-span-full">
          <GovernedFieldWrapper
            authority="IRS Publication 946"
            label="Depreciation Years"
            helperText={<>39 years: nonresidential real property (hotels per IRC §168(e)(2)(A)). 27.5 years applies only to residential rental property. Changing this deviates from standard tax depreciation. Consult your tax advisor.</>}
            referenceUrl="https://www.irs.gov/publications/p946"
            defaultExpanded={false}
            data-testid="governed-depreciationYears"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-foreground label-text">Convention Value</Label>
                <EditableValue
                  value={draft.depreciationYears ?? 39}
                  onChange={(v) => onChange("depreciationYears", v)}
                  format="number"
                  min={1} max={50} step={0.5}
                />
              </div>
              <Slider
                value={[draft.depreciationYears ?? 39]}
                onValueChange={([v]) => onChange("depreciationYears", v)}
                min={1} max={50} step={0.5}
              />
            </div>
          </GovernedFieldWrapper>
        </div>
        <PctField
          label="Property Income Tax Rate"
          tooltip="Income tax rate applied to gain on property sale and operating income. This is NOT the real estate/ad valorem property tax — that is modeled as a USALI operating expense (costRateTaxes)."
          value={draft.defaultPropertyTaxRate}
          fallback={DEFAULT_PROPERTY_TAX_RATE}
          onChange={(_, v) => onChange("defaultPropertyTaxRate", v)}
          min={0} max={0.50} step={0.01}
          testId="field-defaultPropertyTaxRate"
          researchRange="20%–30%"
        />
        <PctField
          label="Land Value (%)"
          tooltip="Portion of total property value attributed to land (non-depreciable). IRS guidelines suggest 15-30% for commercial real estate."
          value={draft.defaultLandValuePercent}
          fallback={DEFAULT_LAND_VALUE_PERCENT}
          onChange={(_, v) => onChange("defaultLandValuePercent", v)}
          min={0.05} max={0.5} step={0.01}
          testId="field-defaultLandValuePercent"
          researchRange="15%–30%"
        />
        <PctField
          label="Property Inflation Rate"
          tooltip="Annual cost and revenue inflation rate applied at the property level. Drives expense escalation and ADR growth when no property-specific rate is set. Typically tracks CPI (1%–4%)."
          value={draft.inflationRate}
          fallback={DEFAULT_PROPERTY_INFLATION_RATE}
          onChange={(_, v) => onChange("inflationRate", v)}
          min={0} max={0.1} step={0.005}
          testId="field-inflationRate"
          researchRange="2%–4%"
        />
      </Section>

      <Section grid title="Exit & Disposition" description="Defaults for property sale/exit modeling.">
        <PctField
          label="Exit Cap Rate"
          tooltip="Capitalization rate used to estimate property value at disposition."
          value={draft.exitCapRate}
          fallback={0.085}
          onChange={onChange}
          min={0.03} max={0.15} step={0.0025}
          testId="field-exitCapRate"
          researchRange="6%–10%"
        />
        <PctField
          label="Sales Commission"
          tooltip="Broker commission rate applied at property sale."
          value={draft.salesCommissionRate}
          fallback={0.05}
          onChange={onChange}
          min={0} max={0.1} step={0.005}
          testId="field-salesCommissionRate"
          researchRange="3%–6%"
        />
        <PctField
          label="Acquisition Commission"
          tooltip="Broker commission rate applied at property acquisition."
          value={draft.commissionRate}
          fallback={0.05}
          onChange={onChange}
          min={0} max={0.1} step={0.005}
          testId="field-commissionRate"
          researchRange="1%–3%"
        />
      </Section>

      <Section grid title="Default Acquisition Package" description="Standard purchase assumptions pre-filled when adding a new property to the portfolio.">
        <DollarField
          label="Purchase Price"
          tooltip="Default property purchase price."
          value={acq.purchasePrice}
          fallback={5000000}
          onChange={(_, v) => onAcq("purchasePrice", v)}
          min={100000} max={100000000} step={100000}
          testId="field-purchasePrice"
          researchRange="$2M–$20M"
        />
        <DollarField
          label="Building Improvements"
          tooltip="Default capital for building improvements and renovations."
          value={acq.buildingImprovements}
          fallback={500000}
          onChange={(_, v) => onAcq("buildingImprovements", v)}
          min={0} max={50000000} step={50000}
          testId="field-buildingImprovements"
          researchRange="$250K–$5M"
        />
        <DollarField
          label="Pre-Opening Costs"
          tooltip="Costs incurred before the property begins operations (staffing, marketing, training)."
          value={acq.preOpeningCosts}
          fallback={150000}
          onChange={(_, v) => onAcq("preOpeningCosts", v)}
          min={0} max={5000000} step={10000}
          testId="field-preOpeningCosts"
          researchRange="$100K–$500K"
        />
        <DollarField
          label="Operating Reserve"
          tooltip="Cash reserve set aside for initial operations before stabilization."
          value={acq.operatingReserve}
          fallback={100000}
          onChange={(_, v) => onAcq("operatingReserve", v)}
          min={0} max={5000000} step={10000}
          testId="field-operatingReserve"
          researchRange="$50K–$300K"
        />
        <NumberField
          label="Months to Operations"
          tooltip="Expected months from closing to start of hotel operations."
          value={acq.monthsToOps}
          fallback={6}
          onChange={(_, v) => onAcq("monthsToOps", Math.round(v))}
          min={0} max={36} step={1}
          testId="field-monthsToOps"
          researchRange="3–12 mo"
        />
      </Section>
    </div>
  );
}
