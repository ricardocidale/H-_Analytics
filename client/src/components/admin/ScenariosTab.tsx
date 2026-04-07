import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconPlus, IconTrash, IconPencil, IconPeople, IconScenarios, IconProperties, IconBuilding2, IconFolderOpen } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { useAdminUsers, useAdminUserGroups, useAdminCompanies, adminFetch } from "./hooks";
import { formatDateTime } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { useDeletedScenarios, useRestoreScenario, usePurgeScenario } from "@/lib/api/scenarios";

interface AdminScenario {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  kind: string | null;
  ownerEmail: string;
  ownerName: string | null;
  propertyCount: number;
  createdAt: string;
  updatedAt: string;
  accessGrants: Array<{
    id: number;
    targetType: string;
    targetId: number;
    grantedBy: number;
    createdAt: string;
  }>;
}

function DeletedScenariosSection() {
  const { data: deleted, isLoading } = useDeletedScenarios(true);
  const restoreScenario = useRestoreScenario();
  const purgeScenario = usePurgeScenario();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [purgeConfirmId, setPurgeConfirmId] = useState<number | null>(null);

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

  if (!deleted?.length && !isLoading) return null;

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
            <div className="space-y-2">
              {deleted?.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border"
                  data-testid={`deleted-scenario-${s.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.ownerName || s.ownerEmail} · Deleted {formatDateTime(s.deletedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
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
              ))}
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
    </>
  );
}

function DefaultScenariosSection({ scenarios, users }: { scenarios: AdminScenario[] | undefined; users: Array<{ id: number; email: string; name: string | null }> | undefined }) {
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

  const missingCount = usersWithDefaults.filter(u => !u.defaultScenario).length;

  return (
    <Card className="mt-6" data-testid="card-default-scenarios">
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <IconScenarios className="w-4 h-4 text-muted-foreground" />
            Default Scenarios
            <Badge variant="secondary" className="text-xs">{defaultScenarios.length} / {usersWithDefaults.length} users</Badge>
            {missingCount > 0 && (
              <Badge variant="outline" className="text-xs text-accent-pop border-accent-pop/30">{missingCount} missing</Badge>
            )}
          </CardTitle>
          <span className="text-xs text-muted-foreground">{expanded ? "Hide" : "Show"}</span>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-2">
            {usersWithDefaults.map(u => (
              <div
                key={u.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border"
                data-testid={`default-scenario-user-${u.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{u.name || u.email}</p>
                  {u.defaultScenario ? (
                    <p className="text-xs text-muted-foreground">
                      "{u.defaultScenario.name}" · {u.defaultScenario.propertyCount} properties · Updated {formatDateTime(u.defaultScenario.updatedAt)}
                    </p>
                  ) : (
                    <p className="text-xs text-accent-pop">No default scenario</p>
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
                    {createDefaultMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <IconPlus className="w-3.5 h-3.5" />
                    )}
                    Create Default
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function ScenariosTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<AdminScenario | null>(null);
  const [createForm, setCreateForm] = useState({ userId: "", name: "", description: "" });
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [grantForm, setGrantForm] = useState({ targetType: "group" as string, targetId: "" });

  const { data: scenarios, isLoading } = useQuery<AdminScenario[]>({
    queryKey: ["admin", "scenarios"],
    queryFn: adminFetch<AdminScenario[]>("/api/admin/scenarios", "Failed to fetch scenarios"),
  });

  const { data: users } = useAdminUsers();
  const { data: groups } = useAdminUserGroups();
  const { data: companies } = useAdminCompanies();

  const createMutation = useMutation({
    mutationFn: async (data: { userId: number; name: string; description?: string }) => {
      const res = await fetch("/api/admin/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create scenario");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "scenarios"] });
      setCreateOpen(false);
      setCreateForm({ userId: "", name: "", description: "" });
      toast({ title: "Scenario Created", description: "Scenario has been created." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; description?: string | null }) => {
      const res = await fetch(`/api/admin/scenarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update scenario");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "scenarios"] });
      setEditOpen(false);
      setSelectedScenario(null);
      toast({ title: "Scenario Updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/scenarios/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete scenario");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "scenarios"] });
      setDeleteOpen(false);
      setSelectedScenario(null);
      toast({ title: "Scenario Deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

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
      setGrantForm({ targetType: "group", targetId: "" });
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
      toast({ title: "All Access Removed", description: `Removed ${(data.sharesRemoved || 0) + (data.accessRemoved || 0)} access grant(s)` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (selectedScenario && scenarios) {
      const updated = scenarios.find(s => s.id === selectedScenario.id);
      if (updated) {
        setSelectedScenario(updated);
      }
    }
  }, [scenarios]);

  const groupNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    groups?.forEach(g => { map[g.id] = g.name; });
    return map;
  }, [groups]);

  const companyNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    companies?.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [companies]);

  const userNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    users?.forEach(u => { map[u.id] = u.name || u.email; });
    return map;
  }, [users]);

  const filteredScenarios = useMemo(() => {
    if (!scenarios) return [];
    return scenarios.filter(s => {
      const matchesSearch = !search || 
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.ownerEmail.toLowerCase().includes(search.toLowerCase()) ||
        (s.ownerName && s.ownerName.toLowerCase().includes(search.toLowerCase()));
      const matchesOwner = ownerFilter === "all" || s.userId === Number(ownerFilter);
      const matchesGroup = groupFilter === "all" || s.accessGrants.some(g => g.targetType === "group" && g.targetId === Number(groupFilter));
      const matchesCompany = companyFilter === "all" || s.accessGrants.some(g => g.targetType === "company" && g.targetId === Number(companyFilter));
      return matchesSearch && matchesOwner && matchesGroup && matchesCompany;
    });
  }, [scenarios, search, ownerFilter, groupFilter, companyFilter]);

  function getGrantLabel(targetType: string, targetId: number) {
    if (targetType === "group") return groupNameMap[targetId] || `Group #${targetId}`;
    if (targetType === "company") return companyNameMap[targetId] || `Company #${targetId}`;
    if (targetType === "user") return userNameMap[targetId] || `User #${targetId}`;
    return `${targetType} #${targetId}`;
  }

  function getGrantBadgeVariant(targetType: string): "default" | "secondary" | "outline" {
    if (targetType === "group") return "default";
    if (targetType === "company") return "secondary";
    return "outline";
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="scenarios-loading">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-scenarios-tab">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 w-full sm:w-auto">
          <Input
            placeholder="Search scenarios..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-xs"
            data-testid="input-scenario-search"
          />
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-owner-filter">
              <SelectValue placeholder="All owners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              {users?.map(u => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-group-filter">
              <SelectValue placeholder="All groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {groups?.map(g => (
                <SelectItem key={g.id} value={String(g.id)}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-company-filter">
              <SelectValue placeholder="All companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companies?.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-create-scenario">
          <IconPlus className="w-4 h-4 mr-2" />
          Create Scenario
        </Button>
      </div>

      <div className="text-sm text-muted-foreground" data-testid="text-scenario-count">
        {filteredScenarios.length} scenario{filteredScenarios.length !== 1 ? "s" : ""}
      </div>

      <div className="grid gap-4">
        {filteredScenarios.map(scenario => (
          <Card key={scenario.id} data-testid={`card-scenario-${scenario.id}`}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2" data-testid={`text-scenario-name-${scenario.id}`}>
                    <IconScenarios className="w-4 h-4 text-muted-foreground" />
                    {scenario.name}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1" data-testid={`text-scenario-owner-${scenario.id}`}>
                    Owner: {scenario.ownerName || scenario.ownerEmail}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedScenario(scenario);
                      setAccessOpen(true);
                    }}
                    data-testid={`button-manage-access-${scenario.id}`}
                  >
                    <IconPeople className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedScenario(scenario);
                      setEditForm({ name: scenario.name, description: scenario.description || "" });
                      setEditOpen(true);
                    }}
                    data-testid={`button-edit-scenario-${scenario.id}`}
                  >
                    <IconPencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedScenario(scenario);
                      setDeleteOpen(true);
                    }}
                    data-testid={`button-delete-scenario-${scenario.id}`}
                  >
                    <IconTrash className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                {scenario.description && (
                  <span data-testid={`text-scenario-desc-${scenario.id}`}>{scenario.description}</span>
                )}
                <span className="flex items-center gap-1">
                  <IconProperties className="w-3.5 h-3.5" />
                  {scenario.propertyCount} properties
                </span>
                <span>Created {formatDateTime(scenario.createdAt)}</span>
              </div>
              {scenario.accessGrants.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3" data-testid={`grants-${scenario.id}`}>
                  {scenario.accessGrants.map(grant => (
                    <Badge
                      key={grant.id}
                      variant={getGrantBadgeVariant(grant.targetType)}
                      className="text-xs"
                    >
                      {grant.targetType === "group" && <IconPeople className="w-3 h-3 mr-1" />}
                      {grant.targetType === "company" && <IconBuilding2 className="w-3 h-3 mr-1" />}
                      {getGrantLabel(grant.targetType, grant.targetId)}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {filteredScenarios.length === 0 && (
          <div className="text-center py-12 text-muted-foreground" data-testid="text-no-scenarios">
            No scenarios found
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="dialog-create-scenario">
          <DialogHeader>
            <DialogTitle>Create Scenario</DialogTitle>
            <DialogDescription>Create a new scenario for a user. The scenario will snapshot their current assumptions and properties.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select value={createForm.userId} onValueChange={v => setCreateForm(f => ({ ...f, userId: v }))}>
                <SelectTrigger data-testid="select-scenario-owner">
                  <SelectValue placeholder="Select user..." />
                </SelectTrigger>
                <SelectContent>
                  {users?.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={createForm.name}
                onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Scenario name"
                data-testid="input-scenario-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={createForm.description}
                onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
                data-testid="input-scenario-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!createForm.userId || !createForm.name.trim()) return;
                createMutation.mutate({
                  userId: Number(createForm.userId),
                  name: createForm.name.trim(),
                  description: createForm.description.trim() || undefined,
                });
              }}
              disabled={createMutation.isPending || !createForm.userId || !createForm.name.trim()}
              data-testid="button-confirm-create-scenario"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent data-testid="dialog-edit-scenario">
          <DialogHeader>
            <DialogTitle>Edit Scenario</DialogTitle>
            <DialogDescription>Update scenario name or description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                data-testid="input-edit-scenario-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                data-testid="input-edit-scenario-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!selectedScenario || !editForm.name.trim()) return;
                editMutation.mutate({
                  id: selectedScenario.id,
                  name: editForm.name.trim(),
                  description: editForm.description.trim() || null,
                });
              }}
              disabled={editMutation.isPending || !editForm.name.trim()}
              data-testid="button-confirm-edit-scenario"
            >
              {editMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent data-testid="dialog-delete-scenario">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scenario</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedScenario?.name}"? This will also remove all access grants. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedScenario && deleteMutation.mutate(selectedScenario.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-scenario"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DefaultScenariosSection scenarios={scenarios} users={users} />
      <DeletedScenariosSection />

      <Dialog open={accessOpen} onOpenChange={setAccessOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-manage-access">
          <DialogHeader>
            <DialogTitle>Manage Access — {selectedScenario?.name}</DialogTitle>
            <DialogDescription>
              Grant or revoke access for user groups, companies, or individual users.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedScenario?.accessGrants && selectedScenario.accessGrants.length > 0 ? (
              <div className="space-y-2">
                <Label>Current Access</Label>
                <div className="space-y-1.5">
                  {selectedScenario.accessGrants.map(grant => (
                    <div key={grant.id} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
                      <span className="text-sm">
                        <Badge variant={getGrantBadgeVariant(grant.targetType)} className="mr-2 text-xs">
                          {grant.targetType}
                        </Badge>
                        {getGrantLabel(grant.targetType, grant.targetId)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (!selectedScenario) return;
                          removeAccessMutation.mutate({
                            scenarioId: selectedScenario.id,
                            targetType: grant.targetType,
                            targetId: grant.targetId,
                          });
                        }}
                        data-testid={`button-revoke-access-${grant.id}`}
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

            {selectedScenario?.accessGrants && selectedScenario.accessGrants.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => {
                  if (!selectedScenario) return;
                  unshareAllMutation.mutate(selectedScenario.id);
                }}
                disabled={unshareAllMutation.isPending}
                data-testid="button-unshare-all"
              >
                {unshareAllMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <IconTrash className="w-4 h-4 mr-2" />}
                Remove All Access
              </Button>
            )}

            <div className="border-t pt-4 space-y-3">
              <Label>Add Access</Label>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select value={grantForm.targetType} onValueChange={v => setGrantForm(f => ({ ...f, targetType: v, targetId: "" }))}>
                    <SelectTrigger data-testid="select-grant-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="group">Group</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Target</Label>
                  <Select value={grantForm.targetId} onValueChange={v => setGrantForm(f => ({ ...f, targetId: v }))}>
                    <SelectTrigger data-testid="select-grant-target">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {grantForm.targetType === "group" && groups?.map(g => (
                        <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                      ))}
                      {grantForm.targetType === "company" && companies?.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                      {grantForm.targetType === "user" && users?.map(u => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.name || u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    if (!selectedScenario || !grantForm.targetId) return;
                    addAccessMutation.mutate({
                      scenarioId: selectedScenario.id,
                      targetType: grantForm.targetType,
                      targetId: Number(grantForm.targetId),
                    });
                  }}
                  disabled={!grantForm.targetId || addAccessMutation.isPending}
                  data-testid="button-add-access"
                >
                  {addAccessMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconPlus className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
