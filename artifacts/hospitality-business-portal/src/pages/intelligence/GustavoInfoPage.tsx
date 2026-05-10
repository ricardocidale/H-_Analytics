/**
 * GustavoInfoPage — read-only informational page for the Analyst Orchestrator.
 *
 * Doctrine (binding):
 *   hplus-admin-nav-ia Rule 11 — this page has NO interactive controls.
 *   The only action is an automatic status check on mount. Admin can read;
 *   they cannot trigger anything from this page.
 *
 * Design:
 *   - Auto-probes gaspar/probe on mount (not user-triggered)
 *   - Shows 🟢/🔴 status + last checked timestamp
 *   - Describes Gustavo's role and how he coordinates the Specialist team
 *   - Styled like a Specialist detail panel but with zero action buttons
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { IconBrain, IconSparkles, IconPeople, IconActivity } from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { useSpecialistDisplay } from "@/components/specialists";
import { ORCHESTRATOR_SPECIALIST_ID } from "@engine/analyst/identity";
import { SPECIALIST_CATALOG } from "@engine/analyst/registry/specialist-catalog";

type ProbeStatus = "idle" | "checking" | "healthy" | "degraded" | "error";

function StatusDot({ status }: { status: ProbeStatus }) {
  if (status === "checking") {
    return <Loader2 className="w-4 h-4 animate-spin text-accent-pop" aria-label="Checking status…" />;
  }
  const colorMap: Record<ProbeStatus, string> = {
    idle:     "bg-muted-foreground/40",
    checking: "bg-muted-foreground/40",
    healthy:  "bg-emerald-500",
    degraded: "bg-amber-500",
    error:    "bg-destructive",
  };
  const labelMap: Record<ProbeStatus, string> = {
    idle:     "Status unknown",
    checking: "Checking…",
    healthy:  "Healthy",
    degraded: "Degraded",
    error:    "Unreachable",
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${colorMap[status]}`}
        aria-label={labelMap[status]}
      />
      <span className="text-sm font-medium">{labelMap[status]}</span>
    </span>
  );
}

export default function GustavoInfoPage() {
  const [probeStatus, setProbeStatus] = useState<ProbeStatus>("idle");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const display = useSpecialistDisplay(ORCHESTRATOR_SPECIALIST_ID);

  // Auto-probe on mount. Per Rule 11, the user cannot trigger this manually —
  // the check fires automatically so the page always shows a fresh status
  // without exposing a button.
  useEffect(() => {
    setProbeStatus("checking");
    fetch(`/api/admin/specialists/${ORCHESTRATOR_SPECIALIST_ID}/probe`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { healthy?: boolean }) => {
        setProbeStatus(data?.healthy === false ? "degraded" : "healthy");
        setLastChecked(new Date());
      })
      .catch(() => {
        setProbeStatus("error");
        setLastChecked(new Date());
      });
  }, []);

  const researchTeamSize = SPECIALIST_CATALOG.length;

  return (
    <div className="space-y-6" data-testid="page-gustavo-info">
      {/* Status row */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base flex items-center gap-2">
            <IconBrain className="w-4 h-4 text-accent-pop" aria-hidden="true" />
            Orchestrator Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <StatusDot status={probeStatus} />
            {lastChecked && (
              <p className="text-xs font-mono tabular-nums text-muted-foreground">
                Last checked:{" "}
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(lastChecked)}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Role description */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base flex items-center gap-2">
            <IconSparkles className="w-4 h-4 text-accent-pop" aria-hidden="true" />
            Role
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            <span className="font-medium text-foreground">{display.humanName}</span> is the Analyst Orchestrator —
            the central intelligence coordinator that routes research tasks across the Specialist team
            and synthesizes findings into actionable insights for the investment portal.
          </p>
          <Separator />
          <ul className="space-y-2">
            <li className="flex gap-2">
              <span className="text-accent-pop font-semibold shrink-0">→</span>
              <span>Receives research requests from the H+ Analysis portal and user actions</span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent-pop font-semibold shrink-0">→</span>
              <span>
                Dispatches tasks to the appropriate Specialist based on domain —
                financial modeling, property analysis, market research, and more
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent-pop font-semibold shrink-0">→</span>
              <span>Synthesizes multi-Specialist outputs into coherent, source-cited recommendations</span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent-pop font-semibold shrink-0">→</span>
              <span>Maintains research quality standards and validates Specialist outputs before surfacing them</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Research team summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base flex items-center gap-2">
            <IconPeople className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            Research Team
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {display.humanName} coordinates a team of{" "}
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {researchTeamSize}
              </span>{" "}
              research Specialists covering financial modeling, market analysis,
              property intelligence, and authority-sourced constants.
            </p>
            <Badge variant="secondary" className="shrink-0 font-mono tabular-nums">
              {researchTeamSize} specialists
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Configuration note */}
      <Card className="border-border/40 bg-muted/20">
        <CardContent className="py-4">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <IconActivity className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <p>
              {display.humanName}'s LLM configuration and research parameters are managed through
              the <span className="font-medium text-foreground">LLMs</span> section.
              Individual Specialist health checks and deployment status are available in the{" "}
              <span className="font-medium text-foreground">Specialists</span> section.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
