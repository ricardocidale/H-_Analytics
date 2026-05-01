import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  IconBrain, IconRefreshCw, IconResearch, IconMapPin,
} from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { useRefreshAiModels } from "@/lib/api/admin";
import type { ResearchConfig, ResearchEventConfig, ContextLlmConfig, LlmMode, LlmVendor } from "@shared/schema";
import {
  DETERMINISTIC_TOOLS, FALLBACK_MODELS, TIME_HORIZONS, MACRO_INDICATORS,
  PROPERTY_DEFAULT_SOURCES, MARKET_DEFAULT_SOURCES, LLM_VENDORS, RESEARCH_LLM_VENDORS,
  EnableToggle, DataInputsCard, TagInput, CheckboxGroup, SourceLibrary,
} from "./research-shared";

export function PropertyResearchSection({ config, onChange }: { config: ResearchEventConfig; onChange: (c: ResearchEventConfig) => void }) {
  function patch(p: Partial<ResearchEventConfig>) { onChange({ ...config, ...p }); }
  const allToolsEnabled = (config.enabledTools ?? []).length === 0;

  function toggleTool(toolName: string, checked: boolean) {
    const current = config.enabledTools ?? [];
    patch({ enabledTools: checked ? [...current, toolName] : current.filter((t) => t !== toolName) });
  }

  return (
    <div className="space-y-5">
      <EnableToggle
        label="Property Research"
        description="Per-property market analysis: RevPAR, ADR, occupancy, cap rates against market benchmarks"
        enabled={config.enabled}
        onChange={(v) => patch({ enabled: v })}
      />
      {config.enabled && (
        <>
          <DataInputsCard title="Data Inputs" items={["Location", "Room Count", "ADR", "Acquisition Price", "ICP Management Co Context"]} />

          <div className="space-y-3">
            <Label className="text-sm font-medium">Deterministic Tools</Label>
            <p className="text-xs text-muted-foreground">Select which calculation tools the LLM can call. Uncheck all = all tools enabled.</p>
            <div className="space-y-2">
              {DETERMINISTIC_TOOLS.map((tool) => {
                const isChecked = allToolsEnabled || (config.enabledTools ?? []).includes(tool.name);
                return (
                  <div key={tool.name} className="flex items-start gap-2.5">
                    <Checkbox
                      id={`prop-${tool.name}`}
                      checked={isChecked}
                      onCheckedChange={(v) => {
                        if (allToolsEnabled) {
                          const allNames = DETERMINISTIC_TOOLS.map((t) => t.name);
                          patch({ enabledTools: v ? allNames : allNames.filter((n) => n !== tool.name) });
                        } else {
                          toggleTool(tool.name, !!v);
                        }
                      }}
                      className="mt-0.5"
                    />
                    <label htmlFor={`prop-${tool.name}`} className="text-sm cursor-pointer leading-tight">
                      <span className="font-mono text-xs text-muted-foreground">{tool.name}</span>
                      <span className="text-muted-foreground"> — </span>{tool.description}
                    </label>
                  </div>
                );
              })}
            </div>
            {!allToolsEnabled && (
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => patch({ enabledTools: [] })}>
                Reset to all tools enabled
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <IconResearch className="w-3.5 h-3.5 text-muted-foreground" />
              Focus Areas
            </Label>
            <TagInput tags={config.focusAreas ?? []} onChange={(v) => patch({ focusAreas: v })} placeholder="Add focus area (press Enter)" testIdPrefix="prop-focus" />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <IconMapPin className="w-3.5 h-3.5 text-muted-foreground" />
              Geographic Regions
            </Label>
            <TagInput tags={config.regions ?? []} onChange={(v) => patch({ regions: v })} placeholder="Add region (press Enter)" testIdPrefix="prop-region" />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              Refresh Interval
              <InfoTooltip text="Days before research results are considered stale." />
            </Label>
            <Input
              type="number" min={3} max={14}
              value={config.refreshIntervalDays ?? 7}
              onChange={(e) => patch({ refreshIntervalDays: parseInt(e.target.value) || 7 })}
              className="h-8 text-sm max-w-[200px]"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Custom Instructions</Label>
            <Textarea
              value={config.customInstructions ?? ""}
              onChange={(e) => patch({ customInstructions: e.target.value })}
              placeholder="e.g. Prioritize markets with strong corporate retreat demand..."
              rows={3} className="text-sm resize-none"
            />
          </div>

          <SourceLibrary
            sources={config.sources ?? []}
            onChange={(s) => patch({ sources: s })}
            testIdPrefix="prop-src"
            defaultSources={PROPERTY_DEFAULT_SOURCES}
          />
        </>
      )}
    </div>
  );
}

export function MarketResearchSection({ config, onChange }: { config: ResearchEventConfig; onChange: (c: ResearchEventConfig) => void }) {
  function patch(p: Partial<ResearchEventConfig>) { onChange({ ...config, ...p }); }

  return (
    <div className="space-y-5">
      <EnableToggle
        label="Market Research"
        description="Macro real estate and hospitality market analysis: trends, economic indicators, supply/demand dynamics"
        enabled={config.enabled}
        onChange={(v) => patch({ enabled: v })}
      />
      {config.enabled && (
        <>
          <DataInputsCard title="Data Inputs" items={["Macro Indicators", "Industry Benchmarks", "Regulatory Environment"]} />

          <div className="space-y-2">
            <Label className="text-sm font-medium">Time Horizon</Label>
            <div className="flex gap-3">
              {TIME_HORIZONS.map((h) => (
                <label key={h.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="time-horizon"
                    value={h.value}
                    checked={(config.timeHorizon ?? "10-year") === h.value}
                    onChange={() => patch({ timeHorizon: h.value })}
                    className="accent-primary"
                  />
                  <span className="text-sm">{h.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Macro Indicators</Label>
            <p className="text-xs text-muted-foreground">Toggle which macro dimensions to track.</p>
            <CheckboxGroup
              items={MACRO_INDICATORS}
              selected={config.focusAreas ?? []}
              onChange={(v) => patch({ focusAreas: v })}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Custom Instructions</Label>
            <Textarea
              value={config.customInstructions ?? ""}
              onChange={(e) => patch({ customInstructions: e.target.value })}
              placeholder="e.g. Focus on interest rate impact on hotel cap rates, analyze supply pipeline risk..."
              rows={3} className="text-sm resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Custom Questions</Label>
            <Textarea
              value={config.customQuestions ?? ""}
              onChange={(e) => patch({ customQuestions: e.target.value })}
              placeholder="e.g. What is the impact of rising interest rates on hotel cap rates?"
              rows={3} className="text-sm resize-none"
            />
          </div>

          <SourceLibrary
            sources={config.sources ?? []}
            onChange={(s) => patch({ sources: s })}
            testIdPrefix="mkt-src"
            defaultSources={MARKET_DEFAULT_SOURCES}
          />
        </>
      )}
    </div>
  );
}

export function DomainLlmCard({ domain, domainLabel, config, onChange, draft, setDraft, setIsDirty }: {
  domain: "company" | "property" | "market";
  domainLabel: string;
  config: ContextLlmConfig;
  onChange: (c: ContextLlmConfig) => void;
  draft: ResearchConfig;
  setDraft: React.Dispatch<React.SetStateAction<ResearchConfig>>;
  setIsDirty: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const refreshModels = useRefreshAiModels();

  const models = (draft.cachedModels && draft.cachedModels.length > 0) ? draft.cachedModels : FALLBACK_MODELS;
  const mode: LlmMode | undefined = config.llmMode;
  const vendor: LlmVendor | undefined = config.llmVendor;
  const isDual = mode === "dual";

  const vendorModels = vendor ? models.filter((m) => m.provider === vendor) : [];
  const primaryModel = config.primaryLlm || "";
  const secondaryModel = config.secondaryLlm || "";

  const update = (patch: Partial<ContextLlmConfig>) => {
    onChange({ ...config, ...patch });
    setIsDirty(true);
  };

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-display" data-testid={`text-llm-title-${domain}`}>
              <IconBrain className="w-4 h-4 text-primary" />
              {domainLabel} LLM
              <InfoTooltip text={`Configure the AI model for ${domainLabel.toLowerCase()} research. Choose between dual-model (reasoning + workhorse) or single primary model.`} />
            </CardTitle>
            {draft.cachedModelsAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Models last refreshed {new Date(draft.cachedModelsAt).toLocaleDateString()}.
              </p>
            )}
          </div>
          <Button
            variant="outline" size="sm" className="gap-1.5"
            disabled={refreshModels.isPending}
            data-testid={`button-refresh-models-${domain}`}
            onClick={async () => {
              try {
                const result = await refreshModels.mutateAsync();
                setDraft((prev) => ({ ...prev, cachedModels: result.models, cachedModelsAt: result.fetchedAt }));
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
      <CardContent className="space-y-5">
        <div>
          <Label className="text-xs font-medium mb-2 block">Model Architecture</Label>
          <RadioGroup
            value={mode || ""}
            onValueChange={(value) => update({ llmMode: value as LlmMode })}
            className="flex flex-col gap-2"
            data-testid={`radio-llm-mode-${domain}`}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="dual" id={`llm-mode-dual-${domain}`} data-testid={`radio-llm-mode-dual-${domain}`} />
              <Label htmlFor={`llm-mode-dual-${domain}`} className="text-sm font-normal cursor-pointer">
                Primary reasoning + Secondary workhorse
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="primary-only" id={`llm-mode-primary-${domain}`} data-testid={`radio-llm-mode-primary-${domain}`} />
              <Label htmlFor={`llm-mode-primary-${domain}`} className="text-sm font-normal cursor-pointer">
                Primary reasoning only
              </Label>
            </div>
          </RadioGroup>
        </div>

        {mode && (
          <>
            <div className="max-w-md">
              <Label className="text-xs font-medium mb-1.5 block">Vendor</Label>
              <Select
                value={vendor || ""}
                onValueChange={(value) => {
                  update({ llmVendor: value as LlmVendor, primaryLlm: "", secondaryLlm: "" });
                }}
              >
                <SelectTrigger className="bg-card h-9" data-testid={`select-llm-vendor-${domain}`}>
                  <SelectValue placeholder="Select a vendor" />
                </SelectTrigger>
                <SelectContent>
                  {RESEARCH_LLM_VENDORS.map((v) => (
                    <SelectItem key={v.value} value={v.value} data-testid={`select-vendor-${domain}-${v.value}`}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Research supports Anthropic, OpenAI, and Gemini models.</p>
            </div>

            {vendor && (
              <>
                <div className="max-w-md">
                  <Label className="text-xs font-medium mb-1.5 block">Primary Reasoning LLM</Label>
                  <Select
                    value={primaryModel}
                    onValueChange={(value) => update({ primaryLlm: value })}
                  >
                    <SelectTrigger className="bg-card h-9" data-testid={`select-primary-llm-${domain}`}>
                      <SelectValue placeholder={vendorModels.length === 0 ? "No models available for this vendor" : "Select primary model"} />
                    </SelectTrigger>
                    <SelectContent>
                      {primaryModel && !vendorModels.some((m) => m.id === primaryModel) && (
                        <SelectItem value={primaryModel}>{primaryModel} (current)</SelectItem>
                      )}
                      {vendorModels.map((m) => (
                        <SelectItem key={m.id} value={m.id} data-testid={`select-primary-model-${domain}-${m.id}`}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isDual && (
                  <div className="max-w-md">
                    <Label className="text-xs font-medium mb-1.5 block">Secondary Workhorse LLM</Label>
                    <Select
                      value={secondaryModel}
                      onValueChange={(value) => update({ secondaryLlm: value })}
                    >
                      <SelectTrigger className="bg-card h-9" data-testid={`select-secondary-llm-${domain}`}>
                        <SelectValue placeholder={vendorModels.length === 0 ? "No models available for this vendor" : "Select secondary model"} />
                      </SelectTrigger>
                      <SelectContent>
                        {secondaryModel && !vendorModels.some((m) => m.id === secondaryModel) && (
                          <SelectItem value={secondaryModel}>{secondaryModel} (current)</SelectItem>
                        )}
                        {vendorModels.map((m) => (
                          <SelectItem key={m.id} value={m.id} data-testid={`select-secondary-model-${domain}-${m.id}`}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function LlmSelectionCard({ draft, setDraft, setIsDirty }: {
  draft: ResearchConfig;
  setDraft: React.Dispatch<React.SetStateAction<ResearchConfig>>;
  setIsDirty: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const refreshModels = useRefreshAiModels();

  const models = (draft.cachedModels && draft.cachedModels.length > 0) ? draft.cachedModels : FALLBACK_MODELS;
  const mode: LlmMode | undefined = draft.llmMode;
  const vendor: LlmVendor | undefined = draft.llmVendor;
  const isDual = mode === "dual";

  const vendorModels = vendor ? models.filter((m) => m.provider === vendor) : [];

  const primaryModel = draft.primaryLlm || draft.preferredLlm || "";
  const secondaryModel = draft.secondaryLlm || "";

  const updateField = (patch: Partial<ResearchConfig>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setIsDirty(true);
  };

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-display">
              <IconBrain className="w-4 h-4 text-primary" />
              LLM Selection
              <InfoTooltip text="Configure the AI model architecture for research. Choose between a dual-model setup (reasoning + workhorse) or a single primary model." />
            </CardTitle>
            {draft.cachedModelsAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Models last refreshed {new Date(draft.cachedModelsAt).toLocaleDateString()}.
              </p>
            )}
          </div>
          <Button
            variant="outline" size="sm" className="gap-1.5"
            disabled={refreshModels.isPending}
            data-testid="button-refresh-models"
            onClick={async () => {
              try {
                const result = await refreshModels.mutateAsync();
                setDraft((prev) => ({ ...prev, cachedModels: result.models, cachedModelsAt: result.fetchedAt }));
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
      <CardContent className="space-y-5">
        <div>
          <Label className="text-xs font-medium mb-2 block">Model Architecture</Label>
          <RadioGroup
            value={mode || ""}
            onValueChange={(value) => updateField({ llmMode: value as LlmMode })}
            className="flex flex-col gap-2"
            data-testid="radio-llm-mode"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="dual" id="llm-mode-dual" data-testid="radio-llm-mode-dual" />
              <Label htmlFor="llm-mode-dual" className="text-sm font-normal cursor-pointer">
                Primary reasoning + Secondary workhorse
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="primary-only" id="llm-mode-primary" data-testid="radio-llm-mode-primary" />
              <Label htmlFor="llm-mode-primary" className="text-sm font-normal cursor-pointer">
                Primary reasoning only
              </Label>
            </div>
          </RadioGroup>
        </div>

        {mode && (
          <>
            <div className="max-w-md">
              <Label className="text-xs font-medium mb-1.5 block">Vendor</Label>
              <Select
                value={vendor || ""}
                onValueChange={(value) => {
                  updateField({ llmVendor: value as LlmVendor, primaryLlm: "", secondaryLlm: "", preferredLlm: "" });
                }}
              >
                <SelectTrigger className="bg-card h-9" data-testid="select-llm-vendor">
                  <SelectValue placeholder="Select a vendor" />
                </SelectTrigger>
                <SelectContent>
                  {LLM_VENDORS.map((v) => (
                    <SelectItem key={v.value} value={v.value} data-testid={`select-vendor-${v.value}`}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {vendor && (
              <>
                <div className="max-w-md">
                  <Label className="text-xs font-medium mb-1.5 block">Primary Reasoning LLM</Label>
                  <Select
                    value={primaryModel}
                    onValueChange={(value) => updateField({ primaryLlm: value, preferredLlm: value })}
                  >
                    <SelectTrigger className="bg-card h-9" data-testid="select-primary-llm">
                      <SelectValue placeholder={vendorModels.length === 0 ? "No models available for this vendor" : "Select primary model"} />
                    </SelectTrigger>
                    <SelectContent>
                      {primaryModel && !vendorModels.some((m) => m.id === primaryModel) && (
                        <SelectItem value={primaryModel}>{primaryModel} (current)</SelectItem>
                      )}
                      {vendorModels.map((m) => (
                        <SelectItem key={m.id} value={m.id} data-testid={`select-primary-model-${m.id}`}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isDual && (
                  <div className="max-w-md">
                    <Label className="text-xs font-medium mb-1.5 block">Secondary Workhorse LLM</Label>
                    <Select
                      value={secondaryModel}
                      onValueChange={(value) => updateField({ secondaryLlm: value })}
                    >
                      <SelectTrigger className="bg-card h-9" data-testid="select-secondary-llm">
                        <SelectValue placeholder={vendorModels.length === 0 ? "No models available for this vendor" : "Select secondary model"} />
                      </SelectTrigger>
                      <SelectContent>
                        {secondaryModel && !vendorModels.some((m) => m.id === secondaryModel) && (
                          <SelectItem value={secondaryModel}>{secondaryModel} (current)</SelectItem>
                        )}
                        {vendorModels.map((m) => (
                          <SelectItem key={m.id} value={m.id} data-testid={`select-secondary-model-${m.id}`}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
