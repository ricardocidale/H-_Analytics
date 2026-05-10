/**
 * OrchestratorDefaults — section 5 of the LlmWorkflows page.
 *
 * Global model assignment for the N+1 multi-model research pipeline (Analyst
 * A, Analyst B, Synthesis, Fallback). Specialists can override these on their
 * LLM Config tab.
 *
 * State (n1ModelIds, dirty flag, init guard, save mutation) lives entirely
 * inside this component — no parent reads it.
 *
 * Extracted from LlmWorkflowsPage.tsx during the task-1358 section split.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SaveButton } from "@/components/ui/save-button";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import type { PipelinePolicy, ResourcePublicView } from "@shared/schema";

export interface OrchestratorDefaultsProps {
  modelResources: ResourcePublicView[];
}

interface N1ModelIds {
  analystAModelResourceId: number | null;
  analystBModelResourceId: number | null;
  synthesisModelResourceId: number | null;
  fallbackModelResourceId: number | null;
}

export function OrchestratorDefaults({
  modelResources,
}: OrchestratorDefaultsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pipelinePolicies } = useQuery<PipelinePolicy[]>({
    queryKey: ["/api/admin/pipeline-policies"],
  });
  const tier1Policy =
    pipelinePolicies?.find(
      (p) => p.policyKey === "tier1_property" || p.tier === 1,
    ) ?? null;

  const [n1ModelIds, setN1ModelIds] = useState<N1ModelIds>({
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
    mutationFn: (ids: N1ModelIds) =>
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

  return (
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
  );
}
