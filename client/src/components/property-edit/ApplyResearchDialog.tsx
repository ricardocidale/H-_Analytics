/**
 * ApplyResearchDialog.tsx — Lets users bulk-apply AI research values to property assumptions.
 *
 * Shows a confirmation dialog listing all fields that would change (current vs.
 * research-recommended), with per-field checkboxes for selective application.
 */
import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight } from "@/components/icons/themed-icons";
import { IconWand2 } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Maps research value keys to property field names, labels, and divisors.
 * Divisor converts from research display units (e.g. 36 for 36%) to property
 * storage units (e.g. 0.36). A divisor of 100 means the research mid is a
 * percentage integer that must be divided by 100 for the property field.
 * A divisor of 1 means the value is used as-is.
 */
export const RESEARCH_TO_PROPERTY_MAP: {
  researchKey: string;
  propertyField: string;
  label: string;
  divisor: number;
  format: "percent" | "currency" | "number";
}[] = [
  { researchKey: "adr", propertyField: "startAdr", label: "Starting ADR", divisor: 1, format: "currency" },
  { researchKey: "startOccupancy", propertyField: "startOccupancy", label: "Starting Occupancy", divisor: 100, format: "percent" },
  { researchKey: "occupancy", propertyField: "maxOccupancy", label: "Max Occupancy", divisor: 100, format: "percent" },
  { researchKey: "rampMonths", propertyField: "occupancyRampMonths", label: "Occupancy Ramp Months", divisor: 1, format: "number" },
  { researchKey: "occupancyStep", propertyField: "occupancyGrowthStep", label: "Occupancy Growth Step", divisor: 100, format: "percent" },
  { researchKey: "adrGrowth", propertyField: "adrGrowthRate", label: "ADR Growth Rate", divisor: 100, format: "percent" },
  { researchKey: "capRate", propertyField: "exitCapRate", label: "Exit Cap Rate", divisor: 100, format: "percent" },
  { researchKey: "catering", propertyField: "cateringBoostPercent", label: "Catering Boost %", divisor: 100, format: "percent" },
  { researchKey: "landValue", propertyField: "landValuePercent", label: "Land Value %", divisor: 100, format: "percent" },
  { researchKey: "costHousekeeping", propertyField: "costRateRooms", label: "Room Costs Rate", divisor: 100, format: "percent" },
  { researchKey: "costFB", propertyField: "costRateFB", label: "F&B Costs Rate", divisor: 100, format: "percent" },
  { researchKey: "costAdmin", propertyField: "costRateAdmin", label: "Admin Costs Rate", divisor: 100, format: "percent" },
  { researchKey: "costPropertyOps", propertyField: "costRatePropertyOps", label: "Property Ops Rate", divisor: 100, format: "percent" },
  { researchKey: "costUtilities", propertyField: "costRateUtilities", label: "Utilities Rate", divisor: 100, format: "percent" },
  { researchKey: "costFFE", propertyField: "costRateFFE", label: "FF&E Reserve Rate", divisor: 100, format: "percent" },
  { researchKey: "costMarketing", propertyField: "costRateMarketing", label: "Marketing Rate", divisor: 100, format: "percent" },
  { researchKey: "costIT", propertyField: "costRateIT", label: "IT Costs Rate", divisor: 100, format: "percent" },
  { researchKey: "costOther", propertyField: "costRateOther", label: "Other Costs Rate", divisor: 100, format: "percent" },
  { researchKey: "costPropertyTaxes", propertyField: "costRateTaxes", label: "Property Tax Rate", divisor: 100, format: "percent" },
  { researchKey: "incentiveFee", propertyField: "incentiveManagementFeeRate", label: "Incentive Fee Rate", divisor: 100, format: "percent" },
  { researchKey: "incomeTax", propertyField: "taxRate", label: "Income Tax Rate", divisor: 100, format: "percent" },
  { researchKey: "revShareEvents", propertyField: "revShareEvents", label: "Event Revenue Share", divisor: 100, format: "percent" },
  { researchKey: "revShareFB", propertyField: "revShareFB", label: "F&B Revenue Share", divisor: 100, format: "percent" },
  { researchKey: "revShareOther", propertyField: "revShareOther", label: "Other Revenue Share", divisor: 100, format: "percent" },
  { researchKey: "saleCommission", propertyField: "dispositionCommission", label: "Sale Commission", divisor: 100, format: "percent" },
];

