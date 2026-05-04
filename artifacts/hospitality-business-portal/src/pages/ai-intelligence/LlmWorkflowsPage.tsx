/**
 * LlmWorkflowsPage — the ONLY place in AI Intelligence to manage LLM configuration.
 *
 * Doctrine (binding):
 *   hplus-admin-nav-ia Rule 12 — LLM model names, endpoints, API key references,
 *     rate limits, and fallback chains are managed exclusively here.
 *   hplus-admin-nav-ia Rule 13 — Uses workflow cards (accordion), NOT a flat LLM registry.
 *
 * Each accordion group is a shadcn Card. Clicking the trigger opens the card body showing
 * all slot assignments for that domain. Changes are staged locally; Save persists all dirty
 * slots via PUT /api/admin/resources/:id. Analyst button probes vendor APIs (no auto-save).
 */

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/save-button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconCpu } from "@/components/icons";
import { useLlmRegistry, useRefreshLlmRegistry } from "@/lib/api/admin";
import { LLM_VENDORS } from "@/components/admin/research-center/research-shared";
import type { ResourcePublicView } from "@shared/schema";

interface SlotConfig {
  modelSlug?: string | null;
}

interface ModelConfig {
  vendor?: string;
  modelId?: string;
}

const SLOT_GROUPS: {
  id: string;
  label: string;
  description: string;
  slots: string[];
}[] = [
  {
    id: "financial",
    label: "Financial Analysis",
    description: "Pro forma generation, quant/market panels, and primary research synthesis",
    slots: [
      "specialist-prompt-engineer",
      "specialist-quant-panel",
      "specialist-market-panel",
      "specialist-primary",
    ],
  },
  {
    id: "research",
    label: "Research Orchestration",
    description: "Multi-model pipeline: Analyst A/B sub-tasks and synthesis verdict",
    slots: ["research-analyst-a", "research-analyst-b", "research-synthesis"],
  },
  {
    id: "property-docs",
    label: "Property Documents",
    description:
      "Vision extraction, executive summaries, risk briefs, and ICP intelligence",
    slots: [
      "vision",
      "executive-summary-property",
      "executive-summary-portfolio",
      "risk-brief",
      "icp-intelligence",
    ],
  },
  {
    id: "data-extraction",
    label: "Data Extraction",
    description: "URL scraping and grounded web research",
    slots: ["url-extraction", "grounded-web-research"],
  },
  {
    id: "image-gen",
    label: "Image Generation",
    description: "AI image rendering via Replicate (primary and fallback)",
    slots: ["image-generation", "image-generation-fallback"],
  },
  {
    id: "system",
    label: "System Operations",
    description: "Analyst table refresh and constants regeneration",
    slots: ["analyst-table-refresh", "regen-constants"],
  },
];

export default function LlmWorkflowsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: registry } = useLlmRegistry();
  const refreshRegistry = useRefreshLlmRegistry();

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

  // slotId → { vendorFilter, modelSlug }
  const [selections, setSelections] = useState<
    Record<number, { vendorFilter: string; modelSlug: string | null }>
  >({});
  const [originalSlugs, setOriginalSlugs] = useState<
    Record<number, string | null>
  >({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && slotResources.length > 0 && modelResources.length > 0) {
      const initial: Record<
        number,
        { vendorFilter: string; modelSlug: string | null }
      > = {};
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
      setInitialized(true);
    }
  }, [initialized, slotResources, modelResources]);

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
      setInitialized(false);
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

  const handleSave = () => {
    const changes = Object.entries(selections)
      .filter(([id, sel]) => sel.modelSlug !== originalSlugs[Number(id)])
      .map(([id, sel]) => ({ id: Number(id), modelSlug: sel.modelSlug }));
    if (changes.length > 0) batchSave.mutate(changes);
  };

  if (slotsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-accent-pop" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="page-llm-workflows">
      {/* Page title + top-right action buttons */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <IconCpu
              className="w-4 h-4 text-muted-foreground shrink-0"
              aria-hidden="true"
            />
            <h2 className="text-base font-semibold">LLM Configuration</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Assign language models to each job and specialist workflow. Open a
            card to configure its slots. Changes are staged until you click
            Save.
          </p>
          {registry?.status === "ready" && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              {registry.models.length} models probed across{" "}
              {registry.vendorStatuses.filter((v) => v.available).length}{" "}
              vendors
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshRegistry.mutate()}
            disabled={refreshRegistry.isPending}
            className="gap-1.5"
            data-testid="button-analyst-llm-workflows"
            title="Probe vendor APIs for current model lists — does not save"
          >
            {refreshRegistry.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-pop" />
            ) : (
              <span className="text-[11px] font-semibold text-accent-pop">
                Analyst
              </span>
            )}
            {!refreshRegistry.isPending && (
              <span className="text-xs">Refresh models</span>
            )}
          </Button>
          <SaveButton
            size="sm"
            onClick={handleSave}
            hasChanges={isDirty}
            isPending={batchSave.isPending}
            data-testid="button-save-llm-workflows"
          >
            {`Save${dirtyCount > 0 ? ` (${dirtyCount})` : ""}`}
          </SaveButton>
        </div>
      </div>

      {isDirty && (
        <p className="text-xs text-amber-700 bg-amber-50/50 border border-amber-200 rounded-md px-3 py-2">
          You have {dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""}.
          Click <strong>Save</strong> above to persist your LLM assignments.
        </p>
      )}

      {/* Accordion — each item is a shadcn Card */}
      <Accordion
        type="multiple"
        defaultValue={["financial", "research"]}
        className="space-y-3"
      >
        {SLOT_GROUPS.map((group) => {
          const groupSlots = slotResources.filter((s) =>
            group.slots.includes(s.slug),
          );
          const dirtyInGroup = groupSlots.filter(
            (s) => selections[s.id]?.modelSlug !== originalSlugs[s.id],
          ).length;

          return (
            <AccordionItem
              key={group.id}
              value={group.id}
              className="border-0"
              data-testid={`accordion-group-${group.id}`}
            >
              <Card className="overflow-hidden">
                {/* Trigger lives inside the CardHeader so the whole header is clickable */}
                <CardHeader className="p-0">
                  <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-muted/40 transition-colors w-full text-left [&[data-state=open]]:bg-muted/30">
                    <div className="flex items-center gap-2.5 min-w-0 mr-3">
                      <CardTitle className="text-sm font-semibold shrink-0">
                        {group.label}
                      </CardTitle>
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
                      <CardDescription className="text-[11px] truncate hidden sm:block">
                        {group.description}
                      </CardDescription>
                    </div>
                  </AccordionTrigger>
                </CardHeader>

                <AccordionContent>
                  <CardContent className="px-5 pb-5 pt-0">
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
                </AccordionContent>
              </Card>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

interface VendorStatus {
  vendor: string;
  available: boolean;
  modelCount: number;
  avgLatencyMs: number | null;
  error?: string;
}

interface SlotCardProps {
  slot: ResourcePublicView;
  selection: { vendorFilter: string; modelSlug: string | null };
  originalSlug: string | null;
  modelsByVendor: Record<string, ResourcePublicView[]>;
  vendorStatuses: VendorStatus[];
  onVendorChange: (vendor: string) => void;
  onModelChange: (vendorFilter: string, modelSlug: string) => void;
}

function SlotCard({
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
      {/* Slot header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-snug">{slot.displayName}</p>
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

      {/* Vendor + Model selects */}
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
                  selection.vendorFilter
                    ? "Select model"
                    : "Select vendor first"
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
