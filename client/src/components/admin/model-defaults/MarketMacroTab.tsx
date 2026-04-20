import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Section, PctField, TabBanner, MONTHS, type Draft } from "./FieldHelpers";
import { AnalystActionButton } from "@/components/analyst/AnalystActionButton";
import type { AnalystGuidanceRecord } from "@/components/analyst/useAnalystRefresh";
import { MARKET_MACRO_TAB_ANALYST_FIELDS, toGuidanceKeys } from "./analyst-fields";

interface MarketMacroTabProps {
  draft: Draft;
  onChange: (field: string, value: any) => void;
  guidance?: AnalystGuidanceRecord[];
  onAnalystRefresh?: (fields?: string[]) => void;
  analystRunning?: boolean;
  analystCooldownMs?: number;
}

export function MarketMacroTab(props: MarketMacroTabProps) {
  const { draft, onChange, onAnalystRefresh, analystRunning, analystCooldownMs } =
    props;
  const analystEnabled = typeof onAnalystRefresh === "function";
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <TabBanner>
          Global economic assumptions that affect all projections across the platform. Changes here recalculate every property and the management company model.
        </TabBanner>
        {analystEnabled && (
          <div className="shrink-0">
            <AnalystActionButton
              variant="header"
              running={analystRunning}
              cooldownRemainingMs={analystCooldownMs}
              onClick={() =>
                onAnalystRefresh?.(toGuidanceKeys(MARKET_MACRO_TAB_ANALYST_FIELDS))
              }
              testIdSuffix="market-macro"
            />
          </div>
        )}
      </div>

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
          {/*
            Days Per Month was previously editable here. As of Phase 4 of the
            Model Constants migration it is governed centrally in
            Admin → Model Constants (registry key `daysPerMonth`,
            authority: AHLA convention 365/12). Removed from this tab to
            establish a single edit point and prevent drift between user
            assumption and governed constant. The DB column on
            `globalAssumptions` stays in place (engine still reads it,
            default 30.5) until Phase 5 wires the engine to read directly
            from `getEffectiveConstant`.
          */}
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
