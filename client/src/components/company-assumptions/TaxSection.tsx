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
import { DEFAULT_COMPANY_TAX_RATE } from "@/lib/constants";
import EditableValue from "./EditableValue";
import type { TaxSectionProps } from "./types";

export default function TaxSection({ formData, onChange, global, researchValues }: TaxSectionProps) {
  const gc = (key: string, label?: string) => ({ entityType: "company" as const, entityId: 0, assumptionKey: key, fieldLabel: label });

  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
      <div className="relative">
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
