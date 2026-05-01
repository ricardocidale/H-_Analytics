import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { DesignTheme, DesignColor } from "./types";

const QUERY_KEY = ["design-themes"];

export function useDesignThemes() {
  return useQuery<DesignTheme[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/admin/design-themes", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch design themes");
      return res.json();
    },
  });
}

export function useCreateTheme(callbacks?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { name: string; description: string; colors: DesignColor[] }) => {
      const res = await fetch("/api/admin/design-themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create theme");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      callbacks?.onSuccess?.();
      toast({ title: "Theme created successfully" });
    },
  });
}

export function useUpdateTheme(callbacks?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<{ name: string; description: string; colors: DesignColor[]; isDefault: boolean }> }) => {
      const res = await fetch(`/api/admin/design-themes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update theme");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      callbacks?.onSuccess?.();
      toast({ title: "Theme updated successfully" });
    },
  });
}

export function useDeleteTheme() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/design-themes/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete theme");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Theme deleted successfully" });
    },
  });
}

