/**
 * SpecialistsDirectoryPage — single accordion-table showing all research Specialists.
 *
 * Doctrine (binding):
 *   hplus-admin-nav-ia Rule 9  — replaces all per-domain group menu items.
 *   hplus-admin-nav-ia Rule 10 — LLMs, Sources, and APIs are display-only labels.
 *   analyst-research-buttons   — Run Analyst button uses AnalystActionButton.
 *   specialist-persona-naming  — SpecialistName component, persona-first display.
 *
 * Each collapsed row:  persona monogram + humanName + role + description
 * Each expanded row:   description, subject domain, last probe result, Run Analyst button
 *
 * The [Run Analyst] button performs a health check (POST .../probe) only —
 * it does NOT regenerate source data and does NOT modify LLM settings.
 */

import { useMemo, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AnalystActionButton } from "@/components/analyst/AnalystActionButton";
import { SpecialistName } from "@/components/specialists/SpecialistName";
import { AgentThinkingState } from "@/components/agent-animations";
import { SPECIALIST_CATALOG } from "@engine/analyst/registry/specialist-catalog";
import { IconPeople } from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";

// ─── Named constants (no magic numbers) ──────────────────────────────────────

/** Poll interval while a Specialist run is in progress (ms). */
const SPECIALIST_STATUS_POLL_INTERVAL_MS = 3_000;

interface ProbeResult {
  healthy: boolean;
  message?: string;
}

interface SpecialistRunStatus {
  isRunning: boolean;
  runningCount: number;
  phase: "thinking" | "complete" | "error" | null;
}

type ProbeStatusValue = "idle" | "healthy" | "degraded" | "error";

interface AdminSpecialistRow {
  id: string;
  humanName?: string | null;
}

