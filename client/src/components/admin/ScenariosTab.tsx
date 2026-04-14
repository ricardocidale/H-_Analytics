import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconPlus } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { useAdminUsers, adminFetch } from "./hooks";
import { ScenarioCard, type AdminScenario } from "./scenarios/ScenarioCard";
import { ScenarioAccessDialog } from "./scenarios/ScenarioAccessDialog";
import { DeletedScenariosSection, DefaultScenariosSection } from "./ScenariosTabSections";

export default function ScenariosTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<AdminScenario | null>(null);
  const [createForm, setCreateForm] = useState({ userId: "", name: "", description: "" });
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const { data: scenarios, isLoading } = useQuery<AdminScenario[]>({
    queryKey: ["admin", "scenarios"],
    queryFn: adminFetch<AdminScenario[]>("/api/admin/scenarios", "Failed to fetch scenarios"),
  });

  const { data: users } = useAdminUsers();

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

  useEffect(() => {
    if (selectedScenario && scenarios) {
      const updated = scenarios.find(s => s.id === selectedScenario.id);
      if (updated) {
        setSelectedScenario(updated);
      }
    }
  }, [scenarios]);

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
      return matchesSearch && matchesOwner;
    });
  }, [scenarios, search, ownerFilter]);

  const getGrantLabel = (targetType: string, targetId: number) => {
    if (targetType === "user") return userNameMap[targetId] || `User #${targetId}`;
    return `${targetType} #${targetId}`;
  };

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
          <ScenarioCard
            key={scenario.id}
            scenario={scenario}
            onManageAccess={(s) => { setSelectedScenario(s); setAccessOpen(true); }}
            onEdit={(s) => { setSelectedScenario(s); setEditForm({ name: s.name, description: s.description || "" }); setEditOpen(true); }}
            onDelete={(s) => { setSelectedScenario(s); setDeleteOpen(true); }}
            getGrantLabel={getGrantLabel}
          />
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

      <ScenarioAccessDialog
        open={accessOpen}
        onOpenChange={setAccessOpen}
        scenario={selectedScenario}
        users={users}
      />
    </div>
  );
}
