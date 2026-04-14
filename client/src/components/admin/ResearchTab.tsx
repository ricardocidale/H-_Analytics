import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/save-button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconBrain, IconLibrary, IconRefreshCw, IconResearch } from "@/components/icons";
import { useResearchConfig, useSaveResearchConfig, useRefreshAiModels } from "@/lib/api/admin";
import type { ResearchConfig, ResearchEventConfig } from "@shared/schema";
import { EventConfigSection } from "./research/EventConfigSection";
import { SourcesSection } from "./research/SourcesSection";
import { DETERMINISTIC_TOOLS, EVENT_META, FALLBACK_MODELS, type ResearchType } from "./research/constants";

const DEFAULT_EVENT_CONFIG: ResearchEventConfig = {
  enabled: true,
  focusAreas: [],
  regions: [],
  timeHorizon: "10-year",
  customInstructions: "",
  customQuestions: "",
  enabledTools: [],
};

function mergeConfig(saved: Partial<ResearchEventConfig> | undefined): ResearchEventConfig {
  return { ...DEFAULT_EVENT_CONFIG, ...saved };
}

export default function ResearchTab() {
  const { toast } = useToast();
  const { data: savedConfig, isLoading } = useResearchConfig();
  const saveMutation = useSaveResearchConfig();
  const refreshModels = useRefreshAiModels();

  const [draft, setDraft] = useState<ResearchConfig>({});
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (savedConfig) {
      setDraft(savedConfig);
      setIsDirty(false);
    }
  }, [savedConfig]);

  function updateEvent(type: ResearchType, updated: ResearchEventConfig) {
    setDraft((prev) => ({ ...prev, [type]: updated }));
    setIsDirty(true);
  }

  async function handleSave() {
    try {
      await saveMutation.mutateAsync(draft);
      setIsDirty(false);
      toast({ title: "Research configuration saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="status-loading">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const types: ResearchType[] = ["property", "company", "global"];

  return (
    <div className="space-y-5" data-testid="research-config-tab">
      <Card className="bg-white/80 backdrop-blur-xl border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <IconResearch className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-display" data-testid="text-research-title">Research Configuration</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Control AI research behavior per event type — tools, focus, context, and questions
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="bg-card border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <IconBrain className="w-5 h-5 text-primary" />
                AI Research Model
                <InfoTooltip text="Choose which AI model powers the market research feature. Use Update LLM List to pull the latest available models from OpenAI, Anthropic, Google, and xAI." />
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Select the AI model used for generating market research reports.
                {draft.cachedModelsAt && (
                  <span className="text-muted-foreground ml-1">
                    Models last refreshed {new Date(draft.cachedModelsAt).toLocaleDateString()}.
                  </span>
                )}
              </CardDescription>
            </div>
            <Button
              data-testid="button-refresh-models"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={refreshModels.isPending}
              onClick={async () => {
                try {
                  const result = await refreshModels.mutateAsync();
                  setDraft(prev => ({
                    ...prev,
                    cachedModels: result.models,
                    cachedModelsAt: result.fetchedAt,
                  }));
                  toast({ title: `Loaded ${result.models.length} models from providers` });
                } catch {
                  toast({ title: "Failed to refresh models", variant: "destructive" });
                }
              }}
            >
              {refreshModels.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <IconRefreshCw className="w-3.5 h-3.5" />}
              Update LLM List
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-md">
            <Label className="text-sm font-medium flex items-center gap-1">Preferred Model <InfoTooltip text="The AI model used for generating market research. Each model has different strengths for analysis." /></Label>
            {(() => {
              const models = (draft.cachedModels && draft.cachedModels.length > 0) ? draft.cachedModels : FALLBACK_MODELS;
              const grouped = {
                anthropic: models.filter(m => m.provider === "anthropic"),
                openai: models.filter(m => m.provider === "openai"),
                google: models.filter(m => m.provider === "google"),
              };
              const currentValue = draft.preferredLlm || "claude-sonnet-4-6";
              const hasCurrentInList = models.some(m => m.id === currentValue);
              return (
                <Select
                  value={currentValue}
                  onValueChange={(value) => {
                    setDraft(prev => ({ ...prev, preferredLlm: value }));
                    setIsDirty(true);
                  }}
                >
                  <SelectTrigger className="bg-card h-9" data-testid="select-preferred-llm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {!hasCurrentInList && (
                      <SelectItem value={currentValue}>{currentValue} (current)</SelectItem>
                    )}
                    {grouped.anthropic.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Anthropic</div>
                        {grouped.anthropic.map(m => (
                          <SelectItem key={m.id} value={m.id} data-testid={`option-model-${m.id}`}>{m.label}</SelectItem>
                        ))}
                      </>
                    )}
                    {grouped.openai.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">OpenAI</div>
                        {grouped.openai.map(m => (
                          <SelectItem key={m.id} value={m.id} data-testid={`option-model-${m.id}`}>{m.label}</SelectItem>
                        ))}
                      </>
                    )}
                    {grouped.google.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Google</div>
                        {grouped.google.map(m => (
                          <SelectItem key={m.id} value={m.id} data-testid={`option-model-${m.id}`}>{m.label}</SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/80 backdrop-blur-xl border-primary/20">
        <CardContent className="pt-5">
          <Accordion type="multiple" className="space-y-2">
            {types.map((type) => {
              const meta = EVENT_META[type];
              const Icon = meta.icon;
              const config = mergeConfig(draft[type]);

              return (
                <AccordionItem
                  key={type}
                  value={type}
                  className="border border-border/60 rounded-xl px-4 data-[state=open]:border-primary/30"
                  data-testid={`accordion-${type}`}
                >
                  <AccordionTrigger className="py-3 hover:no-underline" data-testid={`trigger-${type}`}>
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="text-left">
                        <span className="text-sm font-medium">{meta.label}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge
                            variant={config.enabled ? "default" : "secondary"}
                            className="text-[10px] h-4 px-1.5"
                            data-testid={`badge-status-${type}`}
                          >
                            {config.enabled ? "enabled" : "disabled"}
                          </Badge>
                          {(config.focusAreas ?? []).length > 0 && (
                            <span className="text-[10px] text-muted-foreground" data-testid={`text-focus-count-${type}`}>
                              {config.focusAreas!.length} focus area{config.focusAreas!.length > 1 ? "s" : ""}
                            </span>
                          )}
                          {(config.enabledTools ?? []).length > 0 && (
                            <span className="text-[10px] text-muted-foreground" data-testid={`text-tools-count-${type}`}>
                              {config.enabledTools!.length}/{DETERMINISTIC_TOOLS.length} tools
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 pt-1">
                    <EventConfigSection
                      type={type}
                      config={config}
                      onChange={(updated) => updateEvent(type, updated)}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      <Card className="bg-white/80 backdrop-blur-xl border-primary/20">
        <CardHeader>
          <CardTitle className="text-base font-display flex items-center gap-2">
            <IconLibrary className="w-5 h-5 text-primary" />
            Curated Source Registry
          </CardTitle>
          <CardDescription className="text-xs">
            Manage the list of trusted data sources used by the AI research engine.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SourcesSection
            customSources={draft.customSources ?? []}
            onChange={(v) => {
              setDraft(prev => ({ ...prev, customSources: v }));
              setIsDirty(true);
            }}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end pt-2">
        <SaveButton
          data-testid="button-save-research"
          onClick={handleSave}
          isPending={saveMutation.isPending}
          hasChanges={isDirty}
        />
      </div>
    </div>
  );
}
