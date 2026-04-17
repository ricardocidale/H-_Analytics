/**
 * AnalystTables.tsx — Admin tab listing all benchmark tables that the
 * Analyst can refresh on demand. Each row shows the table name, freshness
 * (fresh / stale / missing), source count, last refresh time, and a
 * "Refresh" button that opens the full-screen Analyst theater.
 *
 * Settings panel at top exposes the global cadence (days). Suspicious
 * activity banner is rendered above the table list when the server flags
 * it.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import AnalystRefreshTheater from "./AnalystRefreshTheater";
import RefreshDiffDialog from "./RefreshDiffDialog";
import SuspiciousActivityBanner from "./SuspiciousActivityBanner";
import { useFirstVisitBenchmarkSeed } from "@/hooks/useFirstVisitBenchmarkSeed";

type Range = {
  dimensionKey: string;
  label: string;
  unit: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
};

type TableRow = {
  id: string;
  label: string;
  ranges: Range[];
  sourceCount: number;
  tokensUsedLastRefresh: number | null;
  lastRefreshedAt: string | null;
  freshness: "fresh" | "stale" | "missing";
};

type ListResponse = {
  tables: TableRow[];
  settings: { globalCadenceDays: number; lastSuspiciousAlertAt: string | null };
};

type RefreshResponse = {
  tableId: string;
  auditId: number;
  proposedRanges: Range[];
  narration: string[];
  sourceCount: number;
  tokensUsed: number;
  evidence: Array<{ source: string; url?: string; finding: string }>;
};

const FRESHNESS_BADGE: Record<TableRow["freshness"], string> = {
  fresh:   "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  stale:   "bg-amber-500/15 text-amber-700 border-amber-500/30",
  missing: "bg-rose-500/15 text-rose-700 border-rose-500/30",
};

export default function AnalystTables() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [theaterTable, setTheaterTable] = useState<TableRow | null>(null);
  const [pendingRefresh, setPendingRefresh] = useState<RefreshResponse | null>(null);
  const [cadenceDraft, setCadenceDraft] = useState<number | null>(null);

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ["/api/admin/analyst-tables"],
    refetchInterval: 60_000,
  });

  // First-visit auto-seed: if any benchmark table is "missing", trigger a
  // refresh in the background so first-time admins land on populated rows.
  useFirstVisitBenchmarkSeed(data?.tables);

  const refreshMutation = useMutation({
    mutationFn: async (table: TableRow) => {
      const res = await apiRequest("POST", `/api/admin/analyst-tables/${table.id}/refresh`, {});
      return (await res.json()) as RefreshResponse;
    },
    onSuccess: (payload) => {
      setPendingRefresh(payload);
    },
    onError: (err: Error) => {
      setTheaterTable(null);
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    },
  });

  const commitMutation = useMutation({
    mutationFn: async (payload: RefreshResponse) => {
      const res = await apiRequest("POST", `/api/admin/analyst-tables/${payload.tableId}/commit`, {
        auditId: payload.auditId,
        sourceCount: payload.sourceCount,
        proposedRanges: payload.proposedRanges,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Ranges committed", description: "The benchmark table is now live." });
      setPendingRefresh(null);
      setTheaterTable(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/analyst-tables"] });
    },
    onError: (err: Error) => toast({ title: "Commit failed", description: err.message, variant: "destructive" }),
  });

  const discardMutation = useMutation({
    mutationFn: async (payload: RefreshResponse) => {
      const res = await apiRequest("POST", `/api/admin/analyst-tables/${payload.tableId}/discard`, {
        auditId: payload.auditId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Refresh discarded", description: "No changes were applied." });
      setPendingRefresh(null);
      setTheaterTable(null);
    },
  });

  const cadenceMutation = useMutation({
    mutationFn: async (days: number) => {
      const res = await apiRequest("PATCH", "/api/admin/analyst-refresh-settings", {
        globalCadenceDays: days,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Cadence updated" });
      setCadenceDraft(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/analyst-tables"] });
    },
  });

  const handleRefresh = (table: TableRow) => {
    setTheaterTable(table);
    refreshMutation.mutate(table);
  };

  const cadence = cadenceDraft ?? data?.settings.globalCadenceDays ?? 30;

  return (
    <div className="space-y-4" data-testid="analyst-tables-tab">
      <SuspiciousActivityBanner active={!!data?.settings.lastSuspiciousAlertAt && (Date.now() - new Date(data.settings.lastSuspiciousAlertAt).getTime()) < 60 * 60 * 1000} />

      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Refresh Cadence</h3>
            <p className="text-xs text-muted-foreground">Days before a table is flagged as stale.</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={365}
              value={cadence}
              onChange={e => setCadenceDraft(Number(e.target.value))}
              className="w-24"
              data-testid="input-cadence-days"
            />
            <span className="text-xs text-muted-foreground">days</span>
            <Button
              size="sm"
              onClick={() => cadenceMutation.mutate(cadence)}
              disabled={cadenceDraft == null || cadenceMutation.isPending}
              data-testid="button-save-cadence"
            >
              Save
            </Button>
          </div>
        </div>
      </Card>

      {isLoading && <div className="text-sm text-muted-foreground">Loading tables…</div>}

      <div className="space-y-3">
        {data?.tables.map(t => (
          <Card key={t.id} className="p-4" data-testid={`card-analyst-table-${t.id}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold" data-testid={`text-table-label-${t.id}`}>{t.label}</h3>
                  <span className={`text-[10px] uppercase tracking-wide border rounded px-2 py-0.5 ${FRESHNESS_BADGE[t.freshness]}`} data-testid={`badge-freshness-${t.id}`}>
                    {t.freshness}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t.lastRefreshedAt
                    ? `Last refreshed ${new Date(t.lastRefreshedAt).toLocaleString()}`
                    : "Never refreshed"}
                  {" · "}
                  {t.sourceCount} sources
                  {t.tokensUsedLastRefresh != null && ` · ${t.tokensUsedLastRefresh.toLocaleString()} tokens`}
                </div>
              </div>
              <Button
                onClick={() => handleRefresh(t)}
                disabled={refreshMutation.isPending}
                data-testid={`button-refresh-${t.id}`}
              >
                Refresh with The Analyst
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {t.ranges.map(r => (
                <div key={r.dimensionKey} className="border rounded p-2 text-xs" data-testid={`range-${t.id}-${r.dimensionKey}`}>
                  <div className="font-medium">{r.label}</div>
                  <div className="text-muted-foreground">
                    {r.valueLow ?? "—"} / {r.valueMid ?? "—"} / {r.valueHigh ?? "—"} <span className="opacity-60">({r.unit})</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {theaterTable && !pendingRefresh && (
        <AnalystRefreshTheater
          tableLabel={theaterTable.label}
          narration={undefined}
          onCancel={() => {
            setTheaterTable(null);
          }}
        />
      )}

      {pendingRefresh && theaterTable && (
        <RefreshDiffDialog
          tableLabel={theaterTable.label}
          currentRanges={theaterTable.ranges}
          proposedRanges={pendingRefresh.proposedRanges}
          evidence={pendingRefresh.evidence}
          tokensUsed={pendingRefresh.tokensUsed}
          sourceCount={pendingRefresh.sourceCount}
          onCommit={() => commitMutation.mutate(pendingRefresh)}
          onDiscard={() => discardMutation.mutate(pendingRefresh)}
          isCommitting={commitMutation.isPending}
        />
      )}
    </div>
  );
}
