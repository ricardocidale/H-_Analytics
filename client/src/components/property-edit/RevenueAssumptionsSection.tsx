/**
 * RevenueAssumptionsSection.tsx — Room revenue, ancillary income, and growth.
 *
 * Configures every revenue driver for the property's income statement:
 *
 *   Room Revenue:
 *     • ADR (Average Daily Rate) — nightly rate in Year 1
 *     • Occupancy rate — stabilized annual occupancy target
 *     • Occupancy ramp schedule — Year 1 through Year 4 ramp-up percentages
 *       (new hotels rarely open at full occupancy)
 *     • ADR growth rate — annual escalation of nightly rate
 *     • RevPAR is derived: ADR × Occupancy (Revenue Per Available Room)
 *
 *   Ancillary Revenue (as % of room revenue):
 *     • F&B (Food & Beverage) percentage
 *     • Catering boost — additional F&B uplift from weddings/events
 *     • Event / function revenue percentage
 *     • Other revenue (spa, parking, retail) percentage
 *
 *   Growth:
 *     • Revenue growth rate applied after stabilization year
 *
 * All rates use sliders with EditableValue for precise entry. Research Badges
 * show AI benchmarks when available.
 */
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Slider } from "@/components/ui/slider";
import { EditableValue } from "@/components/ui/editable-value";
import { GaapBadge } from "@/components/ui/gaap-badge";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import {
  DEFAULT_REV_SHARE_EVENTS,
  DEFAULT_REV_SHARE_FB,
  DEFAULT_REV_SHARE_OTHER,
  DEFAULT_CATERING_BOOST_PCT,
} from "@/lib/constants";
import type { PropertyEditSectionProps } from "./types";

