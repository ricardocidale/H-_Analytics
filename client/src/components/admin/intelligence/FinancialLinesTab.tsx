import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  IconCheck, IconX, IconClock, IconFileText, IconAlertTriangle,
} from "@/components/icons";

interface SuggestedLine {
  id: number;
  statementType: string;
  category: string;
  lineName: string;
  description: string | null;
  justification: string | null;
  suggestedByRunId: number | null;
  status: string;
  reviewedBy: number | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

interface LineCounts {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

interface LinesResponse {
  lines: SuggestedLine[];
  counts: LineCounts;
}

const STATEMENT_LABELS: Record<string, string> = {
  income: "Income Statement",
  cash_flow: "Cash Flow",
  balance_sheet: "Balance Sheet",
};

const STATEMENT_COLORS: Record<string, string> = {
  income: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  cash_flow: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  balance_sheet: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
};

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" data-testid="badge-status-pending"><IconClock className="w-3 h-3" />Pending</Badge>;
    case "approved":
      return <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" data-testid="badge-status-approved"><IconCheck className="w-3 h-3" />Approved</Badge>;
    case "rejected":
      return <Badge variant="outline" className="gap-1 bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20" data-testid="badge-status-rejected"><IconX className="w-3 h-3" />Rejected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function FinancialLinesTab() {
  const [activeTab, setActiveTab] = useState("all");
  const [rejectTarget, setRejectTarget] = useState<SuggestedLine | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<LinesResponse>({
    queryKey: ["/api/admin/intelligence/financial-lines", activeTab],
    queryFn: () =>
      apiRequest("GET", `/api/admin/intelligence/financial-lines?status=${activeTab}`).then(r => r.json()),
  });

  const lines = data?.lines ?? [];
  const counts = data?.counts ?? { pending: 0, approved: 0, rejected: 0, total: 0 };

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/admin/intelligence/financial-lines/${id}/approve`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/intelligence/financial-lines"] });
      toast({ title: "Suggestion approved", description: "The financial line has been approved and indexed to knowledge base." });
    },
    onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("PATCH", `/api/admin/intelligence/financial-lines/${id}/reject`, { reason }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/intelligence/financial-lines"] });
      setRejectTarget(null);
      setRejectReason("");
      toast({ title: "Suggestion rejected" });
    },
    onError: () => toast({ title: "Failed to reject", variant: "destructive" }),
  });

  return (
    <div className="space-y-6" data-testid="financial-lines-tab">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CountCard label="Total" count={counts.total} color="text-foreground" />
        <CountCard label="Pending" count={counts.pending} color="text-amber-600 dark:text-amber-400" />
        <CountCard label="Approved" count={counts.approved} color="text-emerald-600 dark:text-emerald-400" />
        <CountCard label="Rejected" count={counts.rejected} color="text-red-600 dark:text-red-400" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="financial-lines-tabs">
          <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending{counts.pending > 0 && ` (${counts.pending})`}
          </TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading suggestions…</div>
          ) : lines.length === 0 ? (
            <EmptyState tab={activeTab} />
          ) : (
            <div className="space-y-3">
              {lines.map(line => (
                <SuggestionRow
                  key={line.id}
                  line={line}
                  onApprove={() => approveMutation.mutate(line.id)}
                  onReject={() => { setRejectTarget(line); setRejectReason(""); }}
                  isApproving={approveMutation.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) setRejectTarget(null); }}>
        <DialogContent data-testid="reject-dialog">
          <DialogHeader>
            <DialogTitle>Reject Suggestion</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting "{rejectTarget?.lineName}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              data-testid="input-reject-reason"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g., Already covered by existing line items…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} data-testid="btn-cancel-reject">Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => rejectTarget && rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason.trim() })}
              data-testid="btn-confirm-reject"
            >
              {rejectMutation.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CountCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <Card className="border-border/60" data-testid={`count-${label.toLowerCase()}`}>
      <CardContent className="py-3 px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-bold tabular-nums", color)}>{count}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({ tab }: { tab: string }) {
  return (
    <div className="py-16 text-center" data-testid="empty-state">
      <div className="mx-auto w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
        <IconFileText className="w-6 h-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        {tab === "all" ? "No engine suggestions yet" : `No ${tab} suggestions`}
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
        {tab === "all"
          ? "When the research engine identifies new financial lines that could improve your models, they'll appear here for review."
          : `There are no suggestions with "${tab}" status at this time.`}
      </p>
    </div>
  );
}

function SuggestionRow({ line, onApprove, onReject, isApproving }: {
  line: SuggestedLine;
  onApprove: () => void;
  onReject: () => void;
  isApproving: boolean;
}) {
  const stmtLabel = STATEMENT_LABELS[line.statementType] ?? line.statementType;
  const stmtColor = STATEMENT_COLORS[line.statementType] ?? "bg-muted text-muted-foreground border-border";

  return (
    <Card className="border-border/60" data-testid={`suggestion-row-${line.id}`}>
      <CardHeader className="py-3 px-4 pb-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold">{line.lineName}</CardTitle>
              <StatusBadge status={line.status} />
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Badge variant="outline" className={cn("text-[11px]", stmtColor)} data-testid="badge-statement">
                {stmtLabel}
              </Badge>
              <Badge variant="outline" className="text-[11px]" data-testid="badge-category">
                {line.category}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                {new Date(line.createdAt).toLocaleDateString()}
              </span>
              {line.suggestedByRunId && (
                <span className="text-[11px] text-muted-foreground">
                  Run #{line.suggestedByRunId}
                </span>
              )}
            </div>
          </div>

          {line.status === "pending" && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10" onClick={onApprove} disabled={isApproving} data-testid={`btn-approve-${line.id}`}>
                <IconCheck className="w-3 h-3" />Approve
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-700 dark:text-red-400 hover:bg-red-500/10" onClick={onReject} data-testid={`btn-reject-${line.id}`}>
                <IconX className="w-3 h-3" />Reject
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="py-2 px-4 pt-0">
        {line.description && (
          <CardDescription className="text-xs leading-relaxed mt-1">{line.description}</CardDescription>
        )}
        {line.justification && (
          <p className="text-xs text-muted-foreground mt-1.5 italic">
            <span className="font-medium not-italic">Justification: </span>{line.justification}
          </p>
        )}
        {line.status === "rejected" && line.rejectionReason && (
          <div className="flex items-start gap-1.5 mt-2 p-2 rounded-md bg-red-500/5 border border-red-500/10">
            <IconAlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-400">{line.rejectionReason}</p>
          </div>
        )}
        {line.status === "approved" && line.reviewedAt && (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1.5">
            Approved on {new Date(line.reviewedAt).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
