import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GlobalResponse, ResearchQuestion } from "./types";
import type { ResearchConfig, AiModelEntry } from "@shared/schema";
import { invalidateAllFinancialQueries } from "./properties";

async function fetchGlobalAssumptions(): Promise<GlobalResponse> {
  const res = await fetch("/api/global-assumptions");
  if (!res.ok) throw new Error("Failed to fetch global assumptions");
  return res.json();
}

async function updateGlobalAssumptions(data: Partial<GlobalResponse>): Promise<GlobalResponse> {
  const res = await fetch("/api/global-assumptions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update global assumptions");
  return res.json();
}

export function useGlobalAssumptions() {
  return useQuery({
    queryKey: ["globalAssumptions"],
    queryFn: fetchGlobalAssumptions,
  });
}

export function useUpdateGlobalAssumptions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateGlobalAssumptions,
    onSuccess: () => {
      invalidateAllFinancialQueries(queryClient);
    },
  });
}

/**
 * Update global_assumptions for non-financial fields (branding, ICP, sidebar,
 * asset definition, AI agent config). Only invalidates the globalAssumptions
 * query — does NOT cascade to properties, scenarios, or other financial caches.
 *
 * Use `useUpdateGlobalAssumptions` instead when the mutation touches any field
 * that feeds into financial calculations (fees, rates, staffing, partner comp, etc.).
 */
export function useUpdateAdminConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateGlobalAssumptions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["globalAssumptions"] });
    },
  });
}

export function useResearchQuestions() {
  return useQuery<ResearchQuestion[]>({
    queryKey: ["research-questions"],
    queryFn: async () => {
      const res = await fetch("/api/research-questions");
      if (!res.ok) throw new Error("Failed to fetch research questions");
      return res.json();
    },
  });
}

export function useCreateResearchQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (question: string) => {
      const res = await fetch("/api/research-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error("Failed to create question");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["research-questions"] }),
  });
}

export function useUpdateResearchQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, question }: { id: number; question: string }) => {
      const res = await fetch(`/api/research-questions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error("Failed to update question");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["research-questions"] }),
  });
}

export function useDeleteResearchQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/research-questions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete question");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["research-questions"] }),
  });
}

export function useResearchConfig() {
  return useQuery<ResearchConfig>({
    queryKey: ["admin-research-config"],
    queryFn: async () => {
      const res = await fetch("/api/admin/research-config");
      if (!res.ok) throw new Error("Failed to fetch research config");
      return res.json();
    },
  });
}

export function useSaveResearchConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: ResearchConfig) => {
      const res = await fetch("/api/admin/research-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Failed to save research config");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-research-config"] }),
  });
}

export function useRefreshAiModels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ models: AiModelEntry[]; fetchedAt: string; liveCount?: number; fromCache?: boolean }> => {
      const res = await fetch("/api/admin/ai-models/refresh", { method: "POST" });
      if (!res.ok) throw new Error("Failed to refresh AI models");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-research-config"] }),
  });
}

export interface LlmRegistryModel {
  vendor: string;
  modelId: string;
  label: string;
  status: "available" | "deprecated" | "error" | "no_key";
  latencyMs: number | null;
  capabilities: string[];
  errorMessage?: string;
  probedAt: string;
}

export interface LlmRecommendation {
  function: string;
  vendor: string;
  modelId: string;
  label: string;
  score: number;
  reasoning: string;
}

export interface LlmAdminIssue {
  domain: string;
  currentVendor: string;
  currentModel: string;
  issue: "model_unavailable" | "vendor_down";
  recommendation: LlmRecommendation | null;
  message: string;
}

export interface LlmRegistryState {
  models: LlmRegistryModel[];
  recommendations: LlmRecommendation[];
  adminIssues: LlmAdminIssue[];
  vendorStatuses: { vendor: string; available: boolean; modelCount: number; avgLatencyMs: number | null; error?: string }[];
  probedAt: string | null;
  durationMs: number;
  status: "ready" | "not_yet_probed";
}

export function useLlmRegistry() {
  return useQuery<LlmRegistryState>({
    queryKey: ["admin-llm-registry"],
    queryFn: async () => {
      const res = await fetch("/api/admin/llm-registry");
      if (!res.ok) throw new Error("Failed to fetch LLM registry");
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useRefreshLlmRegistry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<LlmRegistryState> => {
      const res = await fetch("/api/admin/llm-registry/refresh", { method: "POST" });
      if (!res.ok) throw new Error("Failed to refresh LLM registry");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-llm-registry"] });
      queryClient.invalidateQueries({ queryKey: ["admin-research-config"] });
    },
  });
}
