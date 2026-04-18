import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_COMPANY_TAX_RATE,
  DEFAULT_COMPANY_OPS_START_DATE,
  DEFAULT_COST_OF_EQUITY,
  DEFAULT_PROJECTION_YEARS,
  DEFAULT_EXIT_CAP_RATE,
} from "@shared/constants";
import { Section, PctField, NumberField, TabBanner, type Draft } from "./FieldHelpers";

export function CompanyTab({ draft, onChange }: { draft: Draft; onChange: (field: string, value: any) => void }) {
  return (
    <div className="space-y-5">
      <TabBanner>
        Core company identity and financial structure defaults. These apply organization-wide and seed the management company model. Changes do not affect existing properties.
      </TabBanner>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
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

        <Section title="Exit Assumptions" description="Default valuation and sale parameters applied at property exit.">
          <PctField
            label="Exit Cap Rate"
            tooltip="Capitalization rate used to value properties at sale. A lower cap rate implies a higher exit price. Applied to projected NOI in the exit year to calculate terminal value."
            value={draft.exitCapRate}
            fallback={DEFAULT_EXIT_CAP_RATE}
            onChange={(_, v) => onChange("exitCapRate", v)}
            min={0.03}
            max={0.15}
            step={0.005}
            testId="field-exitCapRate"
            researchRange="5%–9%"
          />
          <PctField
            label="Sales Commission"
            tooltip="Broker commission as a percentage of gross sale price, applied at property exit. New properties inherit this default but can set their own rate on the assumptions page."
            value={draft.salesCommissionRate}
            fallback={0.05}
            onChange={(_, v) => onChange("salesCommissionRate", v)}
            min={0}
            max={0.10}
            step={0.005}
            testId="field-salesCommissionRate"
            researchRange="3%–6%"
          />
        </Section>
      </div>
    </div>
  );
}
