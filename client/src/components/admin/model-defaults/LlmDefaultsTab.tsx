import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Loader2 } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { IconSave } from "@/components/icons";
import { useResearchConfig, useSaveResearchConfig } from "@/lib/api/admin";
import { FALLBACK_MODELS, LLM_VENDORS } from "../research-center/research-shared";
import type { LlmVendor, AiModelEntry, ResearchConfig } from "@shared/schema";
import { Section, TabBanner } from "./FieldHelpers";

const LLM_TAB_ITEMS: { key: string; label: string; description: string }[] = [
  { key: "research", label: "Research", description: "Default vendor and model for all research domains (Company, Property, Market)." },
  { key: "operations", label: "Operations", description: "Default vendor and model for AI utility tasks." },
  { key: "assistants", label: "Assistants", description: "Default vendor and model for AI assistants (Rebecca)." },
  { key: "exports", label: "Exports", description: "Default vendor and model for premium document exports." },
];

export function LlmDefaultsTab() {
  const { toast } = useToast();
  const { data: savedConfig, isLoading } = useResearchConfig();
  const saveMutation = useSaveResearchConfig();

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
      </TabBanner>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
        {LLM_TAB_ITEMS.map((tab) => {
          const def = tabDefaults[tab.key] || {};
          const vendor = def.llmVendor;
          const vendorModels = vendor ? models.filter((m) => m.provider === vendor) : [];
          const model = def.primaryLlm || "";

          return (
            <Section key={tab.key} title={tab.label} description={tab.description}>
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
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {LLM_VENDORS.map((v) => (
                        <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                      ))}
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
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        {model && !vendorModels.some((m) => m.id === model) && (
                          <SelectItem value={model}>{model} (current)</SelectItem>
                        )}
                        {vendorModels.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select disabled>
                      <SelectTrigger className="bg-card h-9 opacity-50">
                        <SelectValue placeholder="Select vendor first" />
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
