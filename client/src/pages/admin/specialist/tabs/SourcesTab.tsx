/**
 * SourcesTab — admin-editable connected-sources surface for a Specialist
 * (and for The Analyst / Gaspar via the same component). Cards are grouped
 * into the four canonical Sources groups with per-card health lights and
 * per-card Test buttons that update the dot in place. The bulk
 * "Test sources" button fans out across the visible cards with per-card
 * spinners and per-card live results.
 *
 * Doctrine note: this tab reads from `resource_specialist_connections`,
 * which is the canonical, editable source of truth for source ↔ specialist
 * wiring (seeded once from the catalog at migration time). The catalog
 * (`specialist_assignments`) is consulted only to badge a card's catalog
 * provenance — it never adds cards to the displayed set, so removing a
 * link in the Resources editor disappears here immediately on save.
 * Runtime/engine paths read catalog assignments separately as needed.
 *
 * Status contract (Sources tab only): green / red / gray. Stale data is
 * rolled into red — there is no amber bucket here. The per-resource
 * health endpoint may still return amber elsewhere; for this view both
 * the server route and the local mapping collapse it to red.
 */
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  ANALYST_CONNECTION_TARGET,
  SOURCE_GROUP_LABELS,
  SOURCE_GROUPS,
  type ResourceHealthStatus,
  type SourceGroup,
} from "@shared/schema";
import { ORCHESTRATOR_SPECIALIST_ID } from "@engine/analyst/identity";

type DotStatus = "green" | "red" | "gray";

interface CardView {
  resource: { id: number; slug: string; displayName: string; description: string | null; kind: string };
  group: SourceGroup;
  health: {
    status: ResourceHealthStatus;
    lastChecked: string | null;
    /** Raw probe outcome from the last test (ok/fail/skipped) — distinguishes
     *  stale vs failing when the dot was collapsed to red. */
    lastStatus: "ok" | "fail" | "skipped" | null;
    lastErrorCode: string | null;
  };
  fromCatalog: boolean;
  fromAdminConnection: boolean;
}
interface GroupView {
  group: SourceGroup;
  label: string;
  cards: CardView[];
}
interface SourcesResponse {
  target: string;
  groups: GroupView[];
}

interface TestProbeResult {
  status: "ok" | "fail" | "skipped";
  latencyMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  checkedAt: string;
}

interface CardTestState {
  pending: boolean;
  /** Last live result this session, used to override the server-derived dot. */
  result?: {
    status: DotStatus;
    lastChecked: string;
    errorCode: string | null;
    /** Why the dot is what it is — used by the tooltip to distinguish
     *  "Failing" (probe returned fail) from "Stale" (probe was OK but data is past TTL). */
    reason: "ok" | "fail" | "stale" | "skipped";
  };
}

const STATUS_DOT: Record<DotStatus, string> = {
  green: "bg-emerald-500",
  red: "bg-rose-500",
  gray: "bg-slate-400",
};
const STATUS_LABEL: Record<DotStatus, string> = {
  green: "Healthy",
  red: "Failing",
  gray: "Not yet probed",
};

/** Tooltip wording given the dot color + the underlying probe-result reason. */
function statusLabelFor(dot: DotStatus, reason: "ok" | "fail" | "stale" | "skipped" | null): string {
  if (dot === "green") return "Healthy";
  if (dot === "gray") return "Not yet probed";
  // dot === "red"
  if (reason === "stale") return "Stale (last check exceeded freshness window)";
  if (reason === "skipped") return "Skipped (rate limited)";
  return "Failing";
}

function toDotStatus(s: ResourceHealthStatus): DotStatus {
  // Sources tab contract: stale rolls into red, never amber.
  if (s === "green") return "green";
  if (s === "gray") return "gray";
  return "red";
}

function probeToDot(p: TestProbeResult["status"]): DotStatus {
  if (p === "ok") return "green";
  if (p === "fail") return "red";
  // "skipped" (rate-limited) leaves the dot unchanged in spirit; map to gray
  // so the user sees something happened, but we treat it neutrally.
  return "gray";
}

