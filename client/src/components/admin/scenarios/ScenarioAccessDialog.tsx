import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconPlus, IconTrash } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface AccessGrant {
  id: number;
  targetType: string;
  targetId: number;
  grantedBy: number;
  createdAt: string;
}

interface ScenarioForAccess {
  id: number;
  name: string;
  accessGrants: AccessGrant[];
}

interface ScenarioAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenario: ScenarioForAccess | null;
  users: Array<{ id: number; email: string; name: string | null }> | undefined;
}

export function ScenarioAccessDialog({ open, onOpenChange, scenario, users }: ScenarioAccessDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [grantForm, setGrantForm] = useState({ targetId: "" });

  const userNameMap: Record<number, string> = {};
  users?.forEach(u => { userNameMap[u.id] = u.name || u.email; });

  const getGrantLabel = (targetType: string, targetId: number) => {
    if (targetType === "user") return userNameMap[targetId] || `User #${targetId}`;
    return `${targetType} #${targetId}`;
  };

  const addAccessMutation = useMutation({
    mutationFn: async ({ scenarioId, targetType, targetId }: { scenarioId: number; targetType: string; targetId: number }) => {
      const res = await fetch(`/api/admin/scenarios/${scenarioId}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetType, targetId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to add access");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "scenarios"] });
      setGrantForm({ targetId: "" });
      toast({ title: "Access Granted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const removeAccessMutation = useMutation({
    mutationFn: async ({ scenarioId, targetType, targetId }: { scenarioId: number; targetType: string; targetId: number }) => {
      const res = await fetch(`/api/admin/scenarios/${scenarioId}/access`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetType, targetId }),
      });
      if (!res.ok) throw new Error("Failed to remove access");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "scenarios"] });
      toast({ title: "Access Revoked" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const unshareAllMutation = useMutation({
    mutationFn: async (scenarioId: number) => {
      const res = await fetch(`/api/admin/scenarios/${scenarioId}/access/all`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove all shares");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "scenarios"] });
      toast({ title: "All Access Removed", description: `Removed ${(data.sharesRemoved ?? 0) + (data.accessRemoved ?? 0)} access grant(s)` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-manage-access">
        <DialogHeader>
          <DialogTitle>Manage Access — {scenario?.name}</DialogTitle>
          <DialogDescription>
            Grant or revoke access for individual users.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {scenario?.accessGrants && scenario.accessGrants.length > 0 ? (
            <div className="space-y-2">
              <Label>Current Access</Label>
              <div className="space-y-1.5">
                {scenario.accessGrants.map(grant => (
                  <div key={grant.id} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
                    <span className="text-sm">
                      <Badge variant="outline" className="mr-2 text-xs">
                        {grant.targetType}
                      </Badge>
                      {getGrantLabel(grant.targetType, grant.targetId)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (!scenario) return;
                        removeAccessMutation.mutate({
                          scenarioId: scenario.id,
                          targetType: grant.targetType,
                          targetId: grant.targetId,
                        });
                      }}
                      data-testid={`button-revoke-access-${grant.id}`}
                      aria-label={`Revoke access for ${getGrantLabel(grant.targetType, grant.targetId)}`}
                    >
                      <IconTrash className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No access grants yet.</p>
          )}

          {scenario?.accessGrants && scenario.accessGrants.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => {
                if (!scenario) return;
                unshareAllMutation.mutate(scenario.id);
              }}
              disabled={unshareAllMutation.isPending}
              data-testid="button-unshare-all"
            >
              {unshareAllMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <IconTrash className="w-4 h-4 mr-2" />}
              Remove All Access
            </Button>
          )}

          <div className="border-t pt-4 space-y-3">
            <Label>Add User Access</Label>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">User</Label>
                <Select value={grantForm.targetId} onValueChange={v => setGrantForm({ targetId: v })}>
                  <SelectTrigger data-testid="select-grant-target">
                    <SelectValue placeholder="Select user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users?.map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  if (!scenario || !grantForm.targetId) return;
                  addAccessMutation.mutate({
                    scenarioId: scenario.id,
                    targetType: "user",
                    targetId: Number(grantForm.targetId),
                  });
                }}
                disabled={!grantForm.targetId || addAccessMutation.isPending}
                data-testid="button-add-access"
                aria-label="Grant access"
              >
                {addAccessMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconPlus className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
