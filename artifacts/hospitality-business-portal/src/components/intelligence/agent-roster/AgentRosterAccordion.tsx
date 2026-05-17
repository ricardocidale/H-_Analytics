/**
 * AgentRosterAccordion — shared collapsible-pill roster used by the
 * three Agent Roster pages (Agents / Specialists / Minions). Task #1389.
 *
 * Each row is a compact pill. Clicking it expands into a card showing:
 * full description, where-used list, probe status, and an Analyst button.
 *
 * Probe behavior follows `analyst-research-buttons` (loading state, toast
 * on error, no silent failures). Badge rendering follows
 * `analyst-intelligence-display`.
 *
 * Probe endpoints (Phase 2 routing — uses entityCode from RosterEntry):
 *   orch.gustavo              → POST /api/admin/intelligence/orch.gustavo/probe
 *   agent.iris                → GET  /api/admin/iris/status (200 = healthy)
 *   agent.rebecca             → GET  /api/rebecca/kb/stats (200 = healthy)
 *   spec.<letter>             → POST /api/admin/specialists/:backendId/probe
 *   minion.<id>               → POST /api/admin/minions/:id/self-test
 */

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AnalystActionButton } from "@/components/analyst/AnalystActionButton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import type {
  MinionSelfTestHistoryItem,
  RosterClass,
  RosterEntry,
  RosterHealth,
  RosterHealthResponse,
} from "@/lib/agent-roster";

interface ProbeOutcome {
  status: Exclude<RosterHealth, "unknown">;
  latencyMs: number | null;
  message?: string;
  source: string;
  checkedAt: number;
}

interface RowState {
  health: RosterHealth;
  outcome: ProbeOutcome | null;
  running: boolean;
  history: MinionSelfTestHistoryItem[];
}

const HISTORY_STRIP_MAX = 10;

const CLASS_LABEL: Record<RosterClass, string> = {
  agent: "Agent",
  specialist: "Specialist",
  minion: "Minion",
};

/**
 * Converts raw server/network error messages into plain language suitable
 * for display to a non-technical admin. Strips HTTP status codes, internal
 * error codes, and translates technical phrases using the entity's class label.
 */
function humanizeProbeMessage(message: string, entryClass: RosterClass): string {
  const label = CLASS_LABEL[entryClass];
  const cleaned = message
    .replace(/^\d{3}\s+/, "")
    .replace(/\s*\[[A-Z]{4}-\d{3,5}\]$/, "")
    .trim();
  const lower = cleaned.toLowerCase();
  if (lower.includes("not found")) {
    return `${label} isn't registered in the system — try redeploying.`;
  }
  if (lower.includes("no probe defined")) {
    return `${label} doesn't have a reachability check configured.`;
  }
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("econnrefused")) {
    return `${label} couldn't be reached — the service may be down.`;
  }
  if (lower === "probe failed" || lower === "") {
    return `${label} check failed.`;
  }
  return cleaned;
}

const HISTORY_DOT_CLASS: Record<string, string> = {
  pass: "bg-emerald-500",
  fail: "bg-destructive",
  skipped: "bg-muted-foreground/40",
};

function HistoryStrip({ items }: { items: MinionSelfTestHistoryItem[] }) {
  if (items.length === 0) return null;
  const ordered = [...items].slice(0, HISTORY_STRIP_MAX).reverse();
  return (
    <div
      className="inline-flex items-center gap-0.5"
      data-testid="minion-self-test-history-strip"
      aria-label={`${items.length} recent self-test result${items.length === 1 ? "" : "s"}`}
    >
      {ordered.map((item) => {
        const dotClass = HISTORY_DOT_CLASS[item.status] ?? "bg-muted-foreground/30";
        return (
          <span
            key={item.ranAt + ":" + item.status}
            className={`inline-block w-1.5 h-3 rounded-sm ${dotClass}`}
            title={`${item.status} · ${formatTime(Date.parse(item.ranAt))} · ${item.durationMs}ms${item.message ? `\n${item.message}` : ""}`}
          />
        );
      })}
    </div>
  );
}

