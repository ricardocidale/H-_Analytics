import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  MarketResearchResponse, 
  PropertyFinderSearchParams, 
  PropertyFinderSearchResponse, 
  SavedProspectiveProperty,
  PropertyFinderResult,
  SavedSearch,
  MarketContextResponse,
  PropertyValueHistory,
} from "./types";

export function useResearchStatus() {
  return useQuery<any>({
    queryKey: ["research", "status"],
    queryFn: async () => {
      const res = await fetch("/api/research/status");
      if (!res.ok) throw new Error("Failed to fetch research status");
      return res.json();
    },
  });
}

async function fetchResearch(type: string, propertyId?: number): Promise<MarketResearchResponse | null> {
  const params = new URLSearchParams();
  params.set("type", type);
  if (propertyId) params.set("propertyId", propertyId.toString());
  const res = await fetch(`/api/market-research?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch research");
  return res.json();
}

export function useMarketResearch(type: string, propertyId?: number) {
  return useQuery({
    queryKey: ["research", type, propertyId],
    queryFn: () => fetchResearch(type, propertyId),
    enabled: !!type,
  });
}

async function searchProperties(params: PropertyFinderSearchParams): Promise<PropertyFinderSearchResponse> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.set(key, value);
  });
  const res = await fetch(`/api/property-finder/search?${searchParams.toString()}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.message || data.error || "Search failed");
  }
  return res.json();
}

async function fetchFavorites(): Promise<SavedProspectiveProperty[]> {
  const res = await fetch("/api/property-finder/prospective");
  if (!res.ok) throw new Error("Failed to fetch saved properties");
  return res.json();
}

async function saveFavorite(data: PropertyFinderResult): Promise<SavedProspectiveProperty> {
  const res = await fetch("/api/property-finder/prospective", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save property");
  return res.json();
}

async function deleteFavorite(id: number): Promise<void> {
  const res = await fetch(`/api/property-finder/prospective/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to remove property");
}

async function updateFavoriteNotes({ id, notes }: { id: number; notes: string }): Promise<SavedProspectiveProperty> {
  const res = await fetch(`/api/property-finder/prospective/${id}/notes`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) throw new Error("Failed to update notes");
  return res.json();
}

export function usePropertySearch(params: PropertyFinderSearchParams | null) {
  return useQuery({
    queryKey: ["propertySearch", params],
    queryFn: () => searchProperties(params!),
    enabled: !!params?.location,
    retry: false,
  });
}

export function useProspectiveFavorites() {
  return useQuery({
    queryKey: ["prospectiveFavorites"],
    queryFn: fetchFavorites,
  });
}

export function useSaveFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveFavorite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospectiveFavorites"] });
    },
  });
}

export function useDeleteFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteFavorite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospectiveFavorites"] });
    },
  });
}

export function useUpdateFavoriteNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateFavoriteNotes,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospectiveFavorites"] });
    },
  });
}

async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const res = await fetch("/api/property-finder/searches");
  if (!res.ok) throw new Error("Failed to fetch saved searches");
  return res.json();
}

async function createSavedSearch(data: { name: string; filters: PropertyFinderSearchParams }): Promise<SavedSearch> {
  const res = await fetch("/api/property-finder/searches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save search");
  return res.json();
}

async function deleteSavedSearch(id: number): Promise<void> {
  const res = await fetch(`/api/property-finder/searches/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete search");
}

export function useSavedSearches() {
  return useQuery({
    queryKey: ["savedSearches"],
    queryFn: fetchSavedSearches,
  });
}

export function useCreateSavedSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSavedSearch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedSearches"] });
    },
  });
}

export function useDeleteSavedSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSavedSearch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedSearches"] });
    },
  });
}

const MARKET_CONTEXT_STALE_MS = 4 * 60 * 60 * 1000;

function normalizeMarketLocation(location: string, state?: string): { city: string; state?: string } {
  const parts = location.split(",").map((s) => s.trim());
  const city = parts[0];
  const parsed = state || parts[1] || undefined;
  return { city, state: parsed };
}

async function fetchMarketContext(location: string, state?: string): Promise<MarketContextResponse> {
  const params = new URLSearchParams({ location });
  if (state) params.set("state", state);
  const res = await fetch(`/api/property-finder/market-context?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch market context");
  return res.json();
}

export function useMarketContext(location: string | null, state?: string) {
  const norm = location ? normalizeMarketLocation(location, state) : null;
  return useQuery({
    queryKey: ["marketContext", norm?.city ?? null, norm?.state ?? null],
    queryFn: () => fetchMarketContext(norm!.city, norm!.state),
    enabled: !!norm,
    staleTime: MARKET_CONTEXT_STALE_MS,
    retry: false,
  });
}

async function fetchPropertyValue(propertyId: string): Promise<PropertyValueHistory | null> {
  const res = await fetch(`/api/property-finder/property-value?property_id=${encodeURIComponent(propertyId)}`);
  if (!res.ok) throw new Error("Failed to fetch property value history");
  const data = await res.json();
  return data.history ?? null;
}

const PROPERTY_VALUE_STALE_MS = 60 * 60 * 1000;

export function usePropertyValue(propertyId: string | null) {
  return useQuery({
    queryKey: ["propertyValue", propertyId],
    queryFn: () => fetchPropertyValue(propertyId!),
    enabled: !!propertyId,
    staleTime: PROPERTY_VALUE_STALE_MS,
    retry: false,
  });
}
