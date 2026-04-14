/**
 * PPECostBasisSchedule.tsx — Depreciation and cost-basis table for a property.
 *
 * Renders a year-by-year schedule showing how the property's depreciable
 * assets lose book value over time under straight-line GAAP depreciation:
 *
 *   PP&E (Property, Plant & Equipment):
 *     Cost basis = Purchase Price − Land Value.
 *     Depreciated over the building's useful life (39 years for nonresidential hotel).
 *
 *   FF&E (Furniture, Fixtures & Equipment):
 *     Cost basis = initial FF&E budget.
 *     Depreciated over a shorter useful life (typically 5–7 years).
 *     Annual FF&E reserve contributions may create new FF&E "layers" that
 *     restart their own depreciation clock.
 *
 * Columns: Year | Beginning Balance | Annual Depreciation | Accumulated
 * Depreciation | Ending Net Book Value.
 *
 * The ending book value matters for computing gain/loss on sale at exit
 * and for the balance sheet's asset section.
 */
import { useState } from "react";
import { formatMoney } from "@/lib/financialEngine";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import { IconInfo } from "@/components/icons";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DEPRECIATION_YEARS, DAYS_PER_MONTH, DEFAULT_LAND_VALUE_PERCENT, DEFAULT_REV_SHARE_EVENTS, DEFAULT_REV_SHARE_FB, DEFAULT_REV_SHARE_OTHER, DEFAULT_CATERING_BOOST_PCT, MONTHS_PER_YEAR } from "@shared/constants";
import { DEFAULT_LTV } from "@/lib/financial/loanCalculations";
import type { PPECostBasisScheduleProps } from "./types";

