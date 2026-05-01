import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ServiceTemplate, InsertServiceTemplate, UpdateServiceTemplate } from "@shared/schema";
import { invalidateAllFinancialQueries } from "./properties";

export function useServiceTemplates() {
  return useQuery<ServiceTemplate[]>({
    queryKey: ["serviceTemplates"],
    queryFn: async () => {
      const res = await fetch("/api/admin/service-templates");
      if (!res.ok) throw new Error("Failed to fetch service templates");
      return res.json();
    },
  });
}

export function useCreateServiceTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertServiceTemplate) => {
      const res = await fetch("/api/admin/service-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create service template");
      return res.json();
    },
    onSuccess: () => {
      invalidateAllFinancialQueries(queryClient);
    },
  });
}

export function useUpdateServiceTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateServiceTemplate }) => {
      const res = await fetch(`/api/admin/service-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update service template");
      return res.json();
    },
    onSuccess: () => {
      invalidateAllFinancialQueries(queryClient);
    },
  });
}

export function useDeleteServiceTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/service-templates/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete service template");
      return res.json();
    },
    onSuccess: () => {
      invalidateAllFinancialQueries(queryClient);
    },
  });
}

export function useSyncServiceTemplates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/service-templates/sync", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to sync service templates");
      return res.json();
    },
    onSuccess: () => {
      invalidateAllFinancialQueries(queryClient);
    },
  });
}

export function useUpdateCompanyServiceTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateServiceTemplate }) => {
      const res = await fetch(`/api/company/service-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update service template");
      return res.json();
    },
    onSuccess: () => {
      invalidateAllFinancialQueries(queryClient);
    },
  });
}
