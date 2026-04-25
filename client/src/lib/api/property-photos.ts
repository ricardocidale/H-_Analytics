import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PropertyPhoto, UpdatePropertyPhoto } from "@shared/schema";
import { invalidateAllFinancialQueries } from "./properties";

// --- Fetch helpers ---

async function fetchPropertyPhotos(propertyId: number): Promise<PropertyPhoto[]> {
  const res = await fetch(`/api/properties/${propertyId}/photos`);
  if (!res.ok) throw new Error("Failed to fetch property photos");
  return res.json();
}

async function addPhoto(propertyId: number, data: { imageUrl: string; caption?: string; skipProcessing?: boolean; generationStyle?: string; beforePhotoId?: number; imageData?: string }): Promise<PropertyPhoto> {
  const res = await fetch(`/api/properties/${propertyId}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to add photo");
  return res.json();
}

async function updatePhoto(propertyId: number, photoId: number, data: UpdatePropertyPhoto): Promise<PropertyPhoto> {
  const res = await fetch(`/api/properties/${propertyId}/photos/${photoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update photo");
  return res.json();
}

async function deletePhoto(propertyId: number, photoId: number): Promise<void> {
  const res = await fetch(`/api/properties/${propertyId}/photos/${photoId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete photo");
}

async function setHero(propertyId: number, photoId: number): Promise<void> {
  const res = await fetch(`/api/properties/${propertyId}/photos/${photoId}/set-hero`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to set hero photo");
}

async function reorderPhotos(propertyId: number, orderedIds: number[]): Promise<void> {
  const res = await fetch(`/api/properties/${propertyId}/photos/reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedIds }),
  });
  if (!res.ok) throw new Error("Failed to reorder photos");
}

async function movePhotos(sourcePropertyId: number, photoIds: number[], destinationPropertyId: number, mode: "move" | "copy"): Promise<{ count: number }> {
  const res = await fetch(`/api/properties/${sourcePropertyId}/photos/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photoIds, destinationPropertyId, mode }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Failed" }));
    throw new Error(body.error || "Failed to move photos");
  }
  return res.json();
}

async function enhancePhoto(photoId: number): Promise<{ success: boolean; previewUrl: string; photoId: number }> {
  const res = await fetch(`/api/property-photos/${photoId}/enhance`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Enhancement failed" }));
    throw new Error(body.error || "Failed to enhance photo");
  }
  return res.json();
}

async function acceptEnhancement(photoId: number): Promise<void> {
  const res = await fetch(`/api/property-photos/${photoId}/enhance/accept`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to accept enhancement");
}

async function rejectEnhancement(photoId: number): Promise<void> {
  const res = await fetch(`/api/property-photos/${photoId}/enhance/reject`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to reject enhancement");
}

async function removeEnhancement(photoId: number): Promise<void> {
  const res = await fetch(`/api/property-photos/${photoId}/enhanced`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to remove enhancement");
}

// --- Hooks ---

export function usePropertyPhotos(propertyId: number) {
  return useQuery({
    queryKey: ["propertyPhotos", propertyId],
    queryFn: () => fetchPropertyPhotos(propertyId),
    enabled: !!propertyId,
  });
}

export function useAddPropertyPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ propertyId, imageUrl, caption, skipProcessing, generationStyle, beforePhotoId, imageData }: { propertyId: number; imageUrl: string; caption?: string; skipProcessing?: boolean; generationStyle?: string; beforePhotoId?: number; imageData?: string }) =>
      addPhoto(propertyId, { imageUrl, caption, skipProcessing, generationStyle, beforePhotoId, imageData }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["propertyPhotos", vars.propertyId] });
      invalidateAllFinancialQueries(queryClient);
    },
  });
}

export function useUpdatePropertyPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ propertyId, photoId, data }: { propertyId: number; photoId: number; data: UpdatePropertyPhoto }) =>
      updatePhoto(propertyId, photoId, data),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["propertyPhotos", vars.propertyId] });
    },
  });
}

export function useDeletePropertyPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ propertyId, photoId }: { propertyId: number; photoId: number }) =>
      deletePhoto(propertyId, photoId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["propertyPhotos", vars.propertyId] });
      invalidateAllFinancialQueries(queryClient);
    },
  });
}

export function useSetHeroPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ propertyId, photoId }: { propertyId: number; photoId: number }) =>
      setHero(propertyId, photoId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["propertyPhotos", vars.propertyId] });
      invalidateAllFinancialQueries(queryClient);
    },
  });
}

export function useReorderPhotos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ propertyId, orderedIds }: { propertyId: number; orderedIds: number[] }) =>
      reorderPhotos(propertyId, orderedIds),
    onMutate: async ({ propertyId, orderedIds }) => {
      await queryClient.cancelQueries({ queryKey: ["propertyPhotos", propertyId] });
      const previous = queryClient.getQueryData<PropertyPhoto[]>(["propertyPhotos", propertyId]);
      if (previous) {
        const map = new Map(previous.map((p) => [p.id, p]));
        const reordered = orderedIds
          .map((id) => map.get(id))
          .filter((p): p is PropertyPhoto => Boolean(p));
        // Append any photos not present in orderedIds (defensive)
        for (const p of previous) {
          if (!orderedIds.includes(p.id)) reordered.push(p);
        }
        queryClient.setQueryData(["propertyPhotos", propertyId], reordered);
      }
      return { previous };
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["propertyPhotos", vars.propertyId], ctx.previous);
      }
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: ["propertyPhotos", vars.propertyId] });
    },
  });
}

export function useMovePhotos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sourcePropertyId, photoIds, destinationPropertyId, mode }: { sourcePropertyId: number; photoIds: number[]; destinationPropertyId: number; mode: "move" | "copy" }) =>
      movePhotos(sourcePropertyId, photoIds, destinationPropertyId, mode),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["propertyPhotos", vars.sourcePropertyId] });
      queryClient.invalidateQueries({ queryKey: ["propertyPhotos", vars.destinationPropertyId] });
      invalidateAllFinancialQueries(queryClient);
    },
  });
}

export function useEnhancePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ photoId }: { photoId: number; propertyId: number }) =>
      enhancePhoto(photoId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["propertyPhotos", vars.propertyId] });
    },
  });
}

export function useAcceptEnhancement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ photoId }: { photoId: number; propertyId: number }) =>
      acceptEnhancement(photoId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["propertyPhotos", vars.propertyId] });
    },
  });
}

export function useRejectEnhancement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ photoId }: { photoId: number; propertyId: number }) =>
      rejectEnhancement(photoId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["propertyPhotos", vars.propertyId] });
    },
  });
}

export function useRemoveEnhancement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ photoId }: { photoId: number; propertyId: number }) =>
      removeEnhancement(photoId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["propertyPhotos", vars.propertyId] });
    },
  });
}
