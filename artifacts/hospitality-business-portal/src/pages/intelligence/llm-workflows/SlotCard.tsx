/**
 * SlotCard — single per-slot vendor/model selector card rendered inside the
 * Slot Accordion. Extracted from LlmWorkflowsPage.tsx during the section split.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { LLM_VENDORS } from "@/components/admin/research-center/research-shared";
import type { ResourcePublicView } from "@shared/schema";
import type { VendorStatus } from "./types";

export interface SlotCardProps {
  slot: ResourcePublicView;
  selection: { vendorFilter: string; modelSlug: string | null };
  originalSlug: string | null;
  modelsByVendor: Record<string, ResourcePublicView[]>;
  vendorStatuses: VendorStatus[];
  onVendorChange: (vendor: string) => void;
  onModelChange: (vendorFilter: string, modelSlug: string) => void;
}

export function SlotCard({
  slot,
  selection,
  originalSlug,
  modelsByVendor,
  vendorStatuses,
  onVendorChange,
  onModelChange,
}: SlotCardProps) {
  const isDirty = selection.modelSlug !== originalSlug;
  const vendorModels = selection.vendorFilter
    ? (modelsByVendor[selection.vendorFilter] ?? [])
    : [];
  const vendorStatus = vendorStatuses.find(
    (vs) => vs.vendor === selection.vendorFilter,
  );

  return (
    <div
      className={`rounded-lg border p-3.5 space-y-3 ${
        isDirty
          ? "border-amber-300/60 bg-amber-500/5"
          : "border-border/50 bg-muted/20"
      }`}
      data-testid={`slot-card-${slot.slug}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-snug">
            {slot.displayName}
          </p>
          {slot.description && (
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">
              {slot.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 pt-0.5">
          {isDirty && (
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 h-3.5 bg-amber-500/10 text-amber-700 border-amber-300"
            >
              unsaved
            </Badge>
          )}
          {selection.modelSlug && vendorStatus?.available && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"
              title="Vendor available"
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <Label className="text-[10px] font-medium text-muted-foreground mb-1 block">
            Vendor
          </Label>
          <Select
            value={selection.vendorFilter || ""}
            onValueChange={onVendorChange}
          >
            <SelectTrigger
              className="h-8 text-xs"
              data-testid={`select-vendor-${slot.slug}`}
            >
              <SelectValue placeholder="Select vendor" />
            </SelectTrigger>
            <SelectContent>
              {LLM_VENDORS.map((v) => {
                const vs = vendorStatuses.find((s) => s.vendor === v.value);
                return (
                  <SelectItem key={v.value} value={v.value}>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                          vs?.available
                            ? "bg-green-500"
                            : vs
                              ? "bg-red-500"
                              : "bg-gray-400"
                        }`}
                      />
                      {v.label}
                      {vs?.modelCount ? ` (${vs.modelCount})` : ""}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-[10px] font-medium text-muted-foreground mb-1 block">
            Model
          </Label>
          <Select
            value={selection.modelSlug ?? ""}
            onValueChange={(v) => onModelChange(selection.vendorFilter, v)}
            disabled={!selection.vendorFilter}
          >
            <SelectTrigger
              className="h-8 text-xs"
              data-testid={`select-model-${slot.slug}`}
            >
              <SelectValue
                placeholder={
                  selection.vendorFilter ? "Select model" : "Select vendor first"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {vendorModels.map((m) => (
                <SelectItem key={m.slug} value={m.slug}>
                  {m.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
