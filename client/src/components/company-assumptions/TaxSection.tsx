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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconPercent, IconCalendar, IconReceipt } from "@/components/icons";
import {
  DEFAULT_COMPANY_TAX_RATE,
  DEFAULT_COMPANY_INFLATION_RATE,
  DEFAULT_COMPANY_OPS_START_DATE,
  PROJECTION_YEARS,
} from "@/lib/constants";
import EditableValue from "./EditableValue";
import type { TaxSectionProps } from "./types";

export default function TaxSection({ formData, onChange, global, researchValues }: TaxSectionProps) {
  const gc = (key: string, label?: string) => ({ entityType: "company" as const, entityId: 0, assumptionKey: key, fieldLabel: label });

  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
      {/* Outer card title — mirrors CompanySetupSection's "Company Setup"
          heading + subtitle so column 2 reads as a peer of column 1, not as
          a different shape. min-h matches column 1 so the first inner Card
          aligns horizontally across the two columns even when one subtitle
          wraps to two lines. See
          .claude/skills/ui/page-column-card-pattern.md §"Header alignment". */}
      <div className="mb-6 min-h-[5.5rem]">
        <h2 className="text-xl font-display text-foreground">Financial & Macro</h2>
        <p className="label-text text-muted-foreground mt-1">
          Projection horizon, corporate income tax, and macro inflation
        </p>
      </div>
      <div className="relative space-y-6">
      {/* Inner-card pattern (matches column 1): every sub-section in a page
          column lives inside its own Card with header icon, title, and
          description. No bare h3 sections. See
          .claude/skills/ui/page-column-card-pattern.md */}
      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <IconCalendar className="w-4 h-4 text-muted-foreground" /> Projection Horizon
          </CardTitle>
          <CardDescription className="label-text">When operations begin and how many years to project</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="flex items-center text-foreground label-text">
                Operations Start Date
                <InfoTooltip text="The date when the management company begins operations, starts paying salaries, and incurs overhead costs" />
              </Label>
              <Input
                type="date"
                value={formData.companyOpsStartDate ?? global.companyOpsStartDate ?? DEFAULT_COMPANY_OPS_START_DATE}
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
        </CardContent>
      </Card>

      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <IconReceipt className="w-4 h-4 text-muted-foreground" /> Company Income Tax
            <InfoTooltip text="Income tax rate applied to the management company's positive net income for after-tax cash flow calculations. Each property SPV has its own income tax rate set on its assumptions page." manualSection="company-formulas" />
          </CardTitle>
          <CardDescription className="label-text">Effective corporate income tax rate applied to positive pre-tax income</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>Company Income Tax Rate <InfoTooltip text="Use the US federal corporate rate (21%) as a baseline, then adjust upward to model a combined federal + state effective rate for your jurisdiction." /></>}
                badgeProps={{ value: researchValues.companyTaxRate?.display, sourceType: "industry", sourceName: "AICPA/IRS benchmarks", "data-testid": "badge-company-tax" }}
                onApplyValue={() => researchValues.companyTaxRate && onChange("companyTaxRate", researchValues.companyTaxRate.mid / 100)}
                guidanceContext={gc("companyTaxRate", "Company Income Tax Rate")}
                className="text-foreground label-text"
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
            <p className="text-[10px] text-muted-foreground">
              Applied to positive net income to calculate after-tax cash flow
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Inflation Rate moved here from CompanySetupSection — it's a
          macro/policy assumption that belongs alongside Income Tax in
          page column 2, not inside the Identity/Contact card. */}
      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <IconPercent className="w-4 h-4 text-muted-foreground" /> Inflation rate used by Company
          </CardTitle>
          <CardDescription className="label-text">Specific inflation rate for management company overhead calculations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>Company Inflation Rate <InfoTooltip text="Overrides the global inflation rate for management company overhead cost escalation. If left empty, falls back to the global inflation rate. Three-tier cascade: property → company → global." /></>}
                badgeProps={{ value: researchValues.companyInflationRate?.display, sourceType: "industry", sourceName: "CPI / Fed Reserve", "data-testid": "badge-company-inflation" }}
                onApplyValue={() => researchValues.companyInflationRate && onChange("companyInflationRate", researchValues.companyInflationRate.mid / 100)}
                guidanceContext={gc("companyInflationRate", "Company Inflation Rate")}
                className="text-foreground label-text"
              />
              <span className="text-sm font-mono text-primary">
                {(formData.companyInflationRate ?? global.companyInflationRate) != null
                  ? `${(((formData.companyInflationRate ?? global.companyInflationRate) as number) * 100).toFixed(1)}%`
                  : "Default (Global)"}
              </span>
            </div>
            <Slider
              value={[((formData.companyInflationRate ?? global.companyInflationRate ?? DEFAULT_COMPANY_INFLATION_RATE) as number) * 100]}
              onValueChange={([v]) => onChange("companyInflationRate", v / 100)}
              min={0}
              max={10}
              step={0.1}
              data-testid="slider-company-inflation"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span>10%</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Falls back to global inflation if not set. Used for escalating management company overhead costs annually.
            </p>
          </div>
        </CardContent>
      </Card>

    </div></div>
  );
}