function StatusDot({ status }: { status: ProbeStatusValue }) {
  const colorMap: Record<ProbeStatusValue, string> = {
    idle:    "bg-muted-foreground/30",
    healthy: "bg-emerald-500",
    degraded:"bg-amber-500",
    error:   "bg-destructive",
  };
  const labelMap: Record<ProbeStatusValue, string> = {
    idle:    "Not checked",
    healthy: "Healthy",
    degraded:"Degraded",
    error:   "Unreachable",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${colorMap[status]}`}
      title={labelMap[status]}
      aria-label={labelMap[status]}
    />
  );
}

const SUBJECT_LABELS: Record<string, string> = {
  "mgmt-co":       "Management Company",
  property:        "Property",
  photos:          "Photos & Renders",
  "portfolio-ops": "Portfolio Operations",
  constants:       "Constants & Authority Sources",
  resources:       "Resources",
};

interface SpecialistRowProps {
  id: string;
  liveHumanNames: Map<string, string>;
}

function SpecialistRow({ id, liveHumanNames: _liveHumanNames }: SpecialistRowProps) {
  const def = useMemo(() => SPECIALIST_CATALOG.find((d) => d.id === id), [id]);

  // ── Run-status polling for persona orb ──────────────────────────────────
  // Mirrors the SpecialistPage pattern: polls while a research job is in
  // flight (phase "thinking") and stops automatically when phase is null.
  // Uses the same admin-gated endpoint — the Intelligence section is already
  // admin-accessible (it calls /api/admin/specialists for the catalog list).
  const { data: runStatus, refetch: refetchRunStatus } = useQuery<SpecialistRunStatus>({
    queryKey: [`/api/admin/specialists/${id}/run-status`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/specialists/${encodeURIComponent(id)}/run-status`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch specialist run status");
      return res.json() as Promise<SpecialistRunStatus>;
    },
    refetchInterval: (query) =>
      query.state.data?.isRunning ? SPECIALIST_STATUS_POLL_INTERVAL_MS : false,
  });

  // Once the orb reaches a terminal phase (complete/error), the server's
  // 30-second recency window will eventually clear it back to null. Schedule
  // one deferred refetch after that window so the orb disappears on time.
  useEffect(() => {
    if (runStatus?.phase !== "complete" && runStatus?.phase !== "error") return;
    const timerId = setTimeout(() => void refetchRunStatus(), SPECIALIST_STATUS_POLL_INTERVAL_MS + 500);
    return () => clearTimeout(timerId);
  }, [runStatus?.phase, refetchRunStatus]);

  const probeMutation = useMutation<ProbeResult>({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/specialists/${encodeURIComponent(id)}/probe`, undefined, {
        fallbackMessage: "Probe failed",
      });
      return res.json() as Promise<ProbeResult>;
    },
  });

  const probeStatus: ProbeStatusValue = probeMutation.isSuccess
    ? probeMutation.data?.healthy === false ? "degraded" : "healthy"
    : probeMutation.isError ? "error" : "idle";

  const lastChecked = probeMutation.submittedAt
    ? new Intl.DateTimeFormat("en", { timeStyle: "short", dateStyle: "short" }).format(
        new Date(probeMutation.submittedAt),
      )
    : null;

  if (!def) return null;

  const subjectLabel = SUBJECT_LABELS[def.subject as string] ?? def.subject;

  return (
    <AccordionItem value={id} className="border-border/60">
      <AccordionTrigger
        className="hover:no-underline px-4 py-3 [&>svg]:hidden"
        data-testid={`specialists-row-trigger-${id}`}
      >
        <div className="flex items-center gap-3 w-full min-w-0">
          <StatusDot status={probeStatus} />
          <SpecialistName id={id} variant="stacked" size="sm" />
          {/* Persona orb — visible while this Specialist has an active
              research run. Mirrors the SpecialistPage header pattern so
              the animation vocabulary is consistent across every surface. */}
          {runStatus?.phase != null && (
            <AgentThinkingState
              persona="specialist"
              phase={runStatus.phase}
              size="sm"
              aria-label={`${def.humanName ?? def.realName} is ${runStatus.phase}`}
              className="shrink-0"
            />
          )}
          <span className="hidden sm:block text-xs text-muted-foreground truncate flex-1 text-left">
            {def.description}
          </span>
          <Badge variant="outline" className="hidden md:inline-flex shrink-0 text-xs">
            {def.letter}
          </Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <div className="space-y-4 pt-1">
          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">{def.description}</p>

          {/* Meta row */}
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">{subjectLabel}</Badge>
            {lastChecked && (
              <span className="font-mono tabular-nums text-muted-foreground self-center">
                Last checked: {lastChecked}
              </span>
            )}
            {probeMutation.isError && (
              <span className="text-destructive self-center">
                {probeMutation.error instanceof Error
                  ? probeMutation.error.message
                  : "Probe failed"}
              </span>
            )}
          </div>

          {/* Read-only resource labels per Rule 10 */}
          <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1.5 text-xs text-muted-foreground">
            <p className="font-medium text-foreground/70 uppercase tracking-wider text-[10px]">
              Resources
            </p>
            <p>
              LLM configuration →{" "}
              <span className="font-medium text-foreground/80">Intelligence → LLMs</span>
            </p>
            <p>
              Source data →{" "}
              <span className="font-medium text-foreground/80">Admin → Sources</span>
            </p>
          </div>

          {/* Run Analyst — health check only */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              Health check verifies this Specialist is deployed and responding.
            </p>
            <AnalystActionButton
              onClick={() => probeMutation.mutate()}
              running={probeMutation.isPending}
              testIdSuffix={id.replace(/\./g, "-")}
              tooltipText="Verify this Specialist is deployed and responding"
            />
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export default function SpecialistsDirectoryPage() {
  const { data: liveSpecialists, isLoading } = useQuery<AdminSpecialistRow[]>({
    queryKey: ["/api/admin/specialists"],
    staleTime: 30_000,
  });

  const liveHumanNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of liveSpecialists ?? []) {
      const trimmed = row.humanName?.trim();
      if (trimmed) map.set(row.id, trimmed);
    }
    return map;
  }, [liveSpecialists]);

  // Sort by letter A–P
  const sortedCatalog = useMemo(
    () => [...SPECIALIST_CATALOG].sort((a, b) => a.letter.localeCompare(b.letter)),
    [],
  );

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse" data-testid="page-specialists-loading">
        <div className="h-10 bg-muted rounded" />
        <div className="h-10 bg-muted rounded" />
        <div className="h-10 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-specialists-directory">
      {/* Summary header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconPeople className="w-4 h-4" aria-hidden="true" />
          <span>
            <span className="font-mono tabular-nums font-semibold text-foreground">
              {sortedCatalog.length}
            </span>{" "}
            research Specialists — expand any row to run a health check
          </span>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="font-display text-base">Research Specialists</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 px-0">
          <Accordion type="single" collapsible className="w-full">
            {sortedCatalog.map((def) => (
              <SpecialistRow
                key={def.id}
                id={def.id}
                liveHumanNames={liveHumanNames}
              />
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Doctrine note */}
      <p className="text-xs text-muted-foreground px-1">
        LLM settings are managed in{" "}
        <span className="font-medium text-foreground/80">Intelligence → LLMs</span>.
        Source data is managed in{" "}
        <span className="font-medium text-foreground/80">Admin → Sources</span>.
      </p>
    </div>
  );
}
