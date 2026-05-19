/**
 * SlotAccordion — section 6 of the LlmWorkflows page.
 *
 * Per-slot vendor/model overrides grouped by functional area. Selections are
 * staged in parent state (see useSlotAssignments) and persisted via the toolbar
 * Save button in HeaderBar.
 *
 * Extracted from LlmWorkflowsPage.tsx during the task-1358 section split.
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import type { ResourcePublicView } from "@shared/schema";
import type { LlmRegistryState } from "@/lib/api/admin";
import { SLOT_GROUPS, SLOT_GROUP_CATEGORY_MAP, type LlmCategory } from "../constants";
import { SlotCard } from "../SlotCard";
import type { SlotSelection, SlotCostSummary } from "../useSlotAssignments";

export interface SlotAccordionProps {
  slotResources: ResourcePublicView[];
  selections: Record<number, SlotSelection>;
  setSelections: React.Dispatch<
    React.SetStateAction<Record<number, SlotSelection>>
  >;
  originalSlugs: Record<number, string | null>;
  modelsByVendor: Record<string, ResourcePublicView[]>;
  registry: LlmRegistryState | undefined;
  costBySlot?: Record<string, SlotCostSummary>;
  category?: LlmCategory;
}

export function SlotAccordion({
  slotResources,
  selections,
  setSelections,
  originalSlugs,
  modelsByVendor,
  registry,
  costBySlot,
  category,
}: SlotAccordionProps) {
  const visibleGroups = category
    ? SLOT_GROUPS.filter((g) => SLOT_GROUP_CATEGORY_MAP[g.id] === category)
    : SLOT_GROUPS;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    visibleGroups.slice(0, 2).forEach((g) => { init[g.id] = true; });
    return init;
  });

  return (
    <div className="space-y-3">
      {visibleGroups.map((group) => {
        const groupSlots = slotResources.filter((s) =>
          group.slots.includes(s.slug),
        );
        const dirtyInGroup = groupSlots.filter(
          (s) => selections[s.id]?.modelSlug !== originalSlugs[s.id],
        ).length;
        const open = openGroups[group.id] ?? false;

        return (
          <Card
            key={group.id}
            className="overflow-hidden"
            data-testid={`accordion-group-${group.id}`}
          >
            <Collapsible
              open={open}
              onOpenChange={(v) =>
                setOpenGroups((prev) => ({ ...prev, [group.id]: v }))
              }
            >
              <CollapsibleTrigger asChild>
                <button
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
                  aria-expanded={open}
                >
                  {open ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="font-semibold text-sm shrink-0">
                    {group.label}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-4 shrink-0"
                  >
                    {groupSlots.length} slot
                    {groupSlots.length !== 1 ? "s" : ""}
                  </Badge>
                  {dirtyInGroup > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4 bg-amber-500/10 text-amber-700 border-amber-300 shrink-0"
                    >
                      {dirtyInGroup} unsaved
                    </Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground truncate hidden sm:block ml-auto">
                    {group.description}
                  </span>
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="px-5 pb-5 pt-4 border-t">
                  {groupSlots.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3">
                      No slots found — run the admin-resources migration to
                      seed slot rows.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {groupSlots.map((slot) => (
                        <SlotCard
                          key={slot.id}
                          slot={slot}
                          selection={
                            selections[slot.id] ?? {
                              vendorFilter: "",
                              modelSlug: null,
                            }
                          }
                          originalSlug={originalSlugs[slot.id] ?? null}
                          modelsByVendor={modelsByVendor}
                          vendorStatuses={registry?.vendorStatuses ?? []}
                          costSummary={costBySlot?.[slot.slug]}
                          onVendorChange={(vendor) => {
                            setSelections((prev) => ({
                              ...prev,
                              [slot.id]: {
                                vendorFilter: vendor,
                                modelSlug: null,
                              },
                            }));
                          }}
                          onModelChange={(vendorFilter, modelSlug) => {
                            setSelections((prev) => ({
                              ...prev,
                              [slot.id]: { vendorFilter, modelSlug },
                            }));
                          }}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
}
