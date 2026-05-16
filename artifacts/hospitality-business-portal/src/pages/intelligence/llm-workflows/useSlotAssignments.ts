/**
 * useSlotAssignments — owns the per-slot vendor/model selection state, dirty
 * tracking, and batch-save mutation. Extracted from LlmWorkflowsPage.tsx so the
 * page shell stays focused on composition.
 *
 * Behavior is byte-identical to the original inline block (see commit history
 * of LlmWorkflowsPage.tsx prior to task-1358).
 */

import { useEffect, useMemo, useState } from "react";

const COST_SUMMARY_STALE_MS = 5 * 60 * 1000;
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ResourcePublicView } from "@shared/schema";
import type { ModelConfig, SlotConfig } from "./types";
import {
  SLOT_GROUPS,
  SLOT_GROUP_CATEGORY_MAP,
  type LlmCategory,
} from "./constants";

export interface SlotSelection {
  vendorFilter: string;
  modelSlug: string | null;
}

export interface SlotCostSummary {
  slotSlug: string;
  modelSlug: string;
  vendor: string;
  calls: number;
  totalCostUsd: number;
  avgCostPerCall: number;
  p95DurationMs: number | null;
}

export interface UseSlotAssignmentsResult {
  slotResources: ResourcePublicView[];
  slotsLoading: boolean;
  modelResources: ResourcePublicView[];
  modelsByVendor: Record<string, ResourcePublicView[]>;
  selections: Record<number, SlotSelection>;
  setSelections: React.Dispatch<
    React.SetStateAction<Record<number, SlotSelection>>
  >;
  originalSlugs: Record<number, string | null>;
  isDirty: boolean;
  /** Cost summary keyed by slotSlug, populated by the 30-day cost query. */
  costBySlot: Record<string, SlotCostSummary>;
  /**
   * Total count of unsaved slot changes across ALL categories. The Save
   * button persists every dirty slot regardless of which category is active.
   */
  dirtyCount: number;
  /**
   * Count of unsaved slot changes whose owning category matches the
   * `category` argument passed to the hook. Equals `dirtyCount` when no
   * category is provided (legacy unscoped view).
   */
  visibleDirtyCount: number;
  /**
   * Count of unsaved slot changes whose owning category does NOT match the
   * `category` argument (i.e. live in other LLM sub-sections). Always 0 when
   * no category is provided.
   */
  otherDirtyCount: number;
  batchSavePending: boolean;
  handleSlotSave: () => void;
}

