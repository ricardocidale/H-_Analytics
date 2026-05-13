import { useQuery } from "@tanstack/react-query";
import { FACTORY_POLL_MS, TRANSITIONING_STATUSES } from "./SlideFactoryConstants";
import type { Property, SlideFactoryRun } from "./SlideFactoryTypes";

// ── Data hooks ──────────────────────────────────────────────────────────────

export function useActiveFactoryRun() {
  const listQuery = useQuery<SlideFactoryRun | null>({
    queryKey: ["factory-run-list"],
    queryFn: async () => {
      const r = await fetch("/api/lb-slides/factory/runs", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load factory runs");
      const runs = (await r.json()) as SlideFactoryRun[];
      return runs[0] ?? null;
    },
  });

  const run = listQuery.data ?? null;
  const runId = run?.id ?? null;
  // Keep polling while the run is in a transitional pipeline state OR when the
  // run is `complete` but the deck PDF render hasn't written the R2 key yet.
  // The render finishes asynchronously after status flips to complete, and
  // without this branch the user would be stranded on Tab 6 forever.
  const isTransitioning =
    run != null &&
    (TRANSITIONING_STATUSES.has(run.status) ||
      (run.status === "complete" && !run.deckR2Key));

  const pollQuery = useQuery<SlideFactoryRun>({
    queryKey: ["factory-run", runId],
    queryFn: async () => {
      const r = await fetch(`/api/lb-slides/factory/runs/${runId}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to poll factory run");
      return r.json() as Promise<SlideFactoryRun>;
    },
    enabled: runId != null && isTransitioning,
    refetchInterval: isTransitioning ? FACTORY_POLL_MS : false,
  });

  const activeRun =
    isTransitioning && pollQuery.data != null ? pollQuery.data : run;

  return { run: activeRun, isLoading: listQuery.isLoading };
}

export function useProperties() {
  return useQuery<Property[]>({
    queryKey: ["properties"],
    queryFn: async () => {
      const r = await fetch("/api/properties", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load properties");
      return r.json() as Promise<Property[]>;
    },
  });
}
