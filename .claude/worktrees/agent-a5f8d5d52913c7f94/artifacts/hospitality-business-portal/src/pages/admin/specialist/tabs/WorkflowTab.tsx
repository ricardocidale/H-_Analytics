/**
 * WorkflowTab — overview surface for one Specialist. Lists each declared
 * resource assignment with its health, plus a "Test agent" button that
 * triggers the read-only probe endpoint and renders per-step pass/fail.
 */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ResourceHealthStatus } from "@shared/schema";
import type { SpecialistAssignmentView } from "../types";
import { HEALTH_BAND } from "../constants";

interface ProbeStep {
  name: string;
  description?: string;
  status: "pass" | "fail" | "skipped";
  message?: string;
}
interface ProbeResponse {
  specialistId: string;
  ranAt: string;
  steps: ProbeStep[];
}

const PROBE_STATUS_CLS: Record<ProbeStep["status"], string> = {
  pass: "bg-emerald-500",
  fail: "bg-rose-500",
  skipped: "bg-slate-400",
};

export function WorkflowTab({
  specialistId,
  description,
  assignments,
}: {
  specialistId: string;
  description?: string;
  assignments: SpecialistAssignmentView[];
}) {
  const { toast } = useToast();
  const [probeResult, setProbeResult] = useState<ProbeResponse | null>(null);

  const probe = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/specialists/${specialistId}/probe`, {});
      return (await res.json()) as ProbeResponse;
    },
    onSuccess: (data) => setProbeResult(data),
    onError: (e: unknown) =>
      toast({
        title: "Test agent failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  const workflowSteps = useMemo(() => {
    if (assignments.length === 0) {
      return [
        {
          name: "Catalog declaration",
          description: "Specialist declared in catalog with no resource assignments.",
          status: "green" as ResourceHealthStatus,
        },
      ];
    }
    return assignments.map((a) => ({
      name: `${a.kind} · ${a.slug}`,
      description: `Role: ${a.role ?? "—"} · ${a.required ? "required" : "optional"}`,
      status: a.health.status,
    }));
  }, [assignments]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Overview / Workflow</CardTitle>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          <Button
            onClick={() => probe.mutate()}
            disabled={probe.isPending}
            data-testid="button-test-agent"
          >
            {probe.isPending ? "Testing…" : "Test agent"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="space-y-3" data-testid="workflow-steps">
          {workflowSteps.map((s, i) => {
            const band = HEALTH_BAND[s.status];
            return (
              <li
                key={`${s.name}-${i}`}
                className="flex items-start gap-3"
                data-testid={`workflow-step-${i}`}
              >
                <span
                  title={band.label}
                  aria-label={band.label}
                  className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10 ${band.cls}`}
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                </div>
              </li>
            );
          })}
        </ul>

        {probeResult && (
          <div className="rounded-md border bg-muted/30 p-4 space-y-3" data-testid="probe-results">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">Test results</p>
              <p className="text-xs text-muted-foreground">
                {new Date(probeResult.ranAt).toLocaleString()}
              </p>
            </div>
            <ul className="space-y-2">
              {probeResult.steps.map((step, i) => (
                <li
                  key={`${step.name}-${i}`}
                  className="flex items-start gap-3"
                  data-testid={`probe-step-${i}`}
                  data-status={step.status}
                >
                  <span
                    title={step.status}
                    aria-label={step.status}
                    className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10 ${PROBE_STATUS_CLS[step.status]}`}
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      {step.name}{" "}
                      <span className="text-xs uppercase text-muted-foreground">
                        {step.status}
                      </span>
                    </p>
                    {step.message && (
                      <p className="text-xs text-muted-foreground">{step.message}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
