import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { GovernedFieldWrapper } from "@/components/ui/governed-field";
import EditableValue from "@/components/company-assumptions/EditableValue";
import { Section, PctField, TabBanner, MONTHS, type Draft } from "./FieldHelpers";

export function MarketMacroTab({ draft, onChange }: { draft: Draft; onChange: (field: string, value: any) => void }) {
  return (
    <div className="space-y-5">
      <TabBanner>
        Global economic assumptions that affect all projections across the platform. Changes here recalculate every property and the management company model.
      </TabBanner>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
        <Section grid title="Economic Environment" description="Core macroeconomic rates used in DCF, NPV, and cost escalation calculations.">
          <PctField
            label="Macro Inflation Rate"
            tooltip="Annual inflation rate applied to cost escalations and revenue growth projections across all properties."
            value={draft.inflationRate}
            fallback={0.03}
            onChange={onChange}
            min={0} max={0.15} step={0.005}
            testId="field-inflationRate"
          />
          <PctField
            label="Cost of Equity"
            tooltip="Required return on equity for DCF and NPV calculations. Industry standard is 18% for private hospitality investments."
            value={draft.costOfEquity}
            fallback={0.18}
            onChange={onChange}
            min={0.05} max={0.35} step={0.005}
            testId="field-costOfEquity"
          />
          <div className="pt-2 col-span-full">
            <GovernedFieldWrapper
              authority="Industry Convention (365/12)"
              label="Days Per Month"
              helperText="Standard day count convention used across the hospitality industry. 30.5 = 365 days / 12 months. Changing this value affects all revenue and expense calculations across every property."
              defaultExpanded={false}
              data-testid="governed-daysPerMonth"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-foreground label-text">Convention Value</Label>
                  <EditableValue
                    value={draft.daysPerMonth ?? 30.5}
                    onChange={(v) => onChange("daysPerMonth", v)}
                    format="number"
                    min={28} max={31} step={0.5}
                  />
                </div>
                <Slider
                  value={[draft.daysPerMonth ?? 30.5]}
                  onValueChange={([v]) => onChange("daysPerMonth", v)}
                  min={28} max={31} step={0.5}
                />
              </div>
            </GovernedFieldWrapper>
          </div>
        </Section>

        <Section title="Fiscal Calendar" description="Controls the fiscal year alignment for financial reporting.">
          <div className="flex items-center justify-between col-span-full" data-testid="field-fiscalYearStartMonth">
            <Label className="flex items-center text-foreground label-text">
              Fiscal Year Start Month
              <InfoTooltip text="The month when the fiscal year begins. Affects how annual summaries are grouped." />
            </Label>
            <Select
              value={String(draft.fiscalYearStartMonth ?? 1)}
              onValueChange={(v) => onChange("fiscalYearStartMonth", parseInt(v))}
            >
              <SelectTrigger className="w-40 bg-card border-border" data-testid="select-fiscalYearStartMonth">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Section>
      </div>
    </div>
  );
}
