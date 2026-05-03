/**
 * TimelineSection.tsx — Acquisition and renovation timeline inputs.
 *
 * Controls the key dates that anchor the financial model:
 *   • Acquisition date  – when the property is purchased; Year 1 of projections
 *   • Renovation start  – when capital improvements begin (capex drawdown starts)
 *   • Renovation end    – when the property opens for business and revenue begins
 *   • Operating months  – automatically derived from renovation end date; shows
 *                         how many months of Year 1 generate revenue (partial year)
 *
 * These dates drive the "ramp-up" logic: occupancy and ADR in Year 1 are
 * prorated based on how many operating months remain after renovation.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { PropertyEditSectionProps } from "./types";

export default function TimelineSection({ draft, onChange }: PropertyEditSectionProps) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="relative p-6">
        <div className="mb-6">
          <h3 className="text-xl font-display text-foreground">Timeline</h3>
          <p className="text-muted-foreground text-sm label-text">Acquisition and operations schedule</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="flex items-center label-text text-foreground">
              Acquisition Date
              <InfoTooltip text="The date when the property is purchased. Equity investment occurs on this date. Pre-opening costs and building improvements are incurred during the period between acquisition and operations start." />
            </Label>
            <Input type="date" value={draft.acquisitionDate} onChange={(e) => onChange("acquisitionDate", e.target.value)} className="bg-card border-primary/30 text-foreground" />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center label-text text-foreground">
              Operations Start Date
              <InfoTooltip text="The date when the property begins operating and generating revenue. All revenues and operating expenses start on this date. The period between acquisition and operations start is used for renovations and pre-opening preparation." />
            </Label>
            <Input type="date" value={draft.operationsStartDate} onChange={(e) => onChange("operationsStartDate", e.target.value)} className="bg-card border-primary/30 text-foreground" />
          </div>
        </div>
      </div>
    </div>
  );
}
