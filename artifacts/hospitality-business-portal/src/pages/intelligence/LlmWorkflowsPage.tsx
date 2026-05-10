/**
 * LlmWorkflowsPage — the ONLY place in Intelligence to manage LLM configuration.
 *
 * Doctrine (binding):
 *   hplus-admin-nav-ia Rule 12 — LLM model names, endpoints, API key references,
 *     rate limits, and fallback chains are managed exclusively here.
 *   hplus-admin-nav-ia Rule 13 — Uses workflow cards (accordion), NOT a flat LLM registry.
 *
 * Page sections (top → bottom):
 *   1. Toolbar — Analyst probe + slot Save
 *   2. Vendor Health — live status per vendor after a probe
 *   3. Function-Area Defaults — seed vendor/model per functional area
 *   4. N+1 Orchestrator Defaults — global multi-model pipeline assignments
 *   5. Slot Accordion — per-slot overrides (staged, saved via toolbar)
 *   6. Specialists — per-specialist override status + Configure links
 */

import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
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
import { ToolbarRow } from "@/components/ui/toolbar-row";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Section } from "@/components/ui/field-section";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconCpu } from "@/components/icons";
import { apiRequest } from "@/lib/queryClient";
import {
  useLlmRegistry,
  useRefreshLlmRegistry,
  useResearchConfig,
  useSaveResearchConfig,
} from "@/lib/api/admin";
import {
  FALLBACK_MODELS,
  LLM_VENDORS,
} from "@/components/admin/research-center/research-shared";
import {
  setIntelligenceSection,
  setIntelligenceTabHint,
} from "@/lib/intelligence-nav";
import {
  SPECIALIST_SECTION_TO_ID,
  type SpecialistSection,
} from "@/components/admin/AdminSidebar";
import type {
  LlmVendor,
  AiModelEntry,
  ResearchConfig,
  PipelinePolicy,
  ResourcePublicView,
} from "@shared/schema";

// ── Module-level constants ───────────────────────────────────────────────────

interface SlotConfig {
  modelSlug?: string | null;
}

interface ModelConfig {
  vendor?: string;
  modelId?: string;
}

interface SpecialistOverrideListItem {
  id: string;
  displayName?: string | null;
  realName?: string | null;
  humanName?: string | null;
  hasLlmOverrides?: boolean;
}

// Reverse of SPECIALIST_SECTION_TO_ID (id → section)
const SPECIALIST_ID_TO_SECTION: Record<string, SpecialistSection> =
  Object.fromEntries(
    (
      Object.entries(SPECIALIST_SECTION_TO_ID) as [SpecialistSection, string][]
    ).map(([section, id]) => [id, section]),
  );

