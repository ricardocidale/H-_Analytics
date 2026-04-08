/**
 * FixedOverheadSection.tsx — Fixed monthly/annual overhead costs.
 *
 * These are the management company's operating expenses that don't scale
 * directly with portfolio size (unlike variable costs). They escalate
 * annually at the configured inflation / escalation rate.
 *
 * Categories:
 *   • Office lease — monthly rent for the management company's office
 *   • Technology — software subscriptions, PMS licenses, IT infrastructure
 *   • Professional services — legal, accounting, audit fees
 *   • Escalation rate — annual % increase applied to all fixed costs
 *     (tracks CPI / general inflation)
 *
 * The model start year is shown in the section header so the user knows
 * which year's dollars are being entered as the "base year" cost.
 */
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import EditableValue from "./EditableValue";
import type { FixedOverheadSectionProps } from "./types";

export default function FixedOverheadSection({ formData, onChange, global, modelStartYear, researchValues }: FixedOverheadSectionProps) {
  const gc = (key: string, label?: string) => ({ entityType: "company" as const, entityId: 0, assumptionKey: key, fieldLabel: label });

  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
    <div className="relative">
      <div className="space-y-6">
        <h3 className="text-lg font-display text-foreground flex items-center">
          Fixed Overhead (<span className="font-mono">{modelStartYear}</span>)
          <InfoTooltip text="Annual overhead costs for running the management company. These are set at Year 1 values and increase each year by the escalation rate below. Unlike variable costs, these don't change with portfolio size. Typical early-stage hotel management company total fixed overhead: $70K–$110K/year (office + legal + tech)." formula="Year N Cost = Starting Cost × (1 + Escalation)^(N-1)" manualSection="company-formulas" />
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center text-foreground label-text">
              Fixed Cost Escalation Rate
              <InfoTooltip text="Annual inflation factor applied to all fixed overhead costs (office lease, professional services, tech). This compounds each year, so a 3% rate means costs grow ~34% over 10 years." />
            </Label>
            <EditableValue
              value={formData.fixedCostEscalationRate ?? global.fixedCostEscalationRate}
              onChange={(v) => onChange("fixedCostEscalationRate", v)}
              format="percent"
              min={0}
              max={0.1}
              step={0.005}
            />
          </div>
          <Slider
            value={[(formData.fixedCostEscalationRate ?? global.fixedCostEscalationRate) * 100]}
            onValueChange={([v]) => onChange("fixedCostEscalationRate", v / 100)}
            min={0}
            max={10}
            step={0.5}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <ResearchContextFieldLabel
              label={<>Office Lease <InfoTooltip text="Annual cost for the management company's corporate office — rent, utilities, and common area charges. This is the Year 1 value; it escalates annually at the rate above. Typical range for early-stage hotel management companies: $24K–$48K/year (HFTP/AICPA benchmarks)." /></>}
              badgeProps={{ value: researchValues.officeLease?.display, sourceType: "industry", sourceName: "HFTP/AICPA benchmarks", "data-testid": "badge-office-lease" }}
              onApplyValue={() => researchValues.officeLease && onChange("officeLeaseStart", researchValues.officeLease.mid)}
              guidanceContext={gc("officeLease", "Office Lease")}
            />
            <EditableValue
              value={formData.officeLeaseStart ?? global.officeLeaseStart}
              onChange={(v) => onChange("officeLeaseStart", v)}
              format="dollar"
              min={0}
              max={200000}
              step={2000}
            />
          </div>
          <Slider
            value={[formData.officeLeaseStart ?? global.officeLeaseStart]}
            onValueChange={([v]) => onChange("officeLeaseStart", v)}
            min={0}
            max={200000}
            step={2000}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <ResearchContextFieldLabel
              label={<>Professional Services <InfoTooltip text="Annual budget for external legal counsel, CPA/audit fees, and specialized consulting. Year 1 value, escalates annually. Typical range for early-stage hotel management companies: $18K–$36K/year (AICPA practice benchmarks)." /></>}
              badgeProps={{ value: researchValues.professionalServices?.display, sourceType: "industry", sourceName: "AICPA practice benchmarks", "data-testid": "badge-professional-services" }}
              onApplyValue={() => researchValues.professionalServices && onChange("professionalServicesStart", researchValues.professionalServices.mid)}
              guidanceContext={gc("professionalServices", "Professional Services")}
            />
            <EditableValue
              value={formData.professionalServicesStart ?? global.professionalServicesStart}
              onChange={(v) => onChange("professionalServicesStart", v)}
              format="dollar"
              min={0}
              max={150000}
              step={2000}
            />
          </div>
          <Slider
            value={[formData.professionalServicesStart ?? global.professionalServicesStart]}
            onValueChange={([v]) => onChange("professionalServicesStart", v)}
            min={0}
            max={150000}
            step={2000}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <ResearchContextFieldLabel
              label={<>Tech Infrastructure <InfoTooltip text="Company-level technology costs — cloud hosting, corporate software subscriptions, cybersecurity, and IT support. Separate from per-property IT licenses (configured in Variable Costs). Typical range: $12K–$24K/year for early-stage hotel management companies (HFTP Technology Survey)." /></>}
              badgeProps={{ value: researchValues.techInfra?.display, sourceType: "industry", sourceName: "HFTP Technology Survey", "data-testid": "badge-tech-infra" }}
              onApplyValue={() => researchValues.techInfra && onChange("techInfraStart", researchValues.techInfra.mid)}
              guidanceContext={gc("techInfra", "Tech Infrastructure")}
            />
            <EditableValue
              value={formData.techInfraStart ?? global.techInfraStart}
              onChange={(v) => onChange("techInfraStart", v)}
              format="dollar"
              min={0}
              max={100000}
              step={2000}
            />
          </div>
          <Slider
            value={[formData.techInfraStart ?? global.techInfraStart]}
            onValueChange={([v]) => onChange("techInfraStart", v)}
            min={0}
            max={100000}
            step={2000}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <ResearchContextFieldLabel
              label={<>Business Insurance <InfoTooltip text="Annual corporate insurance premium — general liability, errors & omissions (E&O), and cyber liability for the management company. This is the company's own policy, separate from each property's insurance. Year 1 value, escalates annually. Typical range: $8K–$15K/year for small hotel management companies." /></>}
              badgeProps={{ value: researchValues.businessInsurance?.display, sourceType: "industry", sourceName: "Insurance industry benchmarks", "data-testid": "badge-business-insurance" }}
              onApplyValue={() => researchValues.businessInsurance && onChange("businessInsuranceStart", researchValues.businessInsurance.mid)}
              guidanceContext={gc("businessInsurance", "Business Insurance")}
            />
            <EditableValue
              value={formData.businessInsuranceStart ?? global.businessInsuranceStart}
              onChange={(v) => onChange("businessInsuranceStart", v)}
              format="dollar"
              min={0}
              max={100000}
              step={1000}
              data-testid="input-business-insurance"
            />
          </div>
          <Slider
            value={[formData.businessInsuranceStart ?? global.businessInsuranceStart]}
            onValueChange={([v]) => onChange("businessInsuranceStart", v)}
            min={0}
            max={100000}
            step={1000}
            data-testid="slider-business-insurance"
          />
        </div>


      </div>
    </div></div>
  );
}
