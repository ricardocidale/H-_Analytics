/**
 * CompensationSection.tsx — Staff compensation and headcount tiers.
 *
 * Configures the management company's people costs. Staffing scales with
 * portfolio size through "staffing tiers" — discrete FTE headcount
 * thresholds that increase as more properties are acquired:
 *
 *   Tier 1 (1–2 properties): minimal team (e.g. 3 FTEs)
 *   Tier 2 (3–5 properties): expanded team (e.g. 8 FTEs)
 *   Tier 3 (6+ properties): full team (e.g. 15 FTEs)
 *
 * Inputs:
 *   • Average salary per FTE
 *   • Payroll burden rate (benefits, taxes — typically 20–30% of salary)
 *   • Annual salary escalation rate (cost-of-living raises)
 *   • FTE counts for each tier
 *
 * Research Badges show AI-generated salary benchmarks for hospitality
 * management roles in the user's market, when available.
 */
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import EditableValue from "./EditableValue";
import type { CompensationSectionProps } from "./types";
import { CITATIONS } from "@shared/citations";
import { STAFFING_TIERS } from "@/lib/constants";

export default function CompensationSection({ formData, onChange, global, researchValues }: CompensationSectionProps) {
  const gc = (key: string, label?: string) => ({ entityType: "company" as const, entityId: 0, assumptionKey: key, fieldLabel: label });

  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
    <div className="relative">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-display text-foreground flex items-center">
            Compensation
            <InfoTooltip text="Total compensation expense for the management company. Includes management team draws and staff salaries. Staff headcount is determined by the portfolio size (staffing tiers below). Early-stage hotel management companies typically allocate 50–65% of total overhead to compensation. See the Analyst badge for live per-FTE benchmarks by property class." formula="Monthly = (Management Comp + FTE × Salary) ÷ 12" />
          </h3>
          <p className="text-muted-foreground text-sm label-text">Configure management compensation, staff salaries, and staffing tiers</p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <ResearchContextFieldLabel
              label={<>Staff Salary <InfoTooltip text="Average annual salary per full-time staff member. The total staff cost depends on how many FTEs your portfolio size requires (see tiers below). As you add properties, you may cross into a higher staffing tier. See the Analyst badge for live salary ranges in your market." formula="Staff Cost = FTE Count × Salary ÷ 12" /></>}
              badgeProps={{ value: researchValues.staffSalary?.display, sourceType: "industry", sourceName: CITATIONS.ahlaLodgingIndustrySurvey, "data-testid": "badge-staff-salary" }}
              onApplyValue={() => researchValues.staffSalary && onChange("staffSalary", researchValues.staffSalary.mid)}
              guidanceContext={gc("staffSalary", "Staff Salary")}
            />
            <EditableValue
              value={formData.staffSalary ?? global.staffSalary}
              onChange={(v) => onChange("staffSalary", v)}
              format="dollar"
              min={40000}
              max={200000}
              step={5000}
            />
          </div>
          <Slider
            value={[formData.staffSalary ?? global.staffSalary]}
            onValueChange={([v]) => onChange("staffSalary", v)}
            min={40000}
            max={200000}
            step={5000}
          />
        </div>

        <div className="pt-4 border-t border-border">
          <div className="mb-3">
            <Label className="flex items-center text-foreground label-text font-medium">
              Staffing Tiers
              <InfoTooltip text="Portfolio-based staffing model. As the number of managed properties grows, you'll need more staff. Each tier defines the FTE headcount for a range of property counts. The system automatically selects the right tier based on your active property count. Default tiers: ≤3 properties → 2.5 FTE, ≤6 → 4.5 FTE, 7+ → 7.0 FTE. Reflects typical early-stage hotel management company scaling patterns." />
            </Label>
            <p className="text-xs text-muted-foreground mt-1">Set the FTE headcount for each portfolio size bracket</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center gap-3 bg-primary/5 rounded-lg px-3 py-2">
              <span className="text-sm text-muted-foreground w-20 shrink-0">Tier 1:</span>
              <span className="text-xs text-muted-foreground">Up to</span>
              <Input
                type="number"
                value={formData.staffTier1MaxProperties ?? global.staffTier1MaxProperties ?? STAFFING_TIERS[0].maxProperties}
                onChange={(e) => onChange("staffTier1MaxProperties", Math.max(1, parseInt(e.target.value) || STAFFING_TIERS[0].maxProperties))}
                min={1}
                max={20}
                className="w-16 bg-card border-primary/30 text-foreground text-center"
                data-testid="input-tier1-max-properties"
              />
              <span className="text-xs text-muted-foreground">properties →</span>
              <Input
                type="number"
                value={formData.staffTier1Fte ?? global.staffTier1Fte ?? STAFFING_TIERS[0].fte}
                onChange={(e) => onChange("staffTier1Fte", Math.max(0.5, parseFloat(e.target.value) || STAFFING_TIERS[0].fte))}
                min={0.5}
                max={20}
                step={0.5}
                className="w-20 bg-card border-primary/30 text-foreground text-center"
                data-testid="input-tier1-fte"
              />
              <span className="text-xs text-muted-foreground">FTE</span>
            </div>
            <div className="flex items-center gap-3 bg-primary/5 rounded-lg px-3 py-2">
              <span className="text-sm text-muted-foreground w-20 shrink-0">Tier 2:</span>
              <span className="text-xs text-muted-foreground">Up to</span>
              <Input
                type="number"
                value={formData.staffTier2MaxProperties ?? global.staffTier2MaxProperties ?? STAFFING_TIERS[1].maxProperties}
                onChange={(e) => onChange("staffTier2MaxProperties", Math.max(1, parseInt(e.target.value) || STAFFING_TIERS[1].maxProperties))}
                min={1}
                max={30}
                className="w-16 bg-card border-primary/30 text-foreground text-center"
                data-testid="input-tier2-max-properties"
              />
              <span className="text-xs text-muted-foreground">properties →</span>
              <Input
                type="number"
                value={formData.staffTier2Fte ?? global.staffTier2Fte ?? STAFFING_TIERS[1].fte}
                onChange={(e) => onChange("staffTier2Fte", Math.max(0.5, parseFloat(e.target.value) || STAFFING_TIERS[1].fte))}
                min={0.5}
                max={30}
                step={0.5}
                className="w-20 bg-card border-primary/30 text-foreground text-center"
                data-testid="input-tier2-fte"
              />
              <span className="text-xs text-muted-foreground">FTE</span>
            </div>
            <div className="flex items-center gap-3 bg-primary/5 rounded-lg px-3 py-2">
              <span className="text-sm text-muted-foreground w-20 shrink-0">Tier 3:</span>
              <span className="text-xs text-muted-foreground">Above {formData.staffTier2MaxProperties ?? global.staffTier2MaxProperties ?? STAFFING_TIERS[1].maxProperties} properties →</span>
              <Input
                type="number"
                value={formData.staffTier3Fte ?? global.staffTier3Fte ?? STAFFING_TIERS[2].fte}
                onChange={(e) => onChange("staffTier3Fte", Math.max(0.5, parseFloat(e.target.value) || STAFFING_TIERS[2].fte))}
                min={0.5}
                max={50}
                step={0.5}
                className="w-20 bg-card border-primary/30 text-foreground text-center"
                data-testid="input-tier3-fte"
              />
              <span className="text-xs text-muted-foreground">FTE</span>
            </div>
          </div>
        </div>
      </div>
    </div></div>
  );
}
