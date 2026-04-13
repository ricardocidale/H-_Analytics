/**
 * OperatingCostRatesSection.tsx — USALI departmental expense rates.
 *
 * Configures every operating expense line on the property income statement,
 * following the USALI (Uniform System of Accounts for the Lodging Industry)
 * chart of accounts. Expenses are expressed as a percentage of total revenue:
 *
 *   Departmental Expenses (directly tied to revenue departments):
 *     • Rooms expense rate (housekeeping, front desk labor, amenities)
 *     • F&B expense rate (kitchen labor, food cost, beverage cost)
 *
 *   Undistributed Operating Expenses:
 *     • Admin & General (A&G) — back-office, accounting, HR
 *     • Sales & Marketing — advertising, commissions, loyalty programs
 *     • Property Operations & Maintenance (POM) — repairs, engineering
 *     • Utilities — energy, water, waste (split between fixed & variable)
 *
 *   Fixed Charges:
 *     • Property tax rate
 *     • FF&E reserve (Furniture, Fixtures & Equipment replacement fund,
 *       typically 3–5% of revenue, required by most lenders)
 *     • Income tax rate (property-level, separate from company tax)
 *
 * Together these rates determine GOP (Gross Operating Profit) and NOI (Net
 * Operating Income), the two key profitability metrics.
 */
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Slider } from "@/components/ui/slider";
import { EditableValue } from "@/components/ui/editable-value";
import { GaapBadge } from "@/components/ui/gaap-badge";
import { Label } from "@/components/ui/label";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import { Link } from "wouter";
import {
  DEFAULT_COST_RATE_ROOMS,
  DEFAULT_COST_RATE_FB,
  DEFAULT_COST_RATE_ADMIN,
  DEFAULT_COST_RATE_MARKETING,
  DEFAULT_COST_RATE_PROPERTY_OPS,
  DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DEFAULT_COST_RATE_TAXES,
  DEFAULT_COST_RATE_IT,
  DEFAULT_COST_RATE_FFE,
  DEFAULT_COST_RATE_OTHER,
  DEFAULT_COST_RATE_INSURANCE,
} from "@/lib/constants";
import type { PropertyEditSectionProps } from "./types";

