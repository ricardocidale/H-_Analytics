/**
 * VariableCostsSection.tsx — Variable costs that scale with portfolio size or revenue.
 *
 * Unlike fixed overhead, these expenses grow as the management company
 * takes on more properties or earns more fee revenue:
 *
 *   • Marketing budget — expressed as a % of management fee revenue;
 *     covers brand marketing, digital advertising, and PR
 *   • Travel & site visits — per-property annual travel cost for on-site
 *     inspections, owner meetings, and brand audits
 *   • Per-property operating cost — a flat annual amount per managed
 *     property (covers property-specific admin like license renewals,
 *     local compliance, etc.)
 *   • Miscellaneous variable — a catch-all percentage of total revenue
 *
 * Research Badges display AI-benchmarked industry averages for marketing
 * spend and travel budgets when available.
 */

import { Slider } from "@/components/ui/slider";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import EditableValue from "./EditableValue";
import type { VariableCostsSectionProps } from "./types";
import { CITATIONS } from "./citations";

export default function VariableCostsSection({ formData, onChange, global, researchValues }: VariableCostsSectionProps) {
  const gc = (key: string, label?: string) => ({ entityType: "company" as const, entityId: 0, assumptionKey: key, fieldLabel: label });

  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
    <div className="relative">
      <div className="space-y-6">
        <h3 className="text-lg font-display text-foreground flex items-center">
          Variable Costs
          <InfoTooltip text="Company-level costs that grow as your portfolio grows. These are calculated per property and multiplied by the number of active properties under management. Typical early-stage hotel management companies budget $10K–$23K per property annually for travel + IT licensing (AHLA Lodging Survey)." formula="Monthly = (Travel + IT/Licensing) × Active Properties ÷ 12" />
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <ResearchContextFieldLabel
              label={<>Travel Cost per Client <InfoTooltip text="Annual budget for site visits, client meetings, and property inspections per managed property. Includes flights, hotel stays, and ground transportation. Industry benchmark: $8K–$18K per managed property per year (AHLA Lodging Survey)." formula="Monthly Travel = Cost × Active Properties ÷ 12" /></>}
              badgeProps={{ value: researchValues.travelCost?.display, sourceType: "industry", sourceName: CITATIONS.ahlaLodgingSurvey, "data-testid": "badge-travel-per-client" }}
              onApplyValue={() => researchValues.travelCost && onChange("travelCostPerClient", researchValues.travelCost.mid)}
              guidanceContext={gc("travelCost", "Travel Cost per Client")}
            />
            <EditableValue
              value={formData.travelCostPerClient ?? global.travelCostPerClient}
              onChange={(v) => onChange("travelCostPerClient", v)}
              format="dollar"
              min={0}
              max={50000}
              step={1000}
            />
          </div>
          <Slider
            value={[formData.travelCostPerClient ?? global.travelCostPerClient]}
            onValueChange={([v]) => onChange("travelCostPerClient", v)}
            min={0}
            max={50000}
            step={1000}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <ResearchContextFieldLabel
              label={<>IT/Licensing per Client <InfoTooltip text="Annual software and technology licensing cost per property — includes PMS (property management system), revenue management tools, channel manager, and accounting integrations. Industry benchmark: $2K–$5K per property per year (HFTP Technology Survey)." formula="Monthly IT = Cost × Active Properties ÷ 12" /></>}
              badgeProps={{ value: researchValues.itLicense?.display, sourceType: "industry", sourceName: CITATIONS.hftpTechnologySurvey, "data-testid": "badge-it-license" }}
              onApplyValue={() => researchValues.itLicense && onChange("itLicensePerClient", researchValues.itLicense.mid)}
              guidanceContext={gc("itLicense", "IT/Licensing per Client")}
            />
            <EditableValue
              value={formData.itLicensePerClient ?? global.itLicensePerClient}
              onChange={(v) => onChange("itLicensePerClient", v)}
              format="dollar"
              min={0}
              max={15000}
              step={500}
            />
          </div>
          <Slider
            value={[formData.itLicensePerClient ?? global.itLicensePerClient]}
            onValueChange={([v]) => onChange("itLicensePerClient", v)}
            min={0}
            max={15000}
            step={500}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <ResearchContextFieldLabel
              label={<>Marketing <InfoTooltip text="Corporate marketing spend as a percentage of total management fee revenue (base + incentive fees). Covers brand website, advertising, industry events, and business development. Industry benchmark: 3–7% of fee revenue for hotel management companies (AHLA industry benchmarks)." formula="Monthly Marketing = Total Fee Revenue × Rate ÷ 12" /></>}
              badgeProps={{ value: researchValues.marketingRate?.display, sourceType: "industry", sourceName: CITATIONS.ahlaIndustryBenchmarks, "data-testid": "badge-marketing-rate" }}
              onApplyValue={() => researchValues.marketingRate && onChange("marketingRate", researchValues.marketingRate.mid / 100)}
              guidanceContext={gc("marketingRate", "Marketing")}
            />
            <EditableValue
              value={formData.marketingRate ?? global.marketingRate}
              onChange={(v) => onChange("marketingRate", v)}
              format="percent"
              min={0}
              max={0.15}
              step={0.01}
            />
          </div>
          <Slider
            value={[(formData.marketingRate ?? global.marketingRate) * 100]}
            onValueChange={([v]) => onChange("marketingRate", v / 100)}
            min={0}
            max={15}
            step={1}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <ResearchContextFieldLabel
              label={<>Misc Operations <InfoTooltip text="General operating costs not covered elsewhere — office supplies, postage, bank fees, and incidentals. Expressed as a percentage of total management fee revenue. Industry benchmark: 2–4% of fee revenue for hotel management companies." formula="Monthly Misc = Total Fee Revenue × Rate ÷ 12" /></>}
              badgeProps={{ value: researchValues.miscOps?.display, sourceType: "industry", sourceName: CITATIONS.ahlaIndustryBenchmarks, "data-testid": "badge-misc-ops" }}
              onApplyValue={() => researchValues.miscOps && onChange("miscOpsRate", researchValues.miscOps.mid / 100)}
              guidanceContext={gc("miscOps", "Misc Operations")}
            />
            <EditableValue
              value={formData.miscOpsRate ?? global.miscOpsRate}
              onChange={(v) => onChange("miscOpsRate", v)}
              format="percent"
              min={0}
              max={0.1}
              step={0.005}
            />
          </div>
          <Slider
            value={[(formData.miscOpsRate ?? global.miscOpsRate) * 100]}
            onValueChange={([v]) => onChange("miscOpsRate", v / 100)}
            min={0}
            max={10}
            step={0.5}
          />
        </div>
      </div>
    </div></div>
  );
}
