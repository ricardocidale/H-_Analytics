import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type AnalystRefreshScope = "global-assumptions";

export interface AnalystGuidanceRecord {
  id: number;
  assumptionKey: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
  confidence: "high" | "medium" | "low";
  sourceName: string | null;
  sourceDate: string | null;
  reasoning: string | null;
}

interface RefreshResponse {
  runId: number;
  durationMs: number;
  totalRecords: number;
  filteredRecords: number;
  guidance: AnalystGuidanceRecord[];
}

export interface UseAnalystRefreshOptions {
  scope: AnalystRefreshScope;
  /**
   * Query key(s) to invalidate on a successful run so guidance consumers
   * refetch. The caller owns which keys matter.
   */
  invalidateKeys?: ReadonlyArray<ReadonlyArray<unknown>>;
}

export interface UseAnalystRefreshResult {
  /** Fire a scoped Analyst run. `fields` optionally narrows the return slice. */
  triggerRefresh: (fields?: string[]) => void;
  running: boolean;
  cooldownRemainingMs: number;
  lastRunId: number | null;
  lastGuidance: AnalystGuidanceRecord[] | null;
}

const TICK_MS = 1000;

/**
 * Client-side hook for the Analyst refresh action.
 *
 * Tracks local running state + cooldown countdown (driven by the server's
 * 60s cooldown via the `retryAfterMs` field on a 429). Invalidates the
 * supplied query keys on success so the UI picks up the fresh guidance.
 *
 * Each caller gets its own cooldown clock; if you want a single clock
 * shared across components, hoist the hook up to a common ancestor and
 * pass the result down as props.
 */
export function useAnalystRefresh({
  scope,
  invalidateKeys = [],
}: UseAnalystRefreshOptions): UseAnalystRefreshResult {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [cooldownEndAt, setCooldownEndAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [lastRunId, setLastRunId] = useState<number | null>(null);
  const [lastGuidance, setLastGuidance] =
    useState<AnalystGuidanceRecord[] | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick only while a cooldown is active.
  useEffect(() => {
    if (cooldownEndAt == null) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= cooldownEndAt) {
        setCooldownEndAt(null);
      }
    }, TICK_MS);
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [cooldownEndAt]);

  const mutation = useMutation<RefreshResponse, Error, { fields?: string[] }>({
    mutationFn: async ({ fields }) => {
      const res = await apiRequest("POST", "/api/analyst/refresh", {
        scope,
        fields,
      });
      return (await res.json()) as RefreshResponse;
    },
    onSuccess: (data) => {
      setLastRunId(data.runId);
      setLastGuidance(data.guidance);
      // Start the 60s local cooldown to match the server.
      setCooldownEndAt(Date.now() + 60 * 1000);
      for (const key of invalidateKeys) {
        qc.invalidateQueries({ queryKey: key as unknown[] });
      }
      toast({
        title: "Analyst done",
        description: `Updated ${data.filteredRecords} of ${data.totalRecords} fields.`,
      });
    },
    onError: (err) => {
      // Parse "STATUS: body" shape thrown by apiRequest.
      const msg = err.message ?? "";
      const statusMatch = msg.match(/^(\d{3}):\s*([\s\S]*)$/);
      const status = statusMatch ? Number(statusMatch[1]) : null;
      const bodyText = statusMatch ? statusMatch[2] : msg;

      if (status === 429) {
        try {
          const body = JSON.parse(bodyText) as { retryAfterMs?: number };
          if (typeof body.retryAfterMs === "number" && body.retryAfterMs > 0) {
            setCooldownEndAt(Date.now() + body.retryAfterMs);
            toast({
              title: "Analyst is cooling down",
              description: `Try again in ${Math.ceil(body.retryAfterMs / 1000)}s.`,
            });
            return;
          }
        } catch {
          /* fall through to generic toast */
        }
      }

      // Server policy: /api/analyst/refresh HOLDS the 60s cooldown on any
      // runner failure (5xx, upstream LLM errors). Mirror that locally so
      // the button disables instead of letting the next click get 429'd.
      // 400 validation errors happen BEFORE the server reserves the slot
      // and don't burn the cooldown — skip the local hold for those.
      if (status != null && status >= 500) {
        setCooldownEndAt(Date.now() + 60 * 1000);
      }

      toast({
        title: "Analyst failed",
        description: msg || "Unknown error",
        variant: "destructive",
      });
    },
  });

  const triggerRefresh = useCallback(
    (fields?: string[]) => {
      if (mutation.isPending) return;
      if (cooldownEndAt != null && Date.now() < cooldownEndAt) return;
      mutation.mutate({ fields });
    },
    [mutation, cooldownEndAt],
  );

  const cooldownRemainingMs =
    cooldownEndAt != null ? Math.max(0, cooldownEndAt - now) : 0;

  return {
    triggerRefresh,
    running: mutation.isPending,
    cooldownRemainingMs,
    lastRunId,
    lastGuidance,
  };
}
