/**
 * CostOfEquityCard.tsx — Cost of Equity (Re) for the management company.
 *
 * Lives in the Funding tab. Cost of Equity is the equity investor's required
 * annual return — used as the Re component in WACC for property DCF and as
 * the discount rate for any Management Company DCF (per ARCHITECTURE.md
 * §1a — the HMC has no exit cap rate; FCF/DCF is the only company-level
 * terminal-value method).
 */
import { Slider } from "@/components/ui/slider";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import { DEFAULT_COST_OF_EQUITY } from "@shared/constants";
import EditableValue from "./EditableValue";
import type { CompanyAssumptionsSectionProps } from "./types";
import { CITATIONS } from "@shared/citations";

interface CostOfEquityCardProps extends CompanyAssumptionsSectionProps {
  researchValues: Record<string, { display: string; mid: number } | null | undefined>;
}

export default function CostOfEquityCard({ formData, onChange, global, researchValues }: CostOfEquityCardProps) {
  const gc = (key: string, label?: string) => ({ entityType: "company" as const, entityId: 0, assumptionKey: key, fieldLabel: label });

  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
      <div className="relative">
        <div className="space-y-4">
          <h3 className="text-lg font-display text-foreground flex items-center gap-2">
            Cost of Capital
            <InfoTooltip text="The equity investor's required annual return — used as Re in WACC and as the discount rate for company-level DCF." manualSection="investment-returns" />
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <ResearchContextFieldLabel
                label={<>Cost of Equity <InfoTooltip text="The equity investor's required annual return. Used as the Re component in WACC and as the discount rate for any Management Company DCF. Typical range: 15–25%." formula="WACC = (E/V × Re) + (D/V × Rd × (1−T))" manualSection="investment-returns" /></>}
                badgeProps={{ value: researchValues.costOfEquity?.display, sourceType: "industry", sourceName: CITATIONS.privateReEquityBenchmarks, "data-testid": "badge-cost-of-equity" }}
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
        </div>
      </div>
    </div>
  );
}
