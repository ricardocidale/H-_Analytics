/**
 * useAssumptionGuardrail — look up the Fabio guardrail for a single
 * assumption key.
 *
 * Fetches the full `assumption_guardrails` table once (long stale time —
 * rows are code-seeded and rarely change between sessions) and returns the
 * matching row cast to the {@link AssumptionGuardrail} shape Fabio
 * consumes, or `null` when:
 *   - no `assumptionKey` is provided, or
 *   - the endpoint returns a non-2xx status (e.g. 403 for non-admins), or
 *   - no row exists in the table for that key.
 *
 * Non-admin users will receive a 403 from the admin-gated endpoint. The
 * hook converts that into an empty list so `RangeIndicator` gracefully
 * falls back to legacy (Med/Low/High) mode for those sessions — no
 * runtime error, no broken UI.
 *
 * Usage:
 *   const guardrail = useAssumptionGuardrail("wacc.cost_of_equity");
 *   <RangeIndicator ... guardrail={guardrail} />
 */
import { useQuery } from "@tanstack/react-query";
import type { AssumptionGuardrail } from "@engine/analyst/minions/fabio";

interface GuardrailRow {
  assumptionKey: string;
  low: number;
  high: number;
  targetLow: number | null;
  targetHigh: number | null;
}

interface GuardrailsApiResponse {
  rows: GuardrailRow[];
}

const STALE_TIME_MS = 10 * 60 * 1000;
const GC_TIME_MS = 15 * 60 * 1000;

export function useAssumptionGuardrail(
  assumptionKey: string | null | undefined,
): AssumptionGuardrail | null {
  const { data } = useQuery<GuardrailsApiResponse>({
    queryKey: ["/api/admin/assumption-guardrails"],
    queryFn: async () => {
      const res = await fetch("/api/admin/assumption-guardrails", {
        credentials: "include",
      });
      if (!res.ok) return { rows: [] };
      return res.json() as Promise<GuardrailsApiResponse>;
    },
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
  });

  if (!assumptionKey || !data?.rows?.length) return null;
  const row = data.rows.find((r) => r.assumptionKey === assumptionKey);
  if (!row) return null;
  return {
    assumptionKey: row.assumptionKey,
    low: row.low,
    high: row.high,
    targetLow: row.targetLow,
    targetHigh: row.targetHigh,
  };
}
