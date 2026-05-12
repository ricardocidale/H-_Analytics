/**
 * icp-brackets.ts — React Query hooks for the ICP bracket catalog and
 * per-company bracket-mix management.
 *
 * Mirrors the server routes registered in artifacts/api-server/src/routes/icp-brackets.ts:
 *   GET  /api/icp/brackets          → useIcpBrackets
 *   GET  /api/icp/brackets/mix      → useIcpBracketMix
 *   PUT  /api/icp/brackets/mix      → useSaveBracketMix
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface IcpBracket {
  id: number;
  slug: string;
  name: string;
  archetype_label: string;
  customer_type: string;
  service_consumption_profile: string;
  target_adr_band_low: number | null;
  target_adr_band_high: number | null;
  comp_set_names: string[] | null;
  description: string | null;
  source_note: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface BracketMixEntry {
  bracketSlug: string;
  weight: number;
}

export type BracketMix = BracketMixEntry[];

const BRACKETS_QUERY_KEY = ["icp", "brackets"];
const MIX_QUERY_KEY = ["icp", "brackets", "mix"];

export function useIcpBrackets() {
  return useQuery<IcpBracket[]>({
    queryKey: BRACKETS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/icp/brackets");
      if (!res.ok) throw new Error("Failed to fetch bracket catalog");
      const data = await res.json();
      return (data.brackets ?? []) as IcpBracket[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useIcpBracketMix() {
  return useQuery<BracketMix | null>({
    queryKey: MIX_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/icp/brackets/mix");
      if (!res.ok) throw new Error("Failed to fetch bracket mix");
      const data = await res.json();
      return (data.bracketMix ?? null) as BracketMix | null;
    },
  });
}

export function useSaveBracketMix() {
  const queryClient = useQueryClient();
  return useMutation<BracketMix, Error, BracketMix>({
    mutationFn: async (mix) => {
      const res = await fetch("/api/icp/brackets/mix", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bracketMix: mix }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      const data = await res.json();
      return data.bracketMix as BracketMix;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(MIX_QUERY_KEY, saved);
    },
  });
}