export default function PPECostBasisSchedule({ property, global }: PPECostBasisScheduleProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    acquisition: true,
    depreciation: false,
    fixedCostAnchor: false,
    loanBasis: false,
  });

  const toggle = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const fmt = (n: number) => formatMoney(n);
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  // ---- Cost basis breakdown ----
  // Land is not depreciable (it doesn't lose value), so we split the purchase
  // price into land vs. building using the land-value percentage.
  const purchasePrice = property.purchasePrice ?? 0;
  const buildingImprovements = property.buildingImprovements ?? 0;
  const preOpeningCosts = property.preOpeningCosts ?? 0;
  const operatingReserve = property.operatingReserve ?? 0;
  const landPct = property.landValuePercent ?? DEFAULT_LAND_VALUE_PERCENT;
  const landValue = purchasePrice * landPct;
  const buildingValue = purchasePrice * (1 - landPct);
  // Depreciable basis = building portion + renovation costs (land excluded)
  const totalDepreciableBasis = buildingValue + buildingImprovements;
  // Straight-line depreciation: spread evenly over the useful life
  // Resolution order: property → globalAssumptions → hardcoded constant
  const resolvedDepreciationYears = property.depreciationYears ?? global.depreciationYears ?? DEPRECIATION_YEARS;
  const annualDepreciation = totalDepreciableBasis / resolvedDepreciationYears;
  const monthlyDepreciation = annualDepreciation / MONTHS_PER_YEAR;
  // Total project cost includes non-depreciable items (pre-opening, reserves)
  const totalProjectCost = purchasePrice + buildingImprovements + preOpeningCosts + operatingReserve;
  const totalPropertyValue = purchasePrice + buildingImprovements;

  // ---- Revenue cross-check calculations ----
  // Revenue shares express % of TOTAL revenue. Room share is derived: 1 - ancillary shares.
  const revShareEvents = property.revShareEvents ?? DEFAULT_REV_SHARE_EVENTS;
  const revShareFB = property.revShareFB ?? DEFAULT_REV_SHARE_FB;
  const revShareOther = property.revShareOther ?? DEFAULT_REV_SHARE_OTHER;
  const cateringBoostPct = property.cateringBoostPercent ?? DEFAULT_CATERING_BOOST_PCT;
  const _cateringBoostMultiplier = 1 + cateringBoostPct;

  // Base monthly room revenue = rooms × days/month × nightly rate × occupancy
  const resolvedDaysPerMonth = global.daysPerMonth ?? DAYS_PER_MONTH;
  const baseMonthlyRoomRev = property.roomCount * resolvedDaysPerMonth * property.startAdr * property.startOccupancy;
  // Total revenue derived from room revenue and ancillary shares of total
  const ancillaryShare = revShareEvents + revShareFB + revShareOther;
  const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare);
  const baseMonthlyTotalRev = baseMonthlyRoomRev / roomShareOfTotal;
  const baseMonthlyEventsRev = baseMonthlyTotalRev * revShareEvents;
  const baseMonthlyFBRev = baseMonthlyTotalRev * revShareFB;
  const baseMonthlyOtherRev = baseMonthlyTotalRev * revShareOther;
  const baseAnnualTotalRev = baseMonthlyTotalRev * MONTHS_PER_YEAR;

  const fixedCostEscRate = global.fixedCostEscalationRate ?? 0.03;
  const costRatePropertyOps = property.costRatePropertyOps ?? 0.04;
  const costRateAdmin = property.costRateAdmin ?? 0.08;
  const costRateTaxes = property.costRateTaxes ?? 0.03;
  const costRateIT = property.costRateIT ?? 0.02;
  const costRateOther = property.costRateOther ?? 0.05;

  // Capital stack: how the acquisition is funded
  // LTV (Loan-to-Value) determines how much is debt vs. equity
  const ltv = property.acquisitionLTV ?? DEFAULT_LTV;
  const loanAmount = property.type === "Financed" ? totalPropertyValue * ltv : 0;
  const equityRequired = totalProjectCost - loanAmount;

  const SectionRow = ({ sectionKey, label, value, tooltip }: { sectionKey: string; label: string; value: string; tooltip?: string }) => {
    const isOpen = openSections[sectionKey];
    return (
      <tr
        className="cursor-pointer hover:bg-muted border-b border-border transition-colors"
        onClick={() => toggle(sectionKey)}
        data-testid={`ppe-section-${sectionKey}`}
      >
        <td className="py-3 px-4 font-semibold text-foreground flex items-center gap-2">
          {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          {label}
          {tooltip && <InfoTooltip text={tooltip} />}
        </td>
        <td className="py-3 px-4 text-right font-semibold font-mono text-foreground">{value}</td>
      </tr>
    );
  };

  const DetailRow = ({ label, value, indent, muted, bold, tooltip }: { label: string; value: string; indent?: boolean; muted?: boolean; bold?: boolean; tooltip?: string }) => (
    <tr className={`border-b border-border ${bold ? "bg-muted" : ""}`}>
      <td className={`py-2 px-4 ${indent ? "pl-12" : "pl-8"} ${muted ? "text-muted-foreground" : "text-muted-foreground"} ${bold ? "font-semibold text-foreground" : ""}`}>
        <span className="flex items-center gap-1">
          {label}
          {tooltip && <InfoTooltip text={tooltip} />}
        </span>
      </td>
      <td className={`py-2 px-4 text-right font-mono ${muted ? "text-muted-foreground" : "text-muted-foreground"} ${bold ? "font-semibold text-foreground" : ""}`}>{value}</td>
    </tr>
  );

  return (
    <Card className="overflow-hidden bg-card shadow-lg border border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground flex items-center gap-2">
          PP&E / Cost Basis Schedule
          <InfoTooltip text="Asset values, depreciation basis, and cost anchors that drive the property's financial projections. Expand each section for details." manualSection="property-formulas" />
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {property.name} — Checker transparency view
        </p>
      </CardHeader>
      <div className="px-6 pb-6">
        <table className="w-full" data-testid="ppe-schedule-table">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="text-left py-2 px-4 text-sm font-bold text-foreground uppercase tracking-wider">Item</th>
              <th className="text-right py-2 px-4 text-sm font-bold text-foreground uppercase tracking-wider">Value</th>
            </tr>
          </thead>
          <tbody>
            <SectionRow sectionKey="acquisition" label="Acquisition & Project Cost" value={fmt(totalProjectCost)} tooltip="Total capital required to acquire, improve, and open the property — the full day-one investment." />
            {openSections.acquisition && (
              <>
                <DetailRow label="Purchase Price" value={fmt(purchasePrice)} />
                <DetailRow label={`Land Value (${pct(landPct)} of purchase)`} value={fmt(landValue)} indent tooltip="Land does not depreciate per IRS Publication 946." />
                <DetailRow label={`Building Value (${pct(1 - landPct)} of purchase)`} value={fmt(buildingValue)} indent />
                <DetailRow label="Building Improvements" value={fmt(buildingImprovements)} />
                <DetailRow label="Pre-Opening Costs" value={fmt(preOpeningCosts)} />
                <DetailRow label="Operating Reserve" value={fmt(operatingReserve)} />
                <DetailRow label="Total Property Value (Price + Improvements)" value={fmt(totalPropertyValue)} bold tooltip="Basis for loan sizing — LTV is applied to this amount." />
                <DetailRow label="Total Project Cost" value={fmt(totalProjectCost)} bold />
              </>
            )}

            <SectionRow sectionKey="depreciation" label="Depreciation Schedule (ASC 360)" value={fmt(annualDepreciation) + " /yr"} tooltip="Annual non-cash expense that reduces taxable income. Building and improvements depreciate over 39 years; land is excluded." />
            {openSections.depreciation && (
              <>
                <DetailRow label="Building Value (from purchase)" value={fmt(buildingValue)} />
                <DetailRow label="+ Building Improvements" value={fmt(buildingImprovements)} />
                <DetailRow label="= Total Depreciable Basis" value={fmt(totalDepreciableBasis)} bold />
                <DetailRow label="Depreciation Period" value={`${resolvedDepreciationYears} years`} />
                <DetailRow label="Annual Depreciation" value={fmt(annualDepreciation)} bold />
                <DetailRow label="Monthly Depreciation" value={fmt(monthlyDepreciation)} />
                <DetailRow label="Full Depreciation Date" value={`~${resolvedDepreciationYears} years after acquisition`} muted />
              </>
            )}

            <SectionRow
              sectionKey="fixedCostAnchor"
              label="Fixed Cost Anchor (Year 1 Base Revenue)"
              value={fmt(baseAnnualTotalRev) + " /yr"}
              tooltip="Fixed operating costs are anchored to this Year 1 revenue figure and escalate with inflation — they do not scale with actual revenue growth."
            />
            {openSections.fixedCostAnchor && (
              <>
                <DetailRow label="Room Count" value={`${property.roomCount} rooms`} />
                <DetailRow label="Days per Month" value={`${resolvedDaysPerMonth}`} />
                <DetailRow label="Starting ADR" value={fmt(property.startAdr)} />
                <DetailRow label="Starting Occupancy" value={pct(property.startOccupancy)} />
                <DetailRow label="Base Monthly Room Revenue" value={fmt(baseMonthlyRoomRev)} bold />
                <DetailRow label={`Events Revenue (${pct(revShareEvents)} of total)`} value={fmt(baseMonthlyEventsRev)} indent />
                <DetailRow label={`F&B Revenue (${pct(revShareFB)} of total)`} value={fmt(baseMonthlyFBRev)} indent />
                <DetailRow label={`Other Revenue (${pct(revShareOther)} of total)`} value={fmt(baseMonthlyOtherRev)} indent />
                <DetailRow label="Base Monthly Total Revenue" value={fmt(baseMonthlyTotalRev)} bold />
                <DetailRow label="Base Annual Total Revenue" value={fmt(baseAnnualTotalRev)} bold />

                <tr className="border-b border-border">
                  <td colSpan={2} className="py-3 px-8">
                    <div className="bg-chart-1/10 border border-chart-1/15 rounded-lg p-3">
                      <p className="text-xs font-semibold text-chart-1 mb-2 flex items-center gap-1">
                        <IconInfo className="w-3.5 h-3.5" /> Fixed Cost Rates Applied to Base Revenue
                      </p>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-chart-1">
                        <span>Property Operations: {pct(costRatePropertyOps)} → {fmt(baseMonthlyTotalRev * costRatePropertyOps)}/mo</span>
                        <span>Admin & General: {pct(costRateAdmin)} → {fmt(baseMonthlyTotalRev * costRateAdmin)}/mo</span>
                        <span>Property Taxes: {pct(costRateTaxes)} of property value → {fmt(totalPropertyValue / MONTHS_PER_YEAR * costRateTaxes)}/mo</span>
                        <span>IT & Technology: {pct(costRateIT)} → {fmt(baseMonthlyTotalRev * costRateIT)}/mo</span>
                        <span>Other Costs: {pct(costRateOther)} → {fmt(baseMonthlyTotalRev * costRateOther)}/mo</span>
                      </div>
                      <p className="text-xs text-chart-1 mt-2">
                        These base amounts escalate at {pct(fixedCostEscRate)}/year (compounding). Year 2 = base × {(1 + fixedCostEscRate).toFixed(4)}, Year 3 = base × {((1 + fixedCostEscRate) ** 2).toFixed(4)}, etc.
                      </p>
                    </div>
                  </td>
                </tr>
              </>
            )}

            {property.type === "Financed" && (
              <>
                <SectionRow sectionKey="loanBasis" label="Loan & Equity Basis" value={fmt(loanAmount)} tooltip="Loan sized as LTV × property value. Equity covers the remainder of the total project cost." />
                {openSections.loanBasis && (
                  <>
                    <DetailRow label="Financing Type" value={property.type} />
                    <DetailRow label="Total Property Value (Loan Basis)" value={fmt(totalPropertyValue)} tooltip="LTV is applied to this amount, not the total project cost including reserves." />
                    <DetailRow label={`Loan-to-Value (LTV): ${pct(ltv)}`} value={fmt(loanAmount)} bold />
                    <DetailRow label="Equity Required" value={fmt(equityRequired)} bold />
                    <DetailRow label="Interest Rate" value={pct(property.acquisitionInterestRate ?? global.debtAssumptions?.interestRate ?? 0.09)} />
                    <DetailRow label="Amortization Term" value={`${property.acquisitionTermYears ?? global.debtAssumptions?.amortizationYears ?? 25} years`} />
                  </>
                )}
              </>
            )}
            {property.type === "Full Equity" && (
              <>
                <SectionRow sectionKey="loanBasis" label="Equity Basis" value={fmt(totalProjectCost)} tooltip="No debt financing — total equity equals the full project cost." />
                {openSections.loanBasis && (
                  <>
                    <DetailRow label="Financing Type" value="Full Equity (No Debt)" />
                    <DetailRow label="Total Equity Required" value={fmt(totalProjectCost)} bold />
                    {property.willRefinance === "Yes" && property.refinanceDate && (
                      <DetailRow label="Planned Refinance Date" value={new Date(property.refinanceDate).toLocaleDateString()} muted />
                    )}
                  </>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
