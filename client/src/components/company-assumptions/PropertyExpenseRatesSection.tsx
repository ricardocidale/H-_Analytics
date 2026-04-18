/**
 * PropertyExpenseRatesSection.tsx — Default USALI expense rates for new properties.
 *
 * Sets the global default operating expense percentages that are applied to
 * newly created properties. When a property is added to the portfolio, these
 * rates pre-fill its OperatingCostRatesSection; users can then override
 * them per-property.
 *
 * The rates follow the USALI (Uniform System of Accounts for the Lodging
 * Industry) chart of accounts:
 *   • Rooms expense, F&B expense (departmental)
 *   • A&G, S&M, POM, Utilities (undistributed)
 *   • Property tax, FF&E reserve (fixed charges)
 *
 * Research Badges show AI-generated benchmarks for the configured property
 * type and market, giving users a sense of what's "normal" before they
 * customize individual properties.
 */
import { Slider } from "@/components/ui/slider";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import {
  DEFAULT_EVENT_EXPENSE_RATE,
  DEFAULT_OTHER_EXPENSE_RATE,
  DEFAULT_UTILITIES_VARIABLE_SPLIT,
} from "@/lib/constants";
import EditableValue from "./EditableValue";
import type { PropertyExpenseRatesSectionProps } from "./types";
import { CITATIONS } from "./citations";

export default function PropertyExpenseRatesSection({ formData, onChange, global, researchValues }: PropertyExpenseRatesSectionProps) {
  const gc = (key: string, label?: string) => ({ entityType: "company" as const, entityId: 0, assumptionKey: key, fieldLabel: label });

  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
      <div className="relative">
      <div className="space-y-6">
        <h3 className="text-lg font-display text-foreground flex items-center gap-2">
          Property Expense Rates
          <InfoTooltip text="Default expense rates applied to specific revenue streams at the property level" />
        </h3>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <ResearchContextFieldLabel
              label={<>Event Expense Rate <InfoTooltip text="As a percentage of event revenue. Operating costs for events (labor, setup, coordination)." /></>}
              badgeProps={{ value: researchValues.eventExpense?.display, sourceType: "industry", sourceName: CITATIONS.usaliBenchmarks, "data-testid": "badge-event-expense" }}
              onApplyValue={() => researchValues.eventExpense && onChange("eventExpenseRate", researchValues.eventExpense.mid / 100)}
              guidanceContext={gc("eventExpense", "Event Expense Rate")}
            />
            <EditableValue
              value={formData.eventExpenseRate ?? global.eventExpenseRate ?? DEFAULT_EVENT_EXPENSE_RATE}
              onChange={(v) => onChange("eventExpenseRate", v)}
              format="percent"
              min={0.30}
              max={0.90}
              step={0.05}
            />
          </div>
          <Slider
            value={[(formData.eventExpenseRate ?? global.eventExpenseRate ?? DEFAULT_EVENT_EXPENSE_RATE) * 100]}
            onValueChange={([v]) => onChange("eventExpenseRate", v / 100)}
            min={30}
            max={90}
            step={5}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <ResearchContextFieldLabel
              label={<>Other Revenue Expense Rate <InfoTooltip text="As a percentage of other revenue. Operating costs for ancillary departments (spa, parking, retail) as a percentage of that department's revenue." /></>}
              badgeProps={{ value: researchValues.otherExpenseRate?.display, sourceType: "industry", sourceName: CITATIONS.usaliBenchmarks, "data-testid": "badge-other-expense" }}
              onApplyValue={() => researchValues.otherExpenseRate && onChange("otherExpenseRate", researchValues.otherExpenseRate.mid / 100)}
              guidanceContext={gc("otherExpenseRate", "Other Revenue Expense Rate")}
            />
            <EditableValue
              value={formData.otherExpenseRate ?? global.otherExpenseRate ?? DEFAULT_OTHER_EXPENSE_RATE}
              onChange={(v) => onChange("otherExpenseRate", v)}
              format="percent"
              min={0.30}
              max={0.90}
              step={0.05}
            />
          </div>
          <Slider
            value={[(formData.otherExpenseRate ?? global.otherExpenseRate ?? DEFAULT_OTHER_EXPENSE_RATE) * 100]}
            onValueChange={([v]) => onChange("otherExpenseRate", v / 100)}
            min={30}
            max={90}
            step={5}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <ResearchContextFieldLabel
              label={<>Utilities Variable Split (% Variable vs Fixed) <InfoTooltip text="How much of the utilities expense rate scales with current property revenue (variable) vs stays anchored to Year 1 base revenue (fixed). Example: 60% means 60% of utilities cost varies with occupancy, 40% is fixed overhead." /></>}
              badgeProps={{ value: researchValues.utilitiesVariableSplit?.display, sourceType: "industry", sourceName: CITATIONS.usaliBenchmarks, "data-testid": "badge-utilities-split" }}
              onApplyValue={() => researchValues.utilitiesVariableSplit && onChange("utilitiesVariableSplit", researchValues.utilitiesVariableSplit.mid / 100)}
              guidanceContext={gc("utilitiesVariableSplit", "Utilities Variable Split")}
            />
            <EditableValue
              value={formData.utilitiesVariableSplit ?? global.utilitiesVariableSplit ?? DEFAULT_UTILITIES_VARIABLE_SPLIT}
              onChange={(v) => onChange("utilitiesVariableSplit", v)}
              format="percent"
              min={0.20}
              max={0.80}
              step={0.05}
            />
          </div>
          <Slider
            value={[(formData.utilitiesVariableSplit ?? global.utilitiesVariableSplit ?? DEFAULT_UTILITIES_VARIABLE_SPLIT) * 100]}
            onValueChange={([v]) => onChange("utilitiesVariableSplit", v / 100)}
            min={20}
            max={80}
            step={5}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Variable utilities scale with revenue, fixed utilities remain constant regardless of occupancy
          </p>
        </div>
      </div>
    </div></div>
  );
}
