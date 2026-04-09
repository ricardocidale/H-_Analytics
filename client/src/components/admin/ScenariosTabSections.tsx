import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconPlus, IconTrash, IconFolderOpen } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDeletedScenarios, useRestoreScenario, usePurgeScenario, usePurgeExpiredScenarios } from "@/lib/api/scenarios";
import { type AdminScenario } from "./scenarios/ScenarioCard";

function getDaysSinceDeleted(deletedAt: string | Date | null): number {
  if (!deletedAt) return 0;
  const deleted = new Date(deletedAt);
  const now = new Date();
  return Math.floor((now.getTime() - deleted.getTime()) / (1000 * 60 * 60 * 24));
}

function getDaysUntilPurge(purgeAfter: string | Date | null): number {
  if (!purgeAfter) return 0;
  const purge = new Date(purgeAfter);
  const now = new Date();
  return Math.max(0, Math.ceil((purge.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export function DeletedScenariosSection() {
  const { data: deleted, isLoading } = useDeletedScenarios(true);
  const restoreScenario = useRestoreScenario();
  const purgeScenario = usePurgeScenario();
  const purgeExpired = usePurgeExpiredScenarios();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [purgeConfirmId, setPurgeConfirmId] = useState<number | null>(null);
  const [bulkPurgeOpen, setBulkPurgeOpen] = useState(false);

  const { restorable, expired } = useMemo(() => {
    if (!deleted?.length) return { restorable: [], expired: [] };
    const now = new Date();
    const r: typeof deleted = [];
    const e: typeof deleted = [];
    for (const s of deleted) {
      const purgeDate = s.purgeAfter ? new Date(s.purgeAfter) : null;
      if (purgeDate && purgeDate <= now) {
        e.push(s);
      } else {
        r.push(s);
      }
    }
    return { restorable: r, expired: e };
  }, [deleted]);

  const handleRestore = async (id: number, name: string) => {
    try {
      await restoreScenario.mutateAsync(id);
      toast({ title: "Restored", description: `Scenario "${name}" has been restored.` });
    } catch {
      toast({ title: "Error", description: "Failed to restore scenario.", variant: "destructive" });
    }
  };

  const handlePurge = async (id: number, name: string) => {
    try {
      await purgeScenario.mutateAsync(id);
      toast({ title: "Purged", description: `Scenario "${name}" has been permanently deleted.` });
      setPurgeConfirmId(null);
    } catch {
      toast({ title: "Error", description: "Failed to purge scenario.", variant: "destructive" });
    }
  };

  const handleBulkPurge = async () => {
    try {
      const result = await purgeExpired.mutateAsync();
      toast({
        title: "Cleanup Complete",
        description: `${result.purgedCount} expired scenario${result.purgedCount !== 1 ? "s" : ""} permanently removed.`,
      });
      setBulkPurgeOpen(false);
    } catch {
      toast({ title: "Error", description: "Failed to cleanup expired scenarios.", variant: "destructive" });
    }
  };

  if (!deleted?.length && !isLoading) return null;

  const renderScenarioRow = (s: any, isExpired: boolean) => {
    const daysSince = getDaysSinceDeleted(s.deletedAt);
    const daysLeft = getDaysUntilPurge(s.purgeAfter);

    return (
      <div
        key={s.id}
        className={`flex items-center justify-between p-3 rounded-lg border ${
          isExpired
            ? "bg-destructive/5 border-destructive/20"
            : "bg-muted/50 border-border"
        }`}
        data-testid={`deleted-scenario-${s.id}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
            {isExpired ? (
              <Badge variant="destructive" className="text-[10px] shrink-0" data-testid={`badge-expired-${s.id}`}>
                Expired
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] shrink-0" data-testid={`badge-restorable-${s.id}`}>
                {daysLeft}d left
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {s.ownerName || s.ownerEmail} · Deleted {daysSince} day{daysSince !== 1 ? "s" : ""} ago · {formatDateTime(s.deletedAt)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {!isExpired && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRestore(s.id, s.name)}
              disabled={restoreScenario.isPending}
              data-testid={`button-restore-scenario-${s.id}`}
            >
              {restoreScenario.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <IconFolderOpen className="w-3.5 h-3.5" />
              )}
              Restore
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPurgeConfirmId(s.id)}
            disabled={purgeScenario.isPending}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            data-testid={`button-purge-scenario-${s.id}`}
          >
            <IconTrash className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
    <Card className="mt-6" data-testid="card-deleted-scenarios">
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <IconTrash className="w-4 h-4 text-muted-foreground" />
            Deleted Scenarios
            {deleted?.length ? (
              <Badge variant="secondary" className="text-xs">{deleted.length}</Badge>
            ) : null}
            {expired.length > 0 && (
              <Badge variant="destructive" className="text-xs">{expired.length} expired</Badge>
            )}
          </CardTitle>
          <span className="text-xs text-muted-foreground">{expanded ? "Hide" : "Show"}</span>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : deleted?.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No deleted scenarios.</p>
          ) : (
            <div className="space-y-4">
              {expired.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-destructive flex items-center gap-1.5">
                      Expired (deleted &gt; 30 days)
                      <Badge variant="destructive" className="text-[10px]">{expired.length}</Badge>
                    </h4>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setBulkPurgeOpen(true)}
                      disabled={purgeExpired.isPending}
                      data-testid="button-cleanup-expired"
                    >
                      {purgeExpired.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      ) : (
                        <IconTrash className="w-3.5 h-3.5 mr-1" />
                      )}
                      Cleanup All Expired
                    </Button>
                  </div>
                  {expired.map(s => renderScenarioRow(s, true))}
                </div>
              )}

              {restorable.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    Restorable (deleted &lt; 30 days)
                    <Badge variant="outline" className="text-[10px]">{restorable.length}</Badge>
                  </h4>
                  {restorable.map(s => renderScenarioRow(s, false))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>

    <AlertDialog open={purgeConfirmId !== null} onOpenChange={(v) => { if (!v) setPurgeConfirmId(null); }}>
      <AlertDialogContent data-testid="dialog-purge-scenario">
        <AlertDialogHeader>
          <AlertDialogTitle>Permanently Delete Scenario</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove this scenario and all its data. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const s = deleted?.find(d => d.id === purgeConfirmId);
              if (s) handlePurge(s.id, s.name);
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-confirm-purge-scenario"
          >
            Permanently Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={bulkPurgeOpen} onOpenChange={(v) => { if (!v) setBulkPurgeOpen(false); }}>
      <AlertDialogContent data-testid="dialog-bulk-purge-scenarios">
        <AlertDialogHeader>
          <AlertDialogTitle>Cleanup Expired Scenarios</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove {expired.length} scenario{expired.length !== 1 ? "s" : ""} that {expired.length === 1 ? "has" : "have"} been deleted for more than 30 days. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleBulkPurge}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-confirm-bulk-purge"
          >
            {purgeExpired.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
            ) : null}
            Permanently Delete All Expired
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

export function DefaultScenariosSection({ scenarios, users }: { scenarios: AdminScenario[] | undefined; users: Array<{ id: number; email: string; name: string | null }> | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const createDefaultMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch("/api/admin/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, name: "Default Scenario", kind: "default" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create default scenario");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "scenarios"] });
      toast({ title: "Default Created", description: "Default scenario created for user." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const defaultScenarios = useMemo(() => {
    if (!scenarios) return [];
    return scenarios.filter(s => s.kind === "default");
  }, [scenarios]);

  const usersWithDefaults = useMemo(() => {
    const defaultByUser = new Map<number, AdminScenario>();
    for (const s of defaultScenarios) {
      defaultByUser.set(s.userId, s);
    }
    return (users ?? []).map(u => ({
      ...u,
      defaultScenario: defaultByUser.get(u.id) ?? null,
    }));
  }, [users, defaultScenarios]);

  return (
    <Card className="mt-4" data-testid="card-default-scenarios">
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            Default Scenarios
            <Badge variant="secondary" className="text-xs">{defaultScenarios.length} / {users?.length ?? 0} users</Badge>
          </CardTitle>
          <span className="text-xs text-muted-foreground">{expanded ? "Hide" : "Show"}</span>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 space-y-2">
          {usersWithDefaults.map(u => (
            <div key={u.id} className="flex items-center justify-between py-1.5 border-b last:border-0" data-testid={`default-scenario-user-${u.id}`}>
              <div className="text-sm">
                <span className="font-medium">{u.name || u.email}</span>
                {u.defaultScenario ? (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    #{u.defaultScenario.id} — {u.defaultScenario.name}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="ml-2 text-[10px]">No default</Badge>
                )}
              </div>
              {!u.defaultScenario && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => createDefaultMutation.mutate(u.id)}
                  disabled={createDefaultMutation.isPending}
                  data-testid={`button-create-default-${u.id}`}
                >
                  <IconPlus className="w-3.5 h-3.5 mr-1" />
                  Create Default
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
