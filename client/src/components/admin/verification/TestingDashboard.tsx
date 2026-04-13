import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  IconCheckCircle2, IconXCircle, IconAlertTriangle, IconRefreshCw,
  IconTimer, IconFileCode, IconFileCheck, IconHash,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface CodebaseStat {
  label: string;
  files: number;
  lines: number;
}

interface AuditFinding {
  label: string;
  count: number;
  severity: "critical" | "warning" | "info";
  threshold?: number;
  samples: string[];
}

interface TestingDashboardData {
  timestamp: string;
  durationMs: number;
  codebase: {
    totalFiles: number;
    totalLines: number;
    breakdown: CodebaseStat[];
  };
  tests: {
    totalTests: number;
    totalFiles: number;
    testLines: number;
  };
  audit: {
    findings: AuditFinding[];
    asAnyBudget: { server: number; client: number; total: number; limit: number };
    hasCritical: boolean;
  };
}

function StatCard({ label, value, subtitle, icon: Icon, variant = "default" }: {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const colors = {
    default: "bg-muted/50 border-border/60",
    success: "bg-secondary/5 border-secondary/20",
    warning: "bg-accent-pop/5 border-accent-pop/20",
    danger: "bg-destructive/5 border-destructive/20",
  };

  return (
    <div className={cn("flex items-center gap-4 px-5 py-4 rounded-xl border", colors[variant])} data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="p-2.5 rounded-lg bg-muted/50">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{label}</p>
        <p className="text-xl font-mono font-black text-foreground">{typeof value === "number" ? value.toLocaleString() : value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function CodebaseBreakdown({ breakdown }: { breakdown: CodebaseStat[] }) {
  const totalLines = breakdown.reduce((s, b) => s + b.lines, 0);

  return (
    <Card className="bg-card border border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <IconFileCode className="w-4 h-4 text-muted-foreground" />
          Source Code Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {breakdown.map(item => {
          const pct = totalLines > 0 ? (item.lines / totalLines) * 100 : 0;
          return (
            <div key={item.label} className="space-y-1.5" data-testid={`breakdown-${item.label.toLowerCase().replace(/[/\s]+/g, "-")}`}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{item.label}</span>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span className="font-mono text-xs">{item.files.toLocaleString()} files</span>
                  <span className="font-mono text-xs font-bold">{item.lines.toLocaleString()} lines</span>
                </div>
              </div>
              <Progress value={pct} className="h-2" />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function AuditFindings({ findings, asAnyBudget }: {
  findings: AuditFinding[];
  asAnyBudget: TestingDashboardData["audit"]["asAnyBudget"];
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <Card className="bg-card border border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <IconFileCheck className="w-4 h-4 text-muted-foreground" />
            Code Quality Audit
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs" data-testid="badge-as-any-budget">
              as any: {asAnyBudget.total}/{asAnyBudget.limit}
            </Badge>
            <Progress
              value={(asAnyBudget.total / asAnyBudget.limit) * 100}
              className={cn("w-20 h-2", asAnyBudget.total >= asAnyBudget.limit ? "[&>div]:bg-destructive" : asAnyBudget.total >= asAnyBudget.limit * 0.9 ? "[&>div]:bg-accent-pop" : "")}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {findings.map((f, idx) => (
          <div
            key={f.label}
            className={cn(
              "flex flex-col px-4 py-3 rounded-xl border transition-all cursor-pointer",
              f.count === 0 ? "bg-secondary/5 border-secondary/20" :
              f.severity === "critical" ? "bg-destructive/5 border-destructive/20" :
              f.severity === "warning" ? "bg-accent-pop/5 border-accent-pop/20" :
              "bg-muted/30 border-border/50",
            )}
            onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            data-testid={`audit-finding-${f.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {f.count === 0 ? <IconCheckCircle2 className="w-4 h-4 text-secondary shrink-0" /> :
                 f.severity === "critical" ? <IconXCircle className="w-4 h-4 text-destructive shrink-0" /> :
                 f.severity === "warning" ? <IconAlertTriangle className="w-4 h-4 text-accent-pop shrink-0" /> :
                 <IconCheckCircle2 className="w-4 h-4 text-muted-foreground shrink-0" />}
                <span className="text-sm font-medium text-foreground">{f.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn(
                  "text-sm font-mono font-bold",
                  f.count === 0 ? "text-secondary" :
                  f.severity === "critical" ? "text-destructive" :
                  f.severity === "warning" ? "text-accent-pop" : "text-muted-foreground",
                )}>
                  {f.count}
                </span>
                {f.samples.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{expandedIdx === idx ? "▲" : "▼"}</span>
                )}
              </div>
            </div>
            {expandedIdx === idx && f.samples.length > 0 && (
              <div className="mt-2 ml-7 space-y-1 max-h-32 overflow-auto">
                {f.samples.map((s, i) => (
                  <p key={i} className="text-xs font-mono text-muted-foreground truncate">{s}</p>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function TestingDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: lastResult } = useQuery<TestingDashboardData | null>({
    queryKey: ["admin", "testing-dashboard", "last"],
    queryFn: async () => {
      const res = await fetch("/api/admin/testing-dashboard/last", { credentials: "include" });
      if (!res.ok) return null;
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) return null;
      return res.json();
    },
  });

  const runDashboard = useMutation({
    mutationFn: async (): Promise<TestingDashboardData> => {
      const res = await fetch("/api/admin/testing-dashboard/run", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const body = await res.json();
          throw new Error(String((body as Record<string, unknown>).error) || "Dashboard scan failed");
        }
        throw new Error(`Dashboard scan failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "testing-dashboard", "last"] });
      toast({ title: "Dashboard Updated", description: "Testing dashboard scan completed." });
    },
    onError: (error: Error) => {
      toast({ title: "Scan Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleRun = useCallback(() => {
    runDashboard.mutate();
  }, [runDashboard]);

  const result = runDashboard.data ?? lastResult;

  return (
    <div className="space-y-6" data-testid="testing-dashboard">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">Testing & Quality Dashboard</h3>
          <p className="text-sm text-muted-foreground">
            Codebase metrics, test coverage, and code quality audit results at a glance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {result && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <IconTimer className="w-3.5 h-3.5" />
              <span>Last scan: {new Date(result.timestamp).toLocaleString()}</span>
              <span className="font-mono">({(result.durationMs / 1000).toFixed(1)}s)</span>
            </div>
          )}
          <Button
            onClick={handleRun}
            disabled={runDashboard.isPending}
            size="sm"
            data-testid="button-run-testing-dashboard"
          >
            {runDashboard.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              : <IconRefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            {runDashboard.isPending ? "Scanning…" : "Run Scan"}
          </Button>
        </div>
      </div>

      {runDashboard.isPending && (
        <div className="flex flex-col items-center justify-center py-16 space-y-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-secondary/20 border-t-secondary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <IconHash className="w-6 h-6 text-secondary animate-pulse" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-lg font-bold text-foreground animate-pulse">Scanning Codebase...</p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Collecting file stats, counting tests, and running code quality audit. Takes about 5-10 seconds.
            </p>
          </div>
        </div>
      )}

      {!runDashboard.isPending && result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Source Files"
              value={result.codebase.totalFiles}
              subtitle={`${result.codebase.totalLines.toLocaleString()} lines`}
              icon={IconFileCode}
            />
            <StatCard
              label="Test Files"
              value={result.tests.totalFiles}
              subtitle={`${result.tests.testLines.toLocaleString()} lines`}
              icon={IconFileCheck}
            />
            <StatCard
              label="Total Tests"
              value={result.tests.totalTests}
              subtitle={`across ${result.tests.totalFiles} files`}
              icon={IconCheckCircle2}
              variant="success"
            />
            <StatCard
              label="Quality Score"
              value={result.audit.hasCritical ? "ISSUES" : "CLEAN"}
              subtitle={`${result.audit.findings.filter(f => f.count === 0).length}/${result.audit.findings.length} checks pass`}
              icon={result.audit.hasCritical ? IconAlertTriangle : IconCheckCircle2}
              variant={result.audit.hasCritical ? "danger" : "success"}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CodebaseBreakdown breakdown={result.codebase.breakdown} />
            <AuditFindings findings={result.audit.findings} asAnyBudget={result.audit.asAnyBudget} />
          </div>
        </>
      )}

      {!runDashboard.isPending && !result && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
          <IconHash className="w-12 h-12 text-muted-foreground/50" />
          <div>
            <p className="text-lg font-semibold text-foreground">No scan results yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click "Run Scan" to collect codebase metrics and code quality data.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
