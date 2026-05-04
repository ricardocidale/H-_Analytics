import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Loader2 } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/save-button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useResearchConfig, useSaveResearchConfig, useLlmRegistry, useRefreshLlmRegistry } from "@/lib/api/admin";
import { FALLBACK_MODELS, LLM_VENDORS } from "../research-center/research-shared";
import type {
  LlmVendor,
  AiModelEntry,
  ResearchConfig,
  PipelinePolicy,
  ResourcePublicView,
} from "@shared/schema";
import { Section, TabBanner } from "./FieldHelpers";
import {
  setAiIntelligenceSection,
  setAiIntelligenceTabHint,
} from "@/lib/ai-intelligence-nav";
import {
  SPECIALIST_SECTION_TO_ID,
  type SpecialistSection,
} from "@/components/admin/AdminSidebar";

// Task #502 — minimal projection of /api/admin/specialists used by the
// "Specialists currently override these" drift summary. We only read what
// the summary needs so the component stays independent of the larger
// sidebar SpecialistListItem definition.
interface SpecialistOverrideListItem {
  id: string;
  displayName?: string | null;
  realName?: string | null;
  humanName?: string | null;
  hasLlmOverrides?: boolean;
}

// Reverse of `SPECIALIST_SECTION_TO_ID` (id → section). Computed once at
// module load — the catalog ids are a closed set baked into the type.
const SPECIALIST_ID_TO_SECTION: Record<string, SpecialistSection> = Object.fromEntries(
  (Object.entries(SPECIALIST_SECTION_TO_ID) as [SpecialistSection, string][]).map(
    ([section, id]) => [id, section],
  ),
);

const LLM_TAB_ITEMS: { key: string; label: string; description: string; fn: string }[] = [
  { key: "research", label: "Research", description: "Default vendor and model for all research domains (Company, Property, Market).", fn: "research-deep" },
  { key: "operations", label: "Operations", description: "Default vendor and model for AI utility tasks.", fn: "operations" },
  { key: "assistants", label: "Assistants", description: "Default vendor and model for AI assistants (Rebecca).", fn: "chat" },
  { key: "exports", label: "Exports", description: "Default vendor and model for premium document exports.", fn: "exports" },
];

