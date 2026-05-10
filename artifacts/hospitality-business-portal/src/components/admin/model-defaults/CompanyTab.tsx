import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_COMPANY_OPS_START_DATE,
  DEFAULT_COST_OF_EQUITY,
  DEFAULT_PROJECTION_YEARS,
  DEFAULT_FIXED_COST_ESCALATION_RATE,
  DEFAULT_MISC_OPS_RATE,
  DEFAULT_MARKETING_RATE,
} from "@shared/constants";
import {
  DEFAULT_RUNWAY_BUFFER_MONTHS,
  DEFAULT_SIZING_OVERSHOOT_PCT,
  DEFAULT_REVENUE_RAMP_DELAY_MONTHS,
  DEFAULT_BURN_FLEX_DOWN_PCT,
} from "@shared/constants-funding";
import {
  DEFAULT_OFFICE_LEASE_BENCHMARK_MID,
  DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_MID,
  DEFAULT_TECH_INFRA_BENCHMARK_MID,
  DEFAULT_BUSINESS_INSURANCE_BENCHMARK_MID,
  DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_MID,
  DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_MID,
} from "@shared/constants-overhead-benchmarks";
import { DEFAULT_STAFF_SALARY_BENCHMARK_MID } from "@shared/constants-compensation-benchmarks";
import { getFactoryNumber } from "@shared/model-constants-registry";

// Audit #406: registry-backed US baseline for company income tax (federal corporate = 0.21).
const DEFAULT_COMPANY_TAX_RATE = getFactoryNumber("taxRate", "United States");
import { Section } from "@/components/ui/field-section";
import { PctField, NumberField, DollarField, type Draft } from "./FieldHelpers";
import { AnalystActionButton } from "@/components/analyst/AnalystActionButton";
import { SaveButton } from "@/components/ui/save-button";
import { useFocusFieldFromUrl } from "@/lib/analyst-focus-field";
import type { AnalystGuidanceRecord } from "@/components/analyst/useAnalystRefresh";
import { COMPANY_TAB_ANALYST_FIELDS, toGuidanceKeys } from "./analyst-fields";
import { IconArrowUp } from "@/components/icons";

interface CompanyTabProps {
  draft: Draft;
  onChange: (field: string, value: any) => void;
  /** Analyst guidance records, scoped to the admin's company entity. */
  guidance?: AnalystGuidanceRecord[];
  /** Fires a scoped Analyst run for this tab's canonical field list. */
  onAnalystRefresh?: (fields?: string[]) => void;
  analystRunning?: boolean;
  analystCooldownMs?: number;
  /** Whether there are unsaved changes. Controls Cancel button visibility. */
  isDirty?: boolean;
  /** Whether a save mutation is in flight. */
  isPending?: boolean;
  /** Called when the Save button inside the tab is clicked. */
  onSave?: () => void;
  /** Called when Cancel is clicked — discards unsaved changes. */
  onReset?: () => void;
}

