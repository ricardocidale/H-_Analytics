import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { SaveButton } from "@/components/ui/save-button";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  IconResearch, IconProperties, IconTarget, IconTrendingUp, IconSliders,
} from "@/components/icons";
import { useResearchConfig, useSaveResearchConfig } from "@/lib/api/admin";
import type { ResearchConfig, ResearchSourceEntry } from "@shared/schema";
import {
  mergeConfig, normalizeResearchConfig,
  COMPANY_DEFAULT_SOURCES, CollapsibleSection, SourceLibrary,
} from "./research-center/research-shared";
import { IcpResearchSection } from "./research-center/IcpResearchSection";
import {
  PropertyResearchSection, MarketResearchSection,
} from "./research-center/PropertyMarketSections";
import { IconLink } from "@/components/icons";

interface ResearchCenterTabProps {
  initialTab?: string;
  onSaveStateChange?: (state: import("@/components/admin/save-state").AdminSaveState | null) => void;
}

export default function ResearchCenterTab({ onSaveStateChange }: ResearchCenterTabProps) {
  const { toast } = useToast();
  const rcQueryClient = useQueryClient();
  const { data: savedConfig, isLoading } = useResearchConfig();
  const saveMutation = useSaveResearchConfig();

  const { data: globalAssumptions } = useQuery({
    queryKey: ["globalAssumptions"],
    queryFn: async () => {
      const res = await fetch("/api/global-assumptions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const updateGlobalMutation = useMutation({
    mutationFn: async (updates: Record<string, boolean>) => {
      const res = await fetch("/api/global-assumptions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...globalAssumptions, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onMutate: async (updates) => {
      await rcQueryClient.cancelQueries({ queryKey: ["globalAssumptions"] });
      const prev = rcQueryClient.getQueryData(["globalAssumptions"]);
      rcQueryClient.setQueryData(["globalAssumptions"], (old: any) => ({ ...old, ...updates }));
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) rcQueryClient.setQueryData(["globalAssumptions"], context.prev);
      toast({ title: "Error", description: "Failed to save setting.", variant: "destructive" });
    },
    onSuccess: () => {
      rcQueryClient.invalidateQueries({ queryKey: ["globalAssumptions"] });
    },
  });

  const [draft, setDraft] = useState<ResearchConfig>({});
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (savedConfig) {
      const { marketing, ...rest } = savedConfig as ResearchConfig & { marketing?: unknown };
      const normalized = normalizeResearchConfig({ ...rest });
      setDraft(normalized);
      setIsDirty(false);
    }
  }, [savedConfig]);

  function updateConfig(key: "property" | "global" | "company", updated: import("@shared/schema").ResearchEventConfig) {
    setDraft((prev) => ({ ...prev, [key]: updated }));
    setIsDirty(true);
  }

  function updateCompanySources(sources: ResearchSourceEntry[]) {
    setDraft((prev) => ({ ...prev, companySources: sources }));
    setIsDirty(true);
  }

  async function handleSave() {
    try {
      const toSave = { ...draft };
      if (toSave.primaryLlm) {
        toSave.preferredLlm = toSave.primaryLlm;
      }
      if (toSave.llmMode === "primary-only") {
        toSave.secondaryLlm = undefined;
      }
      await saveMutation.mutateAsync(toSave);
      setDraft(toSave);
      setIsDirty(false);
      toast({ title: "Research configuration saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  }

  const saveRef = useRef<(() => void) | undefined>(undefined);
  saveRef.current = handleSave;

  useEffect(() => {
    onSaveStateChange?.({
      isDirty,
      isPending: saveMutation.isPending,
      onSave: () => saveRef.current?.(),
    });
    return () => onSaveStateChange?.(null);
  }, [isDirty, saveMutation.isPending, onSaveStateChange]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="research-center-tab">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <IconResearch className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-display font-bold text-foreground" data-testid="text-research-center-title">Research Center</h2>
          <p className="text-xs text-muted-foreground">Strategic intelligence hub — company research, property benchmarks, and market analysis configuration</p>
        </div>
      </div>

      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <IconSliders className="w-4 h-4 text-primary" />
            Research Automation
            <InfoTooltip text="Automatically refresh stale research data after login." />
          </CardTitle>
          <CardDescription className="label-text">Configure automatic research refresh behavior on login.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border/60 hover:bg-muted/50 transition-colors">
            <div>
              <Label className="label-text font-medium flex items-center gap-1">Auto-refresh research on login <InfoTooltip text="Checks for stale research after login and triggers a refresh if data is older than 30 business days." /></Label>
              <p className="text-xs text-muted-foreground mt-0.5">Automatically refresh stale research data after login (checks every 30 business days)</p>
            </div>
            <Switch
              checked={(globalAssumptions as Record<string, unknown> | undefined)?.autoResearchRefreshEnabled as boolean ?? false}
              onCheckedChange={(checked) =>
                updateGlobalMutation.mutate({ autoResearchRefreshEnabled: checked })
              }
              data-testid="switch-auto-research-refresh"
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="icp" className="w-full">
        <TabsList className="justify-start w-full h-auto flex-wrap gap-1 bg-muted/50 p-1">
          <TabsTrigger value="icp" className="gap-1.5 text-xs" data-testid="tab-icp-management-co">
            <IconTarget className="w-3.5 h-3.5" />
            Management Company
          </TabsTrigger>
          <TabsTrigger value="properties" className="gap-1.5 text-xs" data-testid="tab-properties">
            <IconProperties className="w-3.5 h-3.5" />
            Properties
          </TabsTrigger>
          <TabsTrigger value="general-market" className="gap-1.5 text-xs" data-testid="tab-general-market">
            <IconTrendingUp className="w-3.5 h-3.5" />
            Market & Industry
          </TabsTrigger>
        </TabsList>

        <TabsContent value="icp" className="mt-4 space-y-5">
          <IcpResearchSection
            enabled={mergeConfig(draft.company).enabled}
            onToggle={(v) => updateConfig("company", { ...mergeConfig(draft.company), enabled: v })}
          />

          <CollapsibleSection
            title="Sources"
            icon={<IconLink className="w-4 h-4 text-primary" />}
            description="Data sources for ICP and company-level research"
            defaultOpen={false}
          >
            <SourceLibrary
              sources={draft.companySources ?? []}
              onChange={updateCompanySources}
              testIdPrefix="co-src"
              defaultSources={COMPANY_DEFAULT_SOURCES}
            />
          </CollapsibleSection>

          <div className="flex justify-end pb-8">
            <SaveButton
              onClick={handleSave}
              isPending={saveMutation.isPending}
              hasChanges={isDirty}
              data-testid="button-save-icp-config"
            />
          </div>
        </TabsContent>

        <TabsContent value="properties" className="mt-4 space-y-5">
          <PropertyResearchSection
            config={mergeConfig(draft.property)}
            onChange={(c) => updateConfig("property", c)}
          />

          <div className="flex justify-end pb-8">
            <SaveButton
              onClick={handleSave}
              isPending={saveMutation.isPending}
              hasChanges={isDirty}
              data-testid="button-save-property-config"
            />
          </div>
        </TabsContent>

        <TabsContent value="general-market" className="mt-4 space-y-5">
          <MarketResearchSection
            config={mergeConfig(draft.global)}
            onChange={(c) => updateConfig("global", c)}
          />

          <div className="flex justify-end pb-8">
            <SaveButton
              onClick={handleSave}
              isPending={saveMutation.isPending}
              hasChanges={isDirty}
              data-testid="button-save-market-config"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
