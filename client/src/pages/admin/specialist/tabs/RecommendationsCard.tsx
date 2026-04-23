/**
 * RecommendationsCard — sidekick to RequiredFieldsTab. Surfaces the most
 * recent run's "missing but materially useful" candidate fields with
 * one-click "promote to Recommended" / "promote to Hard-required"
 * affordances. Promotion calls the existing field-toggles endpoint so the
 * audit trail and gate semantics stay unified with manual edits. A
 * passive-ignore beacon fires on unmount so the catalog calibration job
 * can tell "admin saw this and walked away" apart from "admin has not
 * loaded this page yet."
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SpecialistConfigView } from "../types";

export type FieldLevel = "hard" | "recommended" | "off";

export function RecommendationsCard({
  specialistId,
  config,
  candidateFields,
  fieldState,
  setFieldState,
}: {
  specialistId: string;
  config: SpecialistConfigView;
  candidateFields: { key: string; label: string; surface: string }[];
  fieldState: Record<string, FieldLevel>;
  setFieldState: (updater: (prev: Record<string, FieldLevel>) => Record<string, FieldLevel>) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  // Declared up here (not adjacent to ignoreMutation) so the
  // `recommendations` filter below can reference it without a TDZ
  // ReferenceError. Ignore is telemetry-only — no toggle change. We POST
  // the event and then locally suppress the row from the recommendations
  // list (the server will re-include it on the next observed-missing run
  // if the field is still empty, which is the desired behavior — Ignore
  // means "not interesting to me right now," not "remove permanently").
  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(new Set());
  const labelByKey = useMemo(() => {
    const m = new Map<string, { label: string; surface: string }>();
    for (const c of candidateFields) m.set(c.key, { label: c.label, surface: c.surface });
    return m;
  }, [candidateFields]);

  // Defensive filter: only surface keys still in the catalog AND still
  // toggled "off". A key the admin has already promoted should disappear
  // from the recommendations list immediately.
  const recommendations = (config.lastObservedMissing ?? []).filter(
    (k) => labelByKey.has(k) && (fieldState[k] ?? "off") === "off" && !ignoredKeys.has(k),
  );

  // Passive-ignore emission: if the admin navigates away or the card
  // unmounts while recommendations are still on screen (not promoted,
  // not explicitly ignored), emit a best-effort "ignore" event for each
  // unacted key via sendBeacon so the catalog calibration job can tell
  // "admin saw this and walked away" apart from "admin has not loaded
  // this page yet." We capture the current visible list in a ref so the
  // cleanup closure reads the latest snapshot at unmount time.
  //
  // Dedup (Phase 4 pt.2): React Strict Mode double-mounts and tab
  // switches would otherwise fire multiple passive-ignore events per
  // (specialistId, fieldKey). `beaconedRef` holds a Set of
  // `${fieldKey}:ignore-passive` keys we've already fired this mount
  // session; it resets on `specialistId` change.
  const visibleRef = useRef<string[]>([]);
  visibleRef.current = recommendations;
  const beaconedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    beaconedRef.current = new Set();
    return () => {
      const keys = visibleRef.current;
      if (keys.length === 0) return;
      const url = `/api/admin/specialists/${specialistId}/recommendation-event`;
      for (const key of keys) {
        const dedupKey = `${key}:ignore-passive`;
        if (beaconedRef.current.has(dedupKey)) continue;
        beaconedRef.current.add(dedupKey);
        try {
          const blob = new Blob(
            [JSON.stringify({ fieldKey: key, action: "ignore", passive: true })],
            { type: "application/json" },
          );
          // sendBeacon returns false if the UA refused to queue the
          // request (payload too large, disabled, etc). Warn loudly so
          // an in-prod failure mode doesn't silently nuke the
          // calibration signal. A 401 from the server (expiring
          // session) will still surface server-side in the activity
          // log; there's no response body we can read from beacon.
          const queued = navigator.sendBeacon?.(url, blob) ?? false;
          if (!queued) {
            // eslint-disable-next-line no-console
            console.warn(
              `[specialist-telemetry] passive-ignore beacon not queued for ${specialistId}/${key}`,
            );
          }
        } catch {
          /* best-effort — telemetry only */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialistId]);

  const promoteMutation = useMutation({
    mutationFn: async ({ key, level }: { key: string; level: "recommended" | "hard" }) => {
      const next = { ...fieldState, [key]: level };
      const res = await apiRequest("PUT", `/api/admin/specialists/${specialistId}/field-toggles`, {
        fieldRequirements: next,
        changeSummary: `Promoted ${key} to ${level} from last-run recommendation`,
      });
      // Telemetry sibling-write (Phase 4): record the promote event in the
      // append-only events table so the catalog calibration job can later
      // read promote-vs-ignore ratios. Best-effort: a telemetry failure
      // does not roll back the toggle change above (the toggle is the
      // user's intent; the event is just signal for catalog tuning).
      apiRequest("POST", `/api/admin/specialists/${specialistId}/recommendation-event`, {
        fieldKey: key,
        action: level === "hard" ? "promote-hard" : "promote-recommended",
      }).catch(() => { /* swallow — telemetry only */ });
      return { json: await res.json(), key, level };
    },
    onMutate: ({ key }) => setPendingKey(key),
    onSuccess: ({ key, level }) => {
      setFieldState((s) => ({ ...s, [key]: level }));
      toast({ title: `Promoted ${labelByKey.get(key)?.label ?? key} to ${level === "hard" ? "Hard-required" : "Recommended"}` });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}`] });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/audit`] });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/recommendation-stats`] });
      qc.invalidateQueries({ queryKey: ["/api/admin/specialists"] });
    },
    onError: (e: unknown) =>
      toast({ title: "Promote failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
    onSettled: () => setPendingKey(null),
  });

  // `ignoredKeys` was moved to the top of this component so the
  // `recommendations` filter and the passive-ignore useEffect can read
  // it without hitting the TDZ.
  const ignoreMutation = useMutation({
    mutationFn: async ({ key }: { key: string }) => {
      await apiRequest("POST", `/api/admin/specialists/${specialistId}/recommendation-event`, {
        fieldKey: key,
        action: "ignore",
      });
      return { key };
    },
    onMutate: ({ key }) => setPendingKey(key),
    onSuccess: ({ key }) => {
      setIgnoredKeys((s) => new Set(s).add(key));
      toast({ title: `Ignored ${labelByKey.get(key)?.label ?? key}` });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/recommendation-stats`] });
    },
    onError: (e: unknown) =>
      toast({ title: "Ignore failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
    onSettled: () => setPendingKey(null),
  });

  // Promote-vs-ignore stats per field — informs the admin which candidates
  // are mostly noise (high ignore-ratio) without leaving the page.
  const { data: stats } = useQuery<
    Array<{ fieldKey: string; promoteRecommended: number; promoteHard: number; ignore: number }>
  >({ queryKey: [`/api/admin/specialists/${specialistId}/recommendation-stats`] });
  const statsByKey = useMemo(() => {
    const m = new Map<string, { promoteRecommended: number; promoteHard: number; ignore: number }>();
    for (const s of stats ?? []) m.set(s.fieldKey, s);
    return m;
  }, [stats]);

  const lastRunLabel = config.lastObservedMissingAt
    ? new Date(config.lastObservedMissingAt).toLocaleString()
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommendations from last run</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {lastRunLabel && (
          <p className="text-xs text-muted-foreground" data-testid="text-last-run-time">
            Last run: {lastRunLabel}
          </p>
        )}
        {recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground italic" data-testid="empty-recommendations">
            No recommendations yet. After this Specialist runs, any fields it observed as
            "missing but materially useful" will appear here so you can promote them to
            Recommended or Hard-required.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              The last run flagged these candidate fields as missing-but-useful. Promote
              one to surface it on the user-facing nudge ("Recommended") or to gate the
              Specialist's run until it's filled in ("Hard-required").
            </p>
            <div className="border rounded-md divide-y">
              {recommendations.map((key) => {
                const meta = labelByKey.get(key)!;
                const isThisRowPending = pendingKey === key && promoteMutation.isPending;
                const isAnyPending = promoteMutation.isPending;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between px-3 py-2 text-sm gap-3"
                    data-testid={`recommendation-row-${key}`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{meta.label}</div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {key} · {meta.surface}
                      </div>
                      {(() => {
                        const s = statsByKey.get(key);
                        if (!s) return null;
                        const total = s.promoteRecommended + s.promoteHard + s.ignore;
                        if (total === 0) return null;
                        return (
                          <div
                            className="text-xs text-muted-foreground mt-1"
                            data-testid={`stats-${key}`}
                          >
                            promoted {s.promoteRecommended + s.promoteHard} · ignored {s.ignore}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isAnyPending || ignoreMutation.isPending}
                        onClick={() => ignoreMutation.mutate({ key })}
                        data-testid={`button-ignore-${key}`}
                      >
                        {pendingKey === key && ignoreMutation.isPending ? "Ignoring…" : "Ignore"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isAnyPending || ignoreMutation.isPending}
                        onClick={() => promoteMutation.mutate({ key, level: "recommended" })}
                        data-testid={`button-promote-recommended-${key}`}
                      >
                        {isThisRowPending ? "Promoting…" : "Promote to Recommended"}
                      </Button>
                      <Button
                        size="sm"
                        disabled={isAnyPending || ignoreMutation.isPending}
                        onClick={() => promoteMutation.mutate({ key, level: "hard" })}
                        data-testid={`button-promote-hard-${key}`}
                      >
                        {isThisRowPending ? "Promoting…" : "Promote to Hard-required"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
