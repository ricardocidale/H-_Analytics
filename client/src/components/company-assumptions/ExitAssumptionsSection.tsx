/**
 * ExitAssumptionsSection.tsx — Company-level exit, disposition, and valuation assumptions.
 *
 * Configures:
 *   • Cost of Equity (Re) — required equity return for WACC/DCF
 *   • Exit cap rate — cap rate used for property exit valuation
 *   • Sales commission rate — broker commission on property sales
 */
import { Slider } from "@/components/ui/slider";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import { DEFAULT_EXIT_CAP_RATE, DEFAULT_COMMISSION_RATE } from "@/lib/constants";
import { DEFAULT_COST_OF_EQUITY } from "@shared/constants";
import EditableValue from "./EditableValue";
import type { ExitAssumptionsSectionProps } from "./types";

export default function ExitAssumptionsSection({ formData, onChange, global, researchValues }: ExitAssumptionsSectionProps) {
  const gc = (key: string, label?: string) => ({ entityType: "company" as const, entityId: 0, assumptionKey: key, fieldLabel: label });

  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
      <div className="relative">
      <div className="space-y-6">
        <h3 className="text-lg font-display text-foreground flex items-center gap-2">
          Exit, Sale & Valuation Assumptions
          <InfoTooltip text="Default values for property exit valuations, WACC discount rate, and sale transactions." manualSection="investment-returns" />
        </h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <ResearchContextFieldLabel
              label={<>Cost of Equity <InfoTooltip text="The equity investor's required annual return, used as the Re component in WACC and DCF calculations. For private hospitality investments, this is the hurdle rate — the minimum return an investor needs to justify the risk. Typical range: 15–25%." formula="WACC = (E/V × Re) + (D/V × Rd × (1−T))" manualSection="investment-returns" /></>}
              badgeProps={{ value: researchValues.costOfEquity?.display, sourceType: "industry", sourceName: "Private RE equity benchmarks", "data-testid": "badge-cost-of-equity" }}
              onApplyValue={() => researchValues.costOfEquity && onChange("costOfEquity", researchValues.costOfEquity.mid / 100)}
              guidanceContext={gc("costOfEquity", "Cost of Equity")}
            />
            <EditableValue
              value={formData.costOfEquity ?? global.costOfEquity ?? DEFAULT_COST_OF_EQUITY}
              onChange={(v) => onChange("costOfEquity", v)}
              format="percent"
              min={0.05}
              max={0.40}
              step={0.005}
            />
          </div>
          <Slider
            value={[(formData.costOfEquity ?? global.costOfEquity ?? DEFAULT_COST_OF_EQUITY) * 100]}
            onValueChange={([v]) => onChange("costOfEquity", v / 100)}
            min={5}
            max={40}
            step={0.5}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <ResearchContextFieldLabel
              label={<>Default Exit Cap Rate <InfoTooltip text="Capitalization rate used for property valuation at exit. Higher cap rate = lower valuation." manualSection="investment-returns" /></>}
              badgeProps={{ value: researchValues.exitCapRate?.display, sourceType: "industry", sourceName: "CBRE Cap Rate Survey", "data-testid": "badge-exit-cap" }}
              onApplyValue={() => researchValues.exitCapRate && onChange("exitCapRate", researchValues.exitCapRate.mid / 100)}
              guidanceContext={gc("exitCapRate", "Default Exit Cap Rate")}
            />
            <EditableValue
              value={formData.exitCapRate ?? global.exitCapRate ?? DEFAULT_EXIT_CAP_RATE}
              onChange={(v) => onChange("exitCapRate", v)}
              format="percent"
              min={0.04}
              max={0.15}
              step={0.005}
            />
          </div>
          <Slider
            value={[(formData.exitCapRate ?? global.exitCapRate ?? DEFAULT_EXIT_CAP_RATE) * 100]}
            onValueChange={([v]) => onChange("exitCapRate", v / 100)}
            min={4}
            max={15}
            step={0.5}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <ResearchContextFieldLabel
              label={<>Default Sales Commission Rate <InfoTooltip text="As a percentage of gross sale price. Default broker commission for new properties. Each property can override this with its own disposition commission on its assumptions page." /></>}
              badgeProps={{ value: researchValues.salesCommission?.display, sourceType: "industry", sourceName: "NAR transaction data", "data-testid": "badge-sales-commission" }}
              onApplyValue={() => researchValues.salesCommission && onChange("salesCommissionRate", researchValues.salesCommission.mid / 100)}
              guidanceContext={gc("salesCommission", "Sales Commission Rate")}
            />
            <EditableValue
              value={formData.salesCommissionRate ?? global.salesCommissionRate ?? DEFAULT_COMMISSION_RATE}
              onChange={(v) => onChange("salesCommissionRate", v)}
              format="percent"
              min={0}
              max={0.10}
              step={0.005}
            />
          </div>
          <Slider
            value={[(formData.salesCommissionRate ?? global.salesCommissionRate ?? DEFAULT_COMMISSION_RATE) * 100]}
            onValueChange={([v]) => onChange("salesCommissionRate", v / 100)}
            min={0}
            max={10}
            step={0.5}
          />
        </div>
      </div>
    </div></div>
  );
}
