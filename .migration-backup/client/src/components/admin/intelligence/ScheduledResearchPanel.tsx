import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Calendar, Play, CheckCircle2, XCircle, Clock, Hourglass } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ScheduledWorkflow {
  id: number;
  workflowKey: string;
  name: string;
  description: string | null;
  researchType: string;
  promptInstructions: string | null;
  isEnabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunDurationMs: number | null;
  lastRunError: string | null;
  priority: number;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const absMs = Math.abs(diffMs);
  const isFuture = diffMs < 0;

  if (absMs < 60000) return isFuture ? "in < 1 min" : "< 1 min ago";
  if (absMs < 3600000) {
    const mins = Math.floor(absMs / 60000);
    return isFuture ? `in ${mins} min` : `${mins} min ago`;
  }
  if (absMs < 86400000) {
    const hours = Math.floor(absMs / 3600000);
    return isFuture ? `in ${hours}h` : `${hours}h ago`;
  }
  const days = Math.floor(absMs / 86400000);
  return isFuture ? `in ${days}d` : `${days}d ago`;
}

function StatusBadge({ status }: { status: string | null }) {
  const config: Record<string, { className: string; icon: typeof CheckCircle2 }> = {
    completed: { className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2 },
    running: { className: "bg-blue-500/10 text-blue-600 border-blue-500/20 animate-pulse", icon: Clock },
    failed: { className: "bg-red-500/10 text-red-600 border-red-500/20", icon: XCircle },
    pending: { className: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Hourglass },
  };
  const c = config[status ?? "pending"] ?? config.pending;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${c.className}`} data-testid={`status-badge-${status}`}>
      <Icon className="w-3 h-3" />
      {status ?? "pending"}
    </Badge>
  );
}

export default function ScheduledResearchPanel() {
  const queryClient = useQueryClient();
  const [runningId, setRunningId] = useState<number | null>(null);

  const { data: workflows = [], isLoading } = useQuery<ScheduledWorkflow[]>({
    queryKey: ["/api/admin/scheduled-research"],
    queryFn: () => apiRequest("GET", "/api/admin/scheduled-research").then(r => r.json()),
    refetchInterval: 15000,
  });

  const runNow = async (workflow: ScheduledWorkflow) => {
    setRunningId(workflow.id);
    try {
      const response = await fetch(`/api/admin/scheduled-research/${workflow.id}/execute`, {
        method: "POST",
        credentials: "include",
      });
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          decoder.decode(value);
        }
      }
    } finally {
      setRunningId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scheduled-research"] });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="scheduled-research-panel">
      <Alert data-testid="alert-manual-runs-only">
        <Calendar className="w-4 h-4" />
        <AlertTitle>Manual runs only</AlertTitle>
        <AlertDescription>
          Per <code>analyst-trigger-discipline.md</code>, scheduled
          (cron-triggered) Specialist runs are forbidden. Tasks below are
          dev-registered; click "Run Now" to launch one on demand.
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-3">
        <Calendar className="w-5 h-5 text-primary" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {workflows.length} Registered Task{workflows.length !== 1 ? "s" : ""}
          </h3>
          <p className="text-xs text-muted-foreground">
            Manual-trigger console
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        {workflows.map((w) => {
          const isRunning = runningId === w.id || w.lastRunStatus === "running";

          return (
            <Card
              key={w.id}
              className="transition-all"
              data-testid={`card-workflow-${w.workflowKey}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-medium text-foreground truncate" data-testid={`text-workflow-name-${w.id}`}>
                        {w.name}
                      </h4>
                      <StatusBadge status={w.lastRunStatus} />
                    </div>
                    {w.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                        {w.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span data-testid={`text-last-run-${w.id}`}>
                        Last: {formatRelativeTime(w.lastRunAt)}
                      </span>
                      {w.lastRunDurationMs != null && (
                        <span>
                          Duration: {(w.lastRunDurationMs / 1000).toFixed(1)}s
                        </span>
                      )}
                      <span className="text-primary/60">
                        P{w.priority}
                      </span>
                    </div>
                    {w.lastRunError && (
                      <p className="text-[11px] text-red-500 mt-1 line-clamp-1" data-testid={`text-error-${w.id}`}>
                        {w.lastRunError}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={isRunning}
                      onClick={() => runNow(w)}
                      data-testid={`button-run-${w.id}`}
                    >
                      {isRunning ? (
                        <div className="animate-spin w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      Run Now
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {workflows.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Calendar className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No registered research tasks</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Tasks are dev-registered in source code.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
