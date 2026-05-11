/**
 * AgentRosterAccordion — shared single-column accordion list used by the
 * three Agent Roster pages (Agents / Specialists / Minions). Task #1389.
 *
 * Each row shows: status icon · human name · role · brief description.
 * Expanding reveals: full description, where-used list, and an Analyst
 * action button that runs a lightweight liveness probe against the
 * specific entity. Probe behavior follows `analyst-research-buttons`
 * (loading state, toast on error, no silent failures); the badge
 * rendering follows `analyst-intelligence-display`.
 *
 * Initial status comes from the bulk health endpoint, which reads the
 * most recent already-tracked signal for each entity (specialist
 * resource health, Iris last-run, Rebecca KB stats). The Analyst button
 * then re-runs an on-demand probe per class:
 *
 *   agent · gaspar (Gustavo)  → POST /api/admin/specialists/gaspar/probe
 *   agent · iris              → GET  /api/admin/iris/status (200 = healthy)
 *   agent · rebecca           → GET  /api/rebecca/kb/stats (200 = healthy)
 *   specialist · :id          → POST /api/admin/specialists/:id/probe
 *   minion · :id              → not-applicable (no probe)
 */

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AnalystActionButton } from "@/components/analyst/AnalystActionButton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, ApiError } from "@/lib/queryClient";
import type {
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
  // All admin write methods require the CSRF token cookie/header pair —
  // route every probe through `apiRequest` so the helper handles it.
  // `apiRequest` throws `ApiError` on non-2xx; catch it to render a
  // structured error outcome instead of letting it bubble.
  try {
    let res: Response;
    if (entry.class === "specialist" || (entry.class === "agent" && entry.id !== "rebecca" && entry.id !== "iris")) {
      // Specialists and Gustavo share the same admin probe endpoint.
      res = await apiRequest("POST", `/api/admin/specialists/${encodeURIComponent(entry.id)}/probe`);
    } else if (entry.id === "iris") {
      res = await apiRequest("GET", "/api/admin/iris/status");
    } else if (entry.id === "rebecca") {
      res = await apiRequest("GET", "/api/rebecca/kb/stats");
    } else {
      throw new Error(`No probe defined for ${entry.class} · ${entry.id}`);
    }

    const latencyMs = Math.round(performance.now() - startedAt);
    // For the specialist probe endpoint we get a `steps[]` payload — any
    // failed step degrades the overall result so admins see something more
    // honest than a blanket green.
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

interface RosterRowProps {
  entry: RosterEntry;
  state: RowState;
  onProbe: (entry: RosterEntry) => void;
}

function RosterRow({ entry, state, onProbe }: RosterRowProps) {
  const probeApplies = entry.initialHealth !== "not-applicable";

  return (
    <AccordionItem value={entry.id} className="border-border/60">
      <AccordionTrigger
        className="hover:no-underline px-4 py-3 [&>svg]:hidden"
        data-testid={`roster-row-trigger-${entry.id}`}
      >
        <div className="flex items-center gap-3 w-full min-w-0">
          <StatusDot health={state.health} />
          <span className="flex flex-col min-w-0 leading-tight text-left">
            <span
              className="truncate font-medium text-sm text-foreground"
              data-testid={`roster-row-name-${entry.id}`}
            >
              {entry.humanName}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">{entry.role}</span>
          </span>
          <span className="hidden sm:block text-xs text-muted-foreground truncate flex-1 text-left">
            {entry.description}
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground leading-relaxed">{entry.description}</p>

          {entry.whereUsed.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-foreground/70 mb-1.5">
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

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>
                Status:{" "}
                <span className="font-medium text-foreground">{STATUS_LABEL[state.health]}</span>
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
                  className={state.outcome.status === "error" ? "text-destructive" : "text-amber-600"}
                  data-testid={`roster-row-message-${entry.id}`}
                >
                  {state.outcome.message}
                </p>
              )}
            </div>
            {probeApplies ? (
              <AnalystActionButton
                onClick={() => onProbe(entry)}
                running={state.running}
                testIdSuffix={`roster-${entry.id.replace(/\./g, "-")}`}
                tooltipText={`Run a live responsiveness check against ${entry.humanName}.`}
              />
            ) : (
              <span className="text-xs text-muted-foreground italic">
                Deterministic helper — no probe applies.
              </span>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

interface AgentRosterAccordionProps {
  title: string;
  entries: RosterEntry[];
  testId: string;
}

export function AgentRosterAccordion({ title, entries, testId }: AgentRosterAccordionProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const e of entries) {
      init[e.id] = { health: e.initialHealth, outcome: null, running: false };
    }
    return init;
  });

  // Read the most recent already-tracked health signal for each entity
  // (specialist assignments × resource health, Iris last-run, Rebecca KB).
  // Manual `Analyst` button presses still run live probes per class.
  const { data: healthData } = useQuery<RosterHealthResponse>({
    queryKey: ["/api/admin/agent-roster/health"],
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
        // Don't overwrite a freshly-run manual probe if the user already
        // pressed the button — prefer the more recent timestamp.
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
        setRows((prev) => ({
          ...prev,
          [entry.id]: { health: outcome.status, outcome, running: false },
        }));
        if (outcome.status === "error") {
          toast({
            variant: "destructive",
            title: `${entry.humanName} probe failed`,
            description: outcome.message ?? "The entity did not respond.",
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
          },
        }));
        toast({
          variant: "destructive",
          title: `${entry.humanName} probe failed`,
          description: message,
        });
      }
    },
    [toast],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <Accordion type="multiple" className="w-full" data-testid={testId}>
          {entries.map((entry) => (
            <RosterRow
              key={entry.id}
              entry={entry}
              state={rows[entry.id] ?? { health: entry.initialHealth, outcome: null, running: false }}
              onProbe={handleProbe}
            />
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
