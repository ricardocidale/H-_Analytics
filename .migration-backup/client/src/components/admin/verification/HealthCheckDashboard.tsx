import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  IconCheckCircle2, IconXCircle, IconAlertTriangle, IconPlayCircle,
  IconTimer, IconRefreshCw,
} from "@/components/icons";
import { cn } from "@/lib/utils";

interface PhaseResult {
  name: string;
  status: "PASS" | "FAIL" | "UNKNOWN";
  testCount: number | null;
  details: string[];
}

interface HealthCheckResult {
  timestamp: string;
  opinion: "UNQUALIFIED" | "ADVERSE";
  phases: PhaseResult[];
  typescript: { passed: boolean; errorCount: number };
  lint: { passed: boolean; errorCount: number };
  docHarmony: { passed: boolean; summary: string };
  totalTests: number;
  durationMs: number;
}

function StatusIcon({ status }: { status: "PASS" | "FAIL" | "UNKNOWN" }) {
  if (status === "PASS") return <IconCheckCircle2 className="w-4 h-4 text-secondary" />;
  if (status === "FAIL") return <IconXCircle className="w-4 h-4 text-destructive" />;
  return <IconAlertTriangle className="w-4 h-4 text-accent-pop" />;
}

function PhaseCard({ phase }: { phase: PhaseResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      data-testid={`phase-card-${phase.name.toLowerCase().replace(/\s+/g, "-")}`}
      className={cn(
        "flex flex-col px-4 py-3 rounded-xl border transition-all",
        phase.status === "PASS"
          ? "bg-secondary/5 border-secondary/20"
          : phase.status === "FAIL"
            ? "bg-destructive/5 border-destructive/20"
            : "bg-accent-pop/5 border-accent-pop/20",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <StatusIcon status={phase.status} />
          <span className="text-sm font-medium text-foreground truncate">{phase.name}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {phase.testCount !== null && (
            <span className="text-xs font-mono text-muted-foreground">{phase.testCount} tests</span>
          )}
          <span className={cn(
            "text-xs font-bold px-2 py-0.5 rounded-full",
            phase.status === "PASS" ? "bg-secondary/10 text-secondary" :
            phase.status === "FAIL" ? "bg-destructive/10 text-destructive" :
            "bg-accent-pop/10 text-accent-pop",
          )}>
            {phase.status}
          </span>
          {phase.details.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid={`toggle-details-${phase.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {expanded ? "Hide" : "Details"}
            </button>
          )}
        </div>
      </div>
      {expanded && phase.details.length > 0 && (
        <div className="mt-2 ml-7 space-y-1">
          {phase.details.map((d, i) => (
            <p key={i} className="text-xs font-mono text-muted-foreground">{d}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function OpinionBanner({ result }: { result: HealthCheckResult }) {
  const isHealthy = result.opinion === "UNQUALIFIED";

  return (
    <div
      data-testid="health-opinion-banner"
      className={cn(
        "rounded-2xl border p-6 flex flex-col md:flex-row md:items-center justify-between gap-4",
        isHealthy
          ? "bg-secondary/5 border-secondary/30"
          : "bg-destructive/5 border-destructive/30",
      )}
    >
      <div className="flex items-center gap-4">
        {isHealthy
          ? <IconCheckCircle2 className="w-10 h-10 text-secondary shrink-0" />
          : <IconXCircle className="w-10 h-10 text-destructive shrink-0" />}
        <div>
          <p className={cn(
            "text-2xl font-black tracking-tight",
            isHealthy ? "text-secondary" : "text-destructive",
          )}>
            {result.opinion}
          </p>
          <p className="text-sm text-muted-foreground">
            {isHealthy
              ? "All pipeline phases passed. Codebase is in a healthy state."
              : "One or more pipeline phases failed. Review details below."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Tests</p>
          <p className="text-xl font-mono font-black text-foreground" data-testid="stat-total-tests">
            {result.totalTests.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Phases</p>
          <p className="text-xl font-mono font-black text-foreground" data-testid="stat-total-phases">
            {result.phases.length}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Passed</p>
          <p className="text-xl font-mono font-black text-secondary" data-testid="stat-phases-passed">
            {result.phases.filter(p => p.status === "PASS").length}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Duration</p>
          <p className="text-xl font-mono font-black text-foreground" data-testid="stat-duration">
            {(result.durationMs / 1000).toFixed(1)}s
          </p>
        </div>
      </div>
    </div>
  );
}

function InfraCards({ result }: { result: HealthCheckResult }) {
  const items = [
    {
      label: "TypeScript",
      passed: result.typescript.passed,
      detail: result.typescript.errorCount === 0 ? "0 errors" : `${result.typescript.errorCount} errors`,
    },
    {
      label: "Lint",
      passed: result.lint.passed,
      detail: result.lint.errorCount === 0 ? "0 errors" : `${result.lint.errorCount} errors`,
    },
    {
      label: "Doc Harmony",
      passed: result.docHarmony.passed,
      detail: result.docHarmony.summary,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {items.map(item => (
        <div
          key={item.label}
          data-testid={`infra-card-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl border",
            item.passed
              ? "bg-secondary/5 border-secondary/20"
              : "bg-destructive/5 border-destructive/20",
          )}
        >
          <StatusIcon status={item.passed ? "PASS" : "FAIL"} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{item.label}</p>
            <p className="text-xs text-muted-foreground truncate">{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HealthCheckDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: lastResult } = useQuery<HealthCheckResult | null>({
    queryKey: ["admin", "health-check", "last"],
    queryFn: async () => {
      const res = await fetch("/api/admin/health-check/last", { credentials: "include" });
      if (!res.ok) return null;
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) return null;
      return res.json();
    },
  });

  const runHealthCheck = useMutation({
    mutationFn: async (): Promise<HealthCheckResult> => {
      const res = await fetch("/api/admin/health-check/run", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const body = await res.json();
          throw new Error(String((body as Record<string, unknown>).error) || "Health check failed");
        }
        throw new Error(`Health check failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "health-check", "last"] });
      toast({ title: "Health Check Complete", description: "Pipeline health check finished successfully." });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "health-check", "last"] });
      toast({ title: "Health Check Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleRun = useCallback(() => {
    runHealthCheck.mutate();
  }, [runHealthCheck]);

  const result = runHealthCheck.data ?? lastResult;

  return (
    <div className="space-y-6" data-testid="health-check-dashboard">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">Pipeline Health</h3>
          <p className="text-sm text-muted-foreground">
            15-phase verification pipeline status — TypeScript, lint, tests, and financial proof suites.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {result && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <IconTimer className="w-3.5 h-3.5" />
              <span>Last run: {new Date(result.timestamp).toLocaleString()}</span>
            </div>
          )}
          <Button
            onClick={handleRun}
            disabled={runHealthCheck.isPending}
            size="sm"
            data-testid="button-run-health-check"
          >
            {runHealthCheck.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              : <IconRefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            {runHealthCheck.isPending ? "Running..." : "Run Health Check"}
          </Button>
        </div>
      </div>

      {runHealthCheck.isPending && (
        <div className="flex flex-col items-center justify-center py-16 space-y-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-secondary/20 border-t-secondary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <IconPlayCircle className="w-6 h-6 text-secondary animate-pulse" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-lg font-bold text-foreground animate-pulse">Running Pipeline Health Check...</p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              This runs TypeScript compilation, lint, all 4,300+ tests, and 15-phase financial verification. Takes about 60-90 seconds.
            </p>
          </div>
        </div>
      )}

      {!runHealthCheck.isPending && result && (
        <>
          <OpinionBanner result={result} />
          <InfraCards result={result} />

          <Card className="bg-card border border-border/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Verification Phases ({result.phases.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {result.phases.map(phase => (
                <PhaseCard key={phase.name} phase={phase} />
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {!runHealthCheck.isPending && !result && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
          <IconPlayCircle className="w-12 h-12 text-muted-foreground/50" />
          <div>
            <p className="text-lg font-semibold text-foreground">No health check results yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click "Run Health Check" to analyze the verification pipeline.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
