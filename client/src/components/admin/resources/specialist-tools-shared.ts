/**
 * Shared types + helpers for the SPECIALIST_TOOLS inspector surface.
 *
 * Used by both:
 *   - LeticiaToolbox.tsx   — the global toolbox card above the table.
 *   - ResourcesTab.tsx     — the per-row "Built by … · last refreshed …
 *                             · called by …" strip beneath each
 *                             admin_resources row whose slug is declared
 *                             in `resourceSlugs` on a registered tool.
 *
 * Centralising the type and the freshness formatter keeps the two
 * surfaces honest to a single contract — if the API shape drifts, both
 * surfaces break in the same place.
 */
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

export interface ToolCalledBy {
  id: string;
  humanName: string;
  displayName: string;
}

export interface ToolView {
  id: string;
  displayName: string;
  description: string;
  kind: "deterministic" | "llm" | "hybrid";
  sourceFile: string;
  citation: string | null;
  resourceSlugs: string[];
  owner: { specialistId: string; humanName: string; displayName: string };
  calledBy: ToolCalledBy[];
  lastBuiltAt: string | null;
  lastBuiltSource: { kind: string } & Record<string, unknown>;
}

export interface ToolsResponse {
  catalogSize: number;
  tools: ToolView[];
}

export function formatLastBuilt(iso: string | null, sourceKind: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const rel = formatDistanceToNow(d, { addSuffix: true });
  if (sourceKind === "build-time") return `since deploy (${rel})`;
  return rel;
}

/**
 * Shared query for `/api/admin/specialist-tools`. React Query dedupes
 * the request between the toolbox card and the per-row strip so we
 * only hit the endpoint once per Resources page load.
 */
export function useSpecialistTools() {
  return useQuery<ToolsResponse>({
    queryKey: ["/api/admin/specialist-tools"],
    queryFn: async () => {
      const res = await fetch("/api/admin/specialist-tools", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });
}