function formatValue(value: number | null | undefined, format: "percent" | "currency" | "number"): string {
  if (value == null) return "—";
  if (format === "percent") return `${(value * 100).toFixed(1)}%`;
  if (format === "currency") return `$${Math.round(value).toLocaleString()}`;
  return String(Math.round(value));
}

function formatResearchValue(mid: number, format: "percent" | "currency" | "number", divisor: number): string {
  const converted = mid / divisor;
  return formatValue(converted, format);
}

interface ApplyResearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: Record<string, any>;
  researchValues: Record<string, { display: string; mid: number; source?: string }>;
  onChange: (key: string, value: number | null) => void;
  dirtyFields?: Set<string>;
}

interface FieldDiff {
  researchKey: string;
  propertyField: string;
  label: string;
  currentValue: number | null | undefined;
  researchMid: number;
  convertedValue: number;
  format: "percent" | "currency" | "number";
  changed: boolean;
  isUserEdited: boolean;
}

export function ApplyResearchDialog({ open, onOpenChange, draft, researchValues, onChange, dirtyFields }: ApplyResearchDialogProps) {
  const diffs = useMemo(() => {
    const result: FieldDiff[] = [];
    for (const mapping of RESEARCH_TO_PROPERTY_MAP) {
      const rv = researchValues[mapping.researchKey];
      if (!rv || rv.mid == null) continue;
      const converted = rv.mid / mapping.divisor;
      const current = draft[mapping.propertyField];
      const changed = current == null || Math.abs(current - converted) > 0.0001;
      if (!changed) continue;
      const isUserEdited = dirtyFields?.has(mapping.propertyField) ?? false;
      result.push({
        researchKey: mapping.researchKey,
        propertyField: mapping.propertyField,
        label: mapping.label,
        currentValue: current,
        researchMid: rv.mid,
        convertedValue: converted,
        format: mapping.format,
        changed,
        isUserEdited,
      });
    }
    return result;
  }, [draft, researchValues, dirtyFields]);

  const autoSelectableFields = diffs.filter(d => !d.isUserEdited).map(d => d.propertyField);
  const [selected, setSelected] = useState<Set<string>>(new Set(autoSelectableFields));

  const diffKey = diffs.map(d => d.propertyField).join(",");
  const [prevDiffKey, setPrevDiffKey] = useState(diffKey);
  if (diffKey !== prevDiffKey) {
    setPrevDiffKey(diffKey);
    setSelected(new Set(diffs.filter(d => !d.isUserEdited).map(d => d.propertyField)));
  }

  const toggleField = (field: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === diffs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(diffs.map(d => d.propertyField)));
    }
  };

  const handleApply = () => {
    for (const diff of diffs) {
      if (selected.has(diff.propertyField)) {
        onChange(diff.propertyField, diff.convertedValue);
      }
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconWand2 className="w-5 h-5 text-primary" />
            Apply Research Values
          </DialogTitle>
          <DialogDescription>
            Select which AI-recommended values to apply to this property's assumptions. Only fields with different values are shown.
          </DialogDescription>
        </DialogHeader>

        {diffs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            All property assumptions already match research recommendations.
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <Checkbox
                checked={selected.size === diffs.length}
                onCheckedChange={toggleAll}
                data-testid="checkbox-select-all"
              />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {selected.size} of {diffs.length} selected
              </span>
            </div>

            {diffs.map((diff) => (
              <label
                key={diff.propertyField}
                className={cn(
                  "flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted cursor-pointer transition-colors",
                  diff.isUserEdited && "opacity-60"
                )}
                data-testid={`apply-field-${diff.propertyField}`}
              >
                <Checkbox
                  checked={selected.has(diff.propertyField)}
                  onCheckedChange={() => toggleField(diff.propertyField)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{diff.label}</p>
                    {diff.isUserEdited && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" data-testid={`edited-badge-${diff.propertyField}`}>
                        Edited
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{formatValue(diff.currentValue, diff.format)}</span>
                    <ArrowRight className="w-3 h-3 text-primary" />
                    <span className="font-semibold text-primary">
                      {formatResearchValue(diff.researchMid, diff.format, diff.format === "currency" || diff.format === "number" ? 1 : 100)}
                    </span>
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={selected.size === 0}
            data-testid="button-apply-research"
          >
            <IconWand2 className="w-4 h-4" />
            Apply {selected.size} {selected.size === 1 ? "Value" : "Values"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
