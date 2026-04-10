import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Logo, User, AdminCompany, UserGroup, AssetDesc } from "./types";

interface ThemeEntry { id: number; name: string; isDefault: boolean }

export function adminFetch<T>(url: string, errorMsg: string): () => Promise<T> {
  return async () => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(errorMsg);
    return res.json();
  };
}

export function adminMutate(url: string, method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST") {
  return async (body?: Record<string, any>) => {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed`);
    }
    return res.json();
  };
}

export function useAdminLogos() {
  return useQuery<Logo[]>({
    queryKey: ["admin", "logos"],
    queryFn: adminFetch<Logo[]>("/api/logos", "Failed to fetch logos"),
  });
}

export function useAdminUsers() {
  return useQuery<User[]>({
    queryKey: ["admin", "users"],
    queryFn: adminFetch<User[]>("/api/admin/users", "Failed to fetch users"),
  });
}

export function useAdminCompanies() {
  return useQuery<AdminCompany[]>({
    queryKey: ["admin", "companies"],
    queryFn: adminFetch<AdminCompany[]>("/api/companies", "Failed to fetch companies"),
  });
}

export function useAdminUserGroups() {
  return useQuery<UserGroup[]>({
    queryKey: ["admin", "user-groups"],
    queryFn: adminFetch<UserGroup[]>("/api/user-groups", "Failed to fetch user groups"),
  });
}

export function useAdminThemes() {
  return useQuery<ThemeEntry[]>({
    queryKey: ["admin", "all-themes"],
    queryFn: adminFetch<ThemeEntry[]>("/api/available-themes", "Failed to fetch themes"),
  });
}

export function useAdminAssetDescriptions() {
  return useQuery<AssetDesc[]>({
    queryKey: ["admin", "asset-descriptions"],
    queryFn: adminFetch<AssetDesc[]>("/api/asset-descriptions", "Failed to fetch asset descriptions"),
  });
}

export function useCreateLogo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: adminMutate("/api/logos", "POST"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "logos"] });
      queryClient.invalidateQueries({ queryKey: ["my-branding"] });
      toast({ title: "Logo Created", description: "Logo has been added successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create logo.", variant: "destructive" });
    },
  });
}

export function useDeleteLogo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/logos/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete logo");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "logos"] });
      queryClient.invalidateQueries({ queryKey: ["my-branding"] });
      toast({ title: "Logo Deleted", description: "Logo has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useEnhanceLogoPrompt() {
  const [isEnhancing, setIsEnhancing] = useState(false);

  const enhance = useCallback(async (prompt: string, style?: string): Promise<string | null> => {
    setIsEnhancing(true);
    try {
      const res = await fetch("/api/enhance-logo-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt, style }),
      });
      if (!res.ok) throw new Error("Failed to enhance prompt");
      const data = await res.json();
      return data.enhanced;
    } catch (error: unknown) {
      console.error("Failed to enhance logo prompt:", error);
      return null;
    } finally {
      setIsEnhancing(false);
    }
  }, []);

  return { enhance, isEnhancing };
}

export function useGenerateLogoImage() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(async (prompt: string): Promise<string | null> => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/generate-property-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error("Failed to generate logo");
      const data = await res.json();
      return data.objectPath;
    } catch (error: unknown) {
      console.error("Failed to enhance logo prompt:", error);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return { generate, isGenerating };
}
