import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { IconResearch, IconMapPin } from "@/components/icons";
import { TagInput } from "./TagInput";
import { TIME_HORIZONS, DETERMINISTIC_TOOLS, EVENT_META, type ResearchType } from "./constants";
import type { ResearchEventConfig } from "@shared/schema";

export function EventConfigSection({
  type,
  config,
  onChange,
}: {
  type: ResearchType;
  config: ResearchEventConfig;
  onChange: (updated: ResearchEventConfig) => void;
}) {
  const meta = EVENT_META[type];

  function patch(partial: Partial<ResearchEventConfig>) {
    onChange({ ...config, ...partial });
  }

  function toggleTool(toolName: string, checked: boolean) {
    const current = config.enabledTools ?? [];
    patch({
      enabledTools: checked
        ? [...current, toolName]
        : current.filter((t) => t !== toolName),
    });
  }

  const allToolsEnabled = (config.enabledTools ?? []).length === 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Enable {meta.label}</Label>
          <p className="text-xs text-muted-foreground" data-testid={`text-description-${type}`}>{meta.description}</p>
        </div>
        <Switch
          data-testid={`switch-enable-${type}`}
          checked={config.enabled}
          onCheckedChange={(v) => patch({ enabled: v })}
        />
      </div>

      {config.enabled && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Investment Horizon</Label>
              <Select value={config.timeHorizon ?? "10-year"} onValueChange={(v) => patch({ timeHorizon: v })}>
                <SelectTrigger data-testid={`select-horizon-${type}`} className="w-full h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_HORIZONS.map((h) => (
                    <SelectItem key={h.value} value={h.value} data-testid={`option-horizon-${type}-${h.value}`}>{h.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                Refresh Interval (Days)
                <InfoTooltip text="How many days before research results are considered stale and eligible for automatic refresh." />
              </Label>
              <Input
                type="number"
                min={7}
                max={180}
                value={config.refreshIntervalDays ?? 30}
                onChange={(e) => patch({ refreshIntervalDays: parseInt(e.target.value) || 30 })}
                className="h-8 text-sm"
                data-testid={`input-refresh-interval-${type}`}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <IconResearch className="w-3.5 h-3.5 text-muted-foreground" />
              Focus Areas
            </Label>
            <p className="text-xs text-muted-foreground">
              Injected as bulleted guidance into the research prompt. Leave empty for defaults.
            </p>
            <TagInput
              tags={config.focusAreas ?? []}
              onChange={(v) => patch({ focusAreas: v })}
              placeholder="Add focus area (press Enter)"
              testIdPrefix={`${type}-focus`}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <IconMapPin className="w-3.5 h-3.5 text-muted-foreground" />
              Geographic Regions
            </Label>
            <p className="text-xs text-muted-foreground">
              Restricts market research to these regions. Leave empty for default scope.
            </p>
            <TagInput
              tags={config.regions ?? []}
              onChange={(v) => patch({ regions: v })}
              placeholder="Add region (press Enter)"
              testIdPrefix={`${type}-region`}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Custom Instructions</Label>
            <p className="text-xs text-muted-foreground">
              Appended to the system prompt as additional context.
            </p>
            <Textarea
              data-testid={`textarea-instructions-${type}`}
              value={config.customInstructions ?? ""}
              onChange={(e) => patch({ customInstructions: e.target.value })}
              placeholder="e.g. Prioritize markets with strong corporate retreat demand..."
              rows={3}
              className="text-sm resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Custom Questions</Label>
            <p className="text-xs text-muted-foreground">
              Specific questions the LLM must address in its research output.
            </p>
            <Textarea
              data-testid={`textarea-questions-${type}`}
              value={config.customQuestions ?? ""}
              onChange={(e) => patch({ customQuestions: e.target.value })}
              placeholder="e.g. What is the impact of remote work trends on corporate retreat demand?"
              rows={3}
              className="text-sm resize-none"
            />
          </div>

          {type === "property" && (
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Deterministic Tools</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select which calculation tools the LLM can call. Uncheck all = all tools enabled.
                </p>
              </div>
              <div className="space-y-2">
                {DETERMINISTIC_TOOLS.map((tool) => {
                  const isChecked = allToolsEnabled || (config.enabledTools ?? []).includes(tool.name);
                  return (
                    <div key={tool.name} className="flex items-start gap-2.5">
                      <Checkbox
                        id={`${type}-${tool.name}`}
                        data-testid={`checkbox-tool-${tool.name}`}
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
                      <label htmlFor={`${type}-${tool.name}`} className="text-sm cursor-pointer leading-tight">
                        <span className="font-mono text-xs text-muted-foreground">{tool.name}</span>
                        <span className="text-muted-foreground"> — </span>
                        {tool.description}
                      </label>
                    </div>
                  );
                })}
              </div>
              {!allToolsEnabled && (
                <Button
                  data-testid="button-reset-tools"
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => patch({ enabledTools: [] })}
                >
                  Reset to all tools enabled
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
