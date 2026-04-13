/**
 * ManagementFeesSection.tsx — Per-property management fee configuration.
 *
 * Hotels pay the management company two types of fees:
 *
 *   1. Base Management Fee (% of Total Revenue)
 *      Broken into named service categories (e.g. Revenue Management,
 *      Marketing, Accounting, Operations) via the fee category grid.
 *      Each category can be toggled active/inactive and has its own rate.
 *      The total service fee rate is the sum of all active categories.
 *
 *   2. Incentive Management Fee (% of GOP — Gross Operating Profit)
 *      A performance bonus paid only when the property exceeds a
 *      profitability threshold. GOP = Revenue − Departmental Expenses −
 *      Undistributed Expenses (before fixed charges and debt service).
 *
 * These fees flow as revenue to the management company's income statement
 * (see company/CompanyIncomeTab) and as an expense on the property's
 * income statement. This dual-entity structure is central to the platform.
 */
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Slider } from "@/components/ui/slider";
import { EditableValue } from "@/components/ui/editable-value";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import { DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE } from "@/lib/constants";
import type { ManagementFeesSectionProps } from "./types";

export default function ManagementFeesSection({ draft, onChange, researchValues, feeDraft, onFeeCategoryChange, totalServiceFeeRate }: ManagementFeesSectionProps) {
  const eid = draft.id as number | undefined;
  const gc = (key: string, label?: string) => eid ? { entityType: "property" as const, entityId: eid, assumptionKey: key, fieldLabel: label } : undefined;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="relative p-6">
        <div className="mb-6">
          <h3 className="text-xl font-display text-foreground flex items-center">
            Management and Service Fees by Hospitality Management Company
            <InfoTooltip text="Fees paid by this property to the management company. Service fees are broken into categories (each a % of Total Revenue). The Incentive Fee is a % of Gross Operating Profit (GOP) collected when GOP is positive." />
          </h3>
          <p className="text-muted-foreground text-sm label-text">Fees charged by the management company for operating this property</p>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <Label className="text-sm font-semibold text-foreground label-text">
              Service Fee Categories (% of Total Revenue)
            </Label>
            <span className={`text-sm font-mono font-semibold ${totalServiceFeeRate > 0.10 ? 'text-accent-pop' : 'text-foreground'}`} data-testid="text-total-service-fee">
              Total: {(totalServiceFeeRate * 100).toFixed(1)}%
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {feeDraft?.map((cat, idx) => {
              const svcFeeMap: Record<string, { display: string; mid: number } | null> = {
                'Marketing': researchValues.svcFeeMarketing ?? null,
                'Technology & Reservations': researchValues.svcFeeTechRes ?? null,
                'Accounting': researchValues.svcFeeAccounting ?? null,
                'Revenue Management': researchValues.svcFeeRevMgmt ?? null,
                'General Management': researchValues.svcFeeGeneralMgmt ?? null,
                'Procurement': researchValues.svcFeeProcurement ?? null,
              };
              const rv = svcFeeMap[cat.name];
              const svcKeyMap: Record<string, string> = {
                'Marketing': 'svcFeeMarketing',
                'Technology & Reservations': 'svcFeeTechRes',
                'Accounting': 'svcFeeAccounting',
                'Revenue Management': 'svcFeeRevMgmt',
                'General Management': 'svcFeeGeneralMgmt',
                'Procurement': 'svcFeeProcurement',
              };
              const assumptionKey = svcKeyMap[cat.name] ?? `svcFee${cat.name.replace(/\s+/g, '')}`;
              return (
              <div key={cat.id} className="space-y-2" data-testid={`fee-category-${cat.name.toLowerCase().replace(/\s+/g, '-')}`}>
                <div className="flex justify-between items-center">
                  <ResearchContextFieldLabel
                    label={<span className={cat.isActive ? '' : 'text-muted-foreground line-through'}>{cat.name} <InfoTooltip text={`${cat.name} service fee = Total Revenue × ${(cat.rate * 100).toFixed(1)}%. Charged monthly as part of the management company's service fees.`} /></span>}
                    badgeProps={{ value: rv?.display }}
                    onApplyValue={() => rv && onFeeCategoryChange(idx, "rate", rv.mid / 100)}
                    guidanceContext={gc(assumptionKey, cat.name)}
                  />
                  <div className="flex items-center gap-2">
                    <EditableValue
                      value={cat.rate * 100}
                      onChange={(val) => onFeeCategoryChange(idx, "rate", val / 100)}
                      format="percent"
                      min={0}
                      max={5}
                      step={0.1}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onFeeCategoryChange(idx, "isActive", !cat.isActive)}
                      className={`w-8 h-5 rounded-full p-0 ${cat.isActive ? 'bg-primary' : 'bg-muted'} relative`}
                      title={cat.isActive ? "Disable this fee" : "Enable this fee"}
                      data-testid={`toggle-fee-${cat.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-card shadow transition-transform ${cat.isActive ? 'right-0.5' : 'left-0.5'}`} />
                    </Button>
                  </div>
                </div>
                <Slider 
                  value={[cat.rate * 100]}
                  onValueChange={(vals: number[]) => onFeeCategoryChange(idx, "rate", vals[0] / 100)}
                  min={0}
                  max={5}
                  step={0.1}
                  disabled={!cat.isActive}
                />
              </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-primary/20 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <ResearchContextFieldLabel
                  label={<>Incentive Fee (% of GOP) <InfoTooltip text="Incentive Management Fee = max(0, GOP) × this rate. Only charged when Gross Operating Profit is positive, rewarding the management company for strong performance. Industry standard: 10–20% of GOP." /></>}
                  badgeProps={{ entry: researchValues.incentiveFee }}
                  onApplyValue={() => researchValues.incentiveFee && onChange("incentiveManagementFeeRate", researchValues.incentiveFee.mid / 100)}
                  guidanceContext={gc("incentiveFee", "Incentive Fee")}
                  currentValue={draft.incentiveManagementFeeRate ?? DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE} isPercent
                />
                <EditableValue
                  value={(draft.incentiveManagementFeeRate ?? DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE) * 100}
                  onChange={(val) => onChange("incentiveManagementFeeRate", val / 100)}
                  format="percent"
                  min={0}
                  max={25}
                  step={1}
                />
              </div>
              <Slider 
                value={[(draft.incentiveManagementFeeRate ?? DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE) * 100]}
                onValueChange={(vals: number[]) => onChange("incentiveManagementFeeRate", vals[0] / 100)}
                min={0}
                max={25}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <Label className="label-text text-foreground flex items-center gap-1.5">
                Owner Priority Return (%)
                <InfoTooltip text="Minimum annual return on equity the owner must receive before incentive fees are charged. Industry standard investor protection. Set to 0 to disable." />
              </Label>
              <Input
                type="number"
                step="1"
                min="0"
                max="50"
                value={(draft.ownerPriorityReturn || 0) * 100}
                onChange={(e) => onChange("ownerPriorityReturn", parseFloat(e.target.value) / 100 || 0)}
                className="bg-card border-primary/30 text-foreground"
                data-testid="input-owner-priority-return"
              />
              <p className="text-xs text-muted-foreground">Hurdle rate before incentive fees apply</p>
            </div>

            <div className="space-y-2">
              <Label className="label-text text-foreground flex items-center gap-1.5">
                Fee Subordination
                <InfoTooltip text="When cash flow cannot cover debt service: 'Full' defers all management fees. 'Partial' defers only incentive fees. 'None' means fees are always charged." />
              </Label>
              <Select value={draft.feeSubordination || "none"} onValueChange={(v) => onChange("feeSubordination", v)}>
                <SelectTrigger className="bg-card border-primary/30 text-foreground" data-testid="select-fee-subordination">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (fees always charged)</SelectItem>
                  <SelectItem value="partial">Partial (defer incentive fee only)</SelectItem>
                  <SelectItem value="full">Full (defer all fees when cash &lt; debt service)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
