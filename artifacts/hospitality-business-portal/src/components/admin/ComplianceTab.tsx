/**
 * Admin → Compliance tab.
 *
 * Displays Vito compliance audit findings with:
 *   - Summary bar (counts by severity, last/next scan info, Run Audit button)
 *   - Severity filter chips
 *   - Violations table with Resolve / Accept actions
 *   - Accept modal (note required)
 *   - Empty and not-yet-run states
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IconRefreshCw, IconShield } from "@/components/icons";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComplianceViolation {
  id: number;
  violationFingerprint: string;
  violationType: string;
  severity: "block" | "warning" | "advisory" | "info";
  file: string;
  lineHint: number | null;
  description: string;
  suggestedFix: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  acceptedAt: string | null;
  acceptedNote: string | null;
}

interface ViolationsResponse {
  violations: ComplianceViolation[];
  total: number;
  page: number;
  limit: number;
}

interface VitoRun {
  id: number;
  trigger: string;
  mode: string;
  passesCompleted: number;
  blockCount: number;
  warningCount: number;
  advisoryCount: number;
  infoCount: number;
  status: string;
  notes: string | null;
  durationMs: number | null;
  createdAt: string;
}

interface RunsResponse {
  runs: VitoRun[];
}

// ---------------------------------------------------------------------------
// Severity styling
// ---------------------------------------------------------------------------

type SeverityFilter = "all" | "block" | "warning" | "advisory" | "info" | "resolved";

const SEVERITY_COLORS: Record<"block" | "warning" | "advisory" | "info", string> = {
  block: "bg-red-100 text-red-800 border-red-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  advisory: "bg-sky-100 text-sky-800 border-sky-200",
  info: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

function SeverityBadge({ severity }: { severity: "block" | "warning" | "advisory" | "info" }) {
  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-semibold border capitalize", SEVERITY_COLORS[severity])}
    >
      {severity}
    </Badge>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ComplianceTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [acceptingViolationId, setAcceptingViolationId] = useState<number | null>(null);
  const [acceptNote, setAcceptNote] = useState("");

  // Build query params
  const violationsQueryKey = ["/api/admin/compliance/violations", filter];
  const queryParams = (() => {
    const params: Record<string, string> = { resolved: "false" };
    if (filter === "resolved") {
      delete params.resolved;
      params.resolved = "true";
    } else if (filter !== "all") {
      params.severity = filter;
    }
    return params;
  })();

  const { data: violationsRaw, isLoading: violationsLoading } = useQuery({
    queryKey: violationsQueryKey,
    queryFn: () =>
      apiRequest("GET", `/api/admin/compliance/violations?${new URLSearchParams(queryParams)}`),
  });
  const violationsData = violationsRaw as ViolationsResponse | undefined;

  const { data: runsRaw } = useQuery({
    queryKey: ["/api/admin/compliance/runs"],
    queryFn: () => apiRequest("GET", "/api/admin/compliance/runs"),
  });
  const runsData = runsRaw as RunsResponse | undefined;

  // Summary counts across unresolved violations (filter-independent)
  const { data: summaryRaw } = useQuery({
    queryKey: ["/api/admin/compliance/violations", "summary"],
    queryFn: () =>
      apiRequest("GET", "/api/admin/compliance/violations?resolved=false&limit=200"),
  });
  const summaryData = summaryRaw as ViolationsResponse | undefined;

  const latestRun = runsData?.runs?.[0] ?? null;

  const counts = {
    block: summaryData?.violations.filter((v: ComplianceViolation) => v.severity === "block").length ?? 0,
    warning: summaryData?.violations.filter((v: ComplianceViolation) => v.severity === "warning").length ?? 0,
    advisory: summaryData?.violations.filter((v: ComplianceViolation) => v.severity === "advisory").length ?? 0,
    info: summaryData?.violations.filter((v: ComplianceViolation) => v.severity === "info").length ?? 0,
  };

  // ── Run audit mutation ──────────────────────────────────────────────────
  const runMutation = useMutation<{ runId: number; trigger: string }, Error, "manual" | "manual-full">({
    mutationFn: (trigger: "manual" | "manual-full") =>
      apiRequest("POST", "/api/admin/compliance/run", { trigger }) as unknown as Promise<{ runId: number; trigger: string }>,
    onSuccess: (data: { runId: number; trigger: string }) => {
      toast({
        title: "Compliance audit started",
        description: `Run #${data.runId} is processing in the background.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/runs"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to start audit", description: err.message, variant: "destructive" });
    },
  });

  // ── Resolve mutation ────────────────────────────────────────────────────
  const resolveMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/admin/compliance/violations/${id}/resolve`, {}),
    onSuccess: () => {
      toast({ title: "Violation resolved" });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/violations"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to resolve", description: err.message, variant: "destructive" });
    },
  });

  // ── Accept mutation ─────────────────────────────────────────────────────
  const acceptMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      apiRequest("POST", `/api/admin/compliance/violations/${id}/accept`, { note }),
    onSuccess: () => {
      toast({ title: "Violation accepted as known" });
      setAcceptingViolationId(null);
      setAcceptNote("");
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/violations"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to accept", description: err.message, variant: "destructive" });
    },
  });

  // ── Render ───────────────────────────────────────────────────────────────

  const filterOptions: { value: SeverityFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "block", label: `Block${counts.block > 0 ? ` (${counts.block})` : ""}` },
    { value: "warning", label: `Warning${counts.warning > 0 ? ` (${counts.warning})` : ""}` },
    { value: "advisory", label: `Advisory${counts.advisory > 0 ? ` (${counts.advisory})` : ""}` },
    { value: "info", label: `Info${counts.info > 0 ? ` (${counts.info})` : ""}` },
    { value: "resolved", label: "Resolved" },
  ];

  const violations = violationsData?.violations ?? [];
  const hasAuditRun = !!latestRun;

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <IconShield className="h-5 w-5 text-muted-foreground" />
              Compliance Summary
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => runMutation.mutate("manual")}
                disabled={runMutation.isPending}
              >
                <IconRefreshCw className={cn("h-4 w-4 mr-1.5", runMutation.isPending && "animate-spin")} />
                Run Audit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => runMutation.mutate("manual-full")}
                disabled={runMutation.isPending}
              >
                <IconRefreshCw className={cn("h-4 w-4 mr-1.5", runMutation.isPending && "animate-spin")} />
                Run Full Audit
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm">
            {/* Counts */}
            <div className="flex items-center gap-2">
              {counts.block > 0 && (
                <span className="font-semibold text-red-600">{counts.block} block</span>
              )}
              {counts.warning > 0 && (
                <span className="font-semibold text-amber-600">{counts.warning} warning</span>
              )}
              {counts.advisory > 0 && (
                <span className="font-semibold text-sky-600">{counts.advisory} advisory</span>
              )}
              {counts.info > 0 && (
                <span className="font-semibold text-emerald-600">{counts.info} info</span>
              )}
              {counts.block === 0 && counts.warning === 0 && counts.advisory === 0 && counts.info === 0 && (
                <span className="text-muted-foreground">No open violations</span>
              )}
            </div>
            {/* Last run */}
            <span className="text-muted-foreground">
              Last scan: {latestRun ? formatRelative(latestRun.createdAt) : "never"}
            </span>
            {latestRun && (
              <span className="text-muted-foreground">
                Mode: {latestRun.mode} · Status: {latestRun.status}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFilter(opt.value)}
            className={cn(
              "px-3 py-1 rounded-full text-sm border transition-colors",
              filter === opt.value
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-muted-foreground border-border hover:border-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Violations table */}
      <Card>
        <CardContent className="p-0">
          {!hasAuditRun ? (
            <div className="py-16 text-center">
              <IconShield className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">Compliance audit has not run yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Click "Run Audit" above to start the first scan.
              </p>
            </div>
          ) : violationsLoading ? (
            <div className="py-16 text-center text-muted-foreground">Loading violations…</div>
          ) : violations.length === 0 ? (
            <div className="py-16 text-center">
              <IconShield className="mx-auto h-10 w-10 text-emerald-400 mb-3" />
              <p className="text-muted-foreground">No compliance violations found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Severity</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {violations.map((v: ComplianceViolation) => (
                  <TableRow
                    key={v.id}
                    className={cn(
                      v.resolvedAt || v.acceptedAt ? "opacity-50" : undefined,
                    )}
                  >
                    <TableCell>
                      <SeverityBadge severity={v.severity} />
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground break-all">
                        {v.file}
                        {v.lineHint != null && (
                          <span className="text-muted-foreground/60">:{v.lineHint}</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-xs text-muted-foreground">{v.violationType}</span>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{v.description}</p>
                      {v.suggestedFix && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Fix: {v.suggestedFix}
                        </p>
                      )}
                      {v.acceptedAt && v.acceptedNote && (
                        <p className="text-xs text-amber-600 mt-0.5">
                          Accepted: {v.acceptedNote}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        {!v.resolvedAt && !v.acceptedAt && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7 px-2"
                              onClick={() => resolveMutation.mutate(v.id)}
                              disabled={resolveMutation.isPending}
                            >
                              Resolve
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7 px-2 text-amber-600"
                              onClick={() => {
                                setAcceptingViolationId(v.id);
                                setAcceptNote("");
                              }}
                            >
                              Accept
                            </Button>
                          </>
                        )}
                        {v.resolvedAt && (
                          <span className="text-xs text-muted-foreground">Resolved</span>
                        )}
                        {v.acceptedAt && (
                          <span className="text-xs text-amber-600">Accepted</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Accept modal */}
      <Dialog
        open={acceptingViolationId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAcceptingViolationId(null);
            setAcceptNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept as Known Violation</DialogTitle>
            <DialogDescription>
              Provide a note explaining why this violation is accepted. It will be suppressed from
              the default view but remains queryable.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="e.g. This model name appears in a test fixture, not live code."
            value={acceptNote}
            onChange={(e) => setAcceptNote(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptingViolationId(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (acceptingViolationId !== null && acceptNote.trim()) {
                  acceptMutation.mutate({ id: acceptingViolationId, note: acceptNote.trim() });
                }
              }}
              disabled={!acceptNote.trim() || acceptMutation.isPending}
            >
              Accept Violation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
