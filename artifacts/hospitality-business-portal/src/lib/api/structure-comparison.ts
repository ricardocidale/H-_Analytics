/**
 * client/src/lib/api/structure-comparison.ts
 *
 * Tanstack Query hook for the operating-structure comparison endpoint.
 * Mirrors the superjson handling used by `useServerFinancials.ts`.
 */
import { useQuery } from "@tanstack/react-query";
import superjson from "superjson";
import type { GlobalResponse } from "./types";
import type {
  OperatingStructureId,
  StructureOverlayPatch,
} from "@shared/constants-operating-structures";
import type { StructureComparisonResult } from "@calc/analysis/structure-comparison";

export interface StructureComparisonResponse extends StructureComparisonResult {
  engineVersion?: string;
  baselineOutputHash?: string;
}

export type StructureOverlaysMap = Partial<
  Record<OperatingStructureId, StructureOverlayPatch>
>;

async function fetchStructureComparison(args: {
  propertyId: number;
  globalAssumptions: GlobalResponse;
  structures?: OperatingStructureId[];
  overlays?: StructureOverlaysMap;
  projectionYears?: number;
}): Promise<StructureComparisonResponse> {
  const res = await fetch(
    `/api/properties/${args.propertyId}/structure-comparison`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        globalAssumptions: args.globalAssumptions,
        structures: args.structures,
        overlays: args.overlays,
        projectionYears: args.projectionYears,
      }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Structure comparison failed (${res.status})`);
  }
  const raw = await res.json();
  const isSuperjson = res.headers.get("X-Superjson") === "true";
  return isSuperjson
    ? (superjson.deserialize(raw) as StructureComparisonResponse)
    : (raw as StructureComparisonResponse);
}

/**
 * Stable string key for the overlays map so React Query's cache key only
 * changes when overlay values actually change. We sort keys to make this
 * order-independent (callers may build the map in any order).
 */
function stableOverlaysKey(overlays?: StructureOverlaysMap): string {
  if (!overlays) return "none";
  const entries = Object.entries(overlays).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "none";
  return JSON.stringify(entries);
}

export function useStructureComparison(
  propertyId: number | null,
  global: GlobalResponse | undefined,
  structures?: OperatingStructureId[],
  overlays?: StructureOverlaysMap,
) {
  return useQuery({
    queryKey: [
      "structure-comparison",
      propertyId,
      global?.id ?? 0,
      structures?.join(",") ?? "all",
      stableOverlaysKey(overlays),
    ],
    queryFn: () =>
      fetchStructureComparison({
        propertyId: propertyId!,
        globalAssumptions: global!,
        structures,
        overlays,
      }),
    enabled: !!propertyId && !!global,
  });
}