/**
 * Single specialistId param. Pass `ORCHESTRATOR_SPECIALIST_ID` ("gaspar")
 * to render The Analyst's view — the backend resolves that to the
 * `analyst` connection target automatically.
 */
export function SourcesTab({ specialistId }: { specialistId: string }) {
  const isAnalyst = specialistId === ORCHESTRATOR_SPECIALIST_ID;
  const endpoint = isAnalyst
    ? "/api/admin/analyst/sources"
    : `/api/admin/specialists/${specialistId}/sources`;

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError, error } = useQuery<SourcesResponse>({
    queryKey: [endpoint],
  });

  // Per-card live test state, keyed by resourceId. Bulk and per-card runs
  // both write into this map so cards animate independently.
  const [cardState, setCardState] = useState<Record<number, CardTestState>>({});

  const setPending = useCallback((id: number, pending: boolean) => {
    setCardState((prev) => ({ ...prev, [id]: { ...prev[id], pending } }));
  }, []);
  const setResult = useCallback((id: number, result: CardTestState["result"]) => {
    setCardState((prev) => ({ ...prev, [id]: { pending: false, result } }));
  }, []);

  const runTestForCard = useCallback(
    async (
      resourceId: number,
      displayName: string,
      currentDot: DotStatus,
    ): Promise<TestProbeResult> => {
      setPending(resourceId, true);
      try {
        const res = await apiRequest("POST", `/api/admin/resources/${resourceId}/test`);
        const result = (await res.json()) as TestProbeResult;
        if (result.status === "skipped") {
          // Server-side rate-limited / throttled: preserve the prior dot
          // colour but record the skipped reason so the tooltip explains
          // why nothing actually changed.
          setResult(resourceId, {
            status: currentDot,
            lastChecked: result.checkedAt,
            errorCode: result.errorCode ?? "rate_limited",
            reason: "skipped",
          });
        } else {
          setResult(resourceId, {
            status: probeToDot(result.status),
            lastChecked: result.checkedAt,
            errorCode: result.errorCode,
            reason: result.status === "ok" ? "ok" : "fail",
          });
        }
        // Keep the resources-area health caches in sync as well.
        queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/${resourceId}/health`] });
        queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/${resourceId}/health/history`] });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Test failed";
        const rateLimited = msg.startsWith("429");
        if (rateLimited) {
          // 429 from the API gateway: same semantics as a server-emitted
          // skipped — preserve dot, surface as skipped in tooltip + summary.
          setResult(resourceId, {
            status: currentDot,
            lastChecked: new Date().toISOString(),
            errorCode: "rate_limited",
            reason: "skipped",
          });
          toast({
            title: `${displayName}: rate limited — try again in a minute`,
            description: msg,
          });
          return {
            status: "skipped",
            latencyMs: 0,
            errorCode: "rate_limited",
            errorMessage: msg,
            checkedAt: new Date().toISOString(),
          };
        }
        setResult(resourceId, {
          status: "red",
          lastChecked: new Date().toISOString(),
          errorCode: "client_error",
          reason: "fail",
        });
        toast({
          title: `${displayName}: test failed`,
          description: msg,
          variant: "destructive",
        });
        return {
          status: "fail",
          latencyMs: 0,
          errorCode: "client_error",
          errorMessage: msg,
          checkedAt: new Date().toISOString(),
        };
      }
    },
    [queryClient, setPending, setResult, toast],
  );

  const allCards = useMemo<CardView[]>(
    () => (data?.groups ?? []).flatMap((g) => g.cards),
    [data],
  );

  // Canonical bulk path: hit the server's /sources/test-all endpoint so
  // there is one authoritative bulk-test code path (rate-limit handling,
  // activity logging, telemetry all live server-side). Per-card spinners
  // light up together when the request starts and clear together when the
  // response arrives — we still update each card's dot/reason individually
  // from the server's per-resource result rows.
  const bulkEndpoint = isAnalyst
    ? "/api/admin/analyst/sources/test-all"
    : `/api/admin/specialists/${specialistId}/sources/test-all`;

  interface BulkTestRow {
    id: number;
    status: "ok" | "fail" | "skipped";
    latencyMs?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    checkedAt?: string;
  }

  const bulkTest = useMutation({
    mutationFn: async () => {
      const ids = allCards.map((c) => c.resource.id);
      // Snapshot current dot per card so we can preserve it on skipped rows.
      const priorDots = new Map<number, DotStatus>(
        allCards.map((c) => [c.resource.id, toDotStatus(c.health.status)]),
      );
      setCardState((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = { ...next[id], pending: true };
        return next;
      });
      const res = await apiRequest("POST", bulkEndpoint);
      const body = (await res.json()) as { target: string; results: BulkTestRow[] };
      return { results: body.results, priorDots };
    },
    onSuccess: ({ results, priorDots }) => {
      const now = new Date().toISOString();
      // Apply each row to its card's local state so dots/reasons update in
      // place without waiting for a refetch round-trip.
      for (const row of results) {
        const checkedAt = row.checkedAt ?? now;
        if (row.status === "skipped") {
          setResult(row.id, {
            status: priorDots.get(row.id) ?? "gray",
            lastChecked: checkedAt,
            errorCode: row.errorCode ?? "rate_limited",
            reason: "skipped",
          });
        } else {
          setResult(row.id, {
            status: probeToDot(row.status),
            lastChecked: checkedAt,
            errorCode: row.errorCode ?? null,
            reason: row.status === "ok" ? "ok" : "fail",
          });
        }
        // Keep resources-area health caches in sync as well.
        queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/${row.id}/health`] });
        queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/${row.id}/health/history`] });
      }
      // Clear pending on any card the server skipped over (defensive).
      setCardState((prev) => {
        const next = { ...prev };
        const seen = new Set(results.map((r) => r.id));
        for (const id of Object.keys(next)) {
          const nid = Number(id);
          if (!seen.has(nid) && next[nid]?.pending) {
            next[nid] = { ...next[nid], pending: false };
          }
        }
        return next;
      });
      const ok = results.filter((r) => r.status === "ok").length;
      const fail = results.filter((r) => r.status === "fail").length;
      const skipped = results.filter((r) => r.status === "skipped").length;
      toast({
        title: `Tested ${results.length} source${results.length === 1 ? "" : "s"}`,
        description: `${ok} healthy · ${fail} failing · ${skipped} skipped (rate-limited)`,
      });
      queryClient.invalidateQueries({ queryKey: [endpoint] });
    },
    onError: (err: unknown) => {
      // Clear all pending spinners on a hard failure so cards aren't stuck.
      setCardState((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          const nid = Number(id);
          if (next[nid]?.pending) next[nid] = { ...next[nid], pending: false };
        }
        return next;
      });
      toast({
        title: "Test sources failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card data-testid="sources-tab-loading">
        <CardContent className="py-8 text-sm text-muted-foreground">Loading sources…</CardContent>
      </Card>
    );
  }
  if (isError) {
    return (
      <Card data-testid="sources-tab-error">
        <CardContent className="py-8 text-sm text-rose-600">
          Failed to load sources: {error instanceof Error ? error.message : "Unknown error"}
        </CardContent>
      </Card>
    );
  }

  const groups =
    data?.groups ?? SOURCE_GROUPS.map((g) => ({ group: g, label: SOURCE_GROUP_LABELS[g], cards: [] }));
  const totalCards = allCards.length;

  return (
    <div className="space-y-4" data-testid={`sources-tab-${specialistId}`}>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle data-testid="sources-tab-title">Connected sources</CardTitle>
              <CardDescription>
                {isAnalyst
                  ? "Every source The Analyst draws on. Edit connections from the Resources area."
                  : "Sources this Specialist is connected to. The set is editable from the Resources area; saves are reflected here immediately."}
              </CardDescription>
            </div>
            <Button
              data-testid="button-test-all-sources"
              variant="outline"
              disabled={totalCards === 0 || bulkTest.isPending}
              onClick={() => bulkTest.mutate()}
            >
              {bulkTest.isPending ? "Testing…" : `Test sources (${totalCards})`}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {groups.map((group) => (
            <section
              key={group.group}
              data-testid={`sources-group-${group.group}`}
              className="space-y-3"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h3>
                <Badge variant="outline" data-testid={`sources-group-count-${group.group}`}>
                  {group.cards.length}
                </Badge>
              </div>
              {group.cards.length === 0 ? (
                <p
                  className="text-sm text-muted-foreground italic"
                  data-testid={`sources-group-empty-${group.group}`}
                >
                  No {group.label.toLowerCase()} connected.
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.cards.map((card) => {
                    const live = cardState[card.resource.id];
                    const dot: DotStatus = live?.result?.status ?? toDotStatus(card.health.status);
                    const lastChecked = live?.result?.lastChecked ?? card.health.lastChecked;
                    const errorCode = live?.result?.errorCode ?? card.health.lastErrorCode;
                    // Reason for the dot: prefer the live test, otherwise infer
                    // from the server-derived state. If the dot is red but the
                    // last *probe* was OK, it must be stale.
                    let reason: "ok" | "fail" | "stale" | "skipped" | null = live?.result?.reason ?? null;
                    if (!reason) {
                      if (dot === "green") reason = "ok";
                      else if (dot === "red") {
                        if (card.health.lastStatus === "ok") reason = "stale";
                        else if (card.health.lastStatus === "skipped") reason = "skipped";
                        else reason = "fail";
                      }
                    }
                    return (
                      <SourceCard
                        key={card.resource.id}
                        card={card}
                        dot={dot}
                        reason={reason}
                        lastChecked={lastChecked}
                        errorCode={errorCode}
                        pending={!!live?.pending}
                        onTest={() => runTestForCard(card.resource.id, card.resource.displayName, dot)}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SourceCard({
  card,
  dot,
  reason,
  lastChecked,
  errorCode,
  pending,
  onTest,
}: {
  card: CardView;
  dot: DotStatus;
  reason: "ok" | "fail" | "stale" | "skipped" | null;
  lastChecked: string | null;
  errorCode: string | null;
  pending: boolean;
  onTest: () => void;
}) {
  const tooltip =
    `${statusLabelFor(dot, reason)}` +
    (errorCode ? ` — ${errorCode}` : "") +
    (lastChecked
      ? ` · checked ${new Date(lastChecked).toLocaleString()}`
      : " · never checked");
  return (
    <div
      data-testid={`source-card-${card.resource.id}`}
      className="rounded-lg border border-border bg-card p-3 space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              data-testid={`source-card-status-${card.resource.id}`}
              data-status={dot}
              data-pending={pending ? "true" : "false"}
              title={tooltip}
              aria-label={tooltip}
              className={cn(
                "inline-block w-2.5 h-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10",
                STATUS_DOT[dot],
                pending && "animate-pulse",
              )}
            />
            <span
              className="font-medium truncate"
              data-testid={`source-card-name-${card.resource.id}`}
            >
              {card.resource.displayName}
            </span>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground truncate">
            {card.resource.kind}/{card.resource.slug}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          data-testid={`button-source-test-${card.resource.id}`}
          disabled={pending}
          onClick={onTest}
        >
          {pending ? "Testing…" : "Test"}
        </Button>
      </div>
      {card.resource.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{card.resource.description}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {card.fromCatalog && (
          <Badge variant="secondary" data-testid={`source-card-catalog-${card.resource.id}`}>
            Catalog
          </Badge>
        )}
        {card.fromAdminConnection && (
          <Badge variant="outline" data-testid={`source-card-admin-${card.resource.id}`}>
            Admin link
          </Badge>
        )}
      </div>
    </div>
  );
}

export default SourcesTab;

// Re-exported for parity with the other tab modules' default export style.
export const __ANALYST_TARGET = ANALYST_CONNECTION_TARGET;
