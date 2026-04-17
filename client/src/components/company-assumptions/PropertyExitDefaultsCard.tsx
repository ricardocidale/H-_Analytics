/**
 * PropertyExitDefaultsCard.tsx — Default exit cap rate + sales commission for new properties.
 *
 * Lives in the Property Defaults tab. These fields are PROPERTY DEFAULTS that
 * cascade into each property's last-year exit valuation via the engine
 * aggregators (`engine/aggregation/cashFlowAggregator.ts`,
 * `engine/aggregation/yearlyAggregator.ts`):
 *
 *   property.exitCapRate ?? global?.exitCapRate ?? DEFAULT_EXIT_CAP_RATE
 *
 * They are NOT Management Company exit fields. Per ARCHITECTURE.md §1a the
 * HMC is an operating service business with no cap-rate exit — its terminal
 * value (if ever needed) is DCF on FCF discounted at `costOfEquity`, or an
 * EBITDA multiple. See `.claude/skills/finance/management-company-statements.md`.
 */
import { Slider } from "@/components/ui/slider";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import { DEFAULT_EXIT_CAP_RATE, DEFAULT_COMMISSION_RATE } from "@/lib/constants";
import EditableValue from "./EditableValue";
import type { CompanyAssumptionsSectionProps } from "./types";

interface PropertyExitDefaultsCardProps extends CompanyAssumptionsSectionProps {
  researchValues: Record<string, { display: string; mid: number } | null | undefined>;
}

export default function PropertyExitDefaultsCard({ formData, onChange, global, researchValues }: PropertyExitDefaultsCardProps) {
  const gc = (key: string, label?: string) => ({ entityType: "company" as const, entityId: 0, assumptionKey: key, fieldLabel: label });

  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
      <div className="relative">
        <div className="space-y-6">
          <h3 className="text-lg font-display text-foreground flex items-center gap-2">
            Property Exit Defaults
            <InfoTooltip text="Default exit cap rate and sales commission applied to NEW properties. Each property can override these on its own assumptions page. The Management Company itself has no cap-rate exit — see Cost of Equity (Funding tab) for company-level DCF." manualSection="investment-returns" />
          </h3>
          <p className="text-xs text-muted-foreground -mt-3">
            Cascading defaults for property terminal-year valuation. Not used for the Management Company.
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <ResearchContextFieldLabel
                label={<>Default Exit Cap Rate <InfoTooltip text="Capitalization rate used for property valuation at exit. Higher cap rate = lower valuation. Applied as: GrossValue = AnnualizedNOI / exitCapRate at the property's terminal year." manualSection="investment-returns" /></>}
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
                label={<>Default Sales Commission Rate <InfoTooltip text="As a percentage of gross sale price. Default broker commission for new properties. Each property can override this with its own disposition commission." /></>}
                badgeProps={{ value: researchValues.dispositionCommission?.display, sourceType: "industry", sourceName: "NAR transaction data", "data-testid": "badge-sales-commission" }}
                onApplyValue={() => researchValues.dispositionCommission && onChange("salesCommissionRate", researchValues.dispositionCommission.mid / 100)}
                guidanceContext={gc("dispositionCommission", "Sales Commission Rate")}
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
      </div>
    </div>
  );
}