const SLOT_GROUPS: {
  id: string;
  label: string;
  description: string;
  slots: string[];
}[] = [
  {
    id: "financial",
    label: "Financial Analysis",
    description:
      "Pro forma generation, quant/market panels, and primary research synthesis",
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
    description:
      "Multi-model pipeline: Analyst A/B sub-tasks and synthesis verdict",
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

const LLM_TAB_ITEMS: {
  key: string;
  label: string;
  description: string;
  fn: string;
}[] = [
  {
    key: "research",
    label: "Research",
    description:
      "Default vendor and model for all research domains (Company, Property, Market).",
    fn: "research-deep",
  },
  {
    key: "operations",
    label: "Operations",
    description: "Default vendor and model for AI utility tasks.",
    fn: "operations",
  },
  {
    key: "assistants",
    label: "Assistants",
    description: "Default vendor and model for AI assistants (Rebecca).",
    fn: "chat",
  },
  {
    key: "exports",
    label: "Exports",
    description: "Default vendor and model for premium document exports.",
    fn: "exports",
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function LlmWorkflowsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Registry (vendor probe results + recommendations)
  const { data: registry } = useLlmRegistry();
  const refreshRegistry = useRefreshLlmRegistry();

  // ── Slot assignments ───────────────────────────────────────────────────────
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

  const [selections, setSelections] = useState<
    Record<number, { vendorFilter: string; modelSlug: string | null }>
  >({});
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

  // ── Function-Area Defaults ─────────────────────────────────────────────────
  const { data: savedConfig } = useResearchConfig();
  const saveMutation = useSaveResearchConfig();

  const [tabDefaults, setTabDefaults] = useState<
    Record<string, { llmVendor?: LlmVendor; primaryLlm?: string }>
  >({});
  const [tabsInitialized, setTabsInitialized] = useState(false);
  const [tabsDirty, setTabsDirty] = useState(false);

  useEffect(() => {
    if (savedConfig && !tabsInitialized) {
      setTabDefaults(savedConfig.tabDefaults || {});
      setTabsInitialized(true);
    }
  }, [savedConfig, tabsInitialized]);

  const models: AiModelEntry[] =
    savedConfig?.cachedModels && savedConfig.cachedModels.length > 0
      ? savedConfig.cachedModels
      : FALLBACK_MODELS;

  const getRecommendation = (fn: string) => {
    if (!registry?.recommendations) return null;
    return registry.recommendations.find((r) => r.function === fn) ?? null;
  };

  const handleTabsSave = () => {
    saveMutation.mutate(
      { ...savedConfig, tabDefaults } as ResearchConfig,
      {
        onSuccess: () => {
          setTabsDirty(false);
          toast({ title: "Function-area defaults saved" });
        },
        onError: () =>
          toast({
            title: "Failed to save function-area defaults",
            variant: "destructive",
          }),
      },
    );
  };

  // ── N+1 Orchestrator Defaults ──────────────────────────────────────────────
  const { data: pipelinePolicies } = useQuery<PipelinePolicy[]>({
    queryKey: ["/api/admin/pipeline-policies"],
  });
  const tier1Policy =
    pipelinePolicies?.find(
      (p) => p.policyKey === "tier1_property" || p.tier === 1,
    ) ?? null;

  const [n1ModelIds, setN1ModelIds] = useState<{
    analystAModelResourceId: number | null;
    analystBModelResourceId: number | null;
    synthesisModelResourceId: number | null;
    fallbackModelResourceId: number | null;
  }>({
    analystAModelResourceId: null,
    analystBModelResourceId: null,
    synthesisModelResourceId: null,
    fallbackModelResourceId: null,
  });
  const [n1Initialized, setN1Initialized] = useState(false);
  const [n1Dirty, setN1Dirty] = useState(false);

  useEffect(() => {
    if (tier1Policy && !n1Initialized) {
      setN1ModelIds({
        analystAModelResourceId: tier1Policy.analystAModelResourceId ?? null,
        analystBModelResourceId: tier1Policy.analystBModelResourceId ?? null,
        synthesisModelResourceId: tier1Policy.synthesisModelResourceId ?? null,
        fallbackModelResourceId: tier1Policy.fallbackModelResourceId ?? null,
      });
      setN1Initialized(true);
    }
  }, [tier1Policy, n1Initialized]);

  const n1SaveMutation = useMutation({
    mutationFn: (ids: typeof n1ModelIds) =>
      apiRequest("PATCH", "/api/admin/pipeline-policies/tier1_property", ids),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/pipeline-policies"],
      });
      toast({ title: "N+1 model defaults saved" });
      setN1Dirty(false);
    },
    onError: () =>
      toast({
        title: "Failed to save N+1 model defaults",
        variant: "destructive",
      }),
  });

  // ── Specialists drift ──────────────────────────────────────────────────────
  const { data: specialists } = useQuery<SpecialistOverrideListItem[]>({
    queryKey: ["/api/admin/specialists"],
  });

  const overridingSpecialists = useMemo(
    () => (specialists ?? []).filter((s) => s.hasLlmOverrides === true),
    [specialists],
  );

  const jumpToSpecialistLlmConfig = (id: string) => {
    const section = SPECIALIST_ID_TO_SECTION[id];
    if (!section) return;
    setIntelligenceTabHint(id, "llm-config");
    setIntelligenceSection(section);
    setLocation("/intelligence");
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (slotsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-accent-pop" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="page-llm-workflows">

      {/* 1 — Toolbar */}
      <ToolbarRow
        start={
          <>
            <div className="flex items-center gap-2">
              <IconCpu
                className="w-4 h-4 text-muted-foreground shrink-0"
                aria-hidden="true"
              />
              <h2 className="text-base font-semibold">LLM Configuration</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Set area defaults and per-slot overrides. Probe vendors with
              Analyst, then Save to persist slot assignments.
            </p>
            {registry?.status === "ready" && (
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                {registry.models.length} models probed across{" "}
                {registry.vendorStatuses.filter((v) => v.available).length}{" "}
                vendors
              </p>
            )}
          </>
        }
        end={
          <>
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
              onClick={handleSlotSave}
              hasChanges={isDirty}
              isPending={batchSave.isPending}
              data-testid="button-save-llm-workflows"
            >
              {`Save${dirtyCount > 0 ? ` (${dirtyCount})` : ""}`}
            </SaveButton>
          </>
        }
      />

      {/* 2 — Vendor Health */}
      {registry?.vendorStatuses && registry.vendorStatuses.length > 0 && (
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-2"
          data-testid="vendor-health-panel"
        >
          {LLM_VENDORS.map((v) => {
            const vs = registry.vendorStatuses.find((s) => s.vendor === v.value);
            const dotColor = vs?.available
              ? "bg-green-500"
              : vs
                ? "bg-red-500"
                : "bg-gray-400";
            return (
              <div
                key={v.value}
                className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5"
                data-testid={`vendor-health-${v.value}`}
              >
                <span
                  className={`mt-0.5 inline-block w-2 h-2 rounded-full shrink-0 ${dotColor}${refreshRegistry.isPending ? " animate-pulse" : ""}`}
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-tight">{v.label}</p>
                  {vs ? (
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {vs.available
                        ? `${vs.modelCount} model${vs.modelCount !== 1 ? "s" : ""}${vs.avgLatencyMs ? ` · ${vs.avgLatencyMs}ms` : ""}`
                        : (vs.error ?? "unavailable")}
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground/50 leading-tight mt-0.5">
                      not probed
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3 — Slot dirty warning */}
      {isDirty && (
        <p className="text-xs text-amber-700 bg-amber-50/50 border border-amber-200 rounded-md px-3 py-2">
          You have {dirtyCount} unsaved slot change{dirtyCount !== 1 ? "s" : ""}.
          Click <strong>Save</strong> above to persist.
        </p>
      )}

      {/* 4 — Function-Area Defaults */}
      <div
        className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4"
        data-testid="section-function-area-defaults"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Function-Area Defaults</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Seed vendor and model for each area. Workflow slots below
              override these. Resolution: slot-level → area default → system
              fallback.
            </p>
            {registry?.status === "ready" && (
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                {registry.models.length} models probed —{" "}
                recommendations shown below.
              </p>
            )}
          </div>
          <SaveButton
            size="sm"
            variant="outline"
            onClick={handleTabsSave}
            hasChanges={tabsDirty}
            isPending={saveMutation.isPending}
            data-testid="button-save-function-area-defaults"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
          {LLM_TAB_ITEMS.map((tab) => {
            const def = tabDefaults[tab.key] || {};
            const vendor = def.llmVendor;
            const vendorModels = vendor
              ? models.filter((m) => m.provider === vendor)
              : [];
            const model = def.primaryLlm || "";
            const rec = getRecommendation(tab.fn);
            const isAutoApplied = rec && !vendor && !model;

            return (
              <Section
                key={tab.key}
                title={tab.label}
                description={tab.description}
              >
                {rec && (
                  <div className="mb-3 flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4 bg-green-500/10 text-green-700 border-green-200"
                      data-testid={`badge-recommended-${tab.key}`}
                    >
                      recommended
                    </Badge>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {rec.label}
                    </span>
                    {isAutoApplied && (
                      <Badge
                        variant="outline"
                        className="text-[8px] px-1 py-0 h-3.5 bg-blue-500/10 text-blue-700 border-blue-200"
                      >
                        auto-selected
                      </Badge>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div
                    data-testid={`field-llm-default-vendor-${tab.key}`}
                  >
                    <Label className="flex items-center text-foreground label-text mb-1.5">
                      Default Vendor
                      <InfoTooltip
                        text={`Seed vendor for all ${tab.label} LLM cards.`}
                      />
                    </Label>
                    <Select
                      value={vendor || ""}
                      onValueChange={(v) => {
                        setTabDefaults((prev) => ({
                          ...prev,
                          [tab.key]: {
                            llmVendor: v as LlmVendor,
                            primaryLlm: "",
                          },
                        }));
                        setTabsDirty(true);
                      }}
                    >
                      <SelectTrigger
                        className="bg-card h-9"
                        data-testid={`select-llm-default-vendor-${tab.key}`}
                      >
                        <SelectValue
                          placeholder={
                            rec ? `${rec.vendor} (auto)` : "Select vendor"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {LLM_VENDORS.map((v) => {
                          const vendorStatus =
                            registry?.vendorStatuses?.find(
                              (vs) => vs.vendor === v.value,
                            );
                          const isAvailable = vendorStatus?.available;
                          return (
                            <SelectItem key={v.value} value={v.value}>
                              <span className="flex items-center gap-1.5">
                                <span
                                  className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                                    isAvailable === true
                                      ? "bg-green-500"
                                      : isAvailable === false
                                        ? "bg-red-500"
                                        : "bg-gray-400"
                                  }`}
                                />
                                {v.label}
                                {vendorStatus?.modelCount
                                  ? ` (${vendorStatus.modelCount})`
                                  : ""}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div
                    data-testid={`field-llm-default-model-${tab.key}`}
                  >
                    <Label className="flex items-center text-foreground label-text mb-1.5">
                      Default Model
                      <InfoTooltip
                        text={`Seed model for all ${tab.label} LLM cards when no slot-level model is set.`}
                      />
                    </Label>
                    {vendor ? (
                      <Select
                        value={model}
                        onValueChange={(v) => {
                          setTabDefaults((prev) => ({
                            ...prev,
                            [tab.key]: { ...prev[tab.key], primaryLlm: v },
                          }));
                          setTabsDirty(true);
                        }}
                      >
                        <SelectTrigger
                          className="bg-card h-9"
                          data-testid={`select-llm-default-model-${tab.key}`}
                        >
                          <SelectValue
                            placeholder={
                              rec && rec.vendor === vendor
                                ? `${rec.modelId} (auto)`
                                : "Select model"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {model &&
                            !vendorModels.some((m) => m.id === model) && (
                              <SelectItem value={model}>
                                {model} (current)
                              </SelectItem>
                            )}
                          {vendorModels.map((m) => {
                            const isRec =
                              rec &&
                              rec.vendor === vendor &&
                              rec.modelId === m.id;
                            return (
                              <SelectItem key={m.id} value={m.id}>
                                <span className="flex items-center gap-1.5">
                                  {m.label}
                                  {isRec && (
                                    <span className="text-[9px] text-green-700 font-medium">
                                      recommended
                                    </span>
                                  )}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select disabled>
                        <SelectTrigger className="bg-card h-9 opacity-50">
                          <SelectValue
                            placeholder={
                              rec
                                ? `${rec.modelId} (auto)`
                                : "Select vendor first"
                            }
                          />
                        </SelectTrigger>
                      </Select>
                    )}
                  </div>
                </div>
              </Section>
            );
          })}
        </div>
      </div>

      {/* 5 — N+1 Orchestrator Defaults */}
      <div
        className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4"
        data-testid="section-n1-defaults"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">N+1 Orchestrator Defaults</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Global model assignment for the multi-model research pipeline.
              Specialists can override these on their LLM Config tab.
            </p>
          </div>
          <SaveButton
            size="sm"
            variant="outline"
            onClick={() => n1SaveMutation.mutate(n1ModelIds)}
            hasChanges={n1Dirty}
            isPending={n1SaveMutation.isPending}
            data-testid="button-n1-save"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {(
            [
              {
                key: "analystAModelResourceId",
                label: "Quantitative Panel (Analyst A)",
                placeholder: "gemini-2.5-flash (hardcoded default)",
              },
              {
                key: "analystBModelResourceId",
                label: "Market Panel (Analyst B)",
                placeholder: "claude-sonnet-4-5 (hardcoded default)",
              },
              {
                key: "synthesisModelResourceId",
                label: "Synthesis (Verdict)",
                placeholder: "claude-opus-4-6 (hardcoded default)",
              },
              {
                key: "fallbackModelResourceId",
                label: "Fallback (N+2)",
                placeholder: "uses Specialist primary (hardcoded default)",
              },
            ] as const
          ).map(({ key, label, placeholder }) => {
            const currentId = n1ModelIds[key];
            return (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs font-medium">{label}</Label>
                <Select
                  value={currentId != null ? String(currentId) : "__unset__"}
                  onValueChange={(val) => {
                    setN1ModelIds((prev) => ({
                      ...prev,
                      [key]: val === "__unset__" ? null : Number(val),
                    }));
                    setN1Dirty(true);
                  }}
                >
                  <SelectTrigger
                    className="h-8 text-xs"
                    data-testid={`select-n1-${key}`}
                  >
                    <SelectValue placeholder={placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__">
                      <span className="text-muted-foreground">
                        {placeholder}
                      </span>
                    </SelectItem>
                    {modelResources.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6 — Slot Accordion */}
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

      {/* 7 — Specialists */}
      <div
        className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3"
        data-testid="section-specialists-llm"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Specialists</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Each Specialist can override the area defaults above. Click a
              Specialist to open their LLM Config tab.
            </p>
          </div>
          {overridingSpecialists.length > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-5 bg-amber-500/10 text-amber-700 border-amber-300 shrink-0"
              data-testid="specialists-custom-count"
            >
              {overridingSpecialists.length} custom
            </Badge>
          )}
        </div>

        {specialists && specialists.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {(specialists as SpecialistOverrideListItem[])
              .filter((s) => !!SPECIALIST_ID_TO_SECTION[s.id])
              .map((s) => {
                const label =
                  s.humanName || s.displayName || s.realName || s.id;
                const subLabel = s.humanName
                  ? s.displayName || s.realName
                  : null;
                const hasOverride = s.hasLlmOverrides === true;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => jumpToSpecialistLlmConfig(s.id)}
                    className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                    data-testid={`specialist-llm-row-${s.id}`}
                    title={`Open ${label} → LLM Config`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium leading-tight truncate">
                        {label}
                      </p>
                      {subLabel && (
                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
                          {subLabel}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1 py-0 h-3.5 shrink-0 ${
                        hasOverride
                          ? "bg-amber-500/10 text-amber-700 border-amber-300"
                          : "bg-muted/50 text-muted-foreground/70 border-border/50"
                      }`}
                    >
                      {hasOverride ? "custom" : "default"}
                    </Badge>
                  </button>
                );
              })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No specialists found.
          </p>
        )}
      </div>
    </div>
  );
}

// ── SlotCard sub-component ───────────────────────────────────────────────────

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
