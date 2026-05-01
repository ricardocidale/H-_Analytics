import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ResourceHealthStatus } from "@shared/schema";

export interface HealthView {
  resourceId: number;
  status: ResourceHealthStatus;
  lastChecked: string | null;
  lastErrorCode: string | null;
}

const BAND_CLASSES: Record<ResourceHealthStatus, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  gray: "bg-slate-400",
};

const BAND_LABELS: Record<ResourceHealthStatus, string> = {
  green: "Healthy",
  amber: "Stale or skipped",
  red: "Failing",
  gray: "Never checked",
};

export function HealthDot({ resourceId }: { resourceId: number }) {
  const { data } = useQuery<HealthView>({
    queryKey: [`/api/admin/resources/${resourceId}/health`],
    refetchInterval: 60_000,
  });
  const status: ResourceHealthStatus = data?.status ?? "gray";
  const title = data
    ? `${BAND_LABELS[status]}${data.lastErrorCode ? ` — ${data.lastErrorCode}` : ""}${data.lastChecked ? ` · checked ${new Date(data.lastChecked).toLocaleString()}` : ""}`
    : BAND_LABELS.gray;
  return (
    <span
      data-testid={`health-dot-${resourceId}`}
      data-status={status}
      title={title}
      aria-label={title}
      className={cn("inline-block w-2.5 h-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10", BAND_CLASSES[status])}
    />
  );
}

export function LastCheckedText({ resourceId }: { resourceId: number }) {
  const { data } = useQuery<HealthView>({
    queryKey: [`/api/admin/resources/${resourceId}/health`],
    refetchInterval: 60_000,
  });
  if (!data?.lastChecked) {
    return <span className="text-muted-foreground text-xs" data-testid={`last-checked-${resourceId}`}>—</span>;
  }
  return (
    <span className="text-xs text-muted-foreground" data-testid={`last-checked-${resourceId}`}>
      {new Date(data.lastChecked).toLocaleString()}
    </span>
  );
}

interface TestProbeResult {
  status: "ok" | "fail" | "skipped";
  latencyMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  checkedAt: string;
}

export function TestButton({ resourceId, kindLabel }: { resourceId: number; kindLabel: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (): Promise<TestProbeResult> => {
      const res = await apiRequest("POST", `/api/admin/resources/${resourceId}/test`);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/${resourceId}/health`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/${resourceId}/health/history`] });
      // Task #500: also invalidate the new transparency views so the
      // Working pill, gaps banner, and detail dialog reflect the probe
      // result instantly instead of waiting for the 60s refetchInterval.
      queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/transparency`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/${resourceId}/transparency`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/resources/gaps`] });
      const variant = result.status === "ok" ? "default" : "destructive";
      toast({
        title: `${kindLabel}: ${result.status.toUpperCase()}${result.errorCode ? ` (${result.errorCode})` : ""}`,
        description: result.errorMessage ?? `Probe finished in ${result.latencyMs}ms`,
        variant,
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Test failed";
      toast({
        title: msg.startsWith("429") ? "Rate limited — try again in a minute" : "Test failed",
        description: msg,
        variant: "destructive",
      });
    },
  });
  return (
    <Button
      size="sm"
      variant="outline"
      data-testid={`button-test-${resourceId}`}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? "Testing…" : "Test"}
    </Button>
  );
}
