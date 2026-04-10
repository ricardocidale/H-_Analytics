import { useState, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useScenarios, useCreateScenario, useLoadScenario, useUpdateScenario, useDeleteScenario, useSharedWithMe } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useScenarioDirtyState } from "@/lib/scenario-dirty-state";
import type { ScenarioCompareResult } from "@/components/scenarios";

export function useScenarioActions() {
  const { data: scenarios, isLoading, isError } = useScenarios();
  const createScenario = useCreateScenario();
  const loadScenario = useLoadScenario();
  const updateScenario = useUpdateScenario();
  const deleteScenario = useDeleteScenario();
  const { toast } = useToast();
  const { canManageScenarios } = useAuth();
  const queryClient = useQueryClient();

  const { data: sharedWithMe, isLoading: sharedLoading } = useSharedWithMe();

  const myScenarios = useMemo(
    () => scenarios?.filter((s) => (!s.kind || s.kind === "manual") && (!s.accessType || s.accessType === "owned")) ?? [],
    [scenarios]
  );

  const sharedScenarios = useMemo(
    () => sharedWithMe?.filter((s: any) => !s.kind || s.kind === "manual") ?? [],
    [sharedWithMe]
  );

  const manualScenarios = useMemo(
    () => [...myScenarios, ...sharedScenarios],
    [myScenarios, sharedScenarios]
  );

  const [newScenarioName, setNewScenarioName] = useState("");
  const [newScenarioDescription, setNewScenarioDescription] = useState("");
  const [editingScenario, setEditingScenario] = useState<{ id: number; name: string; description: string } | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [sharingScenario, setSharingScenario] = useState<{ id: number; name: string } | null>(null);
  const [loadSharedWarning, setLoadSharedWarning] = useState<{ id: number; name: string; sharedByName: string | null } | null>(null);

  const importFileRef = useRef<HTMLInputElement>(null);

  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<number[]>([]);
  const [compareResult, setCompareResult] = useState<ScenarioCompareResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);

  const handleCreate = async () => {
    if (!newScenarioName.trim()) {
      toast({ title: "Error", description: "Please enter a scenario name", variant: "destructive" });
      return;
    }

    try {
      await createScenario.mutateAsync({ 
        name: newScenarioName.trim(), 
        description: newScenarioDescription.trim() || undefined 
      });
      useScenarioDirtyState.getState().setActiveScenario(newScenarioName.trim(), "manual");
      useScenarioDirtyState.getState().clearDirty();
      toast({ title: "Success", description: "Scenario saved successfully" });
      setNewScenarioName("");
      setNewScenarioDescription("");
      setIsCreating(false);
    } catch (error) {
      toast({ title: "Error", description: "Failed to save scenario", variant: "destructive" });
    }
  };

  const handleLoad = async (id: number, name: string) => {
    try {
      await loadScenario.mutateAsync(id);
      useScenarioDirtyState.getState().setActiveScenario(name, "manual");
      useScenarioDirtyState.getState().clearDirty();
      toast({ title: "Success", description: `Scenario "${name}" loaded successfully` });
      setLoadSharedWarning(null);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load scenario", variant: "destructive" });
    }
  };

  const handleUpdate = async () => {
    if (!editingScenario) return;

    try {
      await updateScenario.mutateAsync({
        id: editingScenario.id,
        data: { name: editingScenario.name, description: editingScenario.description || undefined }
      });
      toast({ title: "Success", description: "Scenario updated successfully" });
      setEditingScenario(null);
    } catch (error) {
      toast({ title: "Error", description: "Failed to update scenario", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number, name: string) => {
    try {
      await deleteScenario.mutateAsync(id);
      toast({ title: "Success", description: `Scenario "${name}" deleted` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete scenario", variant: "destructive" });
    }
  };

  const handleExport = async (id: number, name: string) => {
    try {
      const res = await fetch(`/api/scenarios/${id}/export`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to export scenario");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[^a-zA-Z0-9-_ ]/g, "")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: `"${name}" downloaded as JSON` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to export scenario", variant: "destructive" });
    }
  };

  const handleClone = async (id: number, name: string) => {
    try {
      const res = await fetch(`/api/scenarios/${id}/clone`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to clone scenario");
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios"] });
      queryClient.invalidateQueries({ queryKey: ["scenarios"] });
      toast({ title: "Cloned", description: `"${name} (Copy)" created` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to clone scenario", variant: "destructive" });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.name || !data.globalAssumptions || !Array.isArray(data.properties)) {
        throw new Error("Invalid scenario file — missing required fields");
      }
      const res = await fetch("/api/scenarios/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Import failed");
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios"] });
      queryClient.invalidateQueries({ queryKey: ["scenarios"] });
      toast({ title: "Imported", description: `Scenario "${data.name}" imported successfully` });
    } catch (error: unknown) {
      toast({ title: "Import Error", description: error instanceof Error ? error.message : "Failed to import scenario", variant: "destructive" });
    }
    if (importFileRef.current) importFileRef.current.value = "";
  };

  const toggleCompareSelect = (id: number) => {
    setCompareSelection(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const handleCompare = async () => {
    if (compareSelection.length !== 2) return;
    setCompareLoading(true);
    try {
      const [id1, id2] = compareSelection;
      const res = await fetch(`/api/scenarios/${id1}/compare/${id2}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to compare scenarios");
      const data: ScenarioCompareResult = await res.json();
      setCompareResult(data);
      setCompareDialogOpen(true);
    } catch (error) {
      toast({ title: "Error", description: "Failed to compare scenarios", variant: "destructive" });
    } finally {
      setCompareLoading(false);
    }
  };

  const toggleCompareMode = () => {
    setCompareMode(!compareMode);
    setCompareSelection([]);
  };

  return {
    isLoading,
    isError,
    canManageScenarios,
    myScenarios,
    sharedScenarios,
    manualScenarios,
    sharedLoading,

    isCreating, setIsCreating,
    newScenarioName, setNewScenarioName,
    newScenarioDescription, setNewScenarioDescription,
    editingScenario, setEditingScenario,
    sharingScenario, setSharingScenario,
    loadSharedWarning, setLoadSharedWarning,

    importFileRef,
    compareMode, toggleCompareMode,
    compareSelection, toggleCompareSelect,
    compareResult,
    compareLoading,
    compareDialogOpen, setCompareDialogOpen,

    handleCreate,
    handleLoad,
    handleUpdate,
    handleDelete,
    handleExport,
    handleClone,
    handleImport,
    handleCompare,

    createIsPending: createScenario.isPending,
    loadIsPending: loadScenario.isPending,
    updateIsPending: updateScenario.isPending,
  };
}

export type ScenarioActions = ReturnType<typeof useScenarioActions>;
