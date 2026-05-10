/**
 * useSlotAssignments — owns the per-slot vendor/model selection state, dirty
 * tracking, and batch-save mutation. Extracted from LlmWorkflowsPage.tsx so the
 * page shell stays focused on composition.
 *
 * Behavior is byte-identical to the original inline block (see commit history
 * of LlmWorkflowsPage.tsx prior to task-1358).
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { ResourcePublicView } from "@shared/schema";
import type { ModelConfig, SlotConfig } from "./types";

export interface SlotSelection {
  vendorFilter: string;
  modelSlug: string | null;
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
  dirtyCount: number;
  batchSavePending: boolean;
  handleSlotSave: () => void;
}

export function useSlotAssignments(): UseSlotAssignmentsResult {
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

  const batchSave = useMutation({
    mutationFn: async (changes: { id: number; modelSlug: string | null }[]) => {
      await Promise.all(
        changes.map(({ id, modelSlug }) =>
          fetch(`/api/admin/resources/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              config: { modelSlug },
              changeSummary: "LLM assignment updated",
            }),
          }).then((r) => {
            if (!r.ok) throw new Error(`Failed to update slot ${id}`);
            return r.json();
          }),
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
    batchSavePending: batchSave.isPending,
    handleSlotSave,
  };
}