export function LlmDefaultsTab() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: savedConfig, isLoading } = useResearchConfig();
  const saveMutation = useSaveResearchConfig();
  const { data: registry } = useLlmRegistry();
  const refreshRegistry = useRefreshLlmRegistry();

  // Task #502 — drift summary. Pull the catalog list (already shaped by
  // GET /api/admin/specialists) and count rows whose specialist_configs
  // entry diverges from the global N+1 / pipeline-policy defaults. The
  // count + click-through nav give admins a single place to see how much
  // of the catalog is currently overriding what this tab dictates.
  const { data: specialists } = useQuery<SpecialistOverrideListItem[]>({
    queryKey: ["/api/admin/specialists"],
  });
  const overridingSpecialists = useMemo(
    () => (specialists ?? []).filter((s) => s.hasLlmOverrides === true),
    [specialists],
  );

  // P6e — N+1 Orchestrator Defaults section. Fetch the tier1_property
  // pipeline policy to read current N+1 model FK assignments and the
  // resource registry to populate the four model dropdowns. Both queries
  // share the same shape used elsewhere in the admin app, so the
  // /api/admin/resources?kind=model query key is identical to the one
  // LlmConfigTab.tsx already uses.
  const qc = useQueryClient();
  const { data: pipelinePolicies } = useQuery<PipelinePolicy[]>({
    queryKey: ["/api/admin/pipeline-policies"],
  });
  const tier1Policy = pipelinePolicies?.find(
    (p) => p.policyKey === "tier1_property" || p.tier === 1,
  ) ?? null;

  const { data: modelResources } = useQuery<ResourcePublicView[]>({
    queryKey: ["/api/admin/resources?kind=model"],
  });
  const modelOptions = modelResources ?? [];

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
      qc.invalidateQueries({ queryKey: ["/api/admin/pipeline-policies"] });
      toast({ title: "N+1 model defaults saved" });
      setN1Dirty(false);
    },
    onError: () =>
      toast({ title: "Failed to save N+1 model defaults", variant: "destructive" }),
  });

  const jumpToSpecialistLlmConfig = (id: string) => {
    const section = SPECIALIST_ID_TO_SECTION[id];
    if (!section) return; // gaspar / unknown id — no per-Specialist page
    setAiIntelligenceTabHint(id, "llm-config");
    setAiIntelligenceSection(section);
    setLocation("/ai-intelligence");
  };

  const [tabDefaults, setTabDefaults] = useState<Record<string, { llmVendor?: LlmVendor; primaryLlm?: string }>>({});
  const [initialized, setInitialized] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (savedConfig && !initialized) {
      setTabDefaults(savedConfig.tabDefaults || {});
      setInitialized(true);
    }
  }, [savedConfig, initialized]);

  const models: AiModelEntry[] = (savedConfig?.cachedModels && savedConfig.cachedModels.length > 0) ? savedConfig.cachedModels : FALLBACK_MODELS;

  const getRecommendation = (fn: string) => {
    if (!registry?.recommendations) return null;
    return registry.recommendations.find(r => r.function === fn) ?? null;
  };

  const handleSave = () => {
    saveMutation.mutate({ ...savedConfig, tabDefaults } as ResearchConfig, {
      onSuccess: () => {
        setIsDirty(false);
        toast({ title: "LLM defaults saved" });
      },
      onError: () => toast({ title: "Failed to save LLM defaults", variant: "destructive" }),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-accent-pop" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <TabBanner>
          Default LLM vendor and model for each functional area. Individual cards on the LLMs page can override these. Resolution order: card-level explicit → tab default → system hardcoded default.
          {registry?.status === "ready" && (
            <span className="block mt-1 text-[11px] text-muted-foreground/70">
              Gaspar has probed {registry.models.length} models and tagged recommendations below.
            </span>
          )}
        </TabBanner>
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshRegistry.mutate()}
            disabled={refreshRegistry.isPending}
            className="gap-1.5"
            data-testid="button-analyst-llm-registry"
            title="Probe vendor APIs for current model lists and update recommendations"
          >
            {refreshRegistry.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-pop" />
              : <span className="text-[11px] font-semibold text-accent-pop">Analyst</span>
            }
            {!refreshRegistry.isPending && <span className="text-xs">Refresh models</span>}
          </Button>
          <SaveButton
            size="sm"
            onClick={handleSave}
            hasChanges={isDirty}
            isPending={saveMutation.isPending}
            data-testid="button-save-llm-defaults"
          />
        </div>
      </div>

      {/*
        Task #502 — drift summary. Always render so admins see the
        baseline ("0 Specialists currently override these") when the
        catalog is in lock-step with the global defaults; that's a
        useful answer too. The chip list lets them jump straight into
        the offending Specialist's LLM Config tab via the one-shot tab
        hint set on click.
      */}
      <div
        className="rounded-md border border-border/60 bg-card/40 px-3 py-2.5 text-xs"
        data-testid="llm-defaults-overrides-summary"
      >
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              overridingSpecialists.length > 0
                ? "text-[10px] px-1.5 py-0 h-4 bg-amber-500/10 text-amber-700 border-amber-300"
                : "text-[10px] px-1.5 py-0 h-4 bg-muted/50 text-muted-foreground border-border"
            }
            data-testid="llm-defaults-overrides-count"
          >
            {overridingSpecialists.length}
          </Badge>
          <span className="text-foreground">
            {overridingSpecialists.length === 1 ? "Specialist currently overrides" : "Specialists currently override"}
            {" "}these defaults
          </span>
        </div>
        {overridingSpecialists.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {overridingSpecialists.map((s) => {
              // Persona-first label, matching the SpecialistPage header
              // ("Helena · Funding Analyst") — humanName comes first so the
              // chip reads consistently with the destination page rather
              // than the catalog displayName.
              const label = s.humanName || s.displayName || s.realName || s.id;
              const canJump = !!SPECIALIST_ID_TO_SECTION[s.id];
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => jumpToSpecialistLlmConfig(s.id)}
                  disabled={!canJump}
                  className="inline-flex items-center rounded-sm border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-400/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid={`llm-defaults-overrides-chip-${s.id}`}
                  title={canJump ? `Open ${label} → LLM Config` : `${label} (no per-Specialist page)`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* N+1 Orchestrator Defaults — P6e */}
      <div
        className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4"
        data-testid="section-n1-defaults"
      >
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold">N+1 Orchestrator Defaults</h4>
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
                      <span className="text-muted-foreground">{placeholder}</span>
                    </SelectItem>
                    {modelOptions.map((m) => (
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
        {LLM_TAB_ITEMS.map((tab) => {
          const def = tabDefaults[tab.key] || {};
          const vendor = def.llmVendor;
          const vendorModels = vendor ? models.filter((m) => m.provider === vendor) : [];
          const model = def.primaryLlm || "";
          const rec = getRecommendation(tab.fn);
          const isAutoApplied = rec && !vendor && !model;

          return (
            <Section key={tab.key} title={tab.label} description={tab.description}>
              {rec && (
                <div className="mb-3 flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-green-500/10 text-green-700 border-green-200" data-testid={`badge-recommended-${tab.key}`}>
                    recommended
                  </Badge>
                  <span className="text-[10px] text-muted-foreground truncate">
                    {rec.label}
                  </span>
                  {isAutoApplied && (
                    <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 bg-blue-500/10 text-blue-700 border-blue-200">
                      auto-selected
                    </Badge>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div data-testid={`field-llm-default-vendor-${tab.key}`}>
                  <Label className="flex items-center text-foreground label-text mb-1.5">
                    Default Vendor
                    <InfoTooltip text={`Seed vendor for all ${tab.label} LLM cards.`} />
                  </Label>
                  <Select
                    value={vendor || ""}
                    onValueChange={(v) => {
                      setTabDefaults((prev) => ({ ...prev, [tab.key]: { llmVendor: v as LlmVendor, primaryLlm: "" } }));
                      setIsDirty(true);
                    }}
                  >
                    <SelectTrigger className="bg-card h-9" data-testid={`select-llm-default-vendor-${tab.key}`}>
                      <SelectValue placeholder={rec ? `${rec.vendor} (auto)` : "Select vendor"} />
                    </SelectTrigger>
                    <SelectContent>
                      {LLM_VENDORS.map((v) => {
                        const vendorStatus = registry?.vendorStatuses?.find(vs => vs.vendor === v.value);
                        const isAvailable = vendorStatus?.available;
                        return (
                          <SelectItem key={v.value} value={v.value}>
                            <span className="flex items-center gap-1.5">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${isAvailable === true ? "bg-green-500" : isAvailable === false ? "bg-red-500" : "bg-gray-400"}`} />
                              {v.label}
                              {vendorStatus?.modelCount ? ` (${vendorStatus.modelCount})` : ""}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div data-testid={`field-llm-default-model-${tab.key}`}>
                  <Label className="flex items-center text-foreground label-text mb-1.5">
                    Default Model
                    <InfoTooltip text={`Seed model for all ${tab.label} LLM cards when no card-level model is set.`} />
                  </Label>
                  {vendor ? (
                    <Select
                      value={model}
                      onValueChange={(v) => {
                        setTabDefaults((prev) => ({ ...prev, [tab.key]: { ...prev[tab.key], primaryLlm: v } }));
                        setIsDirty(true);
                      }}
                    >
                      <SelectTrigger className="bg-card h-9" data-testid={`select-llm-default-model-${tab.key}`}>
                        <SelectValue placeholder={rec && rec.vendor === vendor ? `${rec.modelId} (auto)` : "Select model"} />
                      </SelectTrigger>
                      <SelectContent>
                        {model && !vendorModels.some((m) => m.id === model) && (
                          <SelectItem value={model}>{model} (current)</SelectItem>
                        )}
                        {vendorModels.map((m) => {
                          const isRec = rec && rec.vendor === vendor && rec.modelId === m.id;
                          return (
                            <SelectItem key={m.id} value={m.id}>
                              <span className="flex items-center gap-1.5">
                                {m.label}
                                {isRec && (
                                  <span className="text-[9px] text-green-700 font-medium">recommended</span>
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
                        <SelectValue placeholder={rec ? `${rec.modelId} (auto)` : "Select vendor first"} />
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
  );
}