export function CompanyTab(props: CompanyTabProps) {
  const {
    draft,
    onChange,
    onAnalystRefresh,
    analystRunning,
    analystCooldownMs,
    isDirty = false,
    isPending = false,
    onSave,
    onReset,
  } = props;
  // Honour `?focus=<fieldId>` deep links produced by the Analyst verdict
  // mount-point resolver (task #765). CompanyTab fields whose registry
  // mountPoint is `defaults/management-company` (e.g. `baseManagementFee`,
  // `companyTaxRate`, `costOfEquity`) land here; this hook scrolls and
  // focuses the matching `data-testid="field-<id>"` input on mount.
  useFocusFieldFromUrl();
  const analystEnabled = typeof onAnalystRefresh === "function";

  return (
    <div className="space-y-4">
      {/* Top action bar: description left, buttons right */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
        <p className="text-sm font-body text-muted-foreground">
          Core company identity and financial structure defaults. These apply
          organization-wide and seed the management company model. Changes do
          not affect existing properties.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {isDirty && onReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              data-testid="button-company-tab-cancel"
            >
              Cancel
            </Button>
          )}
          {analystEnabled && (
            <AnalystActionButton
              variant="header"
              running={analystRunning}
              cooldownRemainingMs={analystCooldownMs}
              onClick={() =>
                onAnalystRefresh?.(toGuidanceKeys(COMPANY_TAB_ANALYST_FIELDS))
              }
              testIdSuffix="company"
            />
          )}
          {onSave && (
            <SaveButton
              onClick={onSave}
              hasChanges={isDirty}
              isPending={isPending}
              alwaysActive
              size="sm"
              data-testid="button-company-tab-save"
            />
          )}
        </div>
      </div>

      {/* Inner tabs: Company / Fees & Financials / Funding / Overhead / Compensation */}
      <Tabs defaultValue="company" className="space-y-4">
        <TabsList className="bg-muted/50 border border-border/60">
          <TabsTrigger value="company" data-testid="inner-tab-company">Company</TabsTrigger>
          <TabsTrigger value="fees-financials" data-testid="inner-tab-fees-financials">Fees &amp; Financials</TabsTrigger>
          <TabsTrigger value="funding" data-testid="inner-tab-funding">Funding</TabsTrigger>
          <TabsTrigger value="overhead" data-testid="inner-tab-overhead">Overhead</TabsTrigger>
          <TabsTrigger value="compensation" data-testid="inner-tab-compensation">Compensation</TabsTrigger>
        </TabsList>

        {/* Identity + Contact & Location sections */}
        <TabsContent value="company">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
            <Section title="Identity" description="The management company name and projection horizon used throughout the platform.">
              <div className="space-y-4">
                <div className="space-y-2" data-testid="field-companyName">
                  <Label className="flex items-center gap-1 text-foreground label-text">
                    Company Name
                    <InfoTooltip text="Displayed in the navigation header, reports, and PDF exports. Changing this updates the brand name everywhere." />
                  </Label>
                  <Input
                    value={draft.companyName ?? "Hospitality Business"}
                    onChange={(e) => onChange("companyName", e.target.value)}
                    className="bg-card border-border"
                    placeholder="e.g., Hospitality Business Group"
                    data-testid="input-companyName"
                  />
                </div>

                <div className="space-y-2" data-testid="field-companyOpsStartDate">
                  <Label className="flex items-center gap-1 text-foreground label-text">
                    Operations Start Date
                    <InfoTooltip text="When the management company begins incurring overhead and paying salaries. Revenue projections and the company income statement start from this date." />
                  </Label>
                  <Input
                    type="date"
                    value={draft.companyOpsStartDate ?? DEFAULT_COMPANY_OPS_START_DATE}
                    onChange={(e) => onChange("companyOpsStartDate", e.target.value)}
                    className="bg-card border-border"
                    data-testid="input-companyOpsStartDate"
                  />
                </div>

                <NumberField
                  label="Projection Years"
                  tooltip="Number of years to project financial statements. Affects all charts, tables, and verification checks. Applies to both the management company and all properties."
                  value={draft.projectionYears}
                  fallback={DEFAULT_PROJECTION_YEARS}
                  onChange={(_, v) => onChange("projectionYears", Math.round(v))}
                  min={1}
                  max={30}
                  step={1}
                  testId="field-projectionYears"
                  researchRange="5–15 years"
                />
              </div>
            </Section>

            <Section title="Contact & Location" description="Management company contact details and registered address. Displayed on reports and PDF exports.">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2" data-testid="field-companyPhone">
                    <Label className="flex items-center gap-1 text-foreground label-text">
                      Phone
                      <InfoTooltip text="Company phone number for reports and investor documents." />
                    </Label>
                    <Input
                      value={draft.companyPhone ?? ""}
                      onChange={(e) => onChange("companyPhone", e.target.value || null)}
                      className="bg-card border-border"
                      placeholder="e.g., +1 (212) 555-0100"
                      data-testid="input-companyPhone"
                    />
                  </div>
                  <div className="space-y-2" data-testid="field-companyEmail">
                    <Label className="flex items-center gap-1 text-foreground label-text">
                      Email
                      <InfoTooltip text="Primary contact email for the management company." />
                    </Label>
                    <Input
                      type="email"
                      value={draft.companyEmail ?? ""}
                      onChange={(e) => onChange("companyEmail", e.target.value || null)}
                      className="bg-card border-border"
                      placeholder="e.g., info@company.com"
                      data-testid="input-companyEmail"
                    />
                  </div>
                </div>
                <div className="space-y-2" data-testid="field-companyWebsite">
                  <Label className="flex items-center gap-1 text-foreground label-text">
                    Website
                    <InfoTooltip text="Company website URL shown on investor reports." />
                  </Label>
                  <Input
                    value={draft.companyWebsite ?? ""}
                    onChange={(e) => onChange("companyWebsite", e.target.value || null)}
                    className="bg-card border-border"
                    placeholder="e.g., https://yourcompany.com"
                    data-testid="input-companyWebsite"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2" data-testid="field-companyEin">
                    <Label className="flex items-center gap-1 text-foreground label-text">
                      EIN / Tax ID
                      <InfoTooltip text="Employer Identification Number or tax registration number. Displayed on financial reports." />
                    </Label>
                    <Input
                      value={draft.companyEin ?? ""}
                      onChange={(e) => onChange("companyEin", e.target.value || null)}
                      className="bg-card border-border"
                      placeholder="e.g., 12-3456789"
                      data-testid="input-companyEin"
                    />
                  </div>
                  <div className="space-y-2" data-testid="field-companyFoundingYear">
                    <Label className="flex items-center gap-1 text-foreground label-text">
                      Founding Year
                      <InfoTooltip text="Year the management company was incorporated or founded." />
                    </Label>
                    <Input
                      type="number"
                      value={draft.companyFoundingYear ?? ""}
                      onChange={(e) => onChange("companyFoundingYear", e.target.value ? Number(e.target.value) : null)}
                      className="bg-card border-border"
                      placeholder="e.g., 2024"
                      min={1900}
                      max={2100}
                      data-testid="input-companyFoundingYear"
                    />
                  </div>
                </div>
                <div className="space-y-2" data-testid="field-companyStreetAddress">
                  <Label className="flex items-center gap-1 text-foreground label-text">
                    Street Address
                    <InfoTooltip text="Registered office street address." />
                  </Label>
                  <Input
                    value={draft.companyStreetAddress ?? ""}
                    onChange={(e) => onChange("companyStreetAddress", e.target.value || null)}
                    className="bg-card border-border"
                    placeholder="e.g., 150 West Main Street, Suite 400"
                    data-testid="input-companyStreetAddress"
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-2 col-span-2 sm:col-span-1" data-testid="field-companyCity">
                    <Label className="label-text text-foreground">City</Label>
                    <Input
                      value={draft.companyCity ?? ""}
                      onChange={(e) => onChange("companyCity", e.target.value || null)}
                      className="bg-card border-border"
                      placeholder="City"
                      data-testid="input-companyCity"
                    />
                  </div>
                  <div className="space-y-2" data-testid="field-companyStateProvince">
                    <Label className="label-text text-foreground">State / Province</Label>
                    <Input
                      value={draft.companyStateProvince ?? ""}
                      onChange={(e) => onChange("companyStateProvince", e.target.value || null)}
                      className="bg-card border-border"
                      placeholder="State"
                      data-testid="input-companyStateProvince"
                    />
                  </div>
                  <div className="space-y-2" data-testid="field-companyZipPostalCode">
                    <Label className="label-text text-foreground">Zip / Postal Code</Label>
                    <Input
                      value={draft.companyZipPostalCode ?? ""}
                      onChange={(e) => onChange("companyZipPostalCode", e.target.value || null)}
                      className="bg-card border-border"
                      placeholder="Zip"
                      data-testid="input-companyZipPostalCode"
                    />
                  </div>
                </div>
                <div className="space-y-2" data-testid="field-companyCountry">
                  <Label className="label-text text-foreground">Country</Label>
                  <Input
                    value={draft.companyCountry ?? ""}
                    onChange={(e) => onChange("companyCountry", e.target.value || null)}
                    className="bg-card border-border"
                    placeholder="e.g., United States"
                    data-testid="input-companyCountry"
                  />
                </div>
              </div>
            </Section>
          </div>
        </TabsContent>

        {/* Fee Structure + Financial Defaults sections */}
        <TabsContent value="fees-financials">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
            <Section title="Fee Structure" description="Default management fee rates applied when creating new properties. Each property can override these individually.">
              <PctField
                label="Base Management Fee"
                tooltip="Percentage of each property's total revenue charged as the base management fee. Deducted from NOI to arrive at ANOI per USALI 12th Ed. New properties inherit this rate but can override it."
                value={draft.baseManagementFee}
                fallback={DEFAULT_BASE_MANAGEMENT_FEE_RATE}
                onChange={(_, v) => onChange("baseManagementFee", v)}
                min={0}
                max={0.20}
                step={0.005}
                testId="field-baseManagementFee"
                researchRange="6%–10%"
              />
              <PctField
                label="Incentive Management Fee"
                tooltip="Performance bonus charged as a percentage of Gross Operating Profit (GOP). Only applies when GOP is positive — collected for strong property performance."
                value={draft.incentiveManagementFee}
                fallback={DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE}
                onChange={(_, v) => onChange("incentiveManagementFee", v)}
                min={0}
                max={0.30}
                step={0.005}
                testId="field-incentiveManagementFee"
                researchRange="10%–20%"
              />
            </Section>

            <Section title="Financial Defaults" description="Tax and return assumptions for the management company model.">
              <PctField
                label="Company Income Tax Rate"
                tooltip="Effective corporate tax rate applied to the management company's positive net income. Use 21% as the US federal baseline, then adjust for your state's combined rate."
                value={draft.companyTaxRate}
                fallback={DEFAULT_COMPANY_TAX_RATE}
                onChange={(_, v) => onChange("companyTaxRate", v)}
                min={0}
                max={0.50}
                step={0.01}
                testId="field-companyTaxRate"
                researchRange="21%–35%"
              />
              <PctField
                label="Cost of Equity"
                tooltip="The equity investor's required annual return, used as the Re component in WACC and DCF calculations. This is the hurdle rate — the minimum return needed to justify the investment risk."
                value={draft.costOfEquity}
                fallback={DEFAULT_COST_OF_EQUITY}
                onChange={(_, v) => onChange("costOfEquity", v)}
                min={0.05}
                max={0.40}
                step={0.005}
                testId="field-costOfEquity"
                researchRange="15%–25%"
              />
            </Section>
          </div>
        </TabsContent>

        {/* Funding Specialist Inputs section */}
        <TabsContent value="funding">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
            <Section title="Funding Specialist Inputs" description="Capital-stack discipline defaults the Funding Specialist evaluates against the live capital-raise benchmarks. New properties and the company plan inherit these as the starting point; admins can override here.">
              <NumberField
                label="Runway Buffer"
                tooltip="Months of runway buffer past the company operations start date. Sized so the plan does not run dry the day revenue should arrive — the Specialist flags raises with less than this cushion."
                value={draft.runwayBufferMonths}
                fallback={DEFAULT_RUNWAY_BUFFER_MONTHS}
                onChange={(_, v) => onChange("runwayBufferMonths", v)}
                min={3}
                max={24}
                step={1}
                testId="field-runwayBufferMonths"
                researchRange="6–12 months"
              />
              <PctField
                label="Sizing Overshoot"
                tooltip="Headroom over the modeled cash need, expressed as a percent of the modeled raise. Covers slippage between plan and actual; the Specialist prefers raises sized at or above the mid-band."
                value={draft.sizingOvershootPct}
                fallback={DEFAULT_SIZING_OVERSHOOT_PCT}
                onChange={(_, v) => onChange("sizingOvershootPct", v)}
                min={0}
                max={0.50}
                step={0.01}
                testId="field-sizingOvershootPct"
                researchRange="10%–35%"
              />
              <NumberField
                label="Revenue Ramp Delay"
                tooltip="Months between operations start and the first material property revenue. Used to size the operating reserve and validate the gap between raise dates and revenue arrival."
                value={draft.revenueRampDelayMonths}
                fallback={DEFAULT_REVENUE_RAMP_DELAY_MONTHS}
                onChange={(_, v) => onChange("revenueRampDelayMonths", v)}
                min={1}
                max={18}
                step={1}
                testId="field-revenueRampDelayMonths"
                researchRange="3–9 months"
              />
              <PctField
                label="Burn Flex-Down"
                tooltip="Discretionary headroom in the burn plan that can be cut without breaking operations, as a percent of plan burn. Quantifies how much the company can absorb before a covenant or runway tripwire fires."
                value={draft.burnFlexDownPct}
                fallback={DEFAULT_BURN_FLEX_DOWN_PCT}
                onChange={(_, v) => onChange("burnFlexDownPct", v)}
                min={0}
                max={0.50}
                step={0.01}
                testId="field-burnFlexDownPct"
                researchRange="10%–30%"
              />
            </Section>
          </div>
        </TabsContent>

        {/* Overhead Defaults section */}
        <TabsContent value="overhead">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
            <Section title="Overhead Defaults" description="Starting annual costs for the management company's fixed and variable overhead. New companies inherit these as seed values; each can override them individually.">
              <DollarField
                label="Office Lease"
                tooltip="Annual rent for the management company's corporate office — covers rent, utilities, and common area charges. Year 1 value; escalates annually at the fixed-cost escalation rate."
                value={draft.officeLeaseStart}
                fallback={DEFAULT_OFFICE_LEASE_BENCHMARK_MID}
                onChange={(_, v) => onChange("officeLeaseStart", v)}
                min={0}
                max={200_000}
                step={2_000}
                testId="field-officeLeaseStart"
                researchRange="$24K–$48K/yr"
              />
              <DollarField
                label="Professional Services"
                tooltip="Annual budget for external legal counsel, CPA/audit fees, and specialized consulting. Year 1 value; escalates annually."
                value={draft.professionalServicesStart}
                fallback={DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_MID}
                onChange={(_, v) => onChange("professionalServicesStart", v)}
                min={0}
                max={150_000}
                step={2_000}
                testId="field-professionalServicesStart"
                researchRange="$18K–$36K/yr"
              />
              <DollarField
                label="Tech Infrastructure"
                tooltip="Company-level technology costs — cloud hosting, corporate software, cybersecurity, and IT support. Separate from per-property IT licenses. Year 1 value; escalates annually."
                value={draft.techInfraStart}
                fallback={DEFAULT_TECH_INFRA_BENCHMARK_MID}
                onChange={(_, v) => onChange("techInfraStart", v)}
                min={0}
                max={100_000}
                step={2_000}
                testId="field-techInfraStart"
                researchRange="$12K–$24K/yr"
              />
              <DollarField
                label="Business Insurance"
                tooltip="Annual corporate insurance premium — general liability, E&O, and cyber liability for the management company. Year 1 value; escalates annually."
                value={draft.businessInsuranceStart}
                fallback={DEFAULT_BUSINESS_INSURANCE_BENCHMARK_MID}
                onChange={(_, v) => onChange("businessInsuranceStart", v)}
                min={0}
                max={100_000}
                step={1_000}
                testId="field-businessInsuranceStart"
                researchRange="$8K–$15K/yr"
              />
              <DollarField
                label="Travel Cost per Property"
                tooltip="Annual travel budget allocated per managed property — site visits, owner meetings, and market tours. Scales with portfolio size."
                value={draft.travelCostPerClient}
                fallback={DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_MID}
                onChange={(_, v) => onChange("travelCostPerClient", v)}
                min={0}
                max={50_000}
                step={1_000}
                testId="field-travelCostPerClient"
                researchRange="$8K–$18K/property"
              />
              <DollarField
                label="IT License per Property"
                tooltip="Annual per-property software license cost — PMS, revenue management, and channel manager subscriptions charged at the property level."
                value={draft.itLicensePerClient}
                fallback={DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_MID}
                onChange={(_, v) => onChange("itLicensePerClient", v)}
                min={0}
                max={20_000}
                step={500}
                testId="field-itLicensePerClient"
                researchRange="$2K–$5K/property"
              />
              <PctField
                label="Marketing Rate"
                tooltip="Company-level marketing spend as a percentage of total managed revenue. Covers brand, digital, and PR activities for the management company (not individual property marketing budgets)."
                value={draft.marketingRate}
                fallback={DEFAULT_MARKETING_RATE}
                onChange={(_, v) => onChange("marketingRate", v)}
                min={0}
                max={0.15}
                step={0.005}
                testId="field-marketingRate"
                researchRange="3%–8%"
              />
              <PctField
                label="Misc Operations Rate"
                tooltip="Catch-all variable overhead expressed as a percent of total managed revenue — office supplies, memberships, recruiting, and other recurring operating costs not captured above."
                value={draft.miscOpsRate}
                fallback={DEFAULT_MISC_OPS_RATE}
                onChange={(_, v) => onChange("miscOpsRate", v)}
                min={0}
                max={0.10}
                step={0.005}
                testId="field-miscOpsRate"
                researchRange="1%–5%"
              />
              <PctField
                label="Fixed Cost Escalation Rate"
                tooltip="Annual inflation factor applied to all fixed overhead costs (office lease, professional services, tech). Compounds each year — a 3% rate means costs grow ~34% over 10 years."
                value={draft.fixedCostEscalationRate}
                fallback={DEFAULT_FIXED_COST_ESCALATION_RATE}
                onChange={(_, v) => onChange("fixedCostEscalationRate", v)}
                min={0}
                max={0.10}
                step={0.005}
                testId="field-fixedCostEscalationRate"
                researchRange="2%–5%"
              />
            </Section>
          </div>
        </TabsContent>

        {/* Compensation Defaults section */}
        <TabsContent value="compensation">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
            <Section title="Compensation Defaults" description="Staff salary and portfolio-based staffing tiers. These seed new companies and can be overridden on a per-company basis.">
              <DollarField
                label="Staff Salary (avg)"
                tooltip="Average annual salary per full-time staff member. Total staff cost depends on how many FTEs the portfolio size requires (see tiers below). As properties are added, the plan steps up to the next staffing tier."
                value={draft.staffSalary}
                fallback={DEFAULT_STAFF_SALARY_BENCHMARK_MID}
                onChange={(_, v) => onChange("staffSalary", v)}
                min={40_000}
                max={200_000}
                step={5_000}
                testId="field-staffSalary"
                researchRange="$50K–$120K"
              />
              <div className="pt-3 border-t border-border/60 space-y-2">
                <Label className="flex items-center gap-1 text-foreground label-text font-medium">
                  Staffing Tiers
                  <InfoTooltip text="Portfolio-based staffing model. As the number of managed properties grows the company steps up to a higher headcount tier. Each tier sets the FTE count for a range of property counts." />
                </Label>
                <p className="text-xs text-muted-foreground">FTE headcount by portfolio size bracket</p>
                <div className="grid grid-cols-1 gap-2 mt-2">
                  <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 text-sm">
                    <span className="text-muted-foreground w-14 shrink-0">Tier 1:</span>
                    <span className="text-xs text-muted-foreground">Up to</span>
                    <Input
                      type="number"
                      value={draft.staffTier1MaxProperties ?? 3}
                      onChange={(e) => onChange("staffTier1MaxProperties", Math.max(1, parseInt(e.target.value) || 3))}
                      min={1}
                      max={20}
                      className="w-14 h-7 bg-card border-border text-foreground text-center text-xs"
                      data-testid="input-admin-tier1-max"
                    />
                    <span className="text-xs text-muted-foreground">props →</span>
                    <Input
                      type="number"
                      value={draft.staffTier1Fte ?? 2.5}
                      onChange={(e) => onChange("staffTier1Fte", Math.max(0.5, parseFloat(e.target.value) || 2.5))}
                      min={0.5}
                      max={20}
                      step={0.5}
                      className="w-16 h-7 bg-card border-border text-foreground text-center text-xs"
                      data-testid="input-admin-tier1-fte"
                    />
                    <span className="text-xs text-muted-foreground">FTE</span>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 text-sm">
                    <span className="text-muted-foreground w-14 shrink-0">Tier 2:</span>
                    <span className="text-xs text-muted-foreground">Up to</span>
                    <Input
                      type="number"
                      value={draft.staffTier2MaxProperties ?? 6}
                      onChange={(e) => onChange("staffTier2MaxProperties", Math.max(1, parseInt(e.target.value) || 6))}
                      min={1}
                      max={30}
                      className="w-14 h-7 bg-card border-border text-foreground text-center text-xs"
                      data-testid="input-admin-tier2-max"
                    />
                    <span className="text-xs text-muted-foreground">props →</span>
                    <Input
                      type="number"
                      value={draft.staffTier2Fte ?? 4.5}
                      onChange={(e) => onChange("staffTier2Fte", Math.max(0.5, parseFloat(e.target.value) || 4.5))}
                      min={0.5}
                      max={30}
                      step={0.5}
                      className="w-16 h-7 bg-card border-border text-foreground text-center text-xs"
                      data-testid="input-admin-tier2-fte"
                    />
                    <span className="text-xs text-muted-foreground">FTE</span>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 text-sm">
                    <span className="text-muted-foreground w-14 shrink-0">Tier 3:</span>
                    <span className="text-xs text-muted-foreground">Above Tier 2 →</span>
                    <Input
                      type="number"
                      value={draft.staffTier3Fte ?? 7}
                      onChange={(e) => onChange("staffTier3Fte", Math.max(0.5, parseFloat(e.target.value) || 7))}
                      min={0.5}
                      max={50}
                      step={0.5}
                      className="w-16 h-7 bg-card border-border text-foreground text-center text-xs"
                      data-testid="input-admin-tier3-fte"
                    />
                    <span className="text-xs text-muted-foreground">FTE</span>
                  </div>
                </div>
              </div>
            </Section>
          </div>
        </TabsContent>
      </Tabs>

      {/* Back to top — fixed, centered at viewport bottom */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground bg-card/90 backdrop-blur-sm shadow-md pointer-events-auto"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
          data-testid="button-company-tab-back-to-top"
        >
          <IconArrowUp className="w-4 h-4" aria-hidden="true" />
          Back to top
        </Button>
      </div>
    </div>
  );
}
