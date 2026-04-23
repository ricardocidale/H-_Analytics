/**
 * LlmConfigTab — model resource selection + prompt template editor for
 * one Specialist. Embeds the global PipelineConfigTab below as a courtesy
 * so admins can see the cross-cutting policies that also apply.
 */
import { lazy, Suspense, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "@/components/icons/themed-icons";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ResourcePublicView } from "@shared/schema";
import type { SpecialistConfigView } from "../types";
import { navigateToResources } from "../constants";

const PipelineConfigTab = lazy(() => import("@/components/admin/intelligence/PipelineConfigTab"));

export function LlmConfigTab({ specialistId, config }: { specialistId: string; config: SpecialistConfigView }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [prompt, setPrompt] = useState(config.promptTemplate);
  const [modelId, setModelId] = useState<string>(config.modelResourceId ? String(config.modelResourceId) : "none");
  const [summary, setSummary] = useState("");

  const { data: models } = useQuery<ResourcePublicView[]>({ queryKey: ["/api/admin/resources?kind=model"] });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/specialists/${specialistId}/llm-config`, {
        promptTemplate: prompt,
        modelResourceId: modelId === "none" ? null : Number(modelId),
        changeSummary: summary || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "LLM config updated" });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}`] });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/audit`] });
      setSummary("");
    },
    onError: (e: unknown) => toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>LLM Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Model</label>
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger data-testid="select-llm-model"><SelectValue placeholder="Select a model resource" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {(models ?? []).map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.displayName ?? m.slug}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Models are managed in <a className="underline" data-testid="link-resources-models" onClick={(e) => { e.preventDefault(); navigateToResources(setLocation, "resources-models"); }} href="#">Resources · Models →</a>
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Prompt template</label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={12} className="font-mono text-sm" data-testid="textarea-prompt-template" />
          </div>
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Change summary (optional, recorded in audit)" data-testid="input-change-summary-llm" />
          <div className="flex justify-end">
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-save-llm-config">
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-pipeline-config-embed">
        <CardHeader>
          <CardTitle>Global pipeline configuration</CardTitle>
          <p className="text-xs text-muted-foreground">
            These policies apply to every specialist. Specialist-specific prompt and model are above.
          </p>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}>
            <PipelineConfigTab />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
