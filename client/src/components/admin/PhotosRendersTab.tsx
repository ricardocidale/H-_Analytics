import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/icons/themed-icons";
import type { RenderSetting } from "@shared/schema";

interface CostEntry {
  timestamp: string;
  service: string;
  model: string;
  operation: string;
  estimatedCostUsd: number;
  durationMs?: number;
  userId?: number;
  route: string;
}

async function fetchRenderSettings(): Promise<RenderSetting[]> {
  const res = await fetch("/api/admin/render-settings");
  if (!res.ok) throw new Error("Failed to fetch render settings");
  return res.json();
}

async function updateSetting(styleKey: string, data: Partial<RenderSetting>): Promise<RenderSetting> {
  const res = await fetch(`/api/admin/render-settings/${styleKey}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update setting");
  return res.json();
}

async function fetchUsage(): Promise<CostEntry[]> {
  const res = await fetch("/api/admin/render-usage");
  if (!res.ok) throw new Error("Failed to fetch usage");
  return res.json();
}

async function seedSettings(): Promise<RenderSetting[]> {
  const res = await fetch("/api/admin/render-settings/seed", { method: "POST" });
  if (!res.ok) throw new Error("Failed to seed settings");
  return res.json();
}

function StyleConfigCard({ setting, onUpdate }: { setting: RenderSetting; onUpdate: (styleKey: string, data: Partial<RenderSetting>) => void }) {
  const [editing, setEditing] = useState(false);
  const [model, setModel] = useState(setting.model);
  const [promptPrefix, setPromptPrefix] = useState(setting.promptPrefix);
  const [promptSuffix, setPromptSuffix] = useState(setting.promptSuffix);
  const [params, setParams] = useState(JSON.stringify(setting.params, null, 2));

  const handleSave = () => {
    let parsedParams: Record<string, unknown> = setting.params;
    try {
      parsedParams = JSON.parse(params);
    } catch {
      // keep original
    }
    onUpdate(setting.styleKey, {
      model,
      promptPrefix,
      promptSuffix,
      params: parsedParams,
    });
    setEditing(false);
  };

  return (
    <Card data-testid={`card-style-${setting.styleKey}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{setting.label}</CardTitle>
            <Badge variant={setting.isEnabled ? "default" : "secondary"} className="text-[10px]">
              {setting.isEnabled ? "Enabled" : "Disabled"}
            </Badge>
            {setting.isImg2Img && <Badge variant="outline" className="text-[10px]">Img2Img</Badge>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(!editing)}
            data-testid={`button-edit-${setting.styleKey}`}
          >
            {editing ? "Cancel" : "Edit"}
          </Button>
        </div>
        <CardDescription className="text-xs font-mono">{setting.model}</CardDescription>
      </CardHeader>
      {editing && (
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Model</Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="text-sm font-mono"
              data-testid={`input-model-${setting.styleKey}`}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Prompt Prefix</Label>
            <Textarea
              value={promptPrefix}
              onChange={(e) => setPromptPrefix(e.target.value)}
              rows={2}
              className="text-sm resize-none"
              data-testid={`input-prefix-${setting.styleKey}`}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Prompt Suffix</Label>
            <Textarea
              value={promptSuffix}
              onChange={(e) => setPromptSuffix(e.target.value)}
              rows={2}
              className="text-sm resize-none"
              data-testid={`input-suffix-${setting.styleKey}`}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Parameters (JSON)</Label>
            <Textarea
              value={params}
              onChange={(e) => setParams(e.target.value)}
              rows={4}
              className="text-sm font-mono resize-none"
              data-testid={`input-params-${setting.styleKey}`}
            />
          </div>
          <div className="p-2 rounded bg-muted/50 text-xs text-muted-foreground">
            <span className="font-medium">Preview:</span>{" "}
            {[promptPrefix, "<user prompt>", promptSuffix].filter(Boolean).join(", ")}
          </div>
          <Button onClick={handleSave} size="sm" data-testid={`button-save-${setting.styleKey}`}>
            Save
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

export default function PhotosRendersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ["admin-render-settings"],
    queryFn: fetchRenderSettings,
  });

  const { data: usage = [], isLoading: usageLoading } = useQuery({
    queryKey: ["admin-render-usage"],
    queryFn: fetchUsage,
  });

  const updateMutation = useMutation({
    mutationFn: ({ styleKey, data }: { styleKey: string; data: Partial<RenderSetting> }) =>
      updateSetting(styleKey, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-render-settings"] });
      toast({ title: "Setting updated" });
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  const seedMutation = useMutation({
    mutationFn: seedSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-render-settings"] });
      toast({ title: "Settings seeded from defaults" });
    },
  });

  const handleUpdate = (styleKey: string, data: Partial<RenderSetting>) => {
    updateMutation.mutate({ styleKey, data });
  };

  const handleToggleStyle = (styleKey: string, enabled: boolean) => {
    updateMutation.mutate({ styleKey, data: { isEnabled: enabled } });
  };

  const handleToggleAutoEnhance = (styleKey: string, enabled: boolean) => {
    updateMutation.mutate({ styleKey, data: { autoEnhanceEnabled: enabled } });
  };

  const handleRateLimitChange = (_styleKey: string, value: number) => {
    settings.forEach((s) => {
      updateMutation.mutate({ styleKey: s.styleKey, data: { rateLimitPerMinute: value } });
    });
  };

  const firstSetting = settings[0];
  const globalAutoEnhance = firstSetting?.autoEnhanceEnabled ?? true;
  const globalRateLimit = firstSetting?.rateLimitPerMinute ?? 5;
  const globalDefaultQuality = firstSetting?.defaultQuality ?? 95;
  const globalDefaultSize = firstSetting?.defaultImageSize ?? "1024x1024";

  const totalCost = usage.reduce((sum, e) => sum + (e.estimatedCostUsd || 0), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div data-testid="admin-photos-renders">
      <Tabs defaultValue="models">
        <TabsList className="mb-4">
          <TabsTrigger value="models" data-testid="tab-models">Model & Provider</TabsTrigger>
          <TabsTrigger value="prompts" data-testid="tab-prompts">Prompt Templates</TabsTrigger>
          <TabsTrigger value="styles" data-testid="tab-styles">Style Toggles</TabsTrigger>
          <TabsTrigger value="enhance" data-testid="tab-enhance">Auto-Enhance</TabsTrigger>
          <TabsTrigger value="limits" data-testid="tab-limits">Rate Limits</TabsTrigger>
          <TabsTrigger value="usage" data-testid="tab-usage">Usage & Costs</TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="space-y-4">
          {settings.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground mb-3">No render settings configured yet.</p>
                <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} data-testid="button-seed-settings">
                  {seedMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Seed from Defaults
                </Button>
              </CardContent>
            </Card>
          ) : (
            settings.map((s) => (
              <StyleConfigCard key={s.id} setting={s} onUpdate={handleUpdate} />
            ))
          )}
        </TabsContent>

        <TabsContent value="prompts" className="space-y-4">
          {settings.map((s) => (
            <Card key={s.id} data-testid={`card-prompt-${s.styleKey}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{s.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Prefix</Label>
                  <p className="text-sm bg-muted/50 rounded p-2">{s.promptPrefix || <span className="italic text-muted-foreground">None</span>}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Suffix</Label>
                  <p className="text-sm bg-muted/50 rounded p-2">{s.promptSuffix || <span className="italic text-muted-foreground">None</span>}</p>
                </div>
                <div className="p-2 rounded border text-xs">
                  <span className="font-medium">Final prompt:</span>{" "}
                  <span className="text-muted-foreground">
                    {[s.promptPrefix, "<your description>", s.promptSuffix].filter(Boolean).join(", ")}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="styles" className="space-y-3">
          {settings.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`toggle-style-${s.styleKey}`}>
              <div>
                <p className="text-sm font-medium">{s.label}</p>
                <p className="text-xs text-muted-foreground font-mono">{s.model.split(":")[0]}</p>
              </div>
              <Switch
                checked={s.isEnabled}
                onCheckedChange={(checked) => handleToggleStyle(s.styleKey, checked)}
                data-testid={`switch-enable-${s.styleKey}`}
              />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="enhance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Auto-Enhance Settings</CardTitle>
              <CardDescription>
                When enabled, newly uploaded photos are automatically enhanced using the upscaler.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Auto-enhance on upload</Label>
                <Switch
                  checked={globalAutoEnhance}
                  onCheckedChange={(checked) => {
                    settings.forEach((s) => handleToggleAutoEnhance(s.styleKey, checked));
                  }}
                  data-testid="switch-auto-enhance"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Default Quality (1-100)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={globalDefaultQuality}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (val >= 1 && val <= 100 && firstSetting) {
                      updateMutation.mutate({ styleKey: firstSetting.styleKey, data: { defaultQuality: val } });
                    }
                  }}
                  className="w-24"
                  data-testid="input-default-quality"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Default Image Size</Label>
                <Input
                  value={globalDefaultSize}
                  onChange={(e) => {
                    if (firstSetting) {
                      updateMutation.mutate({ styleKey: firstSetting.styleKey, data: { defaultImageSize: e.target.value } });
                    }
                  }}
                  className="w-40"
                  data-testid="input-default-size"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="limits" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rate Limits & Defaults</CardTitle>
              <CardDescription>
                Configure per-user rate limits for image generation and default sizes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Generations per minute (per user)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={globalRateLimit}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (val >= 1 && firstSetting) {
                      handleRateLimitChange(firstSetting.styleKey, val);
                    }
                  }}
                  className="w-24"
                  data-testid="input-rate-limit"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Usage & Cost Monitor</CardTitle>
              <CardDescription>
                Recent image generation activity from cost logs. Last 100 entries.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {usageLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : usage.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No image generation activity recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-sm">
                    <Badge variant="outline" data-testid="text-total-cost">
                      Total: ${totalCost.toFixed(4)}
                    </Badge>
                    <Badge variant="outline" data-testid="text-total-count">
                      {usage.length} generations
                    </Badge>
                  </div>
                  <div className="max-h-80 overflow-y-auto border rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Time</th>
                          <th className="text-left p-2">Service</th>
                          <th className="text-left p-2">Model</th>
                          <th className="text-left p-2">Operation</th>
                          <th className="text-right p-2">Cost</th>
                          <th className="text-right p-2">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.slice().reverse().map((entry, i) => (
                          <tr key={i} className="border-t" data-testid={`row-usage-${i}`}>
                            <td className="p-2 text-muted-foreground">
                              {new Date(entry.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="p-2">{entry.service}</td>
                            <td className="p-2 font-mono truncate max-w-[120px]">{entry.model?.split(":")[0] || "-"}</td>
                            <td className="p-2">{entry.operation}</td>
                            <td className="p-2 text-right">${(entry.estimatedCostUsd || 0).toFixed(4)}</td>
                            <td className="p-2 text-right text-muted-foreground">
                              {entry.durationMs ? `${(entry.durationMs / 1000).toFixed(1)}s` : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
