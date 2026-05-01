/**
 * useFirstVisitBenchmarkSeed — kicks off a one-time refresh of any
 * benchmark table whose freshness is "missing" the first time the admin
 * visits the Analyst Tables page in their browser session. Uses
 * sessionStorage so we don't repeatedly trigger refreshes on each render.
 */
import { useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";

const SEEDED_KEY = "analyst-tables:auto-seeded";

interface MinimalTable {
  id: string;
  freshness: "fresh" | "stale" | "missing";
}

export function useFirstVisitBenchmarkSeed(tables: MinimalTable[] | undefined) {
  const triggered = useRef(false);
  useEffect(() => {
    if (!tables || triggered.current) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SEEDED_KEY)) return;
    const missing = tables.filter(t => t.freshness === "missing");
    if (missing.length === 0) return;

    triggered.current = true;
    sessionStorage.setItem(SEEDED_KEY, "1");

    // Fire-and-forget. Failures are silent — admin can manually retry.
    void Promise.all(missing.map(t =>
      apiRequest("POST", `/api/admin/analyst-tables/${t.id}/refresh`, {}).catch(() => null)
    ));
  }, [tables]);
}
