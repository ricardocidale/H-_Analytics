import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_COMPANY_OPS_START_DATE,
  DEFAULT_COST_OF_EQUITY,
  DEFAULT_PROJECTION_YEARS,
} from "@shared/constants";
import {
  DEFAULT_RUNWAY_BUFFER_MONTHS,
  DEFAULT_SIZING_OVERSHOOT_PCT,
  DEFAULT_REVENUE_RAMP_DELAY_MONTHS,
  DEFAULT_BURN_FLEX_DOWN_PCT,
} from "@shared/constants-funding";
import { getFactoryNumber } from "@shared/model-constants-registry";

// Audit #406: registry-backed US baseline for company income tax (federal corporate = 0.21).
const DEFAULT_COMPANY_TAX_RATE = getFactoryNumber("taxRate", "United States");
import { Section } from "@/components/ui/field-section";
import { PctField, NumberField, TabBanner, type Draft } from "./FieldHelpers";
import { AnalystActionButton } from "@/components/analyst/AnalystActionButton";
import { useFocusFieldFromUrl } from "@/lib/analyst-focus-field";
import type { AnalystGuidanceRecord } from "@/components/analyst/useAnalystRefresh";
import { COMPANY_TAB_ANALYST_FIELDS, toGuidanceKeys } from "./analyst-fields";

interface CompanyTabProps {
  draft: Draft;
  onChange: (field: string, value: any) => void;
  /** Analyst guidance records, scoped to the admin's company entity. */
  guidance?: AnalystGuidanceRecord[];
  /** Fires a scoped Analyst run for this tab's canonical field list. */
  onAnalystRefresh?: (fields?: string[]) => void;
  analystRunning?: boolean;
  analystCooldownMs?: number;
}

export function CompanyTab(props: CompanyTabProps) {
  const { draft, onChange, onAnalystRefresh, analystRunning, analystCooldownMs } =
    props;
  // Honour `?focus=<fieldId>` deep links produced by the Analyst verdict
  // mount-point resolver (task #765). CompanyTab fields whose registry
  // mountPoint is `defaults/management-company` (e.g. `baseManagementFee`,
  // `companyTaxRate`, `costOfEquity`) land here; this hook scrolls and
  // focuses the matching `data-testid="field-<id>"` input on mount.
  useFocusFieldFromUrl();
  const analystEnabled = typeof onAnalystRefresh === "function";
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <TabBanner>
          Core company identity and financial structure defaults. These apply organization-wide and seed the management company model. Changes do not affect existing properties.
        </TabBanner>
        {analystEnabled && (
          <div className="shrink-0">
            <AnalystActionButton
              variant="header"
              running={analystRunning}
              cooldownRemainingMs={analystCooldownMs}
              onClick={() =>
                onAnalystRefresh?.(toGuidanceKeys(COMPANY_TAB_ANALYST_FIELDS))
              }
              testIdSuffix="company"
            />
          </div>
        )}
      </div>

      {/* Single grid containing all three Sections so the page can flow up to
          three columns side-by-side on xl+ screens (and four on 2xl). The
          previous layout split Identity/Fee Structure into one grid and
          Financial Defaults into a second grid below, which forced
          Financial Defaults onto its own row even when the viewport had
          room for a third column. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5 items-start">
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
    </div>
  );
}
