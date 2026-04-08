import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Property, InsertProperty, UpdateProperty } from "@shared/schema";
import { PropertyResponse, FeeCategoryResponse } from "./types";

const ALL_FINANCIAL_QUERY_KEYS = [
  ["globalAssumptions"],
  ["properties"],
  ["propertyPhotos"],
  ["feeCategories"],
  ["scenarios"],
  ["research"],
  ["serviceTemplates"],
] as const;

export function invalidateAllFinancialQueries(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of ALL_FINANCIAL_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [...key] });
  }
}

async function fetchProperties(): Promise<PropertyResponse[]> {
  const res = await fetch("/api/properties");
  if (!res.ok) throw new Error("Failed to fetch properties");
  return res.json();
}

async function fetchProperty(id: number): Promise<PropertyResponse> {
  const res = await fetch(`/api/properties/${id}`);
  if (!res.ok) throw new Error("Failed to fetch property");
  return res.json();
}

async function createProperty(data: InsertProperty): Promise<PropertyResponse> {
  const res = await fetch("/api/properties", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create property");
  return res.json();
}

async function updateProperty(id: number, data: UpdateProperty): Promise<PropertyResponse> {
  const res = await fetch(`/api/properties/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update property");
  return res.json();
}

async function deleteProperty(id: number): Promise<void> {
  const res = await fetch(`/api/properties/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete property");
}

export function useProperties() {
  return useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
  });
}

export function useProperty(id: number) {
  return useQuery({
    queryKey: ["properties", id],
    queryFn: () => fetchProperty(id),
    enabled: !!id,
  });
}

export function useCreateProperty() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createProperty,
    onSuccess: () => {
      invalidateAllFinancialQueries(queryClient);
    },
  });
}

export function useUpdateProperty() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateProperty }) => 
      updateProperty(id, data),
    onSuccess: () => {
      invalidateAllFinancialQueries(queryClient);
    },
  });
}

export function useDeleteProperty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProperty,
    onSuccess: () => {
      invalidateAllFinancialQueries(queryClient);
    },
  });
}

export function useFeeCategories(propertyId: number) {
  return useQuery({
    queryKey: ["feeCategories", propertyId],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/fee-categories`);
      if (!res.ok) throw new Error("Failed to fetch fee categories");
      return res.json() as Promise<FeeCategoryResponse[]>;
    },
    enabled: !!propertyId,
  });
}

export function useAllFeeCategories() {
  return useQuery({
    queryKey: ["feeCategories", "all"],
    queryFn: async () => {
      const res = await fetch("/api/fee-categories/all");
      if (!res.ok) throw new Error("Failed to fetch all fee categories");
      return res.json() as Promise<FeeCategoryResponse[]>;
    },
  });
}

export function useAllPropertyUrls() {
  return useQuery<import("@shared/schema").PropertyUrl[]>({
    queryKey: ["propertyUrls", "all"],
    queryFn: async () => {
      const res = await fetch("/api/property-urls/all", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
}

export function useUpdateFeeCategories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ propertyId, categories }: { propertyId: number; categories: Partial<FeeCategoryResponse>[] }) => {
      const res = await fetch(`/api/properties/${propertyId}/fee-categories`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categories),
      });
      if (!res.ok) throw new Error("Failed to update fee categories");
      return res.json() as Promise<FeeCategoryResponse[]>;
    },
    onSuccess: () => {
      invalidateAllFinancialQueries(queryClient);
    },
  });
}