export function useSlotAssignments(
  category?: LlmCategory,
): UseSlotAssignmentsResult {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: slotResources = [], isLoading: slotsLoading } = useQuery<
    ResourcePublicView[]
  >({
    queryKey: ["/api/admin/resources?kind=llm_slot"],
  });

  const { data: modelResources = [] } = useQuery<ResourcePublicView[]>({
    queryKey: ["/api/admin/resources?kind=model"],
  });

  const { data: costSummaryData } = useQuery<{
    perSlot: SlotCostSummary[];
  }>({
    queryKey: ["/api/admin/llm-cost-summary?windowDays=30"],
    staleTime: COST_SUMMARY_STALE_MS,
  });

  const costBySlot = useMemo(() => {
    const map: Record<string, SlotCostSummary> = {};
    for (const entry of costSummaryData?.perSlot ?? []) {
      map[entry.slotSlug] = entry;
    }
    return map;
  }, [costSummaryData]);

  const modelsByVendor = useMemo(() => {
    const map: Record<string, ResourcePublicView[]> = {};
    for (const m of modelResources) {
      const vendor = (m.config as ModelConfig | null)?.vendor ?? "unknown";
      if (!map[vendor]) map[vendor] = [];
      map[vendor].push(m);
    }
    return map;
  }, [modelResources]);

  const [selections, setSelections] = useState<Record<number, SlotSelection>>(
    {},
  );
  const [originalSlugs, setOriginalSlugs] = useState<
    Record<number, string | null>
  >({});
  const [slotsInitialized, setSlotsInitialized] = useState(false);

  useEffect(() => {
    if (
      !slotsInitialized &&
      slotResources.length > 0 &&
      modelResources.length > 0
    ) {
      const initial: Record<number, SlotSelection> = {};
      const originals: Record<number, string | null> = {};
      for (const slot of slotResources) {
        const slug = (slot.config as SlotConfig | null)?.modelSlug ?? null;
        const model = slug
          ? modelResources.find((m) => m.slug === slug)
          : null;
        const vendor = (model?.config as ModelConfig | null)?.vendor ?? "";
        initial[slot.id] = { vendorFilter: vendor, modelSlug: slug };
        originals[slot.id] = slug;
      }
      setSelections(initial);
      setOriginalSlugs(originals);
      setSlotsInitialized(true);
    }
  }, [slotsInitialized, slotResources, modelResources]);

  const isDirty = useMemo(
    () =>
      Object.entries(selections).some(
        ([id, sel]) => sel.modelSlug !== originalSlugs[Number(id)],
      ),
    [selections, originalSlugs],
  );

  const dirtyCount = useMemo(
    () =>
      Object.entries(selections).filter(
        ([id, sel]) => sel.modelSlug !== originalSlugs[Number(id)],
      ).length,
    [selections, originalSlugs],
  );

  /**
   * Map slotId → owning LLM category, derived from SLOT_GROUPS membership.
   * A slot whose slug isn't found in any group has category `undefined` and
   * will always count toward `visibleDirtyCount` (defensive — avoids hiding
   * dirty rows the user can never re-find from a sub-section).
   */
  const slotCategoryById = useMemo(() => {
    const slugToCategory = new Map<string, LlmCategory>();
    for (const group of SLOT_GROUPS) {
      const cat = SLOT_GROUP_CATEGORY_MAP[group.id];
      if (!cat) continue;
      for (const slug of group.slots) slugToCategory.set(slug, cat);
    }
    const map: Record<number, LlmCategory | undefined> = {};
    for (const slot of slotResources) {
      map[slot.id] = slugToCategory.get(slot.slug);
    }
    return map;
  }, [slotResources]);

  const visibleDirtyCount = useMemo(() => {
    if (!category) return dirtyCount;
    return Object.entries(selections).filter(([id, sel]) => {
      const slotId = Number(id);
      if (sel.modelSlug === originalSlugs[slotId]) return false;
      const slotCategory = slotCategoryById[slotId];
      return slotCategory === undefined || slotCategory === category;
    }).length;
  }, [category, selections, originalSlugs, slotCategoryById, dirtyCount]);

  const otherDirtyCount = dirtyCount - visibleDirtyCount;

  const batchSave = useMutation({
    mutationFn: async (changes: { id: number; modelSlug: string | null }[]) => {
      await Promise.all(
        changes.map(({ id, modelSlug }) =>
          apiRequest("PUT", `/api/admin/resources/${id}`, {
            config: { modelSlug },
            changeSummary: "LLM assignment updated",
          }, {
            fallbackMessage: `Failed to update slot ${id}`,
          }).then((r) => r.json()),
        ),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/resources?kind=llm_slot"],
      });
      setSlotsInitialized(false);
      toast({
        title: `LLM assignments saved (${dirtyCount} slot${dirtyCount !== 1 ? "s" : ""})`,
      });
    },
    onError: () =>
      toast({
        title: "Failed to save LLM assignments",
        variant: "destructive",
      }),
  });

  const handleSlotSave = () => {
    const changes = Object.entries(selections)
      .filter(([id, sel]) => sel.modelSlug !== originalSlugs[Number(id)])
      .map(([id, sel]) => ({ id: Number(id), modelSlug: sel.modelSlug }));
    if (changes.length > 0) batchSave.mutate(changes);
  };

  return {
    slotResources,
    slotsLoading,
    modelResources,
    modelsByVendor,
    selections,
    setSelections,
    originalSlugs,
    isDirty,
    dirtyCount,
    visibleDirtyCount,
    otherDirtyCount,
    batchSavePending: batchSave.isPending,
    handleSlotSave,
    costBySlot,
  };
}
