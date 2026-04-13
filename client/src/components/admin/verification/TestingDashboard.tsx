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

interface BatteryTestResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  failureMessage?: string;
}

interface BatteryResult {
  battery: string;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: number;
  timestamp: string;
  results: BatteryTestResult[];
  error?: string;
}

interface SourceVerifyResult {
  sourceHealth: {
    total: number;
    healthy: number;
    unhealthy: number;
    results: { serviceKey: string; healthy: boolean; latencyMs: number; error?: string }[];
  };
  staleness: {
    totalProperties: number;
    freshFields: number;
    staleFields: number;
    missingFields: number;
    criticallyStale: string[];
  };
  timestamp: string;
}

interface FinancialVerifyResult {
  opinion: string;
  findings: string[];
  rawLength: number;
  timestamp: string;
}

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

function BatteryResultCard({ result }: { result: BatteryResult }) {
  const [showFailed, setShowFailed] = useState(false);
  const failedTests = result.results.filter(r => r.status === "failed");
  return (
    <Card className="bg-card border border-border/80 shadow-sm" data-testid={`battery-result-${result.battery}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            {result.failed === 0 ? <IconCheckCircle2 className="w-4 h-4 text-secondary" /> : <IconXCircle className="w-4 h-4 text-destructive" />}
            {result.battery.charAt(0).toUpperCase() + result.battery.slice(1)} — {result.passed}/{result.total} passed
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <IconTimer className="w-3.5 h-3.5" />
            <span className="font-mono">{(result.duration / 1000).toFixed(1)}s</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {result.error && (
          <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
            <p className="text-xs font-mono text-destructive break-all">{result.error}</p>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 rounded-lg bg-secondary/5 border border-secondary/20">
            <p className="text-lg font-mono font-bold text-secondary">{result.passed}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Passed</p>
          </div>
          <div className={cn("text-center p-2 rounded-lg border", result.failed > 0 ? "bg-destructive/5 border-destructive/20" : "bg-muted/30 border-border/50")}>
            <p className={cn("text-lg font-mono font-bold", result.failed > 0 ? "text-destructive" : "text-muted-foreground")}>{result.failed}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Failed</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-lg font-mono font-bold text-muted-foreground">{result.skipped}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Skipped</p>
          </div>
        </div>
        {failedTests.length > 0 && (
          <div>
            <button
              onClick={() => setShowFailed(!showFailed)}
              className="text-xs text-destructive hover:underline"
              data-testid="button-toggle-failed-tests"
            >
              {showFailed ? "Hide" : "Show"} {failedTests.length} failed test{failedTests.length > 1 ? "s" : ""} {showFailed ? "▲" : "▼"}
            </button>
            {showFailed && (
              <div className="mt-2 space-y-2 max-h-48 overflow-auto">
                {failedTests.map((t, i) => (
                  <div key={i} className="px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20">
                    <div className="flex items-center gap-2">
                      <IconXCircle className="w-3 h-3 text-destructive shrink-0" />
                      <span className="text-xs font-medium text-destructive truncate">{t.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground ml-auto">{t.duration}ms</span>
                    </div>
                    {t.failureMessage && (
                      <p className="text-[10px] font-mono text-destructive/70 mt-1 break-all line-clamp-3">{t.failureMessage}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SourceVerifyCard({ result }: { result: SourceVerifyResult }) {
  return (
    <Card className="bg-card border border-border/80 shadow-sm" data-testid="battery-result-source">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          {result.sourceHealth.unhealthy === 0 ? <IconCheckCircle2 className="w-4 h-4 text-secondary" /> : <IconAlertTriangle className="w-4 h-4 text-accent-pop" />}
          Source Verification — {result.sourceHealth.healthy}/{result.sourceHealth.total} healthy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Source Health</p>
            {result.sourceHealth.results.map((r) => (
              <div key={r.serviceKey} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs", r.healthy ? "bg-secondary/5 border-secondary/20" : "bg-destructive/5 border-destructive/20")} data-testid={`source-health-${r.serviceKey}`}>
                {r.healthy ? <IconCheckCircle2 className="w-3 h-3 text-secondary" /> : <IconXCircle className="w-3 h-3 text-destructive" />}
                <span className="font-medium">{r.serviceKey}</span>
                <span className="font-mono text-muted-foreground ml-auto">{r.latencyMs}ms</span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Staleness</p>
            <div className="px-3 py-2 rounded-lg border bg-muted/30 space-y-1 text-xs">
              <div className="flex justify-between"><span>Fresh</span><span className="font-mono font-bold text-secondary">{result.staleness.freshFields}</span></div>
              <div className="flex justify-between"><span>Stale</span><span className={cn("font-mono font-bold", result.staleness.staleFields > 0 ? "text-accent-pop" : "text-muted-foreground")}>{result.staleness.staleFields}</span></div>
              <div className="flex justify-between"><span>Missing</span><span className="font-mono font-bold text-muted-foreground">{result.staleness.missingFields}</span></div>
            </div>
            {result.staleness.criticallyStale.length > 0 && (
              <div className="px-3 py-2 rounded-lg border border-destructive/20 bg-destructive/5">
                <p className="text-[10px] font-bold text-destructive mb-1">Critically Stale:</p>
                {result.staleness.criticallyStale.map((s) => (
                  <p key={s} className="text-[10px] font-mono text-destructive/70">{s}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FinancialVerifyCard({ result }: { result: FinancialVerifyResult }) {
  return (
    <Card className="bg-card border border-border/80 shadow-sm" data-testid="battery-result-financial">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            {result.opinion === "UNQUALIFIED" ? <IconCheckCircle2 className="w-4 h-4 text-secondary" /> : <IconXCircle className="w-4 h-4 text-destructive" />}
            Financial Verification — {result.opinion}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {result.findings.map((f, i) => {
          const isPassing = f.includes("✓") || f.includes("PASS");
          return (
            <div
              key={i}
              className={cn(
                "flex items-center gap-3 px-4 py-2 rounded-xl border text-sm font-mono",
                isPassing ? "bg-secondary/5 border-secondary/20" : "bg-destructive/5 border-destructive/20",
              )}
              data-testid={`financial-finding-${i}`}
            >
              {isPassing ? <IconCheckCircle2 className="w-3.5 h-3.5 text-secondary shrink-0" /> : <IconXCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
              <span className="truncate text-xs">{f}</span>
            </div>
          );
        })}
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

  const [batteryResults, setBatteryResults] = useState<BatteryResult[]>([]);
  const [sourceResult, setSourceResult] = useState<SourceVerifyResult | null>(null);
  const [financialResult, setFinancialResult] = useState<FinancialVerifyResult | null>(null);

  const runBattery = useMutation({
    mutationFn: async (battery: string): Promise<BatteryResult> => {
      const res = await fetch("/api/admin/tests/run-battery", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ battery }),
      });
      if (!res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const body = await res.json();
          throw new Error(String((body as Record<string, unknown>).error) || "Test battery failed");
        }
        throw new Error(`Test battery failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setBatteryResults(prev => [...prev.filter(r => r.battery !== data.battery), data]);
      toast({ title: "Battery Complete", description: `${data.battery} — ${data.passed}/${data.total} passed` });
    },
    onError: (error: Error) => {
      toast({ title: "Battery Failed", description: error.message, variant: "destructive" });
    },
  });

  const runSourceVerify = useMutation({
    mutationFn: async (): Promise<SourceVerifyResult> => {
      const res = await fetch("/api/admin/tests/source-verification", { method: "POST", credentials: "include" });
      if (!res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const body = await res.json();
          throw new Error(String((body as Record<string, unknown>).error) || "Source verification failed");
        }
        throw new Error(`Source verification failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setSourceResult(data);
      toast({ title: "Source Verification Complete", description: `${data.sourceHealth.healthy}/${data.sourceHealth.total} sources healthy` });
    },
    onError: (error: Error) => {
      toast({ title: "Source Verification Failed", description: error.message, variant: "destructive" });
    },
  });

  const runFinancialVerify = useMutation({
    mutationFn: async (): Promise<FinancialVerifyResult> => {
      const res = await fetch("/api/admin/tests/financial-verify", { method: "POST", credentials: "include" });
      if (!res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const body = await res.json();
          throw new Error(String((body as Record<string, unknown>).error) || "Financial verify failed");
        }
        throw new Error(`Financial verify failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setFinancialResult(data);
      toast({ title: "Verification Complete", description: `Opinion: ${data.opinion}` });
    },
    onError: (error: Error) => {
      toast({ title: "Verification Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleRun = useCallback(() => {
    runDashboard.mutate();
  }, [runDashboard]);

  const anyBatteryRunning = runBattery.isPending || runSourceVerify.isPending || runFinancialVerify.isPending;

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

      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Test Batteries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              size="sm"
              variant="outline"
              disabled={anyBatteryRunning}
              onClick={() => runBattery.mutate("proof")}
              data-testid="button-run-engine-tests"
            >
              {runBattery.isPending && runBattery.variables === "proof"
                ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                : <IconFileCheck className="w-3.5 h-3.5 mr-1.5" />}
              Engine Tests
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={anyBatteryRunning}
              onClick={() => runBattery.mutate("golden")}
              data-testid="button-run-golden-tests"
            >
              {runBattery.isPending && runBattery.variables === "golden"
                ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                : <IconFileCheck className="w-3.5 h-3.5 mr-1.5" />}
              Golden Tests
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={anyBatteryRunning}
              onClick={() => runSourceVerify.mutate()}
              data-testid="button-run-source-verification"
            >
              {runSourceVerify.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                : <IconFileCode className="w-3.5 h-3.5 mr-1.5" />}
              Source Verification
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={anyBatteryRunning}
              onClick={() => runFinancialVerify.mutate()}
              data-testid="button-run-financial-verify"
            >
              {runFinancialVerify.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                : <IconCheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
              Financial Verify
            </Button>
          </div>
          {anyBatteryRunning && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Running test battery… this may take up to 2 minutes.
            </div>
          )}
        </CardContent>
      </Card>

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

      {batteryResults.length > 0 && (
        <div className="space-y-4">
          {batteryResults.map(br => <BatteryResultCard key={br.battery} result={br} />)}
        </div>
      )}

      {sourceResult && <SourceVerifyCard result={sourceResult} />}

      {financialResult && <FinancialVerifyCard result={financialResult} />}
    </div>
  );
}
