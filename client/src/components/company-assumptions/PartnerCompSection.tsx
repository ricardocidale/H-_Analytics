/**
 * PartnerCompSection.tsx — Management compensation schedule.
 *
 * Configures the annual compensation for the management team (founding
 * partners, leadership). This is a significant expense line, especially
 * in early years when fee revenue is low.
 *
 * Inputs:
 *   • Number of partners
 *   • Per-partner annual draw (salary equivalent)
 *   • Draw escalation rate (annual increase %)
 *   • Year-by-year override table — lets users model a stepped schedule
 *     where draws start low and increase as the portfolio grows
 *
 * The model start year is passed in so column headers show actual calendar
 * years (e.g. 2025, 2026, 2027…) rather than abstract "Year 1, Year 2…".
 */

import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { formatMoney } from "@/lib/financialEngine";
import { DEFAULT_PARTNER_COMP, DEFAULT_PARTNER_COUNT } from "@/lib/constants";
import EditableValue from "./EditableValue";
import type { PartnerCompSectionProps } from "./types";
import { CITATIONS } from "@shared/citations";

export default function PartnerCompSection({ formData, onChange, global, modelStartYear, researchValues }: PartnerCompSectionProps) {
  const gc = (key: string, label?: string) => ({ entityType: "company" as const, entityId: 0, assumptionKey: key, fieldLabel: label });
  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
      <div className="relative">
      <div className="space-y-4">
        <div>
          <ResearchContextFieldLabel
            label={<>Management Compensation Schedule <InfoTooltip text="Annual total management compensation and headcount for each year. Individual compensation = Total ÷ Headcount." manualSection="company-formulas" /></>}
            badgeProps={{ value: researchValues.partnerComp?.display, sourceType: "industry", sourceName: CITATIONS.hospitalityCompBenchmarks, "data-testid": "badge-management-comp" }}
            onApplyValue={() => {
              if (researchValues.partnerComp) {
                onChange("partnerCompYear1", researchValues.partnerComp.mid);
              }
            }}
            guidanceContext={gc("partnerComp", "Management Compensation")}
            className="text-lg font-display text-foreground"
          />
          <p className="text-muted-foreground text-sm label-text">Configure total management compensation and headcount by year</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 font-display text-foreground">Year</th>
                <th className="text-right py-2 px-2 font-display text-foreground">Total Mgmt Comp</th>
                <th className="text-center py-2 px-2 font-display text-foreground">Headcount</th>
                <th className="text-right py-2 px-2 font-display text-muted-foreground">Per Person</th>
              </tr>
            </thead>
            <tbody>
              {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((year) => {
                type PartnerCompKey = `partnerCompYear${typeof year}`;
                type PartnerCountKey = `partnerCountYear${typeof year}`;
                const compKey = `partnerCompYear${year}` as PartnerCompKey;
                const countKey = `partnerCountYear${year}` as PartnerCountKey;
                const compValue = (formData[compKey] ?? global[compKey] ?? DEFAULT_PARTNER_COMP[year - 1]) as number;
                const countValue = (formData[countKey] ?? global[countKey] ?? DEFAULT_PARTNER_COUNT) as number;
                const perPartner = countValue > 0 ? compValue / countValue : 0;
                
                return (
                  <tr key={year} className="border-b border-border last:border-0">
                    <td className="py-2 px-2 font-medium text-foreground">Year {year} (<span className="font-mono">{modelStartYear + year - 1}</span>)</td>
                    <td className="py-2 px-2 text-right">
                      <EditableValue
                        value={compValue}
                        onChange={(v) => onChange(compKey, v)}
                        format="dollar"
                        min={0}
                        max={2000000}
                        step={10000}
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <Select
                        value={String(countValue)}
                        onValueChange={(v) => onChange(countKey, parseInt(v))}
                      >
                        <SelectTrigger className="w-16 text-center font-mono" data-testid={`select-partner-count-year${year}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-2 text-right text-muted-foreground font-mono">
                      {formatMoney(perPartner)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Total Management Comp is the annual budget (12 months). Actual spending is automatically prorated for years with fewer operating months (e.g., if operations start mid-year). Per Person = Total ÷ Headcount.
        </p>
      </div>
    </div></div>
  );
}
