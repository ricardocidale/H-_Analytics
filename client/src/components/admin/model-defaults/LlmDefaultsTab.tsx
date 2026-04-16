import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Loader2 } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconSave } from "@/components/icons";
import { useResearchConfig, useSaveResearchConfig, useLlmRegistry } from "@/lib/api/admin";
import { FALLBACK_MODELS, LLM_VENDORS } from "../research-center/research-shared";
import type { LlmVendor, AiModelEntry, ResearchConfig } from "@shared/schema";
import { Section, TabBanner } from "./FieldHelpers";

const LLM_TAB_ITEMS: { key: string; label: string; description: string; fn: string }[] = [
  { key: "research", label: "Research", description: "Default vendor and model for all research domains (Company, Property, Market).", fn: "research-deep" },
  { key: "operations", label: "Operations", description: "Default vendor and model for AI utility tasks.", fn: "operations" },
  { key: "assistants", label: "Assistants", description: "Default vendor and model for AI assistants (Rebecca).", fn: "chat" },
  { key: "exports", label: "Exports", description: "Default vendor and model for premium document exports.", fn: "exports" },
];

export function LlmDefaultsTab() {
  const { toast } = useToast();
  const { data: savedConfig, isLoading } = useResearchConfig();
  const saveMutation = useSaveResearchConfig();
  const { data: registry } = useLlmRegistry();

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
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <TabBanner>
        Default LLM vendor and model for each functional area. Individual cards on the LLMs page can override these. Resolution order: card-level explicit → tab default → system hardcoded default.
        {registry?.status === "ready" && (
          <span className="block mt-1 text-[11px] text-muted-foreground/70">
            The Analyst has probed {registry.models.length} models and tagged recommendations below.
          </span>
        )}
      </TabBanner>

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

      {isDirty && (
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="gap-2"
            data-testid="button-save-llm-defaults"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconSave className="w-4 h-4" />}
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}