export default function RevenueAssumptionsSection({ draft, onChange, researchValues }: PropertyEditSectionProps) {
  const eid = draft.id as number | undefined;
  const gc = (key: string, label?: string) => eid ? { entityType: "property" as const, entityId: eid, assumptionKey: key, fieldLabel: label } : undefined;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="relative p-6 space-y-6">
        <div>
          <h3 className="text-xl font-display text-foreground">Revenue Assumptions</h3>
          <p className="text-muted-foreground text-sm label-text">ADR and occupancy projections</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:items-end">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>Starting ADR <InfoTooltip text="The average nightly rate charged per occupied room when the hotel first opens. This is the foundation of all revenue projections — room revenue, F&B, and events all flow from ADR × occupancy. Boutique/lifestyle ADR benchmarks vary widely by market; $200–$400 is typical for secondary/tertiary markets (STR/HVS data)." /></>}
                badgeProps={{ entry: researchValues.adr }}
                onApplyValue={() => researchValues.adr && onChange("startAdr", researchValues.adr.mid)}
                guidanceContext={gc("adr", "Starting ADR")}
              />
              <EditableValue
                value={draft.startAdr}
                onChange={(val) => onChange("startAdr", val)}
                format="dollar"
                min={100}
                max={1200}
                step={10}
              />
            </div>
            <Slider 
              value={[draft.startAdr]}
              onValueChange={(vals: number[]) => onChange("startAdr", vals[0])}
              min={100}
              max={1200}
              step={10}
              className="[&_[role=slider]]:bg-primary"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>ADR Annual Growth <InfoTooltip text="The yearly percentage increase applied to ADR, compounding each year. A 3.5% growth rate means a $250 ADR becomes ~$259 in Year 2, ~$268 in Year 3, and so on. Reflects pricing power, inflation, and market positioning. Industry benchmark: 2–5% annual ADR growth for upper-upscale hotels (STR trend data)." /></>}
                badgeProps={{ entry: researchValues.adrGrowth }}
                onApplyValue={() => researchValues.adrGrowth && onChange("adrGrowthRate", researchValues.adrGrowth.mid / 100)}
                guidanceContext={gc("adrGrowth", "ADR Annual Growth")}
              />
              <EditableValue
                value={draft.adrGrowthRate * 100}
                onChange={(val) => onChange("adrGrowthRate", val / 100)}
                format="percent"
                min={0}
                max={50}
                step={1}
              />
            </div>
            <Slider 
              value={[draft.adrGrowthRate * 100]}
              onValueChange={(vals: number[]) => onChange("adrGrowthRate", vals[0] / 100)}
              min={0}
              max={50}
              step={1}
              className="[&_[role=slider]]:bg-primary"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>Starting Occupancy <InfoTooltip text="The percentage of rooms sold in the first month of operations. New hotels typically open well below their long-term potential while they build awareness and reputation. This is the starting point of the occupancy ramp. Industry benchmark: 40–60% starting occupancy for boutique hotels in secondary markets." /></>}
                badgeProps={{ entry: researchValues.startOccupancy }}
                onApplyValue={() => researchValues.startOccupancy && onChange("startOccupancy", researchValues.startOccupancy.mid / 100)}
                guidanceContext={gc("startOccupancy", "Starting Occupancy")}
              />
              <EditableValue
                value={draft.startOccupancy * 100}
                onChange={(val) => onChange("startOccupancy", val / 100)}
                format="percent"
                min={0}
                max={100}
                step={1}
              />
            </div>
            <Slider 
              value={[draft.startOccupancy * 100]}
              onValueChange={(vals: number[]) => onChange("startOccupancy", vals[0] / 100)}
              min={0}
              max={100}
              step={1}
              className="[&_[role=slider]]:bg-primary"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>Stabilized Occupancy <InfoTooltip text="The maximum occupancy the property will reach once fully ramped. The occupancy growth step increases occupancy toward this ceiling at regular intervals. Once reached, occupancy stays here for the remainder of the projection. Industry benchmark: 75–90% stabilized occupancy for upper-upscale/boutique hotels (STR benchmarks)." /></>}
                badgeProps={{ entry: researchValues.occupancy }}
                onApplyValue={() => researchValues.occupancy && onChange("maxOccupancy", researchValues.occupancy.mid / 100)}
                guidanceContext={gc("occupancy", "Stabilized Occupancy")}
              />
              <EditableValue
                value={draft.maxOccupancy * 100}
                onChange={(val) => onChange("maxOccupancy", val / 100)}
                format="percent"
                min={0}
                max={100}
                step={1}
              />
            </div>
            <Slider 
              value={[draft.maxOccupancy * 100]}
              onValueChange={(vals: number[]) => onChange("maxOccupancy", vals[0] / 100)}
              min={0}
              max={100}
              step={1}
              className="[&_[role=slider]]:bg-primary"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:items-end">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>Occupancy Ramp <InfoTooltip text="How many months pass between each occupancy step-up. For example, if set to 9 months with a 5% growth step, occupancy jumps by 5 percentage points every 9 months until it hits the stabilized maximum. A shorter ramp means faster fill-up." /></>}
                badgeProps={{ entry: researchValues.rampMonths }}
                onApplyValue={() => researchValues.rampMonths && onChange("occupancyRampMonths", researchValues.rampMonths.mid)}
                guidanceContext={gc("rampMonths", "Occupancy Ramp")}
              />
              <EditableValue
                value={draft.occupancyRampMonths}
                onChange={(val) => onChange("occupancyRampMonths", val)}
                format="months"
                min={0}
                max={36}
                step={1}
              />
            </div>
            <Slider 
              value={[draft.occupancyRampMonths]}
              onValueChange={(vals: number[]) => onChange("occupancyRampMonths", vals[0])}
              min={0}
              max={36}
              step={1}
              className="[&_[role=slider]]:bg-primary"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>Occupancy Growth Step <InfoTooltip text="The size of each occupancy increase during the ramp-up period. Every time the ramp interval elapses, occupancy jumps by this many percentage points. Example: starting at 40% with a 5% step → 40%, 45%, 50%, 55%… until the stabilized maximum is reached." /></>}
                badgeProps={{ entry: researchValues.occupancyStep }}
                onApplyValue={() => researchValues.occupancyStep && onChange("occupancyGrowthStep", researchValues.occupancyStep.mid / 100)}
                guidanceContext={gc("occupancyStep", "Occupancy Growth Step")}
              />
              <EditableValue
                value={draft.occupancyGrowthStep * 100}
                onChange={(val) => onChange("occupancyGrowthStep", val / 100)}
                format="percent"
                min={0}
                max={20}
                step={1}
              />
            </div>
            <Slider 
              value={[draft.occupancyGrowthStep * 100]}
              onValueChange={(vals: number[]) => onChange("occupancyGrowthStep", vals[0] / 100)}
              min={0}
              max={20}
              step={1}
              className="[&_[role=slider]]:bg-primary"
            />
          </div>
        </div>

        <div className="space-y-4 pt-2 border-t border-primary/15">
          <Label className="label-text text-foreground flex items-center gap-1.5">
            Additional Revenue as % of Room Revenue
            <InfoTooltip text="Configure how much additional revenue each stream generates as a percentage of room revenue. F&B revenue gets boosted by the catering boost percentage." />
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:items-end">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <ResearchContextFieldLabel
                  label={<>Events <InfoTooltip text="Revenue from meetings, weddings, and other events as a percentage of room revenue. Global Wellness Institute 2024: wellness/retreat properties generate 25–35% of total revenue from events and programming. Standard hotels typically see 10–15%." /> <GaapBadge rule="ASC 606: Event revenue recognized when the event occurs (point-in-time). Deposits recorded as deferred revenue until the performance obligation is satisfied." /></>}
                  badgeProps={{ entry: researchValues.revShareEvents }}
                  onApplyValue={() => researchValues.revShareEvents && onChange("revShareEvents", researchValues.revShareEvents.mid / 100)}
                  guidanceContext={gc("revShareEvents", "Events")}
                />
                <EditableValue
                  value={(draft.revShareEvents ?? DEFAULT_REV_SHARE_EVENTS) * 100}
                  onChange={(val) => onChange("revShareEvents", val / 100)}
                  format="percent"
                  min={0}
                  max={100}
                  step={5}
                />
              </div>
              <Slider 
                value={[(draft.revShareEvents ?? DEFAULT_REV_SHARE_EVENTS) * 100]}
                onValueChange={(vals: number[]) => onChange("revShareEvents", vals[0] / 100)}
                min={0}
                max={100}
                step={5}
                className="[&_[role=slider]]:bg-primary"
              />
              <p className="text-xs text-muted-foreground">Meetings, weddings, conferences</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <ResearchContextFieldLabel
                  label={<>F&B <InfoTooltip text="USALI F&B Department — base food & beverage revenue as a percentage of room revenue. This gets boosted by the catering boost percentage below. Industry benchmark: 15–25% of room revenue for boutique hotels with on-site dining (USALI 12th Ed.)." /> <GaapBadge rule="ASC 606: F&B revenue recognized at the point of sale. Bundled packages (e.g., room + breakfast) must allocate revenue to each performance obligation based on standalone selling prices." /></>}
                  badgeProps={{ entry: researchValues.revShareFB }}
                  onApplyValue={() => researchValues.revShareFB && onChange("revShareFB", researchValues.revShareFB.mid / 100)}
                  guidanceContext={gc("revShareFB", "F&B")}
                />
                <EditableValue
                  value={(draft.revShareFB ?? DEFAULT_REV_SHARE_FB) * 100}
                  onChange={(val) => onChange("revShareFB", val / 100)}
                  format="percent"
                  min={0}
                  max={100}
                  step={5}
                />
              </div>
              <Slider 
                value={[(draft.revShareFB ?? DEFAULT_REV_SHARE_FB) * 100]}
                onValueChange={(vals: number[]) => onChange("revShareFB", vals[0] / 100)}
                min={0}
                max={100}
                step={5}
                className="[&_[role=slider]]:bg-primary"
              />
              <p className="text-xs text-muted-foreground">Restaurant, bar, room service</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <ResearchContextFieldLabel
                  label={<>Other <InfoTooltip text="USALI Other Operated Departments — revenue from spa, parking, activities, and other ancillary services. Industry benchmark: 3–8% of room revenue for boutique/lifestyle hotels (USALI 12th Ed.)." /></>}
                  badgeProps={{ entry: researchValues.revShareOther }}
                  onApplyValue={() => researchValues.revShareOther && onChange("revShareOther", researchValues.revShareOther.mid / 100)}
                  guidanceContext={gc("revShareOther", "Other Revenue")}
                />
                <EditableValue
                  value={(draft.revShareOther ?? DEFAULT_REV_SHARE_OTHER) * 100}
                  onChange={(val) => onChange("revShareOther", val / 100)}
                  format="percent"
                  min={0}
                  max={100}
                  step={5}
                />
              </div>
              <Slider 
                value={[(draft.revShareOther ?? DEFAULT_REV_SHARE_OTHER) * 100]}
                onValueChange={(vals: number[]) => onChange("revShareOther", vals[0] / 100)}
                min={0}
                max={100}
                step={5}
                className="[&_[role=slider]]:bg-primary"
              />
              <p className="text-xs text-muted-foreground">Spa, parking, activities</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <ResearchContextFieldLabel
                  label={<>Catering Boost <InfoTooltip text="Percentage uplift applied to base F&B revenue from catered events. For example, 30% means total F&B = Base F&B × 1.30. This blended rate accounts for the mix of catered vs. non-catered events. Properties with strong wedding/corporate retreat programs may see 20–40% catering uplift." /></>}
                  badgeProps={{ entry: researchValues.catering }}
                  onApplyValue={() => researchValues.catering && onChange("cateringBoostPercent", researchValues.catering.mid / 100)}
                  guidanceContext={gc("catering", "Catering Boost")}
                />
                <EditableValue
                  value={(draft.cateringBoostPercent ?? DEFAULT_CATERING_BOOST_PCT) * 100}
                  onChange={(val) => onChange("cateringBoostPercent", val / 100)}
                  format="percent"
                  min={0}
                  max={100}
                  step={5}
                />
              </div>
              <Slider 
                value={[(draft.cateringBoostPercent ?? DEFAULT_CATERING_BOOST_PCT) * 100]}
                onValueChange={(vals: number[]) => onChange("cateringBoostPercent", vals[0] / 100)}
                min={0}
                max={100}
                step={5}
                className="[&_[role=slider]]:bg-primary"
              />
              <p className="text-xs text-muted-foreground">F&B uplift from catered events</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