const STATUS_LABEL: Record<RosterHealth, string> = {
  unknown: "Not checked",
  healthy: "Healthy",
  degraded: "Degraded",
  error: "Unreachable",
  "not-applicable": "Deterministic — no probe",
};

const STATUS_DOT_CLASS: Record<RosterHealth, string> = {
  unknown: "bg-muted-foreground/30",
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  error: "bg-destructive",
  "not-applicable": "bg-muted-foreground/40",
};

function StatusDot({ health }: { health: RosterHealth }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${STATUS_DOT_CLASS[health]}`}
      title={STATUS_LABEL[health]}
      aria-label={STATUS_LABEL[health]}
    />
  );
}

async function runProbe(entry: RosterEntry): Promise<ProbeOutcome> {
  const startedAt = performance.now();
  try {
    let res: Response;
    if (entry.class === "minion") {
      res = await apiRequest("POST", `/api/admin/minions/${encodeURIComponent(entry.id)}/self-test`);
    } else if (entry.class === "specialist") {
      res = await apiRequest("POST", `/api/admin/specialists/${encodeURIComponent(entry.id)}/probe`);
    } else if (entry.entityCode?.startsWith("orch.")) {
      // Orchestrator — class-aware intelligence entities route (Phase 2)
      res = await apiRequest("POST", `/api/admin/intelligence/${encodeURIComponent(entry.entityCode)}/probe`);
    } else if (entry.entityCode === "agent.iris") {
      res = await apiRequest("GET", "/api/admin/iris/status");
    } else if (entry.entityCode === "agent.rebecca") {
      res = await apiRequest("GET", "/api/rebecca/kb/stats");
    } else {
      throw new Error(`No probe defined for ${entry.class} · ${entry.entityCode ?? entry.id}`);
    }

    const latencyMs = Math.round(performance.now() - startedAt);

    if (entry.class === "minion") {
      const body = (await res.json()) as {
        status?: "pass" | "fail" | "skipped";
        message?: string;
        durationMs?: number;
      };
      const verdictStatus: ProbeOutcome["status"] =
        body.status === "pass" ? "healthy"
        : body.status === "skipped" ? "degraded"
        : "error";
      return {
        status: verdictStatus,
        latencyMs: typeof body.durationMs === "number" ? body.durationMs : latencyMs,
        message: body.message,
        source: "self-test",
        checkedAt: Date.now(),
      };
    }

    let degradedReason: string | undefined;
    try {
      const body = (await res.json()) as { steps?: Array<{ status: string; name: string; message: string }> };
      const failed = body?.steps?.find((s) => s.status === "fail");
      if (failed) degradedReason = `${failed.name}: ${failed.message}`;
    } catch { /* non-specialist endpoint, no steps */ }

    return {
      status: degradedReason ? "degraded" : "healthy",
      latencyMs,
      message: degradedReason,
      source: "manual probe",
      checkedAt: Date.now(),
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startedAt);
    const message = err instanceof ApiError
      ? `${err.status} ${err.message}`.trim()
      : err instanceof Error ? err.message : "Probe failed";
    return {
      status: "error",
      latencyMs,
      message,
      source: "manual probe",
      checkedAt: Date.now(),
    };
  }
}

function formatTime(ts: number): string {
  return new Intl.DateTimeFormat("en", { timeStyle: "short", dateStyle: "short" }).format(new Date(ts));
}

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

interface RosterRowProps {
  entry: RosterEntry;
  state: RowState;
  onProbe: (entry: RosterEntry) => void;
}

function RosterRow({ entry, state, onProbe }: RosterRowProps) {
  const [open, setOpen] = useState(false);
  const probeApplies = entry.initialHealth !== "not-applicable";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {/* ── Row trigger (matches Knowledge Registry AssetPanel style) ── */}
      <CollapsibleTrigger asChild>
        <button
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
          data-testid={`roster-row-trigger-${entry.id}`}
          aria-expanded={open}
        >
          {open
            ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          }

          <StatusDot health={state.health} />

          <span className="font-medium text-sm text-foreground shrink-0">
            {entry.humanName}
          </span>

          <span className="text-muted-foreground/50 text-xs shrink-0">·</span>

          <span className="text-[11px] text-muted-foreground shrink-0">
            {entry.role}
          </span>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            {!open && (
              <span className="hidden md:block text-xs text-muted-foreground/60 truncate max-w-48">
                {entry.description}
              </span>
            )}

            {entry.class === "minion" && state.history.length > 0 && !open && (
              <span className="flex items-center gap-1.5">
                <HistoryStrip items={state.history} />
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                  {formatRelative(state.history[0]?.ranAt ?? null)}
                </span>
              </span>
            )}
          </div>
        </button>
      </CollapsibleTrigger>

      {/* ── Expanded content ─────────────────────────────────────────── */}
      <CollapsibleContent>
        <div className="px-4 pb-4 pt-3 border-t space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {entry.description}
          </p>

          {entry.whereUsed.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-foreground/60 mb-1.5">
                Where used
              </p>
              <div className="flex flex-wrap gap-1.5">
                {entry.whereUsed.map((w) => (
                  <Badge key={w} variant="secondary" className="text-xs">
                    {w}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {entry.class === "minion" && state.history.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-foreground/60">
                Recent runs
              </span>
              <HistoryStrip items={state.history} />
              <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                {formatRelative(state.history[0]?.ranAt ?? null)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 flex-wrap pt-1">
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>
                Status:{" "}
                <span className="font-medium text-foreground">
                  {STATUS_LABEL[state.health]}
                </span>
              </p>
              {state.outcome && (
                <p className="font-mono tabular-nums">
                  {state.outcome.source} ·{" "}
                  {formatTime(state.outcome.checkedAt)}
                  {state.outcome.latencyMs !== null && ` · ${state.outcome.latencyMs}ms`}
                </p>
              )}
              {state.outcome?.message && (
                <p
                  className={
                    state.outcome.status === "error"
                      ? "text-destructive"
                      : "text-amber-600"
                  }
                  data-testid={`roster-row-message-${entry.id}`}
                >
                  {humanizeProbeMessage(state.outcome.message, entry.class)}
                </p>
              )}
            </div>

            {probeApplies ? (
              <AnalystActionButton
                onClick={() => onProbe(entry)}
                running={state.running}
                testIdSuffix={`roster-${entry.id.replace(/\./g, "-")}`}
                tooltipText={
                  entry.class === "minion"
                    ? `Run the ${entry.humanName} self-test against a known fixture.`
                    : `Run a live responsiveness check against ${entry.humanName}.`
                }
              />
            ) : (
              <span className="text-xs text-muted-foreground italic">
                Deterministic minion — no probe applies.
              </span>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface AgentRosterAccordionProps {
  title: string;
  entries: RosterEntry[];
  testId: string;
  schedulerKey?: "costantino" | "minion-self-tests";
}

export function AgentRosterAccordion({
  title,
  entries,
  testId,
  schedulerKey = "costantino",
}: AgentRosterAccordionProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const e of entries) {
      init[e.id] = { health: e.initialHealth, outcome: null, running: false, history: [] };
    }
    return init;
  });

  const { data: healthData } = useQuery<RosterHealthResponse>({
    queryKey: ["/api/admin/agent-roster/health"],
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!healthData?.entries) return;
    setRows((prev) => {
      const next = { ...prev };
      for (const entry of entries) {
        if (entry.initialHealth === "not-applicable") continue;
        const signal = healthData.entries[entry.id];
        if (!signal || signal.status === "unknown") continue;
        const signalStatus: Exclude<RosterHealth, "unknown" | "not-applicable"> = signal.status;
        const existing = next[entry.id]?.outcome;
        const signalTs = signal.checkedAt ? Date.parse(signal.checkedAt) : 0;
        if (existing && existing.checkedAt > signalTs) continue;
        next[entry.id] = {
          health: signalStatus,
          outcome: {
            status: signalStatus,
            latencyMs: null,
            message: signal.message,
            source: signal.source,
            checkedAt: signalTs || Date.parse(healthData.generatedAt),
          },
          running: next[entry.id]?.running ?? false,
          history: next[entry.id]?.history ?? [],
        };
      }
      const serverHistory = healthData.minionHistory ?? {};
      for (const entry of entries) {
        if (entry.class !== "minion") continue;
        const fromServer = serverHistory[entry.id] ?? [];
        const local = next[entry.id]?.history ?? [];
        const seen = new Set(fromServer.map((h) => h.ranAt));
        const merged = [...local.filter((h) => !seen.has(h.ranAt)), ...fromServer]
          .sort((a, b) => Date.parse(b.ranAt) - Date.parse(a.ranAt))
          .slice(0, HISTORY_STRIP_MAX);
        next[entry.id] = {
          ...(next[entry.id] ?? {
            health: entry.initialHealth,
            outcome: null,
            running: false,
            history: [],
          }),
          history: merged,
        };
      }
      return next;
    });
  }, [healthData, entries]);

  const handleProbe = useCallback(
    async (entry: RosterEntry) => {
      setRows((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], running: true } }));
      try {
        const outcome = await runProbe(entry);
        setRows((prev) => {
          const prevRow = prev[entry.id];
          let history = prevRow?.history ?? [];
          if (entry.class === "minion") {
            const verdictStatus =
              outcome.status === "healthy" ? "pass"
              : outcome.status === "degraded" ? "skipped"
              : "fail";
            const fresh: MinionSelfTestHistoryItem = {
              status: verdictStatus,
              durationMs: outcome.latencyMs ?? 0,
              message: outcome.message ?? null,
              ranAt: new Date(outcome.checkedAt).toISOString(),
            };
            history = [fresh, ...history].slice(0, HISTORY_STRIP_MAX);
          }
          return {
            ...prev,
            [entry.id]: { health: outcome.status, outcome, running: false, history },
          };
        });
        if (outcome.status === "error") {
          toast({
            variant: "destructive",
            title: `${entry.humanName} check failed`,
            description: outcome.message
              ? humanizeProbeMessage(outcome.message, entry.class)
              : `${CLASS_LABEL[entry.class]} did not respond.`,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Probe failed";
        setRows((prev) => ({
          ...prev,
          [entry.id]: {
            health: "error",
            outcome: {
              status: "error",
              latencyMs: null,
              message,
              source: "manual probe",
              checkedAt: Date.now(),
            },
            running: false,
            history: prev[entry.id]?.history ?? [],
          },
        }));
        toast({
          variant: "destructive",
          title: `${entry.humanName} check failed`,
          description: humanizeProbeMessage(message, entry.class),
        });
      }
    },
    [toast],
  );

  const cycle =
    schedulerKey === "minion-self-tests"
      ? healthData?.minionSelfTestCycle
      : healthData?.costantinoCycle;
  const cycleStatusColor =
    cycle?.status === "error" ? "text-destructive"
    : cycle?.status === "warn" ? "text-amber-600"
    : "text-muted-foreground";
  const cycleLabel =
    schedulerKey === "minion-self-tests" ? "Self-tests last ran" : "Costantino audited";
  const cycleSummary =
    schedulerKey === "minion-self-tests"
      ? cycle && cycle.lastRunAt !== null
        ? ` · ${cycle.succeeded} pass / ${cycle.failed} fail`
        : ""
      : cycle && cycle.lastRunAt !== null
        ? ` · ${cycle.succeeded} ok / ${cycle.failed} failed`
        : "";
  const cycleTestId =
    schedulerKey === "minion-self-tests"
      ? "roster-minion-self-test-cycle"
      : "roster-costantino-cycle";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="font-display text-base">{title}</CardTitle>
          {cycle && (
            <p
              className={`text-[11px] font-mono tabular-nums ${cycleStatusColor}`}
              data-testid={cycleTestId}
              title={cycle.notes ?? undefined}
            >
              {cycleLabel} {formatRelative(cycle.lastRunAt)}
              {cycleSummary}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0 pt-0">
        <div className="divide-y divide-border/40" data-testid={testId}>
          {entries.map((entry) => (
            <RosterRow
              key={entry.id}
              entry={entry}
              state={
                rows[entry.id] ?? {
                  health: entry.initialHealth,
                  outcome: null,
                  running: false,
                  history: [],
                }
              }
              onProbe={handleProbe}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