export default function OperatingCostRatesSection({ draft, onChange, globalAssumptions, researchValues }: PropertyEditSectionProps) {
  const eid = draft.id as number | undefined;
  const gc = (key: string, label?: string) => eid ? { entityType: "property" as const, entityId: eid, assumptionKey: key, fieldLabel: label } : undefined;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="relative p-6">
        <div className="mb-6">
          <h3 className="text-xl font-display text-foreground flex items-center">
            Operating Cost Rates
            <InfoTooltip text="Operating expense rates for this property, following the USALI (Uniform System of Accounts for the Lodging Industry) framework. Variable costs scale with revenue each month; fixed costs are anchored to Year 1 base revenue and escalate annually with inflation; property-value-based charges (taxes) are based on the property's total value." manualSection="expense-rates" />
          </h3>
          <p className="text-muted-foreground text-sm label-text">Expense allocation as percentage of revenue</p>
        </div>
        <div className="space-y-6">
        {(() => {
          const costRateTotal = (
            (draft.costRateRooms ?? DEFAULT_COST_RATE_ROOMS) +
            (draft.costRateFB ?? DEFAULT_COST_RATE_FB) +
            (draft.costRateAdmin ?? DEFAULT_COST_RATE_ADMIN) +
            (draft.costRateMarketing ?? DEFAULT_COST_RATE_MARKETING) +
            (draft.costRatePropertyOps ?? DEFAULT_COST_RATE_PROPERTY_OPS) +
            (draft.costRateUtilities ?? DEFAULT_COST_RATE_UTILITIES) +
            (draft.costRateIT ?? DEFAULT_COST_RATE_IT) +
            (draft.costRateFFE ?? DEFAULT_COST_RATE_FFE) +
            (draft.costRateOther ?? DEFAULT_COST_RATE_OTHER)
          );
          
          return (
            <>
              <div className="p-4 rounded-lg bg-muted border border-border">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-foreground">Total Allocation:</span>
                  <span className="text-lg font-bold text-primary">
                    {(costRateTotal * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Based on Room Revenue</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <ResearchContextFieldLabel
                        label={<>Housekeeping <InfoTooltip text="USALI Rooms Department — variable cost covering cleaning labor, linens, guest supplies, and room maintenance. Scales directly with room revenue. Industry benchmark (USALI 12th Ed.): Luxury 22–28%, Upper Upscale 18–25%, Upscale 20–27%. VRBO/STR properties use per-turnover cleaning costs instead." /></>}
                        badgeProps={{ entry: researchValues.costHousekeeping }}
                        onApplyValue={() => researchValues.costHousekeeping && onChange("costRateRooms", researchValues.costHousekeeping.mid / 100)}
                        guidanceContext={gc("costHousekeeping", "Housekeeping")}
                        currentValue={draft.costRateRooms ?? DEFAULT_COST_RATE_ROOMS} isPercent
                      />
                      <EditableValue
                        value={(draft.costRateRooms ?? DEFAULT_COST_RATE_ROOMS) * 100}
                        onChange={(val) => onChange("costRateRooms", val / 100)}
                        format="percent"
                        min={0}
                        max={50}
                        step={1}
                      />
                    </div>
                    <Slider 
                      value={[(draft.costRateRooms ?? DEFAULT_COST_RATE_ROOMS) * 100]}
                      onValueChange={(vals: number[]) => onChange("costRateRooms", vals[0] / 100)}
                      min={0}
                      max={50}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <ResearchContextFieldLabel
                        label={<>F&B <InfoTooltip text="USALI Food & Beverage Department — variable cost covering kitchen labor, food costs, beverages, and dining operations. Scales with room revenue for consistent cost modeling. Industry benchmark: 6–12% of total revenue for boutique hotels with on-site dining (USALI 12th Ed.)." /></>}
                        badgeProps={{ entry: researchValues.costFB }}
                        onApplyValue={() => researchValues.costFB && onChange("costRateFB", researchValues.costFB.mid / 100)}
                        guidanceContext={gc("costFB", "F&B Cost")}
                        currentValue={draft.costRateFB ?? DEFAULT_COST_RATE_FB} isPercent
                      />
                      <EditableValue
                        value={(draft.costRateFB ?? DEFAULT_COST_RATE_FB) * 100}
                        onChange={(val) => onChange("costRateFB", val / 100)}
                        format="percent"
                        min={0}
                        max={50}
                        step={1}
                      />
                    </div>
                    <Slider 
                      value={[(draft.costRateFB ?? DEFAULT_COST_RATE_FB) * 100]}
                      onValueChange={(vals: number[]) => onChange("costRateFB", vals[0] / 100)}
                      min={0}
                      max={50}
                      step={1}
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Based on Total Revenue</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <ResearchContextFieldLabel
                        label={<>Admin & General <InfoTooltip text="USALI Administrative & General Department — fixed cost covering management salaries, accounting, legal, HR, and office operations. Dollar amount is set from Year 1 revenue and escalates annually with inflation. Industry benchmark: 7–10% of total revenue (USALI 12th Ed.)." /></>}
                        badgeProps={{ entry: researchValues.costAdmin }}
                        onApplyValue={() => researchValues.costAdmin && onChange("costRateAdmin", researchValues.costAdmin.mid / 100)}
                        guidanceContext={gc("costAdmin", "Admin & General")}
                        currentValue={draft.costRateAdmin ?? DEFAULT_COST_RATE_ADMIN} isPercent
                      />
                      <EditableValue
                        value={(draft.costRateAdmin ?? DEFAULT_COST_RATE_ADMIN) * 100}
                        onChange={(val) => onChange("costRateAdmin", val / 100)}
                        format="percent"
                        min={0}
                        max={25}
                        step={1}
                      />
                    </div>
                    <Slider 
                      value={[(draft.costRateAdmin ?? DEFAULT_COST_RATE_ADMIN) * 100]}
                      onValueChange={(vals: number[]) => onChange("costRateAdmin", vals[0] / 100)}
                      min={0}
                      max={25}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <ResearchContextFieldLabel
                        label={<>Property Ops <InfoTooltip text="USALI Property Operations & Maintenance (POM) Department — fixed cost covering engineering, repairs, grounds maintenance, and facilities. Dollar amount is set from Year 1 revenue and escalates annually with inflation. Industry benchmark: 3–6% of total revenue (USALI 12th Ed.)." /></>}
                        badgeProps={{ entry: researchValues.costPropertyOps }}
                        onApplyValue={() => researchValues.costPropertyOps && onChange("costRatePropertyOps", researchValues.costPropertyOps.mid / 100)}
                        guidanceContext={gc("costPropertyOps", "Property Ops")}
                        currentValue={draft.costRatePropertyOps ?? DEFAULT_COST_RATE_PROPERTY_OPS} isPercent
                      />
                      <EditableValue
                        value={(draft.costRatePropertyOps ?? DEFAULT_COST_RATE_PROPERTY_OPS) * 100}
                        onChange={(val) => onChange("costRatePropertyOps", val / 100)}
                        format="percent"
                        min={0}
                        max={25}
                        step={1}
                      />
                    </div>
                    <Slider 
                      value={[(draft.costRatePropertyOps ?? DEFAULT_COST_RATE_PROPERTY_OPS) * 100]}
                      onValueChange={(vals: number[]) => onChange("costRatePropertyOps", vals[0] / 100)}
                      min={0}
                      max={25}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <ResearchContextFieldLabel
                        label={<>Utilities <InfoTooltip text="USALI Utilities — covers electricity, gas, water, sewer, and waste. Split between a variable portion (scales with occupancy) and a fixed portion (base load, escalates with inflation). Industry benchmark: 4–7% of total revenue (USALI 12th Ed.). The variable/fixed split defaults to 60/40 and is set in Company Assumptions." /></>}
                        badgeProps={{ entry: researchValues.costUtilities }}
                        onApplyValue={() => researchValues.costUtilities && onChange("costRateUtilities", researchValues.costUtilities.mid / 100)}
                        guidanceContext={gc("costUtilities", "Utilities")}
                        currentValue={draft.costRateUtilities ?? DEFAULT_COST_RATE_UTILITIES} isPercent
                      />
                      <EditableValue
                        value={(draft.costRateUtilities ?? DEFAULT_COST_RATE_UTILITIES) * 100}
                        onChange={(val) => onChange("costRateUtilities", val / 100)}
                        format="percent"
                        min={0}
                        max={25}
                        step={1}
                      />
                    </div>
                    <Slider 
                      value={[(draft.costRateUtilities ?? DEFAULT_COST_RATE_UTILITIES) * 100]}
                      onValueChange={(vals: number[]) => onChange("costRateUtilities", vals[0] / 100)}
                      min={0}
                      max={25}
                      step={1}
                    />
                    {(() => {
                      const split = globalAssumptions?.utilitiesVariableSplit ?? DEFAULT_UTILITIES_VARIABLE_SPLIT;
                      const rate = (draft.costRateUtilities ?? DEFAULT_COST_RATE_UTILITIES) * 100;
                      return (
                        <div className="mt-1 pl-2 border-l-2 border-border space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Variable (scales with revenue)</span>
                            <span className="font-mono">{(rate * split).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Fixed (escalates with inflation)</span>
                            <span className="font-mono">{(rate * (1 - split)).toFixed(1)}%</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground/70">
                            Split is {(split * 100).toFixed(0)}% variable / {((1 - split) * 100).toFixed(0)}% fixed — set in <Link href="/assumptions" className="underline hover:text-primary">Company Assumptions</Link>
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <ResearchContextFieldLabel
                        label={<>FF&E Reserve <InfoTooltip text="USALI FF&E Reserve — variable set-aside for future replacement of furniture, fixtures, and equipment. Scales with total revenue. Industry benchmark: 3–5% of total revenue per USALI 12th Ed. and lender covenant requirements. Deducted from NOI to arrive at ANOI." /> <GaapBadge rule="USALI Standard: FF&E reserve is deducted from NOI (Net Operating Income) to arrive at ANOI (Adjusted Net Operating Income). Actual FF&E replacements are capitalized and depreciated over 5–7 years (IRS Class Life), not expensed. The reserve funds future CapEx." /></>}
                        badgeProps={{ entry: researchValues.costFFE }}
                        onApplyValue={() => researchValues.costFFE && onChange("costRateFFE", researchValues.costFFE.mid / 100)}
                        guidanceContext={gc("costFFE", "FF&E Reserve")}
                        currentValue={draft.costRateFFE ?? DEFAULT_COST_RATE_FFE} isPercent
                      />
                      <EditableValue
                        value={(draft.costRateFFE ?? DEFAULT_COST_RATE_FFE) * 100}
                        onChange={(val) => onChange("costRateFFE", val / 100)}
                        format="percent"
                        min={0}
                        max={15}
                        step={1}
                      />
                    </div>
                    <Slider 
                      value={[(draft.costRateFFE ?? DEFAULT_COST_RATE_FFE) * 100]}
                      onValueChange={(vals: number[]) => onChange("costRateFFE", vals[0] / 100)}
                      min={0}
                      max={15}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <ResearchContextFieldLabel
                        label={<>Other <InfoTooltip text="USALI Other Expenses — fixed cost for miscellaneous operating expenses not categorized elsewhere (e.g., laundry, parking operations, telecommunications). Dollar amount is set from Year 1 revenue and escalates annually with inflation. Industry benchmark: 3–6% of total revenue." /></>}
                        badgeProps={{ entry: researchValues.costOther }}
                        onApplyValue={() => researchValues.costOther && onChange("costRateOther", researchValues.costOther.mid / 100)}
                        guidanceContext={gc("costOther", "Other Costs")}
                        currentValue={draft.costRateOther ?? DEFAULT_COST_RATE_OTHER} isPercent
                      />
                      <EditableValue
                        value={(draft.costRateOther ?? DEFAULT_COST_RATE_OTHER) * 100}
                        onChange={(val) => onChange("costRateOther", val / 100)}
                        format="percent"
                        min={0}
                        max={15}
                        step={1}
                      />
                    </div>
                    <Slider 
                      value={[(draft.costRateOther ?? DEFAULT_COST_RATE_OTHER) * 100]}
                      onValueChange={(vals: number[]) => onChange("costRateOther", vals[0] / 100)}
                      min={0}
                      max={25}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <ResearchContextFieldLabel
                        label={<>Marketing <InfoTooltip text="USALI Sales & Marketing Department — variable cost covering property-level advertising, OTA commissions, loyalty programs, and local promotions. Scales with total revenue. Industry benchmark: 1–4% of total revenue for boutique hotels; can be higher for resort/destination properties (USALI 12th Ed.)." /></>}
                        badgeProps={{ entry: researchValues.costMarketing }}
                        onApplyValue={() => researchValues.costMarketing && onChange("costRateMarketing", researchValues.costMarketing.mid / 100)}
                        guidanceContext={gc("costMarketing", "Marketing")}
                        currentValue={draft.costRateMarketing ?? DEFAULT_COST_RATE_MARKETING} isPercent
                      />
                      <EditableValue
                        value={(draft.costRateMarketing ?? DEFAULT_COST_RATE_MARKETING) * 100}
                        onChange={(val) => onChange("costRateMarketing", val / 100)}
                        format="percent"
                        min={0}
                        max={15}
                        step={1}
                      />
                    </div>
                    <Slider 
                      value={[(draft.costRateMarketing ?? DEFAULT_COST_RATE_MARKETING) * 100]}
                      onValueChange={(vals: number[]) => onChange("costRateMarketing", vals[0] / 100)}
                      min={0}
                      max={15}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <ResearchContextFieldLabel
                        label={<>IT <InfoTooltip text="USALI Information Technology — fixed cost covering property-level IT needs including WiFi, in-room tech, PMS hardware, and basic support. Dollar amount is set from Year 1 revenue and escalates annually with inflation. Industry benchmark: 0.3–1.0% of total revenue (USALI 12th Ed. / HFTP Technology Survey)." /></>}
                        badgeProps={{ entry: researchValues.costIT }}
                        onApplyValue={() => researchValues.costIT && onChange("costRateIT", researchValues.costIT.mid / 100)}
                        guidanceContext={gc("costIT", "IT")}
                        currentValue={draft.costRateIT ?? DEFAULT_COST_RATE_IT} isPercent
                      />
                      <EditableValue
                        value={(draft.costRateIT ?? DEFAULT_COST_RATE_IT) * 100}
                        onChange={(val) => onChange("costRateIT", val / 100)}
                        format="percent"
                        min={0}
                        max={15}
                        step={1}
                      />
                    </div>
                    <Slider 
                      value={[(draft.costRateIT ?? DEFAULT_COST_RATE_IT) * 100]}
                      onValueChange={(vals: number[]) => onChange("costRateIT", vals[0] / 100)}
                      min={0}
                      max={15}
                      step={1}
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Based on Property Value</h4>
                <p className="text-xs text-muted-foreground mb-4">Calculated as a percentage of total property value (Purchase Price + Building Improvements), adjusted annually by the Inflation Escalator Factor.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <ResearchContextFieldLabel
                        label={<>Property Taxes <InfoTooltip text="USALI Fixed Charges — based on total property value (Purchase Price + Building Improvements), not revenue. Covers real estate taxes and assessments. Escalates annually with inflation. Industry benchmark: 1.5–4% of assessed property value; fully deductible per IRC §164." /> <GaapBadge rule="IRC §164: Property taxes are fully deductible as an operating expense for income tax purposes. Based on assessed value, not market value. Reassessment may occur upon sale or significant improvement." /></>}
                        badgeProps={{ entry: researchValues.costPropertyTaxes }}
                        onApplyValue={() => researchValues.costPropertyTaxes && onChange("costRateTaxes", researchValues.costPropertyTaxes.mid / 100)}
                        guidanceContext={gc("costPropertyTaxes", "Property Taxes")}
                        currentValue={draft.costRateTaxes ?? DEFAULT_COST_RATE_TAXES} isPercent
                      />
                      <EditableValue
                        value={(draft.costRateTaxes ?? DEFAULT_COST_RATE_TAXES) * 100}
                        onChange={(val) => onChange("costRateTaxes", val / 100)}
                        format="percent"
                        min={0}
                        max={15}
                        step={1}
                      />
                    </div>
                    <Slider 
                      value={[(draft.costRateTaxes ?? DEFAULT_COST_RATE_TAXES) * 100]}
                      onValueChange={(vals: number[]) => onChange("costRateTaxes", vals[0] / 100)}
                      min={0}
                      max={15}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col gap-0.5">
                        <Label className="text-sm label-text text-foreground flex items-center gap-1">Insurance<InfoTooltip text="USALI Fixed Charges — property-level insurance covering liability, property damage, and business interruption. Based on total property value (Purchase Price + Building Improvements), separate from the management company's corporate insurance. Industry benchmark: 1–2% of property value for boutique/lifestyle hotels." /></Label>
                      </div>
                      <EditableValue
                        value={(draft.costRateInsurance ?? DEFAULT_COST_RATE_INSURANCE) * 100}
                        onChange={(val) => onChange("costRateInsurance", val / 100)}
                        format="percent"
                        min={0}
                        max={5}
                        step={0.1}
                        data-testid="input-cost-rate-insurance"
                      />
                    </div>
                    <Slider 
                      value={[(draft.costRateInsurance ?? DEFAULT_COST_RATE_INSURANCE) * 100]}
                      onValueChange={(vals: number[]) => onChange("costRateInsurance", vals[0] / 100)}
                      min={0}
                      max={5}
                      step={0.1}
                      data-testid="slider-cost-rate-insurance"
                    />
                  </div>
                </div>
              </div>

            </>
          );
        })()}
        </div>
      </div>
    </div>
  );
}
