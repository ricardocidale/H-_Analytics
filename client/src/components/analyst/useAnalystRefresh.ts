import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { collectMissingLockedHardFields } from "@/lib/locked-hard-preflight";
import type { AnalystVerdict } from "@engine/analyst/contracts/verdict";

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

interface RefreshResponseLegacy {
  runId: number;
  durationMs: number;
  totalRecords: number;
  filteredRecords: number;
  guidance: AnalystGuidanceRecord[];
}

interface RefreshResponseVerdict {
  verdict: AnalystVerdict;
}

type RefreshResponse = RefreshResponseLegacy | RefreshResponseVerdict;

function isVerdictResponse(r: RefreshResponse): r is RefreshResponseVerdict {
  return (r as RefreshResponseVerdict).verdict !== undefined;
}

export interface UseAnalystRefreshOptions {
  scope: AnalystRefreshScope;
  /**
   * Optional Specialist id (e.g. "mgmt-co.funding"). When set, the server
   * routes through the v1 single-shot Specialist runner and returns a
   * `{ verdict: AnalystVerdict }` response instead of the legacy
   * `{ runId, guidance, ... }` shape. The hook normalizes both.
   */
  specialistId?: string;
  /**
   * Query key(s) to invalidate on a successful run so guidance consumers
   * refetch. The caller owns which keys matter.
   */
  invalidateKeys?: ReadonlyArray<ReadonlyArray<unknown>>;
  /**
   * current values of the surface (e.g. the loaded
   * GlobalAssumptions). Used by the client-side preflight that checks
   * catalog locked-hard fields BEFORE the API call so the user sees
   * the missing-fields prompt immediately, without burning the 60s
   * cooldown or showing a spinner. Optional for back-compat; when
   * omitted, the hook still honors a server 400 response.
   */
  entityValues?: Record<string, unknown> | null | undefined;
  /**
   * Invoked when the locked-hard preflight (or the server's matching
   * 400 response) determines a refresh would be blocked. The host
   * component is expected to open `MissingRequiredFieldsPrompt` with
   * these fields.
   */
  onMissingRequiredFields?: (info: {
    specialistId: string;
    missingFields: { key: string; label: string; surface: string; surfaceAnchor?: string }[];
  }) => void;
}

export interface UseAnalystRefreshResult {
  /** Fire a scoped Analyst run. `fields` optionally narrows the return slice. */
  triggerRefresh: (fields?: string[]) => void;
  running: boolean;
  cooldownRemainingMs: number;
  lastRunId: number | null;
  lastGuidance: AnalystGuidanceRecord[] | null;
  /**
   * Latest `AnalystVerdict` returned when the request was routed through
   * a v1 Specialist (i.e. `specialistId` was set). `null` for legacy
   * runs or before the first verdict is received.
   */
  lastVerdict: AnalystVerdict | null;
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
  specialistId,
  invalidateKeys = [],
  entityValues,
  onMissingRequiredFields,
}: UseAnalystRefreshOptions): UseAnalystRefreshResult {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [cooldownEndAt, setCooldownEndAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [lastRunId, setLastRunId] = useState<number | null>(null);
  const [lastGuidance, setLastGuidance] =
    useState<AnalystGuidanceRecord[] | null>(null);
  const [lastVerdict, setLastVerdict] = useState<AnalystVerdict | null>(null);
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
        ...(specialistId ? { specialistId } : {}),
      });
      return (await res.json()) as RefreshResponse;
    },
    // server-side mirror of the preflight. If the user
    // managed to bypass the local check (stale catalog, race) and the
    // server returns 400 with the REQUIRED_FIELDS_MISSING shape, surface
    // the prompt instead of the generic "Analyst failed" toast.
    onSuccess: (data) => {
      // Start the 60s local cooldown to match the server.
      setCooldownEndAt(Date.now() + 60 * 1000);
      for (const key of invalidateKeys) {
        qc.invalidateQueries({ queryKey: key as unknown[] });
      }

      if (isVerdictResponse(data)) {
        // Clear stale legacy-path state so the UI doesn't show both a
        // verdict card AND a stale guidance toast / runId from a prior
        // legacy run on this same hook instance.
        setLastRunId(null);
        setLastGuidance(null);
        setLastVerdict(data.verdict);
        toast({
          title: "Analyst done",
          description: data.verdict.voice.headline,
        });
        return;
      }

      // Legacy success — clear any prior verdict so we don't render a
      // stale card next to fresh legacy guidance.
      setLastVerdict(null);
      setLastRunId(data.runId);
      setLastGuidance(data.guidance);
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

      if (status === 400 && onMissingRequiredFields) {
        try {
          const body = JSON.parse(bodyText) as {
            code?: string;
            specialistId?: string;
            missingFields?: { key: string; label: string; surface: string; surfaceAnchor?: string }[];
          };
          if (body.code === "REQUIRED_FIELDS_MISSING" && Array.isArray(body.missingFields)) {
            onMissingRequiredFields({
              specialistId: body.specialistId ?? "mgmt-co",
              missingFields: body.missingFields,
            });
            return;
          }
        } catch {
          /* fall through to generic toast */
        }
      }

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

      // client-side preflight. Compute missing locked-hard
      // fields locally from the catalog + provided entityValues; if any
      // are missing, fire the prompt and skip the API call so the user
      // doesn't see a spinner or burn the cooldown for a known-bad run.
      if (entityValues && onMissingRequiredFields) {
        // Both company-scope Specialists are gated together so the user
        // fixes everything in one trip back to Company Assumptions.
        const missing = collectMissingLockedHardFields(
          [
            "mgmt-co.funding",
            "mgmt-co.revenue",
            "mgmt-co.icp-intelligence",
            "portfolio-ops.watchdog",
          ],
          entityValues,
        );
        if (missing.length > 0) {
          onMissingRequiredFields({
            specialistId: "mgmt-co",
            missingFields: missing,
          });
          return;
        }
      }

      mutation.mutate({ fields });
    },
    [mutation, cooldownEndAt, entityValues, onMissingRequiredFields],
  );

  const cooldownRemainingMs =
    cooldownEndAt != null ? Math.max(0, cooldownEndAt - now) : 0;

  return {
    triggerRefresh,
    running: mutation.isPending,
    cooldownRemainingMs,
    lastRunId,
    lastGuidance,
    lastVerdict,
  };
}
