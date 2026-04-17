/**
 * TaxSection.tsx — Corporate income tax rate for the management company.
 *
 * A simple section with a single slider controlling the effective corporate
 * tax rate applied to the management company's pre-tax income (EBITDA).
 * The default is typically 21% (current US federal corporate rate), but
 * users can adjust to model different jurisdictions or combined
 * federal + state effective rates.
 *
 * Tax is computed in the financial engine as:
 *   Tax = max(0, EBITDA × taxRate)
 * No tax is owed in loss years (the model does not currently carry
 * forward net operating losses / NOLs).
 */
import { Slider } from "@/components/ui/slider";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DEFAULT_COMPANY_TAX_RATE, PROJECTION_YEARS } from "@/lib/constants";
import EditableValue from "./EditableValue";
import type { TaxSectionProps } from "./types";

export default function TaxSection({ formData, onChange, global, researchValues }: TaxSectionProps) {
  const gc = (key: string, label?: string) => ({ entityType: "company" as const, entityId: 0, assumptionKey: key, fieldLabel: label });

  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
      <div className="relative space-y-6">
      {/* Operations Start Date + Projection Years moved here from
          CompanySetupSection so column 2 owns the projection-horizon controls
          alongside the company tax rate. */}
      <div className="space-y-3">
        <h3 className="text-lg font-display text-foreground">Projection Horizon</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label className="flex items-center text-foreground label-text">
              Operations Start Date
              <InfoTooltip text="The date when the management company begins operations, starts paying salaries, and incurs overhead costs" />
            </Label>
            <Input
              type="date"
              value={formData.companyOpsStartDate ?? global.companyOpsStartDate ?? "2026-06-01"}
              onChange={(e) => onChange("companyOpsStartDate", e.target.value)}
              className="bg-card border-border text-foreground"
              data-testid="input-company-ops-start-date"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="flex items-center text-foreground label-text">
              Projection Years
              <InfoTooltip text="Number of years to project financial statements. Affects all charts, tables, and verification checks." />
            </Label>
            <Input
              type="number"
              value={formData.projectionYears ?? global.projectionYears ?? PROJECTION_YEARS}
              onChange={(e) => onChange("projectionYears", Math.max(1, Math.min(30, parseInt(e.target.value) || PROJECTION_YEARS)))}
              min={1}
              max={30}
              className="bg-card border-border text-foreground"
              data-testid="input-projection-years"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-display text-foreground flex items-center gap-2">
          Company Income Tax
          <InfoTooltip text="Income tax rate applied to the management company's positive net income for after-tax cash flow calculations. Each property SPV has its own income tax rate set on its assumptions page." manualSection="company-formulas" />
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <ResearchContextFieldLabel
              label={<>Company Income Tax Rate <InfoTooltip text="Use the US federal corporate rate (21%) as a baseline, then adjust upward to model a combined federal + state effective rate for your jurisdiction." /></>}
              badgeProps={{ value: researchValues.companyTaxRate?.display, sourceType: "industry", sourceName: "AICPA/IRS benchmarks", "data-testid": "badge-company-tax" }}
              onApplyValue={() => researchValues.companyTaxRate && onChange("companyTaxRate", researchValues.companyTaxRate.mid / 100)}
              guidanceContext={gc("companyTaxRate", "Company Income Tax Rate")}
            />
            <EditableValue
              value={formData.companyTaxRate ?? global.companyTaxRate ?? DEFAULT_COMPANY_TAX_RATE}
              onChange={(v) => onChange("companyTaxRate", v)}
              format="percent"
              min={0}
              max={0.50}
              step={0.01}
            />
          </div>
          <Slider
            value={[(formData.companyTaxRate ?? global.companyTaxRate ?? DEFAULT_COMPANY_TAX_RATE) * 100]}
            onValueChange={([v]) => onChange("companyTaxRate", v / 100)}
            min={0}
            max={50}
            step={1}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Applied to positive net income to calculate after-tax cash flow
          </p>
        </div>
      </div>
    </div></div>
  );
}
