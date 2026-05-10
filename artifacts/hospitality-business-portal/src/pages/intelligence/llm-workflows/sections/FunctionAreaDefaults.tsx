/**
 * FunctionAreaDefaults — section 4 of the LlmWorkflows page.
 *
 * Seed vendor and model for each functional area (Research, Operations,
 * Assistants, Exports). Slot-level overrides (section 6) take precedence over
 * these defaults; these defaults take precedence over the hardcoded system
 * fallback.
 *
 * State (tabDefaults, dirty flag, init guard) lives entirely inside this
 * component — no parent reads it.
 *
 * Extracted from LlmWorkflowsPage.tsx during the task-1358 section split.
 */

import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SaveButton } from "@/components/ui/save-button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Section } from "@/components/ui/field-section";
import {
  useResearchConfig,
  useSaveResearchConfig,
  type LlmRegistryState,
} from "@/lib/api/admin";
import {
  FALLBACK_MODELS,
  LLM_VENDORS,
} from "@/components/admin/research-center/research-shared";
import type {
  AiModelEntry,
  LlmVendor,
  ResearchConfig,
} from "@shared/schema";
import { LLM_TAB_ITEMS } from "../constants";

export interface FunctionAreaDefaultsProps {
  registry: LlmRegistryState | undefined;
}

export function FunctionAreaDefaults({ registry }: FunctionAreaDefaultsProps) {
  const { toast } = useToast();
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

  return (
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
  );
}
